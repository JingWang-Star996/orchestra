# Orchestra Dashboard Phase 3 - 用户体验优化方案

**版本**：v6.0 → v7.0  
**目标**：全面提升用户体验，达到产品级品质  
**预计时间**：1 周

---

## 🎨 优化清单

### 1. 视觉动画优化

#### 数字滚动动画
```javascript
// 统计数字滚动效果
function animateValue(element, start, end, duration = 500) {
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    element.textContent = Math.floor(progress * (end - start) + start).toLocaleString();
    if (progress < 1) {
      window.requestAnimationFrame(step);
    }
  };
  window.requestAnimationFrame(step);
}

// 使用示例
animateValue(
  document.getElementById('runningAgents'),
  oldValue,
  newValue,
  500
);
```

#### Agent 卡片状态变化高亮
```css
/* 状态变化时脉冲高亮 */
@keyframes status-change {
  0% { box-shadow: 0 0 0 0 rgba(30, 144, 255, 0.7); }
  50% { box-shadow: 0 0 0 10px rgba(30, 144, 255, 0); }
  100% { box-shadow: 0 0 0 0 rgba(30, 144, 255, 0); }
}

.agent-card.status-changed {
  animation: status-change 0.5s ease-out;
}
```

#### 图表平滑过渡
```javascript
// Chart.js 配置优化
const chartOptions = {
  animation: {
    duration: 300,
    easing: 'easeOutQuart'
  },
  transitions: {
    active: {
      animation: {
        duration: 300
      }
    }
  }
};
```

---

### 2. 刷新频率设置

```html
<!-- 设置面板 -->
<div class="settings-panel">
  <h4>⚙️ 刷新设置</h4>
  <select id="refreshInterval" onchange="updateRefreshInterval()">
    <option value="5000">5 秒（实时）</option>
    <option value="10000" selected>10 秒（标准）</option>
    <option value="30000">30 秒（省电）</option>
    <option value="0">⏸️ 暂停刷新</option>
  </select>
</div>

<script>
function updateRefreshInterval() {
  const interval = document.getElementById('refreshInterval').value;
  if (mainInterval) clearInterval(mainInterval);
  
  if (interval > 0) {
    mainInterval = setInterval(main, parseInt(interval));
    console.log(`[Dashboard] 刷新间隔：${interval}ms`);
  } else {
    console.log('[Dashboard] 刷新已暂停');
  }
  
  // 保存到 localStorage
  localStorage.setItem('dashboard_refresh_interval', interval);
}

// 页面加载时恢复设置
function loadSettings() {
  const interval = localStorage.getItem('dashboard_refresh_interval') || '10000';
  document.getElementById('refreshInterval').value = interval;
  updateRefreshInterval();
}
</script>
```

---

### 3. 更新通知系统

```javascript
// 重要更新通知
function showUpdateNotification(changes) {
  const importantChanges = changes.filter(c => {
    return c.type === 'agent' && c.data.status === 'failed';
  });
  
  if (importantChanges.length > 0) {
    const notification = document.createElement('div');
    notification.className = 'toast-notification';
    notification.innerHTML = `
      🔔 有 ${importantChanges.length} 个 Agent 状态变化
      <br><small>点击查看详情</small>
    `;
    notification.onclick = () => {
      // 滚动到变化的 Agent
      importantChanges.forEach(change => {
        const card = document.querySelector(`.agent-card[data-id="${change.data.id}"]`);
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.style.animation = 'pulse-border 0.5s 3';
        }
      });
      notification.remove();
    };
    document.body.appendChild(notification);
    
    // 3 秒后自动消失
    setTimeout(() => notification.remove(), 3000);
  }
}
```

```css
/* Toast 通知样式 */
.toast-notification {
  position: fixed;
  bottom: 20px;
  right: 20px;
  background: linear-gradient(135deg, #1e90ff, #00ff88);
  color: #fff;
  padding: 15px 25px;
  border-radius: 10px;
  box-shadow: 0 5px 20px rgba(0, 255, 136, 0.4);
  cursor: pointer;
  z-index: 2000;
  animation: slide-in-right 0.3s ease-out;
}

@keyframes slide-in-right {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
```

---

### 4. 移动端优化

#### 底部抽屉式弹窗
```css
/* 移动端弹窗样式 */
@media (max-width: 768px) {
  .modal .modal-content {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    max-height: 80vh;
    border-radius: 20px 20px 0 0;
    transform: translateY(100%);
    transition: transform 0.3s ease-out;
  }
  
  .modal.show .modal-content {
    transform: translateY(0);
  }
}
```

