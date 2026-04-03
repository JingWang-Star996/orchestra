# Orchestra - 多 Agent 协作框架

**版本**: v2.0.0 (P2 完成)  
**状态**: ✅ P0/P1/P2 全部完成  
**最后更新**: 2026-04-03

---

## 📋 概述

Orchestra 是一个基于 Claude Coordinator 模式的多 Agent 协作框架，深度集成 OpenClaw API。

**核心价值**：
- 🎯 四阶段工作流 - Research → Synthesis → Implementation → Verification
- 🤖 多 Worker 并行 - 支持多个子代理同时工作
- 📦 持久化支持 - 通知历史、Worker 状态自动保存
- 🔄 智能重试 - 指数退避 + 随机抖动
- 🔐 权限控制 - ACL 访问控制列表
- 📊 监控 Dashboard - Worker 状态可视化
- 🧠 ML 优化 - 决策权重自动调整
- 🌐 分布式支持 - 多实例部署

---

## 🚀 快速开始

### 安装

```bash
npm install orchestra
```

### 基础示例

```typescript
import { FourPhaseWorkflow } from 'orchestra';

// 创建工作流
const workflow = new FourPhaseWorkflow({
  name: 'Bug 修复工作流',
  description: '修复用户登录问题'
});

// 执行工作流
const result = await workflow.execute({
  bugReport: '用户点击登录按钮后页面无响应',
  codebasePath: '/src/auth',
  searchQueries: ['login', 'authentication'],
  testCommand: 'npm test -- auth'
});

console.log(result.summary);
```

---

## 📊 开发进展

### ✅ P0 阶段：OpenClaw API 集成（完成）

| 模块 | 状态 | 说明 |
|------|------|------|
| WorkerManager | ✅ 完成 | sessions_spawn + process API 集成 |
| Gateway | ✅ 完成 | 单 Agent + 编辑部工作流 + 游戏设计工作流 |
| ParallelExecutor | ✅ 完成 | HTTPS API 调用 |

**核心能力**：
- ✅ 真实子代理会话创建
- ✅ 消息发送与轮询
- ✅ Token 估算
- ✅ 超时控制
- ✅ 降级支持

---

### ✅ P1 阶段：系统优化（完成）

| 模块 | 状态 | 说明 |
|------|------|------|
| 持久化支持 | ✅ 完成 | TaskNotification + WorkerManager 文件存储 |
| 重试机制 | ✅ 完成 | 指数退避 + 随机抖动 |
| 权限控制 | ✅ 完成 | ACL 访问控制列表 |
| 集成测试 | ⚠️ 部分 | CLI 测试可用 |

**核心能力**：
- ✅ 内存/文件双存储模式
- ✅ 自动保存与加载
- ✅ 搜索与统计功能
- ✅ 错误分类（可重试 vs 不可重试）
- ✅ 权限级别（NONE/READ/WRITE/SHARE/ADMIN）

---

### ✅ P2 阶段：功能扩展（完成）

| 模块 | 状态 | 说明 |
|------|------|------|
| 监控 Dashboard | ✅ 完成 | Web UI + Worker 状态可视化 |
| ML 优化 | ✅ 完成 | 决策权重自动调整 |
| 分布式支持 | ✅ 完成 | 多实例部署 + 消息队列 |

**核心能力**：
- ✅ 实时监控 Worker 状态
- ✅ 性能指标收集与告警
- ✅ 决策历史学习与优化
- ✅ 多实例数据同步
- ✅ RabbitMQ/Kafka 集成

---

## 🏗️ 架构设计

### 四阶段工作流

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Phase 1    │    │  Phase 2    │    │  Phase 3    │    │  Phase 4    │
│  Research   │ -> │  Synthesis  │ -> │  Implementation │ -> │ Verification │
│  (Workers)  │    │ (Coordinator)│   │  (Workers)  │    │  (Workers)  │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

### 核心组件

| 组件 | 职责 | 阶段 |
|------|------|------|
| **Worker** | 执行具体任务 | Research, Implementation, Verification |
| **Coordinator** | 综合信息、制定规范 | Synthesis |
| **Scratchpad** | 阶段间数据共享 | 所有阶段 |
| **WorkerManager** | Worker 生命周期管理 | 全局 |
| **TaskNotification** | 任务通知系统 | 全局 |
| **Gateway** | 请求路由与编排 | 全局 |

