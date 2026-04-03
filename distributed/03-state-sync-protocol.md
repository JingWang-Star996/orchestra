# Orchestra Worker 状态同步协议

## 1. 概述

### 1.1 设计目标

在分布式环境下，Orchestra 需要维护 Worker 状态的一致性，确保：
- **实时性**：状态变更在 1 秒内同步到所有实例
- **一致性**：所有实例看到的 Worker 状态一致
- **可靠性**：网络分区或实例故障不影响整体系统
- **可扩展**：支持 100+ Worker 并发运行

### 1.2 状态分类

```typescript
enum WorkerStatus {
  IDLE = 'idle',              // 空闲，可接受新任务
  BUSY = 'busy',              // 忙碌，正在执行任务
  OFFLINE = 'offline',        // 离线，无法通信
  DRAINING = 'draining',      // 排空中，完成当前任务后下线
  ERROR = 'error'             // 错误状态，需要人工介入
}

enum TaskStatus {
  PENDING = 'pending',        // 等待执行
  RUNNING = 'running',        // 正在执行
  COMPLETED = 'completed',    // 执行成功
  FAILED = 'failed',          // 执行失败
  CANCELLED = 'cancelled'     // 已取消
}
```

### 1.3 同步机制对比

| 机制 | 延迟 | 一致性 | 复杂度 | 适用场景 | 选择 |
|------|------|--------|--------|----------|------|
| 数据库轮询 | 高 (秒级) | 强 | 低 | 低频更新 | ❌ |
| Redis Pub/Sub | 低 (毫秒) | 最终 | 中 | 实时通知 | ✅ |
| Redis Streams | 低 (毫秒) | 最终 | 中 | 事件存储 | ✅ |
| WebSocket | 低 (毫秒) | 最终 | 高 | 长连接 | ❌ |
| gRPC Stream | 低 (毫秒) | 最终 | 高 | 双向通信 | ❌ |

**最终方案**：Redis Pub/Sub (实时通知) + Redis Hash (状态存储) + 数据库 (持久化)

## 2. 状态模型

### 2.1 Worker 状态结构

```typescript
interface WorkerState {
  // 基本信息
  workerId: string;            // Worker 唯一 ID
  workerType: string;          // Worker 类型
  instanceId: string;          // 所属实例 ID
  
  // 状态
  status: WorkerStatus;        // 当前状态
  lastHeartbeat: number;       // 最后心跳时间戳
  lastStatusChange: number;    // 最后状态变更时间
  
  // 任务信息
  currentTaskId?: string;      // 当前执行的任务 ID
  completedTasks: number;      // 已完成任务数
  failedTasks: number;         // 失败任务数
  
  // 资源使用
  resources: {
    cpu: number;               // CPU 使用率 (0-100)
    memory: number;            // 内存使用率 (0-100)
    disk: number;              // 磁盘使用率 (0-100)
  };
  
  // 元数据
  metadata: {
    version: string;           // Worker 版本
    tags: string[];            // 标签
    capabilities: string[];    // 能力列表
  };
  
  // 位置信息 (用于路由优化)
  location?: {
    region: string;
    zone: string;
    rack: string;
  };
}
```

### 2.2 任务状态结构

```typescript
interface TaskState {
  // 基本信息
  taskId: string;              // 任务唯一 ID
  taskType: string;            // 任务类型
  
  // 状态
  status: TaskStatus;          // 当前状态
  createdAt: number;           // 创建时间
  startedAt?: number;          // 开始时间
  completedAt?: number;        // 完成时间
  
  // 执行信息
  workerId?: string;           // 执行 Worker
  instanceId?: string;         // 执行实例
  retryCount: number;          // 重试次数
  
  // 结果
  result?: any;                // 执行结果
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
  
  // 进度 (用于长任务)
  progress?: {
    current: number;
    total: number;
    message: string;
  };
}
```

## 3. Redis 数据结构设计

### 3.1 Worker 状态存储

