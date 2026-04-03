/**
 * Orchestra Task Notification System
 * 
 * 适配 OpenClaw 的任务通知系统，参考 Claude Coordinator 的 XML 任务通知格式
 * 
 * 核心功能：
 * 1. TaskNotification 类 - 对应 Claude 的 <task-notification> XML 格式
 * 2. 通知发送 - 适配 OpenClaw process API，支持异步通知
 * 3. 事件驱动 - Worker 完成时自动发送通知，支持多个 Coordinator 监听
 * 
 * @module orchestra/task-notification
 */

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 任务状态枚举
 * 
 * 对应 Claude Coordinator 的三种任务完成状态：
 * - completed: 任务成功完成
 * - failed: 任务执行失败（有错误信息）
 * - killed: 任务被强制终止（超时、用户取消等）
 */
export enum TaskStatus {
  COMPLETED = 'completed',
  FAILED = 'failed',
  KILLED = 'killed'
}

/**
 * 资源使用统计
 * 
 * 记录任务执行过程中的资源消耗，用于性能分析和成本计算
 */
export interface TaskUsage {
  /** 总 Token 消耗量 */
  totalTokens: number;
  /** 工具调用次数 */
  toolUses: number;
  /** 执行时长（毫秒） */
  durationMs: number;
}

/**
 * 任务通知数据结构
 * 
 * 对应 Claude 的 <task-notification> XML 格式，采用 JSON 表示
 * 
 * @example
 * ```json
 * {
 *   "taskId": "worker_abc123",
 *   "status": "completed",
 *   "summary": "任务已成功完成",
 *   "result": "Worker 的最终文本响应...",
 *   "usage": {
 *     "totalTokens": 1500,
 *     "toolUses": 5,
 *     "durationMs": 3200
 *   }
 * }
 * ```
 */
export interface TaskNotificationData {
  /** 任务唯一标识符 */
  taskId: string;
  /** 任务状态 */
  status: TaskStatus;
  /** 人类可读的状态摘要 */
  summary: string;
  /** Worker 的最终文本响应 */
  result: string;
  /** 资源使用统计 */
  usage: TaskUsage;
  /** 可选：错误信息（当 status 为 failed 时） */
  error?: string;
  /** 可选：时间戳 */
  timestamp?: number;
}

/**
 * Coordinator 订阅配置
 */
export interface CoordinatorSubscription {
  /** Coordinator 唯一标识 */
  coordinatorId: string;
  /** 订阅的回调函数 */
  callback: (notification: TaskNotificationData) => void | Promise<void>;
  /** 是否活跃 */
  active: boolean;
  /** 订阅创建时间 */
  createdAt: number;
}

/**
 * 通知发送选项
 */
export interface NotificationOptions {
  /** 是否异步发送（默认 true） */
  async?: boolean;
  /** 超时时间（毫秒），仅同步模式有效 */
  timeoutMs?: number;
}

// ============================================================================
// TaskNotification 类实现
// ============================================================================

/**
 * TaskNotification 类
 * 
 * 封装任务通知的创建、序列化和发送逻辑
 * 对应 Claude Coordinator 的 <task-notification> XML 格式
 */
export class TaskNotification {
  private readonly _data: TaskNotificationData;

  /**
   * 创建任务通知实例
   * 
   * @param taskId - 任务唯一标识符
   * @param status - 任务状态
   * @param summary - 人类可读的状态摘要
   * @param result - Worker 的最终文本响应
   * @param usage - 资源使用统计
   * @param error - 可选的错误信息
   */
  constructor(
    taskId: string,
    status: TaskStatus,
    summary: string,
    result: string,
    usage: TaskUsage,
    error?: string
  ) {
    this._data = {
      taskId,
      status,
      summary,
      result,
      usage,
      error,
      timestamp: Date.now()
    };
  }

  /**
   * 获取任务 ID
   */
  get taskId(): string {
    return this._data.taskId;
  }

  /**
   * 获取任务状态
   */
  get status(): TaskStatus {
    return this._data.status;
  }

  /**
   * 获取状态摘要
   */
  get summary(): string {
    return this._data.summary;
  }

  /**
   * 获取任务结果
   */
  get result(): string {
    return this._data.result;
  }

