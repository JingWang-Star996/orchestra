#!/usr/bin/env node

/**
 * Orchestra Worker 管理系统单元测试
 * 
 * 测试覆盖：
 * 1. WorkerManager - Worker 生命周期管理
 * 2. DecisionMatrix - Continue vs. Spawn 决策逻辑
 * 
 * @author Orchestra AI System
 * @version 1.0.0
 */

const assert = require('assert');

// 导入被测试模块
const WorkerManager = require('./workerManager');
const DecisionMatrix = require('./decisionMatrix');
const {
  DecisionType,
  DecisionReason,
  calculateContextOverlap,
  extractFilesFromTask,
  identifyTaskType,
  decideContinueOrSpawn,
  generateDecisionReport
} = require('./decisionMatrix');

// ============================================================================
// 测试工具函数
// ============================================================================

let testsPassed = 0;
let testsFailed = 0;
let currentTestGroup = '';

function testGroup(name) {
  currentTestGroup = name;
  console.log(`\n📋 ${name}`);
  console.log('='.repeat(60));
}

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    testsPassed++;
  } catch (error) {
    console.error(`  ❌ ${name}`);
    console.error(`     错误：${error.message}`);
    testsFailed++;
  }
}

function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(`${message} 期望 "${expected}", 实际 "${actual}"`);
  }
}

function assertDeepEqual(actual, expected, message = '') {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`${message} 期望 ${expectedStr}, 实际 ${actualStr}`);
  }
}

function assertTrue(condition, message = '') {
  if (!condition) {
    throw new Error(message || '期望为 true');
  }
}

// ============================================================================
// WorkerManager 测试
// ============================================================================

testGroup('WorkerManager - Worker 生命周期管理');

test('创建 Worker', async () => {
  const manager = new WorkerManager({ verbose: false });
  const result = await manager.create({
    description: '测试 Worker',
    subagent_type: 'worker',
    prompt: '这是一个测试任务'
  });
  
  assertTrue(result.workerId.startsWith('agent-'), 'Worker ID 格式错误');
  assertEqual(result.status, 'created', '状态错误');
  assertEqual(manager.getWorkerCount(), 1, 'Worker 数量错误');
});

test('获取 Worker 状态', async () => {
  const manager = new WorkerManager({ verbose: false });
  const createResult = await manager.create({
    description: '状态测试 Worker',
    subagent_type: 'worker'
  });
  
  const status = manager.getWorkerStatus(createResult.workerId);
  assertTrue(status !== null, '状态不应为 null');
  assertEqual(status.description, '状态测试 Worker', '描述错误');
  assertEqual(status.status, 'running', '状态值错误');
});

test('获取所有 Worker 状态', async () => {
  const manager = new WorkerManager({ verbose: false });
  
  await manager.create({ description: 'Worker 1' });
  await manager.create({ description: 'Worker 2' });
  await manager.create({ description: 'Worker 3' });
  
  const allStatus = manager.getAllStatus();
  assertEqual(allStatus.total, 3, '总数错误');
  assertEqual(allStatus.running, 3, '运行中数量错误');
  assertEqual(allStatus.workers.length, 3, 'Worker 列表长度错误');
});

test('停止 Worker', async () => {
  const manager = new WorkerManager({ verbose: false });
  const createResult = await manager.create({
    description: '停止测试 Worker'
  });
  
  const stopResult = await manager.stop({
    task_id: createResult.workerId,
    reason: '测试停止'
  });
  
  assertEqual(stopResult.status, 'killed', '停止状态错误');
  assertTrue(stopResult.notification !== undefined, '通知不应为 undefined');
  
  const status = manager.getWorkerStatus(createResult.workerId);
  assertEqual(status.status, 'killed', 'Worker 状态未更新');
});

test('导出 Worker 历史', async () => {
  const manager = new WorkerManager({ verbose: false });
  
  const create1 = await manager.create({ description: '历史 Worker 1' });
  await manager.stop({ task_id: create1.workerId });
  
  const create2 = await manager.create({ description: '历史 Worker 2' });
  await manager.stop({ task_id: create2.workerId });
  
  const history = manager.exportHistory();
  assertEqual(history.length, 2, '历史记录数量错误');
  assertTrue(history[0].stoppedAt !== undefined, '停止时间缺失');
});

test('清理已完成的 Worker', async () => {
  const manager = new WorkerManager({ verbose: false });
  
  const create1 = await manager.create({ description: '清理 Worker 1' });
  await manager.stop({ task_id: create1.workerId });
  
  const create2 = await manager.create({ description: '清理 Worker 2' });
  // 这个不停止
  
  const cleaned = manager.cleanupCompleted();
  assertEqual(cleaned, 1, '清理数量错误');
  assertEqual(manager.getWorkerCount(), 1, '剩余数量错误');
});

test('Worker 不存在时抛出错误', async () => {
  const manager = new WorkerManager({ verbose: false });
  
  try {
    await manager.continue('non-existent-worker', 'test');
    throw new Error('应该抛出错误');
  } catch (error) {
    assertTrue(error.message.includes('不存在'), '错误消息不正确');
  }
});

