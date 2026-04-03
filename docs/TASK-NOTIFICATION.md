# TaskNotification 使用指南

## 📚 目录

- [概述](#概述)
- [核心功能](#核心功能)
- [快速开始](#快速开始)
- [API 参考](#api-参考)
- [使用场景](#使用场景)
- [最佳实践](#最佳实践)
- [示例代码](#示例代码)

---

## 概述

TaskNotification 是 Orchestra 的任务通知系统，实现结构化的任务通知机制。

**设计灵感**: 参考 Claude Coordinator 的 `<task-notification>` XML 格式

**核心特点**:
- 📦 JSON 格式 - 现代、易用的 JSON 表示
- 🔄 XML 兼容 - 支持转换为 Claude Code 兼容的 XML 格式
- 🎯 类型安全 - 完整的 TypeScript 类型定义
- 🔔 事件驱动 - 基于监听器的通知分发
- 📊 使用统计 - Token、工具调用、耗时统计

---

## 核心功能

### 1. TaskNotification 类

创建和管理任务通知对象：

```typescript
const notification = TaskNotificationClass.create({
  taskId: 'agent-x7q',
  status: 'completed',
  summary: '研究完成',
  result: '找到 3 个关键文件',
  usage: {
    totalTokens: 1234,
    toolUses: 5,
    durationMs: 5000
  }
});
```

### 2. NotificationEmitter - 发送器

发送通知到 OpenClaw 系统：

```typescript
const emitter = new NotificationEmitter({ verbose: true });
await emitter.send(notification);
```

### 3. NotificationListener - 监听器

订阅和接收通知：

```typescript
const listener = new NotificationListener();

listener.on('completed', (n) => {
  console.log(`任务完成：${n.taskId}`);
});

listener.receive(notification);
```

### 4. TaskNotificationManager - 统一管理器

整合发送和监听功能：

```typescript
const manager = new TaskNotificationManager();

manager.on('completed', handler);
await manager.send(notification);
```

---

## 快速开始

### 1. 导入模块

```typescript
import {
  TaskNotificationClass,
  NotificationEmitter,
  NotificationListener,
  TaskNotificationManager
} from './task-notification';
```

### 2. 创建通知

```typescript
const notification = TaskNotificationClass.create({
  taskId: 'my-task-123',
  status: 'completed',
  summary: '任务完成摘要',
  result: '详细结果',
  usage: {
    totalTokens: 1000,
    toolUses: 5,
    durationMs: 3000
  }
});
```

### 3. 发送通知

```typescript
const manager = new TaskNotificationManager();
await manager.send(notification);
```

### 4. 监听通知

```typescript
manager.on('completed', (notification) => {
  console.log('收到完成通知:', notification.taskId);
});
```

---

## API 参考

### TaskNotificationClass

#### create(options)

创建任务通知

**参数**:
- `options.taskId` (必填) - 任务 ID
- `options.status` (必填) - 状态：completed|failed|killed|running|pending
- `options.summary` (可选) - 任务摘要
- `options.result` (可选) - 详细结果
- `options.usage` (可选) - 使用统计
- `options.metadata` (可选) - 元数据

**返回**: TaskNotification 对象

```typescript
const notification = TaskNotificationClass.create({
  taskId: 'task-123',
  status: 'completed',
  summary: '完成',
  usage: {
    totalTokens: 1000,
    toolUses: 5,
    durationMs: 3000
  }
});
```

#### toXML(notification)

转换为 XML 格式

**参数**: notification - 通知对象

**返回**: XML 字符串

```typescript
const xml = TaskNotificationClass.toXML(notification);
```

#### fromXML(xml)

从 XML 解析

**参数**: xml - XML 字符串

**返回**: TaskNotification 对象

```typescript
const notification = TaskNotificationClass.fromXML(xmlString);
```

---

### NotificationEmitter

#### constructor(config)

创建发送器

**参数**:
- `config.verbose` (可选) - 详细日志
- `config.maxHistorySize` (可选) - 最大历史记录数

```typescript
const emitter = new NotificationEmitter({
  verbose: true,
  maxHistorySize: 100
});
```

#### send(notification)

发送通知

**参数**: notification - 通知对象

**返回**: Promise<{ success: boolean; error?: string }>

```typescript
const result = await emitter.send(notification);
if (result.success) {
  console.log('发送成功');
}
```

#### sendBatch(notifications)

批量发送

**参数**: notifications - 通知数组

**返回**: Promise<Array<{ success: boolean; error?: string }>>

```typescript
const results = await emitter.sendBatch(notifications);
```

#### getHistory(taskId?)

获取发送历史

**参数**: taskId (可选) - 筛选特定任务

**返回**: TaskNotification 数组

```typescript
const history = emitter.getHistory();
const taskHistory = emitter.getHistory('task-123');
```

#### exportJSON()

导出为 JSON

```typescript
const json = emitter.exportJSON();
```

#### exportXML()

导出为 XML

```typescript
const xml = emitter.exportXML();
```

---

### NotificationListener

#### constructor(config)

创建监听器

**参数**: 同 NotificationEmitter

#### on(status, callback)

注册监听器

**参数**:
- `status` - 状态或 'all'
- `callback` - 回调函数

```typescript
listener.on('completed', (notification) => {
  console.log('完成:', notification.taskId);
});

listener.on('all', (notification) => {
  console.log('所有:', notification);
});
```

#### off(status, callback?)

移除监听器

**参数**:
- `status` - 状态
- `callback` (可选) - 不传则移除所有

```typescript
listener.off('completed', specificCallback);
listener.off('failed'); // 移除所有 failed 监听器
```

#### receive(notification)

接收通知（分发给监听器）

**参数**: notification - 通知对象

```typescript
listener.receive(notification);
```

#### getHistory(taskId?)

获取历史

#### getStats()

获取统计信息

```typescript
const stats = listener.getStats();
console.log('监听器数量:', stats.totalListeners);
console.log('历史记录:', stats.historySize);
```

#### clearHistory()

清空历史

---

### TaskNotificationManager

整合 Emitter 和 Listener 的完整管理器

```typescript
const manager = new TaskNotificationManager();

// 发送
await manager.send(notification);

// 监听
manager.on('completed', handler);

// 统计
const stats = manager.getStats();

// 导出
const json = manager.exportJSON();
const xml = manager.exportXML();
```

---

## 使用场景

### 场景 1: Worker 生命周期通知

```typescript
const manager = new TaskNotificationManager();

// Worker 创建
await manager.send(TaskNotificationClass.create({
  taskId: workerId,
  status: 'pending',
  summary: 'Worker 创建中'
}));

// Worker 运行
await manager.send(TaskNotificationClass.create({
  taskId: workerId,
  status: 'running',
  summary: 'Worker 执行中'
}));

// Worker 完成
await manager.send(TaskNotificationClass.create({
  taskId: workerId,
  status: 'completed',
  summary: 'Worker 完成任务',
  usage: {
    totalTokens: 5000,
    toolUses: 20,
    durationMs: 30000
  }
}));
```

### 场景 2: 批量任务监控

```typescript
const emitter = new NotificationEmitter();

// 批量发送任务状态
const tasks = Array.from({ length: 10 }, (_, i) => ({
  taskId: `task-${i}`,
  status: Math.random() > 0.8 ? 'failed' : 'completed',
  summary: `任务 ${i}`
}));

await emitter.sendBatch(tasks.map(t => TaskNotificationClass.create(t)));

// 统计结果
const history = emitter.getHistory();
const failedCount = history.filter(n => n.status === 'failed').length;
console.log(`失败：${failedCount}/${tasks.length}`);
```

### 场景 3: 多代理协调

```typescript
const coordinator = new TaskNotificationManager();

// 订阅所有子代理的通知
coordinator.on('completed', (notification) => {
  console.log(`子代理完成：${notification.taskId}`);
  // 触发下一步协调逻辑
});

coordinator.on('failed', (notification) => {
  console.log(`子代理失败：${notification.taskId}`);
  // 错误恢复逻辑
});
```

---

## 最佳实践

### 1. 使用有意义的 TaskId

```typescript
// ✅ 好的做法
taskId: 'worker_abc123'
taskId: 'agent-x7q'
taskId: 'job-20260403-001'

// ❌ 避免
taskId: 'task'
taskId: '123'
```

### 2. 提供详细的摘要

```typescript
// ✅ 好的做法
summary: '数据分析完成，处理 1500 条记录'
result: '生成 3 个报告文件：report1.csv, report2.csv, report3.csv'

// ❌ 避免
summary: '完成'
result: 'ok'
```

### 3. 准确记录使用量

```typescript
usage: {
  totalTokens: estimateTokens(output),
  toolUses: toolCallCount,
  durationMs: endTime - startTime
}
```

### 4. 利用元数据携带额外信息

```typescript
metadata: {
  workerType: 'specialist',
  priority: 'high',
  tags: ['urgent', 'important'],
  customData: {
    projectId: 'proj-123'
  }
}
```

### 5. 合理设置历史大小

```typescript
// 内存敏感场景
const emitter = new NotificationEmitter({
  maxHistorySize: 50  // 限制为 50 条
});

// 调试场景
const listener = new NotificationListener({
  verbose: true,
  maxHistorySize: 1000
});
```

### 6. 错误隔离

监听器中的异常不会影响其他监听器：

```typescript
listener.on('completed', (n) => {
  // 即使这里抛出异常
  throw new Error('Oops');
});

listener.on('completed', (n) => {
  // 这个监听器仍然会执行
  console.log('正常执行');
});
```

---

## 示例代码

### 完整示例：Worker 管理集成

```typescript
import {
  TaskNotificationClass,
  TaskNotificationManager
} from './task-notification';

async function manageWorker() {
  const manager = new TaskNotificationManager({ verbose: true });
  
  // 注册监听器
  manager.on('completed', (n) => {
    console.log(`✅ ${n.taskId} 完成`);
    console.log(`   Token: ${n.usage.totalTokens}`);
    console.log(`   耗时：${n.usage.durationMs}ms`);
  });
  
  manager.on('failed', (n) => {
    console.error(`❌ ${n.taskId} 失败: ${n.result}`);
  });
  
  // 模拟 Worker 生命周期
  const workerId = 'worker_abc123';
  
  // 1. 创建
  await manager.send(TaskNotificationClass.create({
    taskId: workerId,
    status: 'pending',
    summary: 'Worker 创建中'
  }));
  
  // 2. 运行
  await manager.send(TaskNotificationClass.create({
    taskId: workerId,
    status: 'running',
    summary: 'Worker 执行任务'
  }));
  
  // 3. 完成
  await manager.send(TaskNotificationClass.create({
    taskId: workerId,
    status: 'completed',
    summary: 'Worker 完成任务',
    result: '生成 3 个文件',
    usage: {
      totalTokens: 5000,
      toolUses: 20,
      durationMs: 30000
    },
    metadata: {
      filesGenerated: 3
    }
  }));
  
  // 4. 查看历史
  const history = manager.getHistory(workerId);
  console.log(`\nWorker 历史:`);
  history.forEach((n, i) => {
    console.log(`  ${i + 1}. ${n.status} - ${n.summary}`);
  });
  
  // 5. 导出报告
  console.log('\n导出 JSON 报告:');
  console.log(manager.exportJSON());
}

manageWorker().catch(console.error);
```

---

## 运行示例

```bash
# 运行示例代码
ts-node orchestra/examples/task-notification-examples.ts

# 运行测试
npm test -- task-notification
```

---

## 与 Claude Code XML 格式对比

### Claude Code XML 格式
```xml
<task-notification>
  <task-id>agent-x7q</task-id>
  <status>completed</status>
  <summary>研究完成</summary>
  <result>找到 3 个文件</result>
  <usage>
    <total_tokens>1234</total_tokens>
    <tool_uses>5</tool_uses>
    <duration_ms>5000</duration_ms>
  </usage>
  <timestamp>2026-04-03T12:00:00Z</timestamp>
</task-notification>
```

### TaskNotification JSON 格式
```json
{
  "type": "task-notification",
  "taskId": "agent-x7q",
  "status": "completed",
  "summary": "研究完成",
  "result": "找到 3 个文件",
  "usage": {
    "totalTokens": 1234,
    "toolUses": 5,
    "durationMs": 5000
  },
  "timestamp": "2026-04-03T12:00:00Z"
}
```

**优势**:
- ✅ 更易解析（JSON vs XML）
- ✅ 类型安全（TypeScript）
- ✅ 支持元数据
- ✅ 完整的监听器系统
- ✅ 批量操作支持

**兼容性**:
- ✅ 支持 toXML() 转换为 Claude 格式
- ✅ 支持 fromXML() 解析 Claude 格式

---

## 更新日志

### v1.0.0 (2026-04-03)
- ✅ TaskNotification 类
- ✅ NotificationEmitter 发送器
- ✅ NotificationListener 监听器
- ✅ TaskNotificationManager 管理器
- ✅ XML 兼容（toXML/fromXML）
- ✅ 元数据支持
- ✅ 批量操作
- ✅ 完整测试
- ✅ 详细文档

---

## 许可证

MIT License
