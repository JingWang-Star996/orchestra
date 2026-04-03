# Orchestra 分布式架构设计文档

## 1. 架构概述

### 1.1 设计目标
- **高可用性**：支持多实例部署，单点故障不影响系统整体运行
- **水平扩展**：可通过增加实例数量提升系统处理能力
- **数据一致性**：保证分布式环境下的数据最终一致性
- **低延迟**：优化节点间通信，减少同步延迟

### 1.2 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        Load Balancer (Nginx)                     │
└────────────────────────┬────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  Orchestra      │ │  Orchestra      │ │  Orchestra      │
│  Instance #1    │ │  Instance #2    │ │  Instance #N    │
│  - API Server   │ │  - API Server   │ │  - API Server   │
│  - Worker Mgr   │ │  - Worker Mgr   │ │  - Worker Mgr   │
│  - Scheduler    │ │  - Scheduler    │ │  - Scheduler    │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         │                   │                   │
         └───────────────────┼───────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   RabbitMQ      │ │   Redis         │ │   PostgreSQL    │
│   (消息队列)     │ │   (缓存/锁)      │ │   (主数据库)     │
│   - Exchange    │ │   - Cluster     │ │   - Primary     │
│   - Queues      │ │   - Sentinel    │ │   - Replicas    │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

### 1.3 核心组件

| 组件 | 职责 | 技术选型 |
|------|------|----------|
| API Gateway | 请求路由、负载均衡 | Nginx |
| Application Server | 业务逻辑处理 | Node.js + TypeScript |
| Worker Manager | Worker 调度与管理 | 自研 |
| Message Queue | 异步通信、事件驱动 | RabbitMQ |
| Cache Layer | 缓存、分布式锁 | Redis Cluster |
| Database | 持久化存储 | PostgreSQL (主从) |

## 2. 多实例部署架构

### 2.1 无状态设计原则

**API Server 层**：
- 不保存本地会话状态
- 所有状态存储到 Redis
- JWT Token 无状态验证
- 请求可路由到任意实例

**Worker Manager 层**：
- Worker 状态集中存储
- 任务队列共享
- 支持 Worker 迁移

### 2.2 实例角色划分

```typescript
enum InstanceRole {
  PRIMARY = 'primary',      // 主实例（处理写操作）
  REPLICA = 'replica',      // 从实例（处理读操作）
  WORKER = 'worker',        // 纯 Worker 实例
  HYBRID = 'hybrid'         // 混合实例（API + Worker）
}
```

### 2.3 部署模式

#### 模式 A：小型部署（1-2 实例）
```
┌──────────────────────┐
│  Load Balancer       │
└──────────┬───────────┘
           │
    ┌──────┴──────┐
    │             │
    ▼             ▼
┌─────────┐  ┌─────────┐
│ Hybrid  │  │ Hybrid  │
│ Inst #1 │  │ Inst #2 │
└─────────┘  └─────────┘
```

#### 模式 B：中型部署（3-5 实例）
```
┌──────────────────────┐
│  Load Balancer       │
└──────────┬───────────┘
           │
    ┌──────┼──────┐
    │      │      │
    ▼      ▼      ▼
┌────────┐ ┌────────┐ ┌────────┐
│ API #1 │ │ API #2 │ │Worker  │
└────────┘ └────────┘ │ #1     │
                      └────────┘
```

#### 模式 C：大型部署（6+ 实例）
```
┌──────────────────────┐
│  Load Balancer       │
└──────────┬───────────┘
           │
    ┌──────┼──────┬────────┐
    │      │      │        │
    ▼      ▼      ▼        ▼
┌────────┐ ┌────────┐ ┌─────────┐ ┌─────────┐
│ API #1 │ │ API #2 │ │Worker #1│ │Worker #2│
└────────┘ └────────┘ └─────────┘ └─────────┘
     ...       ...       ...         ...
```

### 2.4 健康检查机制

```typescript
interface HealthCheck {
  endpoint: '/health';
  checks: {
    database: boolean;      // DB 连接
    redis: boolean;         // Redis 连接
    rabbitmq: boolean;      // MQ 连接
    memory: number;         // 内存使用率
    cpu: number;           // CPU 使用率
    uptime: number;        // 运行时间
  };
  status: 'healthy' | 'degraded' | 'unhealthy';
}

// 健康检查间隔：10 秒
// 不健康阈值：连续 3 次失败
// 恢复阈值：连续 2 次成功
```