```typescript
// Worker 状态 Hash
// Key: orchestra:worker:{workerId}
// Field: 各个状态字段
// Value: JSON 字符串

interface WorkerStateHash {
  key: `orchestra:worker:${string}`;
  fields: {
    workerId: string;
    status: string;
    instanceId: string;
    currentTaskId: string;
    lastHeartbeat: string;     // 时间戳字符串
    completedTasks: string;    // 数字字符串
    failedTasks: string;
    resources: string;         // JSON 字符串
    metadata: string;          // JSON 字符串
  };
}

// Worker 索引集合
// Key: orchestra:workers:status:{status}
// Members: workerId 列表
const statusIndexes = {
  idle: 'orchestra:workers:status:idle',
  busy: 'orchestra:workers:status:busy',
  offline: 'orchestra:workers:status:offline',
  draining: 'orchestra:workers:status:draining',
  error: 'orchestra:workers:status:error'
};

// Worker 按实例分组
// Key: orchestra:workers:instance:{instanceId}
// Members: workerId 列表
```

### 3.2 任务状态存储

```typescript
// 任务状态 Hash
// Key: orchestra:task:{taskId}
interface TaskStateHash {
  key: `orchestra:task:${string}`;
  fields: {
    taskId: string;
    status: string;
    workerId: string;
    createdAt: string;
    startedAt: string;
    completedAt: string;
    result: string;            // JSON 字符串
    error: string;             // JSON 字符串
  };
}

// 任务按 Worker 分组
// Key: orchestra:worker:{workerId}:tasks
// Members: taskId 列表

// 任务按状态分组 (Sorted Set, score=更新时间)
// Key: orchestra:tasks:status:{status}
// Member: taskId
// Score: lastModified timestamp
```

### 3.3 心跳存储

```typescript
// Worker 心跳 Sorted Set
// Key: orchestra:heartbeats
// Member: workerId
// Score: lastHeartbeat timestamp
// 用于快速检测离线 Worker

// 检测逻辑：
// 当前时间 - score > 30 秒 => 标记为 offline
```

## 4. 状态同步协议

### 4.1 状态变更流程

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Worker    │     │   Instance  │     │    Redis    │
│             │     │             │     │             │
│ 1.状态变更   │     │             │     │             │
│────────────>│     │             │     │             │
│             │     │             │     │             │
│             │ 2.更新本地状态     │     │             │
│             │────────────>│     │             │
│             │     │             │     │             │
│             │     │ 3.写入 Redis Hash│     │             │
│             │     │────────────────────>│             │
│             │     │             │     │             │
│             │     │ 4.更新索引集合     │     │             │
│             │     │────────────────────>│             │
│             │     │             │     │             │
│             │     │ 5.发布状态变更事件  │     │             │
│             │     │────────────────────>│             │
│             │     │             │     │             │
│             │     │             │     │ 6.Pub/Sub 广播  │
│             │     │<────────────────────│             │
│             │     │             │     │             │
│ 7.接收事件   │<────────────────────────────────────│             │
│             │     │             │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
```

### 4.2 状态变更事件

```typescript
interface WorkerStatusChangeEvent {
  // 事件元数据
  eventId: string;             // 事件唯一 ID
  eventType: 'WORKER_STATUS_CHANGED';
  timestamp: number;           // 事件时间戳
  version: '1.0';              // 事件版本
  
  // 变更内容
  workerId: string;            // Worker ID
  instanceId: string;          // 发起实例 ID
  
  // 状态变更
  previousStatus: WorkerStatus; // 变更前状态
  newStatus: WorkerStatus;     // 变更后状态
  
  // 变更原因
  reason: {
    type: 'task_assigned' |    // 分配任务
          'task_completed' |   // 完成任务
          'task_failed' |      // 任务失败
          'heartbeat_timeout' | // 心跳超时
          'manual' |           // 手动操作
          'system';            // 系统操作
    details?: string;          // 详细信息
  };
  
