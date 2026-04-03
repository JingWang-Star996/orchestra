/**
 * Orchestra Dashboard - 配置文件
 */

module.exports = {
    // 服务器配置
    server: {
        port: process.env.DASHBOARD_PORT || 8080,
        host: process.env.DASHBOARD_HOST || 'localhost',
    },

    // 数据存储
    storage: {
        dataDir: process.env.DASHBOARD_DATA_DIR || './data',
        stateFile: 'state.json',
        maxHistoryPoints: 360, // 1 小时 (5 秒间隔)
    },

    // 指标收集
    metrics: {
        interval: 5000, // 5 秒
        maxHistory: 360,
    },

    // 告警配置
    alerts: {
        thresholds: {
            cpu: {
                warning: parseInt(process.env.ALERT_CPU_WARNING) || 70,
                critical: parseInt(process.env.ALERT_CPU_CRITICAL) || 85,
                emergency: 95,
            },
            memory: {
                warning: parseInt(process.env.ALERT_MEMORY_WARNING) || 75,
                critical: parseInt(process.env.ALERT_MEMORY_CRITICAL) || 85,
                emergency: 95,
            },
            errorRate: {
                warning: parseInt(process.env.ALERT_ERROR_RATE) || 5,
                critical: 10,
                emergency: 20,
            },
            workerOffline: {
                warning: 1,
                critical: 3,
                emergency: 0.5, // 50% workers
            },
        },
        maxRecent: 50,
        dedupInterval: 60000, // 1 分钟内相同告警不重复
    },

    // WebSocket 配置
    websocket: {
        path: '/ws/dashboard',
        heartbeatInterval: 30000,
        maxClients: 100,
        reconnectDelay: 1000,
        maxReconnectAttempts: 5,
    },

    // HTTP 轮询配置
    polling: {
        defaultInterval: 5000,
        minInterval: 1000,
        maxInterval: 60000,
    },

    // 通知配置
    notifications: {
        email: {
            enabled: process.env.ALERT_EMAIL_ENABLED === 'true',
            to: process.env.ALERT_EMAIL_TO || '',
            smtp: {
                host: process.env.SMTP_HOST || '',
                port: parseInt(process.env.SMTP_PORT) || 587,
                user: process.env.SMTP_USER || '',
                pass: process.env.SMTP_PASS || '',
            },
        },
        dingtalk: {
            enabled: !!process.env.ALERT_DINGTALK_WEBHOOK,
            webhook: process.env.ALERT_DINGTALK_WEBHOOK || '',
        },
        feishu: {
            enabled: !!process.env.ALERT_FEISHU_WEBHOOK,
            webhook: process.env.ALERT_FEISHU_WEBHOOK || '',
        },
    },

    // UI 配置
    ui: {
        title: 'Orchestra Dashboard',
        refreshRates: [3000, 5000, 10000, 30000],
        defaultRefreshRate: 5000,
        timeRanges: ['5m', '15m', '1h', '24h'],
        defaultTimeRange: '1h',
    },

    // 安全配置
    security: {
        enabled: process.env.DASHBOARD_AUTH_ENABLED === 'true',
        token: process.env.DASHBOARD_AUTH_TOKEN || '',
        allowedIPs: process.env.DASHBOARD_ALLOWED_IPS?.split(',') || [],
        rateLimit: {
            windowMs: 60000,
            maxRequests: 100,
        },
    },
};
