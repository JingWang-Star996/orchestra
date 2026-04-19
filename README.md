# 🎵 Orchestra - 多 Agent 协作框架

**版本**: v1.2.0  
**状态**: ✅ P2 全部完成
**许可证**: MIT  
**语言**: 中文 | [English](./README_en.md)

> ⚠️ **与指挥官模式的关系**：Orchestra 的核心理念已融入指挥官模式（`skills/commander-mode/SKILL.md`）。
> 日常使用请优先使用指挥官模式。Orchestra 代码作为设计参考或独立运行工具。
> 完整共存分析见 `COEXISTENCE-ANALYSIS.md`。

---

## 📖 简介

Orchestra 是一个**企业级多 Agent 协作框架**，深度集成 OpenClaw API，灵感来自 Claude Code 的 Coordinator 模式。

**核心价值**：让 AI 团队像交响乐团一样协同工作，每个 Agent 都是专业乐手，Orchestra 是指挥家。

---

## 🌟 为什么选择 Orchestra？

### 痛点解决

| 传统单 Agent | Orchestra 多 Agent |
|------------|------------------|
| ❌ 上下文窗口限制 | ✅ 任务分解，多 Worker 并行 |
| ❌ 知识无法共享 | ✅ Scratchpad 跨 Worker 共享 |
| ❌ 错误难以恢复 | ✅ 智能重试 + 决策矩阵 |
| ❌ 无法并行执行 | ✅ 异步并行，扇出模式 |
| ❌ 状态不透明 | ✅ 实时监控 Dashboard |

### 核心优势

1. **🎯 四阶段工作流** - Research → Synthesis → Implementation → Verification
2. **🤖 多 Worker 并行** - 支持 5-10 个子代理同时工作
3. **📦 持久化支持** - 通知历史、Worker 状态自动保存
4. **🔄 智能重试** - 指数退避 + 随机抖动
5. **🔐 权限控制** - ACL 访问控制列表
6. **📊 监控 Dashboard** - Worker 状态可视化
7. **🧠 ML 优化** - 决策权重自动调整
8. **🌐 分布式支持** - 多实例部署（P2 新增）
9. **📈 实时监控** - Dashboard + WebSocket 实时更新（P2 新增）
10. **🧪 A/B 测试** - 算法对比与效果验证（P2 新增）

---

## 🏗️ 架构设计

### Phase 3 新增（2026-04-10 完成）

**读写分离系统**:
- `readWorker.js` - 只读 Worker（文件读取、代码分析、搜索）
- `writeWorker.js` - 写入 Worker（文件编辑、创建、删除）
- `readWriteSeparator.js` - 智能路由管理器

**性能优化**:
- `cacheLayer.js` - LRU 缓存层（TTL 过期、命中率统计）

### P2 新增（2026-04-19 完成）

**监控 Dashboard**:
- `dashboard/server.js` - HTTP + WebSocket 服务
- `dashboard/api.js` - REST API
- `dashboard/app.js` - 前端主应用
- `dashboard/metrics.js` - 性能指标收集
- `dashboard/alerts.js` - 告警系统
- `dashboard/index-v6.0.html` - 完整可视化 UI

**ML 优化模块**:
- `ml-optimizer/WeightOptimizer.js` - 权重自动调整
- `ml-optimizer/DecisionHistory.js` - 决策历史记录
- `ml-optimizer/ABTestManager.js` - A/B 测试框架
- `ml-optimizer/DecisionMatrix-integration.js` - 集成入口

**分布式架构**:
- `distributed/NodeRegistry.js` - 节点注册与心跳
- `distributed/MessageBus.js` - 发布/订阅消息总线
- `distributed/StateSync.js` - 跨节点状态同步
- `distributed/index.js` - 统一导出 + createRuntime()

**P2 状态**: ✅ 100% 完成（2026-04-19）

**文档**:
- `DEPLOYMENT.md` - 完整部署指南
- `USER-MANUAL.md` - 用户使用手册
- `P2-SUMMARY.md` - P2 阶段总结

### 单元测试:
- `test/cacheLayer.test.js` - 10 个测试用例 ✅
- `test/readWriteSeparator.test.js` - 18 个测试用例 ✅
- `test/groupManager.test.js` - 16 个测试用例 ✅
- `test/phase3-integration.test.js` - 10 个集成测试 ✅
- `test/performance-benchmark.js` - 性能基准测试 ✅

**Phase 3 状态**: ✅ 100% 完成（2026-04-10）

