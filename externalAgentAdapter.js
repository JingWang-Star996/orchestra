#!/usr/bin/env node

/**
 * ExternalAgentAdapter — 外部 Agent HTTP 适配器
 *
 * 职责：与 Orchestra 外部的 Agent（如 Hermes）进行 HTTP 通信
 * - 通用 HTTP 调用（支持 Bearer token / API key / 无认证）
 * - sendMessage / receiveMessage / delegateTask
 * - 超时控制 + 指数退避重试
 * - 连接健康检查
 */

const EventEmitter = require('events');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const { createRetryableAPI, calculateDelay } = require('./retryUtils');

// ─── 默认配置 ─────────────────────────────────────────────

const DEFAULT_TIMEOUT = 30000;       // 30s
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 1000;    // 1s initial
const RETRY_BACKOFF = 2;

// ─── 工具函数 ─────────────────────────────────────────────

function _httpClient(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;

    const timeout = options.timeout || DEFAULT_TIMEOUT;

    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      timeout
    };

    const req = lib.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ statusCode: res.statusCode, body: parsed, headers: res.headers });
        } catch {
          resolve({ statusCode: res.statusCode, body: data, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`HTTP 请求超时 (${timeout}ms): ${url}`));
    });

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

function _buildAuthHeaders(agentConfig) {
  const headers = {};
  const authType = (agentConfig.auth_type || agentConfig.authType || 'none').toLowerCase();

  switch (authType) {
    case 'bearer':
    case 'token':
      headers['Authorization'] = `Bearer ${agentConfig.api_key || agentConfig.apiKey || ''}`;
      break;
    case 'api_key':
    case 'apikey':
      headers['X-API-Key'] = agentConfig.api_key || agentConfig.apiKey || '';
      break;
    case 'basic':
      const user = agentConfig.username || 'api';
      const pass = agentConfig.api_key || agentConfig.apiKey || '';
      headers['Authorization'] = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
      break;
    case 'custom':
      if (agentConfig.customHeaders) {
        Object.assign(headers, agentConfig.customHeaders);
      }
      break;
    default:
      // 无认证，不添加 header
      break;
  }

  return headers;
}

function _fullUrl(agentConfig, endpointPath) {
  const base = agentConfig.endpoint || agentConfig.url || '';
  if (!base) throw new Error('Agent 未配置 endpoint');
  // 拼接路径，处理斜杠
  const cleanBase = base.replace(/\/+$/, '');
  const cleanPath = endpointPath.replace(/^\/+/, '');
  return `${cleanBase}/${cleanPath}`;
}

// ─── 带重试的 HTTP 调用包装 ─────────────────────────────────

async function _httpWithRetry(url, options, maxRetries, onRetry, verbose) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await _httpClient(url, options);
      if (result.statusCode >= 200 && result.statusCode < 300) return result;
      // 5xx 可重试，4xx 不可重试
      if (result.statusCode >= 400 && result.statusCode < 500) {
        throw new Error(`HTTP ${result.statusCode}: ${JSON.stringify(result.body).slice(0, 200)}`);
      }
      if (attempt < maxRetries) {
        const delay = calculateDelay(attempt);
        if (verbose) console.log(`[ExternalAgent] HTTP ${result.statusCode}, ${delay}ms 后重试 ${attempt+1}/${maxRetries}`);
        if (onRetry) onRetry(new Error(`HTTP ${result.statusCode}`), attempt, delay);
        await _sleep(delay);
      }
      lastErr = new Error(`HTTP ${result.statusCode} after ${maxRetries+1} attempts`);
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        const delay = calculateDelay(attempt);
        if (verbose) console.log(`[ExternalAgent] 请求失败, ${delay}ms 后重试 ${attempt+1}/${maxRetries}: ${err.message}`);
        if (onRetry) onRetry(err, attempt, delay);
        await _sleep(delay);
      }
    }
  }
  throw lastErr;
}

function _sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── ExternalAgentAdapter 类 ──────────────────────────────

class ExternalAgentAdapter extends EventEmitter {
  constructor(options = {}) {
    super();
    this.verbose = options.verbose || false;
    this.defaultTimeout = options.timeout || DEFAULT_TIMEOUT;
    this.defaultMaxRetries = options.maxRetries || DEFAULT_MAX_RETRIES;
  }

  /**
   * 发送消息到外部 Agent
   * @param {Object} agentConfig - { endpoint, api_key, auth_type, ... }
   * @param {Object} message - { content, context, metadata }
   * @returns {Promise<Object>} 响应
   */
  async sendMessage(agentConfig, message) {
    const url = _fullUrl(agentConfig, agentConfig.messagePath || '/api/message');
    const headers = _buildAuthHeaders(agentConfig);
    const timeout = agentConfig.timeout || this.defaultTimeout;
    const maxRetries = agentConfig.maxRetries !== undefined ? agentConfig.maxRetries : this.defaultMaxRetries;

    const payload = {
      content: message.content || message,
      context: message.context || {},
      metadata: {
        source: 'orchestra',
        timestamp: new Date().toISOString(),
        ...message.metadata
      }
    };

    if (this.verbose) {
      console.log(`[ExternalAgent] 发送消息 → ${url}`);
    }

    this.emit('message:sending', { url, agentConfig: agentConfig.name || 'unknown' });

    try {
      const result = await _httpWithRetry(
        url,
        { method: 'POST', headers, body: payload, timeout },
        maxRetries,
        (err, attempt, delay) => this.emit('retry', { err, attempt, delay }),
        this.verbose
      );
      this.emit('message:sent', { url, response: result });
      if (this.verbose) console.log(`[ExternalAgent] 消息已发送 ← ${result.statusCode}`);
      return result;
    } catch (err) {
      this.emit('message:error', { url, error: err.message });
      throw err;
    }
  }

