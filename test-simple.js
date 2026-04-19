#!/usr/bin/env node

/**
 * Orchestra Phase 3 简单测试脚本
 * 不依赖 Jest，直接运行
 */

var assert = require('assert');
var CacheLayer = require('./cacheLayer');
var ReadWriteSeparator = require('./readWriteSeparator');

console.log('=== Orchestra Phase 3 简单测试 ===\n');

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('✅', name);
    passed++;
  } catch (error) {
    console.log('❌', name);
    console.log('   错误:', error.message);
    failed++;
  }
}

// ===== CacheLayer 测试 =====
console.log('\n--- CacheLayer 测试 ---\n');

var cache = new CacheLayer({
  maxSize: 100,
  defaultTTL: 60 * 1000,
  verbose: false
});

test('CacheLayer - 设置和获取', function() {
  cache.set('key1', 'value1');
  var value = cache.get('key1');
  assert.strictEqual(value, 'value1');
});

test('CacheLayer - 检查存在', function() {
  cache.set('key2', 'value2');
  assert.strictEqual(cache.has('key2'), true);
  assert.strictEqual(cache.has('nonexistent'), false);
});

test('CacheLayer - 删除', function() {
  cache.set('key3', 'value3');
  assert.strictEqual(cache.has('key3'), true);
  cache.delete('key3');
  assert.strictEqual(cache.has('key3'), false);
});

test('CacheLayer - 清空', function() {
  cache.set('key4', 'value4');
  cache.clear();
  assert.strictEqual(cache.size(), 0);
});

test('CacheLayer - 统计信息', function() {
  cache.set('key5', 'value5');
  cache.get('key5'); // hit
  cache.get('nonexistent'); // miss
  var stats = cache.getStats();
  // 统计是累积的，检查有命中和未命中即可
  assert.ok(stats.hits >= 1);
  assert.ok(stats.misses >= 1);
});

test('CacheLayer - 性能报告', function() {
  var report = cache.getPerformanceReport();
  assert.strictEqual(typeof report.cacheSize, 'number');
  assert.strictEqual(typeof report.hitRate, 'string');
});

// ===== ReadWriteSeparator 测试 =====
console.log('\n--- ReadWriteSeparator 测试 ---\n');

var separator = new ReadWriteSeparator({
  verbose: false,
  dryRun: true
});

test('ReadWriteSeparator - 识别只读任务', function() {
  var task = {
    actions: [
      { type: 'readFile', path: '/test.js' }
    ]
  };
  var taskType = separator.analyzeTaskType(task);
  assert.strictEqual(taskType, 'read_only');
});

test('ReadWriteSeparator - 识别只写任务', function() {
  var task = {
    actions: [
      { type: 'writeFile', path: '/test.js', content: 'test' }
    ]
  };
  var taskType = separator.analyzeTaskType(task);
  assert.strictEqual(taskType, 'write_only');
});

test('ReadWriteSeparator - 识别先读后写任务', function() {
  var task = {
    actions: [
      { type: 'readFile', path: '/test.js' },
      { type: 'writeFile', path: '/test.js', content: 'test' }
    ]
  };
  var taskType = separator.analyzeTaskType(task);
  assert.strictEqual(taskType, 'read_then_write');
});

test('ReadWriteSeparator - 统计信息', function() {
  var stats = separator.getStats();
  assert.strictEqual(typeof stats.totalTasks, 'number');
});

// ===== 实际性能测试 =====
console.log('\n--- 实际性能测试 ---\n');

// 测试缓存性能
var perfCache = new CacheLayer({
  maxSize: 1000,
  defaultTTL: 5 * 60 * 1000,
  verbose: false
});

var startTime = Date.now();
for (var i = 0; i < 1000; i++) {
  perfCache.set('key' + i, 'value' + i);
}
var setDuration = Date.now() - startTime;

startTime = Date.now();
for (var i = 0; i < 1000; i++) {
  perfCache.get('key' + i);
}
var getDuration = Date.now() - startTime;

var stats = perfCache.getStats();

console.log('缓存性能实测:');
console.log('  写入 1000 条耗时:', setDuration, 'ms');
console.log('  读取 1000 条耗时:', getDuration, 'ms');
console.log('  命中率:', stats.hitRate);
console.log('  缓存大小:', stats.size);

// ===== 测试总结 =====
console.log('\n=== 测试总结 ===\n');
console.log('通过:', passed);
console.log('失败:', failed);
console.log('总计:', passed + failed);

if (failed > 0) {
  console.log('\n❌ 有测试失败');
  process.exit(1);
} else {
  console.log('\n✅ 所有测试通过');
  process.exit(0);
}