// ============================================================================
// DecisionMatrix 测试
// ============================================================================

testGroup('DecisionMatrix - Continue vs. Spawn 决策逻辑');

test('提取文件列表 - 从 prompt 中', () => {
  const task = {
    id: 'task-1',
    prompt: '请修改 auth.js 和 user.js 文件'
  };
  
  const files = extractFilesFromTask(task);
  assertTrue(files.includes('auth.js'), '缺少 auth.js');
  assertTrue(files.includes('user.js'), '缺少 user.js');
});

test('提取文件列表 - 从 files 字段', () => {
  const task = {
    id: 'task-2',
    files: ['config.json', 'README.md']
  };
  
  const files = extractFilesFromTask(task);
  assertEqual(files.length, 2, '文件数量错误');
  assertTrue(files.includes('config.json'), '缺少 config.json');
});

test('提取文件列表 - 去重', () => {
  const task = {
    id: 'task-3',
    prompt: '修改 test.js',
    files: ['test.js', 'test.js']
  };
  
  const files = extractFilesFromTask(task);
  assertEqual(files.length, 1, '应该去重');
  assertTrue(files.includes('test.js'), '缺少 test.js');
});

test('计算上下文重叠度 - 完全重叠', () => {
  const task = {
    id: 'task-4',
    files: ['a.js', 'b.js']
  };
  
  const context = {
    id: 'worker-1',
    visitedFiles: ['a.js', 'b.js', 'c.js']
  };
  
  const overlap = calculateContextOverlap(task, context);
  assertEqual(overlap, 1, '应该是完全重叠 (1.0)');
});

test('计算上下文重叠度 - 部分重叠', () => {
  const task = {
    id: 'task-5',
    files: ['a.js', 'b.js', 'c.js']
  };
  
  const context = {
    id: 'worker-2',
    visitedFiles: ['a.js', 'd.js']
  };
  
  const overlap = calculateContextOverlap(task, context);
  assertEqual(overlap, 1/3, '应该是 33% 重叠');
});

test('计算上下文重叠度 - 无重叠', () => {
  const task = {
    id: 'task-6',
    files: ['a.js']
  };
  
  const context = {
    id: 'worker-3',
    visitedFiles: ['b.js', 'c.js']
  };
  
  const overlap = calculateContextOverlap(task, context);
  assertEqual(overlap, 0, '应该是无重叠 (0)');
});

test('识别任务类型 - 研究探索了 exactly 需要编辑的文件', () => {
  const task = {
    id: 'task-7',
    prompt: '修改 auth.js 和 user.js 的认证逻辑',
    files: ['auth.js', 'user.js']
  };
  
  const context = {
    id: 'worker-4',
    visitedFiles: ['auth.js', 'user.js', 'session.js']
  };
  
  const taskType = identifyTaskType(task, context);
  assertEqual(taskType, 'RESEARCH_EXACT_FILES', '任务类型识别错误');
});

test('识别任务类型 - 研究广泛但实现狭窄', () => {
  const task = {
    id: 'task-8',
    prompt: '研究并实现登录功能',
    files: ['login.js']
  };
  
  const context = {
    id: 'worker-5',
    visitedFiles: ['auth.js', 'user.js', 'session.js', 'token.js', 'permission.js', 'role.js']
  };
  
  const taskType = identifyTaskType(task, context);
  assertEqual(taskType, 'RESEARCH_BROAD_IMPLEMENTATION_NARROW', '任务类型识别错误');
});

test('识别任务类型 - 验证另一个 Worker 的代码', () => {
  const task = {
    id: 'task-9',
    prompt: '验证登录功能的正确性',
    files: ['login.js']
  };
  
  const context = {
    id: 'worker-6',
    visitedFiles: ['login.js'],
    isDifferentWorker: true
  };
  
  const taskType = identifyTaskType(task, context);
  assertEqual(taskType, 'VERIFY_ANOTHER_WORKER', '任务类型识别错误');
});

test('决策 - 高重叠度应该 Continue', () => {
  const task = {
    id: 'task-10',
    files: ['a.js', 'b.js']
  };
  
  const context = {
    id: 'worker-7',
    visitedFiles: ['a.js', 'b.js', 'c.js']
  };
  
  const decision = decideContinueOrSpawn(task, context);
  assertEqual(decision.decision, DecisionType.CONTINUE, '应该 Continue');
  assertEqual(decision.confidence, 'high', '置信度应该是 high');
});

test('决策 - 低重叠度应该 Spawn', () => {
  const task = {
    id: 'task-11',
    files: ['x.js']
  };
  
  const context = {
    id: 'worker-8',
    visitedFiles: ['a.js', 'b.js', 'c.js']
  };
  
  const decision = decideContinueOrSpawn(task, context);
  assertEqual(decision.decision, DecisionType.SPAWN, '应该 Spawn');
});