#### 卡片滑动操作
```javascript
// 支持滑动查看 Agent 详情
let touchStartX = 0;
let touchEndX = 0;

document.querySelectorAll('.agent-card').forEach(card => {
  card.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
  });
  
  card.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe(card);
  });
});

function handleSwipe(card) {
  const swipeThreshold = 50;
  const diff = touchStartX - touchEndX;
  
  if (Math.abs(diff) > swipeThreshold) {
    if (diff > 0) {
      // 左滑：查看详情
      const agentId = card.dataset.id;
      const agentName = card.querySelector('.agent-name').textContent;
      showToolDetails(agentId, agentName, 0);
    } else {
      // 右滑：复制 Agent ID
      const agentId = card.dataset.id;
      navigator.clipboard.writeText(agentId);
      showToast('✅ 已复制 Agent ID');
    }
  }
}
```

---

### 5. 搜索与过滤

```html
<!-- 搜索栏 -->
<div class="search-bar">
  <input 
    type="text" 
    id="agentSearch" 
    placeholder="🔍 搜索 Agent..."
    oninput="filterAgents()"
  >
  <select id="statusFilter" onchange="filterAgents()">
    <option value="">全部状态</option>
    <option value="running">🔄 运行中</option>
    <option value="completed">✅ 已完成</option>
    <option value="failed">❌ 失败</option>
  </select>
</div>

<script>
function filterAgents() {
  const searchTerm = document.getElementById('agentSearch').value.toLowerCase();
  const statusFilter = document.getElementById('statusFilter').value;
  
  document.querySelectorAll('.agent-card').forEach(card => {
    const name = card.querySelector('.agent-name').textContent.toLowerCase();
    const status = card.querySelector('.agent-status').classList.contains(statusFilter);
    
    const matchesSearch = !searchTerm || name.includes(searchTerm);
    const matchesStatus = !statusFilter || status;
    
    card.style.display = (matchesSearch && matchesStatus) ? '' : 'none';
  });
}
</script>
```

---

### 6. 数据导出功能

```javascript
// 导出当前数据为 JSON
function exportData() {
  const data = {
    timestamp: new Date().toISOString(),
    stats: dashboardData.stats,
    agents: dashboardData.agents
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `orchestra-dashboard-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  
  showToast('📥 数据已导出');
}

// 导出为 CSV
function exportToCSV() {
  const headers = ['ID', '名称', '状态', 'Tokens', '工具数', '耗时'];
  const rows = dashboardData.agents.map(agent => [
    agent.id,
    agent.name,
    agent.status,
    agent.tokens || agent.progress?.tokenCount || 0,
    agent.tools || agent.progress?.toolUseCount || 0,
    ((Date.now() - agent.startTime) / 60000).toFixed(1) + 'm'
  ]);
  
  const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `orchestra-dashboard-${Date.now()}.csv`;
  a.click();
  
  showToast('📥 CSV 已导出');
}
```

---

### 7. 键盘快捷键

```javascript
// 键盘快捷键
document.addEventListener('keydown', (e) => {
  // Ctrl/Cmd + F: 聚焦搜索框
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault();
    document.getElementById('agentSearch').focus();
  }
  
  // Ctrl/Cmd + R: 强制刷新
  if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
    e.preventDefault();
    forceRefresh();
  }
  
  // Ctrl/Cmd + E: 导出数据
  if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
    e.preventDefault();
    exportData();
  }
  
  // ESC: 关闭弹窗
  if (e.key === 'Escape') {
    closeModal();
  }
});

// 显示快捷键帮助
function showShortcuts() {
  alert(`
⌨️ 快捷键帮助:
  Ctrl+F - 搜索 Agent
  Ctrl+R - 强制刷新
  Ctrl+E - 导出数据
  ESC - 关闭弹窗
  `);
}
```

---

## 📊 Phase 3 验收标准

| 功能 | 验收标准 | 优先级 |
|------|---------|--------|
| 数字滚动动画 | 数值变化时平滑滚动 | P1 |
| 状态变化高亮 | Agent 状态变化时脉冲效果 | P1 |
| 刷新频率设置 | 支持 5s/10s/30s/暂停 | P1 |
| 更新通知 | 重要变化 Toast 提示 | P2 |
| 移动端优化 | 底部抽屉 + 滑动操作 | P2 |
| 搜索过滤 | 按名称搜索 + 状态过滤 | P1 |
| 数据导出 | JSON + CSV 格式 | P2 |
| 键盘快捷键 | Ctrl+F/R/E/ESC | P3 |

---

## 📅 实施计划

| 时间 | 任务 | 负责人 |
|------|------|--------|
| Day 1 | 动画效果（数字滚动/状态高亮） | 前端 |
| Day 2 | 刷新设置 + 通知系统 | 前端 |
| Day 3 | 移动端优化（抽屉 + 滑动） | 前端 + UX |
| Day 4 | 搜索过滤功能 | 前端 |
| Day 5 | 数据导出 + 快捷键 | 前端 |
| Day 6-7 | 测试 + 优化 | 全员 |

---

**Phase 3 完成后，Dashboard 将达到产品级品质！** 🎉
