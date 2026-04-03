#!/usr/bin/env node

/**
 * OrchestraStateManager - 状态管理（参考 Claude Task 框架）
 * 
 * 职责：
 * - 管理所有 Agent 的状态
 * - 提供状态更新 API
 * - 持久化到 JSON 文件
 * - 支持 HTTP 轮询读取
 * 
 * 灵感来源：Claude Code 的 task/framework.ts
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

// 状态文件路径
const STATE_FILE = path.join(__dirname, 'temp/orchestra-state.json');

// 飞书通知器（懒加载）
let _feishuNotifier = null;
const getFeishuNotifier = () => {
  if (!_feishuNotifier) {
    _feishuNotifier = require('./feishuNotifier').feishuNotifier;
  }
  return _feishuNotifier;
};

// 导出常量
module.exports.STATE_FILE = STATE_FILE;

// 轮询间隔（Claude 用 1 秒，我们用 5 秒）
const POLL_INTERVAL_MS = 5000;

/**
 * Agent 状态类型（参考 Claude TaskState）
 */
class AgentState {
  constructor(id, name, type = 'subagent') {
    this.id = id;                    // Agent ID (e.g., "agent-x7q")
    this.name = name;                // 显示名称
    this.type = type;                // 类型：subagent | worker | orchestrator
    this.status = 'pending';         // pending | running | completed | failed | killed
    this.startTime = Date.now();     // 开始时间戳
    this.endTime = null;             // 结束时间戳
    this.progress = {
      toolUseCount: 0,
      tokenCount: 0,
      recentActivities: []           // 最近 5 个活动
    };
    this.description = '';           // 任务描述
    this.error = null;               // 错误信息
    this.result = null;              // 执行结果
    this.notified = false;           // 是否已通知
  }
}

/**
 * Orchestra 状态管理器（支持事件通知）
 */
class OrchestraStateManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.verbose = options.verbose || false;
    this.agents = new Map();         // id -> AgentState
    this.autoSave = options.autoSave !== false;
    this.enableFeishuNotification = options.enableFeishuNotification !== false;
    
    // 加载已有状态
    if (this.autoSave) {
      this._loadState();
    }
    
    // 初始化飞书通知监听
    if (this.enableFeishuNotification) {
      this._initFeishuNotification();
    }
  }

  /**
   * 初始化飞书通知（P0 核心功能）
   */
  _initFeishuNotification() {
    // Agent 完成时推送
    this.on('agent:complete', async (agent) => {
      try {
        const notifier = getFeishuNotifier();
        await notifier.send({
          type: 'agent_complete',
          agent: agent
        });
        if (this.verbose) {
          console.log(`[OrchestraState] 飞书通知已发送：${agent.name} 完成`);
        }
      } catch (err) {
        console.error('[OrchestraState] 发送飞书通知失败:', err.message);
      }
    });

    // Agent 失败时推送
    this.on('agent:failed', async (agent) => {
      try {
        const notifier = getFeishuNotifier();
        await notifier.send({
          type: 'agent_failed',
          agent: agent
        });
        if (this.verbose) {
          console.log(`[OrchestraState] 飞书告警已发送：${agent.name} 失败`);
        }
      } catch (err) {
        console.error('[OrchestraState] 发送飞书告警失败:', err.message);
      }
    });
  }

  /**
   * 加载状态文件
   */
  _loadState() {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
        for (const agent of data.agents || []) {
          this.agents.set(agent.id, agent);
        }
        if (this.verbose) {
          console.log(`[OrchestraState] 加载 ${this.agents.size} 个 Agent 状态`);
        }
      }
    } catch (err) {
      console.error(`[OrchestraState] 加载状态失败：${err.message}`);
    }
  }

  /**
   * 保存状态文件
   */
  _saveState() {
    if (!this.autoSave) return;
    
    try {
      // 确保目录存在
      const dir = path.dirname(STATE_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      const data = {
        updatedAt: new Date().toISOString(),
        totalAgents: this.agents.size,
        stats: this.getStats(),
        agents: Array.from(this.agents.values())
      };
      
      fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2), 'utf-8');
      
      if (this.verbose) {
        console.log(`[OrchestraState] 已保存 ${this.agents.size} 个 Agent 状态`);
      }
      
      // 新增：保存到文件后，调用 API 服务器更新（如果可用）
      this._notifyAPIServer(data);
      
    } catch (err) {
      console.error(`[OrchestraState] 保存状态失败：${err.message}`);
    }
  }
  
  /**
   * 通知 API 服务器（新增）
   */
  async _notifyAPIServer(data) {
    try {
      await fetch('http://localhost:3000/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (this.verbose) {
        console.log(`[OrchestraState] 已通知 API 服务器`);
      }
    } catch (err) {
      // API 服务器可能未运行，静默失败
      if (this.verbose) {
        console.warn(`[OrchestraState] API 服务器通知失败：${err.message}`);
      }
    }
  }

  /**
   * 注册 Agent（参考 Claude registerTask）
   */
  register(id, name, options = {}) {
    const agent = new AgentState(id, name, options.type);
    agent.description = options.description || '';
    agent.status = 'running';
    
    this.agents.set(id, agent);
    this._saveState();
    
    if (this.verbose) {
      console.log(`[OrchestraState] 注册 Agent: ${id} - ${name}`);
    }
    
    return agent;
  }

  /**
   * 更新 Agent 状态（参考 Claude updateTaskState）
   */
  update(id, updates) {
    const agent = this.agents.get(id);
    if (!agent) {
      console.error(`[OrchestraState] Agent 不存在：${id}`);
      return false;
    }
    
    // 应用更新
    Object.assign(agent, updates);
    
    // 状态变为 terminal 时设置 endTime
    if (['completed', 'failed', 'killed'].includes(agent.status) && !agent.endTime) {
      agent.endTime = Date.now();
      agent.notified = true;
    }
    
    this._saveState();
    
    if (this.verbose) {
      console.log(`[OrchestraState] 更新 Agent: ${id} - ${agent.status}`);
    }
    
    return true;
  }

  /**
   * 更新进度（参考 Claude emitTaskProgress）
   */
  updateProgress(id, progress) {
    const agent = this.agents.get(id);
    if (!agent) return false;
    
    // 更新进度数据
    if (progress.toolUseCount !== undefined) {
      agent.progress.toolUseCount = progress.toolUseCount;
    }
    if (progress.tokenCount !== undefined) {
      agent.progress.tokenCount = progress.tokenCount;
    }
    if (progress.recentActivities) {
      // 保留最近 5 个活动
      agent.progress.recentActivities = progress.recentActivities.slice(-5);
    }
    
    this._saveState();
    return true;
  }

  /**
   * 完成任务（参考 Claude completeDreamTask）
   */
  complete(id, result) {
    const success = this.update(id, {
      status: 'completed',
      result: result,
      endTime: Date.now(),
      notified: true
    });
    
    // 触发事件（飞书通知）
    if (success) {
      const agent = this.agents.get(id);
      process.nextTick(() => this.emit('agent:complete', agent));
    }
    
    return success;
  }

  /**
   * 失败任务
   */
  fail(id, error) {
    const success = this.update(id, {
      status: 'failed',
      error: error,
      endTime: Date.now(),
      notified: true
    });
    
    // 触发事件（飞书通知）
    if (success) {
      const agent = this.agents.get(id);
      process.nextTick(() => this.emit('agent:failed', agent));
    }
    
    return success;
  }

  /**
   * 获取所有 Agent 状态
   */
  getAll() {
    return Array.from(this.agents.values());
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const agents = this.getAll();
    return {
      total: agents.length,
      running: agents.filter(a => a.status === 'running').length,
      completed: agents.filter(a => a.status === 'completed').length,
      failed: agents.filter(a => a.status === 'failed').length,
      pending: agents.filter(a => a.status === 'pending').length,
      totalTokens: agents.reduce((sum, a) => sum + (a.progress.tokenCount || 0), 0),
      avgDuration: agents.filter(a => a.endTime).reduce((sum, a) => 
        sum + (a.endTime - a.startTime), 0) / agents.filter(a => a.endTime).length || 0
    };
  }

  /**
   * 导出为 JSON（用于 HTTP API）
   */
  toJSON() {
    return {
      updatedAt: new Date().toISOString(),
      stats: this.getStats(),
      agents: this.getAll()
    };
  }

  /**
   * 清理已完成的任务（参考 Claude evictTerminalTask）
   */
  cleanup(maxAge = 3600000) {
    const now = Date.now();
    let removed = 0;
    
    for (const [id, agent] of this.agents.entries()) {
      // 只清理 terminal 状态且超过 maxAge 的任务
      if (['completed', 'failed', 'killed'].includes(agent.status)) {
        if (agent.endTime && (now - agent.endTime) > maxAge) {
          this.agents.delete(id);
          removed++;
        }
      }
    }
    
    if (removed > 0) {
      this._saveState();
      if (this.verbose) {
        console.log(`[OrchestraState] 清理 ${removed} 个过期 Agent`);
      }
    }
    
    return removed;
  }
}

// 导出单例
const stateManager = new OrchestraStateManager({ verbose: true });

module.exports = {
  OrchestraStateManager,
  stateManager,
  AgentState
};

// CLI 测试
if (require.main === module) {
  console.log('=== Orchestra State Manager 测试 ===\n');
  
  // 1. 注册 Agent
  console.log('1. 注册 Agent');
  stateManager.register('agent-1', 'AI CTO - Dashboard', {
    description: '开发监控 Dashboard'
  });
  
  // 2. 更新进度
  console.log('\n2. 更新进度');
  stateManager.updateProgress('agent-1', {
    toolUseCount: 5,
    tokenCount: 2000,
    recentActivities: [
      { toolName: 'read', activityDescription: '读取文件' },
      { toolName: 'write', activityDescription: '写入文件' }
    ]
  });
  
  // 3. 完成任务
  console.log('\n3. 完成任务');
  stateManager.complete('agent-1', { output: 'Dashboard 完成' });
  
  // 4. 获取状态
  console.log('\n4. 获取所有状态');
  console.log(JSON.stringify(stateManager.toJSON(), null, 2));
  
  console.log('\n状态文件位置:', STATE_FILE);
}
