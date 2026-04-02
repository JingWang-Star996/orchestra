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

class WorkerManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.workers = new Map();
    this.workerCounter = 0;
    this.verbose = options.verbose || false;
    this.maxWorkers = options.maxWorkers || 10;
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
      tools = []
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
    this.emit('worker:create', worker);
    
    if (this.verbose) {
      console.log(`[WorkerManager] Worker 已创建：${workerId}`);
    }
    
    return {
      workerId: workerId,
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
    
    // TODO: 实际调用 Agent 继续执行
    const result = await this._executeWorker(worker);
    
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
   * 执行 Worker（内部方法）
   */
  async _executeWorker(worker) {
    const startTime = Date.now();
    
    try {
      // TODO: 实际调用 Agent 执行
      // 这里返回模拟结果
      const result = {
        workerId: worker.id,
        status: 'completed',
        output: `Worker ${worker.id} 执行完成`,
        usage: {
          totalTokens: 100,
          toolUses: 2,
          durationMs: Date.now() - startTime
        }
      };
      
      // 更新 Worker 状态
      worker.status = 'completed';
      worker.usage = result.usage;
      worker.completedAt = new Date().toISOString();
      
      // 发送任务通知
      const notification = createTaskNotification({
        taskId: worker.id,
        status: 'completed',
        summary: '任务完成',
        result: result.output,
        usage: result.usage
      });
      
      this.emit('worker:complete', { workerId: worker.id, notification });
      
      return {
        workerId: worker.id,
        notification: notification
      };
      
    } catch (error) {
      worker.status = 'failed';
      worker.error = error.message;
      
      const notification = createTaskNotification({
        taskId: worker.id,
        status: 'failed',
        summary: `任务失败：${error.message}`,
        usage: worker.usage
      });
      
      this.emit('worker:fail', { workerId: worker.id, notification });
      
      return {
        workerId: worker.id,
        notification: notification
      };
    }
  }

  /**
   * 生成 Worker ID
   */
  _generateId() {
    this.workerCounter++;
    return `${this.workerCounter.toString(36)}${Date.now().toString(36)}`;
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
   * 导出 Worker 历史
   */
  exportHistory() {
    return Array.from(this.workers.values()).map(worker => ({
      id: worker.id,
      description: worker.description,
      status: worker.status,
      createdAt: worker.createdAt,
      completedAt: worker.completedAt,
      stoppedAt: worker.stoppedAt,
      usage: worker.usage
    }));
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