  // 上下文
  context: {
    taskId?: string;           // 相关任务 ID
    errorMessage?: string;     // 错误信息
    metadata?: Record<string, any>;
  };
}
```

### 4.3 Redis Pub/Sub 频道

```typescript
const pubsubChannels = {
  // 全局状态变更频道
  WORKER_STATUS: 'orchestra:pubsub:worker:status',
  
  // 按实例分组的频道 (减少不必要的事件)
  INSTANCE_STATUS: (instanceId: string) => 
    `orchestra:pubsub:instance:${instanceId}:status`,
  
  // 按 Worker 类型分组的频道
  WORKER_TYPE_STATUS: (workerType: string) => 
    `orchestra:pubsub:worker-type:${workerType}:status`,
  
  // 任务状态频道
  TASK_STATUS: 'orchestra:pubsub:task:status',
  
  // 系统事件频道
  SYSTEM_EVENTS: 'orchestra:pubsub:system'
};
```

### 4.4 状态同步实现

```typescript
class WorkerStateSync {
  private redis: Redis;
  private subscriber: Redis;
  
  constructor(redis: Redis) {
    this.redis = redis;
    this.subscriber = redis.duplicate();
  }
  
  /**
   * 更新 Worker 状态
   */
  async updateWorkerStatus(
    workerId: string,
    newStatus: WorkerStatus,
    context: StatusChangeContext
  ): Promise<void> {
    const multi = this.redis.multi();
    
    // 1. 获取旧状态
    const oldState = await this.getWorkerState(workerId);
    const oldStatus = oldState?.status || WorkerStatus.OFFLINE;
    
    // 2. 更新 Worker Hash
    const state: Partial<WorkerState> = {
      status: newStatus,
      lastStatusChange: Date.now(),
      ...context.updates
    };
    
    multi.hset(
      `orchestra:worker:${workerId}`,
      this.serializeState(state)
    );
    
    // 3. 更新状态索引 (从旧状态集合移除，添加到新状态集合)
    if (oldStatus !== newStatus) {
      multi.srem(`orchestra:workers:status:${oldStatus}`, workerId);
      multi.sadd(`orchestra:workers:status:${newStatus}`, workerId);
    }
    
    // 4. 更新心跳
    multi.zadd('orchestra:heartbeats', Date.now(), workerId);
    
    // 5. 发布状态变更事件
    const event: WorkerStatusChangeEvent = {
      eventId: generateId(),
      eventType: 'WORKER_STATUS_CHANGED',
      timestamp: Date.now(),
      version: '1.0',
      workerId,
      instanceId: context.instanceId,
      previousStatus: oldStatus,
      newStatus,
      reason: context.reason,
      context: context.metadata
    };
    
    multi.publish(
      pubsubChannels.WORKER_STATUS,
      JSON.stringify(event)
    );
    
    await multi.exec();
  }
  
  /**
   * 订阅状态变更事件
   */
  async subscribe(
    handler: (event: WorkerStatusChangeEvent) => void
  ): Promise<void> {
    await this.subscriber.subscribe(
      pubsubChannels.WORKER_STATUS,
      (message) => {
        const event = JSON.parse(message) as WorkerStatusChangeEvent;
        handler(event);
      }
    );
  }
  
  /**
   * 获取 Worker 状态
   */
  async getWorkerState(workerId: string): Promise<WorkerState | null> {
    const data = await this.redis.hgetall(`orchestra:worker:${workerId}`);
    
    if (!data || Object.keys(data).length === 0) {
      return null;
    }
    
    return this.deserializeState(data);
  }
  
  /**
   * 获取所有在线 Worker
   */
  async getOnlineWorkers(): Promise<WorkerState[]> {
    const workerIds = await this.redis.smembers(
      'orchestra:workers:status:idle'
    );
    workerIds.push(
      ...(await this.redis.smembers('orchestra:workers:status:busy'))
    );
    
    const workers = await Promise.all(
      workerIds.map(id => this.getWorkerState(id))
    );
    
    return workers.filter((w): w is WorkerState => w !== null);
  }
  
