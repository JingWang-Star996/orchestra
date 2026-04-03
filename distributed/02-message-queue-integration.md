# Orchestra 消息队列集成方案

## 1. 技术选型

### 1.1 选型对比

| 特性 | RabbitMQ | Kafka | Redis Streams | 最终选择 |
|------|----------|-------|---------------|----------|
| 消息模型 | 灵活的 Exchange/Queue | Topic/Partition | Stream/Consumer Group | - |
| 吞吐量 | 中等 (10K-50K/s) | 高 (100K+/s) | 高 | - |
| 延迟 | 低 (ms 级) | 中等 | 极低 | - |
| 持久化 | 支持 | 强持久化 | 支持 | - |
| 消息确认 | ACK 机制 | Offset 提交 | ACK 机制 | - |
| 死信队列 | 原生支持 | 需自行实现 | 支持 | - |
| 延迟队列 | 支持 (TTL+DLX) | 需额外组件 | 支持 | - |
| 运维复杂度 | 低 | 中 | 低 | - |
| 适用场景 | 任务队列、RPC | 事件流、日志 | 简单队列 | **RabbitMQ** |

### 1.2 选择 RabbitMQ 的理由

1. **Orchestra 使用场景匹配**：
   - 任务分发（Worker 调度）
   - 事件通知（状态变更）
   - RPC 模式（请求 - 响应）
   - 延迟任务（超时处理）

2. **运维友好**：
   - 管理界面完善
   - 监控指标丰富
   - 社区成熟

3. **功能完备**：
   - 多种 Exchange 类型
   - 死信队列
   - 消息优先级
   - 延迟队列

## 2. 架构设计

### 2.1 消息队列拓扑

```
┌─────────────────────────────────────────────────────────────────┐
│                        Orchestra Cluster                         │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │   RabbitMQ Cluster    │
              │   (3 Nodes + HA)      │
              └──────────┬───────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  Tasks Exchange │ │ Events Exchange │ │  RPC Exchange   │
│    (direct)     │ │   (topic)       │ │    (direct)     │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         │                   │                   │
    ┌────┴────┐         ┌────┴────┐         ┌────┴────┐
    │         │         │         │         │         │
    ▼         ▼         ▼         ▼         ▼         ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│worker- │ │worker- │ │orchestra│ │orchestra│ │rpc-   │ │rpc-   │
│queue-1 │ │queue-2 │ │.event.* │ │.dlq    │ │req-   │ │resp-  │
│        │ │        │ │         │ │         │ │queue  │ │queue  │
└────────┘ └────────┘ └─────────┘ └─────────┘ └────────┘ └────────┘
```

### 2.2 Exchange 设计

#### Tasks Exchange (任务分发)
```typescript
const tasksExchange = {
  name: 'orchestra.tasks',
  type: 'direct',
  durable: true,
  autoDelete: false,
  bindings: [
    {
      routingKey: 'worker.priority',
      queue: 'orchestra.worker.priority',
      args: { priority: 10 }
    },
    {
      routingKey: 'worker.default',
      queue: 'orchestra.worker.default',
      args: { priority: 5 }
    },
    {
      routingKey: 'worker.background',
      queue: 'orchestra.worker.background',
      args: { priority: 1 }
    }
  ]
};
```

#### Events Exchange (事件通知)
```typescript
const eventsExchange = {
  name: 'orchestra.events',
  type: 'topic',
  durable: true,
  bindings: [
    {
      routingKey: 'orchestra.event.worker.*',
      queue: 'orchestra.event.worker.all'
    },
    {
      routingKey: 'orchestra.event.task.*',
      queue: 'orchestra.event.task.all'
    },
    {
      routingKey: 'orchestra.event.#',
      queue: 'orchestra.event.audit'
    }
  ]
};
```

#### RPC Exchange (同步调用)
```typescript
const rpcExchange = {
  name: 'orchestra.rpc',
  type: 'direct',
  durable: false,
  bindings: [
    {
      routingKey: 'rpc.request',
      queue: 'orchestra.rpc.requests'
    },
    {
      routingKey: 'rpc.response.{correlationId}',
      queue: 'orchestra.rpc.responses.{correlationId}',
      exclusive: true
    }
  ]
};
```

### 2.3 队列设计

