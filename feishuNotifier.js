#!/usr/bin/env node

/**
 * FeishuNotifier - 飞书消息推送器
 * 
 * 实现 Orchestra 状态变更的飞书消息推送
 * 支持：Agent 完成、Agent 失败、里程碑达成
 * 
 * 集成方式：
 *   stateManager.on('agent:complete', async (agent) => {
 *     await feishuNotifier.send({
 *       type: 'agent_complete',
 *       agent: agent,
 *       target: 'ou_xxx'
 *     });
 *   });
 */

const { notificationConfig } = require('./notificationConfig');

// 飞书 API 配置（通过环境变量获取）
const FEISHU_BOT_WEBHOOK = process.env.FEISHU_BOT_WEBHOOK || '';
const FEISHU_APP_ID = process.env.FEISHU_APP_ID || '';
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET || '';

/**
 * 计算耗时（毫秒 -> 可读格式）
 */
function formatDuration(ms) {
  if (!ms) return '0 分钟';
  
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  
  if (minutes > 0) {
    return `${minutes}分钟${seconds > 0 ? ` ${seconds}秒` : ''}`;
  }
  return `${seconds}秒`;
}

/**
 * 格式化 Token 数
 */
function formatTokenCount(count) {
  if (!count) return '0';
  return count.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * 飞书通知器
 */
class FeishuNotifier {
  constructor(options = {}) {
    this.config = options.config || notificationConfig;
    this.verbose = options.verbose || false;
    this.webhookUrl = options.webhookUrl || FEISHU_BOT_WEBHOOK;
    
    // 发送历史（用于聚合）
    this.pendingNotifications = [];
    this.aggregationTimer = null;
  }

  /**
   * 发送通知（主入口）
   */
  async send(options) {
    const { type, agent, target, skipConfigCheck = false } = options;
    
    // 检查配置开关
    if (!skipConfigCheck && !this.config.shouldNotify(this._mapType(type))) {
      if (this.verbose) {
        console.log('[FeishuNotifier] 通知已关闭，跳过发送');
      }
      return null;
    }
    
    // 构建消息
    const message = this._buildMessage(type, agent);
    if (!message) {
      console.error('[FeishuNotifier] 无法构建消息');
      return null;
    }
    
    // 确定接收人
    const targets = this._resolveTargets(target);
    if (targets.length === 0) {
      console.error('[FeishuNotifier] 没有指定接收人');
      return null;
    }
    
    // 发送消息
    const results = [];
    for (const t of targets) {
      try {
        const result = await this._sendMessage(t, message);
        results.push(result);
      } catch (err) {
        console.error(`[FeishuNotifier] 发送失败 (${t}):`, err.message);
        results.push({ success: false, error: err.message });
      }
    }
    
    return {
      success: results.some(r => r.success),
      results: results,
      message: message
    };
  }

  /**
   * 构建消息内容
   */
  _buildMessage(type, agent) {
    const agentName = agent?.name || 'Unknown Agent';
    const description = agent?.description || '无任务描述';
    const duration = agent?.startTime && agent?.endTime 
      ? formatDuration(agent.endTime - agent.startTime)
      : '未知';
    const tokenCount = formatTokenCount(agent?.progress?.tokenCount || 0);
    const error = agent?.error || '';
    
    let templateType;
    let text;
    
    switch (type) {
      case 'agent_complete':
      case 'agent:complete':
        templateType = 'agentComplete';
        text = this.config.renderTemplate(templateType, {
          agentName,
          description,
          duration,
          tokenCount
        });
        break;
        
      case 'agent_failed':
      case 'agent:failed':
        templateType = 'agentFailed';
        text = this.config.renderTemplate(templateType, {
          agentName,
          description,
          duration,
          error: error.substring(0, 200) // 限制错误长度
        });
        break;
        
      case 'milestone_reached':
        templateType = 'milestoneReached';
        text = this.config.renderTemplate(templateType, {
          agentName,
          description,
          milestone: agent?.result?.milestone || '未知里程碑'
        });
        break;
        
      default:
        console.error('[FeishuNotifier] 未知通知类型:', type);
        return null;
    }
    
    return {
      msg_type: 'text',
      content: {
        text: text
      }
    };
  }

  /**
   * 解析接收人
   */
  _resolveTargets(explicitTarget) {
    const targets = [];
    
    // 显式指定的目标
    if (explicitTarget) {
      if (Array.isArray(explicitTarget)) {
        targets.push(...explicitTarget);
      } else {
        targets.push(explicitTarget);
      }
    }
    
    // 配置中的目标
    if (targets.length === 0) {
      const configTargets = this.config.getTargets();
      targets.push(...configTargets.users);
      targets.push(...configTargets.chats);
    }
    
    return targets;
  }

  /**
   * 发送消息到飞书
   */
  async _sendMessage(targetId, message) {
    // 判断是个人还是群聊
    const isChat = targetId.startsWith('oc_');
    const receiveIdType = isChat ? 'chat_id' : 'open_id';
    
    if (this.verbose) {
      console.log(`[FeishuNotifier] 发送消息到 ${receiveIdType}: ${targetId}`);
    }
    
    // 如果有 webhook，使用 webhook 发送
    if (this.webhookUrl) {
      return await this._sendViaWebhook(targetId, message, receiveIdType);
    }
    
    // 否则使用飞书 API（需要 feishu-im-user-message 工具）
    // 这里返回一个模拟结果，实际使用时需要集成飞书 API
    console.log('[FeishuNotifier] 使用飞书 API 发送（需要配置 feishu-im-user-message）');
    
    // 注意：在实际集成中，这里应该调用 feishu-im-user-message 工具
    // 由于这是在 Orchestra 内部，我们通过事件通知主系统
    return this._sendViaEvent(targetId, receiveIdType, message);
  }

  /**
   * 通过 Webhook 发送（机器人）
   */
  async _sendViaWebhook(targetId, message, receiveIdType) {
    const https = require('https');
    
    // 飞书群机器人 Webhook 直接发送，不需要指定接收人
    // 如果需要指定接收人，需要使用应用 API
    const payload = {
      msg_type: message.msg_type,
      content: message.content,
      receive_id: targetId,
      receive_id_type: receiveIdType
    };
    
    return new Promise((resolve, reject) => {
      const url = new URL(this.webhookUrl);
      const options = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      };
      
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            resolve({
              success: result.StatusCode === 0 || result.code === 0,
              response: result
            });
          } catch (err) {
            resolve({
              success: res.statusCode === 200,
              response: data
            });
          }
        });
      });
      
      req.on('error', reject);
      req.write(JSON.stringify(payload));
      req.end();
    });
  }

  /**
   * 通过事件发送（集成到 OpenClaw 消息系统）
   */
  async _sendViaEvent(targetId, receiveIdType, message) {
    // 发送一个事件，让主系统处理
    // 在实际使用中，Orchestra 应该监听这个事件并调用 feishu-im-user-message
    const event = {
      type: 'feishu:send',
      target: targetId,
      receiveIdType: receiveIdType,
      message: message,
      timestamp: Date.now()
    };
    
    // 触发事件
    if (typeof process !== 'undefined' && process.emit) {
      process.emit('feishu:message', event);
    }
    
    return {
      success: true,
      event: event
    };
  }

  /**
   * 映射通知类型
   */
  _mapType(type) {
    const mapping = {
      'agent_complete': 'agentComplete',
      'agent:complete': 'agentComplete',
      'agent_failed': 'agentFailed',
      'agent:failed': 'agentFailed',
      'milestone_reached': 'milestoneReached'
    };
    return mapping[type] || type;
  }

  /**
   * 批量发送（聚合模式）
   */
  async sendBatch(notifications) {
    if (!this.config.get('advanced.aggregation.enabled')) {
      // 未启用聚合，逐个发送
      const results = [];
      for (const n of notifications) {
        results.push(await this.send(n));
      }
      return results;
    }
    
    // 启用聚合，收集通知
    this.pendingNotifications.push(...notifications);
    
    // 重置定时器
    if (this.aggregationTimer) {
      clearTimeout(this.aggregationTimer);
    }
    
    const windowMs = this.config.get('advanced.aggregation.windowMs') || 60000;
    
    return new Promise((resolve) => {
      this.aggregationTimer = setTimeout(async () => {
        // 聚合发送
        const batch = [...this.pendingNotifications];
        this.pendingNotifications = [];
        
        // 合并为一条消息
        const summary = this._aggregateNotifications(batch);
        const result = await this.send({
          type: 'agent_complete',
          agent: {
            name: 'Orchestra 批量任务',
            description: summary,
            startTime: Date.now() - 60000,
            endTime: Date.now(),
            progress: { tokenCount: 0 }
          }
        });
        
        resolve([result]);
      }, windowMs);
    });
  }

  /**
   * 聚合多条通知为一条摘要
   */
  _aggregateNotifications(notifications) {
    const completed = notifications.filter(n => 
      n.type === 'agent_complete' || n.type === 'agent:complete'
    );
    const failed = notifications.filter(n => 
      n.type === 'agent_failed' || n.type === 'agent:failed'
    );
    
    let summary = `📊 批量任务完成通知\n\n`;
    summary += `✅ 成功：${completed.length} 个\n`;
    summary += `❌ 失败：${failed.length} 个\n\n`;
    
    if (completed.length > 0) {
      summary += `成功任务:\n`;
      completed.forEach(n => {
        summary += `  • ${n.agent?.name || 'Unknown'}\n`;
      });
    }
    
    if (failed.length > 0) {
      summary += `\n失败任务:\n`;
      failed.forEach(n => {
        summary += `  • ${n.agent?.name || 'Unknown'}: ${n.agent?.error || '未知错误'}\n`;
      });
    }
    
    return summary;
  }
}

