# Orchestra 部署指南

**版本**: v1.2.0  
**最后更新**: 2026-04-19

---

## 一、快速部署（单机）

### 1. 安装

```bash
git clone https://github.com/JingWang-Star996/orchestra.git
cd orchestra
npm install
```

### 2. 环境变量

```bash
export ORCHESTRA_API_KEY="sk-你的APIKey"
export ORCHESTRA_MODEL="qwen3.5-plus"
```

### 3. 启动

```bash
# 基础模式
node index.js

# Gateway 模式（推荐）
node gateway.js

# 带 Dashboard
node start-dashboard.js
```

### 4. 访问 Dashboard

打开浏览器访问 `http://localhost:3000`，查看 Worker 状态、任务进度、性能指标。

---

## 二、分布式部署（多实例）

### 架构

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  实例 A      │────▶│  MessageBus │◀────│  实例 B      │
│  (主节点)    │     │  (消息总线)  │     │  (工作节点)  │
└─────────────┘     └─────────────┘     └─────────────┘
       │                    │                    │
       ▼                    ▼                    ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ NodeRegistry│     │  StateSync  │     │ NodeRegistry│
└─────────────┘     └─────────────┘     └─────────────┘
```

### 1. 配置节点

```javascript
const { createRuntime } = require('./distributed');

// 主节点
const runtime = createRuntime({
  nodeId: 'node-1',
  role: 'master',
  storagePath: './data',
  heartbeatInterval: 5000,
});

// 工作节点
const worker = createRuntime({
  nodeId: 'node-2',
  role: 'worker',
  masterUrl: 'http://master-host:3000',
  storagePath: './data',
  heartbeatInterval: 5000,
});
```

### 2. 消息总线

```javascript
const { MessageBus } = require('./distributed');

const bus = new MessageBus({
  storagePath: './data/messages',
  pollInterval: 1000,
});

// 订阅
bus.subscribe('task.completed', (msg) => {
  console.log('Task done:', msg);
});

// 发布
bus.publish('task.started', { taskId: 'xxx', nodeId: 'node-1' });
```

### 3. 状态同步

```javascript
const { StateSync } = require('./distributed');

const sync = new StateSync({
  nodeId: 'node-1',
  storagePath: './data/state',
  syncInterval: 10000,
});

// 同步数据
await sync.set('scratchpad:research', { files: [...] });
await sync.sync(); // 触发跨节点同步
```

---

## 三、环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ORCHESTRA_API_KEY` | API 密钥 | 必填 |
| `ORCHESTRA_MODEL` | AI 模型 | `qwen3.5-plus` |
| `ORCHESTRA_PORT` | 服务端口 | `3000` |
| `ORCHESTRA_NODE_ID` | 节点 ID | `node-1` |
| `ORCHESTRA_ROLE` | 节点角色 | `master` |
| `ORCHESTRA_STORAGE` | 存储路径 | `./data` |
| `ORCHESTRA_MAX_WORKERS` | 最大 Worker 数 | `10` |

---

## 四、监控设置

### Dashboard 配置

编辑 `dashboard/config.js`：

```javascript
module.exports = {
  port: 3000,
  refreshInterval: 5000,
  alertThresholds: {
    errorRate: 0.1,
    responseTime: 5000,
    memoryUsage: 0.8,
  },
};
```

### 告警规则

```javascript
const { AlertsManager } = require('./dashboard/alerts');

const alerts = new AlertsManager();
alerts.addRule({
  name: 'high-error-rate',
  condition: (metrics) => metrics.errorRate > 0.1,
  action: () => console.log('告警：错误率过高！'),
});
```

---

## 五、生产环境建议

1. **使用 PM2 管理进程**：`pm2 start gateway.js`
2. **日志轮转**：配置 `logrotate` 处理日志文件
3. **反向代理**：使用 Nginx 代理 Dashboard
4. **数据备份**：定期备份 `data/` 目录
5. **健康检查**：配置 `/health` 端点监控

---

## 六、故障排查

| 问题 | 原因 | 解决 |
|------|------|------|
| Dashboard 无法连接 | 端口冲突 | 修改 `ORCHESTRA_PORT` |
| 节点无法注册 | 网络不通 | 检查防火墙/安全组 |
| 状态同步延迟 | 同步间隔太长 | 减小 `syncInterval` |
| 内存占用过高 | Worker 过多 | 降低 `maxWorkers` |

---

**部署完成，开始使用 Orchestra！**
