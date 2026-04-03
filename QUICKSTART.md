# Orchestra Worker Manager - 快速开始

## 5 分钟上手

### 1️⃣ 安装

```bash
cd orchestra
npm install
```

### 2️⃣ 导入

```typescript
import { workerManager } from './orchestra/src/worker-manager';
```

### 3️⃣ 创建 Worker

```typescript
const workerId = await workerManager.createWorker({
  description: 'AI 助手',
  agentType: 'agent',
  prompt: '你是一个乐于助人的 AI 助手',
  initialMessage: '你好！'
});
```

### 4️⃣ 发送消息

```typescript
// 异步发送（不等待响应）
await workerManager.continueWorker(workerId, '帮我写代码');

// 同步发送（等待响应）
const result = await workerManager.continueWorker(
  workerId, 
  '优化这段代码',
  { waitForResponse: true, timeoutMs: 60000 }
);
console.log('响应:', result.response);
```

### 5️⃣ 停止 Worker

```typescript
await workerManager.stopWorker(workerId, {
  graceful: true,  // 优雅停止
  reason: '任务完成'
});
```

---

## 智能决策

让系统自动判断是继续现有 Worker 还是创建新的：

```typescript
const decision = await workerManager.makeContinueDecision(
  '帮我继续优化代码'  // 新任务
);

if (decision.shouldContinue) {
  // 继续现有 Worker
  await workerManager.continueWorker(
    decision.recommendedWorkerId!, 
    '帮我继续优化代码'
  );
} else {
  // 创建新 Worker
  const newWorkerId = await workerManager.createWorker({
    description: '新 Worker',
    agentType: 'agent',
    prompt: '...'
  });
}
```

---

## 多 Worker 协作

```typescript
// 创建多个 Worker
const [writer, editor, reviewer] = await Promise.all([
  workerManager.createWorker({
    description: '文案撰写',
    agentType: 'specialist',
    prompt: '你是资深文案'
  }),
  workerManager.createWorker({
    description: '文案编辑',
    agentType: 'specialist',
    prompt: '你是文字编辑'
  }),
  workerManager.createWorker({
    description: '质量审核',
    agentType: 'specialist',
    prompt: '你是质量审核官'
  })
]);

// 并行工作
const [draft, edited, reviewed] = await Promise.all([
  workerManager.continueWorker(writer, '写文案', { waitForResponse: true }),
  workerManager.continueWorker(editor, '润色', { waitForResponse: true }),
  workerManager.continueWorker(reviewer, '审核', { waitForResponse: true })
]);
```

---

## 常用 API

```typescript
// 获取 Worker 列表
const workers = workerManager.getWorkers();

// 获取 Worker 详情
const worker = workerManager.getWorker(workerId);

// 获取统计
const stats = workerManager.getStats();
console.log(`活跃 Worker: ${stats.total}`);

// 清理已停止的 Worker
workerManager.cleanupStoppedWorkers(30); // 清理 30 分钟前的
```

---

## 运行测试

```bash
npm test
```

---

## 完整文档

查看 [docs/WORKER-MANAGER.md](docs/WORKER-MANAGER.md) 获取完整 API 参考和最佳实践。
