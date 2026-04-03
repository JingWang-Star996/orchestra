/**
 * Orchestra Dashboard - 告警系统
 * 负责监控指标、触发告警、发送通知
 */

class AlertSystem {
    constructor(options = {}) {
        this.dashboard = options.dashboard;
        this.config = options.config || {};
        this.recentAlerts = new Map();
        this.listeners = new Map();
        
        // 默认阈值
        this.thresholds = {
            cpu: { warning: 70, critical: 85, emergency: 95 },
            memory: { warning: 75, critical: 85, emergency: 95 },
            errorRate: { warning: 5, critical: 10, emergency: 20 },
            workerOffline: { warning: 1, critical: 3, emergencyPercent: 50 },
            responseTime: { warning: 500, critical: 1000, emergency: 3000 },
            ...this.config.thresholds,
        };

        // 通知渠道
        this.notifiers = {
            console: new ConsoleNotifier(),
            email: options.emailNotifier,
            dingtalk: options.dingtalkNotifier,
            feishu: options.feishuNotifier,
        };
    }

    // 检查告警
    check(state) {
        const { overview, workers, metrics } = state;

        // CPU 检查
        this.checkThreshold(
            'cpu',
            overview.cpuUsage,
            'CPU 使用率',
            '%'
        );

        // 内存检查
        this.checkThreshold(
            'memory',
            overview.memoryUsage,
            '内存使用率',
            '%'
        );

        // 错误率检查
        this.checkThreshold(
            'errorRate',
            overview.errorRate * 100,
            '错误率',
            '%'
        );

        // Worker 离线检查
        this.checkWorkers(workers);
    }

    // 阈值检查
    checkThreshold(metric, value, label, unit) {
        const thresholds = this.thresholds[metric];
        if (!thresholds) return;

        let level = null;
        if (value >= thresholds.emergency) {
            level = 'emergency';
        } else if (value >= thresholds.critical) {
            level = 'critical';
        } else if (value >= thresholds.warning) {
            level = 'warning';
        }

        if (level) {
            this.send(level, `${label}过高：${value.toFixed(1)}${unit}`);
        }
    }

    // Worker 检查
    checkWorkers(workers) {
        const now = Date.now();
        const offlineThreshold = 5 * 60 * 1000; // 5 分钟

        const offlineWorkers = workers.filter(w => 
            now - w.lastHeartbeat > offlineThreshold
        );

        if (offlineWorkers.length > 0) {
            const totalWorkers = workers.length;
            const offlinePercent = (offlineWorkers.length / totalWorkers) * 100;

            let level = 'warning';
            if (offlinePercent >= this.thresholds.workerOffline.emergencyPercent) {
                level = 'emergency';
            } else if (offlineWorkers.length >= this.thresholds.workerOffline.critical) {
                level = 'critical';
            }

            this.send(
                level,
                `${offlineWorkers.length} 个 Worker 离线 (${offlinePercent.toFixed(1)}%)`
            );
        }
    }

    // 发送告警
    send(level, message) {
        // 去重检查
        const key = `${level}:${message}`;
        if (this.recentAlerts.has(key)) {
            return;
        }

        const alert = {
            id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            level,
            message,
            timestamp: Date.now(),
            acknowledged: false,
        };

        // 记录告警
        this.recentAlerts.set(key, alert);
        
        // 清理过期去重记录
        setTimeout(() => {
            this.recentAlerts.delete(key);
        }, 5 * 60 * 1000); // 5 分钟

        // 通知 Dashboard
        if (this.dashboard) {
            this.dashboard.addAlert(alert);
        }

        // 触发事件
        this.emit('alert', alert);

        // 发送通知
        this.notify(alert);

        console.log(`[AlertSystem] ${level.toUpperCase()}: ${message}`);
    }

    // 通知所有渠道
    notify(alert) {
        Object.values(this.notifiers).forEach(notifier => {
            if (notifier && notifier.enabled) {
                notifier.send(alert).catch(err => {
                    console.error('[AlertSystem] Notification failed:', err);
                });
            }
        });
    }

