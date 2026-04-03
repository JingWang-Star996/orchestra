/**
 * Orchestra Task Notification System - 使用示例
 * 
 * 本文件演示如何在实际项目中集成任务通知系统
 * 包括：Coordinator 订阅、Worker 通知发送、OpenClaw 集成
 */

import {
  TaskNotification,
  TaskNotificationManager,
  OpenClawNotificationAdapter,
  TaskStatus,
  TaskUsage
} from '../src/task-notification';

// ============================================================================
// 示例 1: 基础用法 - Coordinator 订阅与通知
// ============================================================================

/**
 * 场景：Coordinator 监听 Worker 任务完成事件
 */
export async function example1_basicUsage(): Promise<void> {
  console.log('=== 示例 1: 基础用法 ===\n');

  // 创建通知管理器
  const manager = new TaskNotificationManager();

  // Coordinator 订阅通知
  const coordinatorId = 'coordinator_main';
  manager.subscribe(coordinatorId, (notification) => {
    console.log(`\n📬 Coordinator 收到通知:`);
    console.log(`   任务：${notification.taskId}`);
    console.log(`   状态：${notification.status}`);
    console.log(`   摘要：${notification.summary}`);
    
    // 根据状态处理不同逻辑
    if (notification.status === TaskStatus.COMPLETED) {
      console.log(`   ✅ 任务成功，结果长度：${notification.result.length}`);
    } else if (notification.status === TaskStatus.FAILED) {
      console.log(`   ❌ 任务失败，错误：${notification.error}`);
    } else if (notification.status === TaskStatus.KILLED) {
      console.log(`   ⛔ 任务被终止`);
    }
  });

  console.log(`✓ Coordinator ${coordinatorId} 已订阅\n`);

  // 模拟 Worker 完成任务
  const workerTaskId = 'worker_analysis_001';
  const startTime = Date.now();
  
  // ... Worker 执行任务 ...
  await new Promise(resolve => setTimeout(resolve, 1000)); // 模拟执行
  
  const duration = Date.now() - startTime;
  const usage: TaskUsage = {
    totalTokens: 1500,
    toolUses: 5,
    durationMs: duration
  };

  // Worker 发送完成通知
  const notification = new TaskNotification(
    workerTaskId,
    TaskStatus.COMPLETED,
    '数据分析完成',
    '已处理 500 条记录，生成统计报告...',
    usage
  );

  await manager.send(notification);
  console.log('\n✓ 通知已发送\n');
}

// ============================================================================
// 示例 2: 多 Coordinator 监听
// ============================================================================

/**
 * 场景：多个 Coordinator 同时监听同一 Worker 任务
 * 适用于：日志记录、监控告警、数据同步等
 */
export async function example2_multipleCoordinators(): Promise<void> {
  console.log('=== 示例 2: 多 Coordinator 监听 ===\n');

  const manager = new TaskNotificationManager();

  // Coordinator 1: 主控制器
  manager.subscribe('coordinator_main', (notification) => {
    console.log(`[主控制器] 任务 ${notification.taskId} ${notification.status}`);
    // 处理业务逻辑
  });

  // Coordinator 2: 日志记录器
  manager.subscribe('coordinator_logger', (notification) => {
    console.log(`[日志记录] ${new Date().toISOString()} - ${notification.taskId}`);
    // 写入日志文件
  });

  // Coordinator 3: 监控告警
  manager.subscribe('coordinator_monitor', (notification) => {
    if (notification.status === TaskStatus.FAILED) {
      console.log(`[告警] ⚠️ 任务失败：${notification.error}`);
      // 发送告警通知
    }
    if (notification.usage.durationMs > 10000) {
      console.log(`[告警] ⚠️ 任务耗时过长：${notification.usage.durationMs}ms`);
    }
  });

  console.log(`✓ 已订阅 ${manager.subscriberCount} 个 Coordinator\n`);

  // 模拟任务完成
  await manager.sendQuick(
    'worker_multi_001',
    TaskStatus.COMPLETED,
    '多监听器测试',
    '测试完成',
    { totalTokens: 800, toolUses: 3, durationMs: 2500 }
  );

  // 模拟任务失败（触发告警）
  await manager.sendQuick(
    'worker_multi_002',
    TaskStatus.FAILED,
    'API 调用失败',
    '连接超时',
    { totalTokens: 200, toolUses: 1, durationMs: 30000 },
    'ConnectionTimeout: 30s exceeded'
  );

  console.log('\n');
}

