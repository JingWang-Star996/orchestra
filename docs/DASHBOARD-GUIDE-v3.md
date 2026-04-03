# Orchestra Dashboard 使用指南

**版本**: v3.0  
**日期**: 2026-04-03

---

## 🎯 问题说明

之前的 Dashboard 无法正常工作，原因：
1. ❌ 浏览器不能读取本地 JSON 文件（跨域限制）
2. ❌ 纯模拟数据没有实际价值
3. ❌ 需要 HTTP 服务器但配置复杂

---

## ✅ 解决方案

**Orchestra Dashboard v3.0** = **API 服务器** + **真实数据** + **自动更新**

```
┌─────────────────────┐     HTTP API      ┌──────────────────┐
│  agentExecutor.js   │ ────────────────> │  API 服务器       │
│  (Agent 执行器)      │  写入状态文件      │  (port:3000)     │
└─────────────────────┘                   └────────┬─────────┘
                                                   │
                                                   │ fetch /api/state
                                                   ▼
                                          ┌──────────────────┐
                                          │   Dashboard      │
                                          │  (浏览器打开)     │
                                          └──────────────────┘
```

---

## 🚀 快速开始

### 方式 1: 一键启动（推荐）

```bash
cd /home/z3129119/.openclaw/workspace/orchestra
node start-dashboard.js
```

**自动完成**：
- ✅ 启动 API 服务器（port 3000）
- ✅ 创建示例数据（如果不存在）
- ✅ 打开 Dashboard 页面

---

### 方式 2: 手动启动

**步骤 1: 启动 API 服务器**
```bash
cd orchestra
node orchestra-api-server.js
```

**步骤 2: 打开 Dashboard**
```bash
# Linux
xdg-open dashboard/ultimate-dashboard.html

# macOS
open dashboard/ultimate-dashboard.html

# Windows
start dashboard/ultimate-dashboard.html
```

或在浏览器访问：
```
file:///home/z3129119/.openclaw/workspace/orchestra/dashboard/ultimate-dashboard.html
```

---

## 📊 API 接口

### GET /api/state

获取当前状态

```bash
curl http://localhost:3000/api/state
```

**响应**：
```json
{
  "updatedAt": "2026-04-03T21:35:00.000Z",
  "stats": {
    "total": 16,
    "running": 5,
    "completed": 11,
    "failed": 0,
    "totalTokens": 350000,
    "avgDuration": 900000
  },
  "agents": [...],
  "tokenHistory": [...]
}
```

---

### POST /api/state

更新状态

```bash
curl -X POST http://localhost:3000/api/state \
  -H "Content-Type: application/json" \
  -d '{"stats": {"running": 6}}'
```

---

### GET /api/agents

获取 Agent 列表

```bash
curl http://localhost:3000/api/agents
```

---

### GET /health

健康检查

```bash
curl http://localhost:3000/health
```

**响应**：
```json
{
  "status": "ok",
  "timestamp": "2026-04-03T21:35:00.000Z",
  "port": 3000
}
```

---

## 🔧 集成到 Agent 执行器

修改 `agentExecutor.js`，在执行时自动更新状态：

```javascript
const { stateManager } = require('./stateManager');
const http = require('http');

// 发送状态更新到 API 服务器
async function updateState(state) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(state);
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/state',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };
    
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(JSON.parse(body)));
    });
    
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// 在 Agent 执行过程中调用
async function spawnAgent(name, task, options = {}) {
  // 1. 注册 Agent
  stateManager.register(agentId, name, { description: task });
  
  // 2. 启动执行
  const session = await sessions_spawn({...});
  
  // 3. 定期更新状态（每 10 秒）
  const interval = setInterval(async () => {
    const state = stateManager.toJSON();
    await updateState(state);  // ← 发送到 API 服务器
  }, 10000);
  
  // 4. 完成后更新
  stateManager.complete(agentId, result);
  await updateState(stateManager.toJSON());
  
  clearInterval(interval);
}
```

---

## 📁 文件结构

```
orchestra/
├── orchestra-api-server.js      # API 服务器
├── start-dashboard.js           # 一键启动脚本
├── stateManager.js              # 状态管理器
├── agentExecutor.js             # Agent 执行器（需集成 API 调用）
├── temp/
│   └── orchestra-state.json     # 状态文件
└── dashboard/
    └── ultimate-dashboard.html  # Dashboard 页面
```

---

## 🎯 Dashboard 功能

### 5 种实时图表

1. **📈 Token 消耗趋势** - 折线图（渐变面积）
2. **🥧 Agent 状态分布** - 环形图
3. **📅 任务时间线** - 甘特图
4. **📊 成本对比** - 柱状图
5. **✅ 任务成功率** - 饼图

### 6 个统计卡片

- 总 Agent 数
- 运行中
- 已完成
- 失败
- 总 Token
- 平均耗时

### Agent 详情

- 实时状态（运行中/已完成/失败）
- Token 消耗
- 工具调用次数
- 耗时
- 进度条

---

## ⚠️ 注意事项

1. **API 服务器必须运行** - Dashboard 从 `http://localhost:3000/api/state` 读取数据
2. **状态文件路径** - `temp/orchestra-state.json`
3. **端口配置** - 默认 3000，可通过 `ORCHESTRA_API_PORT` 环境变量修改
4. **跨域支持** - API 服务器已配置 CORS，支持本地访问

---

## 🐛 故障排查

### Dashboard 显示"无法连接到 API 服务器"

**原因**: API 服务器未启动

**解决**:
```bash
node orchestra-api-server.js
```

### 状态文件不存在

**原因**: 首次运行

**解决**: 运行启动脚本自动创建
```bash
node start-dashboard.js
```

### 端口被占用

**原因**: 3000 端口已被使用

**解决**: 使用其他端口
```bash
ORCHESTRA_API_PORT=3001 node orchestra-api-server.js
```

然后修改 Dashboard 中的 `API_BASE`：
```javascript
const API_BASE = 'http://localhost:3001';
```

---

## 📖 相关文档

- 状态管理器：`stateManager.js`
- Agent 执行器：`agentExecutor.js`
- 工作流引擎：`workflowEngine.js`
- 飞书推送：`docs/NOTIFICATION-GUIDE.md`

---

**维护者**: Orchestra Team  
**最后更新**: 2026-04-03
