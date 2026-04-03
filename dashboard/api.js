/**
 * Orchestra Dashboard - API Client
 * 处理与后端 API 的通信，支持 WebSocket 和 HTTP Polling
 */

class DashboardAPI {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || '/api/dashboard';
        this.wsUrl = options.wsUrl || 'ws://localhost:8080/ws/dashboard';
        this.useWebSocket = options.useWebSocket !== false;
        this.refreshInterval = options.refreshInterval || 5000;
        
        this.ws = null;
        this.pollTimer = null;
        this.listeners = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        
        this.lastData = null;
        this.isConnected = false;
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

    // 连接管理
    async connect() {
        if (this.useWebSocket) {
            return this.connectWebSocket();
        } else {
            return this.startPolling();
        }
    }

    disconnect() {
        this.stopWebSocket();
        this.stopPolling();
    }

    // WebSocket 连接
    connectWebSocket() {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.wsUrl);
                
                this.ws.onopen = () => {
                    console.log('[DashboardAPI] WebSocket connected');
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    this.emit('connected', { type: 'websocket' });
                    resolve();
                };

                this.ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this.lastData = data;
                        this.emit('data', data);
                        
                        // 分发具体类型的数据
                        if (data.overview) {
                            this.emit('overview', data.overview);
                        }
                        if (data.workers) {
                            this.emit('workers', data.workers);
                        }
                        if (data.metrics) {
                            this.emit('metrics', data.metrics);
                        }
                        if (data.alerts) {
                            this.emit('alerts', data.alerts);
                        }
                    } catch (e) {
                        console.error('[DashboardAPI] Parse error:', e);
                    }
                };

                this.ws.onclose = () => {
                    console.log('[DashboardAPI] WebSocket closed');
                    this.isConnected = false;
                    this.emit('disconnected', { type: 'websocket' });
                    this.attemptReconnect();
                };

                this.ws.onerror = (error) => {
                    console.error('[DashboardAPI] WebSocket error:', error);
                    this.emit('error', { type: 'websocket', error });
                    reject(error);
                };

                // 连接超时
                setTimeout(() => {
                    if (!this.isConnected && this.ws.readyState === WebSocket.CONNECTING) {
                        this.ws.close();
                        reject(new Error('WebSocket connection timeout'));
                    }
                }, 10000);

            } catch (error) {
                console.error('[DashboardAPI] WebSocket creation failed:', error);
                reject(error);
            }
        });
    }

    stopWebSocket() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('[DashboardAPI] Max reconnect attempts reached, switching to polling');
            this.emit('fallback', { reason: 'max_reconnect_attempts' });
            this.startPolling();
            return;
        }

        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
        this.reconnectAttempts++;
        
        console.log(`[DashboardAPI] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
        
        setTimeout(() => {
            this.connectWebSocket().catch(() => {
                // 重试失败会触发下一次 attemptReconnect
            });
        }, delay);
    }

    // HTTP Polling
    startPolling() {
        console.log('[DashboardAPI] Starting HTTP polling');
        this.emit('connected', { type: 'polling' });
        this.poll();
    }

    stopPolling() {
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = null;
        }
    }

    async poll() {
        try {
            const data = await this.fetchOverview();
            this.lastData = data;
            this.emit('data', data);
            
            // 分发具体类型的数据
            if (data.overview) {
                this.emit('overview', data.overview);
            }
            if (data.workers) {
                this.emit('workers', data.workers);
            }
            if (data.metrics) {
                this.emit('metrics', data.metrics);
            }
            if (data.alerts) {
                this.emit('alerts', data.alerts);
            }
        } catch (error) {
            console.error('[DashboardAPI] Poll error:', error);
            this.emit('error', { type: 'polling', error });
        }

        this.pollTimer = setTimeout(() => this.poll(), this.refreshInterval);
    }

    // API 请求方法
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
            },
        };

        const response = await fetch(url, { ...defaultOptions, ...options });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
    }

    async fetchOverview() {
        return await this.request('/overview');
    }

    async fetchWorkers() {
        return await this.request('/workers');
    }

    async fetchMetrics(timeRange = '1h') {
        return await this.request(`/metrics?timeRange=${timeRange}`);
    }

    async fetchAlerts() {
        return await this.request('/alerts');
    }

    async updateAlertConfig(config) {
        return await this.request('/alerts/config', {
            method: 'POST',
            body: JSON.stringify(config),
        });
    }

    // 获取最新数据
    getLatestData() {
        return this.lastData;
    }

    // 设置刷新间隔
    setRefreshInterval(interval) {
        this.refreshInterval = interval;
        if (!this.useWebSocket && this.pollTimer) {
            this.stopPolling();
            this.startPolling();
        }
    }

    // 切换连接模式
    setConnectionMode(useWebSocket) {
        this.useWebSocket = useWebSocket;
        this.disconnect();
        return this.connect();
    }
}

// 导出单例
window.DashboardAPI = DashboardAPI;
