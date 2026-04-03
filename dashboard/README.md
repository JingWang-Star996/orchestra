# Orchestra 监控 Dashboard - 设计文档

## 1. 架构概述

### 1.1 技术栈
- **前端**: HTML5 + CSS3 + Vanilla JavaScript (无依赖，轻量级)
- **后端 API**: Node.js Express (集成到 Gateway)
- **实时通信**: WebSocket + HTTP Polling 降级方案
- **数据存储**: 内存缓存 + 文件持久化

### 1.2 系统架构
```
┌─────────────────────────────────────────────────────────┐
│                    Gateway Server                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │  HTTP API   │  │  WebSocket  │  │  Metrics Collector │
│  │  Endpoints  │  │   Server    │  │                 │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                   Dashboard Frontend                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │  Overview   │  │   Workers   │  │    Alerts       │  │
│  │   Panel     │  │   Status    │  │    System       │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## 2. 功能模块

### 2.1 实时监控面板 (Overview Panel)
- 系统运行时间
- 活跃 Worker 数量
- 任务处理速率 (tasks/min)
- 错误率统计
- CPU/内存使用率

### 2.2 Worker 状态可视化 (Workers Status)
- Worker 列表 (表格形式)
- 每个 Worker 的状态指示器 (运行/停止/错误)
- 当前任务负载
- 最后心跳时间
- 历史性能图表

### 2.3 性能指标收集 (Metrics Collection)
- 任务执行时间分布
- API 响应时间
- 队列长度趋势
- 错误类型统计
- 资源使用趋势

### 2.4 告警系统 (Alert System)
- 阈值配置 (CPU、内存、错误率)
- 实时告警通知
- 告警历史记录
- 告警级别 (警告/严重/紧急)

## 3. API 接口设计

### 3.1 RESTful Endpoints

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/dashboard/overview` | 获取系统概览数据 |
| GET | `/api/dashboard/workers` | 获取所有 Worker 状态 |
| GET | `/api/dashboard/metrics` | 获取性能指标 |
| GET | `/api/dashboard/alerts` | 获取告警列表 |
| POST | `/api/dashboard/alerts/config` | 更新告警配置 |
| WS | `/ws/dashboard` | WebSocket 实时推送 |

### 3.2 数据格式

#### Overview Response
```json
{
  "uptime": 86400,
  "activeWorkers": 5,
  "totalWorkers": 8,
  "tasksPerMinute": 120,
  "errorRate": 0.02,
  "cpuUsage": 45.5,
  "memoryUsage": 62.3,
  "timestamp": 1712131200000
}
```

#### Worker Status Response
```json
{
  "workers": [
    {
      "id": "worker-001",
      "name": "Worker-1",
      "status": "running",
      "currentTask": "task-123",
      "completedTasks": 1520,
      "failedTasks": 12,
      "lastHeartbeat": 1712131200000,
      "cpuUsage": 35.2,
      "memoryUsage": 512
    }
  ]
}
```

## 4. 前端页面结构

### 4.1 页面布局
```
┌────────────────────────────────────────────────────┐
│  Orchestra Dashboard                    [Refresh]  │
├────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ Uptime   │  │ Workers  │  │ Tasks/m  │        │
│  │ 24h 0m   │  │  5/8     │  │   120    │        │
│  └──────────┘  └──────────┘  └──────────┘        │
├────────────────────────────────────────────────────┤
│  Worker Status              │  Performance Metrics │
│  ┌────────────────────┐     │  ┌────────────────┐ │
│  │ Worker-1  🟢 Running│     │  │   CPU Usage    │ │
│  │ Worker-2  🟢 Running│     │  │   [Chart]      │ │
│  │ Worker-3  🔴 Error  │     │  └────────────────┘ │
│  │ Worker-4  🟡 Idle   │     │  ┌────────────────┐ │
│  └────────────────────┘     │  │   Memory       │ │
│                             │  │   [Chart]      │ │
│                             │  └────────────────┘ │
├────────────────────────────────────────────────────┤
│  Recent Alerts                                     │
│  ┌─────────────────────────────────────────────┐  │
│  │ ⚠️  Worker-3 high error rate (18:15)       │  │
│  │ 🔴  Memory usage > 80% (17:42)             │  │
│  └─────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────┘
```

### 4.2 颜色规范
- 🟢 运行中：`#22c55e` (green-500)
- 🟡 空闲/警告：`#eab308` (yellow-500)
- 🔴 错误/停止：`#ef4444` (red-500)
- 🔵 信息：`#3b82f6` (blue-500)

## 5. 实时更新策略

### 5.1 WebSocket 优先
- 建立持久连接
- 服务器推送状态变更
- 断线自动重连 (指数退避)

### 5.2 HTTP Polling 降级
- 当 WebSocket 不可用时启用
- 默认轮询间隔：5 秒
- 可配置轮询频率

## 6. 告警规则

| 指标 | 警告阈值 | 严重阈值 | 紧急阈值 |
|------|---------|---------|---------|
| CPU 使用率 | > 70% | > 85% | > 95% |
| 内存使用率 | > 75% | > 85% | > 95% |
| 错误率 | > 5% | > 10% | > 20% |
| Worker 离线 | > 1 个 | > 3 个 | > 50% |
| 响应时间 | > 500ms | > 1000ms | > 3000ms |

## 7. 安全考虑

- API 访问需要认证 Token
- WebSocket 连接需要鉴权
- 敏感数据脱敏显示
- 速率限制防止滥用

## 8. 扩展性

- 支持自定义指标插件
- 可配置告警通知渠道 (邮件/钉钉/飞书)
- 支持多实例监控
- 数据导出功能 (CSV/JSON)

## 9. 文件结构

```
dashboard/
├── README.md           # 设计文档
├── index.html          # 主页面
├── style.css           # 样式表
├── app.js              # 前端逻辑
├── api.js              # API 客户端
├── server.js           # 后端 API 服务
├── metrics.js          # 指标收集器
├── alerts.js           # 告警系统
└── config.js           # 配置文件
```

## 10. 集成步骤

1. 将 `server.js` 集成到 Gateway 路由
2. 配置 WebSocket 处理器
3. 添加 Metrics Collector 到 Worker 循环
4. 部署前端静态文件
5. 配置访问权限控制
6. 设置告警通知渠道

---

**版本**: 1.0  
**作者**: AI CTO  
**日期**: 2026-04-03  
**状态**: P2-1 开发中
