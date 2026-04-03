/**
 * Orchestra Dashboard - 集成指南
 * 
 * 本文档说明如何将 Dashboard 集成到现有 Gateway
 */

// ============================================================
// 1. Gateway 集成示例 (伪代码)
// ============================================================

/*
// 在你的 Gateway 主文件中添加:

const DashboardServer = require('./dashboard/server');

class Gateway {
    constructor() {
        this.dashboard = null;
        this.workers = new Map();
    }

    async start() {
        // 启动 Gateway 其他服务...
        
        // 启动 Dashboard
        this.dashboard = new DashboardServer({
            port: 8080, // 或者使用 Gateway 的端口
            dataDir: '/path/to/data',
        });
        
        // 如果 Dashboard 使用独立端口
        this.dashboard.start();
        
        // 或者集成到现有 HTTP 服务器:
        // this.dashboard.attachToServer(this.httpServer);
        
        // 定期同步 Worker 状态
        setInterval(() => {
            this.syncWorkerStatus();
        }, 5000);
    }

    syncWorkerStatus() {
        const workers = Array.from(this.workers.values()).map(w => ({
            id: w.id,
            name: w.name,
            status: w.status,
            currentTask: w.currentTask?.id || null,
            completedTasks: w.stats.completed,
            failedTasks: w.stats.failed,
            lastHeartbeat: w.lastHeartbeat,
            cpuUsage: w.metrics.cpu,
            memoryUsage: w.metrics.memory,
        }));
        
        this.dashboard.updateWorkers(workers);
    }

    onWorkerUpdate(worker) {
        this.dashboard.addWorker({
            id: worker.id,
            name: worker.name,
            status: worker.status,
            // ... 其他字段
        });
    }

    onWorkerRemove(workerId) {
        this.dashboard.removeWorker(workerId);
    }

    onTaskComplete(success) {
        this.dashboard.recordTask(success);
    }
}
*/

// ============================================================
// 2. API 路由集成 (Express 示例)
// ============================================================

/*
const express = require('express');
const router = express.Router();

// Dashboard 数据源
let dashboardData = {
    overview: { ... },
    workers: [ ... ],
    metrics: { ... },
    alerts: { ... },
};

// GET /api/dashboard/overview
router.get('/dashboard/overview', (req, res) => {
    res.json({
        uptime: process.uptime(),
        activeWorkers: workers.filter(w => w.active).length,
        totalWorkers: workers.length,
        tasksPerMinute: metrics.tasksPerMinute,
        errorRate: metrics.errorRate,
        cpuUsage: metrics.cpu,
        memoryUsage: metrics.memory,
    });
});

// GET /api/dashboard/workers
router.get('/dashboard/workers', (req, res) => {
    res.json({
        workers: workers.map(w => ({
            id: w.id,
            name: w.name,
            status: w.status,
            currentTask: w.currentTask,
            completedTasks: w.completedTasks,
            failedTasks: w.failedTasks,
            lastHeartbeat: w.lastHeartbeat,
            cpuUsage: w.cpuUsage,
            memoryUsage: w.memoryUsage,
        })),
    });
});

// GET /api/dashboard/metrics
router.get('/dashboard/metrics', (req, res) => {
    const timeRange = req.query.timeRange || '1h';
    res.json({
        cpuHistory: metrics.history.cpu.slice(-60),
        memoryHistory: metrics.history.memory.slice(-60),
        tasksHistory: metrics.history.tasks.slice(-60),
    });
});

// GET /api/dashboard/alerts
router.get('/dashboard/alerts', (req, res) => {
    res.json({
        recent: alerts.recent.slice(0, 20),
        config: alerts.config,
    });
});

// POST /api/dashboard/alerts/config
router.post('/dashboard/alerts/config', (req, res) => {
    alerts.config = { ...alerts.config, ...req.body };
    res.json({ success: true, config: alerts.config });
});

module.exports = router;
*/

// ============================================================
// 3. WebSocket 集成示例
// ============================================================

/*
const WebSocket = require('ws');

class DashboardWebSocket {
    constructor(server) {
        this.wss = new WebSocket.Server({ 
            server,
            path: '/ws/dashboard'
        });
        
        this.clients = new Set();
        
        this.wss.on('connection', (ws) => {
            this.clients.add(ws);
            
            // 发送初始数据
            ws.send(JSON.stringify(this.getFullState()));
            
            ws.on('close', () => {
                this.clients.delete(ws);
            });
        });
    }

    broadcast(data) {
        const message = JSON.stringify(data);
        this.clients.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(message);
            }
        });
    }

    onWorkerUpdate(workers) {
        this.broadcast({ workers });
    }

    onMetricsUpdate(metrics) {
        this.broadcast({ metrics });
    }

    onAlert(alert) {
        this.broadcast({ alerts: { recent: [alert] } });
    }
}
*/

