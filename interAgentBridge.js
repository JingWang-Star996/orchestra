#!/usr/bin/env node

/**
 * InterAgentBridge — 跨 Agent 通信桥接层
 *
 * 职责：
 * - Agent 注册表（内部 Agent + 外部 Agent）
 * - 消息路由（根据 Agent 类型选择内部 sessions_spawn 或外部 HTTP 调用）
 * - 外部 Agent 配置管理
 * - 任务委派 delegateTask(agentId, task, context, callback)
 * - 异步回调处理
 * - 消息队列（持久化到 temp/inter-agent-queue/）
 * - 事件系统
 */

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const ExternalAgentAdapter = require('./externalAgentAdapter');
const SharedContext = require('./sharedContext');

const QUEUE_DIR = path.join(__dirname, 'temp', 'inter-agent-queue');
const REGISTRY_FILE = path.join(__dirname, 'temp', 'agent-registry.json');

// OpenClaw API（全局注入）
const sessions_spawn = global.sessions_spawn || null;

// ─── 工具函数 ─────────────────────────────────────────────

function _ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function _now() {
  return new Date().toISOString();
}

function _genId(prefix = '') {
  return `${prefix}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── 持久化消息队列 ───────────────────────────────────────

class MessageQueue extends EventEmitter {
  constructor(queueDir) {
    super();
    this.dir = queueDir;
    _ensureDir(this.dir);
  }

  enqueue(item) {
    const id = item.id || _genId('msg_');
    const entry = {
      id,
      ...item,
      status: 'pending',
      createdAt: _now(),
      attempts: 0
    };
    const filePath = path.join(this.dir, `${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(entry, null, 2), 'utf-8');
    this.emit('enqueued', entry);
    return entry;
  }

  dequeue(limit = 10) {
    const items = [];
    try {
      const files = fs.readdirSync(this.dir).filter(f => f.endsWith('.json'));
      for (const file of files.slice(0, limit)) {
        const filePath = path.join(this.dir, file);
        const raw = fs.readFileSync(filePath, 'utf-8');
        const entry = JSON.parse(raw);
        if (entry.status === 'pending' || entry.status === 'retry') {
          items.push(entry);
        }
      }
    } catch (err) {
      this.emit('error', { error: err.message });
    }
    return items;
  }

  updateStatus(id, status, extra = {}) {
    const filePath = path.join(this.dir, `${id}.json`);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    const entry = JSON.parse(raw);
    Object.assign(entry, { status, ...extra, updatedAt: _now() });
    fs.writeFileSync(filePath, JSON.stringify(entry, null, 2), 'utf-8');
    this.emit('updated', entry);
    return entry;
  }

  remove(id) {
    const filePath = path.join(this.dir, `${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  size() {
    try {
      return fs.readdirSync(this.dir).filter(f => f.endsWith('.json')).length;
    } catch {
      return 0;
    }
  }
}

// ─── Agent 注册表持久化 ───────────────────────────────────

function _loadRegistry() {
  if (!fs.existsSync(REGISTRY_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function _saveRegistry(registry) {
  _ensureDir(path.dirname(REGISTRY_FILE));
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2), 'utf-8');
}

// ─── InterAgentBridge 类 ──────────────────────────────────

class InterAgentBridge extends EventEmitter {
  constructor(options = {}) {
    super();
    this.verbose = options.verbose || false;
    this.autoProcessQueue = options.autoProcessQueue !== false;

    // 外部 Agent 适配器
    this.externalAdapter = new ExternalAgentAdapter({
      verbose: this.verbose,
      timeout: options.externalTimeout || 30000,
      maxRetries: options.externalMaxRetries || 3
    });

    // 共享上下文
    this.sharedContext = new SharedContext({ verbose: this.verbose });

    // 消息队列
    this.queue = new MessageQueue(QUEUE_DIR);

    // Agent 注册表
    this.registry = _loadRegistry();

    // 回调处理器
    this._callbacks = new Map(); // taskId → callback function

    // 转发外部 Agent 事件
    this.externalAdapter.on('message:received', (data) => this._handleExternalCallback(data));
    this.externalAdapter.on('message:sent', (data) => this.emit('message:sent', data));
    this.externalAdapter.on('task:delegated', (data) => this.emit('task:delegated', data));
    this.externalAdapter.on('message:error', (data) => this.emit('message:error', data));
    this.externalAdapter.on('task:error', (data) => this.emit('task:error', data));

    if (this.verbose) console.log('[InterAgentBridge] 初始化完成');
  }

  // ── Agent 注册 ──────────────────────────────────────────

  /**
   * 注册外部 Agent
   * @param {Object} config - { id, name, type: 'external', endpoint, auth_type, api_key, ... }
   * @returns {Object} 注册结果
   */
  registerAgent(config) {
    const id = config.id || _genId('agent_');
    const entry = {
      id,
      name: config.name || id,
      type: config.type || 'external', // 'internal' | 'external'
      status: 'registered',
      endpoint: config.endpoint || null,
      auth_type: config.auth_type || 'none',
      api_key: config.api_key || null,
      healthPath: config.healthPath || '/health',
      messagePath: config.messagePath || '/api/message',
      taskPath: config.taskPath || '/api/task',
      callbackUrl: config.callbackUrl || null,
      capabilities: config.capabilities || [],
      registeredAt: _now(),
      lastSeen: _now(),
      metadata: config.metadata || {}
    };

    this.registry[id] = entry;
    _saveRegistry(this.registry);

    if (this.verbose) console.log(`[InterAgentBridge] 注册 Agent: ${entry.name} (${entry.type})`);
    this.emit('agent:registered', entry);

    return { success: true, agent: entry };
  }

  /**
   * 注销 Agent
   */
  unregisterAgent(agentId) {
    if (!this.registry[agentId]) {
      return { success: false, error: 'Agent 不存在' };
    }
    delete this.registry[agentId];
    _saveRegistry(this.registry);
    this.emit('agent:unregistered', { id: agentId });
    return { success: true };
  }

  /**
   * 获取 Agent 信息
   */
  getAgent(agentId) {
    return this.registry[agentId] || null;
  }

  /**
   * 列出所有 Agent
   */
  listAgents(options = {}) {
    const agents = Object.values(this.registry);
    if (options.type) {
      return agents.filter(a => a.type === options.type);
    }
    return agents;
  }

  /**
   * 获取所有内部 Agent（来自 sessions_spawn 环境）
   */
  listInternalAgents() {
    return this.listAgents({ type: 'internal' });
  }

  /**
   * 获取所有外部 Agent
   */
  listExternalAgents() {
    return this.listAgents({ type: 'external' });
  }

  // ── 消息路由 ────────────────────────────────────────────

  /**
   * 发送消息到指定 Agent（自动路由）
   * @param {string} agentId
   * @param {Object} message - { content, context, priority }
   * @returns {Promise<Object>}
   */
  async sendMessage(agentId, message) {
    const agent = this.getAgent(agentId);
    if (!agent) {
      const err = new Error(`Agent 不存在: ${agentId}`);
      this.emit('message:error', { agentId, error: err.message });
      throw err;
    }

    agent.lastSeen = _now();
    _saveRegistry(this.registry);

    // 入队
    const queueEntry = this.queue.enqueue({
      agentId,
      message,
      type: 'message'
    });

    try {
      if (agent.type === 'internal') {
        return await this._sendInternal(agentId, message);
      } else {
        return await this._sendExternal(agent, message);
      }
    } catch (err) {
      this.queue.updateStatus(queueEntry.id, 'failed', { error: err.message });
      throw err;
    }
  }

  /**
   * 内部 Agent 消息（通过 sessions_spawn）
   */
  async _sendInternal(agentId, message) {
    if (!sessions_spawn) {
      // 测试/模拟模式
      const result = {
        sessionId: _genId('sim_'),
        agent: agentId,
        output: `[Internal Agent ${agentId}] 模拟响应: ${message.content}`
      };
      this.emit('message:received', { agentId, message: result });
      return result;
    }

    const session = await sessions_spawn({
      task: message.content,
      mode: 'run',
      runtime: 'subagent',
      label: `Bridge → ${agentId}`,
      timeoutSeconds: message.timeoutSeconds || 300,
      cleanup: 'keep'
    });

    const result = {
      sessionId: session.sessionKey || session.id,
      agent: agentId,
      output: session.result || session.output || `[${agentId}] 已执行`
    };

    this.emit('message:received', { agentId, message: result });
    return result;
  }

  /**
   * 外部 Agent 消息（通过 HTTP）
   */
  async _sendExternal(agent, message) {
    const agentConfig = {
      endpoint: agent.endpoint,
      auth_type: agent.auth_type,
      api_key: agent.api_key,
      messagePath: agent.messagePath,
      callbackUrl: agent.callbackUrl,
      name: agent.name
    };

    const result = await this.externalAdapter.sendMessage(agentConfig, {
      content: message.content,
      context: message.context || {},
      metadata: message.metadata || {}
    });

    this.queue.updateStatus(queueEntry.id, 'sent', { responseCode: result.statusCode });
    return result;
  }

  // ── 任务委派 ────────────────────────────────────────────

  /**
   * 委派任务到 Agent
   * @param {string} agentId
   * @param {Object} task - { title, description, context, priority, callbackUrl }
   * @param {Object} context - 附加上下文
   * @param {Function} [callback] - 异步回调 (result) => void
   * @returns {Promise<Object>}
   */
  async delegateTask(agentId, task, context = {}, callback) {
    const agent = this.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent 不存在: ${agentId}`);
    }

    const taskId = task.id || _genId('task_');

    // 入队
    this.queue.enqueue({
      id: taskId,
      agentId,
      task,
      context,
      type: 'task'
    });

    // 注册回调
    if (typeof callback === 'function') {
      this._callbacks.set(taskId, callback);
    }

    agent.lastSeen = _now();
    _saveRegistry(this.registry);

    this.emit('task:delegated', { taskId, agentId, task });

    if (this.verbose) {
      console.log(`[InterAgentBridge] 任务委派 → ${agent.name} [${task.title || taskId}]`);
    }

    try {
      if (agent.type === 'internal') {
        return await this._delegateInternal(taskId, agentId, task, context);
      } else {
        return await this._delegateExternal(agent, taskId, task, context);
      }
    } catch (err) {
      this.queue.updateStatus(taskId, 'failed', { error: err.message });
      this.emit('task:error', { taskId, agentId, error: err.message });
      throw err;
    }
  }

  async _delegateInternal(taskId, agentId, task, context) {
    if (!sessions_spawn) {
      const result = {
        taskId,
        agentId,
        sessionId: _genId('sim_'),
        output: `[Internal ${agentId}] 模拟执行: ${task.title || task.description}`
      };
      this._invokeCallback(taskId, result);
      this.emit('task:completed', { taskId, result });
      return result;
    }

    const taskPrompt = `${task.title || 'Task'}\n\n${task.description || ''}\n\n上下文: ${JSON.stringify(context)}`;

    const session = await sessions_spawn({
      task: taskPrompt,
      mode: 'run',
      runtime: 'subagent',
      label: `Task → ${agentId}: ${task.title}`,
      timeoutSeconds: task.timeoutSeconds || 600,
      cleanup: 'keep'
    });

    const result = {
      taskId,
      agentId,
      sessionId: session.sessionKey || session.id,
      output: session.result || session.output || `[${agentId}] 任务完成`
    };

    this._invokeCallback(taskId, result);
    this.emit('task:completed', { taskId, result });
    return result;
  }

  async _delegateExternal(agent, taskId, task, context) {
    const agentConfig = {
      endpoint: agent.endpoint,
      auth_type: agent.auth_type,
      api_key: agent.api_key,
      taskPath: agent.taskPath,
      callbackUrl: agent.callbackUrl || `http://localhost:${process.env.ORCHESTRA_API_PORT || 3000}/api/webhook/${agent.id}`,
      name: agent.name
    };

    const result = await this.externalAdapter.delegateTask(agentConfig, {
      id: taskId,
      title: task.title || 'Untitled',
      description: task.description || task.content || '',
      context,
      priority: task.priority || 'normal',
      callbackUrl: agentConfig.callbackUrl
    }, context);

    this.emit('task:delegated', { taskId, agentId: agent.id, response: result });
    return result;
  }

  /**
   * 调用任务回调
   */
  _invokeCallback(taskId, result) {
    const callback = this._callbacks.get(taskId);
    if (callback) {
      try {
        callback(result);
      } catch (err) {
        this.emit('callback:error', { taskId, error: err.message });
      }
      this._callbacks.delete(taskId);
    }
  }

  // ── 异步回调处理 ────────────────────────────────────────

  /**
   * 处理外部 Agent 的回调通知
   */
  _handleExternalCallback(data) {
    const { agentId, message } = data;
    if (this.verbose) {
      console.log(`[InterAgentBridge] 收到外部回调 from ${agentId}:`, message);
    }

    // 检查是否是任务完成回调
    if (message.taskId && message.taskId.startsWith('task_')) {
      this._invokeCallback(message.taskId, message);
      this.emit('task:completed', { taskId: message.taskId, agentId, result: message });
    } else {
      this.emit('message:received', { agentId, message });
    }

    // 存储到共享上下文
    this.sharedContext.set(`callbacks/${agentId}`, message.taskId || _genId('cb_'), message);
  }

  /**
   * Webhook 处理函数（供 API server 使用）
   */
  handleWebhook(agentId, payload) {
    if (this.verbose) {
      console.log(`[InterAgentBridge] Webhook from ${agentId}:`, JSON.stringify(payload).slice(0, 200));
    }

    this._handleExternalCallback({ agentId, message: payload });

    return { success: true, agentId };
  }

  // ── 消息队列管理 ────────────────────────────────────────

  /**
   * 处理队列中的待处理消息
   */
  async processQueue(limit = 10) {
    const pending = this.queue.dequeue(limit);
    const results = [];

    for (const entry of pending) {
      try {
        if (entry.type === 'message') {
          await this.sendMessage(entry.agentId, entry.message);
        } else if (entry.type === 'task') {
          await this.delegateTask(entry.agentId, entry.task, entry.context || {});
        }
        this.queue.updateStatus(entry.id, 'completed');
        results.push({ id: entry.id, status: 'completed' });
      } catch (err) {
        this.queue.updateStatus(entry.id, 'failed', { error: err.message });
        results.push({ id: entry.id, status: 'failed', error: err.message });
      }
    }

    return results;
  }

  getQueueSize() {
    return this.queue.size();
  }

  // ── 健康检查 ────────────────────────────────────────────

  /**
   * 检查所有外部 Agent 的健康状态
   */
  async healthCheckAll() {
    const externals = this.listExternalAgents();
    if (externals.length === 0) return { externalAgents: [], summary: 'no external agents' };

    const configs = externals.map(a => ({
      name: a.name,
      endpoint: a.endpoint,
      auth_type: a.auth_type,
      api_key: a.api_key,
      healthPath: a.healthPath
    }));

    const results = await this.externalAdapter.healthCheckAll(configs);

    // 更新状态
    for (const r of results) {
      const agent = externals.find(a => a.name === r.name);
      if (agent) {
        agent.status = r.ok ? 'online' : 'offline';
        agent.lastSeen = _now();
      }
    }
    _saveRegistry(this.registry);

    return { externalAgents: results, summary: `${results.filter(r => r.ok).length}/${results.length} online` };
  }

  /**
   * 查询单个 Agent 状态
   */
  getAgentStatus(agentId) {
    const agent = this.getAgent(agentId);
    if (!agent) return null;

    return {
      id: agent.id,
      name: agent.name,
      type: agent.type,
      status: agent.status,
      lastSeen: agent.lastSeen,
      registeredAt: agent.registeredAt,
      endpoint: agent.endpoint,
      capabilities: agent.capabilities,
      queueSize: this.getQueueSize()
    };
  }

  // ── 清理 ────────────────────────────────────────────────

  /**
   * 关闭桥接层，清理资源
   */
  close() {
    this._callbacks.clear();
    this.removeAllListeners();
    if (this.verbose) console.log('[InterAgentBridge] 已关闭');
  }
}

module.exports = InterAgentBridge;

// ─── CLI 测试入口 ─────────────────────────────────────────

if (require.main === module) {
  const bridge = new InterAgentBridge({ verbose: true });

  // 注册一个测试外部 Agent
  bridge.registerAgent({
    id: 'hermes-1',
    name: 'Hermes Test',
    type: 'external',
    endpoint: 'http://localhost:4000',
    auth_type: 'none'
  });

  // 列出 Agent
  console.log('已注册 Agent:', JSON.stringify(bridge.listAgents(), null, 2));

  // 清理
  bridge.unregisterAgent('hermes-1');
  bridge.close();
  console.log('测试完成');
}
