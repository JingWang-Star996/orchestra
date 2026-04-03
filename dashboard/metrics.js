/**
 * Orchestra Dashboard - 指标收集器
 * 负责收集系统性能指标和任务统计
 */

const os = require('os');

class MetricsCollector {
    constructor(options = {}) {
        this.dashboard = options.dashboard;
        this.interval = options.interval || 5000;
        this.maxHistory = options.maxHistory || 360; // 1 小时
        
        this.history = {
            cpu: [],
            memory: [],
            tasks: [],
            errors: [],
            responseTime: [],
        };
        
        this.counters = {
            tasksTotal: 0,
            tasksSuccess: 0,
            tasksFailed: 0,
            tasksLastMinute: 0,
        };
        
        this.timers = {
            responseTimes: [], // 最近 100 次响应时间
        };
        
        this.previousCpuInfo = null;
        this.timer = null;
        
        this.start();
    }

    // 启动收集
    start() {
        this.timer = setInterval(() => {
            this.collect();
        }, this.interval);
    }

    // 停止收集
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    // 收集指标
    collect() {
        const metrics = {
            cpu: this.getCPUUsage(),
            memory: this.getMemoryUsage(),
            tasks: this.getTasksPerMinute(),
            errorRate: this.getErrorRate(),
            avgResponseTime: this.getAverageResponseTime(),
            system: this.getSystemInfo(),
        };

        // 添加到历史
        this.history.cpu.push(metrics.cpu);
        this.history.memory.push(metrics.memory);
        this.history.tasks.push(metrics.tasks);
        this.history.errors.push(metrics.errorRate);
        this.history.responseTime.push(metrics.avgResponseTime);

        // 限制历史长度
        this.trimHistory();

        // 重置分钟计数器
        this.counters.tasksLastMinute = 0;

        // 上报到 Dashboard
        if (this.dashboard) {
            this.dashboard.updateMetrics({
                cpuHistory: this.history.cpu.slice(-10),
                memoryHistory: this.history.memory.slice(-10),
                tasksHistory: this.history.tasks.slice(-10),
            });

            // 更新概览
            this.dashboard.updateOverview({
                cpuUsage: metrics.cpu,
                memoryUsage: metrics.memory,
                tasksPerMinute: metrics.tasks,
                errorRate: metrics.errorRate,
            });
        }

        return metrics;
    }

    // 获取 CPU 使用率
    getCPUUsage() {
        const cpus = os.cpus();
        let totalIdle = 0;
        let totalTick = 0;

        cpus.forEach(cpu => {
            const times = cpu.times;
            totalIdle += times.idle;
            totalTick += times.user + times.nice + times.sys + times.irq + times.idle;
        });

        const totalTickDiff = totalTick - (this.previousCpuInfo?.totalTick || 0);
        const totalIdleDiff = totalIdle - (this.previousCpuInfo?.totalIdle || 0);

        this.previousCpuInfo = { totalTick, totalIdle };

        if (totalTickDiff === 0) {
            return 0;
        }

        return ((totalTickDiff - totalIdleDiff) / totalTickDiff) * 100;
    }

    // 获取内存使用率
    getMemoryUsage() {
        const total = os.totalmem();
        const free = os.freemem();
        return ((total - free) / total) * 100;
    }

    // 获取每分钟任务数
    getTasksPerMinute() {
        return this.counters.tasksLastMinute;
    }

    // 获取错误率
    getErrorRate() {
        if (this.counters.tasksTotal === 0) {
            return 0;
        }
        return this.counters.tasksFailed / this.counters.tasksTotal;
    }

    // 获取平均响应时间
    getAverageResponseTime() {
        if (this.timers.responseTimes.length === 0) {
            return 0;
        }
        const sum = this.timers.responseTimes.reduce((a, b) => a + b, 0);
        return sum / this.timers.responseTimes.length;
    }

    // 获取系统信息
    getSystemInfo() {
        return {
            platform: os.platform(),
            arch: os.arch(),
            cpus: os.cpus().length,
            totalMemory: os.totalmem(),
            freeMemory: os.freemem(),
            uptime: os.uptime(),
            loadAvg: os.loadavg(),
        };
    }

    // 记录任务完成
    recordTask(success = true) {
        this.counters.tasksTotal++;
        this.counters.tasksLastMinute++;
        
        if (success) {
            this.counters.tasksSuccess++;
        } else {
            this.counters.tasksFailed++;
        }
    }

    // 记录响应时间
    recordResponseTime(ms) {
        this.timers.responseTimes.push(ms);
        
        // 限制长度
        if (this.timers.responseTimes.length > 100) {
            this.timers.responseTimes.shift();
        }
    }

    // 限制历史长度
    trimHistory() {
        Object.keys(this.history).forEach(key => {
            if (this.history[key].length > this.maxHistory) {
                this.history[key].shift();
            }
        });
    }

    // 重置统计
    reset() {
        this.history = {
            cpu: [],
            memory: [],
            tasks: [],
            errors: [],
            responseTime: [],
        };
        
        this.counters = {
            tasksTotal: 0,
            tasksSuccess: 0,
            tasksFailed: 0,
            tasksLastMinute: 0,
        };
        
        this.timers.responseTimes = [];
        this.previousCpuInfo = null;
    }

