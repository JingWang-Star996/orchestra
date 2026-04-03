# Orchestra 实时监控使用指南

**版本**: v1.0  
**日期**: 2026-04-03  
**参考**: Claude Code Task Framework

---

## 📊 系统架构

```
┌─────────────────────────────────────────┐
│         Orchestra 任务执行              │
│  (sessions_spawn 启动子代理)            │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│       agentExecutor.js                  │
│  (自动注册/更新 Agent 状态)              │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│       stateManager.js                   │
│  (状态管理 + 持久化到 JSON)              │
│  temp/orchestra-state.json              │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│    Dashboard (每 5 秒轮询)                │
│    live-monitor.html                    │
└─────────────────────────────────────────┘
```

---

## 🚀 快速开始

### 方式 1: 运行演示脚本

```bash
cd /home/z3129119/.openclaw/workspace/orchestra
node demo-monitor.js
```

然后访问 Dashboard：
```
http://localhost:8080/orchestra/dashboard/live-monitor.html
```

### 方式 2: 集成到你的代码

```javascript
const { spawnAgent, spawnAgents } = require('./orchestra/agentExecutor');

// 启动单个 Agent
const result = await spawnAgent('AI CTO', '开发 Dashboard', {
  timeout: 300  // 5 分钟超时
});

// 批量启动 Agent
const results = await spawnAgents([
  { name: '场景美术组', task: '场景设计', options: { timeout: 300 } },
  { name: '角色美术组', task: '角色设计', options: { timeout: 300 } },
  { name: '概念设计组', task: '世界观设计', options: { timeout: 300 } }
]);
```

---

## 📁 文件结构

```
orchestra/
├── stateManager.js          # 状态管理器（核心）
├── agentExecutor.js         # Agent 执行器（集成状态）
├── demo-monitor.js          # 演示脚本
├── dashboard/
│   └── live-monitor.html    # 实时监控 Dashboard
└── temp/
    └── orchestra-state.json # 状态文件（自动生成）
```

---

## 🔧 API 参考

### stateManager.js

```javascript
const { stateManager } = require('./orchestra/stateManager');

// 注册 Agent
stateManager.register('agent-1', 'AI CTO', {
  type: 'subagent',
  description: '开发 Dashboard'
});

// 更新状态
stateManager.update('agent-1', {
  status: 'running',
  progress: { tokenCount: 1000, toolUseCount: 5 }
});

// 更新进度
stateManager.updateProgress('agent-1', {
  tokenCount: 2000,
  toolUseCount: 10,
  recentActivities: ['读取文件', '写入文件']
});

// 完成任务
stateManager.complete('agent-1', {
  output: 'Dashboard 完成'
});

// 失败任务
stateManager.fail('agent-1', '超时错误');

// 获取所有状态
const agents = stateManager.getAll();

// 获取统计
const stats = stateManager.getStats();
// { total, running, completed, failed, totalTokens, avgDuration }

// 导出 JSON（用于 Dashboard）
const json = stateManager.toJSON();
```

### agentExecutor.js

```javascript
const { spawnAgent, spawnAgents } = require('./orchestra/agentExecutor');

// 启动单个 Agent
const result = await spawnAgent(name, task, options);
// options: { type, timeout, mode, runtime }

// 批量启动（并行）
const results = await spawnAgents([
  { name, task, options },
  ...
]);
```

---

## 📊 Dashboard 功能

### 实时监控

- **每 5 秒自动刷新** - 从 `temp/orchestra-state.json` 读取最新数据
- **运行中 Agent 脉冲动画** - 蓝色边框 + 呼吸效果
- **进度条** - 基于 Token 消耗自动计算进度
- **统计卡片** - 总数/运行中/已完成/失败/Token/耗时

### 状态说明

| 状态 | 颜色 | 说明 |
|------|------|------|
| 🟢 completed | 绿色 | 任务完成 |
| 🔵 running | 蓝色 | 正在执行（脉冲动画） |
| 🔴 failed | 红色 | 执行失败 |
| 🟡 pending | 黄色 | 等待启动 |
| ⚫ killed | 灰色 | 手动停止 |

---

## 🔍 状态文件结构

```json
{
  "updatedAt": "2026-04-03T19:40:00.000Z",
  "totalAgents": 11,
  "agents": [
    {
      "id": "agent-x7q",
      "name": "AI CTO - Dashboard",
      "type": "subagent",
      "status": "completed",
      "startTime": 1775215200000,
      "endTime": 1775215500000,
      "progress": {
        "toolUseCount": 45,
        "tokenCount": 15234,
        "recentActivities": ["读取文件", "写入文件"]
      },
      "description": "开发监控 Dashboard",
      "result": { "sessionId": "...", "status": "completed" }
    }
  ]
}
```

---

## 🎯 最佳实践

### 1. 自动状态更新

```javascript
// ✅ 推荐：使用 spawnAgent 自动管理状态
const result = await spawnAgent('AI CTO', '任务描述');

// ❌ 不推荐：手动管理状态（容易遗漏）
stateManager.register(...);
try {
  // 执行任务
  stateManager.complete(...);
} catch {
  stateManager.fail(...);
}
```

### 2. 批量执行

```javascript
// 并行执行多个 Agent
const results = await spawnAgents([
  { name: '场景组', task: '场景设计' },
  { name: '角色组', task: '角色设计' },
  { name: '特效组', task: '特效设计' }
]);

// 检查结果
const success = results.filter(r => !r.error);
const failed = results.filter(r => r.error);
console.log(`成功：${success.length}, 失败：${failed.length}`);
```

### 3. 定期清理

```javascript
// 清理 1 小时前完成的任务
stateManager.cleanup(3600000);
```

---

## ⚠️ 注意事项

1. **状态文件位置**: `temp/orchestra-state.json`
2. **自动保存**: 默认启用，可通过 `autoSave: false` 禁用
3. **轮询间隔**: Dashboard 每 5 秒刷新一次
4. **清理策略**: 完成 1 小时后自动清理（可配置）
5. **并发限制**: 建议同时运行不超过 20 个 Agent

---

## 🐛 故障排查

### Dashboard 显示"无法加载数据"

**原因**: 状态文件不存在或 HTTP 服务器未启动

**解决**:
```bash
# 1. 确保 HTTP 服务器运行
cd /home/z3129119/.openclaw/workspace
python3 -m http.server 8080

# 2. 运行演示脚本生成状态文件
cd orchestra
node demo-monitor.js
```

### Agent 状态不更新

**原因**: 没有调用 `stateManager.updateProgress()`

**解决**: 使用 `spawnAgent` 自动更新，或手动定期调用：
```javascript
setInterval(() => {
  stateManager.updateProgress(agentId, {
    tokenCount: estimateTokens(),
    toolUseCount: estimateTools()
  });
}, 10000);
```

---

## 📚 参考资料

- Claude Code Task Framework: `tasks/types.ts`, `utils/task/framework.ts`
- DreamTask 实现：`tasks/DreamTask/DreamTask.ts`
- LocalAgentTask 实现：`tasks/LocalAgentTask/LocalAgentTask.tsx`

---

**维护者**: Orchestra Team  
**最后更新**: 2026-04-03
