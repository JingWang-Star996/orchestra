# Orchestra 用户使用手册

**版本**: v1.2.0  
**最后更新**: 2026-04-19

---

## 一、快速开始

### 安装

```bash
git clone https://github.com/JingWang-Star996/orchestra.git
cd orchestra
npm install
```

### 环境变量

```bash
export ORCHESTRA_API_KEY="sk-xxx"
export ORCHESTRA_MODEL="qwen3.5-plus"
```

### 最小示例

```javascript
const { Gateway } = require('./index.js');

const gateway = new Gateway({
  model: 'qwen3.5-plus',
  verbose: true,
  maxConcurrent: 5,
  timeout: 3600000
});

const result = await gateway.execute({
  task: '设计一个宠物养成系统',
  agents: ['AI 主策划', 'AI 系统策划']
});

console.log(result.summary);
```

---

## 二、核心概念

### 四阶段工作流

| 阶段 | 说明 | 执行方式 |
|------|------|---------|
| Research | 研究代码库、查找文件、收集日志 | 多 Worker 并行 |
| Synthesis | 综合研究发现、制定方案 | Coordinator |
| Implementation | 实现修改 | 多 Worker 并行 |
| Verification | 运行测试、验证结果 | 多 Worker 并行 |

### 核心组件

- **Gateway** — 统一入口，负责任务分发
- **WorkerManager** — Worker 生命周期管理
- **Scratchpad** — 跨 Worker 知识共享
- **DecisionMatrix** — Continue vs Spawn 智能决策
- **TaskNotification** — 结构化任务通知
- **ParallelExecutor** — 异步并行执行引擎

---

## 三、Dashboard 监控

### 启动 Dashboard

```bash
node start-dashboard.js
# 打开 http://localhost:3000
```

### 功能面板

| 面板 | 说明 |
|------|------|
| Worker 状态 | 显示所有 Worker 的运行状态、消息数、Token 消耗 |
| 任务进度 | 实时显示四阶段工作流的完成进度 |
| 性能指标 | 响应时间、吞吐量、内存使用率 |
| 告警中心 | 自定义告警规则，支持邮件/飞书通知 |

---

## 四、ML 优化

### 权重自动优化

```javascript
const { WeightOptimizer, DecisionHistory, ABTestManager } = require('./ml-optimizer');

// 记录决策历史
const history = new DecisionHistory();
history.record({
  decision: 'spawn',
  context: '分析支付模块',
  success: true,
  duration: 45000
});

// 获取优化后的权重
const optimizer = new WeightOptimizer();
const weights = optimizer.optimize(history.getAll());

// A/B 测试
const ab = new ABTestManager();
ab.createExperiment('decision-algorithm', {
  variantA: 'weighted-score',
  variantB: 'ml-predicted'
});
```

### 优化效果

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| 决策准确率 | 65% | 82% |
| 平均响应时间 | 3.2s | 2.1s |
| Worker 利用率 | 60% | 78% |

---

## 五、分布式部署

### 单机模式

默认模式，所有 Worker 在同一实例中运行。

### 多实例模式

```javascript
const { createRuntime } = require('./distributed');

// 主节点
const master = createRuntime({
  nodeId: 'master-1',
  role: 'master',
  storagePath: './data',
  heartbeatInterval: 5000,
  messageBusPort: 4001
});

// 工作节点
const worker = createRuntime({
  nodeId: 'worker-1',
  role: 'worker',
  masterHost: '192.168.1.100',
  masterPort: 4001,
  storagePath: './data'
});
```

### 节点发现

```javascript
const { NodeRegistry } = require('./distributed');

const registry = new NodeRegistry({ storagePath: './data/nodes' });

// 注册节点
await registry.register({
  nodeId: 'worker-2',
  role: 'worker',
  host: '192.168.1.101',
  port: 4002
});

// 获取所有节点
const nodes = await registry.list();
```

### 状态同步

```javascript
const { StateSync } = require('./distributed');

const sync = new StateSync({
  nodeId: 'worker-1',
  storagePath: './data/state',
  syncInterval: 10000
});

// 设置数据（自动同步到其他节点）
await sync.set('scratchpad:research', { files: ['/src/auth.js'] });

// 获取全局一致的数据
const data = await sync.get('scratchpad:research');
```

### 消息总线

```javascript
const { MessageBus } = require('./distributed');

const bus = new MessageBus({
  storagePath: './data/messages',
  pollInterval: 1000
});

// 发布消息
await bus.publish('task.completed', {
  taskId: 'task-001',
  nodeId: 'worker-1',
  result: { status: 'success' }
});

// 订阅消息
bus.subscribe('task.completed', (message) => {
  console.log('Task completed:', message.taskId);
});
```

---

## 六、常见问题

### Q: Dashboard 无法连接？
检查 `dashboard/config.js` 中的端口配置，确保 Gateway 正在运行。

### Q: Worker 超时怎么办？
调整 `timeoutSeconds` 参数，或在 `WorkerManager` 配置中设置更大的超时值。

### Q: 如何查看 Worker 日志？
Worker 日志保存在 `temp/workers/` 目录下，按 Worker ID 分文件。

### Q: 分布式模式下节点无法通信？
1. 确保 `masterHost` 和 `masterPort` 配置正确
2. 检查防火墙规则
3. 查看 `temp/messages/` 目录下的消息队列是否正常

---

## 七、高级配置

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ORCHESTRA_API_KEY` | API 密钥 | 必填 |
| `ORCHESTRA_MODEL` | AI 模型 | qwen3.5-plus |
| `ORCHESTRA_PORT` | 服务端口 | 3000 |
| `ORCHESTRA_STORAGE` | 数据存储路径 | ./temp |
| `ORCHESTRA_MAX_WORKERS` | 最大并发 Worker 数 | 10 |
| `ORCHESTRA_NODE_ID` | 分布式节点 ID | node-1 |
| `ORCHESTRA_ROLE` | 节点角色 | master |
| `ORCHESTRA_MASTER_HOST` | 主节点地址 | localhost |
| `ORCHESTRA_MASTER_PORT` | 主节点端口 | 4001 |

### 性能调优

- **缓存层**：自动启用，无需配置
- **读写分离**：自动识别读写任务，无需手动配置
- **并发数**：建议 3-5 个 Worker，根据机器性能调整

---

**更多信息请参考：**
- [README.md](./README.md) — 项目概述
- [DEPLOYMENT.md](./DEPLOYMENT.md) — 部署指南
- [P2-SUMMARY.md](./P2-SUMMARY.md) — P2 功能总结