```typescript
interface QueueConfig {
  name: string;
  durable: boolean;
  exclusive: boolean;
  autoDelete: boolean;
  arguments?: {
    'x-message-ttl'?: number;        // 消息 TTL (毫秒)
    'x-dead-letter-exchange'?: string; // 死信 Exchange
    'x-dead-letter-routing-key'?: string; // 死信路由键
    'x-max-priority'?: number;       // 最大优先级
    'x-max-length'?: number;         // 最大队列长度
  };
}

// 示例：Worker 队列
const workerQueue: QueueConfig = {
  name: 'orchestra.worker.default',
  durable: true,
  exclusive: false,
  autoDelete: false,
  arguments: {
    'x-message-ttl': 3600000,  // 1 小时超时
    'x-dead-letter-exchange': 'orchestra.dlq',
    'x-dead-letter-routing-key': 'worker.failed',
    'x-max-priority': 10,
    'x-max-length': 10000
  }
};

// 示例：死信队列
const dlqQueue: QueueConfig = {
  name: 'orchestra.dlq',
  durable: true,
  exclusive: false,
  autoDelete: false,
  arguments: {
    'x-message-ttl': 86400000,  // 24 小时保留
    'x-max-length': 1000
  }
};
```

## 3. 消息格式规范

### 3.1 任务消息

```typescript
interface TaskMessage {
  // 元数据
  messageId: string;           // 消息唯一 ID (UUID)
  correlationId?: string;      // 关联 ID (用于追踪)
  timestamp: number;           // 发送时间戳
  
  // 路由
  exchange: string;            // Exchange 名称
  routingKey: string;          // 路由键
  
  // 任务信息
  taskId: string;              // 任务 ID
  taskType: string;            // 任务类型
  priority: number;            // 优先级 (1-10)
  
  // 负载
  payload: {
    workerId?: string;         // 目标 Worker ID
    data: Record<string, any>; // 任务数据
  };
  
  // 超时与重试
  timeout: number;             // 超时时间 (毫秒)
  maxRetries: number;          // 最大重试次数
  retryCount: number;          // 当前重试次数
  
  // 回调
  replyTo?: string;            // 响应队列
  headers?: Record<string, string>; // 自定义头
}
```

### 3.2 事件消息

```typescript
interface EventMessage {
  // 元数据
  eventId: string;             // 事件唯一 ID
  eventType: string;           // 事件类型
  timestamp: number;           // 事件时间戳
  version: string;             // 事件版本 (用于 schema 演进)
  
  // 聚合根
  aggregateId: string;         // 聚合根 ID
  aggregateType: string;       // 聚合根类型
  
  // 事件数据
  data: {
    [key: string]: any;        // 事件负载
  };
  
  // 元数据
  metadata: {
    userId?: string;           // 操作用户
    instanceId: string;        // 发起实例
    traceId: string;           // 追踪 ID
    causationId?: string;      // 因果事件 ID
  };
}
```

### 3.3 RPC 消息

```typescript
interface RpcRequest {
  correlationId: string;       // 关联 ID
  replyTo: string;             // 响应队列
  method: string;              // 方法名
  args: any[];                 // 参数
  timeout: number;             // 超时时间
}

interface RpcResponse {
  correlationId: string;       // 关联 ID
  success: boolean;            // 是否成功
  result?: any;                // 返回结果
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
  duration: number;            // 执行耗时 (毫秒)
}
```

## 4. 客户端实现

### 4.1 连接管理

```typescript
import * as amqp from 'amqplib';

class RabbitMQClient {
  private connection: amqp.Connection | null = null;
  private channel: amqp.Channel | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  
  async connect(): Promise<void> {
    const urls = [
      'amqp://user:pass@mq1:5672',
      'amqp://user:pass@mq2:5672',
      'amqp://user:pass@mq3:5672'
    ];
    
    while (this.reconnectAttempts < this.maxReconnectAttempts) {
      try {
        const url = urls[this.reconnectAttempts % urls.length];
        this.connection = await amqp.connect(url);
        this.channel = await this.connection.createChannel();
        
        // 连接关闭时自动重连
        this.connection.on('close', () => this.handleDisconnect());
        this.connection.on('error', (err) => this.handleError(err));
        
        console.log('RabbitMQ 连接成功');
        return;
      } catch (error) {
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        await this.sleep(delay);
      }
    }
    
    throw new Error('无法连接 RabbitMQ');
  }
  
  private async handleDisconnect(): Promise<void> {
    console.log('RabbitMQ 连接断开，尝试重连...');
    this.connection = null;
    this.channel = null;
    await this.connect();
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 4.2 消息发送

```typescript
class MessagePublisher {
  constructor(private channel: amqp.Channel) {}
  
