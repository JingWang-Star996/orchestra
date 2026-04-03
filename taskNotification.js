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
 * 任务通知管理器（P1 增强版 - 支持持久化）
 */
class TaskNotificationManager {
  constructor(options = {}) {
    this.notifications = new Map();
    this.listeners = new Map();
    this.verbose = options.verbose || false;
    
    // P1 新增：持久化支持
    this.storage = options.storage || 'memory'; // 'memory' | 'file'
    this.storagePath = options.storagePath || './temp/notifications';
    this.maxHistorySize = options.maxHistorySize || 1000; // 最多保留 1000 条
    
    if (this.storage === 'file') {
      this._initializeStorage();
    }
  }

  /**
   * 初始化存储（P1 新增）
   */
  _initializeStorage() {
    const fs = require('fs');
    const path = require('path');
    
    // 创建存储目录
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
      console.log(`[TaskNotification] 创建存储目录：${this.storagePath}`);
    }
    
    // 加载已有通知
    const indexPath = path.join(this.storagePath, 'index.json');
    if (fs.existsSync(indexPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
        for (const n of data) {
          this.notifications.set(n.taskId, n);
        }
        console.log(`[TaskNotification] 加载 ${data.length} 条历史通知`);
      } catch (err) {
        console.error(`[TaskNotification] 加载历史失败：${err.message}`);
      }
    }
  }

  /**
   * 持久化通知（P1 新增）
   */
  async _persistNotification(notification) {
    if (this.storage !== 'file') return;
    
    const fs = require('fs').promises;
    const path = require('path');
    
    try {
      // 保存单个通知（按 taskId 命名）
      const filePath = path.join(this.storagePath, `${notification.taskId}.json`);
      await fs.writeFile(filePath, JSON.stringify(notification, null, 2), 'utf-8');
      
      // 更新索引
      await this._updateIndex();
      
      // 修剪历史记录
      await this._trimHistory();
      
      if (this.verbose) {
        console.log(`[TaskNotification] 持久化通知：${notification.taskId}`);
      }
    } catch (err) {
      console.error(`[TaskNotification] 持久化失败：${err.message}`);
    }
  }
  
  /**
   * 更新索引文件（P1 新增）
   */
  async _updateIndex() {
    const fs = require('fs').promises;
    const path = require('path');
    
    const index = Array.from(this.notifications.values())
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    const indexPath = path.join(this.storagePath, 'index.json');
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  }
  
  /**
   * 修剪历史记录（P1 新增）
   */
  async _trimHistory() {
    if (this.notifications.size <= this.maxHistorySize) return;
    
    const fs = require('fs').promises;
    const path = require('path');
    
    // 按时间排序，删除最旧的
    const sorted = Array.from(this.notifications.entries())
      .sort((a, b) => new Date(a[1].timestamp) - new Date(b[1].timestamp));
    
    const toDelete = sorted.slice(0, sorted.length - this.maxHistorySize);
    
    for (const [taskId] of toDelete) {
      this.notifications.delete(taskId);
      const filePath = path.join(this.storagePath, `${taskId}.json`);
      try {
        await fs.unlink(filePath);
      } catch (err) {
        // 忽略文件不存在的情况
      }
    }
    
    console.log(`[TaskNotification] 修剪历史，删除 ${toDelete.length} 条旧记录`);
  }

  /**
   * 发送通知（P1 增强 - 支持持久化）
   */
  async send(notification) {
    if (this.verbose) {
      console.log(`[TaskNotification] 发送通知：${notification.taskId} (${notification.status})`);
    }
    
    this.notifications.set(notification.taskId, notification);
    this._notifyListeners(notification);
    
    // P1 新增：持久化
    if (this.storage === 'file') {
      await this._persistNotification(notification);
    }
    
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
   * 获取通知历史（P1 增强 - 支持分页）
   */
  getHistory(taskId, options = {}) {
    const { limit = 100, offset = 0, status = null } = options;
    
    if (taskId) {
      return this.notifications.get(taskId);
    }
    
    let all = Array.from(this.notifications.values());
    
    // 按状态过滤
    if (status) {
      all = all.filter(n => n.status === status);
    }
    
    // 按时间排序（最新在前）
    all.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // 分页
    return all.slice(offset, offset + limit);
  }

  /**
   * 搜索通知（P1 新增）
   */
  search(query, options = {}) {
    const { status = null, startTime = null, endTime = null, limit = 100 } = options;
    
    let results = Array.from(this.notifications.values());
    
    // 按状态过滤
    if (status) {
      results = results.filter(n => n.status === status);
    }
    
    // 按时间过滤
    if (startTime) {
      results = results.filter(n => new Date(n.timestamp) >= new Date(startTime));
    }
    if (endTime) {
      results = results.filter(n => new Date(n.timestamp) <= new Date(endTime));
    }
    
    // 按关键词搜索（summary/result/taskId）
    if (query) {
      const q = query.toLowerCase();
      results = results.filter(n => 
        n.taskId.toLowerCase().includes(q) ||
        n.summary.toLowerCase().includes(q) ||
        (n.result && n.result.toLowerCase().includes(q))
      );
    }
    
    // 按时间排序（最新在前）
    results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return results.slice(0, limit);
  }
  
  /**
   * 获取统计信息（P1 新增）
   */
  getStatistics() {
    const all = Array.from(this.notifications.values());
    
    return {
      total: all.length,
      byStatus: {
        completed: all.filter(n => n.status === 'completed').length,
        failed: all.filter(n => n.status === 'failed').length,
        killed: all.filter(n => n.status === 'killed').length
      },
      avgTokens: all.length > 0 ? Math.round(all.reduce((sum, n) => sum + (n.usage?.totalTokens || 0), 0) / all.length) : 0,
      avgDuration: all.length > 0 ? Math.round(all.reduce((sum, n) => sum + (n.usage?.durationMs || 0), 0) / all.length) : 0,
      storage: this.storage,
      storagePath: this.storagePath
    };
  }
  
  /**
   * 清空历史（P1 新增）
   */
  async clear() {
    const fs = require('fs').promises;
    const path = require('path');
    
    this.notifications.clear();
    
    if (this.storage === 'file') {
      try {
        const files = await fs.readdir(this.storagePath);
        for (const file of files) {
          if (file.endsWith('.json')) {
            await fs.unlink(path.join(this.storagePath, file));
          }
        }
        console.log(`[TaskNotification] 已清空所有历史记录`);
      } catch (err) {
        console.error(`[TaskNotification] 清空失败：${err.message}`);
      }
    }
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