**文档**:
- `docs/ARCHITECTURE.md` - 架构设计（7 层架构）
- `docs/PERFORMANCE.md` - 性能优化指南
- `docs/API.md` - 完整 API 参考
- `docs/TROUBLESHOOTING.md` - 故障排查指南

### 四阶段工作流

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Phase 1: Research (研究)                                   │
│  ├─ Worker 1: 分析代码结构                                  │
│  ├─ Worker 2: 查找相关文件                                  │
│  └─ Worker 3: 收集错误日志                                  │
│                          ↓                                  │
│  Phase 2: Synthesis (综合)                                  │
│  └─ Coordinator: 制定解决方案                               │
│                          ↓                                  │
│  Phase 3: Implementation (实现)                             │
│  ├─ Worker 1: 修改文件 A                                    │
│  └─ Worker 2: 修改文件 B                                    │
│                          ↓                                  │
│  Phase 4: Verification (验证)                               │
│  ├─ Worker 1: 运行单元测试                                  │
│  └─ Worker 2: 运行集成测试                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 核心组件

| 组件 | 职责 | 执行阶段 |
|------|------|---------|
| **Worker** | 执行具体任务 | Research, Implementation, Verification |
| **Coordinator** | 综合信息、制定规范 | Synthesis |
| **Scratchpad** | 跨 Worker 知识共享 | 所有阶段 |
| **WorkerManager** | Worker 生命周期管理 | 全局 |
| **TaskNotification** | 结构化任务通知 | 全局 |
| **ParallelExecutor** | 异步并行执行引擎 | 全局 |
| **DecisionMatrix** | Continue vs. Spawn 决策 | 全局 |
| **Gateway** | 统一入口 | 全局 |

### 数据流

```
用户请求 → Gateway → 分析任务 → 创建 Workers → 并行执行
                                    ↓
                        Scratchpad 知识共享
                                    ↓
                        结果聚合 → 返回用户
```

---

## 🚀 快速开始

### 安装

```bash
# 克隆仓库
git clone https://github.com/JingWang-Star996/orchestra.git
cd orchestra

# 安装依赖
npm install
```

### 配置环境变量

```bash
# 获取 API Key：https://bailian.console.aliyun.com/
export ORCHESTRA_API_KEY="sk-你的 API Key"
export ORCHESTRA_MODEL="qwen3.5-plus"
```

### 基础示例

```javascript
const Orchestra = require('./index.js');

// 创建实例
const orchestra = new Orchestra({
  model: 'qwen3.5-plus',
  verbose: true,
  maxConcurrent: 3
});

// 执行任务
const result = await orchestra.run('设计一个抽卡系统');
console.log(result.summary);
```

### 使用 Gateway（推荐）

```javascript
const { Gateway } = require('./index.js');

const gateway = new Gateway({
  model: 'qwen3.5-plus',
  verbose: true,
  maxConcurrent: 5,
  timeout: 3600000  // 1 小时
});

// 执行工作流
const result = await gateway.execute({
  task: '设计一个宠物养成系统',
  agents: ['AI 主策划', 'AI 数值策划', 'AI 系统策划']
});
```

---

## 💼 使用场景

### 场景 1: Bug 修复

```javascript
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

**输出**：
- ✅ 找到问题根源
- ✅ 修改 3 个文件
- ✅ 通过所有测试

---

### 场景 2: 新功能开发

```javascript
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

**输出**：
- ✅ 完整的评论系统设计
- ✅ 数据库 Schema
- ✅ API 接口实现
- ✅ 前端组件

---

### 场景 3: 代码重构

