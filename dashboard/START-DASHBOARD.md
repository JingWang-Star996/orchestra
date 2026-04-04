# Orchestra Dashboard 启动指南

**版本**：v6.0 (Phase 2 + 3)  
**更新时间**：2026-04-04

---

## 🚀 快速启动

### 方式一：一键启动（推荐）

```bash
cd /home/z3129119/.openclaw/workspace/orchestra

# 启动 API 服务器 + WebSocket 服务器
node orchestra-api-server.js &
node websocket-server.js &

# 然后在浏览器打开
# http://localhost:3000/dashboard/index-v6.0.html
```

### 方式二：分别启动

#### 1. 启动 API 服务器
```bash
cd /home/z3129119/.openclaw/workspace/orchestra
node orchestra-api-server.js
```

#### 2. 启动 WebSocket 服务器
```bash
# 新终端窗口
cd /home/z3129119/.openclaw/workspace/orchestra
node websocket-server.js
```

#### 3. 访问 Dashboard
```
http://localhost:3000/dashboard/index-v6.0.html
```

---

## 📋 功能特性

### Phase 1 ✅
- ✅ 移除整页刷新
- ✅ sessionStorage 弹窗持久化
- ✅ 智能轮询（数据不变不刷新）
- ✅ 手动刷新按钮

### Phase 2 ✅
- ✅ WebSocket 实时推送
- ✅ 增量数据更新
- ✅ 断线自动重连
- ✅ 连接状态指示器

### Phase 3 ✅
- ✅ 刷新频率设置（5s/10s/30s/暂停）
- ✅ Agent 搜索功能
- ✅ 状态过滤
- ✅ 数据导出（JSON）
- ✅ 键盘快捷键（Ctrl+R/E, ESC）
- ✅ Toast 通知
- ✅ 差异化更新（状态变化高亮）

---

## 🎯 使用技巧

### 搜索 Agent
1. 在搜索框输入 Agent 名称
2. 实时过滤显示的卡片

### 过滤状态
1. 选择状态下拉框
2. 筛选运行中/已完成/失败的 Agent

### 导出数据
1. 点击"📥 导出 JSON"按钮
2. 保存当前所有 Agent 数据

### 快捷键
- `Ctrl + R` - 强制刷新
- `Ctrl + E` - 导出数据
- `ESC` - 关闭弹窗

### 刷新频率
- **5 秒**：实时监控，适合调试
- **10 秒**：标准模式，推荐
- **30 秒**：省电模式
- **暂停**：停止自动刷新

---

## 🔧 故障排查

### WebSocket 连接失败
```bash
# 检查 WebSocket 服务器是否运行
lsof -i :3001

# 如果没有输出，启动 WebSocket 服务器
node websocket-server.js
```

### API 请求失败
```bash
# 检查 API 服务器是否运行
lsof -i :3000

# 检查状态文件是否存在
ls -la temp/orchestra-state.json
```

### Dashboard 无法访问
```bash
# 检查端口占用
lsof -i :3000
lsof -i :3001

# 重启服务器
pkill -f orchestra-api-server.js
pkill -f websocket-server.js

node orchestra-api-server.js &
node websocket-server.js &
```

---

## 📊 版本对比

| 版本 | 刷新方式 | 延迟 | 特性 |
|------|---------|------|------|
| v4.2 | 整页刷新 | 10 秒 | 基础功能 |
| v5.0 | 智能轮询 | 10 秒 | 弹窗持久化 |
| **v6.0** | **WebSocket** | **<1 秒** | **实时推送 + 搜索过滤 + 数据导出** |

---

## 🎨 下一步优化（可选）

- [ ] 移动端底部抽屉弹窗
- [ ] 滑动操作支持
- [ ] 数字滚动动画
- [ ] 更多图表类型
- [ ] 用户认证

---

**享受实时监控的乐趣！** 🎉