// ============================================================================
// 示例 3: Worker 生命周期管理
// ============================================================================

/**
 * 场景：完整的 Worker 生命周期，包括任务执行、状态跟踪、通知发送
 */
class WorkerExecutor {
  private readonly manager: TaskNotificationManager;
  private readonly workerId: string;

  constructor(manager: TaskNotificationManager, workerId: string) {
    this.manager = manager;
    this.workerId = workerId;
  }

  /**
   * 执行任务并自动发送通知
   */
  async execute(task: string): Promise<{ success: boolean; result?: string }> {
    const taskId = `${this.workerId}_${Date.now()}`;
    const startTime = Date.now();
    
    let tokensUsed = 0;
    let toolCalls = 0;

    try {
      console.log(`[Worker ${taskId}] 开始执行：${task}`);

      // 模拟任务执行
      const result = await this.performTask(task, () => {
        tokensUsed += 100;
        toolCalls += 1;
      });

      const duration = Date.now() - startTime;
      
      // 发送成功通知
      await this.manager.sendQuick(
        taskId,
        TaskStatus.COMPLETED,
        `任务完成 (${duration}ms)`,
        result,
        {
          totalTokens: tokensUsed,
          toolUses: toolCalls,
          durationMs: duration
        }
      );

      return { success: true, result };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // 发送失败通知
      await this.manager.sendQuick(
        taskId,
        TaskStatus.FAILED,
        `任务失败：${errorMessage}`,
        errorMessage,
        {
          totalTokens: tokensUsed,
          toolUses: toolCalls,
          durationMs: duration
        },
        errorMessage
      );

      return { success: false };
    }
  }

  /**
   * 模拟任务执行
   */
  private async performTask(task: string, onToolUse: () => void): Promise<string> {
    // 模拟多次工具调用
    for (let i = 0; i < 5; i++) {
      await new Promise(resolve => setTimeout(resolve, 200));
      onToolUse();
    }

    return `任务 "${task}" 执行完成，处理了 5 个步骤`;
  }
}

export async function example3_workerLifecycle(): Promise<void> {
  console.log('=== 示例 3: Worker 生命周期管理 ===\n');

  const manager = new TaskNotificationManager();

  // 订阅通知
  manager.subscribe('coordinator_observer', (notification) => {
    const emoji = notification.status === TaskStatus.COMPLETED ? '✅' : '❌';
    console.log(`${emoji} [观察者] ${notification.taskId}: ${notification.summary}`);
  });

  // 创建 Worker 执行器
  const worker = new WorkerExecutor(manager, 'worker_exec');

  // 执行多个任务
  await worker.execute('数据分析');
  await worker.execute('报告生成');
  await worker.execute('图像识别');

  console.log('\n');
}

// ============================================================================
// 示例 4: OpenClaw Process API 集成
// ============================================================================

/**
 * 场景：在 OpenClaw 环境中，跨会话发送任务通知
 */
