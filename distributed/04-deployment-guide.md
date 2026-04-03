# Orchestra 分布式部署指南

## 1. 部署架构

### 1.1 最小部署 (开发/测试)

```
┌─────────────────────────────────────────────┐
│              Single Host                     │
│  ┌─────────────────────────────────────┐    │
│  │  Orchestra Instance #1               │    │
│  │  - API Server (Port 3000)            │    │
│  │  - Worker Manager                    │    │
│  └─────────────────────────────────────┘    │
│  ┌─────────────────────────────────────┐    │
│  │  Docker Compose Services             │    │
│  │  - PostgreSQL (Port 5432)            │    │
│  │  - Redis (Port 6379)                 │    │
│  │  - RabbitMQ (Port 5672, 15672)       │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

**资源配置**：
- CPU: 4 核
- 内存：8GB
- 磁盘：50GB SSD

### 1.2 标准部署 (生产环境)

```
┌─────────────────────────────────────────────────────────┐
│                    Load Balancer                         │
│                    (Nginx/ALB)                           │
└───────────────────────┬─────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│ Orchestra     │ │ Orchestra     │ │ Orchestra     │
│ Instance #1   │ │ Instance #2   │ │ Instance #3   │
│ (API + Worker)│ │ (API + Worker)│ │ (Worker Only) │
└───────────────┘ └───────────────┘ └───────────────┘
        │               │               │
        └───────────────┼───────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│ PostgreSQL    │ │ Redis         │ │ RabbitMQ      │
│ Primary +     │ │ Cluster       │ │ Cluster       │
│ 2 Replicas    │ │ (3 Nodes)     │ │ (3 Nodes)     │
└───────────────┘ └───────────────┘ └───────────────┘
```

**资源配置** (每实例)：
- CPU: 8 核
- 内存：16GB
- 磁盘：100GB SSD

### 1.3 大规模部署 (高可用)

```
┌─────────────────────────────────────────────────────────────────┐
│                         Global DNS                               │
│                         (Route53)                                │
└────────────────────────────┬────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  Region: US-East │ │ Region: EU-West  │ │ Region: AP-East  │
│  ┌───────────┐  │ │  ┌───────────┐  │ │  ┌───────────┐  │
│  │    LB     │  │ │  │    LB     │  │ │  │    LB     │  │
│  └─────┬─────┘  │ │  └─────┬─────┘  │ │  └─────┬─────┘  │
│        │        │ │        │        │ │        │        │
│  ┌─────┴─────┐  │ │  ┌─────┴─────┐  │ │  ┌─────┴─────┐  │
│  │ 5x Orch.  │  │ │  │ 5x Orch.  │  │ │  │ 5x Orch.  │  │
│  │ Instances │  │ │  │ Instances │  │ │  │ Instances │  │
│  └───────────┘  │ │  └───────────┘  │ │  └───────────┘  │
│        │        │ │        │        │ │        │        │
│  ┌─────┴─────┐  │ │  ┌─────┴─────┐  │ │  ┌─────┴─────┐  │
│  │ Regional  │  │ │  │ Regional  │  │ │  │ Regional  │  │
│  │ Services  │  │ │  │ Services  │  │ │  │ Services  │  │
│  └───────────┘  │ │  └───────────┘  │ │  └───────────┘  │
└─────────────────┘ └─────────────────┘ └─────────────────┘
        │                    │                    │
        └────────────────────┼────────────────────┘
                             │
                    ┌────────┴────────┐
                    │  Global Services │
                    │  - Multi-Region  │
                    │    PostgreSQL    │
                    │  - Redis Cluster │
                    │  - Kafka         │
                    └─────────────────┘
```

## 2. 环境准备

### 2.1 系统要求

```bash
# 操作系统
- Ubuntu 20.04+ / Debian 11+
- CentOS 8+ / Rocky Linux 8+
- macOS 12+ (开发环境)

# 必需软件
- Node.js 18+ 
- Docker 24+
- Docker Compose 2.0+

# 推荐配置
- 内核参数优化
- 文件描述符限制提升
- 网络参数调优
```

### 2.2 内核参数优化

```bash
# /etc/sysctl.conf

# 网络优化
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1

