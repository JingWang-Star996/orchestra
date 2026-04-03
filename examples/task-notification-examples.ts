/**
 * TaskNotification 使用示例
 * 
 * 展示任务通知系统的各种使用场景
 */

import {
  TaskNotificationClass,
  NotificationEmitter,
  NotificationListener,
  TaskNotificationManager
} from './task-notification';

// ============================================================================
// 示例 1: 基础使用 - 创建和发送通知
// ============================================================================

async function example1BasicUsage() {
  console.log('=== 示例 1: 基础使用 ===\n');
  
  // 创建任务通知
  const notification = TaskNotificationClass.create({
    taskId: 'agent-x7q',
    status: 'completed',
    summary: '研究完成，发现 3 个关键文件',
    result: '找到 auth.js, user.js, session.js',
    usage: {
      totalTokens: 1234,
      toolUses: 5,
      durationMs: 5000
    }
  });
  
  console.log('创建的通知:', JSON.stringify(notification, null, 2));
  
  // 转换为 XML（兼容 Claude Code）
  const xml = TaskNotificationClass.toXML(notification);
  console.log('\nXML 格式:');
  console.log(xml);
  
  // 从 XML 解析
  const parsed = TaskNotificationClass.fromXML(xml);
  console.log('\n解析结果:', JSON.stringify(parsed, null, 2));
}

// ============================================================================
// 示例 2: 监听器模式 - 订阅特定状态的通知
// ============================================================================

async function example2ListenerPattern() {
  console.log('\n=== 示例 2: 监听器模式 ===\n');
  
  const listener = new NotificationListener({ verbose: true });
  
  // 订阅完成通知
  listener.on('completed', (notification) => {
    console.log(`✅ 任务完成：${notification.taskId}`);
    console.log(`   摘要：${notification.summary}`);
    console.log(`   Token: ${notification.usage.totalTokens}`);
  });
  
  // 订阅失败通知
  listener.on('failed', (notification) => {
    console.log(`❌ 任务失败：${notification.taskId}`);
    console.log(`   原因：${notification.result}`);
  });
  
  // 订阅所有通知
  listener.on('all', (notification) => {
    console.log(`📢 收到通知：${notification.taskId} (${notification.status})`);
  });
  
  // 模拟接收通知
  listener.receive(TaskNotificationClass.create({
    taskId: 'task-1',
    status: 'completed',
    summary: '数据分析完成'
  }));
  
  listener.receive(TaskNotificationClass.create({
    taskId: 'task-2',
    status: 'failed',
    summary: '文件处理失败',
    result: '文件不存在'
  }));
  
  listener.receive(TaskNotificationClass.create({
    taskId: 'task-3',
    status: 'completed',
    summary: '报告生成成功'
  }));
}

// ============================================================================
// 示例 3: 发送器模式 - 发送通知到 OpenClaw
// ============================================================================

async function example3EmitterPattern() {
  console.log('\n=== 示例 3: 发送器模式 ===\n');
  
  const emitter = new NotificationEmitter({ verbose: true });
  
  // 发送通知
  await emitter.send(TaskNotificationClass.create({
    taskId: 'worker-123',
    status: 'completed',
    summary: 'Worker 完成任务',
    usage: {
      totalTokens: 2000,
      toolUses: 10,
      durationMs: 15000
    }
  }));
  
  await emitter.send(TaskNotificationClass.create({
    taskId: 'worker-456',
    status: 'failed',
    summary: 'Worker 执行失败',
    result: '超时错误'
  }));
  
  // 查看发送历史
  const history = emitter.getHistory();
  console.log(`\n发送历史：${history.length} 条`);
  
  // 导出为 JSON
  console.log('\n导出 JSON:');
  console.log(emitter.exportJSON());
  
  // 导出为 XML
  console.log('\n导出 XML:');
  console.log(emitter.exportXML());
}

// ============================================================================
// 示例 4: 完整管理器 - 整合发送和监听
// ============================================================================

async function example4ManagerPattern() {
  console.log('\n=== 示例 4: 完整管理器 ===\n');
  
  const manager = new TaskNotificationManager({ verbose: true });
  
  // 注册监听器
  manager.on('completed', (notification) => {
    console.log(`🎉 完成：${notification.taskId}`);
  });
  
  manager.on('failed', (notification) => {
    console.log(`⚠️  失败：${notification.taskId}`);
  });
  
  manager.on('running', (notification) => {
    console.log(`⏳ 运行中：${notification.taskId}`);
  });
  
  // 发送各种状态的通知
  await manager.send(TaskNotificationClass.create({
    taskId: 'job-1',
    status: 'running',
    summary: '开始处理'
  }));
  
  await manager.send(TaskNotificationClass.create({
    taskId: 'job-2',
    status: 'completed',
    summary: '处理成功',
    usage: {
      totalTokens: 1500,
      toolUses: 8,
      durationMs: 12000
    }
  }));
  
  await manager.send(TaskNotificationClass.create({
    taskId: 'job-3',
    status: 'failed',
    summary: '处理失败',
    result: '网络错误'
  }));
  
  // 查看统计
  const stats = manager.getStats();
  console.log('\n统计信息:', JSON.stringify(stats, null, 2));
}

// ============================================================================
// 示例 5: Worker 管理集成 - 与 Orchestra Worker Manager 配合
// ============================================================================

