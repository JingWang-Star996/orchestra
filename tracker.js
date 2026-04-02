#!/usr/bin/env node

/**
 * Tracker - 进度跟踪器
 * 
 * 职责：实时监控所有子任务状态
 * 输入：任务分配列表
 * 输出：实时进度状态
 */

class ProgressTracker {
  constructor(options = {}) {
    this.tasks = new Map();
    this.timeout = options.timeout || 3600000; // 默认 1 小时超时
    this.pollInterval = options.pollInterval || 30000; // 默认 30 秒轮询
    this.verbose = options.verbose || false;
    
    // 事件监听器
    this.listeners = {
      progress: [],
      complete: [],
      error: [],
      timeout: []
    };
  }

  /**
   * 添加任务到跟踪
   */
  track(assignment) {
    this.tasks.set(assignment.task.id, {
      ...assignment,
      status: 'in_progress',
      startedAt: new Date().toISOString(),
      progress: 0,
      lastUpdate: new Date().toISOString()
    });
    
    if (this.verbose) {
      console.log(`[Tracker] 开始跟踪任务 ${assignment.task.id}: ${assignment.task.title}`);
    }
  }

  /**
   * 更新任务进度
   */
  update(taskId, status, progress = null, data = {}) {
    const task = this.tasks.get(taskId);
    
    if (!task) {
      throw new Error(`任务 ${taskId} 不存在`);
    }
    
    task.status = status;
    if (progress !== null) {
      task.progress = progress;
    }
    task.lastUpdate = new Date().toISOString();
    task.data = { ...task.data, ...data };
    
    // 触发事件
    this._emit('progress', { taskId, status, progress, data });
    
    if (status === 'completed') {
      task.completedAt = new Date().toISOString();
      this._emit('complete', { taskId, task });
    } else if (status === 'error') {
      this._emit('error', { taskId, error: data.error });
    }
    
    if (this.verbose) {
      console.log(`[Tracker] 任务 ${taskId} 更新：${status} (${progress}%)`);
    }
  }

  /**
   * 获取所有任务状态
   */
  getStatus() {
    const status = {
      total: this.tasks.size,
      completed: 0,
      inProgress: 0,
      pending: 0,
      error: 0,
      tasks: []
    };
    
    for (const [id, task] of this.tasks.entries()) {
      if (task.status === 'completed') status.completed++;
      else if (task.status === 'in_progress') status.inProgress++;
      else if (task.status === 'pending') status.pending++;
      else if (task.status === 'error') status.error++;
      
      status.tasks.push({
        id: id,
        title: task.task.title,
        status: task.status,
        progress: task.progress,
        agent: task.agent
      });
    }
    
    return status;
  }

  /**
   * 获取整体进度百分比
   */
  getOverallProgress() {
    if (this.tasks.size === 0) return 0;
    
    let total = 0;
    let completed = 0;
    
    for (const [, task] of this.tasks.entries()) {
      total++;
      if (task.status === 'completed') {
        completed++;
      } else if (task.progress > 0) {
        completed += task.progress / 100;
      }
    }
    
    return Math.round((completed / total) * 100);
  }

  /**
   * 注册事件监听器
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  /**
   * 触发事件
   */
  _emit(event, data) {
    for (const callback of this.listeners[event] || []) {
      try {
        callback(data);
      } catch (err) {
        console.error(`[Tracker] 事件 ${event} 回调错误:`, err);
      }
    }
  }

  /**
   * 导出进度报告
   */
  exportReport() {
    const status = this.getStatus();
    const report = {
      summary: {
        total: status.total,
        completed: status.completed,
        inProgress: status.inProgress,
        pending: status.pending,
        error: status.error,
        overallProgress: this.getOverallProgress() + '%'
      },
      tasks: status.tasks,
      timestamp: new Date().toISOString()
    };
    
    return report;
  }

  /**
   * 生成进度文本（用于汇报）
   */
  generateStatusText() {
    const status = this.getStatus();
    const progress = this.getOverallProgress();
    
    let text = `📊 进度报告\n\n`;
    text += `总进度：${progress}%\n`;
    text += `✅ 已完成：${status.completed}\n`;
    text += `⏳ 进行中：${status.inProgress}\n`;
    text += `⏸️ 待处理：${status.pending}\n`;
    text += `❌ 错误：${status.error}\n\n`;
    
    if (status.inProgress > 0) {
      text += `**进行中任务**:\n`;
      status.tasks
        .filter(t => t.status === 'in_progress')
        .forEach(t => {
          text += `- ${t.title} (${t.agent}, ${t.progress}%)\n`;
        });
    }
    
    return text;
  }

  /**
   * 检查超时任务
   */
  checkTimeouts() {
    const now = Date.now();
    
    for (const [id, task] of this.tasks.entries()) {
      if (task.status === 'in_progress') {
        const elapsed = now - new Date(task.startedAt).getTime();
        if (elapsed > this.timeout) {
          this.update(id, 'timeout', null, { 
            error: '任务超时',
            elapsedHours: Math.round(elapsed / 3600000 * 100) / 100
          });
          this._emit('timeout', { taskId: id, task });
        }
      }
    }
  }

  /**
   * 开始自动轮询
   */
  startPolling() {
    this.pollTimer = setInterval(() => {
      this.checkTimeouts();
    }, this.pollInterval);
    
    console.log(`[Tracker] 开始自动轮询（间隔${this.pollInterval/1000}秒）`);
  }

  /**
   * 停止自动轮询
   */
  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      console.log(`[Tracker] 停止自动轮询`);
    }
  }
}

// 导出
module.exports = ProgressTracker;

// CLI 入口
if (require.main === module) {
  const tracker = new ProgressTracker({ verbose: true });
  
  // 测试数据
  tracker.track({
    task: { id: 1, title: '测试任务 1' },
    agent: 'AI 主策划'
  });
  
  tracker.track({
    task: { id: 2, title: '测试任务 2' },
    agent: 'AI 主程'
  });
  
  // 模拟进度更新
  setTimeout(() => tracker.update(1, 'in_progress', 50), 1000);
  setTimeout(() => tracker.update(1, 'completed', 100), 2000);
  setTimeout(() => tracker.update(2, 'completed', 100), 3000);
  
  // 定期输出状态
  const interval = setInterval(() => {
    console.log('\n=== 当前状态 ===');
    console.log(tracker.generateStatusText());
    
    if (tracker.getOverallProgress() === 100) {
      clearInterval(interval);
      console.log('\n所有任务完成！');
      process.exit(0);
    }
  }, 1000);
}