  /**
   * 检测离线 Worker
   */
  async detectOfflineWorkers(thresholdMs: number = 30000): Promise<string[]> {
    const now = Date.now();
    const offlineThreshold = now - thresholdMs;
    
    // 获取心跳超时的 Worker
    const staleWorkers = await this.redis.zrangebyscore(
      'orchestra:heartbeats',
      0,
      offlineThreshold
    );
    
    // 批量更新状态
    if (staleWorkers.length > 0) {
      const multi = this.redis.multi();
      
      for (const workerId of staleWorkers) {
        // 从在线集合移除
        multi.srem('orchestra:workers:status:idle', workerId);
        multi.srem('orchestra:workers:status:busy', workerId);
        
        // 添加到离线集合
        multi.sadd('orchestra:workers:status:offline', workerId);
        
        // 发布事件
        const event: WorkerStatusChangeEvent = {
          eventId: generateId(),
          eventType: 'WORKER_STATUS_CHANGED',
          timestamp: now,
          version: '1.0',
          workerId,
          instanceId: 'system',
          previousStatus: WorkerStatus.BUSY,
          newStatus: WorkerStatus.OFFLINE,
          reason: {
            type: 'heartbeat_timeout',
            details: `No heartbeat for ${thresholdMs / 1000}s`
          },
          context: {}
        };
        
        multi.publish(
          pubsubChannels.WORKER_STATUS,
          JSON.stringify(event)
        );
      }
      
      await multi.exec();
    }
    
    return staleWorkers;
  }
  
  private serializeState(state: Partial<WorkerState>): Record<string, string> {
    const result: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(state)) {
      if (typeof value === 'object' && value !== null) {
        result[key] = JSON.stringify(value);
      } else {
        result[key] = String(value);
      }
    }
    
    return result;
  }
  
  private deserializeState(data: Record<string, string>): WorkerState {
    const state: any = { ...data };
    
    // 解析 JSON 字段
    const jsonFields = ['resources', 'metadata', 'location', 'error'];
    for (const field of jsonFields) {
      if (state[field]) {
        try {
          state[field] = JSON.parse(state[field]);
        } catch {
          // 保持原值
        }
      }
    }
    
    // 转换数字字段
    const numberFields = ['lastHeartbeat', 'lastStatusChange', 'completedTasks', 'failedTasks'];
    for (const field of numberFields) {
      if (state[field]) {
        state[field] = Number(state[field]);
      }
    }
    
    return state as WorkerState;
  }
}
```

## 5. 心跳协议

### 5.1 心跳消息格式

```typescript
interface HeartbeatMessage {
  workerId: string;            // Worker ID
  instanceId: string;          // 实例 ID
  timestamp: number;           // 心跳时间戳
  status: WorkerStatus;        // 当前状态
  currentTaskId?: string;      // 当前任务
  
  // 资源使用
  metrics: {
    cpu: number;
    memory: number;
    disk: number;
    networkIn: number;
    networkOut: number;
  };
  
  // 任务统计
  stats: {
    completedToday: number;
    failedToday: number;
    avgExecutionTime: number;
  };
}
```

### 5.2 心跳周期

```typescript
const heartbeatConfig = {
  // Worker 发送心跳间隔
  interval: 5000,              // 5 秒
  
  // 实例检测离线阈值
  offlineThreshold: 30000,     // 30 秒
  
  // 心跳超时告警
  alertThreshold: 60000,       // 60 秒
  
  // 自动恢复检测
  recoveryCheckInterval: 10000 // 10 秒
};
```

### 5.3 心跳实现

```typescript
class HeartbeatManager {
  private workerId: string;
  private instanceId: string;
  private intervalId?: NodeJS.Timeout;
  