```javascript
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

**输出**：
- ✅ 重构方案
- ✅ 拆分后的模块
- ✅ 迁移指南

---

## 📊 性能表现

### Phase 3 实测性能（2026-04-05）

**缓存层性能**:
- 写入速度：**50 万条/秒**（10000 条 / 20ms）
- 读取速度：**100 万条/秒**（10000 条 / 10ms）
- 命中率：**100%**（测试环境）
- 内存占用：**~1MB**（1000 条缓存）

**读写分离性能**:
- 任务识别：<1ms
- 并发读取：5 个
- DryRun 模式：✅ 支持

**性能目标达成**:
| 指标 | 目标值 | 实测值 | 状态 |
|------|--------|--------|------|
| 缓存命中率 | >80% | 100% | ✅ |
| 并发读取 | 5 个 | 5 个 | ✅ |
| 响应时间 | <2 秒 | <10ms | ✅ |
| 内存占用 | <100MB | ~1MB | ✅ |

### 对比测试（理论预测）

| 任务类型 | 单 Agent | Orchestra | 提升 |
|---------|---------|-----------|------|
| Bug 修复（中等） | 15 分钟 | 5 分钟 | **3x** |
| 新功能开发 | 45 分钟 | 12 分钟 | **3.75x** |
| 代码重构 | 60 分钟 | 18 分钟 | **3.3x** |
| 复杂系统设计 | 90 分钟 | 25 分钟 | **3.6x** |

### 并发能力

- **最大 Worker 数**: 10 个
- **推荐并发数**: 3-5 个
- **内存占用**: ~50MB/Worker
- **平均响应时间**: <3 秒

---

## 🔧 高级功能

### 1. WorkerManager

管理 Worker 的创建、执行、停止。

```javascript
const manager = new WorkerManager({
  storage: 'file',
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

---

### 2. TaskNotification

结构化任务通知系统。

```javascript
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
```

---

### 3. 重试机制

指数退避 + 随机抖动。

```javascript
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
```

---

### 4. 权限控制

ACL 访问控制列表。

```javascript
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

### 5. Scratchpad 知识共享

跨 Worker 数据共享。

```javascript
const Scratchpad = require('./scratchpad');

const scratchpad = new Scratchpad('task-001', {
  basePath: 'temp/scratchpad',
  verbose: true,
  enableHistory: true
});

// 写入数据
await scratchpad.set('research:files', ['/src/auth.js', '/src/token.js']);
await scratchpad.set('research:issues', ['Token 过期未处理']);

// 读取数据（其他 Worker 可访问）
const files = await scratchpad.get('research:files');

// 带锁的写入（并发安全）
await scratchpad.acquireLock('critical-section');
await scratchpad.set('implementation:status', 'in-progress');
await scratchpad.releaseLock('critical-section');
```

---

### 6. DecisionMatrix

智能决策：继续现有 Worker 还是创建新 Worker。

```javascript
const { decideContinueOrSpawn, DecisionType } = require('./decisionMatrix');

const decision = decideContinueOrSpawn({
  task: { files: ['/src/auth.js'] },
  workerContext: {
    visitedFiles: ['/src/auth.js', '/src/token.js'],
    lastAction: 'research'
  }
});

console.log(decision);
// { decision: 'continue', reason: 'high_overlap' }
```

---

## 📁 项目结构

```
orchestra/
├── index.js                 # 统一入口
├── gateway.js               # Gateway 统一入口
├── workerManager.js         # Worker 生命周期管理
├── taskNotification.js      # 任务通知系统
├── parallelExecutor.js      # 并行执行引擎
├── decisionMatrix.js        # 决策矩阵
├── scratchpad.js            # 知识共享系统
├── retryUtils.js            # 重试工具
├── accessControl.js         # 权限控制
├── package.json             # 项目配置
├── LICENSE                  # MIT 许可证
├── README.md                # 本文档
├── INSTALL.md               # 安装指南
├── USAGE.md                 # 使用手册
├── QUICKSTART.md            # 快速开始
├── test-all.js              # 全模块测试
└── dashboard/               # 监控 Dashboard
    └── index-v6.0.html      # Worker 状态可视化
```

---

## 🧪 测试

```bash
# 运行全模块测试
node test-all.js

# 运行快速测试
node test-quick.js

# 测试真实 AI 调用
export ORCHESTRA_API_KEY="sk-xxx"
node test-real-ai.js
```

---

## 📚 文档

| 文档 | 说明 |
|------|------|
| [README.md](./README.md) | 项目介绍 |
| [INSTALL.md](./INSTALL.md) | 安装指南 |
| [USAGE.md](./USAGE.md) | 使用手册 |
| [QUICKSTART.md](./QUICKSTART.md) | 快速开始 |
| [examples/](./examples/) | 示例代码 |

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 如何贡献

1. Fork 仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
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

## 🙏 致谢

- **灵感来源**: [Claude Code](https://claude.ai/code) 的 Coordinator 模式
- **平台支持**: [OpenClaw](https://github.com/openclaw/openclaw)
- **AI 能力**: [阿里云百炼](https://bailian.console.aliyun.com/)

---

## 📬 联系方式

- **GitHub**: https://github.com/JingWang-Star996/orchestra
- **Issues**: https://github.com/JingWang-Star996/orchestra/issues
- **作者**: AI System Architect

---

**Made with ❤️ by【游戏人王鲸】【游戏制作人王鲸】for OpenClaw Community**

**最后更新**: 2026-04-04
