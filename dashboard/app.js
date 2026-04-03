/**
 * Orchestra Dashboard - Main Application
 * 处理 UI 渲染、数据更新和用户交互
 */

class DashboardApp {
    constructor() {
        this.api = null;
        this.settings = this.loadSettings();
        this.charts = {};
        this.isInitialized = false;
        
        this.init();
    }

    // 加载设置
    loadSettings() {
        const saved = localStorage.getItem('orchestra-dashboard-settings');
        return {
            refreshRate: 5000,
            cpuWarningThreshold: 70,
            memWarningThreshold: 75,
            errorRateThreshold: 5,
            useWebSocket: true,
            ...saved ? JSON.parse(saved) : {},
        };
    }

    // 保存设置
    saveSettings() {
        localStorage.setItem('orchestra-dashboard-settings', JSON.stringify(this.settings));
    }

    // 初始化
    async init() {
        console.log('[DashboardApp] Initializing...');
        
        // 初始化 API
        this.api = new DashboardAPI({
            useWebSocket: this.settings.useWebSocket,
            refreshInterval: this.settings.refreshRate,
        });

        // 绑定事件
        this.bindAPIEvents();
        this.bindUIEvents();

        // 连接 API
        try {
            await this.api.connect();
        } catch (error) {
            console.error('[DashboardApp] Connection failed:', error);
            this.updateConnectionStatus('disconnected');
        }

        // 加载初始数据
        await this.loadInitialData();

        this.isInitialized = true;
        console.log('[DashboardApp] Initialized');
    }

    // 绑定 API 事件
    bindAPIEvents() {
        this.api.on('connected', (data) => {
            console.log('[DashboardApp] Connected via', data.type);
            this.updateConnectionStatus('connected');
        });

        this.api.on('disconnected', () => {
            this.updateConnectionStatus('disconnected');
        });

        this.api.on('fallback', (data) => {
            console.log('[DashboardApp] Fallback to polling:', data.reason);
            this.updateConnectionStatus('polling');
        });

        this.api.on('data', (data) => {
            this.updateDashboard(data);
        });

        this.api.on('error', (error) => {
            console.error('[DashboardApp] Error:', error);
            this.showToast('连接错误：' + error.error?.message || '未知错误', 'error');
        });
    }