  async publishTask(task: TaskMessage): Promise<void> {
    const exchange = 'orchestra.tasks';
    const routingKey = this.getRoutingKey(task.priority);
    
    const message = Buffer.from(JSON.stringify(task));
    const options: amqp.Options.Publish = {
      contentType: 'application/json',
      deliveryMode: 2,  // 持久化
      priority: task.priority,
      messageId: task.messageId,
      correlationId: task.correlationId,
      timestamp: task.timestamp,
      expiration: task.timeout.toString(),
      headers: task.headers
    };
    
    const published = this.channel.publish(
      exchange,
      routingKey,
      message,
      options
    );
    
    if (!published) {
      // 背压处理
      await this.waitForDrain();
    }
  }
  
  async publishEvent(event: EventMessage): Promise<void> {
    const exchange = 'orchestra.events';
    const routingKey = `orchestra.event.${event.aggregateType}.${event.eventType}`;
    
    const message = Buffer.from(JSON.stringify(event));
    const options: amqp.Options.Publish = {
      contentType: 'application/json',
      deliveryMode: 2,
      messageId: event.eventId,
      timestamp: event.timestamp,
      headers: {
        'x-event-type': event.eventType,
        'x-aggregate-id': event.aggregateId
      }
    };
    
    this.channel.publish(exchange, routingKey, message, options);
  }
  
  async requestRpc(rpc: RpcRequest): Promise<RpcResponse> {
    return new Promise(async (resolve, reject) => {
      const replyQueue = await this.channel.assertQueue('', { exclusive: true });
      
      const timeout = setTimeout(() => {
        reject(new Error('RPC 请求超时'));
      }, rpc.timeout);
      
      this.channel.consume(
        replyQueue.queue,
        (msg) => {
          if (!msg) return;
          clearTimeout(timeout);
          this.channel.ack(msg);
          const response = JSON.parse(msg.content.toString());
          resolve(response);
        },
        { noAck: false }
      );
      
      const message = Buffer.from(JSON.stringify(rpc));
      this.channel.publish('orchestra.rpc', 'rpc.request', message, {
        contentType: 'application/json',
        replyTo: replyQueue.queue,
        correlationId: rpc.correlationId,
        expiration: rpc.timeout.toString()
      });
    });
  }
  
  private getRoutingKey(priority: number): string {
    if (priority >= 8) return 'worker.priority';
    if (priority >= 4) return 'worker.default';
    return 'worker.background';
  }
  
  private waitForDrain(): Promise<void> {
    return new Promise(resolve => {
      this.channel.once('drain', resolve);
    });
  }
}
```

### 4.3 消息消费

```typescript
class MessageConsumer {
  private consumers: Map<string, amqp.Replies.Consume> = new Map();
  
  async consumeTasks(
    queue: string,
    handler: (task: TaskMessage) => Promise<void>,
    options?: { prefetch?: number }
  ): Promise<void> {
    const { prefetch = 10 } = options || {};
    
    await this.channel.prefetch(prefetch);
    
    const consumer = await this.channel.consume(
      queue,
      async (msg) => {
        if (!msg) return;
        
        try {
          const task = JSON.parse(msg.content.toString()) as TaskMessage;
          await handler(task);
          this.channel.ack(msg);
        } catch (error) {
          console.error('任务处理失败:', error);
          
          // 重试逻辑
          const task = JSON.parse(msg.content.toString());
          if (task.retryCount < task.maxRetries) {
            task.retryCount++;
            this.channel.nack(msg, false, true); // requeue
          } else {
            // 发送到死信队列
            this.channel.nack(msg, false, false);
          }
        }
      },
      { noAck: false }
    );
    
    this.consumers.set(queue, consumer);
  }
  
  async consumeEvents(
    pattern: string,
    handler: (event: EventMessage) => Promise<void>
  ): Promise<void> {
    const queue = await this.channel.assertQueue('', { exclusive: true });
    await this.channel.bindQueue(queue.queue, 'orchestra.events', pattern);
    
    await this.channel.consume(
      queue.queue,
      async (msg) => {
        if (!msg) return;
        
        try {
          const event = JSON.parse(msg.content.toString()) as EventMessage;
          await handler(event);
          this.channel.ack(msg);
        } catch (error) {
          console.error('事件处理失败:', error);
          this.channel.nack(msg, false, false);
        }
      },
      { noAck: false }
    );
  }
  
  async stopConsuming(queue: string): Promise<void> {
    const consumer = this.consumers.get(queue);
    if (consumer) {
      await this.channel.cancel(consumer.consumerTag);
      this.consumers.delete(queue);
    }
  }
}
```

## 5. 高级特性

### 5.1 延迟队列

```typescript
// 方案：TTL + 死信队列
const delayedQueue = {
  name: 'orchestra.delayed',
  arguments: {
    'x-message-ttl': 60000,  // 60 秒后过期
    'x-dead-letter-exchange': 'orchestra.tasks',
    'x-dead-letter-routing-key': 'worker.default'
  }
};

