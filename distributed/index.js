/**
 * Orchestra Distributed Runtime — 统一导出入口
 *
 * 提供三个核心模块:
 *  - NodeRegistry  节点注册与发现（心跳、上下线事件）
 *  - MessageBus    轻量级消息总线（EventEmitter + 文件队列）
 *  - StateSync     跨节点状态同步（版本向量 + LWW 冲突解决）
 *
 * 用法:
 *   const { NodeRegistry, MessageBus, StateSync, createRuntime } = require('./distributed');
 *
 * 依赖: 仅 Node.js 内置模块，零外部依赖
 */

const NodeRegistry = require('./NodeRegistry');
const MessageBus = require('./MessageBus');
const StateSync = require('./StateSync');

module.exports = {
  NodeRegistry,
  MessageBus,
  StateSync,

  /**
   * 一键创建完整分布式运行时（包含 Registry + Bus + StateSync）
   *
   * @param {Object} opts
   * @param {string} [opts.nodeId]       节点 ID（不传则自动生成）
   * @param {string} [opts.role='hybrid'] 节点角色: primary | replica | worker | hybrid
   * @param {string} [opts.host='127.0.0.1']
   * @param {number} [opts.port=3000]
   * @param {'memory'|'file'} [opts.storageMode='memory']  存储模式
   * @param {string} [opts.dataDir]       数据目录（不传则使用默认 .orchestra-data）
   * @returns {{ registry: NodeRegistry, bus: MessageBus, stateSync: StateSync }}
   *
   * @example
   *   const { createRuntime } = require('./distributed');
   *   const runtime = createRuntime({ nodeId: 'node-1', role: 'primary' });
   *   runtime.registry.start();
   *   runtime.bus.start();
   *   runtime.stateSync.start();
   *   runtime.stateSync.set('key', 'value');
   */
  createRuntime(opts = {}) {
    const crypto = require('crypto');
    const nodeId = opts.nodeId || crypto.randomUUID();
    const dataDir = opts.dataDir || '.orchestra-data';

    const registry = new NodeRegistry({
      nodeId,
      role: opts.role || 'hybrid',
      host: opts.host || '127.0.0.1',
      port: opts.port || 3000,
      storageMode: opts.storageMode || 'memory',
      storagePath: `${dataDir}/nodes`,
    });

    const bus = new MessageBus({
      nodeId,
      queueDir: `${dataDir}/queue`,
    });

    const stateSync = new StateSync({
      nodeId,
      messageBus: bus,
    });

    return { registry, bus, stateSync };
  },
};

/* ───────── 直接运行时作为多节点集成演示 ───────── */
/* 运行方式: node distributed/index.js                               */
/* 该演示创建两个模拟节点，验证消息传递、状态同步、节点发现三大能力   */

if (require.main === module) {
  console.log('=== Orchestra Distributed Runtime Demo ===\n');
  console.log('创建两个节点（A=primary, B=worker），验证消息传递和状态同步\n');

  // ── 节点 A（主实例）──
  const runtimeA = module.exports.createRuntime({
    nodeId: 'node-A',
    role: 'primary',
    dataDir: '.orchestra-demo',
  });

  runtimeA.registry.start();
  runtimeA.bus.start();
  runtimeA.stateSync.start();

  // ── 节点 B（Worker 实例）──
  const runtimeB = module.exports.createRuntime({
    nodeId: 'node-B',
    role: 'worker',
    dataDir: '.orchestra-demo',
  });

  runtimeB.registry.start();
  runtimeB.bus.start();
  runtimeB.stateSync.start();

  // ── 事件监听 ──
  runtimeA.bus.subscribe('demo:greeting', (msg) => {
    console.log(`[A] 收到消息: "${msg.payload.text}" (来自 ${msg.sender})`);
  });

  runtimeA.stateSync.on('state:sync', (key, value, sourceNode) => {
    console.log(`[A] 状态同步: ${key} = ${JSON.stringify(value)} (来自 ${sourceNode})`);
  });

  runtimeA.stateSync.on('state:set', (key, value) => {
    console.log(`[A] 本地状态变更: ${key}`);
  });

  runtimeA.registry.on('node:joined', (id, info) => {
    console.log(`[A] 节点加入: ${id} (${info.role})`);
  });

  runtimeA.registry.on('node:offline', (id) => {
    console.log(`[A] 节点离线: ${id}`);
  });

  // ── 测试消息传递 ──
  console.log('[B] 发布消息到 demo:greeting');
  runtimeB.bus.publish('demo:greeting', { text: 'Hello from B!' });

  // ── 测试状态同步 ──
  console.log('[B] 设置状态: scratchpad.title / scratchpad.owner');
  runtimeB.stateSync.set('scratchpad.title', '分布式测试');
  runtimeB.stateSync.set('scratchpad.owner', 'node-B');

  // ── 测试全量同步 ──
  console.log('[A] 请求全量同步...');
  runtimeA.stateSync.requestFullSync();

  // ── 验证结果 ──
  setTimeout(() => {
    console.log('\n--- 验证结果 ---');
    console.log(`[A] scratchpad.title = ${runtimeA.stateSync.get('scratchpad.title')}`);
    console.log(`[A] scratchpad.owner = ${runtimeA.stateSync.get('scratchpad.owner')}`);
    console.log(`[A] 在线节点: ${JSON.stringify(runtimeA.registry.getOnlineNodes().map((n) => n.nodeId))}`);
    console.log(`[A] StateSync 统计: ${JSON.stringify(runtimeA.stateSync.stats())}`);
    console.log(`[B] StateSync 统计: ${JSON.stringify(runtimeB.stateSync.stats())}`);

    // 清理
    runtimeA.registry.stop();
    runtimeA.bus.stop();
    runtimeA.stateSync.stop();
    runtimeB.registry.stop();
    runtimeB.bus.stop();
    runtimeB.stateSync.stop();

    console.log('\n=== Demo finished ===');
  }, 500);
}
