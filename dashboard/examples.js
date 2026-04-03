/**
 * Orchestra Dashboard - 使用示例
 * 
 * 演示如何使用 Dashboard 组件
 */

const DashboardServer = require('./server');
const { MetricsCollector, TaskTimer } = require('./metrics');
const AlertSystem = require('./alerts');

// ============================================================
// 示例 1: 独立运行 Dashboard
// ============================================================

function example1_standalone() {
    console.log('=== 示例 1: 独立运行 Dashboard ===\n');
    
    const dashboard = new DashboardServer({
        port: 8080,
        dataDir: './dashboard-data',
    });
    
    dashboard.start();
    
    // 模拟 Worker 数据
    setInterval(() => {
        dashboard.updateWorkers([
            {
                id: 'worker-1',
                name: 'Worker-1',
                status: 'running',
                currentTask: 'task-123',
                completedTasks: Math.floor(Math.random() * 1000),
                failedTasks: Math.floor(Math.random() * 10),
                lastHeartbeat: Date.now(),
                cpuUsage: Math.random() * 50 + 20,
                memoryUsage: Math.random() * 512 + 256,
            },
            {
                id: 'worker-2',
                name: 'Worker-2',
                status: 'idle',
                currentTask: null,
                completedTasks: Math.floor(Math.random() * 800),
                failedTasks: Math.floor(Math.random() * 5),
                lastHeartbeat: Date.now(),
                cpuUsage: Math.random() * 20 + 5,
                memoryUsage: Math.random() * 256 + 128,
            },
        ]);
    }, 5000);
    
    console.log('Dashboard 运行在 http://localhost:8080');
    console.log('按 Ctrl+C 停止\n');
}

// ============================================================
// 示例 2: 集成到现有应用
// ============================================================

function example2_integrated() {
    console.log('=== 示例 2: 集成到现有应用 ===\n');
    
    // 创建 Dashboard (不启动独立服务器)
    const dashboard = new DashboardServer({
        port: 8080,
    });
    
    // 创建指标收集器
    const metrics = new MetricsCollector({
        dashboard: dashboard,
        interval: 5000,
    });
    
    // 创建告警系统
    const alerts = new AlertSystem({
        dashboard: dashboard,
        config: {
            thresholds: {
                cpu: { warning: 70, critical: 85, emergency: 95 },
                memory: { warning: 75, critical: 85, emergency: 95 },
            },
        },
    });
    
    // 模拟任务执行
    const taskTimer = new TaskTimer();
    
    function simulateTask() {
        const taskId = `task-${Date.now()}`;
        taskTimer.start(taskId);
        
        // 模拟任务执行
        setTimeout(() => {
            const success = Math.random() > 0.1; // 90% 成功率
            const result = taskTimer.end(taskId, success);
            
            if (result) {
                metrics.recordTask(success);
                metrics.recordResponseTime(result.duration);
                
                console.log(`Task ${taskId}: ${success ? '✓' : '✗'} (${result.duration.toFixed(2)}ms)`);
            }
        }, Math.random() * 1000 + 500);
    }
    
    // 模拟任务流
    setInterval(simulateTask, 2000);
    
    // 定期检查告警
    setInterval(() => {
        const state = {
            overview: dashboard.getOverview(),
            workers: dashboard.state.workers,
            metrics: metrics.getMetrics(),
        };
        alerts.check(state);
    }, 10000);
    
    console.log('模拟任务执行中...\n');
}

// ============================================================
// 示例 3: 监控 Worker 池
// ============================================================

class WorkerPool {
    constructor(size = 4) {
        this.size = size;
        this.workers = new Map();
        this.dashboard = null;
        
        // 初始化 Worker
        for (let i = 0; i < size; i++) {
            this.workers.set(`worker-${i}`, {
                id: `worker-${i}`,
                name: `Worker-${i}`,
                status: 'idle',
                currentTask: null,
                completedTasks: 0,
                failedTasks: 0,
                lastHeartbeat: Date.now(),
            });
        }
    }
    
    setDashboard(dashboard) {
        this.dashboard = dashboard;
        this.syncWorkers();
    }
    
    syncWorkers() {
        if (this.dashboard) {
            this.dashboard.updateWorkers(Array.from(this.workers.values()));
        }
    }
    
    assignTask(workerId, task) {
        const worker = this.workers.get(workerId);
        if (worker && worker.status === 'idle') {
            worker.status = 'running';
            worker.currentTask = task.id;
            this.syncWorkers();
            return true;
        }
        return false;
    }
    