  /**
   * 获取资源使用统计
   */
  get usage(): TaskUsage {
    return this._data.usage;
  }

  /**
   * 获取错误信息
   */
  get error(): string | undefined {
    return this._data.error;
  }

  /**
   * 获取时间戳
   */
  get timestamp(): number {
    return this._data.timestamp!;
  }

  /**
   * 序列化为 JSON 对象
   * 
   * @returns 可序列化的通知数据
   */
  toJSON(): TaskNotificationData {
    return { ...this._data };
  }

  /**
   * 序列化为 JSON 字符串
   * 
   * @param indent - 缩进空格数（默认 2）
   * @returns JSON 字符串
   */
  toString(indent: number = 2): string {
    return JSON.stringify(this._data, null, indent);
  }

  /**
   * 从 JSON 对象创建 TaskNotification 实例
   * 
   * @param data - 通知数据对象
   * @returns TaskNotification 实例
   */
  static fromJSON(data: TaskNotificationData): TaskNotification {
    return new TaskNotification(
      data.taskId,
      data.status,
      data.summary,
      data.result,
      data.usage,
      data.error
    );
  }

  /**
   * 从 JSON 字符串创建 TaskNotification 实例
   * 
   * @param jsonString - JSON 字符串
   * @returns TaskNotification 实例
   * @throws Error 当 JSON 解析失败时
   */
  static fromString(jsonString: string): TaskNotification {
    const data = JSON.parse(jsonString) as TaskNotificationData;
    return TaskNotification.fromJSON(data);
  }

  /**
   * 验证通知数据的完整性
   * 
   * @returns 验证结果
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this._data.taskId || this._data.taskId.trim() === '') {
      errors.push('taskId is required');
    }

    if (!Object.values(TaskStatus).includes(this._data.status)) {
      errors.push(`Invalid status: ${this._data.status}`);
    }

    if (!this._data.summary || this._data.summary.trim() === '') {
      errors.push('summary is required');
    }

    if (typeof this._data.usage.totalTokens !== 'number' || this._data.usage.totalTokens < 0) {
      errors.push('totalTokens must be a non-negative number');
    }

    if (typeof this._data.usage.toolUses !== 'number' || this._data.usage.toolUses < 0) {
      errors.push('toolUses must be a non-negative number');
    }

    if (typeof this._data.usage.durationMs !== 'number' || this._data.usage.durationMs < 0) {
      errors.push('durationMs must be a non-negative number');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// ============================================================================
// TaskNotificationManager 类实现
// ============================================================================

/**
 * 任务通知管理器
 * 
 * 负责：
 * 1. Coordinator 订阅管理（订阅/取消订阅）
 * 2. 通知发送（适配 OpenClaw process API）
 * 3. 事件驱动的通知分发
 */
export class TaskNotificationManager {
  /** 订阅映射表 */
  private subscriptions: Map<string, CoordinatorSubscription> = new Map();
  
  /** 通知历史记录（可选，用于调试和审计） */
  private notificationHistory: TaskNotificationData[] = [];
  
  /** 最大历史记录数量 */
  private readonly maxHistorySize: number = 100;

  /**
   * 创建通知管理器实例
   * 
   * @param maxHistorySize - 最大历史记录数量（默认 100）
   */
  constructor(maxHistorySize: number = 100) {
    this.maxHistorySize = maxHistorySize;
  }

  /**
   * 订阅任务通知
   * 
   * Coordinator 通过此方法注册监听器，接收 Worker 完成时的通知
   * 
   * @param coordinatorId - Coordinator 唯一标识
   * @param callback - 通知回调函数
   * @returns 是否订阅成功
   * 
   * @example
   * ```typescript
   * const manager = new TaskNotificationManager();
   * 
   * manager.subscribe('coordinator_001', (notification) => {
   *   console.log(`任务 ${notification.taskId} 状态：${notification.status}`);
   *   console.log(`摘要：${notification.summary}`);
   *   console.log(`资源消耗：${notification.usage.totalTokens} tokens`);
   * });
   * ```
   */
  subscribe(
    coordinatorId: string,
    callback: (notification: TaskNotificationData) => void | Promise<void>
  ): boolean {
    if (this.subscriptions.has(coordinatorId)) {
      // 已存在订阅，更新回调
      const existing = this.subscriptions.get(coordinatorId)!;
      existing.callback = callback;
      existing.active = true;
      return false; // 返回 false 表示是更新而非新订阅
    }

    this.subscriptions.set(coordinatorId, {
      coordinatorId,
      callback,
      active: true,
      createdAt: Date.now()
    });

    return true;
  }

