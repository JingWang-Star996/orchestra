/**
 * Orchestra Dashboard - Backend API Server
 * 可集成到 Gateway 的监控 API 服务
 * 
 * 使用方式:
 * 1. 作为独立服务运行
 * 2. 集成到现有 Gateway (推荐)
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

class DashboardServer {
    constructor(options = {}) {
        this.port = options.port || 8080;
        this.dataDir = options.dataDir || path.join(__dirname, 'data');
        
        // 数据存储
        this.state = {
            overview: {
                uptime: 0,
                startTime: Date.now(),
                activeWorkers: 0,
                totalWorkers: 0,
                tasksPerMinute: 0,
                errorRate: 0,
                cpuUsage: 0,
                memoryUsage: 0,
            },
            workers: [],
            metrics: {
                cpuHistory: [],
                memoryHistory: [],
                tasksHistory: [],
            },
            alerts: {
                recent: [],
                config: {
                    cpuWarningThreshold: 70,
                    memWarningThreshold: 75,
                    errorRateThreshold: 5,
                },
            },
        };

        // WebSocket 客户端
        this.wsClients = new Set();
        
        // 指标收集间隔
        this.metricsInterval = 5000;
        this.metricsTimer = null;

        // 确保数据目录存在
        this.ensureDataDir();
    }

    ensureDataDir() {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }

    // 启动服务
    start() {
        // 创建 HTTP 服务器
        this.httpServer = http.createServer((req, res) => {
            this.handleRequest(req, res);
        });

        // 创建 WebSocket 服务器
        this.wsServer = new WebSocket.Server({ 
            server: this.httpServer,
            path: '/ws/dashboard'
        });

        this.wsServer.on('connection', (ws) => {
            this.handleWebSocketConnection(ws);
        });

        // 启动指标收集
        this.startMetricsCollection();

        // 启动 HTTP 服务器
        this.httpServer.listen(this.port, () => {
            console.log(`[DashboardServer] Listening on http://localhost:${this.port}`);
            console.log(`[DashboardServer] WebSocket: ws://localhost:${this.port}/ws/dashboard`);
        });

        // 加载持久化数据
        this.loadState();
    }

    // 停止服务
    stop() {
        if (this.metricsTimer) {
            clearInterval(this.metricsTimer);
        }
        
        this.wsClients.forEach(ws => ws.close());
        this.wsServer.close();
        this.httpServer.close();
        
        // 保存状态
        this.saveState();
        
        console.log('[DashboardServer] Stopped');
    }

    // HTTP 请求处理
    async handleRequest(req, res) {
        const url = new URL(req.url, `http://localhost:${this.port}`);
        const pathname = url.pathname;

        // CORS 头
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        // API 路由
        if (pathname.startsWith('/api/dashboard')) {
            try {
                const data = await this.handleAPI(pathname, url, req);
                this.sendJSON(res, data);
            } catch (error) {
                console.error('[DashboardServer] API Error:', error);
                this.sendJSON(res, { error: error.message }, 500);
            }
            return;
        }

        // 静态文件服务
        if (pathname === '/' || pathname === '/index.html') {
            this.serveFile(res, path.join(__dirname, 'index.html'), 'text/html');
            return;
        }

        if (pathname === '/style.css') {
            this.serveFile(res, path.join(__dirname, 'style.css'), 'text/css');
            return;
        }

        if (pathname === '/app.js') {
            this.serveFile(res, path.join(__dirname, 'app.js'), 'application/javascript');
            return;
        }

        if (pathname === '/api.js') {
            this.serveFile(res, path.join(__dirname, 'api.js'), 'application/javascript');
            return;
        }

        // 404
        res.writeHead(404);
        res.end('Not Found');
    }

    // API 处理
    async handleAPI(pathname, url, req) {
        // GET /api/dashboard/overview
        if (pathname === '/api/dashboard/overview') {
            return this.getOverview();
        }

        // GET /api/dashboard/workers
        if (pathname === '/api/dashboard/workers') {
            return { workers: this.state.workers };
        }

        // GET /api/dashboard/metrics
        if (pathname === '/api/dashboard/metrics') {
            const timeRange = url.searchParams.get('timeRange') || '1h';
            return this.getMetrics(timeRange);
        }

        // GET /api/dashboard/alerts
        if (pathname === '/api/dashboard/alerts') {
            return { 
                recent: this.state.alerts.recent,
                config: this.state.alerts.config,
            };
        }

        // POST /api/dashboard/alerts/config
        if (pathname === '/api/dashboard/alerts/config' && req.method === 'POST') {
            const body = await this.readBody(req);
            return this.updateAlertConfig(body);
        }

        // GET /api/dashboard (完整数据)
        if (pathname === '/api/dashboard') {
            return {
                overview: this.getOverview(),
                workers: this.state.workers,
                metrics: this.getMetrics('1h'),
                alerts: {
                    recent: this.state.alerts.recent,
                    config: this.state.alerts.config,
                },
            };
        }

        throw new Error('Not Found');
    }

    // WebSocket 连接处理
    handleWebSocketConnection(ws) {
        this.wsClients.add(ws);
        console.log('[DashboardServer] WebSocket client connected');

        // 发送初始数据
        ws.send(JSON.stringify({
            overview: this.getOverview(),
            workers: this.state.workers,
            metrics: this.getMetrics('1h'),
            alerts: { recent: this.state.alerts.recent },
        }));

        ws.on('close', () => {
            this.wsClients.delete(ws);
            console.log('[DashboardServer] WebSocket client disconnected');
        });

        ws.on('error', (error) => {
            console.error('[DashboardServer] WebSocket error:', error);
            this.wsClients.delete(ws);
        });
    }

    // 广播数据到所有 WebSocket 客户端
    broadcast(data) {
        const message = JSON.stringify(data);
        this.wsClients.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(message);
            }
        });
    }

    // 获取概览数据
    getOverview() {
        const now = Date.now();
        this.state.overview.uptime = Math.floor((now - this.state.overview.startTime) / 1000);
        
        // 从 workers 计算活跃数量
        const activeWorkers = this.state.workers.filter(w => 
            w.status === 'running' || w.status === 'active'
        ).length;
        
        this.state.overview.activeWorkers = activeWorkers;
        this.state.overview.totalWorkers = this.state.workers.length;

        return { ...this.state.overview, timestamp: now };
    }

    // 获取指标数据
    getMetrics(timeRange) {
        // 根据时间范围返回适当的数据点
        const maxPoints = 60; // 最多返回 60 个点
        const data = {
            cpuHistory: this.state.metrics.cpuHistory.slice(-maxPoints),
            memoryHistory: this.state.metrics.memoryHistory.slice(-maxPoints),
            tasksHistory: this.state.metrics.tasksHistory.slice(-maxPoints),
        };
        return data;
    }

    // 更新告警配置
    updateAlertConfig(config) {
        this.state.alerts.config = {
            ...this.state.alerts.config,
            ...config,
        };
        this.saveState();
        return { success: true, config: this.state.alerts.config };
    }

    // 指标收集
    startMetricsCollection() {
        this.metricsTimer = setInterval(() => {
            this.collectMetrics();
            this.checkAlerts();
        }, this.metricsInterval);
    }

    collectMetrics() {
        const now = Date.now();
        
        // 模拟系统指标 (实际应该从系统获取)
        const cpuUsage = Math.random() * 30 + 20; // 20-50%
        const memoryUsage = Math.random() * 20 + 40; // 40-60%
        const tasksPerMinute = Math.floor(Math.random() * 50 + 100); // 100-150

        // 更新概览
        this.state.overview.cpuUsage = cpuUsage;
        this.state.overview.memoryUsage = memoryUsage;
        this.state.overview.tasksPerMinute = tasksPerMinute;

        // 添加到历史
        this.state.metrics.cpuHistory.push(cpuUsage);
        this.state.metrics.memoryHistory.push(memoryUsage);
        this.state.metrics.tasksHistory.push(tasksPerMinute);

        // 限制历史数据长度
        const maxHistory = 360; // 1 小时 (5 秒间隔)
        if (this.state.metrics.cpuHistory.length > maxHistory) {
            this.state.metrics.cpuHistory.shift();
            this.state.metrics.memoryHistory.shift();
            this.state.metrics.tasksHistory.shift();
        }

        // 广播更新
        this.broadcast({
            overview: this.getOverview(),
            metrics: {
                cpuHistory: this.state.metrics.cpuHistory.slice(-10),
                memoryHistory: this.state.metrics.memoryHistory.slice(-10),
                tasksHistory: this.state.metrics.tasksHistory.slice(-10),
            },
        });

        // 定期保存
        if (now % 60000 < this.metricsInterval) {
            this.saveState();
        }
    }

    // 告警检查
    checkAlerts() {
        const config = this.state.alerts.config;
        const overview = this.state.overview;

        // CPU 告警
        if (overview.cpuUsage > config.cpuWarningThreshold) {
            this.addAlert({
                level: overview.cpuUsage > 90 ? 'emergency' : 'warning',
                message: `CPU 使用率过高：${overview.cpuUsage.toFixed(1)}%`,
            });
        }

        // 内存告警
        if (overview.memoryUsage > config.memWarningThreshold) {
            this.addAlert({
                level: overview.memoryUsage > 90 ? 'emergency' : 'warning',
                message: `内存使用率过高：${overview.memoryUsage.toFixed(1)}%`,
            });
        }

        // 错误率告警
        if (overview.errorRate * 100 > config.errorRateThreshold) {
            this.addAlert({
                level: overview.errorRate * 100 > 15 ? 'critical' : 'warning',
                message: `错误率过高：${(overview.errorRate * 100).toFixed(2)}%`,
            });
        }
    }

    // 添加告警
    addAlert(alert) {
        const newAlert = {
            id: `alert-${Date.now()}`,
            timestamp: Date.now(),
            ...alert,
        };

        // 避免重复告警 (1 分钟内相同消息)
        const recentSame = this.state.alerts.recent.find(a => 
            a.message === alert.message && 
            Date.now() - a.timestamp < 60000
        );

        if (!recentSame) {
            this.state.alerts.recent.unshift(newAlert);
            
            // 限制告警数量
            if (this.state.alerts.recent.length > 50) {
                this.state.alerts.recent.pop();
            }

            console.log(`[DashboardServer] Alert: ${alert.message}`);
            
            // 广播告警
            this.broadcast({
                alerts: { recent: [newAlert] },
            });
        }
    }

    // 更新 Worker 状态 (外部调用)
    updateWorkers(workers) {
        this.state.workers = workers;
        this.broadcast({ workers });
    }

    // 添加 Worker
    addWorker(worker) {
        const index = this.state.workers.findIndex(w => w.id === worker.id);
        if (index >= 0) {
            this.state.workers[index] = { ...this.state.workers[index], ...worker };
        } else {
            this.state.workers.push(worker);
        }
        this.broadcast({ workers: this.state.workers });
    }

    // 移除 Worker
    removeWorker(workerId) {
        this.state.workers = this.state.workers.filter(w => w.id !== workerId);
        this.broadcast({ workers: this.state.workers });
    }

    // 记录任务完成
    recordTask(success = true) {
        const total = this.state.overview.tasksPerMinute;
        const errors = total * this.state.overview.errorRate;
        
        // 更新错误率 (滑动窗口)
        const newErrorRate = success ? 
            (errors / (total + 1)) : 
            ((errors + 1) / (total + 1));
        
        this.state.overview.errorRate = newErrorRate;
    }

    // 持久化
    saveState() {
        try {
            const stateFile = path.join(this.dataDir, 'state.json');
            fs.writeFileSync(stateFile, JSON.stringify(this.state, null, 2));
        } catch (error) {
            console.error('[DashboardServer] Save state failed:', error);
        }
    }

    loadState() {
        try {
            const stateFile = path.join(this.dataDir, 'state.json');
            if (fs.existsSync(stateFile)) {
                const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
                this.state = { ...this.state, ...saved };
                console.log('[DashboardServer] State loaded');
            }
        } catch (error) {
            console.error('[DashboardServer] Load state failed:', error);
        }
    }

    // 工具函数
    sendJSON(res, data, statusCode = 200) {
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
    }

    serveFile(res, filePath, contentType) {
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('File not found');
                return;
            }
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        });
    }

    readBody(req) {
        return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    reject(new Error('Invalid JSON'));
                }
            });
            req.on('error', reject);
        });
    }
}

// 导出
module.exports = DashboardServer;

// 独立运行
if (require.main === module) {
    const server = new DashboardServer({ port: 8080 });
    server.start();

    // 优雅退出
    process.on('SIGINT', () => {
        server.stop();
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        server.stop();
        process.exit(0);
    });
}
