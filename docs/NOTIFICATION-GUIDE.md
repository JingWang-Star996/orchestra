# 📢 Orchestra 飞书消息推送使用指南

> 实现 Agent 状态变更的飞书消息推送，提供企业级通知能力。

## 🎯 功能特性

- ✅ **Agent 完成通知** - 任务完成时自动推送
- ❌ **Agent 失败告警** - 任务失败时立即通知
- 🎯 **里程碑通知** - 支持自定义里程碑事件
- ⚙️ **灵活配置** - 支持个人/群聊推送、通知开关、静默时段
- 📊 **聚合推送** - 支持批量任务合并通知

---

## 🚀 快速开始

### 1. 安装依赖

确保 Orchestra 项目已安装必要依赖：

```bash
cd orchestra
npm install axios  # 可选，用于 HTTP 请求
```

### 2. 配置飞书凭证

#### 方式一：环境变量（推荐）

```bash
export FEISHU_BOT_WEBHOOK=https://open.feishu.cn/open-apis/bot/v2/hook/xxx
export FEISHU_APP_ID=cli_xxx
export FEISHU_APP_SECRET=xxx
```

#### 方式二：代码中配置

```javascript
// notificationConfig.js
const config = notificationConfig.get();
config.targets.users = ['ou_xxx'];  // 个人 ID
config.targets.chats = ['oc_xxx'];  // 群聊 ID
```

### 3. 集成到 Orchestra

在 `index.js` 或主入口文件中添加：

```javascript
const { stateManager } = require('./stateManager');
const { feishuNotifier } = require('./feishuNotifier');

// Agent 完成时推送
stateManager.on('agent:complete', async (agent) => {
  await feishuNotifier.send({
    type: 'agent_complete',
    agent: agent,
    target: 'ou_xxx'  // 可选，不传则使用配置中的默认接收人
  });
});

// Agent 失败时推送
stateManager.on('agent:failed', async (agent) => {
  await feishuNotifier.send({
    type: 'agent_failed',
    agent: agent,
    target: 'oc_xxx'  // 推送到群聊
  });
});
```

---

## 📋 配置说明

### 配置文件位置

`orchestra/temp/notification-config.json`

### 完整配置示例

```json
{
  "enabled": true,
  "types": {
    "agentComplete": true,
    "agentFailed": true,
    "milestoneReached": false
  },
  "targets": {
    "users": ["ou_xxx1", "ou_xxx2"],
    "chats": ["oc_xxx1"]
  },
  "templates": {
    "agentComplete": "✅ {agentName} 完成！\n📝 任务：{description}\n⏱️ 耗时：{duration}\n💰 Token: {tokenCount}\n📊 状态：completed",
    "agentFailed": "❌ {agentName} 失败！\n📝 任务：{description}\n⏱️ 耗时：{duration}\n🔥 错误：{error}\n📊 状态：failed",
    "milestoneReached": "🎯 里程碑达成！\n📝 任务：{description}\n🚀 进度：{milestone}\n📊 状态：in_progress"
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
    },
    "retry": {
      "maxAttempts": 3,
      "delayMs": 1000
    }
  }
}
```

### 配置项说明

| 配置项 | 类型 | 说明 | 默认值 |
|--------|------|------|--------|
| `enabled` | boolean | 通知总开关 | `true` |
| `types.agentComplete` | boolean | Agent 完成通知 | `true` |
| `types.agentFailed` | boolean | Agent 失败通知 | `true` |
| `types.milestoneReached` | boolean | 里程碑通知 | `false` |
| `targets.users` | array | 个人接收人列表 (open_id) | `[]` |
| `targets.chats` | array | 群聊接收人列表 (chat_id) | `[]` |
| `advanced.quietHours.enabled` | boolean | 启用静默时段 | `false` |
| `advanced.quietHours.start` | number | 静默开始时间 (小时) | `22` |
| `advanced.quietHours.end` | number | 静默结束时间 (小时) | `8` |
| `advanced.aggregation.enabled` | boolean | 启用聚合推送 | `false` |
| `advanced.aggregation.windowMs` | number | 聚合窗口 (毫秒) | `60000` |

---

## 🔧 API 使用

### FeishuNotifier 类

#### 构造函数

```javascript
const { FeishuNotifier } = require('./feishuNotifier');

const notifier = new FeishuNotifier({
  verbose: true,              // 是否输出日志
  webhookUrl: 'https://...',  // 飞书 Webhook URL
  config: notificationConfig  // 配置管理器（可选）
});
```

#### send() - 发送单条通知

```javascript
await notifier.send({
  type: 'agent_complete',     // 通知类型
  agent: {                    // Agent 信息
    name: 'AI CTO',
    description: '开发 Dashboard',
    startTime: Date.now() - 300000,
    endTime: Date.now(),
    progress: { tokenCount: 12345 },
    error: null
  },
  target: 'ou_xxx',           // 可选，指定接收人
  skipConfigCheck: false      // 可选，跳过配置检查
});
```

#### sendBatch() - 批量发送（支持聚合）

```javascript
await notifier.sendBatch([
  { type: 'agent_complete', agent: agent1 },
  { type: 'agent_complete', agent: agent2 },
  { type: 'agent_failed', agent: agent3 }
]);
```

### NotificationConfigManager 类

#### 获取配置

```javascript
const { notificationConfig } = require('./notificationConfig');

// 获取全部配置
const config = notificationConfig.get();

// 获取嵌套配置
const enabled = notificationConfig.get('types.agentComplete');
const users = notificationConfig.get('targets.users');
```

#### 设置配置