    // 事件订阅
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
        return () => this.off(event, callback);
    }

    off(event, callback) {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    emit(event, data) {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.forEach(cb => cb(data));
        }
    }

    // 确认告警
    acknowledge(alertId) {
        for (const alert of this.recentAlerts.values()) {
            if (alert.id === alertId) {
                alert.acknowledged = true;
                alert.acknowledgedAt = Date.now();
                this.emit('acknowledge', alert);
                return true;
            }
        }
        return false;
    }

    // 获取最近告警
    getRecent(limit = 20) {
        return Array.from(this.recentAlerts.values())
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);
    }

    // 清除已确认的告警
    clearAcknowledged() {
        let count = 0;
        for (const [key, alert] of this.recentAlerts.entries()) {
            if (alert.acknowledged) {
                this.recentAlerts.delete(key);
                count++;
            }
        }
        return count;
    }
}

// ============================================================
// 通知器实现
// ============================================================

class ConsoleNotifier {
    constructor() {
        this.enabled = true;
    }

    async send(alert) {
        const icon = this.getIcon(alert.level);
        console.log(`${icon} [${alert.level.toUpperCase()}] ${alert.message}`);
    }

    getIcon(level) {
        switch (level) {
            case 'emergency': return '🔴';
            case 'critical': return '🚨';
            case 'warning': return '⚠️';
            default: return 'ℹ️';
        }
    }
}

class EmailNotifier {
    constructor(options = {}) {
        this.enabled = options.enabled || false;
        this.to = options.to || '';
        this.smtp = options.smtp || {};
    }

    async send(alert) {
        if (!this.enabled || !this.to) return;
        
        // 实现邮件发送逻辑
        console.log('[EmailNotifier] Would send email:', alert.message);
    }
}

class DingTalkNotifier {
    constructor(options = {}) {
        this.enabled = !!options.webhook;
        this.webhook = options.webhook || '';
    }

    async send(alert) {
        if (!this.enabled || !this.webhook) return;

        const payload = {
            msgtype: 'markdown',
            markdown: {
                title: `Orchestra 告警 - ${alert.level}`,
                text: this.formatMarkdown(alert),
            },
        };

        try {
            await fetch(this.webhook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        } catch (error) {
            console.error('[DingTalkNotifier] Send failed:', error);
        }
    }

    formatMarkdown(alert) {
        const colors = {
            emergency: '#FF0000',
            critical: '#FF8C00',
            warning: '#FFD700',
        };
        
        return `## <font color="${colors[alert.level] || '#000000'}">Orchestra 告警</font>\n\n` +
            `- **级别**: ${alert.level}\n` +
            `- **内容**: ${alert.message}\n` +
            `- **时间**: ${new Date(alert.timestamp).toLocaleString('zh-CN')}\n`;
    }
}

class FeishuNotifier {
    constructor(options = {}) {
        this.enabled = !!options.webhook;
        this.webhook = options.webhook || '';
    }

    async send(alert) {
        if (!this.enabled || !this.webhook) return;

        const payload = {
            msg_type: 'interactive',
            card: {
                header: {
                    template: this.getTemplate(alert.level),
                    title: {
                        tag: 'plain_text',
                        content: `Orchestra 告警 - ${alert.level}`,
                    },
                },
                elements: [
                    {
                        tag: 'div',
                        text: {
                            tag: 'lark_md',
                            content: `**告警内容**: ${alert.message}`,
                        },
                    },
                    {
                        tag: 'div',
                        text: {
                            tag: 'lark_md',
                            content: `**时间**: ${new Date(alert.timestamp).toLocaleString('zh-CN')}`,
                        },
                    },
                ],
            },
        };

        try {
            await fetch(this.webhook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        } catch (error) {
            console.error('[FeishuNotifier] Send failed:', error);
        }
    }

    getTemplate(level) {
        switch (level) {
            case 'emergency': return 'red';
            case 'critical': return 'orange';
            case 'warning': return 'yellow';
            default: return 'blue';
        }
    }
}

module.exports = AlertSystem;
