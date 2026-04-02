#!/usr/bin/env node

/**
 * FlexibleRecovery - 灵活恢复系统（Phase 3 增强功能）
 * 
 * 职责：支持 Worker 的错误恢复、重试、继续等灵活恢复机制
 * 
 * 灵感来源：Claude Code Coordinator 的灵活恢复策略
 */

var util = require('util');

// 恢复策略
var RECOVERY_STRATEGIES = {
  RETRY: 'retry',           // 重试
  CONTINUE: 'continue',     // 继续
  SPAWN_FRESH: 'spawn_fresh', // 创建新 Worker
  STOP: 'stop',             // 停止
  ROLLBACK: 'rollback'      // 回滚
};

// 错误类型
var ERROR_TYPES = {
  NETWORK_ERROR: 'network_error',
  TIMEOUT_ERROR: 'timeout_error',
  PERMISSION_ERROR: 'permission_error',
  SYNTAX_ERROR: 'syntax_error',
  LOGIC_ERROR: 'logic_error',
  UNKNOWN_ERROR: 'unknown_error'
};

function FlexibleRecovery(options) {
  this.options = {
    verbose: (options && options.verbose) || false,
    maxRetries: (options && options.maxRetries) || 3,
    retryDelay: (options && options.retryDelay) || 1000
  };
  
  this.errorHistory = new Map();
  this.recoveryAttempts = new Map();
}

FlexibleRecovery.prototype.classifyError = function(error) {
  var message = error.message || '';
  
  if (message.indexOf('network') !== -1 || message.indexOf('ECONN') !== -1) {
    return ERROR_TYPES.NETWORK_ERROR;
  }
  if (message.indexOf('timeout') !== -1 || message.indexOf('ETIME') !== -1) {
    return ERROR_TYPES.TIMEOUT_ERROR;
  }
  if (message.indexOf('permission') !== -1 || message.indexOf('EACCES') !== -1) {
    return ERROR_TYPES.PERMISSION_ERROR;
  }
  if (message.indexOf('syntax') !== -1 || message.indexOf('ReferenceError') !== -1) {
    return ERROR_TYPES.SYNTAX_ERROR;
  }
  if (message.indexOf('logic') !== -1 || message.indexOf('AssertionError') !== -1) {
    return ERROR_TYPES.LOGIC_ERROR;
  }
  
  return ERROR_TYPES.UNKNOWN_ERROR;
};

FlexibleRecovery.prototype.getRecoveryStrategy = function(error, workerContext) {
  var errorType = this.classifyError(error);
  var retryCount = this.recoveryAttempts.get(workerContext.workerId) || 0;
  
  // 网络错误：重试
  if (errorType === ERROR_TYPES.NETWORK_ERROR) {
    if (retryCount < this.options.maxRetries) {
      return RECOVERY_STRATEGIES.RETRY;
    }
    return RECOVERY_STRATEGIES.SPAWN_FRESH;
  }
  
  // 超时错误：重试
  if (errorType === ERROR_TYPES.TIMEOUT_ERROR) {
    if (retryCount < this.options.maxRetries) {
      return RECOVERY_STRATEGIES.RETRY;
    }
    return RECOVERY_STRATEGIES.SPAWN_FRESH;
  }
  
  // 权限错误：停止
  if (errorType === ERROR_TYPES.PERMISSION_ERROR) {
    return RECOVERY_STRATEGIES.STOP;
  }
  
  // 语法错误：创建新 Worker
  if (errorType === ERROR_TYPES.SYNTAX_ERROR) {
    return RECOVERY_STRATEGIES.SPAWN_FRESH;
  }
  
  // 逻辑错误：根据上下文决定
  if (errorType === ERROR_TYPES.LOGIC_ERROR) {
    if (workerContext && workerContext.hasGoodContext) {
      return RECOVERY_STRATEGIES.CONTINUE;
    }
    return RECOVERY_STRATEGIES.SPAWN_FRESH;
  }
  
  // 未知错误：重试
  if (retryCount < this.options.maxRetries) {
    return RECOVERY_STRATEGIES.RETRY;
  }
  return RECOVERY_STRATEGIES.SPAWN_FRESH;
};

