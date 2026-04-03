#!/usr/bin/env node

/**
 * ParallelExecutor - 异步并行执行引擎（Phase 1 核心功能）
 * 
 * 职责：支持多个 Agent 异步并行执行，实现"扇出"（fan out）模式
 * 
 * 灵感来源：Claude Code Coordinator 的并行执行策略
 * > "Parallelism is your superpower. Workers are async."
 */

const EventEmitter = require('events');
const { callAgent } = require('./agentCaller'); // 真实 Agent 调用器

class ParallelExecutor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxConcurrent = options.maxConcurrent || 5;
    this.verbose = options.verbose || false;
    this.activeWorkers = new Map();
    this.completedTasks = new Map();
    this.failedTasks = new Map();
  }

  /**
   * 扇出模式：同时启动多个 Agent 并行执行
   * @param {Array} tasks - 任务列表
   * @returns {Promise<Array>} 所有任务结果
   */
  async fanOut(tasks) {
    console.log(`[ParallelExecutor] 扇出模式：启动 ${tasks.length} 个并行任务`);
    
    // 限制并发数
    const chunks = this._chunkTasks(tasks, this.maxConcurrent);
    const allResults = [];
    
    for (const chunk of chunks) {
      console.log(`[ParallelExecutor] 执行批次：${chunk.length} 个任务`);
      const results = await Promise.all(
        chunk.map(task => this._executeTask(task))
      );
      allResults.push(...results);
    }
    
    console.log(`[ParallelExecutor] 扇出完成：${allResults.length} 个任务`);
    return allResults;
  }

  /**
   * 异步执行单个任务
   * @param {Object} task - 任务配置
   * @returns {Promise<Object>} 任务结果
   */
  async _executeTask(task) {
    const taskId = task.id || `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`[ParallelExecutor] 启动任务：${taskId}`);
    this.emit('task:start', { taskId, task });
    
    const startTime = Date.now();
    
    try {
      // 执行任务（调用 Agent）
      const result = await this._callAgent(task);
      
      const duration = Date.now() - startTime;
      const taskResult = {
        taskId,
        status: 'completed',
        result: result,
        usage: {
          durationMs: duration,
          tokens: result.tokens || 0,
          toolCalls: result.toolCalls || 0
        }
      };
      
      this.completedTasks.set(taskId, taskResult);
      this.emit('task:complete', taskResult);
      
      console.log(`[ParallelExecutor] 任务完成：${taskId} (${duration}ms)`);
      return taskResult;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const taskResult = {
        taskId,
        status: 'failed',
        error: error.message,
        usage: {
          durationMs: duration
        }
      };
      
      this.failedTasks.set(taskId, taskResult);
      this.emit('task:fail', taskResult);
      
      console.error(`[ParallelExecutor] 任务失败：${taskId} - ${error.message}`);
      return taskResult;
    }
  }

  /**
   * 调用 Agent 执行（真实调用）
   */
  async _callAgent(task) {
    console.log(`[ParallelExecutor] 调用 Agent: ${task.agent || 'unknown'}`);
    
    // 真实调用 Agent
    const result = await callAgent(
      task.agent || 'Agent',
      task.task || task.description || '执行任务',
      task.promptPath || null
    );
    
    return {
      output: result.result.content,
      tokens: result.tokens,
      agent: result.agent,
      time: result.time
    };
  }

  /**
   * 分块任务列表
   */
  _chunkTasks(tasks, size) {
    const chunks = [];
    for (let i = 0; i < tasks.length; i += size) {
      chunks.push(tasks.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * 获取执行状态
   */
  getStatus() {
    return {
      activeWorkers: this.activeWorkers.size,
      completedTasks: this.completedTasks.size,
      failedTasks: this.failedTasks.size,
      maxConcurrent: this.maxConcurrent
    };
  }

  /**
   * 等待所有任务完成
   */
  async waitForCompletion(timeout = 300000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const check = () => {
        if (this.activeWorkers.size === 0) {
          resolve(this.getStatus());
        } else if (Date.now() - startTime > timeout) {
          reject(new Error('等待超时'));
        } else {
          setTimeout(check, 100);
        }
      };
      
      check();
    });
  }

  /**
   * 停止所有活动 Worker
   */
  async stopAll() {
    console.log(`[ParallelExecutor] 停止所有活动 Worker (${this.activeWorkers.size}个)`);
    
    for (const [workerId, worker] of this.activeWorkers.entries()) {
      await this._stopWorker(workerId);
    }
    
    this.emit('stop:all');
  }

  /**
   * 停止单个 Worker
   */
  async _stopWorker(workerId) {
    // TODO: 实现 Worker 停止逻辑
    this.activeWorkers.delete(workerId);
  }
}

// 导出
module.exports = ParallelExecutor;

// CLI 入口
if (require.main === module) {
  const executor = new ParallelExecutor({ maxConcurrent: 3, verbose: true });
  
  // 监听事件
  executor.on('task:start', ({ taskId }) => {
    console.log(`📝 任务开始：${taskId}`);
  });
  
  executor.on('task:complete', (result) => {
    console.log(`✅ 任务完成：${result.taskId} (${result.usage.durationMs}ms)`);
  });
  
  executor.on('task:fail', (result) => {
    console.error(`❌ 任务失败：${result.taskId} - ${result.error}`);
  });
  
  // 测试扇出模式
  const tasks = [
    { id: 'task-1', agent: 'AI 研究员', prompt: '研究 A 模块' },
    { id: 'task-2', agent: 'AI 研究员', prompt: '研究 B 模块' },
    { id: 'task-3', agent: 'AI 研究员', prompt: '研究 C 模块' },
    { id: 'task-4', agent: 'AI 开发者', prompt: '实现 A 功能' },
    { id: 'task-5', agent: 'AI 开发者', prompt: '实现 B 功能' }
  ];
  
  executor.fanOut(tasks)
    .then(results => {
      console.log('\n=== 执行结果 ===');
      console.log(`完成：${results.filter(r => r.status === 'completed').length}个`);
      console.log(`失败：${results.filter(r => r.status === 'failed').length}个`);
      console.log('状态:', executor.getStatus());
    })
    .catch(err => {
      console.error('执行失败:', err.message);
      process.exit(1);
    });
}
