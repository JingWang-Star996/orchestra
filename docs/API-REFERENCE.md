# Orchestra API 文档

**版本**: v2.0.0  
**最后更新**: 2026-04-03

---

## 📋 目录

- [FourPhaseWorkflow](#fourphaseworkflow)
- [WorkerManager](#workermanager)
- [TaskNotificationManager](#tasknotificationmanager)
- [DashboardManager](#dashboardmanager)
- [MLOptimizer](#mloptimizer)
- [DistributedManager](#distributedmanager)
- [工具函数](#工具函数)

---

## FourPhaseWorkflow

四阶段工作流编排器。

### 构造函数

```typescript
new FourPhaseWorkflow(config: FourPhaseConfig)
```

**参数**:

```typescript
interface FourPhaseConfig {
  name: string;                    // 工作流名称（必填）
  description: string;             // 工作流描述（必填）
  maxWorkers?: number;             // 最大 Worker 数量（默认 3）
  timeout?: number;                // 超时时间，毫秒（默认 30 分钟）
}
```

**示例**:

```javascript
const workflow = new FourPhaseWorkflow({
  name: 'Bug 修复工作流',
  description: '修复用户登录问题',
  maxWorkers: 5,
  timeout: 60 * 60 * 1000  // 1 小时
});
```

---

### execute(context)

执行完整工作流。

**参数**:

```typescript
interface TaskContext {
  bugReport?: string;              // Bug 报告（三选一）
  featureRequest?: string;         // 功能需求（三选一）
  refactorGoal?: string;           // 重构目标（三选一）
  
  codebasePath?: string;           // 代码路径
  searchQueries?: string[];        // 搜索关键词
  errorLogs?: string;              // 错误日志
  
  testCommand?: string;            // 测试命令
  manualVerificationSteps?: string;// 手动验证步骤
}
```

**返回**:

```typescript
interface WorkflowResult {
  success: boolean;
  phases: {
    research?: {
      findings: string[];
      filesAnalyzed: string[];
      issues: string[];
    };
    synthesis?: {
      problemStatement: string;
      rootCause?: string;
      solutionSpec: string;
      affectedFiles: string[];
      testPlan: string;
    };
    implementation?: {
      filesModified: string[];
      changesSummary: string;
    };
    verification?: {
      testsRun: number;
      testsPassed: number;
      testsFailed: number;
      verificationReport: string;
    };
  };
  summary: string;
}
```

**示例**:

```javascript
const result = await workflow.execute({
  bugReport: '用户登录时出现 500 错误',
  codebasePath: '/src/auth',
  searchQueries: ['login', 'authentication'],
  testCommand: 'npm test -- auth'
});

console.log(result.summary);
```

---

### executeResearchPhase(context)

仅执行研究阶段。

**返回**:

```typescript
interface ResearchResult {
  findings: string[];
  filesAnalyzed: string[];
  issues: string[];
}
```

---

### executeSynthesisPhase(context, research)

执行综合阶段。

**参数**:
- `context`: TaskContext
- `research`: ResearchResult

**返回**:

```typescript
interface SynthesisResult {
  problemStatement: string;
  rootCause?: string;
  solutionSpec: string;
  affectedFiles: string[];
  testPlan: string;
}
```

---

## WorkerManager

Worker 生命周期管理器。

### 构造函数

```typescript
new WorkerManager(config: WorkerManagerConfig)
```

**参数**:

```typescript
interface WorkerManagerConfig {
  storage?: 'memory' | 'file';     // 存储类型（默认 'memory'）
  storagePath?: string;            // 文件存储路径
  maxWorkers?: number;             // 最大 Worker 数量（默认 10）
  autoSave?: boolean;              // 自动保存（默认 true）
  verbose?: boolean;               // 详细日志（默认 false）
}
```

**示例**:

```javascript
const manager = new WorkerManager({
  storage: 'file',
  storagePath: './temp/workers',
  maxWorkers: 10,
  verbose: true
});
```

---

### create(options)

创建新 Worker。

**参数**:

```typescript
interface CreateOptions {
  description: string;             // Worker 描述（必填）
  prompt?: string;                 // 系统提示词
  agentType?: 'agent' | 'task' | 'flow' | 'specialist';
  parentWorkerId?: string;         // 父 Worker ID
  initialMessage?: string;         // 初始消息
  timeoutSeconds?: number;         // 超时时间（默认 3600）
}
```

**返回**:

```typescript
interface CreateResult {
  workerId: string;
  sessionId: string;
  status: 'created';
}
```

**示例**:

```javascript
const { workerId } = await manager.create({
  description: '前端开发专家',
  prompt: '你是资深前端工程师，精通 React、TypeScript...',
  timeoutSeconds: 3600
});
```

---

### continue(workerId, message, options)

向 Worker 发送消息。

**参数**:
- `workerId`: string - Worker ID
- `message`: string - 消息内容
- `options`: ContinueOptions（可选）

```typescript
interface ContinueOptions {
  waitForResponse?: boolean;       // 等待响应（默认 true）
  timeoutMs?: number;              // 超时时间（默认 60000）
}
```

**返回**:

```typescript
interface ContinueResult {
  workerId: string;
  status: 'completed' | 'failed';
  output?: string;
  usage: {
    totalTokens: number;
    toolUses: number;
    durationMs: number;
  };
}
```

**示例**:

```javascript
const result = await manager.continue(workerId, '请帮我创建组件', {
  waitForResponse: true,
  timeoutMs: 60000
});

console.log('Worker 响应:', result.output);
```

---

### stop(options)

停止 Worker。

**参数**:

```typescript
interface StopOptions {
  task_id: string;                 // Worker ID（必填）
  graceful?: boolean;              // 优雅停止（默认 true）
  reason?: string;                 // 停止原因
}
```

**示例**:

```javascript
await manager.stop({
  task_id: 'agent-x7q',
  graceful: true,
  reason: '任务完成'
});
```

---

### getWorkerStatus(workerId)

获取 Worker 状态。

**返回**:

```typescript
interface WorkerStatus {
  workerId: string;
  status: 'created' | 'running' | 'completed' | 'failed';
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  messagesSent: number;
  tokensUsed: number;
  durationMs: number;
}
```

---

### getAllStatus()

获取所有 Worker 状态。

**返回**: `WorkerStatus[]`

---

### search(query, options)

搜索 Worker。

**参数**:

```typescript
interface SearchOptions {
  status?: string;
  limit?: number;                  // 默认 100
}
```

**返回**: `WorkerStatus[]`

---

### exportHistory(options)

导出历史记录。

**参数**:

```typescript
interface ExportOptions {
  format?: 'json' | 'csv';         // 导出格式
  includeDetails?: boolean;        // 包含详细信息
}
```

---

## TaskNotificationManager

任务通知管理器。

### 构造函数

```typescript
new TaskNotificationManager(config: TaskNotificationConfig)
```

**参数**:

```typescript
interface TaskNotificationConfig {
  storage?: 'memory' | 'file';
  storagePath?: string;
  maxHistorySize?: number;         // 最大历史记录数（默认 1000）
  verbose?: boolean;
}
```

---

### send(notification)

发送通知。

**参数**:

```typescript
interface Notification {
  taskId: string;                  // 任务 ID（必填）
  status: 'completed' | 'failed' | 'killed';  // 状态（必填）
  summary: string;                 // 摘要（必填）
  result?: string;                 // 详细结果
  usage?: {
    totalTokens: number;
    toolUses: number;
    durationMs: number;
  };
}
```

**示例**:

```javascript
await manager.send({
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

---

### search(query, options)

搜索通知。

**参数**:

```typescript
interface SearchOptions {
  status?: string;
  startTime?: string;              // ISO 8601
  endTime?: string;                // ISO 8601
  limit?: number;                  // 默认 100
}
```

**返回**: `Notification[]`

---

### getStatistics()

获取统计信息。

**返回**:

```typescript
interface Statistics {
  total: number;
  byStatus: {
    completed: number;
    failed: number;
    killed: number;
  };
  avgTokens: number;
  avgDuration: number;
}
```

---

### clear()

清空历史记录。

---

## DashboardManager

监控 Dashboard 管理器。

### 构造函数

```typescript
new DashboardManager(config: DashboardConfig)
```

**参数**:

```typescript
interface DashboardConfig {
  port?: number;                   // Web 服务端口（默认 3000）
  refreshInterval?: number;        // 刷新间隔，毫秒（默认 5000）
  storage?: 'memory' | 'file';
  storagePath?: string;
}
```

---

### start()

启动 Dashboard 服务。

**返回**: `Promise<void>`

---

### stop()

停止 Dashboard 服务。

---

### addAlertRule(rule)

添加告警规则。

**参数**:

```typescript
interface AlertRule {
  name: string;                    // 规则名称
  condition: (metrics) => boolean; // 条件函数
  action: 'notify' | 'webhook' | 'email';
  channel?: string;                // 通知渠道
  webhook?: string;                // Webhook URL
  email?: string;                  // 邮箱地址
  message: string;                 // 告警消息
}
```

**示例**:

```javascript
dashboard.addAlertRule({
  name: 'Worker 失败率过高',
  condition: (metrics) => {
    return metrics.failedWorkers / metrics.totalWorkers > 0.2;
  },
  action: 'webhook',
  webhook: 'https://hooks.slack.com/services/xxx',
  message: '⚠️ Worker 失败率超过 20%'
});
```

---

## MLOptimizer

机器学习优化器。

### 构造函数

```typescript
new MLOptimizer(config: MLOptimizerConfig)
```

**参数**:

```typescript
interface MLOptimizerConfig {
  storage?: 'memory' | 'file';
  storagePath?: string;
  maxHistorySize?: number;         // 最大历史记录数（默认 10000）
}
```

---

### recordDecision(decision)

记录决策。

**参数**:

```typescript
interface DecisionRecord {
  taskId: string;
  decision: 'continue' | 'spawn';
  context: {
    overlapScore: number;
    continuityScore: number;
    efficiencyScore: number;
  };
  weights: {
    overlap: number;
    continuity: number;
    efficiency: number;
  };
  totalScore: number;
  result: 'success' | 'failure';
}
```

---

### optimizeWeights(options)

优化权重。

**参数**:

```typescript
interface OptimizeOptions {
  minSamples?: number;             // 最少样本数（默认 100）
  algorithm?: 'grid_search' | 'gradient_descent';
  targetMetric?: 'success_rate' | 'avg_duration' | 'token_efficiency';
}
```

**返回**:

```typescript
interface OptimizedWeights {
  overlap: number;
  continuity: number;
  efficiency: number;
}
```

---

### createABTest(test)

创建 A/B 测试。

**参数**:

```typescript
interface ABTest {
  name: string;
  variantA: {
    name: string;
    weights: { overlap: number; continuity: number; efficiency: number };
  };
  variantB: {
    name: string;
    weights: { overlap: number; continuity: number; efficiency: number };
  };
  trafficSplit?: number;           // 流量分配（默认 0.5）
  duration?: number;               // 持续时间，秒
}
```

---

### getABTestResults(testId)

获取 A/B 测试结果。

---

## DistributedManager

分布式管理器。

### 构造函数

```typescript
new DistributedManager(config: DistributedConfig)
```

**参数**:

```typescript
interface DistributedConfig {
  instanceId: string;              // 实例 ID（必填）
  cluster: string[];               // 集群实例列表
  coordination: {
    type: 'redis' | 'etcd' | 'consul';
    host: string;
    port: number;
    password?: string;
  };
}
```

---

### register()

注册实例。

---

### unregister()

注销实例。

---

### heartbeat()

发送心跳。

---

### syncWorkerState(state)

同步 Worker 状态。

---

### syncNotification(notification)

同步通知。

---

### getGlobalState()

获取全局状态。

**返回**:

```typescript
interface GlobalState {
  totalInstances: number;
  activeWorkers: number;
  totalTokens: number;
  avgDuration: number;
}
```

---

## 工具函数

### executeWithConcurrency(tasks, limit, fn)

带并发限制的任务执行。

**参数**:
- `tasks`: any[] - 任务列表
- `limit`: number - 最大并发数
- `fn`: (task) => Promise - 执行函数

**返回**: `Promise<any[]>`

**示例**:

```javascript
const results = await executeWithConcurrency(
  tasks,
  3,  // 最多 3 个并发
  async (task) => await worker.execute(task)
);
```

---

### withTimeout(promise, timeoutMs, errorMessage)

超时控制包装器。

**参数**:
- `promise`: Promise - 待执行的 Promise
- `timeoutMs`: number - 超时时间
- `errorMessage`: string - 超时错误消息

**返回**: `Promise<any>`

**示例**:

```javascript
const result = await withTimeout(
  workflow.execute(context),
  30 * 60 * 1000,  // 30 分钟
  '工作流执行超时'
);
```

---

### createRetryableAPI(fn, config)

创建可重试的 API 调用器。

**参数**:

```typescript
interface RetryConfig {
  maxRetries?: number;             // 最大重试次数（默认 3）
  initialDelayMs?: number;         // 初始延迟（默认 1000）
  maxDelayMs?: number;             // 最大延迟（默认 30000）
  backoffMultiplier?: number;      // 退避倍数（默认 2）
  jitter?: boolean;                // 添加随机抖动（默认 true）
  onRetry?: (err, attempt, delay) => void;
}
```

**示例**:

```javascript
const processWithRetry = createRetryableAPI(process, {
  maxRetries: 3,
  onRetry: (err, attempt, delay) => {
    console.warn(`API 调用失败，${delay}ms 后重试 ${attempt}/3`);
  }
});

const result = await processWithRetry({
  action: 'send-keys',
  sessionId,
  text
});
```

---

## 错误处理

### 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `sessions_spawn is not available` | OpenClaw API 不可用 | 检查 API 配置或使用降级模式 |
| `Worker not found` | Worker ID 不存在 | 检查 Worker ID 是否正确 |
| `Timeout exceeded` | 执行超时 | 增加 timeout 或优化任务 |
| `Permission denied` | 权限不足 | 检查 ACL 配置 |

### 错误捕获

```javascript
try {
  const result = await workflow.execute(context);
} catch (error) {
  if (error.code === 'TIMEOUT') {
    console.log('执行超时，考虑增加 timeout 配置');
  } else if (error.code === 'WORKER_NOT_FOUND') {
    console.log('Worker 不存在，检查 Worker ID');
  } else {
    console.error('未知错误:', error.message);
  }
}
```

---

**维护者**: AI CTO  
**联系方式**: orchestra-team@example.com  
**最后更新**: 2026-04-03
