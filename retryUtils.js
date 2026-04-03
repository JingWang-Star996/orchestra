#!/usr/bin/env node

/**
 * RetryUtils - 重试工具（P1 核心功能）
 * 
 * 职责：为 API 调用提供自动重试机制，支持指数退避、错误分类
 * 
 * 使用场景：
 * - OpenClaw API 调用失败自动重试
 * - 网络错误恢复
 * - 临时性错误处理
 */

/**
 * 重试配置
 */
const RetryConfig = {
  maxRetries: 3,              // 最大重试次数
  initialDelayMs: 1000,       // 初始延迟（1 秒）
  maxDelayMs: 30000,          // 最大延迟（30 秒）
  backoffMultiplier: 2,       // 退避倍数（指数增长）
  jitter: true,               // 添加随机抖动
  
  // 可重试的错误类型
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'TIMEOUT',
    'NETWORK_ERROR',
    'RATE_LIMITED',
    'TEMPORARY_FAILURE'
  ],
  
  // 不可重试的错误类型
  nonRetryableErrors: [
    'INVALID_API_KEY',
    'PERMISSION_DENIED',
    'RESOURCE_NOT_FOUND',
    'INVALID_REQUEST'
  ]
};

/**
 * 判断错误是否可重试
 * @param {Error} error - 错误对象
 * @returns {boolean} 是否可重试
 */
function isRetryableError(error) {
  if (!error) return false;
  
  const message = error.message || '';
  const code = error.code || '';
  
  // 检查是否在不可重试列表中
  for (const nonRetryable of RetryConfig.nonRetryableErrors) {
    if (message.includes(nonRetryable) || code === nonRetryable) {
      return false;
    }
  }
  
  // 检查是否在可重试列表中
  for (const retryable of RetryConfig.retryableErrors) {
    if (message.includes(retryable) || code === retryable) {
      return true;
    }
  }
  
  // 默认：网络相关错误可重试
  return message.includes('network') || 
         message.includes('timeout') || 
         message.includes('ECONN');
}

/**
 * 计算延迟时间（指数退避 + 抖动）
 * @param {number} attempt - 当前尝试次数（从 0 开始）
 * @returns {number} 延迟毫秒数
 */
function calculateDelay(attempt) {
  const exponentialDelay = RetryConfig.initialDelayMs * Math.pow(RetryConfig.backoffMultiplier, attempt);
  const delay = Math.min(exponentialDelay, RetryConfig.maxDelayMs);
  
  // 添加 ±20% 随机抖动，避免多个请求同时重试
  if (RetryConfig.jitter) {
    const jitterRange = delay * 0.2;
    const jitter = (Math.random() - 0.5) * 2 * jitterRange;
    return Math.round(delay + jitter);
  }
  
  return Math.round(delay);
}

/**
 * 带重试的异步函数执行
 * @param {Function} fn - 要执行的异步函数
 * @param {Object} options - 重试配置
 * @returns {Promise<any>} 函数执行结果
 * 
 * @example
 * ```javascript
 * const result = await withRetry(
 *   () => process({ action: 'send-keys', sessionId, text }),
 *   { maxRetries: 3, onRetry: (err, attempt) => console.log(`重试 ${attempt}`) }
 * );
 * ```
 */
