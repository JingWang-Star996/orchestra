# Orchestra 架构设计文档

**版本**: v1.1  
**最后更新**: 2026-04-10  
**状态**: ✅ Phase 3 完成

---

## 📐 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                         用户层                               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                      Gateway 层                              │
│                    gateway.js（统一入口）                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    核心编排层                                  │
│   planner.js      │    router.js     │   aggregator.js       │
│  （任务分解）       │   （Agent 路由）   │    （结果汇总）         │
│   tracker.js      │    error.js      │   stateManager.js     │
│  （进度跟踪）       │   （错误处理）     │    （状态管理）         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    Worker 管理层                              │
│  workerManager.js  │ parallelExecutor │  decisionMatrix.js   │
│  （生命周期管理）    │  （并行执行引擎）   │   （智能决策）         │
│  agentExecutor.js  │  gameDesignWorkflow                     │
│  （Agent 执行器）    │  （24 人工作流）                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              Phase 3 新增层                                   │
│  fourPhaseWorkflow  │ performanceMonitor │  readWriteSep      │
│  （四阶段工作流）     │  （性能监控）        │  （读写分离）        │
│  flexibleRecovery   │  toolSystem        │  cacheLayer        │
│  （灵活恢复）         │  （工具权限）        │  （缓存优化）        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    支撑服务层                                  │
│  scratchpad.js     │ taskNotification │  accessControl       │
│  （知识共享）        │  （任务通知）       │  （权限控制）         │
│  retryUtils.js     │ activityDescriber                     │
│  （重试工具）        │  （活动描述）                            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                     OpenClaw API                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🏗️ Phase 3 模块详解

### 1. FourPhaseWorkflow — 四阶段工作流

**文件**: `fourPhaseWorkflow.js`  
**职责**: 标准化的 Research → Synthesis → Implementation → Verification 流程

```javascript
var workflow = new FourPhaseWorkflow({ scratchpad: sp, verbose: true });
workflow.registerHandler('research', myResearchFn);
var result = await workflow.execute({
  id: 'task-001',
  description: '修复支付 Bug',
  context: { bugId: 'PAY-123' }
});
```

**特性**:
- 阶段间通过 Scratchpad 共享上下文
- 支持自定义阶段处理器
- 超时控制 + 跳过阶段

### 2. PerformanceMonitor — 性能监控

**文件**: `performanceMonitor.js`  
**职责**: 并发控制、超时处理、资源监控

**三个子模块**:
- `ConcurrencyController` — 限制同时运行的任务数，支持优先级队列
- `TimeoutManager` — 为异步操作添加超时保护
- `ResourceMonitor` — 采样内存使用情况，健康检查

```javascript
var pm = new PerformanceMonitor({ maxConcurrency: 5 });
pm.start();
await pm.concurrency.submit('task-1', myTask);
var report = pm.getReport(); // 包含并发、超时、资源状态
```

### 3. ReadWriteSeparator — 读写分离

**文件**: `readWriteSeparator.js` + `readWorker.js` + `writeWorker.js`  
**职责**: 自动识别任务类型，只读并行，写入串行

**任务类型**:
- `READ_ONLY` — 只读任务，自由并行
- `WRITE_ONLY` — 只写任务，串行控制
- `READ_THEN_WRITE` — 先读后写
- `MIXED` — 混合任务

### 4. FlexibleRecovery — 灵活恢复

**文件**: `flexibleRecovery.js`  
**职责**: Worker 失败后自动选择恢复策略

**策略**:
- `retry` — 重试（网络/超时错误）
- `continue` — 继续（有良好上下文时）
- `spawn_fresh` — 创建新 Worker（语法错误）
- `stop` — 停止（权限错误）

### 5. ToolSystem — 工具权限

**文件**: `toolSystem.js` + `toolTracker.js`  
**职责**: 工具访问控制 + 调用追踪

**权限级别**:
- `simple` — 基础工具（bash, file_read, file_edit）
- `full` — 全部工具
- `admin` — 管理工具

### 6. CacheLayer — 缓存层

**文件**: `cacheLayer.js`  
**职责**: LRU 缓存 + TTL 过期，减少重复读取

---

## 📊 四阶段工作流详情

```
Phase 1: Research（研究）
  ├─ 信息收集
  ├─ 问题分析
  └─ 输出: 研究报告

Phase 2: Synthesis（综合）
  ├─ 方案制定
  ├─ 决策权衡
  └─ 输出: 执行计划

Phase 3: Implementation（实现）
  ├─ 执行编码
  ├─ 读写分离操作
  └─ 输出: 变更清单

Phase 4: Verification（验证）
  ├─ 结果检查
  ├─ 回归测试
  └─ 输出: 验证报告
```

---

## 🧪 测试

- `test/phase3-integration.test.js` — 18 个集成测试用例
- 覆盖 FourPhaseWorkflow、PerformanceMonitor、ReadWriteSeparator、FlexibleRecovery、CacheLayer

---

**Made with ❤️ for OpenClaw Community**
