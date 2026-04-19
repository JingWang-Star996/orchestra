# Orchestra 分布式运行时

Orchestra 多实例分布式运行时的轻量级实现，**零外部依赖**（仅使用 Node.js 内置模块）。

## 📦 模块

| 模块 | 文件 | 职责 |
|------|------|------|
| NodeRegistry | `NodeRegistry.js` | 节点注册、发现、心跳、上下线通知 |
| MessageBus | `MessageBus.js` | 轻量级消息总线（EventEmitter + 文件队列）|
| StateSync | `StateSync.js` | 跨节点状态同步（版本向量 + LWW 冲突解决）|

## 🚀 快速开始

### 方式一：一键创建运行时

```javascript
const { createRuntime } = require('./distributed');

// 创建节点 A
const nodeA = createRuntime({
  nodeId: 'instance-1',
  role: 'primary',
  storageMode: 'memory', // 或 'file' 持久化到本地
});

nodeA.registry.start();
nodeA.bus.start();
nodeA.stateSync.start();

// 写入状态
nodeA.stateSync.set('scratchpad.title', '我的项目');

// 发布消息
nodeA.bus.publish('tasks:new', { type: 'build', priority: 1 });
```

### 方式二：独立使用各模块

```javascript
const { NodeRegistry, MessageBus, StateSync } = require('./distributed');

// 1. 节点注册
const registry = new NodeRegistry({
  nodeId: 'worker-1',
  role: 'worker',
  storageMode: 'file',
  storagePath: './.orchestra-nodes',
});

registry.start();
registry.on('node:joined', (id, info) => {
  console.log(`节点加入: ${id} (${info.role})`);
});
registry.on('node:offline', (id) => {
  console.log(`节点离线: ${id}`);
});

// 2. 消息总线
const bus = new MessageBus({ nodeId: 'worker-1' });
bus.start();

// 订阅
bus.subscribe('worker:status', (msg) => {
  console.log('收到状态更新:', msg.payload);
});

// 发布
bus.publish('worker:status', { workerId: 'w1', status: 'busy' });

// 3. 状态同步
const stateSync = new StateSync({
  nodeId: 'worker-1',
  messageBus: bus,
});
stateSync.start();

stateSync.set('worker:w1:status', 'busy');
stateSync.set('worker:w1:cpu', 45);

console.log('当前状态:', stateSync.getAll());
```

## 📖 API 参考

### NodeRegistry

```javascript
const registry = new NodeRegistry(opts);

registry.start();           // 启动心跳
registry.stop();            // 停止并标记离线

registry.register(info);    // 注册/更新节点
registry.unregister(id);    // 注销节点
registry.getNode(id);       // 获取节点信息
registry.getOnlineNodes();  // 获取所有在线节点
registry.getAllNodes();     // 获取全部节点
registry.getByRole(role);   // 按角色筛选

// 事件
registry.on('node:online', (id) => {});
registry.on('node:offline', (id, node) => {});
registry.on('node:joined', (id, info) => {});
registry.on('node:left', (id, node) => {});
registry.on('heartbeat', (id, ts) => {});
```

### MessageBus

```javascript
const bus = new MessageBus(opts);

bus.start();
bus.stop();

bus.publish(topic, payload);     // 发布消息 → 返回 messageId
bus.subscribe(topic, handler);   // 订阅 → 返回退订函数
bus.subscribeOnce(topic);        // 一次性订阅 → Promise

// 事件
bus.on('bus:started', (nodeId) => {});
bus.on('bus:stopped', (nodeId) => {});
```

### StateSync

```javascript
const stateSync = new StateSync({ nodeId, messageBus: bus });

stateSync.start();
stateSync.stop();

stateSync.set(key, value);    // 设置并广播
stateSync.get(key);           // 获取值
stateSync.delete(key);        // 删除并广播
stateSync.getAll();           // 获取全部键值
stateSync.requestFullSync();  // 请求全量同步

stateSync.stats();            // { nodeId, entryCount, versionVectorKeys }

// 事件
stateSync.on('state:set', (key, value) => {});
stateSync.on('state:delete', (key) => {});
stateSync.on('state:sync', (key, value, sourceNode) => {});
stateSync.on('statesync:merged', (sourceNode) => {});
```

## 🧪 运行 Demo

```bash
node distributed/index.js
```

输出示例：

```
=== Orchestra Distributed Runtime Demo ===

[B] 发布消息到 demo:greeting
[B] 设置状态 scratchpad.title = "分布式测试"
[B] 设置状态 scratchpad.owner = "node-B"
[A] 请求全量同步...
[A] 收到消息: Hello from B! (来自 node-B)
[A] 状态变更: scratchpad.title = "分布式测试"
[A] 状态变更: scratchpad.owner = "node-B"

[A] scratchpad.title = 分布式测试
[A] scratchpad.owner = node-B

在线节点: ["node-A","node-B"]
[A] StateSync 统计: {"nodeId":"node-A","entryCount":2,...}
[B] StateSync 统计: {"nodeId":"node-B","entryCount":2,...}

=== Demo finished ===
```

## 🏗 架构说明

### 节点发现
- 文件模式：节点信息写入 `.orchestra-nodes/nodes.json`，多实例共享目录即可发现
- 内存模式：仅适合单进程多实例测试

### 消息传递
- 本地：EventEmitter 即时分发
- 跨节点：写入共享目录 `.orchestra-queue/outbound/`，各节点轮询消费

### 状态同步
- 版本向量跟踪每个键的变更历史
- 冲突解决：版本向量优先，相同版本则 LWW（最后写者胜出）
- 新节点加入时可请求全量同步

### 多实例部署

```
┌──────────┐    ┌──────────┐    ┌──────────┐
│Instance A│    │Instance B│    │Instance C│
└────┬─────┘    └────┬─────┘    └────┬─────┘
     │               │               │
     └───────────────┼───────────────┘
                     │
           ┌─────────┴─────────┐
           │  共享存储目录      │
           │  - nodes/         │  NodeRegistry 文件模式
           │  - queue/         │  MessageBus 消息队列
           └───────────────────┘
```

## ⚠️ 注意事项

1. **文件模式需要共享文件系统**（NFS、同一台机器多进程等）
2. **跨节点消息有轮询延迟**（默认 2 秒，可通过 `pollInterval` 调整）
3. **状态同步是最终一致性**，不是强一致
4. **适合中小型部署**（1-5 实例），大规模场景建议接入 Redis/RabbitMQ

---

**文档版本**: 2.0  
**更新日期**: 2026-04-19  
**状态**: 实现完成（设计文档见 `01-04`）
