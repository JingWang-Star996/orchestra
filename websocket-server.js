#!/usr/bin/env node

/**
 * Orchestra WebSocket 服务器（兼容版）
 * 
 * 如果 ws 库未安装，自动降级为 HTTP 长轮询
 * 
 * 用法：node websocket-server.js
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = process.env.ORCHESTRA_WS_PORT || 3001;
const STATE_FILE = path.join(__dirname, 'temp/orchestra-state.json');

// 尝试加载 ws 库
let WebSocket;
try {
    WebSocket = require('ws');
    console.log('[WebSocket] 使用 ws 库（实时推送模式）');
    startWebSocketServer();
} catch (err) {
    console.log('[WebSocket] ws 库未安装，降级为 HTTP 长轮询模式');
    console.log('[WebSocket] 安装 ws 库：npm install ws（可选）');
    startHttpPollingServer();
}

// WebSocket 模式（需要 ws 库）
function startWebSocketServer() {
    const wss = new WebSocket.Server({ port: PORT });
    const clients = new Set();
    let lastState = null;

    console.log(`[WebSocket] 服务器启动在端口 ${PORT}`);

    wss.on('connection', (ws) => {
        console.log('[WebSocket] 新客户端连接');
        clients.add(ws);
        
        try {
            const state = getCurrentState();
            ws.send(JSON.stringify({ type: 'FULL', data: state, timestamp: Date.now() }));
            lastState = state;
        } catch (err) {
            console.error('[WebSocket] 发送全量数据失败:', err.message);
        }
        
        ws.on('close', () => { clients.delete(ws); });
        ws.on('error', (err) => { console.error('[WebSocket] 错误:', err.message); clients.delete(ws); });
        ws.isAlive = true;
        ws.on('pong', () => { ws.isAlive = true; });
    });

    const heartbeatInterval = setInterval(() => {
        wss.clients.forEach((ws) => {
            if (ws.isAlive === false) return ws.terminate();
            ws.isAlive = false;
            ws.ping();
        });
    }, 30000);

    wss.on('close', () => { clearInterval(heartbeatInterval); });

    function getCurrentState() {
        try {
            if (!fs.existsSync(STATE_FILE)) return { stats: {}, agents: [], tokenHistory: [] };
            return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
        } catch (err) {
            return { stats: {}, agents: [], tokenHistory: [] };
        }
    }

    function detectChanges(last, current) {
        const changes = [];
        if (!last) return changes;
        if (JSON.stringify(last.stats) !== JSON.stringify(current.stats)) changes.push({ type: 'stats', data: current.stats });
        if (last.agents && current.agents) {
            current.agents.forEach(agent => {
                const lastAgent = last.agents.find(a => a.id === agent.id);
                if (!lastAgent || lastAgent.status !== agent.status) changes.push({ type: 'agent', data: agent });
            });
        }
        return changes;
    }

    function broadcastUpdate() {
        if (clients.size === 0) return;
        try {
            const currentState = getCurrentState();
            const changes = detectChanges(lastState, currentState);
            if (changes.length > 0) {
                const message = JSON.stringify({ type: 'UPDATE', changes: changes, timestamp: Date.now() });
                clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) client.send(message);
                });
                console.log(`[WebSocket] 推送更新：${changes.length} 个变更`);
            }
            lastState = currentState;
        } catch (err) { console.error('[WebSocket] 推送失败:', err.message); }
    }

    setInterval(broadcastUpdate, 1000);
    console.log('[WebSocket] WebSocket 服务器已就绪');
}

// HTTP 长轮询降级方案（无需 ws 库）
function startHttpPollingServer() {
    let cachedState = getCurrentState();

    const server = http.createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');
        
        if (req.url.startsWith('/poll')) {
            const currentState = getCurrentState();
            const changes = detectChanges(cachedState, currentState);
            
            if (changes.length > 0) {
                res.end(JSON.stringify({ type: 'UPDATE', changes: changes, timestamp: Date.now() }));
                cachedState = currentState;
            } else {
                setTimeout(() => res.end(JSON.stringify({ type: 'POLL', timestamp: Date.now() })), 2000);
            }
        } else if (req.url === '/state') {
            res.end(JSON.stringify(getCurrentState()));
        } else {
            res.end(JSON.stringify({ status: 'ok', port: PORT, mode: 'http-polling' }));
        }
    });

    function getCurrentState() {
        try {
            if (!fs.existsSync(STATE_FILE)) return { stats: {}, agents: [], tokenHistory: [] };
            return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
        } catch (err) {
            return { stats: {}, agents: [], tokenHistory: [] };
        }
    }

    function detectChanges(last, current) {
        const changes = [];
        if (!last) return changes;
        if (JSON.stringify(last.stats) !== JSON.stringify(current.stats)) changes.push({ type: 'stats', data: current.stats });
        if (last.agents && current.agents) {
            current.agents.forEach(agent => {
                const lastAgent = last.agents.find(a => a.id === agent.id);
                if (!lastAgent || lastAgent.status !== agent.status) changes.push({ type: 'agent', data: agent });
            });
        }
        return changes;
    }

    setInterval(() => {
        const newState = getCurrentState();
        const changes = detectChanges(cachedState, newState);
        if (changes.length > 0) {
            console.log(`[HTTP Polling] 检测到 ${changes.length} 个变更`);
            cachedState = newState;
        }
    }, 1000);

    server.listen(PORT, () => {
        console.log(`[HTTP Polling] 服务器启动在端口 ${PORT}`);
        console.log(`[HTTP Polling] 轮询地址：http://localhost:${PORT}/poll`);
        console.log(`[HTTP Polling] 状态地址：http://localhost:${PORT}/state`);
    });
}

process.on('SIGTERM', () => { console.log('[Server] 关闭中...'); process.exit(0); });
process.on('SIGINT', () => { console.log('[Server] 关闭中...'); process.exit(0); });
