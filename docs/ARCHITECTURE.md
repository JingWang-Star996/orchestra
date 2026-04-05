# Orchestra 架构设计文档

**版本**: v1.0  
**最后更新**: 2026-04-05  
**状态**: Phase 3 开发中（85% → 95%）

---

## 📐 系统架构

### 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         用户层                                   │
│                    (User Interface)                              │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│                        Gateway 层                                │
│                   (统一入口 / 路由)                               │
│                    ┌──────────────┐                              │
│                    │  gateway.js  │                              │
│                    └──────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│                      核心编排层                                  │
│                 (Core Orchestration Layer)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │    Planner   │  │    Router    │  │  Aggregator  │          │
│  │  (任务分解)   │  │  (Agent 路由) │  │  (结果汇总)   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│                      Worker 管理层                               │
│                   (Worker Management Layer)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │WorkerManager │  │ParallelExec  │  │  Decision    │          │
│  │(生命周期管理) │  │(并行执行引擎)│  │  Matrix      │          │
│  │              │  │              │  │(智能决策)    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│                      读写分离层 (Phase 3)                        │
│                (Read/Write Separation Layer)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ ReadWorker   │  │ WriteWorker  │  │ ReadWrite    │          │
│  │ (只读操作)    │  │ (写入操作)    │  │ Separator    │          │
│  │              │  │              │  │(路由管理)    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│                      支撑服务层                                  │
│                   (Support Services Layer)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Scratchpad   │  │   Cache      │  │    Task      │          │
│  │(知识共享)    │  │  Layer       │  │ Notification │          │
│  │              │  │(缓存优化)    │  │(任务通知)    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │     Tool     │  │  Flexible    │  │  Access      │          │
│  │   System     │  │  Recovery    │  │  Control     │          │
│  │(工具权限)    │  │(灵活恢复)    │  │(权限控制)    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│                       OpenClaw API                               │
│                  (sessions_spawn / send)                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🏗️ 核心模块设计

### 1. Gateway（统一入口）

**职责**: 统一的任务入口，分析任务类型，分发给合适的处理流程。

**关键方法**:
- `execute(task)` - 执行任务
- `analyzeTask(task)` - 分析任务复杂度
- `route(task)` - 路由到合适的 Worker

**设计原则**:
- 单一入口点
- 智能任务分析
- 自动路由决策

---

### 2. WorkerManager（Worker 生命周期管理）

**职责**: 创建、管理、停止 Worker，维护 Worker 状态。

**关键方法**:
- `create(workerConfig)` - 创建 Worker
- `continue(workerId, message)` - 继续对话
- `stop(workerId, reason)` - 停止 Worker
- `getStatus(workerId)` - 获取状态

**状态机**:
```
idle → working → completed
            ↓
          error → retrying → working
```

---

### 3. ParallelExecutor（并行执行引擎）

**职责**: 异步并行执行多个任务，支持扇出模式。

**关键方法**:
- `executeParallel(tasks, options)` - 并行执行
- `waitForAll(promises)` - 等待所有完成
- `race(tasks)` - 竞争模式

**并发控制**:
- 最大并发数限制
- 资源隔离
- 错误隔离

---

### 4. DecisionMatrix（决策矩阵）

**职责**: 智能决策 Continue vs. Spawn。

**决策因素**:
- 任务重叠度
- Worker 负载
- 上下文窗口使用
- 历史表现

**决策类型**:
- `continue` - 继续当前 Worker
- `spawn` - 创建新 Worker
- `stop` - 停止任务

---

### 5. Scratchpad（知识共享）

**职责**: 跨 Worker 知识共享，支持并发安全。

**数据结构**:
```javascript
{
  taskId: 'task-001',
  data: {
    'research:files': [...],
    'research:issues': [...],
    'implementation:status': 'in-progress'
  },
  locks: {...},
  history: [...]
}
```

**特性**:
- 键值存储
- 锁机制
- 历史记录
- 持久化支持

---

### 6. ReadWriteSeparator（读写分离 - Phase 3）

**职责**: 根据任务类型自动路由到 ReadWorker 或 WriteWorker。

**任务类型**:
- `READ_ONLY` - 只读任务
- `WRITE_ONLY` - 只写任务
- `READ_THEN_WRITE` - 先读后写
- `MIXED` - 混合任务

**优势**:
- 权限隔离（只读 Worker 无法修改文件）
- 性能优化（并行读取）
- 错误隔离（写入错误不影响读取）

---

### 7. CacheLayer（缓存层 - Phase 3）

**职责**: 缓存文件内容、API 响应、计算结果。

**缓存策略**:
- LRU 淘汰（Least Recently Used）
- TTL 过期（Time To Live）
- 大小限制

**统计指标**:
- 命中率（Hit Rate）
- 节省的 API 调用
- 内存使用

---

## 📊 数据流

### 典型任务执行流程

```
用户请求："修复支付 Bug"
    ↓
Gateway 分析任务
    ↓
创建 Worker 团队
    ├─ Worker 1: 分析代码结构（ReadWorker）
    ├─ Worker 2: 查找相关文件（ReadWorker）
    └─ Worker 3: 收集错误日志（ReadWorker）
    ↓
Scratchpad 知识共享
    ↓
Coordinator 综合信息
    ↓
创建 Worker 团队
    ├─ Worker 4: 修改文件 A（WriteWorker）
    └─ Worker 5: 修改文件 B（WriteWorker）
    ↓
验证 Worker
    ├─ Worker 6: 运行单元测试（ReadWorker）
    └─ Worker 7: 运行集成测试（ReadWorker）
    ↓
结果汇总 → 返回用户
```

---

## 🔐 安全设计

### 权限控制

**ACL 访问控制列表**:
- 任务级权限
- Worker 级权限
- 时间限制

**权限级别**:
- `READ` - 只读
- `WRITE` - 写入
- `ADMIN` - 管理

### 读写分离安全

- ReadWorker 只能读取，无法修改
- WriteWorker 需要明确权限
- DryRun 模式用于测试

---

## 📈 性能优化

### Phase 3 优化

1. **缓存层**
   - 减少重复文件读取
   - 缓存 API 响应
   - 命中率目标 80%+

2. **读写分离**
   - 并行读取多个文件
   - 减少锁竞争
   - 性能提升 30%+

3. **Worker 池**
   - 预创建 Worker
   - 复用 Worker 实例
   - 减少创建开销

---

## 🧪 测试策略

### 单元测试

- 覆盖所有核心模块
- 目标覆盖率 80%+
- 使用 Jest 框架

### 集成测试

- 端到端任务执行
- 多 Worker 协作
- 真实 API 调用

### 性能测试

- 并发 Worker 测试
- 大数据量测试
- 长时间运行测试

---

## 📁 模块依赖关系

```
index.js
  └─ gateway.js
      ├─ workerManager.js
      │   └─ agentExecutor.js
      ├─ parallelExecutor.js
      ├─ decisionMatrix.js
      ├─ scratchpad.js
      ├─ readWriteSeparator.js (Phase 3)
      │   ├─ readWorker.js
      │   └─ writeWorker.js
      ├─ cacheLayer.js (Phase 3)
      ├─ taskNotification.js
      ├─ toolSystem.js
      ├─ flexibleRecovery.js
      └─ accessControl.js
```

---

## 🚀 扩展性设计

### 水平扩展

- 支持多实例部署
- 分布式任务队列
- WebSocket 实时通信

### 垂直扩展

- 插件系统
- 自定义 Worker 类型
- 自定义决策策略

---

**Made with ❤️ for OpenClaw Community**