    completeTask(workerId, success) {
        const worker = this.workers.get(workerId);
        if (worker) {
            worker.status = 'idle';
            worker.currentTask = null;
            
            if (success) {
                worker.completedTasks++;
            } else {
                worker.failedTasks++;
            }
            
            worker.lastHeartbeat = Date.now();
            this.syncWorkers();
            
            // 记录到 Dashboard
            if (this.dashboard) {
                this.dashboard.recordTask(success);
            }
        }
    }
    
    getAvailableWorker() {
        for (const worker of this.workers.values()) {
            if (worker.status === 'idle') {
                return worker.id;
            }
        }
        return null;
    }
}

function example3_workerPool() {
    console.log('=== 示例 3: 监控 Worker 池 ===\n');
    
    const dashboard = new DashboardServer({ port: 8080 });
    dashboard.start();
    
    const pool = new WorkerPool(4);
    pool.setDashboard(dashboard);
    
    // 模拟任务调度
    setInterval(() => {
        const workerId = pool.getAvailableWorker();
        if (workerId) {
            const task = {
                id: `task-${Date.now()}`,
                type: 'process',
                data: { /* ... */ },
            };
            
            pool.assignTask(workerId, task);
            
            // 模拟任务完成
            setTimeout(() => {
                const success = Math.random() > 0.05;
                pool.completeTask(workerId, success);
            }, Math.random() * 3000 + 1000);
        }
    }, 2000);
    
    console.log('Worker 池运行中...\n');
}

// ============================================================
// 示例 4: 自定义告警处理
// ============================================================

function example4_customAlerts() {
    console.log('=== 示例 4: 自定义告警处理 ===\n');
    
    const dashboard = new DashboardServer({ port: 8080 });
    
    const alerts = new AlertSystem({
        dashboard: dashboard,
    });
    
    // 订阅告警事件
    alerts.on('alert', (alert) => {
        console.log(`🚨 新告警 [${alert.level}]: ${alert.message}`);
        
        // 自定义处理逻辑
        if (alert.level === 'emergency') {
            console.log('   → 发送紧急通知...');
            // sendEmergencyNotification(alert);
        }
    });
    
    alerts.on('acknowledge', (alert) => {
        console.log(`✓ 告警已确认: ${alert.message}`);
    });
    
    // 模拟告警触发
    setInterval(() => {
        const randomValue = Math.random() * 100;
        
        if (randomValue > 95) {
            alerts.send('emergency', '模拟紧急告警');
        } else if (randomValue > 85) {
            alerts.send('critical', '模拟严重告警');
        } else if (randomValue > 70) {
            alerts.send('warning', '模拟警告');
        }
    }, 10000);
    
    console.log('告警系统运行中...\n');
}

// ============================================================
// 示例 5: 导出监控数据
// ============================================================

async function example5_export() {
    console.log('=== 示例 5: 导出监控数据 ===\n');
    
    const dashboard = new DashboardServer({ port: 8080 });
    const metrics = new MetricsCollector({
        dashboard: dashboard,
        interval: 1000,
    });
    
    // 收集一些数据
    for (let i = 0; i < 10; i++) {
        metrics.recordTask(Math.random() > 0.1);
        metrics.recordResponseTime(Math.random() * 500 + 100);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // 导出历史数据
    const history = metrics.exportHistory({
        metrics: ['cpu', 'memory', 'tasks', 'errors'],
    });
    
    console.log('导出历史数据:');
    console.log(JSON.stringify(history, null, 2));
    
    // 获取任务统计
    const stats = metrics.getMetrics();
    console.log('\n当前指标:');
    console.log(JSON.stringify(stats.current, null, 2));
}

// ============================================================
// 运行示例
// ============================================================

// 选择要运行的示例
const example = process.argv[2] || '1';

console.log('Orchestra Dashboard 使用示例\n');
console.log('可用示例:');
console.log('  1 - 独立运行 Dashboard');
console.log('  2 - 集成到现有应用');
console.log('  3 - 监控 Worker 池');
console.log('  4 - 自定义告警处理');
console.log('  5 - 导出监控数据');
console.log(`\n运行示例 ${example}...\n`);

switch (example) {
    case '1':
        example1_standalone();
        break;
    case '2':
        example2_integrated();
        break;
    case '3':
        example3_workerPool();
        break;
    case '4':
        example4_customAlerts();
        break;
    case '5':
        example5_export();
        break;
    default:
        console.log('未知示例编号');
}