FlexibleRecovery.prototype.executeRecovery = function(workerId, error, strategy, callback) {
  var self = this;
  var retryCount = this.recoveryAttempts.get(workerId) || 0;
  
  this.recordError(workerId, error);
  
  if (this.options.verbose) {
    console.log('[FlexibleRecovery] Worker ' + workerId + ' 错误恢复');
    console.log('  错误类型：' + this.classifyError(error));
    console.log('  恢复策略：' + strategy);
    console.log('  重试次数：' + retryCount);
  }
  
  switch (strategy) {
    case RECOVERY_STRATEGIES.RETRY:
      this.recoveryAttempts.set(workerId, retryCount + 1);
      setTimeout(function() {
        if (callback) callback(null, { strategy: 'retry', success: true });
      }, this.options.retryDelay);
      break;
      
    case RECOVERY_STRATEGIES.CONTINUE:
      if (callback) callback(null, { strategy: 'continue', success: true });
      break;
      
    case RECOVERY_STRATEGIES.SPAWN_FRESH:
      this.recoveryAttempts.delete(workerId);
      if (callback) callback(null, { strategy: 'spawn_fresh', success: true });
      break;
      
    case RECOVERY_STRATEGIES.STOP:
      this.recoveryAttempts.delete(workerId);
      if (callback) callback(null, { strategy: 'stop', success: false });
      break;
      
    default:
      if (callback) callback(new Error('未知恢复策略：' + strategy));
  }
};

FlexibleRecovery.prototype.recordError = function(workerId, error) {
  if (!this.errorHistory.has(workerId)) {
    this.errorHistory.set(workerId, []);
  }
  
  this.errorHistory.get(workerId).push({
    error: error.message,
    type: this.classifyError(error),
    timestamp: new Date().toISOString()
  });
};

FlexibleRecovery.prototype.getErrorHistory = function(workerId) {
  return this.errorHistory.get(workerId) || [];
};

FlexibleRecovery.prototype.getRecoveryAttempts = function(workerId) {
  return this.recoveryAttempts.get(workerId) || 0;
};

FlexibleRecovery.prototype.resetWorker = function(workerId) {
  this.errorHistory.delete(workerId);
  this.recoveryAttempts.delete(workerId);
  
  if (this.options.verbose) {
    console.log('[FlexibleRecovery] 重置 Worker: ' + workerId);
  }
};

FlexibleRecovery.prototype.getStats = function() {
  var self = this;
  var totalErrors = 0;
  this.errorHistory.forEach(function(errors) {
    totalErrors += errors.length;
  });
  
  var totalAttempts = 0;
  this.recoveryAttempts.forEach(function(count) {
    totalAttempts += count;
  });
  
  return {
    totalWorkers: this.errorHistory.size,
    totalErrors: totalErrors,
    totalRecoveryAttempts: totalAttempts,
    maxRetries: this.options.maxRetries,
    retryDelay: this.options.retryDelay
  };
};

module.exports = FlexibleRecovery;

// CLI 入口
if (require.main === module) {
  var FlexibleRecovery = require('./flexibleRecovery');
  var fr = new FlexibleRecovery({ verbose: true, maxRetries: 3, retryDelay: 100 });
  
  console.log('\n=== 灵活恢复系统测试 ===\n');
  
  console.log('1. 错误分类测试:');
  var errors = [
    new Error('network error: ECONNRESET'),
    new Error('timeout error: ETIMEDOUT'),
    new Error('permission denied: EACCES'),
    new Error('syntax error: ReferenceError'),
    new Error('logic error: AssertionError'),
    new Error('unknown error')
  ];
  
  errors.forEach(function(e) {
    console.log('  ' + e.message + ' → ' + fr.classifyError(e));
  });
  
  console.log('\n2. 恢复策略测试:');
  var contexts = [
    { workerId: 'worker-1' },
    { workerId: 'worker-2', hasGoodContext: true },
    { workerId: 'worker-3' }
  ];
  
  contexts.forEach(function(ctx) {
    var strategy = fr.getRecoveryStrategy(new Error('network error'), ctx);
    console.log('  ' + ctx.workerId + ' → ' + strategy);
  });
  
  console.log('\n3. 执行恢复测试:');
  fr.executeRecovery('worker-1', new Error('network error'), RECOVERY_STRATEGIES.RETRY, function(err, result) {
    console.log('  恢复结果：', result);
  });
  
  console.log('\n4. 统计信息:');
  console.log('  ', fr.getStats());
}
