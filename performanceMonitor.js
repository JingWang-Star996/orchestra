#!/usr/bin/env node

/**
 * PerformanceMonitor - 性能监控模块（Phase 3 新增）
 * 
 * 职责：
 *   - 并发控制：限制同时运行的任务数
 *   - 超时处理：自动终止超时任务
 *   - 资源监控：跟踪内存、CPU、队列深度
 *   - 性能报告：生成统计数据
 * 
 * 设计原则：
 *   - 零外部依赖
 *   - 可嵌入到任何模块
 *   - 低开销（采样式监控）
 */

var EventEmitter = require('events');
var util = require('util');

/**
 * 并发控制器
 * 控制同时执行的任务数量，超出时排队
 */
function ConcurrencyController(options) {
  EventEmitter.call(this);
  options = options || {};
  this.maxConcurrency = options.maxConcurrency || 5;
  this.queue = [];
  this.active = new Map(); // taskId -> { start, task }
  this.stats = { total: 0, completed: 0, failed: 0, peakActive: 0 };
  this.verbose = options.verbose || false;
}

util.inherits(ConcurrencyController, EventEmitter);

/**
 * 提交任务
 * @param {string} taskId - 任务 ID
 * @param {Function} fn - 异步函数 () => Promise
 * @param {number} [priority] - 优先级（数字越小越优先）
 * @returns {Promise}
 */