# 内存优化
vm.overcommit_memory = 1
vm.swappiness = 1

# 文件描述符
fs.file-max = 2097152
fs.inotify.max_user_watches = 524288

# 应用配置
kernel.pid_max = 4194304

# 生效
sudo sysctl -p
```

### 2.3 用户限制配置

```bash
# /etc/security/limits.conf

# 文件描述符
* soft nofile 65535
* hard nofile 65535

# 进程数
* soft nproc 65535
* hard nproc 65535

# 内存锁定 (可选，用于 Redis)
* soft memlock unlimited
* hard memlock unlimited
```

## 3. Docker Compose 部署

### 3.1 最小部署配置

```yaml
# docker-compose.minimal.yml
version: '3.8'

services:
  # PostgreSQL
  postgres:
    image: postgres:15-alpine
    container_name: orchestra-postgres
    environment:
      POSTGRES_USER: orchestra
      POSTGRES_PASSWORD: ${DB_PASSWORD:-secure_password}
      POSTGRES_DB: orchestra
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init-scripts:/docker-entrypoint-initdb.d
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U orchestra"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  # Redis
  redis:
    image: redis:7-alpine
    container_name: orchestra-redis
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD:-secure_password}
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "--pass", "${REDIS_PASSWORD:-secure_password}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  # RabbitMQ
  rabbitmq:
    image: rabbitmq:3.12-management
    container_name: orchestra-rabbitmq
    environment:
      RABBITMQ_DEFAULT_USER: orchestra
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASSWORD:-secure_password}
      RABBITMQ_DEFAULT_VHOST: /orchestra
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
      - ./rabbitmq.conf:/etc/rabbitmq/rabbitmq.conf:ro
    ports:
      - "5672:5672"   # AMQP
      - "15672:15672" # Management
    healthcheck:
      test: rabbitmq-diagnostics -q ping
      interval: 30s
      timeout: 10s
      retries: 5
    restart: unless-stopped

  # Orchestra Application
  orchestra:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: orchestra-app
    environment:
      NODE_ENV: production
      PORT: 3000
      
      # 数据库配置
      DATABASE_URL: postgresql://orchestra:${DB_PASSWORD}@postgres:5432/orchestra
      
      # Redis 配置
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
      
      # RabbitMQ 配置
      RABBITMQ_URL: amqp://orchestra:${RABBITMQ_PASSWORD}@rabbitmq:5672/orchestra
      
      # 实例配置
      INSTANCE_ID: orchestra-1
      INSTANCE_ROLE: hybrid
      
      # 日志配置
      LOG_LEVEL: info
      LOG_FORMAT: json
    ports:
      - "3000:3000"
    volumes:
      - ./logs:/app/logs
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '1.0'
          memory: 1G

volumes:
  postgres_data:
  redis_data:
  rabbitmq_data:

networks:
  default:
    name: orchestra-network
```

### 3.2 生产环境配置

```yaml
# docker-compose.production.yml
version: '3.8'