// ============================================================
// 4. Worker 状态上报
// ============================================================

/*
// 在 Worker 中添加状态上报:

class Worker {
    constructor(id, options) {
        this.id = id;
        this.dashboard = options.dashboard;
        this.metrics = {
            cpu: 0,
            memory: 0,
            tasksCompleted: 0,
            tasksFailed: 0,
        };
    }

    async start() {
        // 定期上报状态
        setInterval(() => {
            this.reportStatus();
        }, 5000);
    }

    reportStatus() {
        this.dashboard?.addWorker({
            id: this.id,
            name: this.name,
            status: this.status,
            currentTask: this.currentTask?.id,
            completedTasks: this.metrics.tasksCompleted,
            failedTasks: this.metrics.tasksFailed,
            lastHeartbeat: Date.now(),
            cpuUsage: this.getCPUUsage(),
            memoryUsage: this.getMemoryUsage(),
        });
    }

    onTaskComplete(success) {
        if (success) {
            this.metrics.tasksCompleted++;
        } else {
            this.metrics.tasksFailed++;
        }
        this.dashboard?.recordTask(success);
    }
}
*/

// ============================================================
// 5. 指标收集器
// ============================================================

/*
class MetricsCollector {
    constructor(options = {}) {
        this.interval = options.interval || 5000;
        this.historySize = options.historySize || 360; // 1 小时
        this.dashboard = options.dashboard;
        
        this.history = {
            cpu: [],
            memory: [],
            tasks: [],
            errors: [],
        };
        
        this.start();
    }

    start() {
        this.timer = setInterval(() => {
            this.collect();
        }, this.interval);
    }

    stop() {
        clearInterval(this.timer);
    }

    collect() {
        const metrics = {
            cpu: this.getCPUUsage(),
            memory: this.getMemoryUsage(),
            tasks: this.getTasksPerMinute(),
        };

        // 添加到历史
        this.history.cpu.push(metrics.cpu);
        this.history.memory.push(metrics.memory);
        this.history.tasks.push(metrics.tasks);

        // 限制长度
        Object.keys(this.history).forEach(key => {
            if (this.history[key].length > this.historySize) {
                this.history[key].shift();
            }
        });

        // 上报到 Dashboard
        this.dashboard?.updateMetrics({
            cpuHistory: this.history.cpu.slice(-10),
            memoryHistory: this.history.memory.slice(-10),
            tasksHistory: this.history.tasks.slice(-10),
        });
    }

    getCPUUsage() {
        // 实现 CPU 使用率获取
        return 0;
    }

    getMemoryUsage() {
        const usage = process.memoryUsage();
        return (usage.heapUsed / usage.heapTotal) * 100;
    }

    getTasksPerMinute() {
        // 实现任务速率计算
        return 0;
    }
}
*/

// ============================================================
// 6. 告警系统集成
// ============================================================

/*
class AlertSystem {
    constructor(options = {}) {
        this.dashboard = options.dashboard;
        this.config = {
            cpuWarningThreshold: 70,
            cpuCriticalThreshold: 85,
            cpuEmergencyThreshold: 95,
            memWarningThreshold: 75,
            memCriticalThreshold: 85,
            memEmergencyThreshold: 95,
            errorRateThreshold: 5,
            workerOfflineThreshold: 300000, // 5 分钟
        };
        
        this.recentAlerts = new Map(); // 防止重复告警
    }

    check(metrics, workers) {
        // CPU 检查
        if (metrics.cpu > this.config.cpuEmergencyThreshold) {
            this.send('emergency', `CPU 使用率紧急：${metrics.cpu.toFixed(1)}%`);
        } else if (metrics.cpu > this.config.cpuCriticalThreshold) {
            this.send('critical', `CPU 使用率严重：${metrics.cpu.toFixed(1)}%`);
        } else if (metrics.cpu > this.config.cpuWarningThreshold) {
            this.send('warning', `CPU 使用率警告：${metrics.cpu.toFixed(1)}%`);
        }

        // 内存检查
        if (metrics.memory > this.config.memEmergencyThreshold) {
            this.send('emergency', `内存使用率紧急：${metrics.memory.toFixed(1)}%`);
        } else if (metrics.memory > this.config.memCriticalThreshold) {
            this.send('critical', `内存使用率严重：${metrics.memory.toFixed(1)}%`);
        } else if (metrics.memory > this.config.memWarningThreshold) {
            this.send('warning', `内存使用率警告：${metrics.memory.toFixed(1)}%`);
        }

        // Worker 离线检查
        const offlineWorkers = workers.filter(w => 
            Date.now() - w.lastHeartbeat > this.config.workerOfflineThreshold
        );
        
        if (offlineWorkers.length > 0) {
            this.send('critical', `${offlineWorkers.length} 个 Worker 离线`);
        }
    }

    send(level, message) {
        // 防止重复告警 (5 分钟内相同消息)
        const key = `${level}:${message}`;
        if (this.recentAlerts.has(key)) {
            return;
        }

        const alert = {
            id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            level,
            message,
            timestamp: Date.now(),
        };

        this.recentAlerts.set(key, alert);
        setTimeout(() => this.recentAlerts.delete(key), 300000);

        // 发送到 Dashboard
        this.dashboard?.addAlert(alert);

        // 发送通知 (邮件/钉钉/飞书等)
        this.sendNotification(alert);
    }

    sendNotification(alert) {
        // 实现通知发送逻辑
        console.log(`[Alert] ${alert.level}: ${alert.message}`);
    }
}
*/

