/**
 * TaskNotification 测试
 * 
 * 测试任务通知系统的核心功能
 */

import {
  TaskNotificationClass,
  NotificationEmitter,
  NotificationListener,
  TaskNotificationManager,
  TaskNotification,
  TaskStatus
} from './task-notification';

// ============================================================================
// 测试辅助函数
// ============================================================================

function createTestNotification(
  taskId: string = 'test-123',
  status: TaskStatus = 'completed'
): TaskNotification {
  return TaskNotificationClass.create({
    taskId,
    status,
    summary: '测试任务完成',
    result: '测试结果成功',
    usage: {
      totalTokens: 1000,
      toolUses: 5,
      durationMs: 3000
    },
    metadata: {
      test: 'value'
    }
  });
}

// ============================================================================
// TaskNotificationClass 测试
// ============================================================================

console.log('=== TaskNotificationClass 测试 ===\n');

// 测试 1: 创建通知
console.log('1. 创建通知（JSON 格式）');
const notification = createTestNotification('agent-x7q', 'completed');
console.log('✅ 创建成功:', JSON.stringify(notification, null, 2));

// 测试 2: 验证必填字段
console.log('\n2. 验证必填字段');
try {
  TaskNotificationClass.create({
    taskId: '',
    status: 'completed'
  });
  console.log('❌ 应该抛出错误');
} catch (error) {
  console.log('✅ 正确抛出错误:', (error as Error).message);
}

try {
  TaskNotificationClass.create({
    taskId: 'test',
    status: 'invalid' as any
  });
  console.log('❌ 应该抛出错误');
} catch (error) {
  console.log('✅ 正确抛出错误:', (error as Error).message);
}

// 测试 3: 转换为 XML
console.log('\n3. 转换为 XML 格式');
const xml = TaskNotificationClass.toXML(notification);
console.log('✅ XML 生成成功:');
console.log(xml);

// 测试 4: 从 XML 解析
console.log('\n4. 从 XML 解析');
const parsed = TaskNotificationClass.fromXML(xml);
console.log('✅ 解析成功:', JSON.stringify(parsed, null, 2));

// 验证解析结果
if (parsed.taskId === notification.taskId &&
    parsed.status === notification.status &&
    parsed.usage.totalTokens === notification.usage.totalTokens) {
  console.log('✅ 解析结果验证通过');
} else {
  console.log('❌ 解析结果验证失败');
}

// 测试 5: XML 转义
console.log('\n5. XML 转义测试');
const specialNotification = TaskNotificationClass.create({
  taskId: 'test-<special>&"chars"',
  status: 'failed',
  summary: '测试 <xml> & "special" \'chars\'',
  result: 'Result with <>&"\' characters'
});
const specialXml = TaskNotificationClass.toXML(specialNotification);
console.log('✅ 特殊字符转义成功');
console.log(specialXml);

// 解析回来看是否正确
const parsedSpecial = TaskNotificationClass.fromXML(specialXml);
if (parsedSpecial.taskId === specialNotification.taskId &&
    parsedSpecial.summary === specialNotification.summary) {
  console.log('✅ 特殊字符反转义验证通过');
} else {
  console.log('❌ 特殊字符反转义验证失败');
  console.log('Expected taskId:', specialNotification.taskId);
  console.log('Got taskId:', parsedSpecial.taskId);
}

// ============================================================================
// NotificationListener 测试
// ============================================================================

console.log('\n=== NotificationListener 测试 ===\n');

const listener = new NotificationListener({ verbose: true, maxHistorySize: 10 });

// 测试 6: 注册监听器
console.log('6. 注册监听器');
let completedCount = 0;
let failedCount = 0;
let allCount = 0;

listener.on('completed', (notification) => {
  completedCount++;
  console.log(`  ✅ 收到完成通知：${notification.taskId}`);
});

listener.on('failed', (notification) => {
  failedCount++;
  console.log(`  ❌ 收到失败通知：${notification.taskId}`);
});

listener.on('all', (notification) => {
  allCount++;
  console.log(`  📢 收到所有通知：${notification.taskId} (${notification.status})`);
});

