# Orchestra Dashboard Phase 2 - WebSocket 实时推送方案

**版本**：v5.1 → v6.0  
**目标**：从轮询升级为 WebSocket 实时推送  
**预期效果**：数据延迟从 10 秒降低到<1 秒

---

## 🏗️ 技术架构

### 当前架构（Phase 1 - 轮询）
```
┌─────────────┐      HTTP Poll      ┌─────────────┐
│   Browser   │ ─────────────────► │   API Server│
│  Dashboard  │    每 10 秒请求一次   │  localhost  │
└─────────────┘ ◄───────────────── └─────────────┘
                      返回全量数据
```

**问题**：
- 数据延迟最高 10 秒
- 无效请求多（数据未变化也请求）
- 服务器压力大

### 新架构（Phase 2 - WebSocket）
```
┌─────────────┐     WebSocket      ┌─────────────┐
│   Browser   │ ◄────────────────► │   API Server│
│  Dashboard  │   双向实时通信      │  localhost  │
└─────────────┘                    └─────────────┘
     │                                    │
     ▼                                    ▼
  前端状态管理                        数据变更检测
  - Modal 状态                         - Agent 状态变更
  - 图表数据缓存                       - 增量数据推送
  - 本地 Session                       - 事件广播
```

**优势**：
- ✅ 实时性最好（毫秒级）
- ✅ 服务器主动推送，减少无效请求
- ✅ 支持双向通信（客户端可订阅特定事件）

---

## 📝 实现方案

### 后端实现（server.js）

```javascript
// 1. 引入 WebSocket
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 3001 });

// 2. 客户端连接管理
const clients = new Set();

wss.on('connection', (ws) => {
  console.log('[WebSocket] 新客户端连接');
  clients.add(ws);
  
  // 连接时发送全量数据
  ws.send(JSON.stringify({
    type: 'FULL',
    data: getOrchestraState()
  }));
  
  ws.on('close', () => {
    console.log('[WebSocket] 客户端断开');
    clients.delete(ws);
  });
  
  ws.on('error', (err) => {
    console.error('[WebSocket] 错误:', err);
    clients.delete(ws);
  });
});

// 3. 状态变更检测与推送
let lastState = {};
setInterval(() => {
  const currentState = getOrchestraState();
  const changes = detectChanges(lastState, currentState);
  
  if (changes.length > 0) {
    const message = JSON.stringify({
      type: 'UPDATE',
      changes: changes,
      timestamp: Date.now()
    });
    
    // 推送给所有客户端
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
    
    lastState = currentState;
  }
}, 1000); // 每秒检测

// 4. 变更检测函数
function detectChanges(last, current) {
  const changes = [];
  
  // 统计数据变更
  if (JSON.stringify(last.stats) !== JSON.stringify(current.stats)) {
    changes.push({ type: 'stats', data: current.stats });
  }
  
  // Agent 状态变更
  current.agents.forEach(agent => {
    const lastAgent = last.agents.find(a => a.id === agent.id);
    if (!lastAgent || lastAgent.status !== agent.status) {
      changes.push({ type: 'agent', data: agent });
    }
  });
  
  return changes;
}
```

### 前端实现（index-v6.0.html）

```javascript
// 1. WebSocket 连接
class DashboardWebSocket {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.reconnectInterval = 3000;
    this.listeners = new Map();
    this.connect();
  }
  
  connect() {
    this.ws = new WebSocket(this.url);
    
    this.ws.onopen = () => {
      console.log('[WebSocket] 已连接');
      this.emit('connected');
    };
    
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      console.log('[WebSocket] 收到消息:', message);
      
      if (message.type === 'FULL') {
        this.emit('fullUpdate', message.data);
      } else if (message.type === 'UPDATE') {
        this.emit('incrementalUpdate', message.changes);
      }
    };
    
    this.ws.onclose = () => {
      console.log('[WebSocket] 连接关闭，准备重连...');
      this.emit('disconnected');
      setTimeout(() => this.connect(), this.reconnectInterval);
    };
    
    this.ws.onerror = (err) => {
      console.error('[WebSocket] 错误:', err);
      this.emit('error', err);
    };
  }
  
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }
  
  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(cb => cb(data));
    }
  }
  
  send(data) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
}

// 2. Dashboard 集成
const ws = new DashboardWebSocket('ws://localhost:3001');

// 全量更新（初次连接）
ws.on('fullUpdate', (data) => {
  dashboardData = data;
  updateStats();
  renderAgents();
  updateCharts();
});

// 增量更新（数据变更）
ws.on('incrementalUpdate', (changes) => {
  changes.forEach(change => {
    if (change.type === 'stats') {
      dashboardData.stats = change.data;
      updateStats();
    } else if (change.type === 'agent') {
      const index = dashboardData.agents.findIndex(a => a.id === change.data.id);
      if (index >= 0) {
        dashboardData.agents[index] = change.data;
        updateAgentCard(change.data.id); // 只更新单个卡片
      } else {
        dashboardData.agents.push(change.data);
        renderAgents(); // 新 Agent，重新渲染
      }
    }
  });
});

// 连接状态监控
ws.on('connected', () => {
  document.querySelector('.status').innerHTML = `
    <span class="dot"></span>
    实时数据 | 🟢 WebSocket 已连接
  `;
});

ws.on('disconnected', () => {
  document.querySelector('.status').innerHTML = `
    <span class="dot" style="background:#ff4757"></span>
    🔴 WebSocket 断开，尝试重连...
  `;
});
```

---

## 📊 性能对比

| 指标 | Phase 1 (轮询) | Phase 2 (WebSocket) | 提升 |
|------|---------------|---------------------|------|
| 数据延迟 | 0-10 秒 | <1 秒 | 10 倍 |
| 网络请求 | 6 次/分钟 | 1 次连接 + 变更推送 | 减少 90% |
| 服务器压力 | 高（持续轮询） | 低（按需推送） | 减少 80% |
| 实时性 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 显著提升 |
| 实现复杂度 | 低 | 中 | - |

---

## 🔧 实施步骤

### Day 1：后端 WebSocket 服务
- [ ] 安装 `ws` 库：`npm install ws`
- [ ] 创建 `websocket-server.js`
- [ ] 实现状态变更检测
- [ ] 测试 WebSocket 推送

### Day 2：前端 WebSocket 集成
- [ ] 创建 `DashboardWebSocket` 类
- [ ] 集成到 Dashboard v5.0
- [ ] 实现增量更新逻辑
- [ ] 添加连接状态指示器

### Day 3：测试与优化
- [ ] 多客户端并发测试
- [ ] 断线重连测试
- [ ] 性能压测
- [ ] 发布 v6.0

---

## 🎯 验收标准

1. **功能指标**
   - ✅ WebSocket 连接建立
   - ✅ 全量数据推送（初次连接）
   - ✅ 增量数据推送（状态变更）
   - ✅ 断线自动重连

2. **性能指标**
   - ✅ 数据延迟 < 1 秒
   - ✅ 网络请求减少 90%
   - ✅ 服务器 CPU 占用降低 50%

3. **用户体验指标**
   - ✅ 连接状态可视化
   - ✅ 数据更新平滑无闪烁
   - ✅ 弹窗保持（Phase 1 特性）

---

**下一步**：开始实施 Phase 2 后端 WebSocket 服务开发
