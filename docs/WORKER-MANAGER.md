# Orchestra Worker Manager 使用指南

## 📚 目录

- [概述](#概述)
- [核心功能](#核心功能)
- [快速开始](#快速开始)
- [API 参考](#api-参考)
- [决策系统](#决策系统)
- [最佳实践](#最佳实践)
- [示例代码](#示例代码)

---

## 概述

Orchestra Worker Manager 是一个多代理协调系统，用于创建、管理和协调多个子代理 Worker。

**设计灵感**: 参考 Claude Coordinator 模式，适配 OpenClaw sessions_spawn API

**核心价值**:
- 🎯 智能决策：自动判断是继续现有 Worker 还是创建新 Worker
- 🔄 上下文管理：支持上下文继承和会话复用
- ⚡ 高效协作：多个 Worker 并行工作，提升效率
- 🛠️ 完整生命周期：创建 → 运行 → 停止 → 清理

---

## 核心功能

### 1. Worker 创建工具 (对应 AGENT_TOOL_NAME)

创建新的子代理 Worker，支持配置：
- 描述 (description)
- 代理类型 (agentType: 'agent' | 'task' | 'flow' | 'specialist')
- 系统提示词 (prompt)
- 父 Worker ID (parentWorkerId) - 建立层级关系
- 初始消息 (initialMessage)

```typescript
const workerId = await workerManager.createWorker({
  description: '前端开发专家',
  agentType: 'specialist',
  prompt: '你是资深前端工程师，精通 React、TypeScript...',
  initialMessage: '请帮我创建一个 React 组件'
});
```

### 2. Worker 继续工具 (对应 SEND_MESSAGE_TOOL_NAME)

向现有 Worker 发送消息，复用上下文：
- 支持同步/异步模式
- 超时控制
- 自动更新 Worker 状态
- Token 估算

```typescript
const result = await workerManager.continueWorker(
  workerId, 
  '请添加 TypeScript 类型定义',
  { 
    waitForResponse: true, 
    timeoutMs: 60000 
  }
);
console.log('Worker 响应:', result.response);
```

### 3. Worker 停止工具 (对应 TASK_STOP_TOOL_NAME)

停止 Worker，支持：
- 优雅停止（发送结束消息）
- 立即停止
- 批量停止
- 自动清理

```typescript
// 优雅停止单个 Worker
await workerManager.stopWorker(workerId, {
  graceful: true,
  reason: '任务完成'
});

// 批量停止所有 Worker
await workerManager.stopAllWorkers({ graceful: true });
```

### 4. Continue vs. Spawn 决策逻辑

智能决策系统，基于三个维度评分：
1. **上下文重叠度** (40%) - Jaccard 相似度算法
2. **任务连续性** (40%) - 时间、关键词、消息历史
3. **资源效率** (20%) - Token 数、Worker 年龄

```typescript
const decision = await workerManager.makeContinueDecision(
  '帮我继续优化刚才的代码',
  ['worker_123', 'worker_456']  // 可选：指定评估范围
);

if (decision.shouldContinue) {
  console.log(`继续 Worker: ${decision.recommendedWorkerId}`);
  console.log(`得分：`, decision.scores);
  await workerManager.continueWorker(
    decision.recommendedWorkerId!, 
    '帮我继续优化...'
  );
} else {
  console.log('创建新 Worker:', decision.reason);
  const newWorkerId = await workerManager.createWorker({...});
}
```

---

## 快速开始

### 1. 安装依赖

```bash
cd orchestra
npm install
```

### 2. 导入模块

```typescript
import { workerManager } from './orchestra/src/worker-manager';
```

### 3. 创建 Worker

```typescript
const workerId = await workerManager.createWorker({
  description: '小红书内容创作专家',
  agentType: 'specialist',
  prompt: '你是小红书内容创作专家，擅长创作爆款笔记...',
  initialMessage: '请帮我写一篇关于 AI 助手的笔记'
});
```

### 4. 与 Worker 交互

```typescript
// 发送消息
await workerManager.continueWorker(workerId, '增加一些 emoji');

// 等待响应
const result = await workerManager.continueWorker(
  workerId, 
  '优化标题',
  { waitForResponse: true }
);
console.log(result.response);
```

### 5. 停止 Worker

```typescript
await workerManager.stopWorker(workerId, {
  graceful: true,
  reason: '内容已完成'
});
```

---

## API 参考

### WorkerManager 类

#### 创建 Worker

```typescript
createWorker(config: WorkerConfig): Promise<string>
```

**参数**:
- `config.description` (必填) - Worker 描述
- `config.agentType` (必填) - 代理类型
- `config.prompt` (必填) - 系统提示词
- `config.parentWorkerId` (可选) - 父 Worker ID
- `config.initialMessage` (可选) - 初始消息
- `config.model` (可选) - 模型配置
- `config.thinking` (可选) - 思考模式

**返回**: Worker ID (string)

---

#### 继续对话

```typescript
continueWorker(
  workerId: string, 
  message: string,
  options?: {
    waitForResponse?: boolean;
    timeoutMs?: number;
  }
): Promise<{ success: boolean; response?: string }>
```

**参数**:
- `workerId` - Worker ID
- `message` - 消息内容
- `options.waitForResponse` - 是否等待响应 (默认 false)
- `options.timeoutMs` - 超时时间 (默认 30000ms)

**返回**: 
- `success` - 是否成功
- `response` - Worker 响应内容 (仅当 waitForResponse=true)

---

#### 停止 Worker

```typescript
stopWorker(
  workerId: string, 
  options?: {
    graceful?: boolean;
    reason?: string;
  }
): Promise<{ success: boolean; workerId: string }>
```

**参数**:
- `workerId` - Worker ID
- `options.graceful` - 是否优雅停止 (默认 false)
- `options.reason` - 停止原因

**返回**: 
- `success` - 是否成功
- `workerId` - Worker ID

---

#### 决策系统

```typescript
makeContinueDecision(
  newTaskDescription: string,
  currentWorkers?: string[]
): Promise<ContinueDecision>
```

**参数**:
- `newTaskDescription` - 新任务描述
- `currentWorkers` - 可选：指定评估的 Worker 列表

**返回**: ContinueDecision
```typescript
interface ContinueDecision {
  shouldContinue: boolean;        // 是否继续
  reason: string;                 // 决策理由
  recommendedWorkerId?: string;   // 推荐的 Worker ID
  scores: DecisionScores;         // 决策得分
}

interface DecisionScores {
  contextOverlap: number;     // 上下文重叠度 (0-100)
  taskContinuity: number;     // 任务连续性 (0-100)
  resourceEfficiency: number; // 资源效率 (0-100)
  totalScore: number;         // 综合得分 (0-100)
}
```

---

#### 辅助方法

```typescript
// 获取 Worker 列表
getWorkers(filter?: { status?: WorkerStatus }): Worker[]

// 获取 Worker 详情
getWorker(workerId: string): Worker | undefined

// 获取活跃 Worker 数量
getActiveWorkerCount(): number

// 获取统计信息
getStats(): {
  total: number;
  byStatus: Record<WorkerStatus, number>;
  totalMessages: number;
  avgContextTokens: number;
}

// 清理已停止的 Worker
cleanupStoppedWorkers(olderThanMinutes?: number): number
```

---

## 决策系统

### 评分算法

**综合得分** = 上下文重叠度 × 40% + 任务连续性 × 40% + 资源效率 × 20%

**决策阈值**: ≥ 60 分 → 继续现有 Worker，< 60 分 → 创建新 Worker

### 1. 上下文重叠度 (Jaccard 相似度)

```
重叠度 = |A ∩ B| / |A ∪ B| × 100

A = Worker 描述 + 提示词的分词集合
B = 新任务描述的分词集合
```

**示例**:
- Worker: "前端开发专家，精通 React、TypeScript"
- 任务: "继续优化 React 组件"
- 重叠词: ["react", "组件", "优化"]
- 重叠度: 65 分

### 2. 任务连续性

| 因素 | 得分 |
|------|------|
| 5 分钟内活跃 | +30 |
| 30 分钟内活跃 | +20 |
| 1 小时内活跃 | +10 |
| 有消息历史 | +2 × 消息数 (最多 20) |
| 包含连续性关键词 | +15 |

**连续性关键词**: 继续、接着、然后、下一步、continue、next

### 3. 资源效率

| 因素 | 得分 |
|------|------|
| Token < 1000 | +30 |
| Token < 5000 | +20 |
| Token < 10000 | +10 |
| Worker 年龄 < 10 分钟 | +20 |
| Worker 年龄 < 60 分钟 | +10 |

---

## 最佳实践

### 1. 合理选择 Worker 类型

```typescript
// 复杂任务：使用 specialist
await workerManager.createWorker({
  description: '前端架构师',
  agentType: 'specialist',
  prompt: '你是资深前端架构师...'
});

// 简单任务：使用 task
await workerManager.createWorker({
  description: '代码审查',
  agentType: 'task',
  prompt: '审查这段代码...'
});
```

### 2. 利用决策系统

```typescript
// 不要手动判断，让系统决定
const decision = await workerManager.makeContinueDecision('新任务');

if (decision.shouldContinue) {
  // 复用现有 Worker，节省资源
  await workerManager.continueWorker(decision.recommendedWorkerId!, '...');
} else {
  // 创建新 Worker，避免上下文污染
  await workerManager.createWorker({...});
}
```

### 3. 优雅停止 Worker

```typescript
// 任务完成后，优雅停止
await workerManager.stopWorker(workerId, {
  graceful: true,  // 发送结束消息
  reason: '任务完成'
});
```

### 4. 定期清理

```typescript
// 每小时清理一次已停止的 Worker
setInterval(() => {
  workerManager.cleanupStoppedWorkers(60); // 清理 1 小时前的
}, 3600000);
```

### 5. 监控统计

```typescript
// 定期检查 Worker 状态
const stats = workerManager.getStats();
console.log(`活跃 Worker: ${stats.byStatus[WorkerStatus.RUNNING]}`);
console.log(`平均 Token: ${stats.avgContextTokens}`);

// 如果活跃 Worker 过多，考虑停止一些
if (stats.byStatus[WorkerStatus.RUNNING] > 10) {
  console.warn('活跃 Worker 过多，建议优化');
}
```

---

## 示例代码

### 示例 1: 单 Worker 完整流程

```typescript
import { workerManager } from './worker-manager';

async function singleWorkerExample() {
  // 1. 创建
  const workerId = await workerManager.createWorker({
    description: '文案助手',
    agentType: 'agent',
    prompt: '你是文案助手，擅长写小红书文案',
    initialMessage: '帮我写一篇关于咖啡的笔记'
  });

  // 2. 多轮对话
  await workerManager.continueWorker(workerId, '增加一些 emoji');
  await workerManager.continueWorker(workerId, '优化标题');
  
  const result = await workerManager.continueWorker(
    workerId, 
    '生成 tags',
    { waitForResponse: true }
  );
  console.log('Tags:', result.response);

  // 3. 停止
  await workerManager.stopWorker(workerId, {
    graceful: true,
    reason: '文案已完成'
  });
}
```

### 示例 2: 多 Worker 协作

```typescript
async function multiWorkerCollaboration() {
  // 创建不同角色的 Worker
  const [writer, editor, reviewer] = await Promise.all([
    workerManager.createWorker({
      description: '文案撰写',
      agentType: 'specialist',
      prompt: '你是资深文案，擅长创作爆款内容'
    }),
    workerManager.createWorker({
      description: '文案编辑',
      agentType: 'specialist',
      prompt: '你是文字编辑，擅长润色和优化'
    }),
    workerManager.createWorker({
      description: '质量审核',
      agentType: 'specialist',
      prompt: '你是质量审核官，确保内容准确'
    })
  ]);

  // 并行工作
  const [draft, edited, reviewed] = await Promise.all([
    workerManager.continueWorker(writer, '写一篇关于 AI 的笔记', { waitForResponse: true }),
    workerManager.continueWorker(editor, '润色这篇文案...', { waitForResponse: true }),
    workerManager.continueWorker(reviewer, '审核内容准确性', { waitForResponse: true })
  ]);

  console.log('初稿:', draft.response);
  console.log('编辑后:', edited.response);
  console.log('审核后:', reviewed.response);

  // 全部停止
  await workerManager.stopAllWorkers({ graceful: true });
}
```

### 示例 3: 智能决策

```typescript
async function smartDecisionExample() {
  // 创建 Worker
  const workerId = await workerManager.createWorker({
    description: '前端开发',
    agentType: 'specialist',
    prompt: 'React 专家'
  });

  // 任务 1: 相关任务 → 应该继续
  const decision1 = await workerManager.makeContinueDecision(
    '继续优化这个 React 组件',
    [workerId]
  );
  console.log('决策 1:', decision1.shouldContinue); // true

  // 任务 2: 不相关任务 → 应该新建
  const decision2 = await workerManager.makeContinueDecision(
    '帮我做一道数学题',
    [workerId]
  );
  console.log('决策 2:', decision2.shouldContinue); // false
}
```

### 示例 4: 层级 Worker

```typescript
async function hierarchicalWorkers() {
  // 创建父 Worker (Coordinator)
  const coordinatorId = await workerManager.createWorker({
    description: '项目协调员',
    agentType: 'agent',
    prompt: '你负责协调多个子任务'
  });

  // 创建子 Worker
  const child1 = await workerManager.createWorker({
    description: '前端开发',
    agentType: 'task',
    prompt: '负责前端',
    parentWorkerId: coordinatorId
  });

  const child2 = await workerManager.createWorker({
    description: '后端开发',
    agentType: 'task',
    prompt: '负责后端',
    parentWorkerId: coordinatorId
  });

  // 协调员协调子任务
  await workerManager.continueWorker(coordinatorId, '协调前端和后端的工作');
}
```

### 示例 5: 监控和统计

```typescript
async function monitoringExample() {
  // 创建多个 Worker
  await Promise.all([
    workerManager.createWorker({ description: 'Worker 1', agentType: 'agent', prompt: '测试' }),
    workerManager.createWorker({ description: 'Worker 2', agentType: 'agent', prompt: '测试' }),
    workerManager.createWorker({ description: 'Worker 3', agentType: 'agent', prompt: '测试' })
  ]);

  // 发送消息
  const workers = workerManager.getWorkers();
  for (const worker of workers) {
    await workerManager.continueWorker(worker.workerId, '你好');
  }

  // 查看统计
  const stats = workerManager.getStats();
  console.log('=== Worker 统计 ===');
  console.log(`总数：${stats.total}`);
  console.log(`空闲：${stats.byStatus[WorkerStatus.IDLE]}`);
  console.log(`运行中：${stats.byStatus[WorkerStatus.RUNNING]}`);
  console.log(`已停止：${stats.byStatus[WorkerStatus.STOPPED]}`);
  console.log(`总消息数：${stats.totalMessages}`);
  console.log(`平均 Token: ${stats.avgContextTokens}`);
}
```

---

## 运行测试

```bash
# 运行所有测试
npm test

# 运行测试并生成覆盖率报告
npm run test:coverage

# 监听模式
npm run test:watch
```

---

## 故障排除

### Worker 不响应

**可能原因**:
1. 超时时间太短
2. Worker 会话异常

**解决方案**:
```typescript
// 增加超时时间
await workerManager.continueWorker(workerId, '消息', {
  timeoutMs: 120000  // 2 分钟
});
```

### 决策系统不准确

**调整阈值**:
```typescript
// 修改决策阈值 (默认 60)
const CONTINUE_THRESHOLD = 70;  // 提高阈值，更倾向于创建新 Worker
```

### 内存占用过高

**定期清理**:
```typescript
// 每 30 分钟清理一次
setInterval(() => {
  workerManager.cleanupStoppedWorkers(30);
}, 1800000);
```

---

## 更新日志

### v1.0.0 (2026-04-03)
- ✅ Worker 创建工具
- ✅ Worker 继续工具
- ✅ Worker 停止工具
- ✅ Continue vs. Spawn 决策逻辑
- ✅ 完整的单元测试
- ✅ 详细文档

---

## 许可证

MIT License
