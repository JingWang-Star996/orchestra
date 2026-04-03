#!/usr/bin/env node

/**
 * Scratchpad 系统完整测试示例
 * 演示所有核心功能
 */

const { Scratchpad, ScratchpadManager } = require('../scratchpad');

async function runTests() {
  console.log('=== Scratchpad v2.0 完整测试 ===\n');
  
  // 测试 1: 基本操作
  console.log('1️⃣  基本读写');
  const sp1 = new Scratchpad('test-1', { verbose: false });
  await sp1.write('status', 'active');
  await sp1.write('data', { count: 42, items: ['a', 'b', 'c'] });
  console.log('   读取 status:', await sp1.read('status'));
  console.log('   读取 data:', await sp1.read('data'));
  console.log('   所有键:', sp1.keys());
  
  // 测试 2: 批量操作
  console.log('\n2️⃣  批量读取');
  await sp1.write('key1', 'value1');
  await sp1.write('key2', 'value2');
  const batch = await sp1.readBatch(['status', 'key1', 'key2']);
  console.log('   批量结果:', batch);
  
  // 测试 3: 历史记录
  console.log('\n3️⃣  历史记录');
  const sp2 = new Scratchpad('test-2', { enableHistory: true });
  await sp2.write('counter', 1);
  await sp2.write('counter', 2);
  await sp2.write('counter', 3);
  const history = sp2.getHistory('counter');
  console.log('   历史条数:', history.length);
  console.log('   最新值:', history[history.length - 1].newValue);
  
  // 测试 4: 回滚
  console.log('\n4️⃣  回滚功能');
  await sp2.rollback('counter', 1);
  const rolledBack = await sp2.read('counter');
  console.log('   回滚后值:', rolledBack);
  
  // 测试 5: 锁机制
  console.log('\n5️⃣  锁机制');
  const locked = await sp1.acquireLock('test-lock');
  console.log('   获取锁:', locked);
  console.log('   锁状态:', Object.keys(sp1.getLockStatus()));
  await sp1.releaseLock('test-lock');
  console.log('   释放锁后状态:', Object.keys(sp1.getLockStatus()));
  
  // 测试 6: 跨 Worker 共享
  console.log('\n6️⃣  跨 Worker 共享');
  const sp3 = new Scratchpad('test-3');
  await sp3.write('shared-data', { from: 'test-1' });
  await sp1.shareWith('test-3');
  console.log('   共享完成');
  
  const sp4 = new Scratchpad('test-4');
  const imported = await sp4.importFrom('test-3');
  console.log('   导入键数:', imported);
  console.log('   导入后键:', sp4.keys());
  
  // 测试 7: 多 Worker 同步
  console.log('\n7️⃣  多 Worker 同步');
  await sp4.write('new-key', 'from test-4');
  const syncStats = await sp3.syncWith(['test-4'], { strategy: 'merge' });
  console.log('   同步键数:', syncStats.synced);
  console.log('   同步后键:', sp3.keys());
  
  // 测试 8: 元数据
  console.log('\n8️⃣  元数据');
  await sp1.write('config', { timeout: 5000 }, {
    metadata: { priority: 'high', category: 'settings' }
  });
  const withMeta = await sp1.read('config', { includeMetadata: true });
  console.log('   元数据:', withMeta.metadata);
  
  // 测试 9: 导出
  console.log('\n9️⃣  导出功能');
  const json = sp1.exportJSON();
  console.log('   JSON 长度:', json.length);
  const md = sp1.exportMarkdown();
  console.log('   Markdown 长度:', md.length);
  
  // 测试 10: 管理器
  console.log('\n🔟  管理器');
  const manager = new ScratchpadManager({ verbose: false });
  const w1 = manager.get('worker-1');
  const w2 = manager.get('worker-2');
  await w1.write('data', 'Worker 1');
  await w2.write('data', 'Worker 2');
  console.log('   Worker 列表:', manager.list());
  console.log('   统计:', manager.getAllStats().length, '个 Scratchpad');
  
  // 测试 11: 统计信息
  console.log('\n1️⃣1️⃣  统计信息');
  const stats = sp1.getStats();
  console.log('   键数量:', stats.keyCount);
  console.log('   文件大小:', stats.totalSize, 'bytes');
  console.log('   创建时间:', stats.createdAt);
  
  // 测试 12: 事件
  console.log('\n1️⃣2️⃣  事件监听');
  const sp5 = new Scratchpad('test-5');
  let writeEvents = 0;
  sp5.on('write', () => writeEvents++);
  await sp5.write('event-test', 'data');
  console.log('   触发写入事件:', writeEvents, '次');
  
  // 测试 13: 清理
  console.log('\n1️⃣3️⃣  清理过期锁');
  const cleaned = sp1.cleanupExpiredLocks();
  console.log('   清理锁数:', cleaned);
  
  // 测试 14: 删除
  console.log('\n1️⃣4️⃣  删除操作');
  await sp1.write('to-delete', 'temp');
  console.log('   删除前键数:', sp1.keys().length);
  await sp1.delete('to-delete');
  console.log('   删除后键数:', sp1.keys().length);
  
  // 测试 15: 清空
  console.log('\n1️⃣5️⃣  清空数据');
  await sp5.clear({ preserveHistory: true });
  console.log('   清空后键数:', sp5.keys().length);
  console.log('   历史保留:', sp5.getHistory().constructor.name);
  
  console.log('\n✅ 所有测试完成!\n');
  
  // 清理测试文件
  manager.stop();
}

// 运行测试
runTests().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