```javascript
// 添加接收人
notificationConfig.addTarget('users', 'ou_xxx');
notificationConfig.addTarget('chats', 'oc_xxx');

// 修改配置
notificationConfig.set('enabled', true);
notificationConfig.set('types.milestoneReached', true);

// 重置配置
notificationConfig.reset();
```

#### 检查通知开关

```javascript
if (notificationConfig.shouldNotify('agentComplete')) {
  // 发送通知
}
```

#### 渲染模板

```javascript
const message = notificationConfig.renderTemplate('agentComplete', {
  agentName: 'AI CTO',
  description: '开发 Dashboard',
  duration: '5 分钟',
  tokenCount: '12,345'
});
```

---

## 📝 消息模板

### 默认模板

#### Agent 完成

```
✅ {agentName} 完成！
📝 任务：{description}
⏱️ 耗时：{duration}
💰 Token: {tokenCount}
📊 状态：completed
```

**示例输出：**
```
✅ AI CTO 完成！
📝 任务：开发监控 Dashboard
⏱️ 耗时：5 分钟 30 秒
💰 Token: 12,345
📊 状态：completed
```

#### Agent 失败

```
❌ {agentName} 失败！
📝 任务：{description}
⏱️ 耗时：{duration}
🔥 错误：{error}
📊 状态：failed
```

#### 里程碑达成

```
🎯 里程碑达成！
📝 任务：{description}
🚀 进度：{milestone}
📊 状态：in_progress
```

### 自定义模板

```javascript
notificationConfig.set('templates.agentComplete', `
【任务完成通知】
━━━━━━━━━━━━━━
👤 执行者：{agentName}
📋 任务：{description}
⏰ 耗时：{duration}
💎 消耗：{tokenCount} tokens
━━━━━━━━━━━━━━
✨ 状态：已完成
`);
```

---

## 🔍 高级功能

### 1. 静默时段

避免在深夜打扰：

```javascript
notificationConfig.set('advanced.quietHours.enabled', true);
notificationConfig.set('advanced.quietHours.start', 22);  // 22:00
notificationConfig.set('advanced.quietHours.end', 8);     // 08:00
```

### 2. 聚合推送

将多个通知合并为一条：

```javascript
notificationConfig.set('advanced.aggregation.enabled', true);
notificationConfig.set('advanced.aggregation.windowMs', 60000);  // 1 分钟窗口
```

**聚合效果：**
```
📊 批量任务完成通知

✅ 成功：3 个
❌ 失败：1 个

成功任务:
  • AI CTO
  • AI 策划
  • AI 主程

失败任务:
  • AI 测试：文件不存在
```

### 3. 重试机制

```javascript
notificationConfig.set('advanced.retry.maxAttempts', 3);
notificationConfig.set('advanced.retry.delayMs', 1000);
```

---

## 🧪 测试

### 单元测试

```bash
cd orchestra
node feishuNotifier.js
node notificationConfig.js
```

### 集成测试

```javascript
const { stateManager } = require('./stateManager');
const { feishuNotifier } = require('./feishuNotifier');

// 模拟 Agent 完成
stateManager.register('agent-test', '测试 Agent', {
  description: '测试飞书推送'
});

setTimeout(() => {
  stateManager.complete('agent-test', { output: '测试完成' });
}, 1000);

// 监听事件并推送
stateManager.on('agent:complete', async (agent) => {
  const result = await feishuNotifier.send({
    type: 'agent_complete',
    agent: agent,
    target: 'ou_xxx'
  });
  console.log('推送结果:', result);
});
```

---

## ❓ 常见问题

### Q1: 收不到通知？

**检查清单：**

1. ✅ 通知总开关是否开启：`notificationConfig.get('enabled')`
2. ✅ 类型开关是否开启：`notificationConfig.get('types.agentComplete')`
3. ✅ 是否配置了接收人：`notificationConfig.get('targets.users')`
4. ✅ 是否在静默时段内
5. ✅ Webhook URL 是否正确配置

### Q2: 如何获取 open_id 和 chat_id？

**方式一：飞书开发者后台**

1. 访问 https://open.feishu.cn/
2. 进入应用管理 → 凭证与基础信息
3. 获取用户 open_id 和群聊 chat_id

**方式二：飞书 API**

```bash
# 获取用户信息
curl -X GET "https://open.feishu.cn/open-apis/contact/v3/users/:user_id" \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# 获取群信息
curl -X GET "https://open.feishu.cn/open-apis/im/v1/chats/:chat_id" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### Q3: 如何自定义消息格式？

修改模板配置：

```javascript
notificationConfig.set('templates.agentComplete', '自定义模板内容');
```

支持变量：`{agentName}`, `{description}`, `{duration}`, `{tokenCount}`, `{error}`, `{milestone}`

### Q4: 支持哪些通知类型？

- `agent_complete` / `agent:complete` - Agent 完成
- `agent_failed` / `agent:failed` - Agent 失败
- `milestone_reached` - 里程碑达成

---

## 📚 相关文件

| 文件 | 说明 |
|------|------|
| `feishuNotifier.js` | 飞书通知器核心实现 |
| `notificationConfig.js` | 通知配置管理器 |
| `stateManager.js` | Orchestra 状态管理器 |
| `temp/notification-config.json` | 配置文件（运行时生成） |

---

## 🔗 参考资料

- [飞书开放平台](https://open.feishu.cn/document/home)
- [飞书群机器人](https://open.feishu.cn/document/ukTMukTMukTM/ucTM5YjL3ETO24yNxkjN)
- [Orchestra README](./README.md)

---

**最后更新：** 2026-04-03  
**版本：** v1.0.0