  constructor(
    workerId: string,
    instanceId: string,
    private redis: Redis
  ) {
    this.workerId = workerId;
    this.instanceId = instanceId;
  }
  
  start(): void {
    this.intervalId = setInterval(
      () => this.sendHeartbeat(),
      heartbeatConfig.interval
    );
  }
  
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }
  
  private async sendHeartbeat(): Promise<void> {
    const message: HeartbeatMessage = {
      workerId: this.workerId,
      instanceId: this.instanceId,
      timestamp: Date.now(),
      status: await this.getCurrentStatus(),
      currentTaskId: await this.getCurrentTaskId(),
      metrics: await this.collectMetrics(),
      stats: await this.collectStats()
    };
    
    // 更新心跳 Sorted Set
    await this.redis.zadd(
      'orchestra:heartbeats',
      message.timestamp,
      this.workerId
    );
    
    // 更新 Worker 状态 Hash
    await this.redis.hset(`orchestra:worker:${this.workerId}`, {
      lastHeartbeat: String(message.timestamp),
      resources: JSON.stringify(message.metrics)
    });
    
    // 发布心跳事件 (可选，用于实时监控)
    await this.redis.publish(
      'orchestra:pubsub:heartbeat',
      JSON.stringify(message)
    );
  }
  
  private async getCurrentStatus(): Promise<WorkerStatus> {
    // 实现状态检测逻辑
    return WorkerStatus.IDLE;
  }
  
  private async collectMetrics(): Promise<HeartbeatMessage['metrics']> {
    // 收集系统指标
    return {
      cpu: await this.getCpuUsage(),
      memory: await this.getMemoryUsage(),
      disk: await this.getDiskUsage(),
      networkIn: await this.getNetworkIn(),
      networkOut: await this.getNetworkOut()
    };
  }
  
  private async collectStats(): Promise<HeartbeatMessage['stats']> {
    // 收集任务统计
    return {
      completedToday: 0,
      failedToday: 0,
      avgExecutionTime: 0
    };
  }
}
```

## 6. 分布式锁机制

### 6.1 锁的使用场景

1. **Worker 任务分配**：防止同一任务分配给多个 Worker
2. **状态更新**：防止并发写入导致状态不一致
3. **定时任务**：防止多实例重复执行
4. **资源访问**：防止并发访问共享资源

### 6.2 Redlock 算法实现

```typescript
import Redlock from 'redlock';

class DistributedLock {
  private redlock: Redlock;
  
  constructor(redisClients: Redis[]) {
    this.redlock = new Redlock(redisClients, {
      driftFactor: 0.01,       // 时钟漂移因子
      retryCount: 3,           // 重试次数
      retryDelay: 200,         // 重试延迟 (毫秒)
      retryJitter: 100,        // 随机抖动 (毫秒)
      automaticExtensionThreshold: 500 // 自动续期阈值
    });
  }
  
  /**
   * 获取锁
   */
  async acquire(
    resource: string,
    ttl: number,
    context?: {
      retryCount?: number;
      onRetry?: (attempt: number) => void;
    }
  ): Promise<Redlock.Lock | null> {
    try {
      const lock = await this.redlock.acquire(
        [`orchestra:lock:${resource}`],
        ttl
      );
      
      return lock;
    } catch (error) {
      console.warn(`获取锁失败: ${resource}`, error);
      return null;
    }
  }
  
  /**
   * 使用锁执行函数
   */
  async withLock<T>(
    resource: string,
    ttl: number,
    fn: () => Promise<T>
  ): Promise<T | null> {
    const lock = await this.acquire(resource, ttl);
    
    if (!lock) {
      return null;
    }
    
    try {
      return await fn();
    } finally {
      await lock.release();
    }
  }
  
  /**
   * 尝试获取锁 (不等待)
   */
  async tryAcquire(resource: string, ttl: number): Promise<boolean> {
    const lock = await this.acquire(resource, ttl);
    
    if (lock) {
      await lock.release();
      return true;
    }
    
    return false;
  }
  
