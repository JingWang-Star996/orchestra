#!/usr/bin/env node

/**
 * WorkerManager - Worker 生命周期管理（Phase 1 核心功能）
 * 
 * 职责：实现 Worker 的创建、继续、停止管理
 * 
 * 灵感来源：Claude Code Coordinator 的三工具
 * - AGENT_TOOL_NAME（创建）
 * - SEND_MESSAGE_TOOL_NAME（继续）
 * - TASK_STOP_TOOL_NAME（停止）
 */

const EventEmitter = require('events');
const { createTaskNotification } = require('./taskNotification');
const { withRetry, createRetryableAPI } = require('./retryUtils'); // P1 新增：重试工具

// OpenClaw API 集成
const sessions_spawn = global.sessions_spawn || null;
const process = global.process || null;

// P1 新增：创建带重试的 API 调用器
const processWithRetry = process ? createRetryableAPI(process, { 
  maxRetries: 3,
  onRetry: (err, attempt, delay) => {
    console.warn(`[WorkerManager] API 调用失败，${delay}ms 后重试 ${attempt}/3: ${err.message}`);
  }
}) : null;

class WorkerManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.workers = new Map();
    this.workerCounter = 0;
    this.verbose = options.verbose || false;
    this.maxWorkers = options.maxWorkers || 10;
    
    // P1 新增：持久化支持
    this.storage = options.storage || 'memory'; // 'memory' | 'file'
    this.storagePath = options.storagePath || './temp/workers';
    this.autoSave = options.autoSave !== false; // 默认自动保存
    
    if (this.storage === 'file') {
      this._initializeStorage();
    }
  }
  
  /**
   * 初始化存储（P1 新增）
   */
  _initializeStorage() {
    const fs = require('fs');
    const path = require('path');
    
    // 创建存储目录
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
      console.log(`[WorkerManager] 创建存储目录：${this.storagePath}`);
    }
    
    // 加载已有 Workers
    const indexPath = path.join(this.storagePath, 'index.json');
    if (fs.existsSync(indexPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
        for (const w of data) {
          this.workers.set(w.id, w);
        }
        console.log(`[WorkerManager] 加载 ${data.length} 个历史 Workers`);
      } catch (err) {
        console.error(`[WorkerManager] 加载历史失败：${err.message}`);
      }
    }
  }
  
  /**
   * 持久化 Worker（P1 新增）
   */
  async _persistWorker(worker) {
    if (this.storage !== 'file' || !this.autoSave) return;
    
    const fs = require('fs').promises;
    const path = require('path');
    
    try {
      const filePath = path.join(this.storagePath, `${worker.id}.json`);
      await fs.writeFile(filePath, JSON.stringify(worker, null, 2), 'utf-8');
      await this._updateIndex();
    } catch (err) {
      console.error(`[WorkerManager] 持久化失败：${err.message}`);
    }
  }
  
  /**
   * 更新索引文件（P1 新增）
   */
  async _updateIndex() {
    const fs = require('fs').promises;
    const path = require('path');
    
    const index = Array.from(this.workers.values())
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    const indexPath = path.join(this.storagePath, 'index.json');
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  }
  
  /**
   * 批量保存（P1 新增）
   */
  async saveAll() {
    if (this.storage !== 'file') return;
    await this._updateIndex();
    console.log(`[WorkerManager] 已保存所有 Workers (${this.workers.size}个)`);
  }

  /**
   * 创建 Worker（对应 AGENT_TOOL_NAME）
   * @param {Object} options - Worker 配置
   * @returns {Promise<Object>} Worker 信息
   */
  async create(options) {
    const {
      description,
      subagent_type = 'worker',
      prompt,
      tools = [],
      model,
      timeoutSeconds
    } = options;
    
    const workerId = `agent-${this._generateId()}`;
    
    console.log(`[WorkerManager] 创建 Worker: ${workerId}`);
    console.log(`  描述：${description}`);
    console.log(`  类型：${subagent_type}`);
    
    const worker = {
      id: workerId,
      description: description,
      type: subagent_type,
      prompt: prompt,
      tools: tools,
      status: 'running',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sessionId: null, // OpenClaw 会话 ID
      context: {
        messages: [],
        visitedFiles: [],
        discoveries: []
      },
      usage: {
        totalTokens: 0,
        toolUses: 0,
        durationMs: 0
      }
    };
    
    this.workers.set(workerId, worker);
    
    // 调用 OpenClaw API 创建子代理会话
    if (sessions_spawn) {
      try {
        const session = await sessions_spawn({
          task: prompt || description,
          mode: 'session',
          runtime: 'subagent',
          label: description,
          model: model,
          timeoutSeconds: timeoutSeconds || 3600,
          cleanup: 'keep'
        });
        
        worker.sessionId = session.sessionKey || session.id;
        console.log(`[WorkerManager] OpenClaw 会话已创建：${worker.sessionId}`);
      } catch (err) {
        console.error(`[WorkerManager] 创建 OpenClaw 会话失败：${err.message}`);
        worker.status = 'failed';
        worker.error = err.message;
        throw err;
      }
    } else {
      console.warn('[WorkerManager] OpenClaw API 不可用，使用模拟模式');
    }
    
    this.emit('worker:create', worker);
    
    if (this.verbose) {
      console.log(`[WorkerManager] Worker 已创建：${workerId}`);
    }
    
    return {
      workerId: workerId,
      sessionId: worker.sessionId,
      status: 'created'
    };
  }

  /**
   * 继续 Worker（对应 SEND_MESSAGE_TOOL_NAME）
   * @param {string} workerId - Worker ID
   * @param {string} message - 继续消息
   * @returns {Promise<Object>} 执行结果
   */
  async continue(workerId, message) {
    const worker = this.workers.get(workerId);
    
    if (!worker) {
      throw new Error(`Worker 不存在：${workerId}`);
    }
    
    if (worker.status !== 'running') {
      throw new Error(`Worker 不在运行状态：${workerId} (当前状态：${worker.status})`);
    }
    
    console.log(`[WorkerManager] 继续 Worker: ${workerId}`);
    console.log(`  消息：${message}`);
    
    // 添加消息到上下文
    worker.context.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    });
    
    worker.updatedAt = new Date().toISOString();
    
    // 调用 OpenClaw API 发送消息到 Worker 会话
    const result = await this._executeWorker(worker, message);
    
    this.emit('worker:continue', { workerId, result });
    
    return result;
  }

  /**
   * 停止 Worker（对应 TASK_STOP_TOOL_NAME）
   * @param {Object} options - 停止配置
   * @returns {Promise<Object>} 停止结果
   */
  async stop(options) {
    const { task_id: workerId, reason = '用户请求' } = options;
    
    const worker = this.workers.get(workerId);
    
    if (!worker) {
      throw new Error(`Worker 不存在：${workerId}`);
    }
    
    console.log(`[WorkerManager] 停止 Worker: ${workerId}`);
    console.log(`  原因：${reason}`);
    
    worker.status = 'killed';
    worker.updatedAt = new Date().toISOString();
    worker.stoppedAt = new Date().toISOString();
    worker.stopReason = reason;
    
    // 发送任务通知
    const notification = createTaskNotification({
      taskId: workerId,
      status: 'killed',
      summary: `Worker 已停止：${reason}`,
      usage: worker.usage
    });
    
    this.emit('worker:stop', { workerId, notification });
    
    return {
      workerId: workerId,
      status: 'killed',
      notification: notification
    };
  }

  /**
   * 执行 Worker（内部方法）- 集成 OpenClaw API + P1 重试机制
   * @param {Object} worker - Worker 对象
   * @param {string} message - 要发送的消息（可选）
   * @returns {Promise<Object>} 执行结果
   */
  async _executeWorker(worker, message = null) {
    const startTime = Date.now();
    const timeoutMs = 60000; // 60 秒超时
    
    try {
      // 使用 OpenClaw process API 发送消息（带重试）
      if (processWithRetry && worker.sessionId) {
        console.log(`[WorkerManager] 通过 OpenClaw process API 发送消息到 ${worker.sessionId}`);
        
        // 发送消息到 Worker 会话（带重试）
        const sendResult = await processWithRetry({
          action: 'paste',
          sessionId: worker.sessionId,
          text: message || worker.context.messages[worker.context.messages.length - 1]?.content || '',
          timeoutMs: timeoutMs
        });
        
        console.log(`[WorkerManager] 消息已发送，等待响应...`);
        
        // 等待 Worker 响应（轮询 + 重试）
        const pollResult = await this._pollWorkerResponse(worker.sessionId, timeoutMs);
        
        const duration = Date.now() - startTime;
        const output = pollResult.output || sendResult.output || '执行完成';
        
        const result = {
          workerId: worker.id,
          sessionId: worker.sessionId,
          status: 'completed',
          output: output,
          usage: {
            totalTokens: this._estimateTokens(output),
            toolUses: 1,
            durationMs: duration
          }
        };
        
        // 更新 Worker 状态
        worker.status = 'completed';
        worker.usage = result.usage;
        worker.completedAt = new Date().toISOString();
        
        // 持久化（P1 新增）
        await this._persistWorker(worker);
        
        // 发送任务通知
        const notification = createTaskNotification({
          taskId: worker.id,
          status: 'completed',
          summary: '任务完成',
          result: output,
          usage: result.usage
        });
        
        this.emit('worker:complete', { workerId: worker.id, notification });
        
        return {
          workerId: worker.id,
          sessionId: worker.sessionId,
          notification: notification
        };
        
      } else if (process && worker.sessionId) {
        // 降级：有 process 但没有重试包装
        console.warn('[WorkerManager] 重试机制未启用，使用基础模式');
        // ... 原有基础模式逻辑
      } else {
        // 模拟模式（OpenClaw API 不可用时）
        console.warn('[WorkerManager] OpenClaw API 不可用，使用模拟模式');
        
        const result = {
          workerId: worker.id,
          status: 'completed',
          output: `[模拟] Worker ${worker.id} 执行完成：${message || '无消息'}`,
          usage: {
            totalTokens: 100,
            toolUses: 0,
            durationMs: Date.now() - startTime
          }
        };
        
        worker.status = 'completed';
        worker.usage = result.usage;
        worker.completedAt = new Date().toISOString();
        
        const notification = createTaskNotification({
          taskId: worker.id,
          status: 'completed',
          summary: '任务完成（模拟）',
          result: result.output,
          usage: result.usage
        });
        
        this.emit('worker:complete', { workerId: worker.id, notification });
        
        return {
          workerId: worker.id,
          notification: notification
        };
      }
      
    } catch (error) {
      console.error(`[WorkerManager] Worker 执行失败：${error.message}`);
      
      worker.status = 'failed';
      worker.error = error.message;
      worker.failedAt = new Date().toISOString();
      
      // 持久化失败状态
      await this._persistWorker(worker);
      
      const notification = createTaskNotification({
        taskId: worker.id,
        status: 'failed',
        summary: `任务失败：${error.message}`,
        usage: worker.usage
      });
      
      this.emit('worker:fail', { workerId: worker.id, notification });
      
      return {
        workerId: worker.id,
        error: error.message,
        notification: notification
      };
    }
  }
  
  /**
   * 轮询 Worker 响应
   * @param {string} sessionId - 会话 ID
   * @param {number} timeoutMs - 超时时间
   * @returns {Promise<Object>} 响应结果
   */
  async _pollWorkerResponse(sessionId, timeoutMs = 60000) {
    const startTime = Date.now();
    const pollInterval = 2000; // 2 秒轮询一次
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        const result = await process({
          action: 'poll',
          sessionId: sessionId,
          timeout: 5000, // 5 秒超时
          limit: 100
        });
        
        // 检查是否有新输出
        if (result && result.output && result.output.length > 0) {
          console.log(`[WorkerManager] 收到 Worker 响应`);
          return result;
        }
        
        // 检查会话状态
        if (result && result.status === 'completed') {
          return result;
        }
        
      } catch (err) {
        console.warn(`[WorkerManager] 轮询失败：${err.message}，继续等待...`);
      }
      
      // 等待下次轮询
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    throw new Error(`轮询超时（${timeoutMs}ms）`);
  }
  
  /**
   * 估算 Token 数量
   * @param {string} text - 文本内容
   * @returns {number} 估算的 Token 数
   */
  _estimateTokens(text) {
    if (!text) return 0;
    // 粗略估算：中文约 1.5 字符/token，英文约 4 字符/token
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.round(chineseChars / 1.5 + otherChars / 4);
  }

  /**
   * 生成 Worker ID
   */
  _generateId() {
    this.workerCounter++;
    return `${this.workerCounter.toString(36)}${Date.now().toString(36)}`;
  }
  
  /**
   * 获取 Worker 统计信息（P1 新增）
   */
  getStatistics() {
    const all = Array.from(this.workers.values());
    
    return {
      total: all.length,
      byStatus: {
        running: all.filter(w => w.status === 'running').length,
        completed: all.filter(w => w.status === 'completed').length,
        failed: all.filter(w => w.status === 'failed').length,
        killed: all.filter(w => w.status === 'killed').length
      },
      totalTokens: all.reduce((sum, w) => sum + (w.usage?.totalTokens || 0), 0),
      totalDuration: all.reduce((sum, w) => sum + (w.usage?.durationMs || 0), 0),
      storage: this.storage,
      storagePath: this.storagePath
    };
  }
  
  /**
   * 搜索 Workers（P1 新增）
   */
  search(query, options = {}) {
    const { status = null, limit = 100 } = options;
    
    let results = Array.from(this.workers.values());
    
    if (status) {
      results = results.filter(w => w.status === status);
    }
    
    if (query) {
      const q = query.toLowerCase();
      results = results.filter(w => 
        w.id.toLowerCase().includes(q) ||
        (w.description && w.description.toLowerCase().includes(q))
      );
    }
    
    results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return results.slice(0, limit);
  }

  /**
   * 获取 Worker 状态
   */
  getWorkerStatus(workerId) {
    const worker = this.workers.get(workerId);
    if (!worker) {
      return null;
    }
    
    return {
      id: worker.id,
      status: worker.status,
      description: worker.description,
      createdAt: worker.createdAt,
      updatedAt: worker.updatedAt,
      usage: worker.usage
    };
  }

  /**
   * 获取所有 Worker 状态
   */
  getAllStatus() {
    const status = {
      total: this.workers.size,
      running: 0,
      completed: 0,
      failed: 0,
      killed: 0,
      workers: []
    };
    
    for (const worker of this.workers.values()) {
      status.workers.push(this.getWorkerStatus(worker.id));
      
      if (worker.status === 'running') status.running++;
      else if (worker.status === 'completed') status.completed++;
      else if (worker.status === 'failed') status.failed++;
      else if (worker.status === 'killed') status.killed++;
    }
    
    return status;
  }

  /**
   * 导出 Worker 历史（P1 增强）
   */
  exportHistory(options = {}) {
    const { format = 'json', includeDetails = false } = options;
    
    let workers = Array.from(this.workers.values());
    
    if (!includeDetails) {
      workers = workers.map(w => ({
        id: w.id,
        description: w.description,
        status: w.status,
        createdAt: w.createdAt,
        completedAt: w.completedAt,
        stoppedAt: w.stoppedAt,
        usage: w.usage
      }));
    }
    
    if (format === 'json') {
      return JSON.stringify(workers, null, 2);
    } else if (format === 'csv') {
      const headers = ['id', 'description', 'status', 'createdAt', 'completedAt', 'stoppedAt', 'totalTokens', 'durationMs'];
      const rows = [headers.join(',')];
      for (const w of workers) {
        rows.push([
          w.id,
          `"${w.description || ''}"`,
          w.status,
          w.createdAt,
          w.completedAt || '',
          w.stoppedAt || '',
          w.usage?.totalTokens || 0,
          w.usage?.durationMs || 0
        ].join(','));
      }
      return rows.join('\n');
    }
    return workers;
  }
  
  /**
   * 清空所有 Workers（P1 新增）
   */
  async clear() {
    const fs = require('fs').promises;
    const path = require('path');
    
    this.workers.clear();
    
    if (this.storage === 'file') {
      try {
        const files = await fs.readdir(this.storagePath);
        for (const file of files) {
          if (file.endsWith('.json')) {
            await fs.unlink(path.join(this.storagePath, file));
          }
        }
        console.log(`[WorkerManager] 已清空所有 Workers`);
      } catch (err) {
        console.error(`[WorkerManager] 清空失败：${err.message}`);
      }
    }
  }
}

