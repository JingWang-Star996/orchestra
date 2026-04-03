# Orchestra 部署指南

**版本**: v2.0.0  
**最后更新**: 2026-04-03

---

## 📋 目录

- [系统要求](#系统要求)
- [快速部署](#快速部署)
- [生产环境部署](#生产环境部署)
- [分布式部署](#分布式部署)
- [监控与告警](#监控与告警)
- [故障排查](#故障排查)

---

## 系统要求

### 最低配置

| 组件 | 要求 |
|------|------|
| CPU | 2 核心 |
| 内存 | 4 GB |
| 磁盘 | 10 GB |
| Node.js | v18+ |

### 推荐配置

| 组件 | 要求 |
|------|------|
| CPU | 4 核心 |
| 内存 | 8 GB |
| 磁盘 | 50 GB SSD |
| Node.js | v20+ |

### 依赖服务

| 服务 | 版本 | 用途 |
|------|------|------|
| Redis | 6.0+ | 分布式协调（可选） |
| RabbitMQ | 3.8+ | 消息队列（可选） |
| MongoDB | 5.0+ | 数据持久化（可选） |

---

## 快速部署

### 1. 安装依赖

```bash
cd orchestra
npm install
```

### 2. 配置环境变量

创建 `.env` 文件：

```bash
# 基础配置
NODE_ENV=production
PORT=3000

# OpenClaw API
OPENCLAW_API_URL=https://api.openclaw.dev
OPENCLAW_API_KEY=your_api_key

# 存储配置
STORAGE_TYPE=file          # memory | file | mongodb
STORAGE_PATH=./temp

# 日志配置
LOG_LEVEL=info            # debug | info | warn | error
LOG_FILE=./logs/orchestra.log
```

### 3. 启动服务

```bash
# 开发环境
npm run dev

# 生产环境
npm start
```

### 4. 验证部署

```bash
curl http://localhost:3000/health
# 返回：{"status":"ok","version":"2.0.0"}
```

---

## 生产环境部署

### 1. 使用 PM2 管理进程

**安装 PM2**:
```bash
npm install -g pm2
```

**创建 ecosystem.config.js**:
```javascript
module.exports = {
  apps: [{
    name: 'orchestra',
    script: './index.js',
    instances: 4,                 // 实例数
    exec_mode: 'cluster',         // 集群模式
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '1G',     // 内存限制
    autorestart: true,
    watch: false
  }]
};
```

**启动服务**:
```bash
# 启动
pm2 start ecosystem.config.js --env production

# 查看状态
pm2 status

# 查看日志
pm2 logs orchestra

# 重启
pm2 restart orchestra

# 停止
pm2 stop orchestra
```

**开机自启**:
```bash
pm2 startup
pm2 save
```

---

### 2. 使用 Docker 部署

**创建 Dockerfile**:
```dockerfile
FROM node:20-alpine

WORKDIR /app

# 复制 package.json
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production

# 复制源代码
COPY . .

# 创建存储目录
RUN mkdir -p /app/temp

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["node", "index.js"]
```

**创建 docker-compose.yml**:
```yaml
version: '3.8'

services:
  orchestra:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - STORAGE_TYPE=file
      - STORAGE_PATH=/app/temp
    volumes:
      - ./temp:/app/temp
      - ./logs:/app/logs
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # 可选：Redis 用于分布式协调
  redis:
    image: redis:6-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    restart: unless-stopped

  # 可选：RabbitMQ 用于消息队列
  rabbitmq:
    image: rabbitmq:3-management-alpine
    ports:
      - "5672:5672"   # AMQP
      - "15672:15672" # Management UI
    environment:
      - RABBITMQ_DEFAULT_USER=guest
      - RABBITMQ_DEFAULT_PASS=guest
    volumes:
      - rabbitmq-data:/var/lib/rabbitmq
    restart: unless-stopped

volumes:
  redis-data:
  rabbitmq-data:
```

**启动服务**:
```bash
# 构建并启动
docker-compose up -d

# 查看日志
docker-compose logs -f orchestra

# 停止服务
docker-compose down
```

---

### 3. 使用 Kubernetes 部署

**创建 deployment.yaml**:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: orchestra
  labels:
    app: orchestra
spec:
  replicas: 3
  selector:
    matchLabels:
      app: orchestra
  template:
    metadata:
      labels:
        app: orchestra
    spec:
      containers:
      - name: orchestra
        image: orchestra:2.0.0
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: STORAGE_TYPE
          value: "file"
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: orchestra-service
spec:
  selector:
    app: orchestra
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: LoadBalancer
```

**部署**:
```bash
kubectl apply -f deployment.yaml

# 查看状态
kubectl get pods

# 查看日志
kubectl logs -f deployment/orchestra
```

---

## 分布式部署

### 架构设计

```
                    ┌─────────────────┐
                    │  Load Balancer  │
                    │   (Nginx/ALB)   │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
    ┌─────────▼──────┐ ┌────▼─────┐ ┌──────▼────────┐
    │  Instance 001  │ │Instance02│ │  Instance 003 │
    │  (Orchestra)   │ │(Orchestra)│ │  (Orchestra)  │
    └─────────┬──────┘ └────┬─────┘ └──────┬────────┘
              │              │              │
              └──────────────┼──────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
    ┌─────────▼──────┐ ┌────▼─────┐ ┌──────▼────────┐
    │     Redis      │ │ RabbitMQ │ │   MongoDB     │
    │  (Coordination)│ │  (Queue) │ │  (Storage)    │
    └────────────────┘ └──────────┘ └───────────────┘
```

### 1. 配置 Redis 协调

```bash
# 安装 Redis
apt-get install redis-server

# 配置 Redis (redis.conf)
bind 0.0.0.0
requirepass your_password
maxmemory 2gb
maxmemory-policy allkeys-lru
```

**Orchestra 配置**:
```javascript
const manager = new DistributedManager({
  instanceId: 'instance-001',
  cluster: ['instance-001', 'instance-002', 'instance-003'],
  coordination: {
    type: 'redis',
    host: 'redis.example.com',
    port: 6379,
    password: 'your_password'
  }
});
```

### 2. 配置 RabbitMQ 消息队列

```bash
# 使用 Docker 启动
docker run -d --name rabbitmq \
  -p 5672:5672 -p 15672:15672 \
  -e RABBITMQ_DEFAULT_USER=guest \
  -e RABBITMQ_DEFAULT_PASS=guest \
  rabbitmq:3-management
```

**Orchestra 配置**:
```javascript
const mq = new RabbitMQAdapter({
  host: 'rabbitmq.example.com',
  port: 5672,
  username: 'guest',
  password: 'guest',
  queue: 'orchestra-tasks',
  prefetch: 10  // 预取数量
});
```

### 3. 配置负载均衡

**Nginx 配置**:
```nginx
upstream orchestra {
    least_conn;
    server 192.168.1.10:3000;
    server 192.168.1.11:3000;
    server 192.168.1.12:3000;
    keepalive 32;
}

server {
    listen 80;
    server_name orchestra.example.com;

    location / {
        proxy_pass http://orchestra;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location /health {
        proxy_pass http://orchestra/health;
        access_log off;
    }
}
```

---

## 监控与告警

### 1. 启用 Dashboard

```javascript
const { DashboardManager } = require('./dashboard');

const dashboard = new DashboardManager({
  port: 3001,                   // Dashboard 端口
  refreshInterval: 5000,        // 5 秒刷新
  storage: 'file',
  storagePath: './temp/dashboard'
});

await dashboard.start();
```

访问：`http://localhost:3001`

### 2. 配置告警规则

```javascript
// Worker 失败率告警
dashboard.addAlertRule({
  name: 'Worker 失败率过高',
  condition: (metrics) => {
    const failedRate = metrics.failedWorkers / metrics.totalWorkers;
    return failedRate > 0.2;
  },
  action: 'webhook',
  webhook: 'https://hooks.slack.com/services/xxx',
  message: '⚠️ Worker 失败率超过 20%'
});

// 响应时间告警
dashboard.addAlertRule({
  name: '响应时间过长',
  condition: (metrics) => {
    return metrics.avgDuration > 60000;
  },
  action: 'email',
  email: 'admin@example.com',
  message: '⚠️ 平均响应时间超过 60 秒'
});

// 内存使用告警
dashboard.addAlertRule({
  name: '内存使用过高',
  condition: (metrics) => {
    return metrics.memoryUsage > 0.9;  // 90%
  },
  action: 'webhook',
  webhook: 'https://hooks.slack.com/services/xxx',
  message: '⚠️ 内存使用超过 90%'
});
```

### 3. 集成 Prometheus

**创建 metrics.js**:
```javascript
const client = require('prom-client');

const register = new client.Registry();
client.collectDefaultMetrics({ register });

// 自定义指标
const workerCounter = new client.Counter({
  name: 'orchestra_workers_total',
  help: 'Total number of workers',
  registers: [register]
});

const taskDuration = new client.Histogram({
  name: 'orchestra_task_duration_seconds',
  help: 'Task duration in seconds',
  buckets: [1, 5, 10, 30, 60],
  registers: [register]
});

// 暴露指标端点
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

**Prometheus 配置**:
```yaml
scrape_configs:
  - job_name: 'orchestra'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

### 4. 集成 Grafana

**导入 Dashboard**:
1. 访问 Grafana: `http://localhost:3000`
2. 添加 Prometheus 数据源
3. 导入 Dashboard ID: `10915` (Node.js 应用监控)

**推荐面板**:
- Worker 状态分布（饼图）
- 任务响应时间（折线图）
- Token 使用量（柱状图）
- 错误率（仪表盘）

---

## 故障排查

### 常见问题

#### 1. Worker 创建失败

**症状**:
```
Error: sessions_spawn is not available
```

**解决方案**:
```javascript
// 检查 OpenClaw API 可用性
const sessions_spawn = global.sessions_spawn || null;

if (!sessions_spawn) {
  console.warn('OpenClaw API 不可用，使用模拟模式');
  // 降级逻辑
}
```

#### 2. 持久化失败

**症状**:
```
Error: ENOENT: no such file or directory
```

**解决方案**:
```bash
# 创建存储目录
mkdir -p ./temp/notifications
mkdir -p ./temp/workers
mkdir -p ./temp/dashboard

# 检查权限
chmod 755 ./temp
```

#### 3. 内存泄漏

**症状**:
```
Process memory usage exceeds limit
```

**解决方案**:
```javascript
// 定期清理历史数据
setInterval(async () => {
  await workerManager.cleanupStoppedWorkers(30);  // 清理 30 分钟前
  await notificationManager.pruneHistory(1000);    // 保留 1000 条
}, 60 * 60 * 1000);  // 每小时
```

#### 4. 分布式同步失败

**症状**:
```
Error: Redis connection refused
```

**解决方案**:
```bash
# 检查 Redis 状态
redis-cli ping

# 检查网络连接
telnet redis.example.com 6379

# 检查防火墙
ufw status
```

---

### 日志分析

**查看日志**:
```bash
# PM2 日志
pm2 logs orchestra --lines 100

# Docker 日志
docker-compose logs --tail=100 orchestra

# 文件日志
tail -f ./logs/orchestra.log
```

**日志级别**:
```javascript
// 开发环境（详细日志）
LOG_LEVEL=debug

// 生产环境（仅警告和错误）
LOG_LEVEL=warn
```

---

### 性能诊断

**CPU 分析**:
```bash
# Node.js 内置分析
node --inspect index.js

# 使用 clinic.js
npm install -g clinic
clinic doctor -- node index.js
```

**内存分析**:
```bash
# 生成堆快照
node --inspect index.js

# Chrome DevTools 分析
# 访问 chrome://inspect
```

---

## 备份与恢复

### 数据备份

```bash
# 备份存储目录
tar -czf orchestra-backup-$(date +%Y%m%d).tar.gz ./temp

# 备份 MongoDB（如果使用）
mongodump --out ./backup/mongodb

# 备份 Redis（如果使用）
redis-cli BGSAVE
cp /var/lib/redis/dump.rdb ./backup/redis/
```

### 数据恢复

```bash
# 恢复存储目录
tar -xzf orchestra-backup-20260403.tar.gz

# 恢复 MongoDB
mongorestore ./backup/mongodb

# 恢复 Redis
cp ./backup/redis/dump.rdb /var/lib/redis/
redis-cli BGLOAD
```

---

## 安全加固

### 1. 配置防火墙

```bash
# 仅开放必要端口
ufw allow 3000/tcp    # Orchestra API
ufw allow 3001/tcp    # Dashboard
ufw allow 22/tcp      # SSH
ufw enable
```

### 2. 启用 HTTPS

```nginx
server {
    listen 443 ssl;
    server_name orchestra.example.com;

    ssl_certificate /etc/ssl/certs/orchestra.crt;
    ssl_certificate_key /etc/ssl/private/orchestra.key;

    location / {
        proxy_pass http://orchestra;
    }
}
```

### 3. 配置访问控制

```javascript
// JWT 认证
const jwt = require('jsonwebtoken');

app.use('/api', (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Unauthorized' });
  }
});
```

---

## 性能优化

### 1. 启用缓存

```javascript
const NodeCache = require('node-cache');

const cache = new NodeCache({
  stdTTL: 300,          // 5 分钟
  checkperiod: 60       // 每分钟检查
});

// 缓存 Worker 状态
const status = cache.get(`worker:${workerId}`);
if (!status) {
  const freshStatus = await getWorkerStatus(workerId);
  cache.set(`worker:${workerId}`, freshStatus);
}
```

### 2. 数据库索引

```javascript
// MongoDB 索引
db.notifications.createIndex({ taskId: 1, timestamp: -1 });
db.workers.createIndex({ status: 1, createdAt: -1 });

// Redis 索引（使用 Hash）
HSET worker:agent-x7q status running tokens 12345
```

### 3. 并发控制

```javascript
const { semaphore } = require('./utils');

const limitedExecute = semaphore(async (task) => {
  return await worker.execute(task);
}, 10);  // 最多 10 个并发
```

---

**维护者**: AI CTO  
**联系方式**: orchestra-team@example.com  
**最后更新**: 2026-04-03