ConcurrencyController.prototype.submit = function(taskId, fn, priority) {
  var self = this;
  priority = priority || 0;
  
  return new Promise(function(resolve, reject) {
    var entry = {
      id: taskId,
      fn: fn,
      priority: priority,
      resolve: resolve,
      reject: reject,
      queuedAt: Date.now()
    };
    
    // 按优先级插入队列
    var inserted = false;
    for (var i = 0; i < self.queue.length; i++) {
      if (entry.priority < self.queue[i].priority) {
        self.queue.splice(i, 0, entry);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      self.queue.push(entry);
    }
    
    self._drain();
  });
};

/**
 * 从队列中取出任务执行
 * @private
 */
ConcurrencyController.prototype._drain = function() {
  var self = this;
  
  while (this.active.size < this.maxConcurrency && this.queue.length > 0) {
    var entry = this.queue.shift();
    var start = Date.now();
    
    this.active.set(entry.id, { start: start });
    this.stats.total++;
    this.stats.peakActive = Math.max(this.stats.peakActive, this.active.size);
    
    if (this.verbose) {
      console.log('[Concurrency] 开始: ' + entry.id + ' (' + this.active.size + '/' + this.maxConcurrency + ')');
    }
    
    entry.fn()
      .then(function(result) {
        self.active.delete(entry.id);
        self.stats.completed++;
        if (self.verbose) console.log('[Concurrency] 完成: ' + entry.id);
        entry.resolve(result);
        self.emit('task:done', { id: entry.id, success: true, duration: Date.now() - start });
        self._drain();
      })
      .catch(function(err) {
        self.active.delete(entry.id);
        self.stats.failed++;
        if (self.verbose) console.log('[Concurrency] 失败: ' + entry.id + ' - ' + err.message);
        entry.reject(err);
        self.emit('task:done', { id: entry.id, success: false, error: err.message, duration: Date.now() - start });
        self._drain();
      });
  }
};

/**
 * 获取状态
 */
ConcurrencyController.prototype.getStatus = function() {
  return {
    active: this.active.size,
    queued: this.queue.length,
    maxConcurrency: this.maxConcurrency,
    stats: Object.assign({}, this.stats)
  };
};

/**
 * 调整最大并发数
 */
ConcurrencyController.prototype.setMaxConcurrency = function(n) {
  this.maxConcurrency = Math.max(1, n);
  this._drain();
};


/**
 * 超时管理器
 * 为任务添加超时保护
 */
function TimeoutManager(options) {
  EventEmitter.call(this);
  options = options || {};
  this.defaultTimeout = options.defaultTimeout || 60000;
  this.timers = new Map(); // taskId -> timer
  this.stats = { total: 0, timedOut: 0, completed: 0 };
  this.verbose = options.verbose || false;
}

util.inherits(TimeoutManager, EventEmitter);

/**
 * 带超时执行
 * @param {string} taskId - 任务 ID
 * @param {Promise} promise - 原始 Promise
 * @param {number} [timeoutMs] - 超时时间（毫秒）
 * @returns {Promise}
 */
TimeoutManager.prototype.withTimeout = function(taskId, promise, timeoutMs) {
  var self = this;
  var ms = timeoutMs || this.defaultTimeout;
  
  this.stats.total++;
  
  return new Promise(function(resolve, reject) {
    var timer = setTimeout(function() {
      self.timers.delete(taskId);
      self.stats.timedOut++;
      if (self.verbose) console.log('[Timeout] 超时: ' + taskId + ' (' + ms + 'ms)');
      reject(new Error('超时: ' + taskId));
      self.emit('timeout', { id: taskId, timeout: ms });
    }, ms);
    
    self.timers.set(taskId, timer);
    
    promise.then(
      function(result) {
        clearTimeout(timer);
        self.timers.delete(taskId);
        self.stats.completed++;
        resolve(result);
      },
      function(err) {
        clearTimeout(timer);
        self.timers.delete(taskId);
        reject(err);
      }
    );
  });
};

/**
 * 取消超时
 */
TimeoutManager.prototype.cancel = function(taskId) {
  var timer = this.timers.get(taskId);
  if (timer) {
    clearTimeout(timer);
    this.timers.delete(taskId);
    return true;
  }
  return false;
};

/**
 * 获取状态
 */
TimeoutManager.prototype.getStatus = function() {
  return {
    active: this.timers.size,
    stats: Object.assign({}, this.stats)
  };
};


/**
 * 资源监控器
 * 采样系统资源使用情况
 */
function ResourceMonitor(options) {
  EventEmitter.call(this);
  options = options || {};
  this.interval = options.interval || 30000;
  this.maxSamples = options.maxSamples || 100;
  this.samples = [];
  this.running = false;
  this._timer = null;
  this.verbose = options.verbose || false;
}

util.inherits(ResourceMonitor, EventEmitter);

/**
 * 采样一次
 */
ResourceMonitor.prototype.sample = function() {
  var mem = process.memoryUsage();
  var sample = {
    time: Date.now(),
    heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
    heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
    rss: Math.round(mem.rss / 1024 / 1024),
    uptime: Math.round(process.uptime())
  };
  
  this.samples.push(sample);
  if (this.samples.length > this.maxSamples) {
    this.samples.shift();
  }
  
  this.emit('sample', sample);
  return sample;
};

/**
 * 启动定期采样
 */
ResourceMonitor.prototype.start = function() {
  if (this.running) return;
  this.running = true;
  this.sample();
  this._timer = setInterval(this.sample.bind(this), this.interval);
  if (this.verbose) console.log('[ResourceMonitor] 启动');
};

/**
 * 停止采样
 */
ResourceMonitor.prototype.stop = function() {
  if (!this.running) return;
  this.running = false;
  if (this._timer) clearInterval(this._timer);
  if (this.verbose) console.log('[ResourceMonitor] 停止');
};

/**
 * 获取报告
 */
ResourceMonitor.prototype.getReport = function() {
  if (this.samples.length === 0) return null;
  
  var current = this.samples[this.samples.length - 1];
  var peak = { heapUsed: 0, rss: 0 };
  
  this.samples.forEach(function(s) {
    peak.heapUsed = Math.max(peak.heapUsed, s.heapUsed);
    peak.rss = Math.max(peak.rss, s.rss);
  });
  
  return {
    current: current,
    peak: peak,
    sampleCount: this.samples.length,
    running: this.running
  };
};

/**
 * 获取状态
 */
ResourceMonitor.prototype.getStatus = function() {
  return {
    isRunning: this.running,
    sampleCount: this.samples.length,
    interval: this.interval,
    current: this.samples.length > 0 ? this.samples[this.samples.length - 1] : null
  };
};

/**
 * 健康检查
 */
ResourceMonitor.prototype.healthCheck = function() {
  var report = this.getReport();
  if (!report) return { status: 'unknown' };
  
  var issues = [];
  var status = 'healthy';
  
  if (report.peak.heapUsed > 500) {
    issues.push('内存峰值过高: ' + report.peak.heapUsed + 'MB');
    status = 'warning';
  }
  if (report.peak.heapUsed > 1000) {
    status = 'critical';
  }
  
  return { status: status, issues: issues, report: report };
};


/**
 * PerformanceMonitor - 统一的性能监控入口
 * 组合并发控制、超时管理、资源监控
 */
function PerformanceMonitor(options) {
  EventEmitter.call(this);
  options = options || {};
  
  this.concurrency = new ConcurrencyController({
    maxConcurrency: options.maxConcurrency || 5,
    verbose: options.verbose
  });
  
  this.timeout = new TimeoutManager({
    defaultTimeout: options.defaultTimeout || 60000,
    verbose: options.verbose
  });
  
  this.resource = new ResourceMonitor({
    interval: options.resourceInterval || 30000,
    verbose: options.verbose
  });
  
  this.verbose = options.verbose || false;
  
  if (this.verbose) {
    console.log('[PerformanceMonitor] 初始化完成');
  }
}

util.inherits(PerformanceMonitor, EventEmitter);

/**
 * 启动所有监控
 */
PerformanceMonitor.prototype.start = function() {
  this.resource.start();
  if (this.verbose) console.log('[PerformanceMonitor] 全部启动');
};

/**
 * 停止所有监控
 */
PerformanceMonitor.prototype.stop = function() {
  this.resource.stop();
  if (this.verbose) console.log('[PerformanceMonitor] 全部停止');
};

/**
 * 获取完整报告
 */
PerformanceMonitor.prototype.getReport = function() {
  return {
    concurrency: this.concurrency.getStatus(),
    timeout: this.timeout.getStatus(),
    resource: this.resource.getReport(),
    health: this.resource.healthCheck()
  };
};

// 导出
module.exports = PerformanceMonitor;
module.exports.ConcurrencyController = ConcurrencyController;
module.exports.TimeoutManager = TimeoutManager;
module.exports.ResourceMonitor = ResourceMonitor;

// CLI 入口
if (require.main === module) {
  var pm = new PerformanceMonitor({ verbose: true, maxConcurrency: 3 });
  pm.start();
  
  console.log('\n=== 性能监控测试 ===\n');
  
  // 并发控制
  var tasks = [1, 2, 3, 4, 5].map(function(i) {
    return pm.concurrency.submit('task-' + i, function() {
      return new Promise(function(resolve) {
        setTimeout(function() { resolve('done-' + i); }, 100 + i * 50);
      });
    });
  });
  
  Promise.all(tasks).then(function() {
    console.log('\n并发状态:', JSON.stringify(pm.concurrency.getStatus(), null, 2));
    console.log('超时状态:', JSON.stringify(pm.timeout.getStatus(), null, 2));
    console.log('资源报告:', JSON.stringify(pm.resource.getReport(), null, 2));
    console.log('健康检查:', JSON.stringify(pm.resource.healthCheck(), null, 2));
    pm.stop();
  });
}