---

## 📦 核心功能

### 1. WorkerManager

管理 Worker 的创建、执行、停止。

```typescript
const manager = new WorkerManager({
  storage: 'file',              // 'memory' | 'file'
  storagePath: './temp/workers',
  maxWorkers: 10,
  verbose: true
});

// 创建 Worker
const { workerId } = await manager.create({
  description: '前端开发专家',
  prompt: '你是资深前端工程师...',
  timeoutSeconds: 3600
});

// 发送消息
const result = await manager.continue(workerId, '请帮我创建组件');

// 停止 Worker
await manager.stop({ task_id: workerId, reason: '任务完成' });
```

### 2. TaskNotification

结构化任务通知系统。

```typescript
const manager = new TaskNotificationManager({
  storage: 'file',
  storagePath: './temp/notifications',
  maxHistorySize: 1000
});

// 发送通知
await manager.send({
  taskId: 'agent-x7q',
  status: 'completed',
  summary: '研究完成',
  result: '找到 3 个关键文件',
  usage: { totalTokens: 1234, toolUses: 5, durationMs: 5000 }
});

// 搜索通知
const results = manager.search('任务完成', {
  status: 'completed',
  limit: 100
});

// 获取统计
const stats = manager.getStatistics();
```

### 3. 重试机制

指数退避 + 随机抖动。

```typescript
const { withRetry, pollWithRetry, createRetryableAPI } = require('./retryUtils');

// 基础重试
const result = await withRetry(
  () => process({ action: 'send-keys', sessionId, text }),
  { maxRetries: 3 }
);

// 轮询重试
const pollResult = await pollWithRetry(
  () => process({ action: 'poll', sessionId }),
  { timeoutMs: 60000, intervalMs: 2000 }
);

// 创建可重试 API
const processWithRetry = createRetryableAPI(process, { maxRetries: 3 });
```

### 4. 权限控制

ACL 访问控制列表。

```typescript
const { AccessControlManager, PermissionLevel } = require('./accessControl');

const acm = new AccessControlManager();

// 初始化任务 ACL
acm.initialize('task-001', 'worker-owner');

// 授予权限
acm.grantPermission(
  'task-001',
  'worker-collaborator',
  [PermissionLevel.READ, PermissionLevel.WRITE],
  'worker-owner',
  Date.now() + 3600000  // 1 小时后过期
);

// 检查权限
if (acm.hasPermission('task-001', 'worker-collaborator', 'read')) {
  // 允许读取
}
```

---

## 🎯 使用场景

### 场景 1: Bug 修复

```typescript
const workflow = new FourPhaseWorkflow({
  name: '支付 Bug 修复',
  description: '修复支付失败问题'
});

await workflow.execute({
  bugReport: '用户支付时出现 500 错误',
  codebasePath: '/src/payment',
  searchQueries: ['payment', 'checkout', 'error'],
  errorLogs: 'Error: Payment gateway timeout...',
  testCommand: 'npm test -- payment'
});
```

### 场景 2: 新功能开发

```typescript
const workflow = new FourPhaseWorkflow({
  name: '用户评论功能',
  description: '实现文章评论系统'
});

await workflow.execute({
  featureRequest: '用户需要对文章进行评论、点赞、回复',
  codebasePath: '/src/comment',
  searchQueries: ['comment', 'reply', 'like'],
  testCommand: 'npm test -- comment'
});
```

### 场景 3: 代码重构

```typescript
const workflow = new FourPhaseWorkflow({
  name: '认证模块重构',
  description: '提升认证模块可维护性',
  timeout: 60 * 60 * 1000  // 1 小时
});

await workflow.execute({
  refactorGoal: '将认证逻辑拆分为独立服务',
  codebasePath: '/src/auth',
  searchQueries: ['auth', 'token', 'session'],
  testCommand: 'npm test -- auth'
});
```

---

## 📊 输出结果

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

---

## 🔧 高级用法