// 发送延迟任务
async function publishDelayedTask(task: TaskMessage, delayMs: number): Promise<void> {
  await channel.assertQueue('orchestra.delayed', {
    arguments: {
      'x-message-ttl': delayMs,
      'x-dead-letter-exchange': 'orchestra.tasks',
      'x-dead-letter-routing-key': 'worker.default'
    }
  });
  
  channel.publish('', 'orchestra.delayed', Buffer.from(JSON.stringify(task)), {
    deliveryMode: 2
  });
}
```

### 5.2 消息优先级

```typescript
// 队列启用优先级
await channel.assertQueue('orchestra.worker.priority', {
  arguments: {
    'x-max-priority': 10
  }
});

// 发送高优先级消息
channel.publish('orchestra.tasks', 'worker.priority', message, {
  priority: 10  // 最高优先级
});
```

### 5.3 死信处理

```typescript
class DeadLetterHandler {
  async processDeadLetter(msg: amqp.Message): Promise<void> {
    const originalMessage = JSON.parse(msg.content.toString());
    const xDeath = msg.properties.headers?.['x-death'] as any[];
    
    console.error('死信消息:', {
      originalQueue: xDeath?.[0]?.queue,
      reason: xDeath?.[0]?.reason,
      count: xDeath?.[0]?.count,
      message: originalMessage
    });
    
    // 记录到审计日志
    await this.logToAudit(originalMessage, xDeath);
    
    // 可选：发送告警
    if (this.isCritical(originalMessage)) {
      await this.sendAlert(originalMessage);
    }
  }
}
```

### 5.4 消息追踪

```typescript
interface MessageTrace {
  messageId: string;
  correlationId: string;
  timestamps: {
    published: number;
    received: number;
    acknowledged: number;
  };
  route: {
    exchange: string;
    queue: string;
    routingKey: string;
  };
  consumer: {
    instanceId: string;
    workerId: string;
  };
}

// 在消息头中添加追踪信息
const headers = {
  'x-trace-id': traceId,
  'x-span-id': spanId,
  'x-instance-id': instanceId
};
```

## 6. 监控与告警

### 6.1 关键指标

```typescript
interface RabbitMQMetrics {
  // 队列指标
  queueLength: number;           // 队列长度
  queueReady: number;            // 待消费消息数
  queueUnacked: number;          // 未确认消息数
  
  // 消费者指标
  consumerCount: number;         // 消费者数量
  consumerUtilization: number;   // 消费者利用率
  
  // 消息指标
  publishRate: number;           // 发布速率 (msg/s)
  deliverRate: number;           // 投递速率 (msg/s)
  ackRate: number;              // 确认速率 (msg/s)
  
  // 连接指标
  connectionCount: number;       // 连接数
  channelCount: number;          // 通道数
}
```

### 6.2 告警规则

```yaml
alerts:
  - name: HighQueueLength
    condition: queueLength > 10000
    severity: warning
    action: notify
    
  - name: ConsumerDown
    condition: consumerCount == 0
    severity: critical
    action: page_oncall
    
  - name: MessageBacklog
    condition: queueReady > 50000
    severity: critical
    action: page_oncall
    
  - name: HighUnacked
    condition: queueUnacked > 1000
    severity: warning
    action: notify
```

## 7. 部署配置

### 7.1 Docker Compose

```yaml
version: '3.8'

services:
  rabbitmq:
    image: rabbitmq:3.12-management
    container_name: orchestra-rabbitmq
    ports:
      - "5672:5672"   # AMQP
      - "15672:15672" # Management
    environment:
      RABBITMQ_DEFAULT_USER: orchestra
      RABBITMQ_DEFAULT_PASS: secure_password
      RABBITMQ_DEFAULT_VHOST: /orchestra
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
      - ./rabbitmq.conf:/etc/rabbitmq/rabbitmq.conf
    healthcheck:
      test: rabbitmq-diagnostics -q ping
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  rabbitmq_data:
```

### 7.2 rabbitmq.conf

```ini
# 集群配置
cluster_formation.peer_discovery_backend = rabbit_peer_discovery_dns
cluster_formation.peer_discovery_backend = etcd
cluster_formation.etcd.host = etcd:2379

# 资源限制
vm_memory_high_watermark.relative = 0.6
disk_free_limit.absolute = 2GB

# 日志
log.file.level = info
log.console = true
log.console.level = info

# 插件
enabled_plugins = rabbitmq_management,rabbitmq_prometheus
```

---

**文档版本**: 1.0  
**创建日期**: 2026-04-03  
**作者**: AI 后端架构师  
**状态**: 设计稿