  /**
   * 取消订阅
   * 
   * Coordinator 通过此方法移除监听器
   * 
   * @param coordinatorId - Coordinator 唯一标识
   * @returns 是否成功取消（false 表示该 Coordinator 未订阅）
   * 
   * @example
   * ```typescript
   * manager.unsubscribe('coordinator_001');
   * ```
   */
  unsubscribe(coordinatorId: string): boolean {
    if (!this.subscriptions.has(coordinatorId)) {
      return false;
    }

    const subscription = this.subscriptions.get(coordinatorId)!;
    subscription.active = false;
    this.subscriptions.delete(coordinatorId);
    
    return true;
  }

  /**
   * 获取所有活跃的订阅者数量
   */
  get subscriberCount(): number {
    let count = 0;
    this.subscriptions.forEach(sub => {
      if (sub.active) count++;
    });
    return count;
  }

  /**
   * 发送任务通知
   * 
   * 当 Worker 完成时调用此方法，自动通知所有订阅的 Coordinator
   * 
   * @param notification - 任务通知实例
   * @param options - 发送选项
   * @returns Promise，所有回调执行完成后 resolve
   * 
   * @example
   * ```typescript
   * const notification = new TaskNotification(
   *   'worker_abc123',
   *   TaskStatus.COMPLETED,
   *   '数据分析任务完成',
   *   '已处理 1000 条记录，生成 3 个图表...',
   *   { totalTokens: 1500, toolUses: 5, durationMs: 3200 }
   * );
   * 
   * await manager.send(notification);
   * ```
   */
  async send(
    notification: TaskNotification,
    options: NotificationOptions = {}
  ): Promise<void> {
    const { async = true } = options;
    
    // 验证通知数据
    const validation = notification.validate();
    if (!validation.valid) {
      throw new Error(`Invalid notification: ${validation.errors.join(', ')}`);
    }

    const data = notification.toJSON();
    
    // 记录到历史
    this.addToHistory(data);

    // 获取所有活跃的订阅者
    const activeSubscribers = Array.from(this.subscriptions.values())
      .filter(sub => sub.active);

    if (activeSubscribers.length === 0) {
      // 没有订阅者，静默返回
      return;
    }

    // 并行通知所有订阅者
    const promises = activeSubscribers.map(async (sub) => {
      try {
        await sub.callback(data);
      } catch (error) {
        // 单个订阅者失败不影响其他订阅者
        console.error(
          `[TaskNotification] Error notifying subscriber ${sub.coordinatorId}:`,
          error
        );
      }
    });

    if (async) {
      // 异步模式：不等待所有回调完成
      // 使用 Promise.allSettled 确保所有回调都执行，即使有错误
      Promise.allSettled(promises).catch(() => {
        // 忽略异步错误
      });
    } else {
      // 同步模式：等待所有回调完成
      await Promise.allSettled(promises);
    }
  }

  /**
   * 快速创建并发送通知（便捷方法）
   * 
   * @param taskId - 任务 ID
   * @param status - 任务状态
   * @param summary - 状态摘要
   * @param result - 任务结果
   * @param usage - 资源使用统计
   * @param error - 可选错误信息
   * @param options - 发送选项
   * 
   * @example
   * ```typescript
   * await manager.sendQuick(
   *   'worker_xyz',
   *   TaskStatus.FAILED,
   *   '任务执行失败',
   *   '',
   *   { totalTokens: 500, toolUses: 2, durationMs: 1000 },
   *   '超时错误：操作超过 30 秒'
   * );
   * ```
   */
  async sendQuick(
    taskId: string,
    status: TaskStatus,
    summary: string,
    result: string,
    usage: TaskUsage,
    error?: string,
    options?: NotificationOptions
  ): Promise<void> {
    const notification = new TaskNotification(taskId, status, summary, result, usage, error);
    await this.send(notification, options);
  }