// 导出单例
const feishuNotifier = new FeishuNotifier({ verbose: true });

module.exports = {
  FeishuNotifier,
  feishuNotifier,
  formatDuration,
  formatTokenCount
};

// CLI 测试
if (require.main === module) {
  console.log('=== 飞书通知器测试 ===\n');
  
  // 测试 1: 发送完成通知
  console.log('1. 测试 Agent 完成通知');
  feishuNotifier.send({
    type: 'agent_complete',
    agent: {
      name: 'AI CTO',
      description: '开发监控 Dashboard',
      startTime: Date.now() - 300000, // 5 分钟前
      endTime: Date.now(),
      progress: {
        tokenCount: 12345
      }
    },
    target: 'ou_test123'
  }).then(result => {
    console.log('发送结果:', result);
  });
  
  // 测试 2: 发送失败通知
  console.log('\n2. 测试 Agent 失败通知');
  feishuNotifier.send({
    type: 'agent_failed',
    agent: {
      name: 'AI 策划',
      description: '设计战斗系统',
      startTime: Date.now() - 600000,
      endTime: Date.now(),
      error: '文件不存在：combat.js'
    },
    target: 'ou_test123'
  }).then(result => {
    console.log('发送结果:', result);
  });
  
  console.log('\n提示：实际发送需要配置 FEISHU_BOT_WEBHOOK 环境变量');
}