    // 获取完整指标
    getMetrics() {
        return {
            current: {
                cpu: this.getCPUUsage(),
                memory: this.getMemoryUsage(),
                tasks: this.getTasksPerMinute(),
                errorRate: this.getErrorRate(),
                avgResponseTime: this.getAverageResponseTime(),
            },
            history: {
                cpu: this.history.cpu,
                memory: this.history.memory,
                tasks: this.history.tasks,
                errors: this.history.errors,
                responseTime: this.history.responseTime,
            },
            counters: { ...this.counters },
            system: this.getSystemInfo(),
        };
    }

    // 导出历史数据
    exportHistory(options = {}) {
        const {
            startTime = 0,
            endTime = Date.now(),
            metrics = ['cpu', 'memory', 'tasks'],
        } = options;

        const exported = {};
        const interval = this.interval;

        metrics.forEach(metric => {
            if (this.history[metric]) {
                exported[metric] = this.history[metric].map((value, index) => ({
                    timestamp: Date.now() - (this.history[metric].length - index - 1) * interval,
                    value,
                }));
            }
        });

        return exported;
    }
}

// ============================================================
// 任务执行时间追踪器
// ============================================================

class TaskTimer {
    constructor() {
        this.timings = new Map();
        this.completed = [];
        this.maxCompleted = 1000;
    }

    // 开始计时
    start(taskId) {
        this.timings.set(taskId, {
            startTime: Date.now(),
            startHrTime: process.hrtime.bigint(),
        });
    }

    // 结束计时
    end(taskId, success = true) {
        const timing = this.timings.get(taskId);
        if (!timing) {
            return null;
        }

        const endTime = Date.now();
        const endHrTime = process.hrtime.bigint();
        
        const duration = Number(endHrTime - timing.startHrTime) / 1e6; // 毫秒

        const result = {
            taskId,
            startTime: timing.startTime,
            endTime,
            duration,
            success,
        };

        this.timings.delete(taskId);
        this.completed.push(result);

        // 限制长度
        if (this.completed.length > this.maxCompleted) {
            this.completed.shift();
        }

        return result;
    }

    // 获取任务统计
    getStats() {
        if (this.completed.length === 0) {
            return {
                total: 0,
                avg: 0,
                min: 0,
                max: 0,
                p50: 0,
                p95: 0,
                p99: 0,
            };
        }

        const durations = this.completed.map(t => t.duration).sort((a, b) => a - b);
        const sum = durations.reduce((a, b) => a + b, 0);
        const avg = sum / durations.length;

        return {
            total: this.completed.length,
            avg: avg.toFixed(2),
            min: durations[0].toFixed(2),
            max: durations[durations.length - 1].toFixed(2),
            p50: this.percentile(durations, 50).toFixed(2),
            p95: this.percentile(durations, 95).toFixed(2),
            p99: this.percentile(durations, 99).toFixed(2),
        };
    }

    // 计算百分位数
    percentile(sorted, p) {
        const index = Math.ceil((p / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)];
    }

    // 获取最近完成的任务
    getRecent(limit = 10) {
        return this.completed.slice(-limit);
    }

    // 清除已完成
    clear() {
        this.timings.clear();
        this.completed = [];
    }
}

// ============================================================
// 资源监控器
// ============================================================

class ResourceMonitor {
    constructor(options = {}) {
        this.interval = options.interval || 10000;
        this.limits = {
            memory: options.memoryLimit || 1024 * 1024 * 1024, // 1GB
            cpu: options.cpuLimit || 80,
        };
        
        this.history = [];
        this.maxHistory = 100;
        this.timer = null;
    }

    start() {
        this.timer = setInterval(() => {
            this.collect();
        }, this.interval);
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
        }
    }

    collect() {
        const usage = process.memoryUsage();
        const cpu = process.cpuUsage();

        const snapshot = {
            timestamp: Date.now(),
            memory: {
                heapUsed: usage.heapUsed,
                heapTotal: usage.heapTotal,
                external: usage.external,
                rss: usage.rss,
                usagePercent: (usage.heapUsed / usage.heapTotal) * 100,
            },
            cpu: {
                user: cpu.user,
                system: cpu.system,
            },
            limits: {
                memoryExceeded: usage.heapUsed > this.limits.memory,
                cpuExceeded: false, // CPU 限制需要计算
            },
        };

        this.history.push(snapshot);

        // 限制长度
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }

        return snapshot;
    }

    // 获取资源状态
    getStatus() {
        if (this.history.length === 0) {
            return { status: 'unknown' };
        }

        const latest = this.history[this.history.length - 1];
        const memoryPercent = latest.memory.usagePercent;
        
        let status = 'healthy';
        if (memoryPercent > 90 || latest.limits.memoryExceeded) {
            status = 'critical';
        } else if (memoryPercent > 75) {
            status = 'warning';
        }

        return {
            status,
            memory: latest.memory,
            timestamp: latest.timestamp,
        };
    }

    // 获取历史趋势
    getTrend(points = 20) {
        return this.history.slice(-points).map(snapshot => ({
            timestamp: snapshot.timestamp,
            memory: snapshot.memory.usagePercent,
        }));
    }
}

module.exports = {
    MetricsCollector,
    TaskTimer,
    ResourceMonitor,
};