  /**
   * 获取通知历史记录
   * 
   * @param limit - 返回数量限制（默认 50）
   * @returns 历史记录列表（按时间倒序）
   */
  getHistory(limit: number = 50): TaskNotificationData[] {
    return this.notificationHistory.slice(-limit).reverse();
  }

  /**
   * 清空通知历史记录
   */
  clearHistory(): void {
    this.notificationHistory = [];
  }

  /**
   * 获取所有订阅者信息（用于调试）
   */
  getSubscribers(): Array<{ coordinatorId: string; active: boolean; createdAt: number }> {
    return Array.from(this.subscriptions.values()).map(sub => ({
      coordinatorId: sub.coordinatorId,
      active: sub.active,
      createdAt: sub.createdAt
    }));
  }

  /**
   * 添加记录到历史
   */
  private addToHistory(data: TaskNotificationData): void {
    this.notificationHistory.push(data);
    
    // 保持历史记录大小在限制内
    if (this.notificationHistory.length > this.maxHistorySize) {
      this.notificationHistory = this.notificationHistory.slice(-this.maxHistorySize);
    }
  }
}

// ============================================================================
// OpenClaw Process API 适配器
// ============================================================================

/**
 * OpenClaw Process API 适配器
 * 
 * 提供与 OpenClaw sessions_spawn/process API 的集成
 * 实现跨进程/跨会话的任务通知
 */
export class OpenClawNotificationAdapter {
  private readonly manager: TaskNotificationManager;
  private readonly sessionId: string;

  /**
   * 创建适配器实例
   * 
   * @param manager - 通知管理器实例
   * @param sessionId - 当前会话 ID
   */
  constructor(manager: TaskNotificationManager, sessionId: string) {
    this.manager = manager;
    this.sessionId = sessionId;
  }

  /**
   * 注册 Coordinator 到 OpenClaw 进程系统
   * 
   * 使用 OpenClaw process API 实现跨会话通知
   * 
   * @param coordinatorId - Coordinator 标识
   * @param targetSessionId - 目标会话 ID（可选，默认广播到所有会话）
   * 
   * @example
   * ```typescript
   * const adapter = new OpenClawNotificationAdapter(manager, 'session_001');
   * 
   * // 注册 Coordinator，监听特定会话
   * await adapter.registerCoordinator('coordinator_001', 'session_002');
   * ```
   */
  async registerCoordinator(
    coordinatorId: string,
    targetSessionId?: string
  ): Promise<void> {
    // 在 OpenClaw 中，这将通过 process API 实现跨会话通信
    // 实际实现需要调用 sessions_spawn 创建监听进程
    
    console.log(
      `[OpenClawAdapter] Registering coordinator ${coordinatorId} ` +
      `(target: ${targetSessionId || 'all sessions'})`
    );

    // 订阅通知
    this.manager.subscribe(coordinatorId, async (notification) => {
      // 通过 OpenClaw process API 发送消息到目标会话
      await this.sendToSession(notification, targetSessionId);
    });
  }

  /**
   * 发送通知到指定会话
   * 
   * 使用 OpenClaw process API 实现跨会话消息传递
   * 
   * @param notification - 通知数据
   * @param targetSessionId - 目标会话 ID（可选）
   */
  private async sendToSession(
    notification: TaskNotificationData,
    targetSessionId?: string
  ): Promise<void> {
    // OpenClaw process API 示例（伪代码）：
    // 
    // await process({
    //   action: 'send',
    //   sessionId: targetSessionId || 'broadcast',
    //   messageType: 'task-notification',
    //   payload: notification
    // });

    console.log(
      `[OpenClawAdapter] Sending notification to ${targetSessionId || 'all sessions'}:`,
      notification.taskId,
      notification.status
    );
  }

