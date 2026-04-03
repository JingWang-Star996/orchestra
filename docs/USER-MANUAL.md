# Orchestra 用户手册

**版本**: v2.0.0  
**最后更新**: 2026-04-03

---

## 📋 目录

- [入门指南](#入门指南)
- [核心功能](#核心功能)
- [工作流使用](#工作流使用)
- [Worker 管理](#worker-管理)
- [任务通知](#任务通知)
- [监控 Dashboard](#监控-dashboard)
- [最佳实践](#最佳实践)
- [常见问题](#常见问题)

---

## 入门指南

### 什么是 Orchestra？

Orchestra 是一个多 Agent 协作框架，帮助你：
- 🎯 自动化复杂任务（Bug 修复、功能开发、代码重构）
- 🤖 协调多个 AI 代理并行工作
- 📊 实时监控任务进度和性能
- 🔄 智能重试和错误恢复

### 快速开始（5 分钟）

#### 1. 安装

```bash
npm install orchestra
```

#### 2. 创建第一个工作流

```javascript
const { FourPhaseWorkflow } = require('orchestra');

const workflow = new FourPhaseWorkflow({
  name: '我的第一个工作流',
  description: '学习 Orchestra 基础'
});

const result = await workflow.execute({
  bugReport: '用户登录时出现错误',
  codebasePath: '/src/auth',
  searchQueries: ['login', 'auth'],
  testCommand: 'npm test -- auth'
});

console.log(result.summary);
```

#### 3. 查看结果

```
✅ 工作流执行完成

研究阶段：找到 3 个相关文件
综合阶段：识别根本原因，制定解决方案
实现阶段：修改 2 个文件
验证阶段：通过 15/15 测试
```

---

## 核心功能

### 1. 四阶段工作流

Orchestra 将复杂任务分解为四个阶段：

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Research   │ -> │  Synthesis  │ -> │  Implementation │ -> │ Verification │
│   研究阶段   │    │   综合阶段   │    │    实现阶段    │    │   验证阶段   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

**各阶段说明**：

| 阶段 | 执行者 | 输出 |
|------|--------|------|
| **研究** | 多个 Worker 并行 | 研究发现、文件列表、问题清单 |
| **综合** | Coordinator | 问题陈述、解决方案、测试计划 |
| **实现** | 多个 Worker 并行 | 修改的文件、变更摘要 |
| **验证** | 多个 Worker 并行 | 测试报告、通过率 |

### 2. Worker 管理

Worker 是执行具体任务的 Agent。

```javascript
const { WorkerManager } = require('orchestra');

const manager = new WorkerManager({
  storage: 'file',
  storagePath: './temp/workers',
  maxWorkers: 10
});

// 创建 Worker
const { workerId } = await manager.create({
  description: '前端开发专家',
  prompt: '你是资深前端工程师...',
  timeoutSeconds: 3600
});

// 发送任务
const result = await manager.continue(workerId, '请帮我创建 React 组件');

// 查看状态
const status = manager.getWorkerStatus(workerId);

// 停止 Worker
await manager.stop({ task_id: workerId, reason: '任务完成' });
```

### 3. 任务通知

结构化的任务通知系统。

```javascript
const { TaskNotificationManager } = require('orchestra');

const manager = new TaskNotificationManager({
  storage: 'file',
  storagePath: './temp/notifications'
});

// 发送通知
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

// 搜索通知
const results = manager.search('任务完成', {
  status: 'completed',
  limit: 100
});

// 获取统计
const stats = manager.getStatistics();
console.log(stats);
// { total: 150, byStatus: {...}, avgTokens: 1234 }
```

---

## 工作流使用

### 场景 1: Bug 修复

```javascript
const workflow = new FourPhaseWorkflow({
  name: '支付 Bug 修复',
  description: '修复支付失败问题',
  timeout: 30 * 60 * 1000  // 30 分钟
});

const result = await workflow.execute({
  bugReport: '用户支付时出现 500 错误',
  codebasePath: '/src/payment',
  searchQueries: ['payment', 'checkout', 'error'],
  errorLogs: 'Error: Payment gateway timeout at line 42',
  testCommand: 'npm test -- payment',
  manualVerificationSteps: `
    1. 创建测试订单
    2. 使用测试卡完成支付
    3. 验证订单状态更新
  `
});

console.log('修复总结:', result.summary);
```

**预期输出**：
```
✅ Bug 修复完成

根本原因：支付网关超时未处理
修复方案：添加重试逻辑和超时处理
修改文件：payment.js, checkout.js
测试结果：15/15 测试通过
```

---

### 场景 2: 新功能开发

```javascript
const workflow = new FourPhaseWorkflow({
  name: '用户评论功能',
  description: '实现文章评论系统',
  maxWorkers: 5,
  timeout: 60 * 60 * 1000  // 1 小时
});

const result = await workflow.execute({
  featureRequest: `
    实现文章评论功能，包括：
    1. 用户可以发表评论
    2. 可以点赞/点踩评论
    3. 可以回复其他评论
    4. 支持评论排序（最新/最热）
  `,
  codebasePath: '/src/comment',
  searchQueries: ['comment', 'reply', 'like'],
  testCommand: 'npm test -- comment'
});
```

**预期输出**：
```
✅ 功能开发完成

新增文件：comment.js, commentModel.js, commentRoutes.js
修改文件：article.js, user.js
API 接口：POST /comments, GET /comments/:articleId
测试结果：25/25 测试通过
```

---

### 场景 3: 代码重构

```javascript
const workflow = new FourPhaseWorkflow({
  name: '认证模块重构',
  description: '提升认证模块可维护性',
  timeout: 90 * 60 * 1000  // 1.5 小时
});

const result = await workflow.execute({
  refactorGoal: `
    将认证逻辑拆分为独立服务：
    1. 提取 token 管理逻辑
    2. 提取 session 管理逻辑
    3. 提取权限验证逻辑
    4. 保持向后兼容
  `,
  codebasePath: '/src/auth',
  searchQueries: ['auth', 'token', 'session'],
  testCommand: 'npm test -- auth'
});
```

**预期输出**：
```
✅ 重构完成

新增服务：tokenService.js, sessionService.js, authService.js
修改文件：auth.js, middleware.js
代码行数：-500 行（简化）
测试结果：30/30 测试通过
```

---

## Worker 管理

### 创建 Worker

```javascript
const { WorkerManager } = require('orchestra');
const manager = new WorkerManager();

// 基础创建
const { workerId } = await manager.create({
  description: 'Python 开发专家',
  prompt: '你是资深 Python 工程师，精通 Django、Flask...'
});

// 带初始消息
const { workerId } = await manager.create({
  description: '数据分析师',
  prompt: '你是数据科学专家...',
  initialMessage: '请分析这个数据集'
});

// 指定超时
const { workerId } = await manager.create({
  description: '安全专家',
  timeoutSeconds: 1800  // 30 分钟
});
```

### 与 Worker 交互

```javascript
// 发送消息
const result = await manager.continue(workerId, '请优化这段代码');

// 等待响应（同步模式）
const result = await manager.continue(workerId, '请解释这个算法', {
  waitForResponse: true,
  timeoutMs: 60000
});

console.log('Worker 响应:', result.output);
console.log('Token 使用:', result.usage.totalTokens);
```

### 查看 Worker 状态

```javascript
// 单个 Worker 状态
const status = manager.getWorkerStatus('agent-x7q');
console.log(status);
// {
//   workerId: 'agent-x7q',
//   status: 'running',
//   createdAt: '2026-04-03T10:00:00Z',
//   messagesSent: 5,
//   tokensUsed: 12345
// }

// 所有 Worker 状态
const allStatus = manager.getAllStatus();
console.log(allStatus);

// 搜索 Worker
const workers = manager.search('frontend', {
  status: 'completed',
  limit: 10
});
```

### 停止 Worker

```javascript
// 优雅停止
await manager.stop({
  task_id: 'agent-x7q',
  reason: '任务完成'
});

// 立即停止
await manager.stop({
  task_id: 'agent-x7q',
  graceful: false,
  reason: '用户取消'
});

// 批量停止
await manager.stopAll({
  graceful: true,
  reason: '系统维护'
});
```

---

## 任务通知

### 发送通知

```javascript
const { TaskNotificationManager } = require('orchestra');
const manager = new TaskNotificationManager();

// 任务完成通知
await manager.send({
  taskId: 'agent-x7q',
  status: 'completed',
  summary: '代码审查完成',
  result: '发现 3 个潜在问题',
  usage: {
    totalTokens: 5000,
    toolUses: 10,
    durationMs: 30000
  }
});

// 任务失败通知
await manager.send({
  taskId: 'agent-y8r',
  status: 'failed',
  summary: '代码执行失败',
  result: 'Error: Timeout after 60s',
  usage: {
    totalTokens: 2000,
    toolUses: 5,
    durationMs: 60000
  }
});
```

### 搜索通知

```javascript
// 按关键词搜索
const results = manager.search('完成', {
  limit: 100
});

// 按状态过滤
const completed = manager.search(null, {
  status: 'completed',
  limit: 100
});

// 按时间范围
const today = manager.search(null, {
  startTime: '2026-04-03T00:00:00Z',
  endTime: '2026-04-03T23:59:59Z'
});

// 组合条件
const results = manager.search('Bug 修复', {
  status: 'completed',
  startTime: '2026-04-01T00:00:00Z',
  limit: 50
});
```

### 获取统计

```javascript
const stats = manager.getStatistics();
console.log(stats);
// {
//   total: 150,
//   byStatus: {
//     completed: 120,
//     failed: 20,
//     killed: 10
//   },
//   avgTokens: 3500,
//   avgDuration: 25000
// }
```

---

## 监控 Dashboard

### 启动 Dashboard

```javascript
const { DashboardManager } = require('orchestra');

const dashboard = new DashboardManager({
  port: 3001,
  refreshInterval: 5000
});

await dashboard.start();
console.log('Dashboard 已启动：http://localhost:3001');
```

### 查看 Dashboard

访问 `http://localhost:3001`，可以看到：

**首页概览**：
- 📊 活跃 Worker 数量
- 📈 今日任务完成数
- ⚠️ 失败任务告警
- 💾 Token 使用统计

**Worker 列表**：
- Worker ID
- 状态（运行中/已完成/失败）
- 创建时间
- Token 使用量
- 操作（查看详情/停止）

**性能指标**：
- 平均响应时间
- 成功率趋势
- Token 使用趋势

### 配置告警

```javascript
// Worker 失败率告警
dashboard.addAlertRule({
  name: '失败率过高',
  condition: (metrics) => {
    return metrics.failedWorkers / metrics.totalWorkers > 0.2;
  },
  action: 'notify',
  message: '⚠️ Worker 失败率超过 20%'
});

// 响应时间告警
dashboard.addAlertRule({
  name: '响应过慢',
  condition: (metrics) => {
    return metrics.avgDuration > 60000;
  },
  action: 'notify',
  message: '⚠️ 平均响应时间超过 60 秒'
});
```

---

## 最佳实践

### 1. 合理设置超时

```javascript
// ✅ 推荐
const bugFix = new FourPhaseWorkflow({ timeout: 30 * 60 * 1000 });    // 30 分钟
const feature = new FourPhaseWorkflow({ timeout: 60 * 60 * 1000 });   // 1 小时
const refactor = new FourPhaseWorkflow({ timeout: 90 * 60 * 1000 });  // 1.5 小时

// ❌ 避免
const workflow = new FourPhaseWorkflow({ timeout: 5 * 60 * 1000 });   // 太短
const workflow = new FourPhaseWorkflow({ timeout: 24 * 60 * 60 * 1000 }); // 太长
```

### 2. 明确任务描述

```javascript
// ✅ 好的做法
await workflow.execute({
  bugReport: '用户点击登录按钮后，页面卡住无响应。控制台显示：Error: Network timeout at auth.js:42',
  codebasePath: '/src/auth',
  searchQueries: ['login', 'authentication', 'timeout'],
  testCommand: 'npm test -- auth'
});

// ❌ 避免
await workflow.execute({
  bugReport: '登录有问题',
  codebasePath: '/src'
});
```

### 3. 利用 Scratchpad 追踪进度

```javascript
const { Scratchpad } = require('orchestra');
const scratchpad = new Scratchpad('task-001');

// 记录开始时间
scratchpad.set('startTime', Date.now());

// 阶段完成后记录
scratchpad.log('研究阶段完成，找到 5 个相关文件');
scratchpad.set('researchDuration', Date.now() - scratchpad.get('startTime'));

// 最终统计
const totalDuration = Date.now() - scratchpad.get('startTime');
scratchpad.set('totalDuration', totalDuration);
```

### 4. 处理失败情况

```javascript
try {
  const result = await workflow.execute(context);
  
  if (!result.success) {
    console.log('部分成功，检查结果:');
    console.log('研究阶段:', result.phases.research?.issues);
    console.log('验证失败:', result.phases.verification?.testsFailed);
    
    // 根据失败原因决定重试
    if (result.phases.verification?.testsFailed > 0) {
      console.log('需要修复测试失败');
    }
  }
} catch (error) {
  console.error('工作流执行失败:', error.message);
  // 记录错误，通知用户
}
```

### 5. 定期清理历史数据

```javascript
// 每小时清理
setInterval(async () => {
  // 清理 30 分钟前的已停止 Worker
  await workerManager.cleanupStoppedWorkers(30);
  
  // 保留最近 1000 条通知
  await notificationManager.pruneHistory(1000);
  
  console.log('历史数据已清理');
}, 60 * 60 * 1000);
```

---

## 常见问题

### Q1: Worker 创建失败怎么办？

**A**: 检查 OpenClaw API 可用性：

```javascript
const sessions_spawn = global.sessions_spawn || null;

if (!sessions_spawn) {
  console.warn('OpenClaw API 不可用，使用模拟模式');
  // 降级逻辑或提示用户
}
```

### Q2: 如何查看 Worker 的详细日志？

**A**: 启用详细日志：

```javascript
const manager = new WorkerManager({
  verbose: true,  // 启用详细日志
  maxWorkers: 10
});
```

### Q3: 工作流执行超时怎么办？

**A**: 增加超时时间或分阶段执行：

```javascript
// 增加超时
const workflow = new FourPhaseWorkflow({
  timeout: 2 * 60 * 60 * 1000  // 2 小时
});

// 分阶段执行
const research = await workflow.executeResearchPhase(context);
// 检查研究阶段结果，决定是否继续
```

### Q4: 如何优化 Token 使用？

**A**: 
1. 使用精确的搜索关键词
2. 限制代码库范围
3. 合理设置 maxWorkers
4. 定期清理历史数据

```javascript
// ✅ 精确搜索
searchQueries: ['login', 'authentication']

// ✅ 限制范围
codebasePath: '/src/auth'

// ✅ 限制 Worker 数量
maxWorkers: 3
```

### Q5: 如何集成到 CI/CD？

**A**: 使用命令行工具：

```bash
# 运行工作流
node orchestra-cli.js execute \
  --name "Bug 修复" \
  --bug-report "登录失败" \
  --codebase "/src/auth" \
  --test "npm test -- auth"

# 查看结果
node orchestra-cli.js result --task-id agent-x7q
```

### Q6: 分布式部署如何配置？

**A**: 参考部署指南：

```javascript
const manager = new DistributedManager({
  instanceId: 'instance-001',
  cluster: ['instance-001', 'instance-002'],
  coordination: {
    type: 'redis',
    host: 'redis.example.com',
    port: 6379
  }
});
```

详见 [DEPLOYMENT.md](./DEPLOYMENT.md)

---

## 附录

### A. API 参考

完整 API 文档见：
- [README.md](../README.md) - 项目概述
- [USAGE.md](../USAGE.md) - 详细使用指南
- [OPENCLAW-INTEGRATION.md](./OPENCLAW-INTEGRATION.md) - OpenClaw API 集成

### B. 示例代码

完整示例见：
- `examples/` 目录
- [GitHub 仓库](https://github.com/orchestra/orchestra)

### C. 社区支持

- **Issue 反馈**: GitHub Issues
- **讨论**: GitHub Discussions
- **文档**: https://orchestra.dev/docs

---

**维护者**: AI CTO  
**联系方式**: orchestra-team@example.com  
**最后更新**: 2026-04-03
