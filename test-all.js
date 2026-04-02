#!/usr/bin/env node

/**
 * Orchestra 全模块测试脚本
 * 一次性测试所有核心模块
 */

console.log('=== Orchestra 全模块测试 ===\n');

const results = {
  passed: [],
  failed: []
};

// 测试 1: parallelExecutor
console.log('1. 测试 parallelExecutor...');
try {
  const pe = require('./parallelExecutor');
  console.log('   ✅ parallelExecutor OK');
  results.passed.push('parallelExecutor');
} catch (e) {
  console.log(`   ❌ parallelExecutor FAIL: ${e.message}`);
  results.failed.push('parallelExecutor');
}

// 测试 2: taskNotification
console.log('2. 测试 taskNotification...');
try {
  const tn = require('./taskNotification');
  if (!tn.createTaskNotification || !tn.TaskNotificationManager) {
    throw new Error('导出不完整');
  }
  console.log('   ✅ taskNotification OK');
  results.passed.push('taskNotification');
} catch (e) {
  console.log(`   ❌ taskNotification FAIL: ${e.message}`);
  results.failed.push('taskNotification');
}

// 测试 3: workerManager
console.log('3. 测试 workerManager...');
try {
  const wm = require('./workerManager');
  console.log('   ✅ workerManager OK');
  results.passed.push('workerManager');
} catch (e) {
  console.log(`   ❌ workerManager FAIL: ${e.message}`);
  results.failed.push('workerManager');
}

// 测试 4: decisionMatrix
console.log('4. 测试 decisionMatrix...');
try {
  const dm = require('./decisionMatrix');
  if (!dm.decideContinueOrSpawn || !dm.DecisionType) {
    throw new Error('导出不完整');
  }
  console.log('   ✅ decisionMatrix OK');
  results.passed.push('decisionMatrix');
} catch (e) {
  console.log(`   ❌ decisionMatrix FAIL: ${e.message}`);
  results.failed.push('decisionMatrix');
}

// 测试 5: scratchpad
console.log('5. 测试 scratchpad...');
try {
  const sp = require('./scratchpad');
  if (!sp.ScratchpadManager) {
    throw new Error('导出不完整');
  }
  console.log('   ✅ scratchpad OK');
  results.passed.push('scratchpad');
} catch (e) {
  console.log(`   ❌ scratchpad FAIL: ${e.message}`);
  results.failed.push('scratchpad');
}

// 测试 6: gameDesignWorkflow
console.log('6. 测试 gameDesignWorkflow...');
try {
  const gw = require('./gameDesignWorkflow');
  const workflow = new gw();
  if (!workflow.execute) {
    throw new Error('execute 方法不存在');
  }
  console.log('   ✅ gameDesignWorkflow OK');
  results.passed.push('gameDesignWorkflow');
} catch (e) {
  console.log(`   ❌ gameDesignWorkflow FAIL: ${e.message}`);
  results.failed.push('gameDesignWorkflow');
}

// 测试 7: gateway
console.log('7. 测试 gateway...');
try {
  const gw = require('./gateway');
  console.log('   ✅ gateway OK');
  results.passed.push('gateway');
} catch (e) {
  console.log(`   ❌ gateway FAIL: ${e.message}`);
  results.failed.push('gateway');
}

// 汇总结果
console.log('\n=== 测试结果汇总 ===');
console.log(`通过：${results.passed.length}个`);
console.log(`失败：${results.failed.length}个`);
console.log(`通过率：${(results.passed.length / (results.passed.length + results.failed.length) * 100).toFixed(0)}%`);

if (results.failed.length > 0) {
  console.log('\n失败模块:');
  results.failed.forEach(m => console.log(`  - ${m}`));
  process.exit(1);
} else {
  console.log('\n🎉 所有模块测试通过！');
  process.exit(0);
}