  /**
   * 从 Worker 进程发送完成通知
   * 
   * 当 Worker 完成任务时调用此方法
   * 
   * @param taskId - 任务 ID
   * @param status - 任务状态
   * @param result - 任务结果
   * @param usage - 资源使用统计
   * 
   * @example
   * ```typescript
   * // Worker 完成时
   * await adapter.sendWorkerCompletion(
   *   'worker_abc',
   *   TaskStatus.COMPLETED,
   *   '处理完成',
   *   { totalTokens: 2000, toolUses: 8, durationMs: 5000 }
   * );
   * ```
   */
  async sendWorkerCompletion(
    taskId: string,
    status: TaskStatus,
    result: string,
    usage: TaskUsage
  ): Promise<void> {
    const summary = this.generateSummary(status, result);
    
    await this.manager.sendQuick(
      taskId,
      status,
      summary,
      result,
      usage
    );
  }

  /**
   * 生成人类可读的状态摘要
   */
  private generateSummary(status: TaskStatus, result: string): string {
    switch (status) {
      case TaskStatus.COMPLETED:
        return `任务成功完成 (${result.length} 字符)`;
      case TaskStatus.FAILED:
        return `任务执行失败：${result.substring(0, 100)}...`;
      case TaskStatus.KILLED:
        return `任务被终止：${result.substring(0, 100)}...`;
      default:
        return `任务状态：${status}`;
    }
  }
}

// ============================================================================
// 使用示例
// ============================================================================

/**
 * 完整使用示例
 * 
 * 演示如何：
 * 1. 创建通知管理器
 * 2. 订阅通知
 * 3. 发送通知
 * 4. 集成 OpenClaw Process API
 */
export async function demonstrateUsage(): Promise<void> {
  console.log('=== Orchestra Task Notification System Demo ===\n');

  // 1. 创建通知管理器
  const manager = new TaskNotificationManager(50);
  console.log('✓ 创建 TaskNotificationManager');

  // 2. Coordinator 订阅通知
  const coordinatorId = 'coordinator_001';
  manager.subscribe(coordinatorId, (notification) => {
    console.log(`\n[Coordinator ${coordinatorId}] 收到通知:`);
    console.log(`  任务 ID: ${notification.taskId}`);
    console.log(`  状态：${notification.status}`);
    console.log(`  摘要：${notification.summary}`);
    console.log(`  Token: ${notification.usage.totalTokens}`);
    console.log(`  工具调用：${notification.usage.toolUses}`);
    console.log(`  耗时：${notification.usage.durationMs}ms`);
  });
  console.log(`✓ Coordinator ${coordinatorId} 已订阅`);

  // 3. 模拟 Worker 完成任务并发送通知
  console.log('\n--- 模拟 Worker 完成任务 ---');
  
  const notification = new TaskNotification(
    'worker_demo_001',
    TaskStatus.COMPLETED,
    '数据分析任务完成',
    '已处理 1000 条记录，生成 3 个可视化图表，输出摘要报告...',
    {
      totalTokens: 2500,
      toolUses: 7,
      durationMs: 4200
    }
  );

  await manager.send(notification);
  console.log('✓ 通知已发送');

  // 4. 模拟失败任务
  console.log('\n--- 模拟任务失败 ---');
  
  await manager.sendQuick(
    'worker_demo_002',
    TaskStatus.FAILED,
    'API 调用超时',
    '调用外部 API 时超时：超过 30 秒无响应',
    {
      totalTokens: 500,
      toolUses: 2,
      durationMs: 30000
    },
    'TimeoutError: Request exceeded 30s'
  );

  // 5. 查看历史记录
  console.log('\n--- 通知历史记录 ---');
  const history = manager.getHistory(10);
  history.forEach((record, index) => {
    console.log(`${index + 1}. [${record.status}] ${record.taskId}: ${record.summary}`);
  });

  // 6. 集成 OpenClaw Process API
  console.log('\n--- OpenClaw 集成示例 ---');
  
  const adapter = new OpenClawNotificationAdapter(manager, 'session_demo');
  await adapter.registerCoordinator('coordinator_002', 'session_target');
  
  await adapter.sendWorkerCompletion(
    'worker_opencalw_001',
    TaskStatus.COMPLETED,
    'OpenClaw 任务完成',
    { totalTokens: 1800, toolUses: 5, durationMs: 3500 }
  );

  console.log('\n=== Demo 完成 ===');
}

// ============================================================================
// 导出
// ============================================================================

export default {
  TaskNotification,
  TaskNotificationManager,
  OpenClawNotificationAdapter,
  TaskStatus,
  demonstrateUsage
};