services:
  # Nginx Load Balancer
  nginx:
    image: nginx:alpine
    container_name: orchestra-nginx
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - nginx_logs:/var/log/nginx
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - orchestra-1
      - orchestra-2
      - orchestra-3
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M

  # Orchestra Instance 1
  orchestra-1:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      NODE_ENV: production
      INSTANCE_ID: orchestra-1
      INSTANCE_ROLE: hybrid
      DATABASE_URL: postgresql://orchestra:${DB_PASSWORD}@postgres-primary:5432/orchestra
      REDIS_URL: redis://orchestra-redis:${REDIS_PASSWORD}@redis-cluster:6379
      RABBITMQ_URL: amqp://orchestra:${RABBITMQ_PASSWORD}@rabbitmq-cluster:5672/orchestra
    depends_on:
      - postgres-primary
      - redis-cluster
      - rabbitmq-cluster
    restart: unless-stopped
    deploy:
      replicas: 1
      resources:
        limits:
          cpus: '4.0'
          memory: 4G

  # Orchestra Instance 2
  orchestra-2:
    extends:
      service: orchestra-1
    environment:
      INSTANCE_ID: orchestra-2

  # Orchestra Instance 3 (Worker Only)
  orchestra-3:
    extends:
      service: orchestra-1
    environment:
      INSTANCE_ID: orchestra-3
      INSTANCE_ROLE: worker

  # PostgreSQL Primary
  postgres-primary:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: orchestra
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: orchestra
      REPLICATION_MODE: primary
    volumes:
      - postgres_primary_data:/var/lib/postgresql/data
      - ./postgres/primary.conf:/etc/postgresql/postgresql.conf:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U orchestra"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  # PostgreSQL Replica 1
  postgres-replica-1:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: orchestra
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      REPLICATION_MODE: replica
      PRIMARY_HOST: postgres-primary
    volumes:
      - postgres_replica1_data:/var/lib/postgresql/data
    depends_on:
      - postgres-primary
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U orchestra"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  # PostgreSQL Replica 2
  postgres-replica-2:
    extends:
      service: postgres-replica-1
    volumes:
      - postgres_replica2_data:/var/lib/postgresql/data

  # Redis Cluster (3 nodes)
  redis-node-1:
    image: redis:7-alpine
    command: redis-server --port 6379 --cluster-enabled yes --cluster-config-file nodes.conf --cluster-node-timeout 5000 --appendonly yes
    volumes:
      - redis_node1_data:/data
    restart: unless-stopped

  redis-node-2:
    extends:
      service: redis-node-1
    volumes:
      - redis_node2_data:/data

  redis-node-3:
    extends:
      service: redis-node-1
    volumes:
      - redis_node3_data:/data

  # RabbitMQ Cluster (3 nodes)
  rabbitmq-node-1:
    image: rabbitmq:3.12-management
    hostname: rabbitmq-node-1
    environment:
      RABBITMQ_DEFAULT_USER: orchestra
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASSWORD}
      RABBITMQ_ERLANG_COOKIE: ${RABBITMQ_ERLANG_COOKIE}
      RABBITMQ_CLUSTER_NODES: rabbitmq-node-1,rabbitmq-node-2,rabbitmq-node-3
    volumes:
      - rabbitmq_node1_data:/var/lib/rabbitmq
    restart: unless-stopped

  rabbitmq-node-2:
    extends:
      service: rabbitmq-node-1
    hostname: rabbitmq-node-2
    volumes:
      - rabbitmq_node2_data:/var/lib/rabbitmq
    depends_on:
      - rabbitmq-node-1

  rabbitmq-node-3:
    extends:
      service: rabbitmq-node-1
    hostname: rabbitmq-node-3
    volumes:
      - rabbitmq_node3_data:/var/lib/rabbitmq
    depends_on:
      - rabbitmq-node-1

volumes:
  nginx_logs:
  postgres_primary_data:
  postgres_replica1_data:
  postgres_replica2_data:
  redis_node1_data:
  redis_node2_data:
  redis_node3_data:
  rabbitmq_node1_data:
  rabbitmq_node2_data:
  rabbitmq_node3_data:

networks:
  default:
    name: orchestra-production
    driver: overlay
```

## 4. Kubernetes 部署

### 4.1 Namespace 和 ConfigMap

```yaml
# k8s/namespace.yml
apiVersion: v1
kind: Namespace
metadata:
  name: orchestra
  labels:
    name: orchestra

---
# k8s/configmap.yml
apiVersion: v1
kind: ConfigMap
metadata:
  name: orchestra-config
  namespace: orchestra
data:
  NODE_ENV: "production"
  LOG_LEVEL: "info"
  LOG_FORMAT: "json"
  PORT: "3000"
  
  # 服务发现
  DATABASE_HOST: "postgres-primary.orchestra.svc.cluster.local"
  REDIS_HOST: "redis-cluster.orchestra.svc.cluster.local"
  RABBITMQ_HOST: "rabbitmq-cluster.orchestra.svc.cluster.local"
  
  # 超时配置
  REQUEST_TIMEOUT: "30000"
  TASK_TIMEOUT: "3600000"
  HEARTBEAT_INTERVAL: "5000"
```

### 4.2 Secrets

```yaml
# k8s/secrets.yml
apiVersion: v1
kind: Secret
metadata:
  name: orchestra-secrets
  namespace: orchestra