## 3. 数据分区策略

### 3.1 水平分片

```typescript
// 基于 User ID 分片
function getShardId(userId: string): number {
  const hash = murmur3(userId);
  return Math.abs(hash) % SHARD_COUNT;
}

// 分片路由表存储在 Redis
// Key: orchestra:shards:{userId}
// Value: { shardId, instanceId, primary }
```

### 3.2 数据本地性优化

- 用户会话固定到特定实例（减少跨实例通信）
- 相关数据存储在同一个分片
- 热点数据自动迁移

## 4. 容灾与恢复

### 4.1 故障检测

```typescript
class FailureDetector {
  // Phi Accrual 故障检测器
  private phiThreshold = 8.0;
  private heartbeatInterval = 5000; // 5 秒
  
  detectFailure(instanceId: string): boolean {
    const phi = this.calculatePhi(instanceId);
    return phi > this.phiThreshold;
  }
}
```

### 4.2 自动故障转移

1. **检测故障**：健康检查失败
2. **标记实例**：从可用列表移除
3. **迁移负载**：重新分配请求
4. **恢复检测**：定期探测故障实例
5. **重新加入**：恢复后自动加入集群

### 4.3 数据恢复策略

```typescript
enum RecoveryStrategy {
  REPLAY_FROM_MQ = 'replay_from_mq',      // 从消息队列重放
  RESTORE_FROM_SNAPSHOT = 'restore_from_snapshot', // 从快照恢复
  SYNC_FROM_REPLICA = 'sync_from_replica' // 从副本同步
}
```

## 5. 性能优化

### 5.1 连接池管理

```typescript
const poolConfig = {
  database: {
    max: 20,              // 最大连接数
    min: 5,               // 最小连接数
    idleTimeout: 30000    // 空闲超时
  },
  redis: {
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100
  },
  rabbitmq: {
    prefetch: 10,         // 预取消息数
    channelMax: 100       // 最大通道数
  }
};
```

### 5.2 缓存策略

```typescript
const cacheLayers = {
  L1: {
    type: 'local',        // 本地内存缓存
    ttl: 60,              // 1 分钟
    maxSize: 10000        // 最大条目数
  },
  L2: {
    type: 'redis',        // 分布式缓存
    ttl: 300,             // 5 分钟
    pattern: 'orchestra:cache:*'
  }
};
```

## 6. 监控与可观测性

### 6.1 指标收集

```typescript
interface Metrics {
  // 系统指标
  cpu_usage: number;
  memory_usage: number;
  disk_io: number;
  
  // 应用指标
  request_latency_p99: number;
  request_rate: number;
  error_rate: number;
  
  // 业务指标
  active_workers: number;
  queued_tasks: number;
  completed_tasks: number;
}
```

### 6.2 分布式追踪

- 使用 OpenTelemetry 进行链路追踪
- 每个请求携带 trace_id
- 跨服务传递 span_context

### 6.3 日志聚合

```typescript
const logConfig = {
  format: 'json',
  fields: ['timestamp', 'level', 'service', 'instance_id', 'trace_id'],
  output: 'stdout',  // 由 Fluentd 收集
  sampling: {
    enabled: true,
    rate: 0.1  // 10% 采样率
  }
};
```

## 7. 安全考虑

### 7.1 实例间认证

```typescript
interface InstanceAuth {
  method: 'mTLS';  // 双向 TLS 认证
  certificate: {
    ca: '/etc/orchestra/ca.crt',
    cert: '/etc/orchestra/instance.crt',
    key: '/etc/orchestra/instance.key'
  };
  tokenRotation: '24h';  // Token 轮换周期
}
```

### 7.2 数据加密

- 传输加密：TLS 1.3
- 存储加密：AES-256
- 密钥管理：HashiCorp Vault

---

**文档版本**: 1.0  
**创建日期**: 2026-04-03  
**作者**: AI 后端架构师  
**状态**: 设计稿
