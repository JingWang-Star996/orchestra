#!/usr/bin/env node

/**
 * TaskNotification - 任务通知系统（Phase 1 核心功能）
 * 
 * 职责：实现结构化的任务通知机制，类似 Claude Code 的 XML 格式
 * 
 * 灵感来源：Claude Code Coordinator 的 `<task-notification>` XML 格式
 */

/**
 * 创建任务通知（JSON 格式，参考 Claude Code XML 格式）
 * @param {Object} options - 通知配置
 * @returns {Object} 任务通知对象
 */
function createTaskNotification(options) {
  const {
    taskId,
    status,
    summary,
    result,
    usage
  } = options;
  
  // 验证必填字段
  if (!taskId) {
    throw new Error('taskId 是必填字段');
  }
  
  if (!status || !['completed', 'failed', 'killed'].includes(status)) {
    throw new Error('status 必须是 completed|failed|killed');
  }
  
  return {
    type: 'task-notification',
    taskId: taskId,
    status: status,
    summary: summary || '',
    result: result || '',
    usage: {
      totalTokens: usage?.totalTokens || 0,
      toolUses: usage?.toolUses || 0,
      durationMs: usage?.durationMs || 0
    },
    timestamp: new Date().toISOString()
  };
}

/**
 * 将通知转换为 XML 格式（兼容 Claude Code）
 * @param {Object} notification - 通知对象
 * @returns {string} XML 字符串
 */
function toXML(notification) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<task-notification>
  <task-id>${escapeXML(notification.taskId)}</task-id>
  <status>${escapeXML(notification.status)}</status>
  <summary>${escapeXML(notification.summary)}</summary>
  <result>${escapeXML(notification.result)}</result>
  <usage>
    <total_tokens>${notification.usage.totalTokens}</total_tokens>
    <tool_uses>${notification.usage.toolUses}</tool_uses>
    <duration_ms>${notification.usage.durationMs}</duration_ms>
  </usage>
  <timestamp>${escapeXML(notification.timestamp)}</timestamp>
</task-notification>`;
}

/**
 * XML 转义
 */
function escapeXML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * 从 XML 解析通知
 * @param {string} xml - XML 字符串
 * @returns {Object} 通知对象
 */
function fromXML(xml) {
  // 简单 XML 解析（生产环境应使用 XML 解析库）
  const matchId = xml.match(/<task-id>(.*?)<\/task-id>/);
  const matchStatus = xml.match(/<status>(.*?)<\/status>/);
  const matchSummary = xml.match(/<summary>(.*?)<\/summary>/);
  const matchResult = xml.match(/<result>(.*?)<\/result>/);
  const matchTokens = xml.match(/<total_tokens>(.*?)<\/total_tokens>/);
  const matchTools = xml.match(/<tool_uses>(.*?)<\/tool_uses>/);
  const matchDuration = xml.match(/<duration_ms>(.*?)<\/duration_ms>/);
  const matchTimestamp = xml.match(/<timestamp>(.*?)<\/timestamp>/);
  
  return {
    type: 'task-notification',
    taskId: matchId ? matchId[1] : '',
    status: matchStatus ? matchStatus[1] : '',
    summary: matchSummary ? matchSummary[1] : '',
    result: matchResult ? matchResult[1] : '',
    usage: {
      totalTokens: matchTokens ? parseInt(matchTokens[1]) : 0,
      toolUses: matchTools ? parseInt(matchTools[1]) : 0,
      durationMs: matchDuration ? parseInt(matchDuration[1]) : 0
    },
    timestamp: matchTimestamp ? matchTimestamp[1] : ''
  };
}

/**
 * 任务通知管理器
 */
class TaskNotificationManager {
  constructor(options = {}) {
    this.notifications = new Map();
    this.listeners = new Map();
    this.verbose = options.verbose || false;
  }

  /**
   * 发送通知
   */
  send(notification) {
    if (this.verbose) {
      console.log(`[TaskNotification] 发送通知：${notification.taskId} (${notification.status})`);
    }
    
    this.notifications.set(notification.taskId, notification);
    this._notifyListeners(notification);
    
    return notification;
  }

  /**
   * 注册监听器
   */
  on(status, callback) {
    if (!this.listeners.has(status)) {
      this.listeners.set(status, []);
    }
    this.listeners.get(status).push(callback);
  }

  /**
   * 通知监听器
   */
  _notifyListeners(notification) {
    const callbacks = this.listeners.get(notification.status) || [];
    for (const callback of callbacks) {
      try {
        callback(notification);
      } catch (err) {
        console.error(`[TaskNotification] 监听器错误:`, err.message);
      }
    }
  }

  /**
   * 获取通知历史
   */
  getHistory(taskId) {
    if (taskId) {
      return this.notifications.get(taskId);
    }
    return Array.from(this.notifications.values());
  }

  /**
   * 导出为 JSON
   */
  exportJSON() {
    return JSON.stringify(Array.from(this.notifications.values()), null, 2);
  }

  /**
   * 导出为 XML
   */
  exportXML() {
    const notifications = Array.from(this.notifications.values());
    return `<?xml version="1.0" encoding="UTF-8"?>
<task-notifications>
${notifications.map(n => toXML(n)).join('\n')}
</task-notifications>`;
  }
}

// 导出
module.exports = {
  createTaskNotification,
  toXML,
  fromXML,
  TaskNotificationManager
};

// CLI 入口
if (require.main === module) {
  const { createTaskNotification, toXML, fromXML, TaskNotificationManager } = require('./taskNotification');
  
  console.log('=== 任务通知系统测试 ===\n');
  
  // 测试 1: 创建通知
  console.log('1. 创建通知（JSON 格式）');
  const notification = createTaskNotification({
    taskId: 'agent-x7q',
    status: 'completed',
    summary: '研究完成，发现 3 个关键文件',
    result: '找到 auth.js, user.js, session.js',
    usage: {
      totalTokens: 1234,
      toolUses: 5,
      durationMs: 5000
    }
  });
  console.log(JSON.stringify(notification, null, 2));
  
  // 测试 2: 转换为 XML
  console.log('\n2. 转换为 XML 格式');
  const xml = toXML(notification);
  console.log(xml);
  
  // 测试 3: 从 XML 解析
  console.log('\n3. 从 XML 解析');
  const parsed = fromXML(xml);
  console.log(JSON.stringify(parsed, null, 2));
  
  // 测试 4: 通知管理器
  console.log('\n4. 通知管理器测试');
  const manager = new TaskNotificationManager({ verbose: true });
  
  manager.on('completed', (n) => {
    console.log(`  ✅ 收到完成通知：${n.taskId}`);
  });
  
  manager.on('failed', (n) => {
    console.log(`  ❌ 收到失败通知：${n.taskId}`);
  });
  
  manager.send(createTaskNotification({
    taskId: 'task-1',
    status: 'completed',
    summary: '任务 1 完成'
  }));
  
  manager.send(createTaskNotification({
    taskId: 'task-2',
    status: 'failed',
    summary: '任务 2 失败',
    result: '错误：文件不存在'
  }));
  
  console.log('\n5. 通知历史');
  console.log(manager.exportJSON());
}