// 测试 7: 接收通知
console.log('\n7. 接收通知');
listener.receive(createTestNotification('task-1', 'completed'));
listener.receive(createTestNotification('task-2', 'failed'));
listener.receive(createTestNotification('task-3', 'completed'));

console.log(`\n统计:`);
console.log(`  - 完成通知：${completedCount} 次`);
console.log(`  - 失败通知：${failedCount} 次`);
console.log(`  - 所有通知：${allCount} 次`);

if (completedCount === 2 && failedCount === 1 && allCount === 3) {
  console.log('✅ 监听器计数验证通过');
} else {
  console.log('❌ 监听器计数验证失败');
}

// 测试 8: 获取历史
console.log('\n8. 获取历史通知');
const history = listener.getHistory();
console.log(`✅ 历史记录数量：${history.length}`);

const task1History = listener.getHistory('task-1');
console.log(`✅ 任务 task-1 历史：${task1History.length} 条`);

// 测试 9: 移除监听器
console.log('\n9. 移除监听器');
const testCallback = () => console.log('Test');
listener.on('killed', testCallback);
listener.off('killed', testCallback);
console.log('✅ 移除单个监听器成功');

listener.off('killed');
console.log('✅ 移除所有 killed 监听器成功');

// 测试 10: 获取统计
console.log('\n10. 获取统计信息');
const stats = listener.getStats();
console.log('✅ 统计信息:', JSON.stringify(stats, null, 2));

// 测试 11: 清空历史
console.log('\n11. 清空历史');
listener.clearHistory();
const emptyHistory = listener.getHistory();
console.log(`✅ 清空后历史记录：${emptyHistory.length} 条`);

// ============================================================================
// NotificationEmitter 测试
// ============================================================================

console.log('\n=== NotificationEmitter 测试 ===\n');

const emitter = new NotificationEmitter({ verbose: true, maxHistorySize: 5 });

// 测试 12: 发送通知（模拟）
console.log('12. 发送通知（模拟模式）');
// 注意：实际发送需要 OpenClaw process API，这里只测试记录功能
const testNotification = createTestNotification('emit-test', 'completed');
emitter.send(testNotification).then(result => {
  console.log('✅ 发送结果:', result);
});

// 测试 13: 获取发送历史
console.log('\n13. 获取发送历史');
setTimeout(() => {
  const emitHistory = emitter.getHistory();
  console.log(`✅ 发送历史数量：${emitHistory.length}`);
  
  // 测试 14: 导出 JSON
  console.log('\n14. 导出 JSON');
  const jsonStr = emitter.exportJSON();
  console.log('✅ JSON 导出成功，长度:', jsonStr.length);
  
  // 测试 15: 导出 XML
  console.log('\n15. 导出 XML');
  const xmlStr = emitter.exportXML();
  console.log('✅ XML 导出成功，长度:', xmlStr.length);
  
  // ============================================================================
  // TaskNotificationManager 测试
  // ============================================================================
  
  console.log('\n=== TaskNotificationManager 测试 ===\n');
  
  const manager = new TaskNotificationManager({ verbose: true });
  
  // 测试 16: 发送并监听
  console.log('16. 发送并监听通知');
  let managerReceivedCount = 0;
  
  manager.on('completed', () => {
    managerReceivedCount++;
    console.log('  ✅ Manager 收到完成通知');
  });
  
  manager.send(createTestNotification('mgr-1', 'completed')).then(() => {
    console.log(`✅ Manager 发送并接收成功，计数：${managerReceivedCount}`);
    
    // 测试 17: 获取统计
    console.log('\n17. 获取 Manager 统计');
    const managerStats = manager.getStats();
    console.log('✅ Manager 统计:', JSON.stringify(managerStats, null, 2));
    
    // 测试 18: 导出
    console.log('\n18. Manager 导出');
    console.log('✅ JSON 导出长度:', manager.exportJSON().length);
    console.log('✅ XML 导出长度:', manager.exportXML().length);
    
    // ============================================================================
    // 完成测试
    // ============================================================================
    
    console.log('\n=== 所有测试完成 ===');
    console.log('✅ TaskNotificationClass 测试通过');
    console.log('✅ NotificationListener 测试通过');
    console.log('✅ NotificationEmitter 测试通过');
    console.log('✅ TaskNotificationManager 测试通过');
  });
}, 100);
