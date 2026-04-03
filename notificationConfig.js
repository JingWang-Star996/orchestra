#!/usr/bin/env node

/**
 * NotificationConfig - 飞书通知配置
 * 
 * 提供通知开关、接收人配置、消息模板等功能
 */

const path = require('path');
const fs = require('fs');

// 配置文件路径
const CONFIG_FILE = path.join(__dirname, 'temp/notification-config.json');

/**
 * 默认配置
 */
const DEFAULT_CONFIG = {
  // 通知总开关
  enabled: true,
  
  // 通知类型开关
  types: {
    agentComplete: true,    // Agent 完成
    agentFailed: true,      // Agent 失败
    milestoneReached: false // 里程碑达成（默认关闭，避免骚扰）
  },
  
  // 接收人配置
  targets: {
    // 个人推送（open_id 格式：ou_xxx）
    users: [],
    
    // 群聊推送（chat_id 格式：oc_xxx）
    chats: []
  },
  
  // 消息模板
  templates: {
    agentComplete: `✅ {agentName} 完成！
📝 任务：{description}
⏱️ 耗时：{duration}
💰 Token: {tokenCount}
📊 状态：completed`,
    
    agentFailed: `❌ {agentName} 失败！
📝 任务：{description}
⏱️ 耗时：{duration}
🔥 错误：{error}
📊 状态：failed`,
    
    milestoneReached: `🎯 里程碑达成！
📝 任务：{description}
🚀 进度：{milestone}
📊 状态：in_progress`
  },
  
  // 高级配置
  advanced: {
    // 静默时段（避免深夜打扰）22:00-08:00
    quietHours: {
      enabled: false,
      start: 22,  // 22:00
      end: 8      // 08:00
    },
    
    // 聚合推送（多个完成消息合并为一条）
    aggregation: {
      enabled: false,
      windowMs: 60000  // 1 分钟窗口
    },
    
    // 重试配置
    retry: {
      maxAttempts: 3,
      delayMs: 1000
    }
  }
};

/**
 * 通知配置管理器
 */
class NotificationConfigManager {
  constructor(options = {}) {
    this.config = { ...DEFAULT_CONFIG };
    this.configFile = options.configFile || CONFIG_FILE;
    this.verbose = options.verbose || false;
    
    // 加载配置
    this.load();
  }

  /**
   * 加载配置
   */
  load() {
    try {
      if (fs.existsSync(this.configFile)) {
        const data = JSON.parse(fs.readFileSync(this.configFile, 'utf-8'));
        this.config = { ...DEFAULT_CONFIG, ...data };
        if (this.verbose) {
          console.log('[NotificationConfig] 加载配置成功');
        }
      } else {
        // 保存默认配置
        this.save();
      }
    } catch (err) {
      console.error('[NotificationConfig] 加载配置失败:', err.message);
    }
  }

  /**
   * 保存配置
   */
  save() {
    try {
      const dir = path.dirname(this.configFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2), 'utf-8');
      if (this.verbose) {
        console.log('[NotificationConfig] 保存配置成功');
      }
    } catch (err) {
      console.error('[NotificationConfig] 保存配置失败:', err.message);
    }
  }

  /**
   * 获取配置
   */
  get(key) {
    if (!key) return this.config;
    
    const keys = key.split('.');
    let value = this.config;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  /**
   * 设置配置
   */
  set(key, value) {
    const keys = key.split('.');
    let obj = this.config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in obj) || typeof obj[k] !== 'object') {
        obj[k] = {};
      }
      obj = obj[k];
    }
    
    obj[keys[keys.length - 1]] = value;
    this.save();
  }

  /**
   * 检查是否应该发送通知
   */
  shouldNotify(type) {
    // 检查总开关
    if (!this.config.enabled) {
      return false;
    }
    
    // 检查类型开关
    if (!this.config.types[type]) {
      return false;
    }
    
    // 检查静默时段
    if (this.config.advanced.quietHours.enabled) {
      const hour = new Date().getHours();
      const { start, end } = this.config.advanced.quietHours;
      
      if (start > end) {
        // 跨天时段（如 22:00-08:00）
        if (hour >= start || hour < end) {
          return false;
        }
      } else {
        // 同一天时段
        if (hour >= start && hour < end) {
          return false;
        }
      }
    }
    
    // 检查是否有接收人
    const hasUsers = this.config.targets.users && this.config.targets.users.length > 0;
    const hasChats = this.config.targets.chats && this.config.targets.chats.length > 0;
    
    if (!hasUsers && !hasChats) {
      return false;
    }
    
    return true;
  }

  /**
   * 获取接收人列表
   */
  getTargets() {
    return {
      users: this.config.targets.users || [],
      chats: this.config.targets.chats || []
    };
  }

  /**
   * 添加接收人
   */
  addTarget(type, id) {
    if (!['users', 'chats'].includes(type)) {
      throw new Error('类型必须是 users 或 chats');
    }
    
    if (!this.config.targets[type].includes(id)) {
      this.config.targets[type].push(id);
      this.save();
    }
  }

  /**
   * 移除接收人
   */
  removeTarget(type, id) {
    if (!['users', 'chats'].includes(type)) {
      throw new Error('类型必须是 users 或 chats');
    }
    
    const index = this.config.targets[type].indexOf(id);
    if (index > -1) {
      this.config.targets[type].splice(index, 1);
      this.save();
    }
  }

  /**
   * 渲染消息模板
   */
  renderTemplate(type, variables) {
    const template = this.config.templates[type];
    if (!template) {
      throw new Error(`模板不存在：${type}`);
    }
    
    let message = template;
    for (const [key, value] of Object.entries(variables)) {
      message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    
    return message;
  }

  /**
   * 重置为默认配置
   */
  reset() {
    this.config = { ...DEFAULT_CONFIG };
    this.save();
  }

  /**
   * 导出配置
   */
  export() {
    return JSON.parse(JSON.stringify(this.config));
  }
}

// 导出单例
const notificationConfig = new NotificationConfigManager({ verbose: true });

module.exports = {
  NotificationConfigManager,
  notificationConfig,
  DEFAULT_CONFIG
};

// CLI 测试
if (require.main === module) {
  console.log('=== 通知配置测试 ===\n');
  
  // 1. 查看当前配置
  console.log('1. 当前配置:');
  console.log(JSON.stringify(notificationConfig.get(), null, 2));
  
  // 2. 修改配置
  console.log('\n2. 添加接收人');
  notificationConfig.addTarget('users', 'ou_test123');
  notificationConfig.addTarget('chats', 'oc_test456');
  
  // 3. 检查是否应该通知
  console.log('\n3. 检查通知开关');
  console.log('agentComplete:', notificationConfig.shouldNotify('agentComplete'));
  console.log('agentFailed:', notificationConfig.shouldNotify('agentFailed'));
  
  // 4. 渲染模板
  console.log('\n4. 渲染消息模板');
  const message = notificationConfig.renderTemplate('agentComplete', {
    agentName: 'AI CTO',
    description: '开发监控 Dashboard',
    duration: '5 分钟',
    tokenCount: '12,345'
  });
  console.log(message);
  
  console.log('\n配置文件位置:', notificationConfig.configFile);
}