async function withRetry(fn, options = {}) {
  const {
    maxRetries = RetryConfig.maxRetries,
    onRetry = null,           // (error, attempt) => void
    shouldRetry = isRetryableError,
    timeoutMs = null          // 单次尝试超时
  } = options;
  
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // 执行函数（支持超时）
      const result = timeoutMs 
        ? await Promise.race([
            fn(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error(`超时 (${timeoutMs}ms)`)), timeoutMs)
            )
          ])
        : await fn();
      
      return result;
      
    } catch (error) {
      lastError = error;
      
      // 检查是否应该重试
      if (!shouldRetry(error)) {
        console.error(`[Retry] 错误不可重试：${error.message}`);
        throw error;
      }
      
      // 已达到最大重试次数
      if (attempt >= maxRetries) {
        console.error(`[Retry] 达到最大重试次数 (${maxRetries})`);
        throw error;
      }
      
      // 计算延迟
      const delay = calculateDelay(attempt);
      
      // 调用重试回调
      if (onRetry) {
        onRetry(error, attempt + 1, delay);
      } else {
        console.warn(`[Retry] 尝试 ${attempt + 1}/${maxRetries} 失败，${delay}ms 后重试：${error.message}`);
      }
      
      // 等待后重试
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * 带重试的轮询（P1 新增）
 * @param {Function} checkFn - 检查函数，返回 { done: boolean, data: any }
 * @param {Object} options - 配置
 * @returns {Promise<any>} 轮询结果
 * 
 * @example
 * ```javascript
 * const result = await pollWithRetry(
 *   () => process({ action: 'poll', sessionId }),
 *   { timeoutMs: 60000, intervalMs: 2000 }
 * );
 * ```
 */
async function pollWithRetry(checkFn, options = {}) {
  const {
    timeoutMs = 60000,
    intervalMs = 2000,
    maxRetries = RetryConfig.maxRetries
  } = options;
  
  const startTime = Date.now();
  let lastError;
  let attempt = 0;
  
  while (Date.now() - startTime < timeoutMs) {
    try {
      const result = await checkFn();
      
      // 检查是否完成
      if (result.done || result.status === 'completed' || (result.output && result.output.length > 0)) {
        return result;
      }
      
      // 等待下次轮询
      await new Promise(resolve => setTimeout(resolve, intervalMs));
      
    } catch (error) {
      lastError = error;
      attempt++;
      
      // 检查是否可重试
      if (!isRetryableError(error)) {
        throw error;
      }
      
      // 达到最大重试次数
      if (attempt >= maxRetries) {
        throw error;
      }
      
      // 指数退避
      const delay = calculateDelay(attempt);
      console.warn(`[Poll] 轮询失败，${delay}ms 后重试：${error.message}`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error(`轮询超时（${timeoutMs}ms）`);
}

/**
 * 创建带重试的 API 调用器（P1 新增）
 * @param {Function} apiFn - API 函数
 * @param {Object} defaultOptions - 默认配置
 * @returns {Function} 包装后的函数
 * 
 * @example
 * ```javascript
 * const processWithRetry = createRetryableAPI(process, { maxRetries: 3 });
 * 
 * // 使用
 * const result = await processWithRetry({ action: 'send-keys', sessionId, text });
 * ```
 */
function createRetryableAPI(apiFn, defaultOptions = {}) {
  return async function(...args) {
    return await withRetry(
      () => apiFn(...args),
      defaultOptions
    );
  };
}

// 导出
module.exports = {
  RetryConfig,
  isRetryableError,
  calculateDelay,
  withRetry,
  pollWithRetry,
  createRetryableAPI
};

// CLI 测试
if (require.main === module) {
  console.log('=== 重试工具测试 ===\n');
  
  // 测试 1: 成功情况
  (async () => {
    console.log('测试 1: 成功情况（无需重试）');
    const result = await withRetry(
      () => Promise.resolve('成功'),
      { maxRetries: 3 }
    );
    console.log(`结果：${result}\n`);
  })();
  
  // 测试 2: 失败后重试成功
  (async () => {
    console.log('测试 2: 失败后重试成功');
    let attempts = 0;
    const result = await withRetry(
      () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('ECONNRESET: 网络错误');
        }
        return Promise.resolve(`第${attempts}次尝试成功`);
      },
      { 
        maxRetries: 5,
        onRetry: (err, attempt, delay) => {
          console.log(`  重试 ${attempt}: ${err.message}, 延迟 ${delay}ms`);
        }
      }
    );
    console.log(`结果：${result}\n`);
  })();
  
  // 测试 3: 不可重试的错误
  (async () => {
    console.log('测试 3: 不可重试的错误（立即抛出）');
    try {
      await withRetry(
        () => Promise.reject(new Error('INVALID_API_KEY: 无效的 API 密钥')),
        { maxRetries: 3 }
      );
    } catch (err) {
      console.log(`捕获错误：${err.message}\n`);
    }
  })();
  
  // 测试 4: 达到最大重试次数
  (async () => {
    console.log('测试 4: 达到最大重试次数');
    try {
      await withRetry(
        () => Promise.reject(new Error('ETIMEDOUT: 连接超时')),
        { 
          maxRetries: 2,
          onRetry: (err, attempt, delay) => {
            console.log(`  重试 ${attempt}: 延迟 ${delay}ms`);
          }
        }
      );
    } catch (err) {
      console.log(`最终错误：${err.message}\n`);
    }
  })();
}
