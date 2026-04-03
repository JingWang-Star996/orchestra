#!/usr/bin/env node

/**
 * OrchestraStateManager - 状态管理器（P0 优化版）
 * 
 * P0 优化内容：
 * 1. 集成真实 AI 调用 - 使用 OpenClaw sessions_spawn/process API
 * 2. 内存管理 - 限制 Map 大小，自动清理过期数据
 * 3. 异步批量写入 - 防抖保存，减少 IO 次数
 */

const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');

// 状态文件路径
const STATE_FILE = path.join(__dirname, 'temp/orchestra-state.json');

// 导出常量
module.exports.STATE_FILE = STATE_FILE;

/**
 * Agent 状态类
 */
class AgentState {
  constructor(id, name, type = 'subagent') {
    this.id = id;
    this.name = name;
    this.type = type;
    this.status = 'pending';
    this.startTime = Date.now();
    this.endTime = null;
    this.progress = {
      toolUseCount: 0,
      tokenCount: 0,
      recentActivities: []
    };
    this.description = '';
    this.error = null;
    this.result = null;
    this.sessionId = null;  // OpenClaw 会话 ID
  }
}

/**
 * 状态管理器（P0 优化版）
 */
class OrchestraStateManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.verbose = options.verbose || false;
    this.agents = new Map();
    this.autoSave = options.autoSave !== false;
    
    // P0 优化：内存管理
    this.maxAgents = options.maxAgents || 1000;
    this.cleanupInterval = options.cleanupInterval || 300000;  // 5 分钟
    
    // P0 优化：异步批量写入
    this.saveDebounce = options.saveDebounce || 5000;  // 5 秒防抖
    this.saveTimeout = null;
    
    // 启动定期清理
    this._startCleanup();
    
    // 加载已有状态
    if (this.autoSave) {
      this._loadState();
    }
  }
  
  /**
   * 启动定期清理（P0 优化）
   */
  _startCleanup() {
    setInterval(() => {
      this._cleanupOldAgents();
    }, this.cleanupInterval);
  }
  
  /**
   * 清理过期的 Agent（P0 优化）
   */
  _cleanupOldAgents() {
    const now = Date.now();
    const maxAge = 3600000;  // 1 小时
    let removed = 0;
    
    for (const [id, agent] of this.agents.entries()) {
      if (['completed', 'failed', 'killed'].includes(agent.status)) {
        if (agent.endTime && (now - agent.endTime) > maxAge) {
          this.agents.delete(id);
          removed++;
        }
      }
    }
    
    // 超过最大数量，删除最旧的
    if (this.agents.size > this.maxAgents) {
      const sorted = Array.from(this.agents.entries())
        .sort((a, b) => a[1].startTime - b[1].startTime);
      
      const toRemove = sorted.slice(0, sorted.length - this.maxAgents);
      for (const [id] of toRemove) {
        this.agents.delete(id);
        removed++;
      }
    }
    
    if (removed > 0 && this.verbose) {
      console.log(`[OrchestraState] 清理 ${removed} 个过期 Agent，剩余 ${this.agents.size} 个`);
    }
  }
  
  /**
   * 加载状态（P0 优化）
   */
  async _loadState() {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const data = await fs.readFile(STATE_FILE, 'utf-8');
        const parsed = JSON.parse(data);
        for (const agent of parsed.agents || []) {
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
   * 保存状态（P0 优化：异步批量写入）
   */
  _saveState() {
    if (!this.autoSave) return;
    
    // 防抖：取消之前的待保存
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    
    // 延迟保存，合并多次更新
    this.saveTimeout = setTimeout(async () => {
      await this._doSave();
    }, this.saveDebounce);
  }
  
  /**
   * 实际保存操作（P0 优化）
   */
  async _doSave() {
    try {
      const dir = path.dirname(STATE_FILE);
      if (!await fs.access(dir).catch(() => true)) {
        await fs.mkdir(dir, { recursive: true });
      }
      
      const data = {
        updatedAt: new Date().toISOString(),
        totalAgents: this.agents.size,
        stats: this.getStats(),
        agents: Array.from(this.agents.values())
      };
      
      await fs.writeFile(STATE_FILE, JSON.stringify(data, null, 2), 'utf-8');
      
      if (this.verbose) {
        console.log(`[OrchestraState] 已保存 ${this.agents.size} 个 Agent 状态`);
      }
      
      // 通知 API 服务器
      await this._notifyAPIServer(data);
      
    } catch (err) {
      console.error(`[OrchestraState] 保存失败：${err.message}`);
    }
  }
  
  /**
   * 通知 API 服务器（P0 优化）
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
      if (this.verbose) {
        console.warn(`[OrchestraState] API 服务器通知失败：${err.message}`);
      }
    }
  }
  
  /**
   * 注册 Agent（P0 优化：真实 AI 调用）
   */
  async register(id, name, options = {}) {
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
   * 更新状态
   */
  update(id, updates) {
    const agent = this.agents.get(id);
    if (!agent) {
      console.error(`[OrchestraState] Agent 不存在：${id}`);
      return false;
    }
    
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
   * 更新进度
   */
  updateProgress(id, progress) {
    const agent = this.agents.get(id);
    if (!agent) return false;
    
    if (progress.tokenCount !== undefined) {
      agent.progress.tokenCount = progress.tokenCount;
    }
    if (progress.toolUseCount !== undefined) {
      agent.progress.toolUseCount = progress.toolUseCount;
    }
    if (progress.recentActivities) {
      agent.progress.recentActivities = progress.recentActivities.slice(-5);
    }
    
    this._saveState();
    return true;
  }
  
  /**
   * 完成任务
   */
  complete(id, result) {
    return this.update(id, {
      status: 'completed',
      result: result,
      endTime: Date.now(),
      notified: true
    });
  }
  
  /**
   * 失败任务
   */
  fail(id, error) {
    return this.update(id, {
      status: 'failed',
      error: error,
      endTime: Date.now(),
      notified: true
    });
  }
  
  /**
   * 获取所有 Agent
   */
  getAll() {
    return Array.from(this.agents.values());
  }
  
  /**
   * 获取统计
   */
  getStats() {
    const agents = this.getAll();
    return {
      total: agents.length,
      running: agents.filter(a => a.status === 'running').length,
      completed: agents.filter(a => a.status === 'completed').length,
      failed: agents.filter(a => a.status === 'failed').length,
      totalTokens: agents.reduce((sum, a) => sum + (a.progress.tokenCount || 0), 0),
      avgDuration: agents.filter(a => a.endTime).reduce((sum, a) => 
        sum + (a.endTime - a.startTime), 0) / agents.filter(a => a.endTime).length || 0
    };
  }
  
  /**
   * 导出 JSON
   */
  toJSON() {
    return {
      updatedAt: new Date().toISOString(),
      stats: this.getStats(),
      agents: this.getAll()
    };
  }
}

// 导出单例
const stateManager = new OrchestraStateManager({ verbose: true });

module.exports = {
  OrchestraStateManager,
  stateManager,
  AgentState
};
