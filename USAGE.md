# Orchestra 使用指南

## 📖 目录

1. [快速开始](#快速开始)
2. [核心概念](#核心概念)
3. [API 参考](#api-参考)
4. [实战示例](#实战示例)
5. [最佳实践](#最佳实践)
6. [故障排查](#故障排查)

---

## 🚀 快速开始

### 安装

```bash
npm install orchestra
```

### 5 分钟上手

```typescript
import { FourPhaseWorkflow } from 'orchestra';

// 1. 创建工作流
const workflow = new FourPhaseWorkflow({
  name: '我的第一个工作流',
  description: '学习 Orchestra 基础用法'
});

// 2. 执行工作流
const result = await workflow.execute({
  bugReport: '描述你要解决的问题',
  codebasePath: '/path/to/your/code',
  testCommand: 'npm test'
});

// 3. 查看结果
console.log(result.summary);
```

---

## 🧠 核心概念

### 四阶段流程

```
┌────────────────────────────────────────────────────────────┐
│                                                            │
│  Phase 1: Research (研究)                                  │
│  ├─ Worker 1: 分析代码结构                                 │
│  ├─ Worker 2: 查找相关文件                                 │
│  └─ Worker 3: 收集错误日志                                 │
│                          ↓                                 │
│  Phase 2: Synthesis (综合)                                 │
│  └─ Coordinator: 制定解决方案                              │
│                          ↓                                 │
│  Phase 3: Implementation (实现)                            │
│  ├─ Worker 1: 修改文件 A                                   │
│  └─ Worker 2: 修改文件 B                                   │
│                          ↓                                 │
│  Phase 4: Verification (验证)                              │
│  ├─ Worker 1: 运行单元测试                                 │
│  └─ Worker 2: 运行集成测试                                 │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### 核心组件

| 组件 | 职责 | 执行阶段 |
|------|------|----------|
| **Worker** | 执行具体任务 | Research, Implementation, Verification |
| **Coordinator** | 综合信息、制定规范 | Synthesis |
| **Scratchpad** | 阶段间数据共享 | 所有阶段 |
| **FourPhaseWorkflow** | 编排整个流程 | 全局 |

---

## 📚 API 参考

### FourPhaseWorkflow

#### 构造函数

```typescript
new FourPhaseWorkflow(config: FourPhaseConfig)
```

**参数：**

```typescript
interface FourPhaseConfig {
  name: string;           // 工作流名称（必填）
  description: string;    // 工作流描述（必填）
  maxWorkers?: number;    // 最大 Worker 数量（默认 3）
  timeout?: number;       // 超时时间，毫秒（默认 30 分钟）
}
```

**示例：**

```typescript
const workflow = new FourPhaseWorkflow({
  name: '支付模块重构',
  description: '提升支付模块可维护性',
  maxWorkers: 5,
  timeout: 60 * 60 * 1000  // 1 小时
});
```

#### execute 方法

```typescript
async execute(context: TaskContext): Promise<WorkflowResult>
```

**TaskContext 常用字段：**

```typescript
interface TaskContext {
  // 问题描述（三选一）
  bugReport?: string;         // Bug 报告
  featureRequest?: string;    // 功能需求
  refactorGoal?: string;      // 重构目标
  
  // 代码库信息
  codebasePath?: string;      // 代码路径
  searchQueries?: string[];   // 搜索关键词
  
  // 测试配置
  testCommand?: string;       // 测试命令
  manualVerificationSteps?: string;  // 手动验证步骤
  
  // 其他
  errorLogs?: string;         // 错误日志
  [key: string]: any;         // 支持自定义字段
}
```

**WorkflowResult 结构：**

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

### Worker

```typescript
const worker = new Worker({
  id: 'my-worker',
  systemPrompt: '你是一位资深工程师',
  maxRetries: 3
});

const result = await worker.execute(task, scratchpad);
```

### Coordinator

```typescript
const coordinator = new Coordinator({
  id: 'my-coordinator',
  systemPrompt: '你擅长综合分析问题'
});

const synthesis = await coordinator.synthesize(task, scratchpad);
```

### Scratchpad

```typescript
const scratchpad = new Scratchpad();

// 设置值
scratchpad.set('key', value);

// 获取值
const value = scratchpad.get('key');

// 追加到列表
scratchpad.append('logs', '新日志');

// 获取所有日志
const logs = scratchpad.getLogs();

// 导出/导入
const json = scratchpad.toJSON();
scratchpad.fromJSON(json);
```

---

## 💼 实战示例

### 示例 1: Bug 修复

```typescript
import { FourPhaseWorkflow } from 'orchestra';

const workflow = new FourPhaseWorkflow({
  name: '登录 Bug 修复',
  description: '修复用户无法登录的问题'
});

const result = await workflow.execute({
  bugReport: `
【问题】用户点击登录按钮后页面无响应
【错误】控制台显示 TypeError: Cannot read property 'token' of undefined
【复现】1. 打开登录页 2. 输入凭据 3. 点击登录 4. 页面无响应
  `,
  codebasePath: '/src/auth',
  searchQueries: ['login', 'authentication', 'token'],
  testCommand: 'npm test -- auth',
  manualVerificationSteps: `
1. 打开登录页面
2. 输入有效用户名和密码
3. 点击登录按钮
4. 验证跳转到首页
5. 验证用户信息显示正确
  `
});

console.log(result.summary);
```

### 示例 2: 新功能开发

```typescript
const workflow = new FourPhaseWorkflow({
  name: '评论功能开发',
  description: '实现文章评论系统'
});

const result = await workflow.execute({
  featureRequest: `
【功能】文章评论系统
【需求】
  - 用户可以发表评论
  - 支持回复其他评论
  - 支持点赞/点踩
  - 支持评论排序（最新/最热）
【技术栈】
  - 前端：React
  - 后端：Node.js + Express
  - 数据库：MongoDB
  `,
  codebasePath: '/src/comments',
  searchQueries: ['comment', 'reply', 'like'],
  testCommand: 'npm test -- comments'
});
```

### 示例 3: 性能优化

```typescript
const workflow = new FourPhaseWorkflow({
  name: 'API 性能优化',
  description: '优化商品列表 API 响应时间',
  maxWorkers: 5,
  timeout: 90 * 60 * 1000
});

const result = await workflow.execute({
  refactorGoal: `
【目标】P99 延迟从 2s 降到 200ms
【当前指标】
  - P50: 800ms
  - P90: 1500ms
  - P99: 2000ms
【优化方向】
  - 添加 Redis 缓存
  - 数据库索引优化
  - 分页查询
  - 异步处理
  `,
  codebasePath: '/src/api/products',
  testCommand: 'npm run benchmark'
});
```

---

## ✅ 最佳实践

### 1. 编写清晰的任务描述

**✅ 好的做法：**

```typescript
{
  bugReport: `
【问题】支付成功率从 95% 下降到 70%
【时间】2024-01-15 14:00 开始
【影响】约 30% 用户支付失败
【错误日志】
  - Payment gateway timeout
  - Database connection pool exhausted
【复现步骤】
  1. 添加商品到购物车
  2. 进入结算页面
  3. 选择支付宝支付
  4. 出现 500 错误
  `
}
```

**❌ 避免：**

```typescript
{
  bugReport: '支付有问题'  // 太模糊
}
```

### 2. 合理配置 Worker 数量

```typescript
// 简单任务：2-3 个 Worker
const simpleWorkflow = new FourPhaseWorkflow({
  maxWorkers: 2
});

// 复杂任务：4-5 个 Worker
const complexWorkflow = new FourPhaseWorkflow({
  maxWorkers: 5
});

// 超大型任务：可以自定义更多
const megaWorkflow = new FourPhaseWorkflow({
  maxWorkers: 10
});
```

### 3. 设置合适的超时时间

| 任务类型 | 建议超时 |
|---------|---------|
| 简单 Bug 修复 | 30 分钟 |
| 新功能开发 | 60 分钟 |
| 代码重构 | 90 分钟 |
| 数据库迁移 | 120 分钟 |

### 4. 利用 Scratchpad 追踪进度

```typescript
const scratchpad = new Scratchpad();

// 记录开始时间
scratchpad.set('metrics:startTime', Date.now());

// 记录关键发现
scratchpad.append('findings', '发现 N+1 查询问题');

// 记录决策
scratchpad.set('decisions:approach', '使用 Redis 缓存优化');

// 最后生成报告
const duration = Date.now() - scratchpad.get('metrics:startTime');
console.log(`总耗时：${duration / 1000}秒`);
```

### 5. 处理失败情况

```typescript
const result = await workflow.execute(context);

if (!result.success) {
  // 分析失败原因
  const failedPhases = [];
  
  if (result.phases.research?.issues.length > 0) {
    failedPhases.push('研究阶段发现问题');
  }
  
  if (result.phases.verification?.testsFailed > 0) {
    failedPhases.push(`验证阶段 ${result.phases.verification.testsFailed} 个测试失败`);
  }
  
  console.log('失败原因:', failedPhases.join(', '));
  
  // 决定重试或人工介入
  if (failedPhases.length === 1) {
    // 单个阶段失败，可以考虑重试
    console.log('建议：重试失败阶段');
  } else {
    // 多个阶段失败，需要人工审查
    console.log('建议：人工审查问题');
  }
}
```

---

## 🔧 故障排查

### 问题 1: 工作流执行超时

**症状：**

```
Error: Workflow execution timed out after 30 minutes
```

**解决方案：**

```typescript
// 增加超时时间
const workflow = new FourPhaseWorkflow({
  timeout: 60 * 60 * 1000  // 1 小时
});
```

**预防措施：**

- 对于复杂任务，预设更长的超时时间
- 监控各阶段耗时，识别瓶颈

### 问题 2: Worker 执行失败

**症状：**

```
Worker [worker-1] failed: Cannot read property 'xyz' of undefined
```

**解决方案：**

```typescript
// 增加重试次数
const worker = new Worker({
  id: 'my-worker',
  maxRetries: 5  // 增加重试
});

// 或者在任务级别处理
const result = await workflow.execute(context);
if (result.phases.research?.issues.length > 0) {
  console.log('研究阶段问题:', result.phases.research.issues);
  // 根据问题调整策略后重试
}
```

### 问题 3: Scratchpad 数据丢失

**症状：**

阶段间数据传递失败，后续阶段无法获取前面的结果

**解决方案：**

```typescript
// 使用明确的键名
scratchpad.set('phase1:findings', findings);
scratchpad.set('phase2:synthesis', synthesis);

// 读取时检查是否存在
const findings = scratchpad.get('phase1:findings');
if (!findings) {
  throw new Error('研究阶段数据缺失');
}

// 使用 toJSON 备份
const backup = scratchpad.toJSON();
console.log('Scratchpad 备份:', backup);
```

### 问题 4: 验证阶段测试全部失败

**症状：**

```
Verification: 0/10 tests passed
```

**可能原因：**

1. 实现阶段未按规范修改
2. 测试命令配置错误
3. 测试环境问题

**排查步骤：**

```typescript
const result = await workflow.execute(context);

// 1. 检查实现阶段输出
console.log('修改的文件:', result.phases.implementation?.filesModified);

// 2. 检查验证报告
console.log('验证报告:', result.phases.verification?.verificationReport);

// 3. 手动运行测试
const { execSync } = require('child_process');
try {
  execSync(context.testCommand, { stdio: 'inherit' });
} catch (error) {
  console.log('手动测试也失败，可能是环境问题');
}
```

---

## 📞 获取帮助

- **文档**: [README.md](./README.md)
- **示例**: [examples/real-world-examples.ts](./examples/real-world-examples.ts)
- **Issue**: https://github.com/openclaw/orchestra/issues
- **讨论**: OpenClaw 社区

---

## 🎯 下一步

- 尝试运行 [实战示例](./examples/real-world-examples.ts)
- 阅读 [API 完整文档](./docs/api.md)
- 学习 [如何自定义 Worker](./docs/custom-worker.md)
- 了解 [高级编排技巧](./docs/advanced-orchestration.md)