async function example5WorkerIntegration() {
  console.log('\n=== 示例 5: Worker 管理集成 ===\n');
  
  const manager = new TaskNotificationManager({ verbose: true });
  
  // 模拟 Worker 生命周期通知
  const workerId = 'worker_abc123';
  
  // Worker 创建
  console.log(`\n1. 创建 Worker: ${workerId}`);
  await manager.send(TaskNotificationClass.create({
    taskId: workerId,
    status: 'pending',
    summary: 'Worker 创建中'
  }));
  
  // Worker 开始运行
  console.log(`2. Worker 开始运行`);
  await manager.send(TaskNotificationClass.create({
    taskId: workerId,
    status: 'running',
    summary: 'Worker 正在执行任务'
  }));
  
  // Worker 完成任务
  console.log(`3. Worker 完成任务`);
  await manager.send(TaskNotificationClass.create({
    taskId: workerId,
    status: 'completed',
    summary: 'Worker 完成任务',
    result: '生成 3 个文件，处理 15 条数据',
    usage: {
      totalTokens: 5000,
      toolUses: 20,
      durationMs: 30000
    },
    metadata: {
      filesGenerated: 3,
      dataProcessed: 15
    }
  }));
  
  // 查看 Worker 历史
  const history = manager.getHistory(workerId);
  console.log(`\nWorker 历史：${history.length} 条记录`);
  history.forEach((n, i) => {
    console.log(`  ${i + 1}. ${n.status} - ${n.summary}`);
  });
}

// ============================================================================
// 示例 6: 批量操作 - 批量发送和统计
// ============================================================================

async function example6BatchOperations() {
  console.log('\n=== 示例 6: 批量操作 ===\n');
  
  const emitter = new NotificationEmitter({ maxHistorySize: 50 });
  
  // 模拟批量任务
  const tasks = Array.from({ length: 10 }, (_, i) => ({
    taskId: `batch-task-${i + 1}`,
    status: i % 3 === 0 ? 'failed' : 'completed' as const,
    summary: `任务 ${i + 1} ${i % 3 === 0 ? '失败' : '完成'}`,
    usage: {
      totalTokens: Math.floor(Math.random() * 1000) + 500,
      toolUses: Math.floor(Math.random() * 10) + 1,
      durationMs: Math.floor(Math.random() * 5000) + 1000
    }
  }));
  
  console.log(`批量发送 ${tasks.length} 个通知...`);
  
  // 批量发送
  const results = await emitter.sendBatch(
    tasks.map(t => TaskNotificationClass.create(t))
  );
  
  const successCount = results.filter(r => r.success).length;
  console.log(`✅ 发送成功：${successCount}/${tasks.length}`);
  
  // 统计分析
  const history = emitter.getHistory();
  const completedCount = history.filter(n => n.status === 'completed').length;
  const failedCount = history.filter(n => n.status === 'failed').length;
  const totalTokens = history.reduce((sum, n) => sum + n.usage.totalTokens, 0);
  const totalDuration = history.reduce((sum, n) => sum + n.usage.durationMs, 0);
  
  console.log('\n批量统计:');
  console.log(`  - 完成：${completedCount}`);
  console.log(`  - 失败：${failedCount}`);
  console.log(`  - 总 Token: ${totalTokens}`);
  console.log(`  - 总耗时：${totalDuration}ms`);
}

// ============================================================================
// 示例 7: 错误处理 - 监听器异常不会影响其他监听器
// ============================================================================

async function example7ErrorHandling() {
  console.log('\n=== 示例 7: 错误处理 ===\n');
  
  const listener = new NotificationListener({ verbose: true });
  
  // 正常监听器
  listener.on('completed', (notification) => {
    console.log(`✅ 正常处理：${notification.taskId}`);
  });
  
  // 会抛出异常的监听器
  listener.on('completed', () => {
    throw new Error('模拟监听器错误');
  });
  
  // 另一个正常监听器
  listener.on('completed', (notification) => {
    console.log(`✅ 后续监听器仍然工作：${notification.taskId}`);
  });
  
  // 发送通知 - 即使中间监听器出错，其他监听器仍会执行
  listener.receive(TaskNotificationClass.create({
    taskId: 'error-test',
    status: 'completed',
    summary: '测试错误处理'
  }));
  
  console.log('\n✅ 错误隔离成功，所有正常监听器都执行了');
}

// ============================================================================
// 示例 8: 元数据使用 - 携带额外信息
// ============================================================================

async function example8MetadataUsage() {
  console.log('\n=== 示例 8: 元数据使用 ===\n');
  
  const notification = TaskNotificationClass.create({
    taskId: 'meta-task',
    status: 'completed',
    summary: '带元数据的通知',
    metadata: {
      workerType: 'specialist',
      priority: 'high',
      tags: ['urgent', 'important'],
      customData: {
        projectId: 'proj-123',
        userId: 'user-456'
      }
    }
  });
  
  console.log('创建的通知:', JSON.stringify(notification, null, 2));
  
  // 转换为 XML（包含元数据）
  const xml = TaskNotificationClass.toXML(notification);
  console.log('\nXML 格式（含元数据）:');
  console.log(xml);
}

// ============================================================================
// 运行所有示例
// ============================================================================

async function runAllExamples() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║     TaskNotification 使用示例                             ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  await example1BasicUsage();
  await example2ListenerPattern();
  await example3EmitterPattern();
  await example4ManagerPattern();
  await example5WorkerIntegration();
  await example6BatchOperations();
  await example7ErrorHandling();
  await example8MetadataUsage();
  
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║     所有示例运行完成 ✅                                   ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
}

// 执行示例
runAllExamples().catch(console.error);
