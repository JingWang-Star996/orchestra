#!/usr/bin/env node

/**
 * ToolTracker - 工具调用追踪器
 * 
 * 职责：记录所有工具调用的详细信息，支持调试和性能分析
 * 功能：
 * - 记录工具调用输入/输出
 * - 计算调用耗时
 * - 性能瓶颈分析
 * - 错误堆栈追踪
 * - 工具调用时间线
 */

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

class ToolTracker extends EventEmitter {
  constructor(options = {}) {
    super();
    this.records = [];
    this.activeCalls = new Map(); // 记录进行中的调用
    this.config = {
      maxRecords: options.maxRecords || 10000, // 最大记录数
      verbose: options.verbose || false,
      logToFile: options.logToFile || false,
      logPath: options.logPath || './logs/tool-trace.json',
      performanceThreshold: options.performanceThreshold || 1000, // 性能阈值 (ms)
      ...options
    };
    
    // 统计信息
    this.stats = {
      totalCalls: 0,
      totalDuration: 0,
      errorCount: 0,
      toolStats: new Map() // 按工具名统计
    };
  }

  /**
   * 开始记录一次工具调用
   * @param {string} toolName - 工具名称
   * @param {string} description - 工具描述
   * @param {object} input - 输入参数
   * @returns {string} callId - 调用 ID
   */
  startCall(toolName, description = '', input = {}) {
    const callId = `${toolName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    const record = {
      callId,
      toolName,
      description,
      input: this._sanitizeInput(input),
      startTime,
      timestamp: new Date().toISOString(),
      status: 'in_progress',
      stack: this.config.verbose ? new Error().stack : undefined
    };
    
    this.activeCalls.set(callId, record);
    this.records.push(record);
    
    // 触发事件
    this.emit('call:start', record);
    
    if (this.config.verbose) {
      console.log(`[ToolTracker] 开始调用 ${toolName}: ${description || '无描述'}`);
    }
    
    return callId;
  }

  /**
   * 结束一次工具调用
   * @param {string} callId - 调用 ID
   * @param {object} output - 输出结果
   * @param {error} error - 错误对象（可选）
   */
  endCall(callId, output = {}, error = null) {
    const record = this.activeCalls.get(callId);
    
    if (!record) {
      console.warn(`[ToolTracker] 未找到调用记录：${callId}`);
      return;
    }
    
    const endTime = Date.now();
    const duration = endTime - record.startTime;
    
    record.endTime = endTime;
    record.duration = duration;
    record.status = error ? 'error' : 'completed';
    record.output = this._sanitizeOutput(output);
    
    if (error) {
      record.error = {
        message: error.message,
        name: error.name,
        stack: error.stack
      };
      this.stats.errorCount++;
    }
    
    // 更新统计
    this.stats.totalCalls++;
    this.stats.totalDuration += duration;
    
    // 按工具名统计
    if (!this.stats.toolStats.has(record.toolName)) {
      this.stats.toolStats.set(record.toolName, {
        count: 0,
        totalDuration: 0,
        errorCount: 0,
        maxDuration: 0
      });
    }
    const toolStat = this.stats.toolStats.get(record.toolName);
    toolStat.count++;
    toolStat.totalDuration += duration;
    if (error) toolStat.errorCount++;
    if (duration > toolStat.maxDuration) toolStat.maxDuration = duration;
    
    // 检查性能瓶颈
    if (duration > this.config.performanceThreshold) {
      record.performanceWarning = true;
      this.emit('performance:warning', {
        callId,
        toolName: record.toolName,
        duration,
        threshold: this.config.performanceThreshold
      });
    }
    
    // 触发事件
    this.emit('call:end', record);
    
    // 从活跃调用中移除
    this.activeCalls.delete(callId);
    
    // 清理旧记录
    if (this.records.length > this.config.maxRecords) {
      this.records.splice(0, this.records.length - this.config.maxRecords);
    }
    
    // 写入日志文件
    if (this.config.logToFile) {
      this._writeToFile();
    }
    
    if (this.config.verbose) {
      console.log(`[ToolTracker] 结束调用 ${record.toolName}: ${duration}ms ${error ? '❌' : '✅'}`);
    }
  }

  /**
   * 包装一个工具调用（自动记录开始和结束）
   * @param {string} toolName - 工具名称
   * @param {Function} toolFn - 工具函数
   * @param {string} description - 描述
   * @returns {Function} 包装后的函数
   */
  wrap(toolName, toolFn, description = '') {
    const self = this;
    
    return async function(...args) {
      const callId = self.startCall(toolName, description, { args });
      
      try {
        const result = await toolFn(...args);
        self.endCall(callId, { result });
        return result;
      } catch (error) {
        self.endCall(callId, {}, error);
        throw error;
      }
    };
  }

  /**
   * 获取调用时间线
   * @returns {Array} 时间线数据
   */
  getTimeline() {
    return this.records
      .filter(r => r.status !== 'in_progress')
      .sort((a, b) => a.startTime - b.startTime)
      .map(r => ({
        callId: r.callId,
        toolName: r.toolName,
        description: r.description,
        startTime: r.timestamp,
        duration: r.duration,
        status: r.status,
        hasError: !!r.error,
        isSlow: r.performanceWarning
      }));
  }

  /**
   * 获取性能分析报告
   * @returns {object} 性能报告
   */
  getPerformanceReport() {
    const toolReports = [];
    
    for (const [toolName, stats] of this.stats.toolStats.entries()) {
      toolReports.push({
        toolName,
        callCount: stats.count,
        avgDuration: Math.round(stats.totalDuration / stats.count),
        maxDuration: stats.maxDuration,
        errorRate: Math.round((stats.errorCount / stats.count) * 10000) / 100,
        totalDuration: stats.totalDuration
      });
    }
    
    // 按平均耗时排序
    toolReports.sort((a, b) => b.avgDuration - a.avgDuration);
    
    // 识别性能瓶颈
    const bottlenecks = toolReports.filter(r => r.avgDuration > this.config.performanceThreshold);
    
    return {
      summary: {
        totalCalls: this.stats.totalCalls,
        totalDuration: this.stats.totalDuration,
        avgDuration: Math.round(this.stats.totalDuration / (this.stats.totalCalls || 1)),
        errorCount: this.stats.errorCount,
        errorRate: Math.round((this.stats.errorCount / (this.stats.totalCalls || 1)) * 10000) / 100,
        activeCalls: this.activeCalls.size
      },
      toolStats: toolReports,
      bottlenecks,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 获取错误堆栈追踪
   * @returns {Array} 错误记录列表
   */
  getErrorTraces() {
    return this.records
      .filter(r => r.status === 'error' && r.error)
      .map(r => ({
        callId: r.callId,
        toolName: r.toolName,
        description: r.description,
        timestamp: r.timestamp,
        error: {
          message: r.error.message,
          name: r.error.name,
          stack: r.error.stack
        },
        input: r.input
      }))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  /**
   * 获取最近的调用记录
   * @param {number} limit - 数量限制
   * @returns {Array} 调用记录
   */
  getRecentCalls(limit = 10) {
    return this.records
      .filter(r => r.status !== 'in_progress')
      .slice(-limit)
      .reverse()
      .map(r => ({
        callId: r.callId,
        toolName: r.toolName,
        description: r.description,
        timestamp: r.timestamp,
        duration: r.duration,
        status: r.status,
        hasError: !!r.error
      }));
  }

  /**
   * 按工具名筛选记录
   * @param {string} toolName - 工具名称
   * @returns {Array} 调用记录
   */
  getByTool(toolName) {
    return this.records.filter(r => r.toolName === toolName);
  }

  /**
   * 导出记录为 JSON
   * @returns {string} JSON 字符串
   */
  exportJSON() {
    return JSON.stringify({
      records: this.records,
      stats: this.getPerformanceReport(),
      exportedAt: new Date().toISOString()
    }, null, 2);
  }

  /**
   * 清空所有记录
   */
  clear() {
    this.records = [];
    this.activeCalls.clear();
    this.stats = {
      totalCalls: 0,
      totalDuration: 0,
      errorCount: 0,
      toolStats: new Map()
    };
    this.emit('clear');
  }

  /**
   * 清理输入数据（移除敏感信息）
   * @private
   */
  _sanitizeInput(input) {
    // 深度克隆避免修改原对象
    const sanitized = JSON.parse(JSON.stringify(input));
    
    // 移除可能的敏感字段
    const sensitiveKeys = ['password', 'secret', 'token', 'apiKey', 'auth'];
    this._removeSensitiveFields(sanitized, sensitiveKeys);
    
    return sanitized;
  }

  /**
   * 清理输出数据
   * @private
   */
  _sanitizeOutput(output) {
    try {
      return JSON.parse(JSON.stringify(output));
    } catch (e) {
      return { _type: typeof output, _value: String(output) };
    }
  }

  /**
   * 递归移除敏感字段
   * @private
   */
  _removeSensitiveFields(obj, keys) {
    if (typeof obj !== 'object' || obj === null) return;
    
    for (const key of Object.keys(obj)) {
      if (keys.some(s => key.toLowerCase().includes(s.toLowerCase()))) {
        obj[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object') {
        this._removeSensitiveFields(obj[key], keys);
      }
    }
  }

  /**
   * 写入日志文件
   * @private
   */
  _writeToFile() {
    try {
      const logDir = path.dirname(this.config.logPath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      
      fs.writeFileSync(
        this.config.logPath,
        this.exportJSON(),
        'utf8'
      );
    } catch (err) {
      console.error('[ToolTracker] 写入日志失败:', err);
    }
  }

  /**
   * 生成人类可读的调用摘要
   * @returns {string} 摘要文本
   */
  generateSummary() {
    const report = this.getPerformanceReport();
    
    let text = `🔧 工具调用追踪报告\n\n`;
    text += `**总体统计**:\n`;
    text += `- 总调用次数：${report.summary.totalCalls}\n`;
    text += `- 总耗时：${report.summary.totalDuration}ms\n`;
    text += `- 平均耗时：${report.summary.avgDuration}ms\n`;
    text += `- 错误率：${report.summary.errorRate}%\n`;
    text += `- 活跃调用：${report.summary.activeCalls}\n\n`;
    
    if (report.bottlenecks.length > 0) {
      text += `⚠️ **性能瓶颈**:\n`;
      report.bottlenecks.forEach(b => {
        text += `- ${b.toolName}: 平均 ${b.avgDuration}ms (${b.callCount}次)\n`;
      });
      text += `\n`;
    }
    
    text += `**工具排行** (按平均耗时):\n`;
    report.toolStats.slice(0, 5).forEach((t, i) => {
      const icon = t.errorRate > 0 ? '❌' : (t.avgDuration > this.config.performanceThreshold ? '⚠️' : '✅');
      text += `${i + 1}. ${icon} ${t.toolName}: ${t.avgDuration}ms (${t.callCount}次, 错误率 ${t.errorRate}%)\n`;
    });
    
    return text;
  }
}

// 导出单例
const globalTracker = new ToolTracker({ verbose: false });

module.exports = {
  ToolTracker,
  globalTracker,
  createTracker: (options) => new ToolTracker(options)
};

// CLI 入口 - 测试模式
if (require.main === module) {
  console.log('=== ToolTracker 测试模式 ===\n');
  
  const tracker = new ToolTracker({ 
    verbose: true,
    performanceThreshold: 100
  });
  
  // 注册事件监听
  tracker.on('call:start', (record) => {
    console.log(`  → 开始：${record.toolName}`);
  });
  
  tracker.on('call:end', (record) => {
    console.log(`  ← 结束：${record.toolName} (${record.duration}ms)`);
  });
  
  tracker.on('performance:warning', (data) => {
    console.log(`  ⚠️ 性能警告：${data.toolName} 耗时 ${data.duration}ms`);
  });
  
  // 模拟工具调用
  async function simulateTool(name, duration, shouldError = false) {
    const callId = tracker.startCall(name, `模拟${name}操作`, { test: true });
    
    await new Promise(resolve => setTimeout(resolve, duration));
    
    if (shouldError) {
      tracker.endCall(callId, {}, new Error(`${name} 执行失败`));
    } else {
      tracker.endCall(callId, { success: true });
    }
  }
  
  // 运行测试
  (async () => {
    await simulateTool('read', 50);
    await simulateTool('write', 120); // 触发性能警告
    await simulateTool('exec', 80);
    await simulateTool('read', 30);
    await simulateTool('web_search', 200, true); // 模拟错误
    
    console.log('\n=== 性能报告 ===');
    console.log(tracker.generateSummary());
    
    console.log('\n=== 错误追踪 ===');
    const errors = tracker.getErrorTraces();
    errors.forEach(e => {
      console.log(`- ${e.toolName}: ${e.error.message}`);
    });
    
    console.log('\n=== 时间线 ===');
    const timeline = tracker.getTimeline();
    timeline.forEach(t => {
      console.log(`- ${t.toolName}: ${t.duration}ms ${t.status}`);
    });
  })();
}
