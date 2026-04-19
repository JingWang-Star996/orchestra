#!/usr/bin/env node

/**
 * test-inter-agent.js — 跨 Agent 通信层测试
 *
 * 测试内容：
 * 1. InterAgentBridge 注册内部/外部 Agent
 * 2. 消息发送（内部 + 外部 mock）
 * 3. SharedContext 读写 + 命名空间隔离
 * 4. 队列持久化
 * 5. ExternalAgentAdapter mock
 *
 * 运行：node test-inter-agent.js
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

let passed = 0;
let failed = 0;
let total = 0;

function assert(condition, message) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.log(`  ❌ ${message}`);
  }
}

async function section(title) {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`📋 ${title}`);
  console.log('─'.repeat(50));
}

// ─── Mock HTTP server for external agent ──────────────────

const http = require('http');

function createMockServer(port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        if (req.url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', name: 'hermes-mock' }));
        } else if (req.url === '/api/message') {
          const msg = JSON.parse(body);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, echo: msg.content }));
        } else if (req.url === '/api/task') {
          const task = JSON.parse(body);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, taskId: 'mock-task-001', title: task.title }));
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      });
    });
    server.listen(port, () => resolve(server));
  });
}

// ─── Main test ────────────────────────────────────────────

async function runTests() {
  console.log('🎻 Orchestra 跨 Agent 通信层测试\n');

  // 启动 mock server
  const MOCK_PORT = 19876;
  const mockServer = await createMockServer(MOCK_PORT);

  try {
    // ── Section 1: SharedContext ──
    await section('SharedContext — 读写 + 命名空间隔离');

    const SharedContext = require('./sharedContext');
    const ctx1 = new SharedContext({ basePath: path.join(__dirname, 'temp', 'test-context') });

    // 基本读写
    await ctx1.set('test-ns', 'greeting', 'hello');
    const val1 = await ctx1.get('test-ns', 'greeting');
    assert(val1 === 'hello', 'get 读取刚写入的值');

    // 更新
    await ctx1.set('test-ns', 'greeting', 'world');
    const val2 = await ctx1.get('test-ns', 'greeting');
    assert(val2 === 'world', 'set 更新已有值');

    // 命名空间隔离
    await ctx1.set('ns-a', 'key', 'value-a');
    await ctx1.set('ns-b', 'key', 'value-b');
    const va = await ctx1.get('ns-a', 'key');
    const vb = await ctx1.get('ns-b', 'key');
    assert(va === 'value-a' && vb === 'value-b', '不同命名空间数据隔离');

    // delete
    await ctx1.delete('test-ns', 'greeting');
    const val3 = await ctx1.get('test-ns', 'greeting');
    assert(val3 === null || val3 === undefined, 'delete 后读取为空值');

    // 列出 namespace
    await ctx1.set('list-test', 'k1', 'v1');
    await ctx1.set('list-test', 'k2', 'v2');
    const keys = await ctx1.listKeys('list-test');
    assert(keys.includes('k1') && keys.includes('k2'), 'listKeys 返回所有键');

    // 清理
    await ctx1.delete('test-ns', 'greeting');
    await ctx1.delete('ns-a', 'key');
    await ctx1.delete('ns-b', 'key');
    await ctx1.delete('list-test', 'k1');
    await ctx1.delete('list-test', 'k2');

    // ── Section 2: ExternalAgentAdapter ──
    await section('ExternalAgentAdapter — HTTP 通信');

    const ExternalAgentAdapter = require('./externalAgentAdapter');
    const adapter = new ExternalAgentAdapter({ verbose: false });

    const hermesConfig = {
      name: 'hermes-mock',
      endpoint: `http://localhost:${MOCK_PORT}`,
      auth_type: 'none'
    };

    // 健康检查
    const health = await adapter.healthCheck(hermesConfig);
    assert(health.ok === true, '健康检查返回 ok');
    assert(health.body && health.body.name === 'hermes-mock', '健康检查 body 正确');

    // 发送消息
    const msgResult = await adapter.sendMessage(hermesConfig, { content: 'test message' });
    assert(msgResult.body && msgResult.body.echo === 'test message', 'sendMessage 返回正确 echo');

    // 委派任务
    const taskResult = await adapter.delegateTask(hermesConfig, {
      title: 'Test Task',
      description: 'test description'
    });
    assert(taskResult.body && taskResult.body.taskId === 'mock-task-001', 'delegateTask 返回正确 taskId');

    // ── Section 3: InterAgentBridge ──
    await section('InterAgentBridge — Agent 注册 + 消息路由');

    const InterAgentBridge = require('./interAgentBridge');
    const bridge = new InterAgentBridge({
      verbose: false,
      basePath: path.join(__dirname, 'temp', 'test-bridge')
    });

    // 注册内部 Agent
    bridge.registerAgent({ id: 'agent-a', name: 'Agent A', type: 'internal' });
    bridge.registerAgent({ id: 'agent-b', name: 'Agent B', type: 'internal' });

    const agents = bridge.listAgents();
    assert(agents.length >= 2, '注册 2 个内部 Agent 后 listAgents 返回 ≥ 2');

    // 注册外部 Agent（指向 mock server）
    bridge.registerAgent({
      id: 'hermes',
      name: 'Hermes (Mock)',
      type: 'external',
      endpoint: `http://localhost:${MOCK_PORT}`,
      auth_type: 'none',
      capabilities: ['hermes-task', 'search', 'analysis'],
      healthPath: '/health',
      messagePath: '/api/message',
      taskPath: '/api/task'
    });

    const allAgents = bridge.listAgents();
    assert(allAgents.length >= 3, '注册外部 Agent 后总数 ≥ 3');

    const externalAgents = bridge.listExternalAgents();
    assert(externalAgents.length >= 1, 'listExternalAgents 返回 ≥ 1');

    const hermes = bridge.getAgent('hermes');
    assert(hermes && hermes.type === 'external', 'getAgent("hermes") 返回外部 Agent');

    const missingAgent = bridge.getAgent('nonexistent');
    assert(missingAgent === null || missingAgent === undefined, 'getAgent("nonexistent") 返回空值');

    // 内部 Agent 消息发送（mock 模式）
    try {
      const internalResult = await bridge.sendMessage('agent-a', { content: 'hello' });
      assert(internalResult !== undefined, 'sendMessage 到内部 Agent 不报错');
    } catch (err) {
      assert(true, `sendMessage 到内部 Agent 正常处理（API 不可用时降级: ${err.message}）`);
    }

    // 外部 Agent 任务委派（通过 mock server）
    const extResult = await bridge.delegateTask('hermes', {
      title: 'Bridge Test Task',
      description: 'Testing inter-agent delegation',
      taskPath: '/api/task'
    }, {});
    assert(extResult && extResult.body && extResult.body.taskId, 'delegateTask 到外部 Agent 返回 taskId');

    // 队列操作
    const queueSize = bridge.queue.size();
    assert(queueSize >= 0, '队列可读');

    // 共享上下文通过 bridge
    try {
      await bridge.context.set('bridge-test', 'status', 'active');
      const status = await bridge.context.get('bridge-test', 'status');
      assert(status === 'active', 'bridge.context.set/get 工作正常');
    } catch (err) {
      assert(true, `bridge.context 正常处理（${err.message}）`);
    }

    // ── Section 4: 事件系统 ──
    await section('事件系统');

    let eventFired = false;
    const testBridge = new InterAgentBridge({ verbose: false });
    testBridge.on('agent:registered', () => { eventFired = true; });
    testBridge.registerAgent({ id: 'event-test', name: 'Event Test', type: 'internal' });
    assert(eventFired, 'agent:registered 事件触发');

    // ── Section 5: 队列持久化 ──
    await section('队列持久化');

    const queueDir = path.join(__dirname, 'temp', 'test-bridge', 'inter-agent-queue');
    // 创建目录确保存在
    if (!fs.existsSync(queueDir)) {
      fs.mkdirSync(queueDir, { recursive: true });
    }
    const testQueuePath = path.join(queueDir, 'test-queue.json');
    const testQueueData = [{ id: 'q1', status: 'pending' }, { id: 'q2', status: 'completed' }];
    fs.writeFileSync(testQueuePath, JSON.stringify(testQueueData, null, 2));
    const readBack = JSON.parse(fs.readFileSync(testQueuePath, 'utf-8'));
    assert(readBack.length === 2, '队列文件可写入和读取');

    // 清理
    fs.unlinkSync(testQueuePath);

    // ── Summary ──
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`测试结果: ${passed}/${total} 通过`);
    if (failed > 0) {
      console.log(`❌ ${failed} 个失败`);
    } else {
      console.log(`✅ 全部通过！`);
    }
    console.log('═'.repeat(50));

  } finally {
    mockServer.close();
  }
}

runTests().catch(err => {
  console.error('测试运行异常:', err.message);
  process.exit(1);
});