type: Opaque
stringData:
  DATABASE_PASSWORD: "secure_db_password"
  REDIS_PASSWORD: "secure_redis_password"
  RABBITMQ_PASSWORD: "secure_rabbitmq_password"
  JWT_SECRET: "secure_jwt_secret"
  ENCRYPTION_KEY: "secure_encryption_key"
```

### 4.3 Deployment

```yaml
# k8s/deployment.yml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: orchestra
  namespace: orchestra
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
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "3000"
        prometheus.io/path: "/metrics"
    spec:
      containers:
      - name: orchestra
        image: orchestra:latest
        imagePullPolicy: Always
        ports:
        - containerPort: 3000
          name: http
        env:
        - name: INSTANCE_ID
          valueFrom:
            fieldRef:
              fieldPath: metadata.name
        - name: INSTANCE_ROLE
          value: "hybrid"
        envFrom:
        - configMapRef:
            name: orchestra-config
        - secretRef:
            name: orchestra-secrets
        resources:
          requests:
            cpu: "500m"
            memory: "512Mi"
          limits:
            cpu: "2000m"
            memory: "2Gi"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 30
          timeoutSeconds: 10
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        volumeMounts:
        - name: logs
          mountPath: /app/logs
      volumes:
      - name: logs
        emptyDir: {}
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchLabels:
                  app: orchestra
              topologyKey: kubernetes.io/hostname
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: orchestra-hpa
  namespace: orchestra
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: orchestra
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 50
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 100
        periodSeconds: 60
```

### 4.4 Service 和 Ingress

```yaml
# k8s/service.yml
apiVersion: v1
kind: Service
metadata:
  name: orchestra
  namespace: orchestra
  labels:
    app: orchestra
spec:
  type: ClusterIP
  ports:
  - port: 80
    targetPort: 3000
    protocol: TCP
    name: http
  selector:
    app: orchestra

---
# k8s/ingress.yml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: orchestra-ingress
  namespace: orchestra
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "60"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - orchestra.example.com
    secretName: orchestra-tls
  rules:
  - host: orchestra.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: orchestra
            port:
              number: 80
```

## 5. 环境变量配置

### 5.1 完整环境变量列表

```bash
# .env.example

# ==================== 应用配置 ====================
NODE_ENV=production
PORT=3000
INSTANCE_ID=orchestra-1
INSTANCE_ROLE=hybrid  # primary | replica | worker | hybrid

# ==================== 数据库配置 ====================
DATABASE_URL=postgresql://user:password@host:5432/database
DATABASE_POOL_MIN=5
DATABASE_POOL_MAX=20
DATABASE_CONNECTION_TIMEOUT=10000

# ==================== Redis 配置 ====================
REDIS_URL=redis://:password@host:6379
REDIS_POOL_MIN=5
REDIS_POOL_MAX=20
REDIS_COMMAND_TIMEOUT=5000

# ==================== RabbitMQ 配置 ====================
RABBITMQ_URL=amqp://user:password@host:5672/vhost
RABBITMQ_PREFETCH=10
RABBITMQ_RECONNECT_INTERVAL=5000

# ==================== 安全配置 ====================
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=24h
ENCRYPTION_KEY=your_encryption_key_32_bytes
CORS_ORIGINS=https://example.com

# ==================== 日志配置 ====================
LOG_LEVEL=info
LOG_FORMAT=json
LOG_OUTPUT=stdout

# ==================== 监控配置 ====================
METRICS_ENABLED=true
METRICS_PORT=9090
TRACING_ENABLED=true
TRACING_ENDPOINT=http://jaeger:14268/api/traces

# ==================== Worker 配置 ====================
WORKER_CONCURRENCY=10
WORKER_TIMEOUT=3600000
HEARTBEAT_INTERVAL=5000
MAX_RETRIES=3

# ==================== 缓存配置 ====================
CACHE_ENABLED=true
CACHE_TTL=300
CACHE_PREFIX=orchestra:cache:
```

### 5.2 环境特定配置

```bash
# .env.development
NODE_ENV=development
LOG_LEVEL=debug
DATABASE_URL=postgresql://localhost:5432/orchestra_dev
REDIS_URL=redis://localhost:6379
RABBITMQ_URL=amqp://localhost:5672
WORKER_CONCURRENCY=2