### 自定义 Worker 行为

```typescript
const customWorker = new Worker({
  id: 'specialist-worker',
  systemPrompt: '你是一位资深的前端工程师，专注于 React 性能优化',
  maxRetries: 5
});
```

### 手动控制阶段

```typescript
const workflow = new FourPhaseWorkflow({ name: 'Custom' });

// 分阶段执行
const research = await workflow.executeResearchPhase(context);
const synthesis = await workflow.executeSynthesisPhase(context, research);
const implementation = await workflow.executeImplementationPhase(context, synthesis);
const verification = await workflow.executeVerificationPhase(context, implementation);
```

### 并发控制

```typescript
import { executeWithConcurrency } from './core';

const results = await executeWithConcurrency(
  tasks,
  3,  // 最多 3 个并发
  async (task) => await worker.execute(task, scratchpad)
);
```

---

## 🏗️ 架构设计

### 设计原则

1. **阶段分离**: 每个阶段职责单一
2. **并行执行**: Research/Implementation/Verification 支持并行
3. **数据共享**: Scratchpad 实现阶段间数据传递
4. **错误恢复**: Worker 支持重试机制
5. **可扩展**: 易于添加新任务类型

### 数据流

```
Context → Research → Scratchpad → Synthesis → Scratchpad → Implementation → Scratchpad → Verification → Result
              ↓                        ↓                        ↓                        ↓
          Workers                  Coordinator              Workers                  Workers
```

---

## 📝 最佳实践

### 1. 明确任务上下文

```typescript
// ✅ 好的做法
await workflow.execute({
  bugReport: '详细描述问题现象、复现步骤、期望行为',
  codebasePath: '/src/specific-module',
  searchQueries: ['specific-keyword-1', 'specific-keyword-2']
});

// ❌ 避免过于模糊
await workflow.execute({
  bugReport: '有问题',
  codebasePath: '/src'
});
```

### 2. 合理设置超时

```typescript
// Bug 修复：30 分钟
const bugFix = new FourPhaseWorkflow({ timeout: 30 * 60 * 1000 });

// 代码重构：1-2 小时
const refactor = new FourPhaseWorkflow({ timeout: 90 * 60 * 1000 });

// 新功能开发：1 小时
const feature = new FourPhaseWorkflow({ timeout: 60 * 60 * 1000 });
```

### 3. 利用 Scratchpad 追踪进度

```typescript
scratchpad.log('开始研究阶段');
scratchpad.set('metrics:startTime', Date.now());

const duration = Date.now() - scratchpad.get('metrics:startTime');
scratchpad.set('metrics:researchDuration', duration);
```

---

## 🔍 调试技巧

### 启用详细日志

```typescript
const workerManager = new WorkerManager({
  verbose: true,
  maxWorkers: 10
});
```

### 检查 Worker 状态

```typescript
const status = workerManager.getWorkerStatus('agent-x7q');
console.log(status);

const allStatus = workerManager.getAllStatus();
console.log(allStatus);
```

### 导出历史记录

```typescript
const history = workerManager.exportHistory();
console.log(JSON.stringify(history, null, 2));
```

---

## 📚 相关文档

- [docs/OPENCLAW-INTEGRATION.md](./docs/OPENCLAW-INTEGRATION.md) - OpenClaw API 集成指南
- [docs/P1-COMPLETION-REPORT.md](./docs/P1-COMPLETION-REPORT.md) - P1 阶段完成报告
- [docs/P2-SUMMARY.md](./docs/P2-SUMMARY.md) - P2 阶段总结
- [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) - 部署指南
- [docs/USER-MANUAL.md](./docs/USER-MANUAL.md) - 用户手册
- [USAGE.md](./USAGE.md) - 详细使用指南
- [QUICKSTART.md](./QUICKSTART.md) - 快速开始

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 如何贡献

1. Fork 仓库
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 创建 Pull Request

### 报告问题

- 使用 GitHub Issues
- 包含版本信息
- 提供复现步骤
- 附上错误日志

---

## 📄 许可证

MIT License

---

**维护者**: AI CTO  
**联系方式**: orchestra-team@example.com  
**最后更新**: 2026-04-03