    // 绑定 UI 事件
    bindUIEvents() {
        // 刷新按钮
        document.getElementById('refreshBtn')?.addEventListener('click', () => {
            this.refreshData();
        });

        // 设置按钮
        document.getElementById('settingsBtn')?.addEventListener('click', () => {
            this.openSettings();
        });

        // 关闭模态框
        document.getElementById('closeModal')?.addEventListener('click', () => {
            this.closeSettings();
        });

        // 保存设置
        document.getElementById('saveSettings')?.addEventListener('click', () => {
            this.saveSettingsFromModal();
        });

        // 取消设置
        document.getElementById('cancelSettings')?.addEventListener('click', () => {
            this.closeSettings();
        });

        // 点击模态框外部关闭
        document.getElementById('settingsModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'settingsModal') {
                this.closeSettings();
            }
        });

        // 时间范围选择
        document.getElementById('timeRange')?.addEventListener('change', (e) => {
            this.updateCharts(e.target.value);
        });
    }

    // 加载初始数据
    async loadInitialData() {
        try {
            const data = await this.api.fetchOverview();
            this.updateDashboard(data);
        } catch (error) {
            console.error('[DashboardApp] Failed to load initial data:', error);
            this.showEmptyState();
        }
    }

    // 刷新数据
    async refreshData() {
        const btn = document.getElementById('refreshBtn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = '🔄 刷新中...';
        }

        try {
            await this.api.fetchOverview();
            this.showToast('数据已刷新', 'success');
        } catch (error) {
            console.error('[DashboardApp] Refresh failed:', error);
            this.showToast('刷新失败：' + error.message, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = '🔄 刷新';
            }
        }
    }

    // 更新 Dashboard
    updateDashboard(data) {
        if (data.overview) {
            this.updateOverview(data.overview);
        }
        if (data.workers) {
            this.updateWorkers(data.workers);
        }
        if (data.metrics) {
            this.updateMetrics(data.metrics);
        }
        if (data.alerts) {
            this.updateAlerts(data.alerts);
        }
    }

    // 更新概览卡片
    updateOverview(overview) {
        // 运行时间
        document.getElementById('uptime').textContent = this.formatUptime(overview.uptime || 0);
        
        // 活跃 Worker
        document.getElementById('activeWorkers').textContent = 
            `${overview.activeWorkers || 0}/${overview.totalWorkers || 0}`;
        
        // 处理速率
        document.getElementById('tasksPerMinute').textContent = 
            (overview.tasksPerMinute || 0).toFixed(1);
        
        // 错误率
        const errorRateEl = document.getElementById('errorRate');
        const errorRate = (overview.errorRate || 0) * 100;
        errorRateEl.textContent = errorRate.toFixed(2) + '%';
        errorRateEl.style.color = errorRate > this.settings.errorRateThreshold ? 
            'var(--error)' : 'var(--success)';
        
        // CPU 使用
        const cpuEl = document.getElementById('cpuUsage');
        const cpu = overview.cpuUsage || 0;
        cpuEl.textContent = cpu.toFixed(1) + '%';
        cpuEl.style.color = cpu > this.settings.cpuWarningThreshold ? 
            'var(--warning)' : 'var(--success)';
        
        // 内存使用
        const memEl = document.getElementById('memoryUsage');
        const mem = overview.memoryUsage || 0;
        memEl.textContent = mem.toFixed(1) + '%';
        memEl.style.color = mem > this.settings.memWarningThreshold ? 
            'var(--warning)' : 'var(--success)';
    }

    // 更新 Worker 列表
    updateWorkers(workers) {
        const tbody = document.getElementById('workersTableBody');
        if (!tbody) return;

        const workerList = workers.workers || workers;
        
        // 更新计数
        const countEl = document.getElementById('workerCount');
        if (countEl) {
            countEl.textContent = `${workerList.length} 个 Worker`;
        }

        if (!workerList || workerList.length === 0) {
            tbody.innerHTML = `
                <tr class="loading-row">
                    <td colspan="8">暂无 Worker</td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = workerList.map(worker => {
            const statusClass = this.getWorkerStatusClass(worker.status);
            const statusText = this.getWorkerStatusText(worker.status);
            const lastHeartbeat = this.formatTime(worker.lastHeartbeat);
            
            return `
                <tr>
                    <td><strong>${worker.name || worker.id}</strong></td>
                    <td>
                        <span class="status-badge ${statusClass}">
                            <span class="dot"></span>
                            ${statusText}
                        </span>
                    </td>
                    <td>${worker.currentTask || '-'}</td>
                    <td>${worker.completedTasks || 0}</td>
                    <td style="color: ${worker.failedTasks > 0 ? 'var(--error)' : 'inherit'}">
                        ${worker.failedTasks || 0}
                    </td>
                    <td>${worker.cpuUsage?.toFixed(1) || 0}%</td>
                    <td>${(worker.memoryUsage / 1024).toFixed(1) || 0} MB</td>
                    <td style="color: var(--text-secondary)">${lastHeartbeat}</td>
                </tr>
            `;
        }).join('');
    }

    // 更新指标图表
    updateMetrics(metrics) {
        this.renderChart('cpuChart', metrics.cpuHistory || [], 'CPU 使用率', '%', '#3b82f6');
        this.renderChart('memoryChart', metrics.memoryHistory || [], '内存使用', '%', '#a855f7');
        this.renderChart('tasksChart', metrics.tasksHistory || [], '任务数', 'tasks', '#22c55e');
    }

    // 渲染简单图表
    renderChart(canvasId, data, label, unit, color) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width = canvas.offsetWidth * 2;
        const height = canvas.height = 240;

        // 清空画布
        ctx.clearRect(0, 0, width, height);

        if (!data || data.length === 0) {
            ctx.fillStyle = '#94a3b8';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('暂无数据', width / 2, height / 2);
            return;
        }

        // 计算缩放
        const maxValue = Math.max(...data, 100);
        const padding = 40;
        const chartWidth = width - padding * 2;
        const chartHeight = height - padding * 2;
        const stepX = chartWidth / (data.length - 1 || 1);

        // 绘制网格
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padding + (chartHeight / 4) * i;
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(width - padding, y);
            ctx.stroke();
        }

        // 绘制折线
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();

        data.forEach((value, index) => {
            const x = padding + index * stepX;
            const y = padding + chartHeight - (value / maxValue) * chartHeight;
            
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();

        // 绘制填充
        ctx.fillStyle = color + '20';
        ctx.lineTo(padding + (data.length - 1) * stepX, padding + chartHeight);
        ctx.lineTo(padding, padding + chartHeight);
        ctx.closePath();
        ctx.fill();

        // 绘制标签
        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${label} (${unit})`, padding, 20);
        
        ctx.textAlign = 'right';
        ctx.fillText(maxValue.toFixed(0) + unit, width - padding, padding);
    }

    // 更新告警列表
    updateAlerts(alerts) {
        const container = document.getElementById('alertsList');
        if (!container) return;

        const alertList = alerts.recent || alerts || [];
        
        // 更新计数
        const countEl = document.getElementById('alertCount');
        if (countEl) {
            countEl.textContent = `${alertList.length} 条告警`;
        }

        if (!alertList || alertList.length === 0) {
            container.innerHTML = '<div class="alert-item empty">暂无告警</div>';
            return;
        }

        container.innerHTML = alertList.map(alert => {
            const levelClass = alert.level || 'warning';
            const icon = this.getAlertIcon(levelClass);
            const time = this.formatTime(alert.timestamp || Date.now());
            
            return `
                <div class="alert-item ${levelClass}">
                    <span class="alert-icon">${icon}</span>
                    <div class="alert-content">
                        <div class="alert-message">${alert.message}</div>
                        <div class="alert-time">${time}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // 更新连接状态
    updateConnectionStatus(status) {
        const indicator = document.getElementById('connectionStatus');
        if (!indicator) return;

        const text = indicator.querySelector('.text');
        indicator.className = 'status-indicator ' + status;
        
        switch (status) {
            case 'connected':
                text.textContent = 'WebSocket';
                break;
            case 'polling':
                text.textContent = 'HTTP Polling';
                break;
            case 'disconnected':
                text.textContent = '已断开';
                break;
            default:
                text.textContent = '连接中...';
        }
    }

    // 显示空状态
    showEmptyState() {
        this.updateOverview({
            uptime: 0,
            activeWorkers: 0,
            totalWorkers: 0,
            tasksPerMinute: 0,
            errorRate: 0,
            cpuUsage: 0,
            memoryUsage: 0,
        });
        this.updateWorkers({ workers: [] });
        this.updateMetrics({});
        this.updateAlerts([]);
    }

    // 设置相关
    openSettings() {
        const modal = document.getElementById('settingsModal');
        if (!modal) return;

        // 填充当前设置
        const refreshRadios = document.querySelectorAll('input[name="refreshRate"]');
        refreshRadios.forEach(radio => {
            radio.checked = radio.value === String(this.settings.refreshRate);
        });

        document.getElementById('cpuWarningThreshold').value = this.settings.cpuWarningThreshold;
        document.getElementById('memWarningThreshold').value = this.settings.memWarningThreshold;
        document.getElementById('errorRateThreshold').value = this.settings.errorRateThreshold;
        document.getElementById('useWebSocket').checked = this.settings.useWebSocket;

        modal.classList.add('active');
    }

    closeSettings() {
        const modal = document.getElementById('settingsModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    saveSettingsFromModal() {
        // 刷新率
        const refreshRadio = document.querySelector('input[name="refreshRate"]:checked');
        if (refreshRadio) {
            this.settings.refreshRate = parseInt(refreshRadio.value);
        }

        // 阈值
        this.settings.cpuWarningThreshold = parseInt(document.getElementById('cpuWarningThreshold').value);
        this.settings.memWarningThreshold = parseInt(document.getElementById('memWarningThreshold').value);
        this.settings.errorRateThreshold = parseInt(document.getElementById('errorRateThreshold').value);

        // WebSocket
        this.settings.useWebSocket = document.getElementById('useWebSocket').checked;

        // 保存并应用
        this.saveSettings();
        this.api.setRefreshInterval(this.settings.refreshRate);
        
        if (this.api.useWebSocket !== this.settings.useWebSocket) {
            this.api.setConnectionMode(this.settings.useWebSocket);
        }

        this.closeSettings();
        this.showToast('设置已保存', 'success');
    }

    // 工具函数
    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (days > 0) {
            return `${days}天 ${hours}小时`;
        } else if (hours > 0) {
            return `${hours}小时 ${minutes}分钟`;
        } else {
            return `${minutes}分钟`;
        }
    }

    formatTime(timestamp) {
        if (!timestamp) return '-';
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) {
            return '刚刚';
        } else if (diff < 3600000) {
            return `${Math.floor(diff / 60000)} 分钟前`;
        } else if (diff < 86400000) {
            return `${Math.floor(diff / 3600000)} 小时前`;
        } else {
            return date.toLocaleString('zh-CN', { 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
    }

    getWorkerStatusClass(status) {
        switch (status?.toLowerCase()) {
            case 'running':
            case 'active':
                return 'status-running';
            case 'idle':
            case 'waiting':
                return 'status-idle';
            case 'error':
            case 'failed':
                return 'status-error';
            default:
                return 'status-stopped';
        }
    }

    getWorkerStatusText(status) {
        switch (status?.toLowerCase()) {
            case 'running':
            case 'active':
                return '运行中';
            case 'idle':
            case 'waiting':
                return '空闲';
            case 'error':
            case 'failed':
                return '错误';
            default:
                return '已停止';
        }
    }

    getAlertIcon(level) {
        switch (level) {
            case 'emergency':
                return '🔴';
            case 'critical':
                return '🚨';
            case 'warning':
                return '⚠️';
            default:
                return 'ℹ️';
        }
    }

    showToast(message, type = 'info') {
        // 简单的 toast 实现
        console.log(`[Toast] ${type}: ${message}`);
        // 可以在这里添加更复杂的 toast UI
    }
}

// 启动应用
window.addEventListener('DOMContentLoaded', () => {
    window.dashboardApp = new DashboardApp();
});