// ============================================================
// 7. 完整集成示例
// ============================================================

/*
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const DashboardServer = require('./dashboard/server');

class IntegratedGateway {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.wss = new WebSocket.Server({ server: this.server });
        
        this.dashboard = new DashboardServer({
            port: 8080,
        });
        
        this.workers = new Map();
        this.metrics = {
            tasksPerMinute: 0,
            errorRate: 0,
            history: {
                cpu: [],
                memory: [],
                tasks: [],
            },
        };
        
        this.alerts = {
            recent: [],
            config: {},
        };
    }

    async start() {
        // 启动 Dashboard
        this.dashboard.start();

        // 设置 API 路由
        this.setupRoutes();

        // 设置 WebSocket
        this.setupWebSocket();

        // 启动指标收集
        this.startMetricsCollection();

        // 启动 HTTP 服务器
        this.server.listen(3000, () => {
            console.log('Gateway listening on :3000');
            console.log('Dashboard available at http://localhost:8080');
        });
    }

    setupRoutes() {
        // Dashboard API 代理
        this.app.get('/api/dashboard/overview', (req, res) => {
            res.json(this.dashboard.getOverview());
        });

        this.app.get('/api/dashboard/workers', (req, res) => {
            res.json({ workers: Array.from(this.workers.values()) });
        });

        // 静态文件
        this.app.use(express.static('./dashboard'));
    }

    setupWebSocket() {
        this.wss.on('connection', (ws) => {
            // 发送初始数据
            ws.send(JSON.stringify({
                overview: this.dashboard.getOverview(),
                workers: Array.from(this.workers.values()),
            }));

            ws.on('close', () => {
                // 清理
            });
        });
    }

    startMetricsCollection() {
        setInterval(() => {
            this.collectMetrics();
            this.broadcastUpdate();
        }, 5000);
    }

    collectMetrics() {
        const cpu = process.cpuUsage();
        const mem = process.memoryUsage();
        
        this.metrics.history.cpu.push((cpu.user / 1000000) % 100);
        this.metrics.history.memory.push((mem.heapUsed / mem.heapTotal) * 100);
        
        // 限制历史长度
        if (this.metrics.history.cpu.length > 360) {
            this.metrics.history.cpu.shift();
            this.metrics.history.memory.shift();
        }
    }

    broadcastUpdate() {
        const data = {
            overview: this.dashboard.getOverview(),
            workers: Array.from(this.workers.values()),
            metrics: {
                cpuHistory: this.metrics.history.cpu.slice(-10),
                memoryHistory: this.metrics.history.memory.slice(-10),
            },
        };

        this.wss.clients.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(data));
            }
        });
    }
}

// 启动
const gateway = new IntegratedGateway();
gateway.start();
*/

// ============================================================
// 8. 环境变量配置
// ============================================================

/*
// .env 文件示例:

# Dashboard 配置
DASHBOARD_PORT=8080
DASHBOARD_HOST=localhost
DASHBOARD_DATA_DIR=/var/lib/orchestra/dashboard

# 告警配置
ALERT_CPU_WARNING=70
ALERT_CPU_CRITICAL=85
ALERT_MEMORY_WARNING=75
ALERT_MEMORY_CRITICAL=85
ALERT_ERROR_RATE=5

# 通知配置
ALERT_EMAIL_ENABLED=false
ALERT_EMAIL_TO=admin@example.com
ALERT_DINGTALK_WEBHOOK=
ALERT_FEISHU_WEBHOOK=

# WebSocket 配置
WS_HEARTBEAT_INTERVAL=30000
WS_MAX_CLIENTS=100
*/

module.exports = {
    // 导出集成示例供参考
    integrationExamples: 'See comments above',
};