# .env.staging
NODE_ENV=staging
LOG_LEVEL=info
DATABASE_URL=postgresql://staging-db:5432/orchestra
REDIS_URL=redis://staging-redis:6379
RABBITMQ_URL=amqp://staging-rabbitmq:5672
WORKER_CONCURRENCY=5
INSTANCE_COUNT=2

# .env.production
NODE_ENV=production
LOG_LEVEL=warn
DATABASE_URL=postgresql://prod-db:5432/orchestra
REDIS_URL=redis://prod-redis-cluster:6379
RABBITMQ_URL=amqp://prod-rabbitmq-cluster:5672
WORKER_CONCURRENCY=10
INSTANCE_COUNT=5
```

## 6. 监控与告警

### 6.1 Prometheus 配置

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'orchestra'
    static_configs:
      - targets: ['orchestra-1:3000', 'orchestra-2:3000', 'orchestra-3:3000']
    metrics_path: '/metrics'
    
  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']
      
  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']
      
  - job_name: 'rabbitmq'
    static_configs:
      - targets: ['rabbitmq-exporter:9419']
```

### 6.2 Grafana 仪表板

导入以下仪表板 ID：
- Orchestra 应用监控：自定义
- PostgreSQL 监控：9628
- Redis 监控：763
- RabbitMQ 监控：10991
- Node.js 应用监控：11159

### 6.3 告警规则

```yaml
# alerting-rules.yml
groups:
  - name: orchestra
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "高错误率"
          description: "错误率超过 10%"
          
      - alert: HighLatency
        expr: histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m])) > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "高延迟"
          description: "P99 延迟超过 1 秒"
          
      - alert: InstanceDown
        expr: up{job="orchestra"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "实例宕机"
          description: "{{ $labels.instance }} 已宕机"
          
      - alert: QueueBacklog
        expr: rabbitmq_queue_messages > 10000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "队列积压"
          description: "队列 {{ $labels.queue }} 积压超过 10000 条消息"
```

## 7. 运维手册

### 7.1 日常运维命令

```bash
# 查看实例状态
curl http://localhost:3000/health

# 查看 Worker 状态
curl http://localhost:3000/api/workers

# 查看任务队列
curl http://localhost:3000/api/tasks/queue

# 重启实例
docker-compose restart orchestra

# 查看日志
docker-compose logs -f orchestra

# 扩展实例
docker-compose up -d --scale orchestra=5
```

### 7.2 故障排查

```bash
# 检查数据库连接
docker-compose exec postgres pg_isready -U orchestra

# 检查 Redis 连接
docker-compose exec redis redis-cli ping

# 检查 RabbitMQ 连接
docker-compose exec rabbitmq rabbitmq-diagnostics -q ping

# 查看容器资源使用
docker stats orchestra-*

# 查看事件日志
kubectl get events -n orchestra --sort-by='.lastTimestamp'
```

### 7.3 备份与恢复

```bash
# 数据库备份
pg_dump -h localhost -U orchestra orchestra > backup_$(date +%Y%m%d).sql

# Redis 备份
docker-compose exec redis redis-cli BGSAVE

# RabbitMQ 备份
docker-compose exec rabbitmq rabbitmqadmin export backup.json

# 数据库恢复
psql -h localhost -U orchestra orchestra < backup_20260403.sql
```

## 8. 性能基准

### 8.1 单实例性能

| 指标 | 目标值 | 测量方法 |
|------|--------|----------|
| 请求延迟 (P50) | < 50ms | ab -n 10000 -c 100 |
| 请求延迟 (P99) | < 200ms | ab -n 10000 -c 100 |
| 吞吐量 | > 1000 req/s | ab -n 10000 -c 100 |
| Worker 任务处理 | > 100 task/s | 内部基准测试 |
| 内存使用 | < 1GB | 稳定状态 |

### 8.2 扩展性测试

| 实例数 | 总吞吐量 | 线性度 |
|--------|----------|--------|
| 1 | 1000 req/s | 100% |
| 2 | 1900 req/s | 95% |
| 3 | 2800 req/s | 93% |
| 5 | 4500 req/s | 90% |

---

**文档版本**: 1.0  
**创建日期**: 2026-04-03  
**作者**: AI 后端架构师  
**状态**: 设计稿