test('决策 - RESEARCH_EXACT_FILES 应该 Continue', () => {
  const task = {
    id: 'task-12',
    prompt: '修改 auth.js 和 user.js 的认证逻辑',
    files: ['auth.js', 'user.js']
  };
  
  const context = {
    id: 'worker-9',
    visitedFiles: ['auth.js', 'user.js', 'session.js']
  };
  
  const decision = decideContinueOrSpawn(task, context);
  assertEqual(decision.decision, DecisionType.CONTINUE, '应该 Continue');
  assertEqual(decision.reason, DecisionReason.HIGH_OVERLAP, '原因应该是 HIGH_OVERLAP');
});

test('决策 - VERIFY_ANOTHER_WORKER 应该 Spawn', () => {
  const task = {
    id: 'task-13',
    prompt: '验证登录功能的正确性',
    files: ['login.js']
  };
  
  const context = {
    id: 'worker-10',
    visitedFiles: ['login.js'],
    isDifferentWorker: true
  };
  
  const decision = decideContinueOrSpawn(task, context);
  assertEqual(decision.decision, DecisionType.SPAWN, '应该 Spawn');
  assertEqual(decision.reason, DecisionReason.FRESH_EYES, '原因应该是 FRESH_EYES');
});

test('生成决策报告', () => {
  const task = {
    id: 'task-14',
    prompt: '修改 auth.js 和 user.js',
    files: ['auth.js', 'user.js']
  };
  
  const context = {
    id: 'worker-11',
    visitedFiles: ['auth.js', 'user.js']
  };
  
  const decision = decideContinueOrSpawn(task, context);
  const report = generateDecisionReport(task, context, decision);
  
  assertTrue(report.timestamp !== undefined, '时间戳缺失');
  assertEqual(report.task.id, 'task-14', '任务 ID 错误');
  assertEqual(report.workerContext.id, 'worker-11', 'Worker ID 错误');
  assertEqual(report.decision.type, DecisionType.CONTINUE, '决策类型错误');
});

test('DecisionMatrix 类 - 实例化', () => {
  const matrix = new DecisionMatrix();
  const config = matrix.getConfig();
  
  assertTrue(config.HIGH_OVERLAP_THRESHOLD === 0.7, '配置错误');
  assertTrue(config.LOW_OVERLAP_THRESHOLD === 0.3, '配置错误');
});

test('DecisionMatrix 类 - 自定义配置', () => {
  const matrix = new DecisionMatrix({
    HIGH_OVERLAP_THRESHOLD: 0.8,
    LOW_OVERLAP_THRESHOLD: 0.2
  });
  
  const config = matrix.getConfig();
  assertEqual(config.HIGH_OVERLAP_THRESHOLD, 0.8, '高阈值错误');
  assertEqual(config.LOW_OVERLAP_THRESHOLD, 0.2, '低阈值错误');
});

test('DecisionMatrix 类 - 更新配置', () => {
  const matrix = new DecisionMatrix();
  matrix.updateConfig({ HIGH_OVERLAP_THRESHOLD: 0.9 });
  
  const config = matrix.getConfig();
  assertEqual(config.HIGH_OVERLAP_THRESHOLD, 0.9, '更新后阈值错误');
});

// ============================================================================
// 集成测试
// ============================================================================

testGroup('集成测试 - WorkerManager + DecisionMatrix');

test('完整工作流：创建 Worker → 决策 → 继续/停止', async () => {
  const manager = new WorkerManager({ verbose: false });
  const matrix = new DecisionMatrix();
  
  // 1. 创建 Worker
  const createResult = await manager.create({
    description: '研究认证模块',
    prompt: '研究 auth.js 和 user.js'
  });
  
  // 2. 模拟 Worker 执行后有了上下文
  const worker = manager.getWorkerStatus(createResult.workerId);
  
  // 3. 新任务：修改认证逻辑
  const newTask = {
    id: 'followup-task',
    prompt: '修改 auth.js 和 user.js 的认证逻辑',
    files: ['auth.js', 'user.js']
  };
  
  const context = {
    id: createResult.workerId,
    visitedFiles: ['auth.js', 'user.js']
  };
  
  // 4. 决策
  const decision = matrix.decide(newTask, context);
  
  // 5. 验证决策
  assertEqual(decision.decision, DecisionType.CONTINUE, '应该继续现有 Worker');
  
  console.log(`  📊 决策：${decision.decision}, 原因：${decision.reason}, 重叠度：${decision.overlap.toFixed(2)}`);
});

// ============================================================================
// 测试结果汇总
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log('📊 测试结果汇总');
console.log('='.repeat(60));
console.log(`通过：${testsPassed} 个`);
console.log(`失败：${testsFailed} 个`);
console.log(`通过率：${(testsPassed / (testsPassed + testsFailed) * 100).toFixed(1)}%`);

if (testsFailed > 0) {
  console.log('\n❌ 部分测试失败，请检查错误信息');
  process.exit(1);
} else {
  console.log('\n🎉 所有测试通过！');
  process.exit(0);
}