export async function example4_openclawIntegration(): Promise<void> {
  console.log('=== 示例 4: OpenClaw 集成 ===\n');

  const manager = new TaskNotificationManager();
  const adapter = new OpenClawNotificationAdapter(manager, 'session_worker_001');

  // Coordinator 注册（监听特定会话）
  await adapter.registerCoordinator('coordinator_main', 'session_coordinator');
  await adapter.registerCoordinator('coordinator_backup', undefined); // 监听所有会话

  console.log(`✓ 已注册 Coordinator，当前订阅数：${manager.subscriberCount}\n`);

  // Worker 完成任务，发送跨会话通知
  console.log('[Worker] 任务完成，发送通知...\n');
  
  await adapter.sendWorkerCompletion(
    'worker_opencalw_demo',
    TaskStatus.COMPLETED,
    '跨会话任务完成',
    {
      totalTokens: 3000,
      toolUses: 12,
      durationMs: 8500
    }
  );

  console.log('\n');
}

// ============================================================================
// 示例 5: 错误处理与重试
// ============================================================================

/**
 * 场景：处理通知发送失败，实现重试机制
 */
export async function example5_errorHandling(): Promise<void> {
  console.log('=== 示例 5: 错误处理与重试 ===\n');

  const manager = new TaskNotificationManager();

  // 订阅者可能抛出错误
  manager.subscribe('flaky_coordinator', (notification) => {
    // 模拟随机失败
    if (Math.random() < 0.3) {
      throw new Error('临时错误');
    }
    console.log(`✓ 成功处理通知：${notification.taskId}`);
  });

  manager.subscribe('reliable_coordinator', (notification) => {
    console.log(`✓ 可靠处理：${notification.taskId}`);
  });

  // 发送通知（即使某个订阅者失败，其他订阅者仍会收到）
  await manager.sendQuick(
    'worker_error_test',
    TaskStatus.COMPLETED,
    '错误处理测试',
    '测试完成',
    { totalTokens: 500, toolUses: 2, durationMs: 1000 }
  );

  console.log('\n');
}

// ============================================================================
// 示例 6: 通知过滤与路由
// ============================================================================

/**
 * 场景：根据任务类型或状态路由到不同的 Coordinator
 */
export async function example6_routing(): Promise<void> {
  console.log('=== 示例 6: 通知路由 ===\n');

  const manager = new TaskNotificationManager();

  // 根据任务 ID 前缀路由
  const routeNotification = (notification: TaskNotificationData) => {
    const taskId = notification.taskId;
    
    if (taskId.startsWith('worker_analysis')) {
      console.log(`[分析组] 处理任务：${taskId}`);
    } else if (taskId.startsWith('worker_render')) {
      console.log(`[渲染组] 处理任务：${taskId}`);
    } else if (taskId.startsWith('worker_export')) {
      console.log(`[导出组] 处理任务：${taskId}`);
    }
  };

  manager.subscribe('router', routeNotification);

  // 发送不同类型的任务
  await manager.sendQuick(
    'worker_analysis_001',
    TaskStatus.COMPLETED,
    '数据分析',
    '完成',
    { totalTokens: 1000, toolUses: 4, durationMs: 2000 }
  );

  await manager.sendQuick(
    'worker_render_001',
    TaskStatus.COMPLETED,
    '3D 渲染',
    '完成',
    { totalTokens: 2000, toolUses: 8, durationMs: 5000 }
  );

  await manager.sendQuick(
    'worker_export_001',
    TaskStatus.COMPLETED,
    'PDF 导出',
    '完成',
    { totalTokens: 500, toolUses: 2, durationMs: 1000 }
  );

  console.log('\n');
}

// ============================================================================
// 运行所有示例
// ============================================================================

/**
 * 运行所有使用示例
 */
export async function runAllExamples(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  Orchestra Task Notification System - 使用示例合集    ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  await example1_basicUsage();
  await example2_multipleCoordinators();
  await example3_workerLifecycle();
  await example4_openclawIntegration();
  await example5_errorHandling();
  await example6_routing();

  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  所有示例运行完成                                      ║');
  console.log('╚════════════════════════════════════════════════════════╝');
}

// 如果直接运行此文件
if (require.main === module) {
  runAllExamples().catch(console.error);
}
