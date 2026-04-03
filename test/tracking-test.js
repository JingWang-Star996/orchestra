#!/usr/bin/env node

/**
 * 工具追踪功能测试脚本
 * 
 * 测试内容：
 * 1. ToolTracker 基本功能
 * 2. ActivityDescriber 模板系统
 * 3. 集成测试
 */

const path = require('path');
const { ToolTracker, createTracker } = require('../toolTracker');
const { ActivityDescriber, createDescriber } = require('../activityDescriber');

console.log('=== Orchestra 工具追踪功能测试 ===\n');

// 测试结果
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function test(name, fn) {
  try {
    fn();
    results.passed++;
    results.tests.push({ name, status: '✅ PASS' });
    console.log(`✅ ${name}`);
  } catch (error) {
    results.failed++;
    results.tests.push({ name, status: '❌ FAIL', error: error.message });
    console.log(`❌ ${name}: ${error.message}`);
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    results.passed++;
    results.tests.push({ name, status: '✅ PASS' });
    console.log(`✅ ${name}`);
  } catch (error) {
    results.failed++;
    results.tests.push({ name, status: '❌ FAIL', error: error.message });
    console.log(`❌ ${name}: ${error.message}`);
  }
}

// ========== ToolTracker 测试 ==========

console.log('--- ToolTracker 测试 ---\n');

test('创建追踪器', () => {
  const tracker = new ToolTracker();
  if (!tracker) throw new Error('追踪器创建失败');
});

test('开始调用记录', () => {
  const tracker = new ToolTracker();
  const callId = tracker.startCall('read', '测试读取', { path: 'test.js' });
  if (!callId) throw new Error('callId 为空');
  if (!tracker.activeCalls.has(callId)) throw new Error('调用未记录');
});

test('结束调用记录', () => {
  const tracker = new ToolTracker();
  const callId = tracker.startCall('read', '测试', {});
  tracker.endCall(callId, { result: 'success' });
  
  const record = tracker.records.find(r => r.callId === callId);
  if (!record) throw new Error('记录不存在');
  if (record.status !== 'completed') throw new Error('状态不正确');
  if (!record.duration) throw new Error('缺少耗时');
});

test('错误记录', () => {
  const tracker = new ToolTracker();
  const callId = tracker.startCall('exec', '测试命令', { cmd: 'ls' });
  tracker.endCall(callId, {}, new Error('执行失败'));
  
  const record = tracker.records.find(r => r.callId === callId);
  if (!record.error) throw new Error('错误未记录');
  if (tracker.stats.errorCount !== 1) throw new Error('错误计数不正确');
});

test('性能报告', () => {
  const tracker = new ToolTracker();
  
  // 模拟多次调用
  for (let i = 0; i < 5; i++) {
    const callId = tracker.startCall('read', `测试${i}`, {});
    tracker.endCall(callId, { i });
  }
  
  const report = tracker.getPerformanceReport();
  if (!report.summary) throw new Error('缺少摘要');
  if (report.summary.totalCalls !== 5) throw new Error('调用次数不正确');
  if (!report.toolStats) throw new Error('缺少工具统计');
});

test('时间线', () => {
  const tracker = new ToolTracker();
  
  const id1 = tracker.startCall('read', '读取 1', {});
  tracker.endCall(id1, {});
  
  const id2 = tracker.startCall('write', '写入 1', {});
  tracker.endCall(id2, {});
  
  const timeline = tracker.getTimeline();
  if (timeline.length !== 2) throw new Error('时间线长度不正确');
  if (timeline[0].toolName !== 'read') throw new Error('顺序不正确');
});

test('错误追踪', () => {
  const tracker = new ToolTracker();
  
  const id1 = tracker.startCall('read', '失败读取', {});
  tracker.endCall(id1, {}, new Error('文件不存在'));
  
  const errors = tracker.getErrorTraces();
  if (errors.length !== 1) throw new Error('错误数量不正确');
  if (!errors[0].error.stack) throw new Error('缺少堆栈');
});

test('包装函数', async () => {
  const tracker = new ToolTracker();
  
  const wrappedFn = tracker.wrap('test', async (x) => {
    return x * 2;
  }, '测试包装');
  
  const result = await wrappedFn(5);
  if (result !== 10) throw new Error('包装函数结果不正确');
  if (tracker.stats.totalCalls !== 1) throw new Error('调用未记录');
});

test('事件监听', async () => {
  const tracker = new ToolTracker();
  let startCalled = false;
  let endCalled = false;
  
  tracker.on('call:start', () => { startCalled = true; });
  tracker.on('call:end', () => { endCalled = true; });
  
  const callId = tracker.startCall('test', '事件测试', {});
  tracker.endCall(callId, {});
  
  if (!startCalled) throw new Error('start 事件未触发');
  if (!endCalled) throw new Error('end 事件未触发');
});

test('导出 JSON', () => {
  const tracker = new ToolTracker();
  const callId = tracker.startCall('read', '导出测试', {});
  tracker.endCall(callId, { data: 'test' });
  
  const json = tracker.exportJSON();
  const parsed = JSON.parse(json);
  
  if (!parsed.records) throw new Error('缺少记录');
  if (!parsed.stats) throw new Error('缺少统计');
  if (!parsed.exportedAt) throw new Error('缺少时间戳');
});

