#!/usr/bin/env node

/**
 * Error Handler - 错误处理
 * 
 * 职责：异常捕获、重试机制、降级策略
 */

class ErrorHandler {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000; // 毫秒
    this.verbose = options.verbose || false;
    
    // 错误统计
    this.stats = {
      total: 0,
      recovered: 0,
      failed: 0,
      byType: {}
    };
  }

  /**
   * 执行带重试的函数
   */
  async withRetry(fn, context = {}) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        this.stats.total++;
        const result = await fn();
        
        if (attempt > 1 && this.verbose) {
          console.log(`[ErrorHandler] 重试成功（第${attempt}次）`);
        }
        
        this.stats.recovered++;
        return result;
        
      } catch (error) {
        lastError = error;
        this._recordError(error);
        
        if (this.verbose) {
          console.log(`[ErrorHandler] 尝试 ${attempt}/${this.maxRetries} 失败:`, error.message);
        }
        
        // 检查是否应该重试
        if (!this._shouldRetry(error)) {
          break;
        }
        
        // 等待后重试（指数退避）
        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        if (attempt < this.maxRetries) {
          await this._sleep(delay);
        }
      }
    }
    
    // 所有重试都失败了
    this.stats.failed++;
    throw lastError;
  }

  /**
   * 判断错误是否应该重试
   */
  _shouldRetry(error) {
    // 网络错误、超时错误应该重试
    const retryableErrors = [
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'TIMEOUT',
      'RATE_LIMIT'
    ];
    
    if (error.code && retryableErrors.includes(error.code)) {
      return true;
    }
    
    if (error.type && retryableErrors.includes(error.type)) {
      return true;
    }
    
    // API 限流应该重试
    if (error.message && error.message.includes('rate limit')) {
      return true;
    }
    
    return false;
  }

  /**
   * 记录错误
   */
  _recordError(error) {
    const errorType = error.code || error.type || 'UNKNOWN';
    
    if (!this.stats.byType[errorType]) {
      this.stats.byType[errorType] = 0;
    }
    this.stats.byType[errorType]++;
  }

  /**
   * 休眠
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 包装任务执行（带错误处理）
   */
  wrapTask(taskFn, taskId, context = {}) {
    return async () => {
      try {
        return await this.withRetry(taskFn, { ...context, taskId });
      } catch (error) {
        // 任务失败，但不影响其他任务
        console.error(`[ErrorHandler] 任务 ${taskId} 失败:`, error.message);
        
        return {
          success: false,
          taskId: taskId,
          error: error.message,
          errorType: error.code || error.type || 'UNKNOWN'
        };
      }
    };
  }

  /**
   * 批量执行任务（容错）
   */
  async executeBatch(tasks, options = {}) {
    const {
      stopOnError = false,  // 遇到错误是否停止
      maxConcurrent = 5     // 最大并发数
    } = options;
    
    const results = [];
    const errors = [];
    
    // 限制并发
    const semaphore = new Array(maxConcurrent).fill(null);
    
    for (const task of tasks) {
      const wrapped = this.wrapTask(task.fn, task.id);
      
      const promise = Promise.race([
        wrapped(),
        ...semaphore.filter(Boolean)
      ]);
      
      semaphore.push(promise);
      if (semaphore.length > maxConcurrent) {
        await semaphore.shift();
      }
      
      try {
        const result = await promise;
        results.push(result);
        
        if (!result.success && stopOnError) {
          break;
        }
      } catch (error) {
        errors.push({
          taskId: task.id,
          error: error.message
        });
        
        if (stopOnError) {
          break;
        }
      }
    }
    
    return {
      results,
      errors,
      summary: {
        total: tasks.length,
        success: results.filter(r => r.success !== false).length,
        failed: errors.length
      }
    };
  }

  /**
   * 获取错误统计
   */
  getStats() {
    return {
      ...this.stats,
      recoveryRate: this.stats.total > 0 
        ? Math.round((this.stats.recovered / this.stats.total) * 100) + '%'
        : '0%'
    };
  }

  /**
   * 生成错误报告
   */
  generateReport() {
    const stats = this.getStats();
    
    let report = `## 错误统计报告\n\n`;
    report += `**总错误数**: ${stats.total}\n`;
    report += `**恢复成功**: ${stats.recovered}\n`;
    report += `**最终失败**: ${stats.failed}\n`;
    report += `**恢复率**: ${stats.recoveryRate}\n\n`;
    
    if (Object.keys(stats.byType).length > 0) {
      report += `**错误类型分布**:\n\n`;
      for (const [type, count] of Object.entries(stats.byType)) {
        report += `- ${type}: ${count}\n`;
      }
    }
    
    return report;
  }

  /**
   * 降级策略
   */
  fallback(originalFn, fallbackFn) {
    return async () => {
      try {
        return await originalFn();
      } catch (error) {
        console.log(`[ErrorHandler] 主函数失败，使用降级策略`);
        return await fallbackFn(error);
      }
    };
  }
}

// 导出
module.exports = ErrorHandler;

// CLI 入口
if (require.main === module) {
  const handler = new ErrorHandler({ verbose: true, maxRetries: 3 });
  
  // 测试：模拟会失败的函数
  let attempt = 0;
  const flakyFn = async () => {
    attempt++;
    if (attempt < 3) {
      throw new Error('临时错误');
    }
    return '成功！';
  };
  
  handler.withRetry(flakyFn)
    .then(result => {
      console.log('最终结果:', result);
      console.log('错误统计:', handler.getStats());
    })
    .catch(err => {
      console.error('彻底失败:', err.message);
    });
}
