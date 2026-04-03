# TaskNotification 快速参考

## 📦 导入

```typescript
import {
  TaskNotificationClass,
  NotificationEmitter,
  NotificationListener,
  TaskNotificationManager
} from './task-notification';
```

## 🎯 快速开始

### 创建通知
```typescript
const notification = TaskNotificationClass.create({
  taskId: 'my-task',
  status: 'completed',  // completed | failed | killed | running | pending
  summary: '任务完成摘要',
  result: '详细结果',
  usage: {
    totalTokens: 1000,
    toolUses: 5,
    durationMs: 3000
  }
});
```

### 发送和监听
```typescript
const manager = new TaskNotificationManager();

// 监听
manager.on('completed', (n) => console.log(`完成：${n.taskId}`));
manager.on('failed', (n) => console.log(`失败：${n.taskId}`));
manager.on('all', (n) => console.log(`收到：${n.taskId}`));

// 发送
await manager.send(notification);
```

## 🔄 XML 兼容

### 转 XML
```typescript
const xml = TaskNotificationClass.toXML(notification);
```

### 从 XML 解析
```typescript
const notification = TaskNotificationClass.fromXML(xmlString);
```

## 📤 发送器

```typescript
const emitter = new NotificationEmitter({ verbose: true });

// 发送单个
await emitter.send(notification);

// 批量发送
await emitter.sendBatch(notifications);

// 查看历史
const history = emitter.getHistory();

// 导出
const json = emitter.exportJSON();
const xml = emitter.exportXML();
```

## 📥 监听器

```typescript
const listener = new NotificationListener();

// 注册
listener.on('completed', (n) => console.log(n.taskId));
listener.on('all', (n) => console.log(n.status));

// 移除
listener.off('completed', callback);
listener.off('failed'); // 移除所有

// 接收（分发）
listener.receive(notification);

// 历史
const history = listener.getHistory('task-123');

// 统计
const stats = listener.getStats();
```

## 🎨 使用场景

### Worker 生命周期
```typescript
// 创建
await manager.send(TaskNotificationClass.create({
  taskId: workerId,
  status: 'pending',
  summary: 'Worker 创建中'
}));

// 运行
await manager.send(TaskNotificationClass.create({
  taskId: workerId,
  status: 'running',
  summary: 'Worker 执行中'
}));

// 完成
await manager.send(TaskNotificationClass.create({
  taskId: workerId,
  status: 'completed',
  summary: 'Worker 完成任务',
  usage: { totalTokens: 5000, toolUses: 20, durationMs: 30000 }
}));
```

### 批量任务
```typescript
const tasks = Array.from({ length: 10 }, (_, i) => ({
  taskId: `task-${i}`,
  status: Math.random() > 0.8 ? 'failed' : 'completed',
  summary: `任务 ${i}`
}));

const results = await emitter.sendBatch(
  tasks.map(t => TaskNotificationClass.create(t))
);
```

### 元数据
```typescript
const notification = TaskNotificationClass.create({
  taskId: 'task-123',
  status: 'completed',
  summary: '带元数据的通知',
  metadata: {
    workerType: 'specialist',
    priority: 'high',
    tags: ['urgent', 'important'],
    customData: { projectId: 'proj-123' }
  }
});
```

## 📊 统计

```typescript
const stats = manager.getStats();
console.log('监听器数量:', stats.listener.totalListeners);
console.log('历史记录:', stats.listener.historySize);
```

## ⚙️ 配置

```typescript
const manager = new TaskNotificationManager({
  verbose: true,          // 详细日志
  maxHistorySize: 100     // 最大历史记录数
});
```

## 🎯 最佳实践

### ✅ 好的做法
```typescript
// 有意义的 TaskId
taskId: 'worker_abc123'

// 详细的摘要
summary: '数据分析完成，处理 1500 条记录'
result: '生成 3 个报告文件'

// 准确的使用量
usage: {
  totalTokens: estimateTokens(output),
  toolUses: toolCallCount,
  durationMs: endTime - startTime
}
```

### ❌ 避免
```typescript
taskId: 'task'
summary: '完成'
result: 'ok'
```

## 🏃 运行

```bash
# 运行示例
npx ts-node examples/task-notification-examples.ts

# 运行测试
npm test -- task-notification

# 编译
npm run build
```

## 📚 文档

- 完整文档：`docs/TASK-NOTIFICATION.md`
- 实现总结：`IMPLEMENTATION-TASK-NOTIFICATION.md`
- 使用示例：`examples/task-notification-examples.ts`
- 单元测试：`src/task-notification.test.ts`