test('清空记录', () => {
  const tracker = new ToolTracker();
  tracker.startCall('read', '测试', {});
  tracker.clear();
  
  if (tracker.records.length !== 0) throw new Error('记录未清空');
  if (tracker.activeCalls.size !== 0) throw new Error('活跃调用未清空');
});

// ========== ActivityDescriber 测试 ==========

console.log('\n--- ActivityDescriber 测试 ---\n');

test('创建描述器', () => {
  const describer = new ActivityDescriber();
  if (!describer) throw new Error('描述器创建失败');
});

test('进度描述', () => {
  const describer = new ActivityDescriber({ language: 'zh-CN' });
  const desc = describer.describeProgress('read', { path: 'test.js' });
  
  if (!desc.includes('读取')) throw new Error(`描述不正确：${desc}`);
  if (!desc.includes('test.js')) throw new Error(`缺少路径：${desc}`);
});

test('完成描述', () => {
  const describer = new ActivityDescriber({ language: 'zh-CN' });
  const desc = describer.describeComplete('read', { path: 'test.js', length: 1024 });
  
  if (!desc.includes('已读取')) throw new Error(`描述不正确：${desc}`);
  if (!desc.includes('1024')) throw new Error(`缺少长度：${desc}`);
});

test('错误描述', () => {
  const describer = new ActivityDescriber({ language: 'zh-CN' });
  const desc = describer.describeError('read', new Error('权限不足'), { path: 'secret.txt' });
  
  if (!desc.includes('失败')) throw new Error(`描述不正确：${desc}`);
  if (!desc.includes('权限不足')) throw new Error(`缺少错误信息：${desc}`);
});

test('自定义模板', () => {
  const describer = new ActivityDescriber({ language: 'zh-CN' });
  
  describer.addTemplate('custom_tool', {
    default: '自定义：{data}',
    completed: '完成：{result}',
    error: '错误：{error}'
  });
  
  const desc = describer.describe('custom_tool', 'default', { data: 'test' });
  if (!desc.includes('自定义')) throw new Error(`自定义模板未生效：${desc}`);
});

test('多语言支持', () => {
  const describer = new ActivityDescriber({ language: 'en-US' });
  const desc = describer.describeComplete('read', { path: 'test.js', length: 100 });
  
  if (!desc.includes('Read')) throw new Error(`英文描述不正确：${desc}`);
});

test('批量描述', () => {
  const describer = new ActivityDescriber();
  
  const records = [
    { toolName: 'read', status: 'completed', timestamp: new Date().toISOString(), input: { path: 'a.js' } },
    { toolName: 'write', status: 'error', timestamp: new Date().toISOString(), error: { message: '失败' } }
  ];
  
  const described = describer.describeBatch(records);
  if (described.length !== 2) throw new Error('批量描述数量不正确');
  if (!described[0].description) throw new Error('缺少描述');
});

test('生成摘要', () => {
  const describer = new ActivityDescriber();
  
  const records = [
    { toolName: 'read', status: 'completed', timestamp: new Date().toISOString() }
  ];
  
  const summary = describer.generateSummary(records);
  if (!summary.includes('活动记录')) throw new Error(`摘要不正确：${summary}`);
});

// ========== 集成测试 ==========

console.log('\n--- 集成测试 ---\n');

asyncTest('追踪器 + 描述器集成', async () => {
  const tracker = new ToolTracker({ verbose: false });
  const describer = new ActivityDescriber({ language: 'zh-CN' });
  
  // 模拟完整调用流程
  const callId = tracker.startCall('web_search', '搜索信息', { query: 'AI 发展' });
  await new Promise(resolve => setTimeout(resolve, 50)); // 模拟延迟
  tracker.endCall(callId, { count: 10 });
  
  // 生成描述
  const record = tracker.records[0];
  const description = describer.describe(
    record.toolName,
    record.status,
    { ...record.input, ...record.output }
  );
  
  if (!description.includes('搜索')) throw new Error(`描述不正确：${description}`);
  if (!description.includes('完成')) throw new Error(`状态描述不正确：${description}`);
});

asyncTest('性能警告测试', async () => {
  const tracker = new ToolTracker({ 
    performanceThreshold: 50,
    verbose: false
  });
  
  let warningReceived = false;
  tracker.on('performance:warning', () => { warningReceived = true; });
  
  const callId = tracker.startCall('slow_tool', '慢工具', {});
  await new Promise(resolve => setTimeout(resolve, 100));
  tracker.endCall(callId, {});
  
  if (!warningReceived) throw new Error('未收到性能警告');
  
  const report = tracker.getPerformanceReport();
  if (report.bottlenecks.length === 0) throw new Error('未识别瓶颈');
});

// ========== 运行测试 ==========

(async () => {
  console.log('\n=== 测试结果 ===\n');
  console.log(`✅ 通过：${results.passed}`);
  console.log(`❌ 失败：${results.failed}`);
  console.log(`📊 总计：${results.passed + results.failed}`);
  
  if (results.failed > 0) {
    console.log('\n失败测试:');
    results.tests
      .filter(t => t.status === '❌ FAIL')
      .forEach(t => {
        console.log(`  - ${t.name}: ${t.error}`);
      });
    process.exit(1);
  } else {
    console.log('\n🎉 所有测试通过！');
    process.exit(0);
  }
})();