  /**
   * 延长锁
   */
  async extend(
    lock: Redlock.Lock,
    additionalTtl: number
  ): Promise<Redlock.Lock> {
    return await lock.extend(additionalTtl);
  }
}
```

### 6.3 锁的使用示例

```typescript
// 示例 1: 任务分配锁
async function assignTaskToWorker(
  taskId: string,
  workerId: string
): Promise<boolean> {
  const lockManager = new DistributedLock(redisClients);
  
  const assigned = await lockManager.withLock(
    `task:${taskId}:assignment`,  // 锁资源
    5000,                          // 5 秒超时
    async () => {
      // 检查任务是否已被分配
      const existingAssignment = await redis.get(
        `orchestra:task:${taskId}:worker`
      );
      
      if (existingAssignment) {
        return false;  // 已被分配
      }
      
      // 分配任务
      await redis.set(
        `orchestra:task:${taskId}:worker`,
        workerId,
        'EX', 3600  // 1 小时过期
      );
      
      return true;
    }
  );
  
  return assigned || false;
}

// 示例 2: 定时任务锁 (防止重复执行)
async function runScheduledTask(
  taskName: string,
  fn: () => Promise<void>
): Promise<void> {
  const lockManager = new DistributedLock(redisClients);
  
  const acquired = await lockManager.tryAcquire(
    `scheduled:${taskName}`,
    300000  // 5 分钟
  );
  
  if (!acquired) {
    console.log(`定时任务 ${taskName} 已在其他实例运行`);
    return;
  }
  
  try {
    await fn();
  } finally {
    // 手动释放锁
    await redis.del(`orchestra:lock:scheduled:${taskName}`);
  }
}

// 示例 3: Worker 状态更新锁
async function updateWorkerStatusWithLock(
  workerId: string,
  status: WorkerStatus
): Promise<void> {
  const lockManager = new DistributedLock(redisClients);
  
  await lockManager.withLock(
    `worker:${workerId}:status`,
    3000,  // 3 秒
    async () => {
      // 原子性更新状态
      await workerStateSync.updateWorkerStatus(workerId, status, {
        instanceId,
        reason: { type: 'manual' }
      });
    }
  );
}
```

### 6.4 锁的监控

```typescript
interface LockMetrics {
  resource: string;
  acquiredAt: number;
  releasedAt?: number;
  extendedCount: number;
  owner: string;           // 实例 ID
  
  // 统计
  acquisitionTime: number; // 获取耗时
  holdTime: number;        // 持有时间
  contentionCount: number; // 竞争次数
}

class LockMonitor {
  private metrics: Map<string, LockMetrics> = new Map();
  
  async recordAcquisition(
    resource: string,
    owner: string,
    acquisitionTime: number
  ): Promise<void> {
    this.metrics.set(resource, {
      resource,
      acquiredAt: Date.now(),
      extendedCount: 0,
      owner,
      acquisitionTime,
      holdTime: 0,
      contentionCount: 0
    });
    
    // 上报监控指标
    await this.reportMetrics('lock_acquisition', { resource, owner });
  }
  
  async recordRelease(resource: string): Promise<void> {
    const metric = this.metrics.get(resource);
    
    if (metric) {
      metric.releasedAt = Date.now();
      metric.holdTime = metric.releasedAt - metric.acquiredAt;
      
      await this.reportMetrics('lock_release', {
        resource,
        holdTime: metric.holdTime
      });
      
      this.metrics.delete(resource);
    }
  }
  
  // 检测长时间持有的锁
  async detectLongHeldLocks(thresholdMs: number = 60000): Promise<LockMetrics[]> {
    const now = Date.now();
    const longHeld: LockMetrics[] = [];
    
    for (const metric of this.metrics.values()) {
      const holdTime = now - metric.acquiredAt;
      
      if (holdTime > thresholdMs) {
        longHeld.push(metric);
      }
    }
    
    return longHeld;
  }
}
```

## 7. 容错与恢复

### 7.1 网络分区处理

```typescript
enum PartitionState {
  NORMAL = 'normal',           // 正常状态
  SUSPECTED = 'suspected',     // 疑似分区
  PARTITIONED = 'partitioned'  // 确认分区
}

