/**
 * Phase 3 集成测试
 * 验证：FourPhaseWorkflow + PerformanceMonitor + ReadWriteSeparator + FlexibleRecovery
 */

var assert = require('assert');
var FourPhaseWorkflow = require('../fourPhaseWorkflow');
var PerformanceMonitor = require('../performanceMonitor');
var ReadWriteSeparator = require('../readWriteSeparator');
var FlexibleRecovery = require('../flexibleRecovery');
var CacheLayer = require('../cacheLayer');

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✅ ' + name);
  } catch (e) {
    failed++;
    console.log('  ❌ ' + name + ': ' + e.message);
  }
}

console.log('\n=== Phase 3 集成测试 ===\n');

// 1. FourPhaseWorkflow
console.log('1. FourPhaseWorkflow:');
test('基本流程', function() {
  var w = new FourPhaseWorkflow();
  assert.strictEqual(Object.keys(w.handlers).length, 0);
  assert.strictEqual(Object.keys(w.phaseResults).length, 0);
});

test('注册处理器', function() {
  var w = new FourPhaseWorkflow();
  w.registerHandler('research', function() { return Promise.resolve({ context: {} }); });
  assert.strictEqual(typeof w.handlers.research, 'function');
});

test('配置阶段', function() {
  var w = new FourPhaseWorkflow();
  w.configurePhase('research', { timeout: 5000 });
  assert.strictEqual(w.phaseConfig.research.timeout, 5000);
});

test('导出常量', function() {
  assert.strictEqual(FourPhaseWorkflow.PHASES.RESEARCH, 'research');
  assert.strictEqual(FourPhaseWorkflow.PHASES.VERIFICATION, 'verification');
});

// 2. PerformanceMonitor
console.log('\n2. PerformanceMonitor:');
test('并发控制器', function() {
  var pm = new PerformanceMonitor();
  assert.strictEqual(pm.concurrency.maxConcurrency, 5);
});

test('超时管理器', function() {
  var pm = new PerformanceMonitor({ defaultTimeout: 5000 });
  assert.strictEqual(pm.timeout.defaultTimeout, 5000);
});

test('资源监控器', function() {
  var pm = new PerformanceMonitor();
  assert.strictEqual(pm.resource.running, false);
  pm.resource.start();
  assert.strictEqual(pm.resource.running, true);
  pm.resource.stop();
  assert.strictEqual(pm.resource.running, false);
});

test('获取报告', function() {
  var pm = new PerformanceMonitor();
  var report = pm.getReport();
  assert.ok(report.concurrency);
  assert.ok(report.timeout);
});

// 3. ReadWriteSeparator
console.log('\n3. ReadWriteSeparator:');
test('分析只读任务', function() {
  var rw = new ReadWriteSeparator();
  var task = { actions: [{ type: 'readFile', path: 'test.js' }] };
  assert.strictEqual(rw.analyzeTaskType(task), ReadWriteSeparator.TaskType.READ_ONLY);
});

test('分析写入任务', function() {
  var rw = new ReadWriteSeparator();
  var task = { actions: [{ type: 'writeFile', path: 'test.js', content: 'x' }] };
  assert.strictEqual(rw.analyzeTaskType(task), ReadWriteSeparator.TaskType.WRITE_ONLY);
});

test('分析混合任务', function() {
  var rw = new ReadWriteSeparator();
  var task = { actions: [
    { type: 'readFile', path: 'test.js' },
    { type: 'writeFile', path: 'test.js', content: 'x' }
  ]};
  assert.strictEqual(rw.analyzeTaskType(task), ReadWriteSeparator.TaskType.READ_THEN_WRITE);
});

// 4. FlexibleRecovery
console.log('\n4. FlexibleRecovery:');
test('网络错误分类', function() {
  var fr = new FlexibleRecovery();
  var err = new Error('network error: ECONNRESET');
  assert.strictEqual(fr.classifyError(err), 'network_error');
});

test('权限错误分类', function() {
  var fr = new FlexibleRecovery();
  var err = new Error('permission denied: EACCES');
  assert.strictEqual(fr.classifyError(err), 'permission_error');
});

test('恢复策略-重试', function() {
  var fr = new FlexibleRecovery();
  var strategy = fr.getRecoveryStrategy(new Error('network error'), { workerId: 'w1' });
  assert.strictEqual(strategy, 'retry');
});

test('恢复策略-停止', function() {
  var fr = new FlexibleRecovery();
  var strategy = fr.getRecoveryStrategy(new Error('permission denied'), { workerId: 'w2' });
  assert.strictEqual(strategy, 'stop');
});

// 5. CacheLayer
console.log('\n5. CacheLayer:');
test('写入和读取', function() {
  var cache = new CacheLayer();
  cache.set('key1', 'value1');
  assert.strictEqual(cache.get('key1'), 'value1');
});

test('缓存不存在返回null', function() {
  var cache = new CacheLayer();
  assert.strictEqual(cache.get('nonexistent'), null);
});

test('命中率统计', function() {
  var cache = new CacheLayer();
  cache.set('k', 'v');
  cache.get('k'); // hit
  cache.get('missing'); // miss
  var stats = cache.getStats();
  assert.strictEqual(stats.hits, 1);
  assert.strictEqual(stats.misses, 1);
});

// 结果
console.log('\n========================================');
console.log('结果: ' + passed + '/' + (passed + failed) + ' 通过');
if (failed > 0) console.log('失败: ' + failed);
console.log('========================================\n');

process.exit(failed > 0 ? 1 : 0);