  /**
   * 接收外部 Agent 的回调消息（webhook handler 中间件）
   * 返回一个函数，可以直接作为 http.Server 的请求处理函数
   * @param {string} agentId - 外部 Agent 标识
   * @returns {Function} (req, res) => void
   */
  receiveMessage(agentId) {
    return (req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const message = JSON.parse(body);
          if (this.verbose) console.log(`[ExternalAgent] 接收回调 from ${agentId}:`, message);
          this.emit('message:received', { agentId, message });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, received: true }));
        } catch (err) {
          this.emit('message:error', { agentId, error: err.message });
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
    };
  }

  /**
   * 委派任务到外部 Agent
   * @param {Object} agentConfig - Agent 配置
   * @param {Object} task - { title, description, context, priority }
   * @param {Object} taskContext - 附加上下文
   * @returns {Promise<Object>} 委派结果
   */
  async delegateTask(agentConfig, task, taskContext = {}) {
    const url = _fullUrl(agentConfig, agentConfig.taskPath || '/api/task');
    const headers = _buildAuthHeaders(agentConfig);
    const timeout = agentConfig.timeout || this.defaultTimeout;
    const maxRetries = agentConfig.maxRetries !== undefined ? agentConfig.maxRetries : this.defaultMaxRetries;

    const payload = {
      title: task.title || 'Untitled Task',
      description: task.description || task.content || '',
      context: {
        ...taskContext,
        ...task.context
      },
      priority: task.priority || 'normal',
      callback: task.callbackUrl || agentConfig.callbackUrl || '',
      metadata: {
        source: 'orchestra',
        timestamp: new Date().toISOString(),
        taskId: task.id || `task_${Date.now()}`
      }
    };

    if (this.verbose) {
      console.log(`[ExternalAgent] 委派任务 → ${url} [${payload.title}]`);
    }

    this.emit('task:delegating', { url, task: payload.title });

    try {
      const result = await _httpWithRetry(
        url,
        { method: 'POST', headers, body: payload, timeout },
        maxRetries,
        (err, attempt, delay) => this.emit('retry', { err, attempt, delay }),
        this.verbose
      );
      this.emit('task:delegated', { task: payload.title, response: result });
      if (this.verbose) console.log(`[ExternalAgent] 任务已委派 ← ${result.statusCode}`);
      return result;
    } catch (err) {
      this.emit('task:error', { task: payload.title, error: err.message });
      throw err;
    }
  }

  /**
   * 健康检查 — ping 外部 Agent
   * @param {Object} agentConfig - Agent 配置
   * @returns {Promise<Object>} { ok, latency, status }
   */
  async healthCheck(agentConfig) {
    const url = _fullUrl(agentConfig, agentConfig.healthPath || '/health');
    const headers = _buildAuthHeaders(agentConfig);
    const timeout = agentConfig.healthTimeout || 5000;

    const start = Date.now();
    try {
      const result = await _httpClient(url, { method: 'GET', headers, timeout });
      const latency = Date.now() - start;
      const ok = result.statusCode >= 200 && result.statusCode < 300;
      if (this.verbose) console.log(`[ExternalAgent] 健康检查 ${agentConfig.name || url}: ${ok ? 'OK' : 'FAIL'} (${latency}ms)`);
      return { ok, latency, statusCode: result.statusCode, body: result.body };
    } catch (err) {
      const latency = Date.now() - start;
      if (this.verbose) console.log(`[ExternalAgent] 健康检查 ${agentConfig.name || url}: FAIL (${err.message})`);
      return { ok: false, latency, error: err.message };
    }
  }

  /**
   * 批量健康检查
   * @param {Array<Object>} agentConfigs
   * @returns {Promise<Array<Object>>}
   */
  async healthCheckAll(agentConfigs) {
    const results = [];
    for (const config of agentConfigs) {
      try {
        const r = await this.healthCheck(config);
        results.push({ name: config.name || config.endpoint, ...r });
      } catch (err) {
        results.push({ name: config.name || config.endpoint, ok: false, error: err.message });
      }
    }
    return results;
  }
}

module.exports = ExternalAgentAdapter;

// ─── CLI 测试入口 ─────────────────────────────────────────

if (require.main === module) {
  const adapter = new ExternalAgentAdapter({ verbose: true });

  // 示例：健康检查
  const testConfig = {
    name: 'test-hermes',
    endpoint: 'http://localhost:4000',
    auth_type: 'none'
  };

  adapter.healthCheck(testConfig)
    .then(r => console.log('健康检查结果:', JSON.stringify(r, null, 2)))
    .catch(err => console.error('错误:', err.message));
}