class PartitionDetector {
  private state: PartitionState = PartitionState.NORMAL;
  private failureDetector: PhiAccrualDetector;
  
  async checkConnectivity(): Promise<void> {
    const healthy = await this.pingRedis();
    
    if (!healthy) {
      this.state = PartitionState.SUSPECTED;
      
      // 尝试备用连接
      const backupHealthy = await this.pingBackupRedis();
      
      if (!backupHealthy) {
        this.state = PartitionState.PARTITIONED;
        await this.handlePartition();
      }
    } else {
      this.state = PartitionState.NORMAL;
    }
  }
  
  private async handlePartition(): Promise<void> {
    // 分区时的降级策略
    console.warn('检测到网络分区，启用降级模式');
    
    // 1. 停止依赖 Redis 的操作
    // 2. 使用本地缓存
    // 3. 记录操作日志，等待恢复后同步
  }
}
```

### 7.2 状态恢复

```typescript
class StateRecovery {
  async recoverWorkerState(workerId: string): Promise<void> {
    // 1. 从数据库加载最新状态
    const dbState = await this.loadFromDatabase(workerId);
    
    // 2. 从 Redis 加载状态
    const redisState = await this.loadFromRedis(workerId);
    
    // 3. 比较并解决冲突
    if (dbState && redisState) {
      const resolved = this.resolveConflict(dbState, redisState);
      await this.syncState(workerId, resolved);
    } else if (dbState) {
      await this.syncState(workerId, dbState);
    } else if (redisState) {
      await this.persistToDatabase(workerId, redisState);
    }
  }
  
  private resolveConflict(
    dbState: WorkerState,
    redisState: WorkerState
  ): WorkerState {
    // 使用最新时间戳的状态
    if (dbState.lastStatusChange > redisState.lastStatusChange) {
      return dbState;
    }
    return redisState;
  }
}
```

## 8. 性能优化

### 8.1 批量操作

```typescript
// 批量更新 Worker 状态
async function batchUpdateWorkerStates(
  updates: Array<{ workerId: string; status: WorkerStatus }>
): Promise<void> {
  const multi = redis.multi();
  
  for (const update of updates) {
    multi.hset(
      `orchestra:worker:${update.workerId}`,
      'status',
      update.status
    );
  }
  
  await multi.exec();
}
```

### 8.2 管道优化

```typescript
// 使用 Pipeline 减少网络往返
async function getMultipleWorkerStates(
  workerIds: string[]
): Promise<WorkerState[]> {
  const pipeline = redis.pipeline();
  
  for (const workerId of workerIds) {
    pipeline.hgetall(`orchestra:worker:${workerId}`);
  }
  
  const results = await pipeline.exec();
  
  return results.map((result: any) => deserializeState(result));
}
```

### 8.3 本地缓存

```typescript
class WorkerStateCache {
  private cache: Map<string, CachedWorkerState> = new Map();
  private ttl: number = 5000;  // 5 秒本地缓存
  
  async getWorkerState(workerId: string): Promise<WorkerState | null> {
    // 先查本地缓存
    const cached = this.cache.get(workerId);
    
    if (cached && Date.now() - cached.cachedAt < this.ttl) {
      return cached.state;
    }
    
    // 缓存未命中，从 Redis 加载
    const state = await workerStateSync.getWorkerState(workerId);
    
    if (state) {
      this.cache.set(workerId, {
        state,
        cachedAt: Date.now()
      });
    }
    
    return state;
  }
}
```

---

**文档版本**: 1.0  
**创建日期**: 2026-04-03  
**作者**: AI 后端架构师  
**状态**: 设计稿
