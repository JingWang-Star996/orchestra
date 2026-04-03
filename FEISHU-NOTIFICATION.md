# 📢 飞书消息推送功能

> P0 优先级 - 企业级通知能力

## 🎯 功能概述

为 Orchestra 实现飞书消息推送功能，替代 WebSocket，提供企业级通知能力。

### 核心特性

- ✅ **Agent 完成通知** - 任务完成时自动推送
- ❌ **Agent 失败告警** - 任务失败时立即通知  
- 🎯 **里程碑通知** - 支持自定义里程碑事件
- ⚙️ **灵活配置** - 支持个人/群聊推送、通知开关、静默时段
- 📊 **聚合推送** - 支持批量任务合并通知

---

## 📁 文件结构

```
orchestra/
├── feishuNotifier.js              # 飞书通知器核心
├── notificationConfig.js          # 通知配置管理器
├── stateManager.js                # 状态管理器（已集成通知）
├── docs/
│   └── NOTIFICATION-GUIDE.md      # 详细使用指南
├── examples/
│   └── feishu-notification-demo.js # 集成示例
└── scripts/
    └── configure-feishu.js        # 配置向导
```

---

## 🚀 快速开始

### 1. 运行配置向导

```bash
cd orchestra
node scripts/configure-feishu.js
```

按提示配置：
- 个人接收人 (open_id)
- 群聊接收人 (chat_id)
- 通知类型开关
- 静默时段

### 2. 测试通知

```bash
node examples/feishu-notification-demo.js
```

### 3. 查看配置

配置文件位置：`orchestra/temp/notification-config.json`

---

## 🔧 集成方式

### 自动集成（推荐）

Orchestra 已自动集成飞书通知，无需额外配置：

```javascript
const { stateManager } = require('./stateManager');

// 注册 Agent（完成时会自动推送飞书消息）
stateManager.register('agent-1', 'AI CTO', {
  description: '开发 Dashboard'
});

// 完成任务时自动触发飞书通知
stateManager.complete('agent-1', { output: '完成' });
```

### 手动发送

```javascript
const { feishuNotifier } = require('./feishuNotifier');

await feishuNotifier.send({
  type: 'agent_complete',
  agent: {
    name: 'AI CTO',
    description: '开发 Dashboard',
    startTime: Date.now() - 300000,
    endTime: Date.now(),
    progress: { tokenCount: 12345 }
  },
  target: 'ou_xxx'  // 可选，指定接收人
});
```

---

## 📋 消息模板

### Agent 完成

```
✅ {agentName} 完成！
📝 任务：{description}
⏱️ 耗时：{duration}
💰 Token: {tokenCount}
📊 状态：completed
```

### Agent 失败

```
❌ {agentName} 失败！
📝 任务：{description}
⏱️ 耗时：{duration}
🔥 错误：{error}
📊 状态：failed
```

---

## ⚙️ 配置选项

### 环境变量

```bash
export FEISHU_BOT_WEBHOOK=https://open.feishu.cn/open-apis/bot/v2/hook/xxx
export FEISHU_APP_ID=cli_xxx
export FEISHU_APP_SECRET=xxx
```

### 配置文件

`orchestra/temp/notification-config.json`

```json
{
  "enabled": true,
  "types": {
    "agentComplete": true,
    "agentFailed": true,
    "milestoneReached": false
  },
  "targets": {
    "users": ["ou_xxx"],
    "chats": ["oc_xxx"]
  },
  "advanced": {
    "quietHours": {
      "enabled": false,
      "start": 22,
      "end": 8
    },
    "aggregation": {
      "enabled": false,
      "windowMs": 60000
    }
  }
}
```

---

## 📖 详细文档

- [完整使用指南](./docs/NOTIFICATION-GUIDE.md)
- [配置向导脚本](./scripts/configure-feishu.js)
- [集成示例](./examples/feishu-notification-demo.js)

---

## 🔍 常见问题

### Q: 如何获取 open_id 和 chat_id？

**A:** 从飞书开发者后台获取：
1. 访问 https://open.feishu.cn/
2. 进入应用管理 → 凭证与基础信息
3. 获取用户 open_id 和群聊 chat_id

### Q: 收不到通知？

**A:** 检查清单：
- ✅ 通知总开关是否开启
- ✅ 类型开关是否开启
- ✅ 是否配置了接收人
- ✅ 是否在静默时段内
- ✅ Webhook URL 是否正确

### Q: 如何自定义消息格式？

**A:** 修改模板配置：
```javascript
notificationConfig.set('templates.agentComplete', '自定义模板');
```

---

## 📊 技术实现

### 架构设计

```
┌─────────────────┐
│  stateManager   │
│   (EventEmitter)│
└────────┬────────┘
         │
         │ on('agent:complete')
         │ on('agent:failed')
         ▼
┌─────────────────┐
│ feishuNotifier  │
│  (通知器)       │
└────────┬────────┘
         │
         │ send()
         ▼
┌─────────────────┐
│  notification   │
│    Config       │
│  (配置管理)     │
└────────┬────────┘
         │
         │ 读取配置
         ▼
┌─────────────────┐
│   飞书 API      │
│ (Webhook/IM)   │
└─────────────────┘
```

### 事件流程

1. Agent 完成/失败 → `stateManager.complete()` / `stateManager.fail()`
2. 触发事件 → `emit('agent:complete')` / `emit('agent:failed')`
3. 飞书通知器监听事件 → `on('agent:complete')`
4. 构建消息 → 读取配置 → 渲染模板
5. 发送消息 → 飞书 API

---

## ✅ 完成清单

- [x] `feishuNotifier.js` - 飞书通知器
- [x] `notificationConfig.js` - 通知配置
- [x] `stateManager.js` - 集成通知事件
- [x] `docs/NOTIFICATION-GUIDE.md` - 使用指南
- [x] `examples/feishu-notification-demo.js` - 集成示例
- [x] `scripts/configure-feishu.js` - 配置向导

---

**版本：** v1.0.0  
**最后更新：** 2026-04-03  
**优先级：** P0