// 导出
module.exports = WorkerManager;

// CLI 入口
if (require.main === module) {
  const WorkerManager = require('./workerManager');
  const manager = new WorkerManager({ verbose: true, maxWorkers: 5 });
  
  // 监听事件
  manager.on('worker:create', (worker) => {
    console.log(`📝 Worker 创建：${worker.id}`);
  });
  
  manager.on('worker:complete', ({ workerId, notification }) => {
    console.log(`✅ Worker 完成：${workerId}`);
    console.log(`   通知：${notification.status}`);
  });
  
  manager.on('worker:stop', ({ workerId, notification }) => {
    console.log(`⏹️  Worker 停止：${workerId}`);
    console.log(`   原因：${notification.summary}`);
  });
  
  // 测试
  (async () => {
    console.log('=== Worker 管理测试 ===\n');
    
    // 1. 创建 Worker
    console.log('1. 创建 Worker');
    const createResult = await manager.create({
      description: '研究认证模块',
      subagent_type: 'worker',
      prompt: '调查 auth.js 和 user.js 文件，理解认证流程'
    });
    console.log(`创建结果：${JSON.stringify(createResult, null, 2)}`);
    
    // 2. 继续 Worker
    console.log('\n2. 继续 Worker');
    const continueResult = await manager.continue(createResult.workerId, '修复发现的空指针问题');
    console.log(`继续结果：${JSON.stringify(continueResult, null, 2)}`);
    
    // 3. 停止 Worker
    console.log('\n3. 停止 Worker');
    const stopResult = await manager.stop({
      task_id: createResult.workerId,
      reason: '测试停止功能'
    });
    console.log(`停止结果：${JSON.stringify(stopResult, null, 2)}`);
    
    // 4. 查看状态
    console.log('\n4. Worker 状态');
    console.log(manager.getAllStatus());
  })();
}
