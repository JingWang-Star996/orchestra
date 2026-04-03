# Orchestra 分组管理指南

> 📋 **版本**: 1.0.0 | **优先级**: P2 | **状态**: ✅ 已完成

## 📖 目录

- [概述](#概述)
- [快速开始](#快速开始)
- [分组配置](#分组配置)
- [API 使用](#api-使用)
- [Dashboard 集成](#dashboard-集成)
- [最佳实践](#最佳实践)
- [故障排查](#故障排查)

---

## 概述

Orchestra 分组管理系统支持大规模 Agent 协作，通过**组长负责制**和**组内状态汇总**实现高效的团队管理。

### 核心特性

- ✅ **分组定义**: 灵活的 JSON 配置文件
- ✅ **组长负责制**: 每个组有明确的负责人
- ✅ **状态汇总**: 自动聚合组内 Agent 状态
- ✅ **进度追踪**: 实时计算组进度条
- ✅ **组间协作**: 识别需要协作的组
- ✅ **Dashboard 支持**: 提供完整的视图数据

### 架构图

```
┌─────────────────────────────────────────────────┐
│              Orchestra Gateway                   │
├─────────────────────────────────────────────────┤
│  groupManager.js                                │
│  ┌─────────────────────────────────────────┐   │
│  │  GroupManager (单例)                     │   │
│  │  - loadGroups()                          │   │
│  │  - updateGroupStates()                   │   │
│  │  - getAllGroupsSummary()                 │   │
│  └─────────────────────────────────────────┘   │
├─────────────────────────────────────────────────┤
│  groups/ (配置目录)                             │
│  - scene.json      (场景美术组)                │
│  - character.json  (角色美术组)                │
│  - ui.json         (UI 美术组)                 │
└─────────────────────────────────────────────────┘
```

---

## 快速开始

### 1. 加载分组管理器

```javascript
const { groupManager } = require('./groupManager');

// 获取所有分组
const summary = groupManager.getAllGroupsSummary();
console.log(`共有 ${summary.totalGroups} 个分组`);
```

### 2. 查看组状态

```javascript
// 获取特定组的汇总信息
const sceneSummary = groupManager.getGroupSummary('scene');
console.log(sceneSummary);

// 输出:
// {
//   groupId: 'scene',
//   groupName: '场景美术组',
//   lead: { name: '场景原画师', isLead: true },
//   stats: { ... },
//   agents: [...],
//   state: { ... }
// }
```

### 3. 更新组状态

```javascript
// 假设从 stateManager 获取了所有 Agent 状态
const agentStates = [
  { id: 'agent-1', name: '场景原画师', status: 'running' },
  { id: 'agent-2', name: '场景模型师', status: 'completed' },
  // ...
];

// 更新所有组的状态
groupManager.updateGroupStates(agentStates);

// 获取更新后的汇总
const summary = groupManager.getAllGroupsSummary();
```

---

## 分组配置

### 配置文件结构

每个分组是一个 JSON 文件，位于 `groups/` 目录：

```json
{
  "id": "scene",
  "name": "场景美术组",
  "description": "负责游戏场景相关的美术工作",
  "lead": "场景原画师",
  "agents": [
    "场景原画师",
    "场景模型师",
    "场景地编师",
    "场景灯光师",
    "场景 TA"
  ],
  "color": "#4CAF50",
  "icon": "🏞️"
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | 分组唯一标识符 |
| `name` | string | ✅ | 分组显示名称 |
| `description` | string | ❌ | 分组描述 |
| `lead` | string | ✅ | 组长 Agent 名称 |
| `agents` | array | ✅ | 组内所有 Agent 名称列表 |
| `color` | string | ❌ | 主题色（Hex），默认灰色 |
| `icon` | string | ❌ | Emoji 图标，默认📦 |

### 创建新分组

#### 方法 1: 手动创建文件

在 `groups/` 目录创建新的 JSON 文件：

```bash
# groups/effect.json
{
  "id": "effect",
  "name": "特效美术组",
  "lead": "特效组长",
  "agents": ["特效组长", "特效师 A", "特效师 B"],
  "color": "#E91E63",
  "icon": "✨"
}
```

#### 方法 2: 使用 API

```javascript
const { groupManager } = require('./groupManager');

groupManager.addGroup({
  id: 'effect',
  name: '特效美术组',
  description: '负责游戏特效制作',
  lead: '特效组长',
  agents: ['特效组长', '特效师 A', '特效师 B'],
  color: '#E91E63',
  icon: '✨'
});
```

---

## API 使用

### GroupManager 类

#### 构造函数

```javascript
const manager = new GroupManager();
// 自动加载 groups/ 目录下的所有配置
```

#### 实例方法

##### `loadGroups()`

重新加载所有分组配置。

```javascript
manager.loadGroups();
```

##### `addGroup(config)`

添加新分组。

```javascript
const group = manager.addGroup({
  id: 'test',
  name: '测试组',
  lead: '测试组长',
  agents: ['测试 A', '测试 B']
});
```

##### `getGroup(groupId)`

获取分组对象。

```javascript
const sceneGroup = manager.getGroup('scene');
```

##### `getAllGroups()`

获取所有分组对象数组。

```javascript
const allGroups = manager.getAllGroups();
```

##### `findGroupByAgent(agentName)`

根据 Agent 名称查找所属分组。

```javascript
const group = manager.findGroupByAgent('场景原画师');
if (group) {
  console.log(`属于：${group.name}`);
}
```

##### `updateGroupStates(agentStates)`

批量更新所有组的状态。

```javascript
manager.updateGroupStates(agentStates);
```

##### `getGroupSummary(groupId)`

获取单个组的汇总信息。

```javascript
const summary = manager.getGroupSummary('scene');
```

##### `getAllGroupsSummary(agentStates?)`

获取所有组的汇总信息（用于 Dashboard）。

```javascript
// 不传参数，使用当前状态
const summary = manager.getAllGroupsSummary();

// 传入 agentStates，先更新再返回
const summary = manager.getAllGroupsSummary(agentStates);
```

##### `getCollaborationInfo()`

获取组间协作信息。

```javascript
const collaborations = manager.getCollaborationInfo();
collaborations.forEach(collab => {
  console.log(`${collab.group1.name} ↔ ${collab.group2.name}`);
});
```

##### `exportConfig()`

导出所有分组配置。

```javascript
const config = manager.exportConfig();
fs.writeFileSync('backup.json', JSON.stringify(config, null, 2));
```

##### `importConfig(config)`

导入分组配置。

```javascript
const config = JSON.parse(fs.readFileSync('backup.json', 'utf-8'));
manager.importConfig(config);
```

---

## Dashboard 集成

### 数据结构

`getAllGroupsSummary()` 返回的数据适合直接用于 Dashboard：

```javascript
{
  totalGroups: 3,
  workingGroups: 1,
  blockedGroups: 0,
  completedGroups: 2,
  groups: [
    {
      id: "scene",
      name: "场景美术组",
      icon: "🏞️",
      color: "#4CAF50",
      lead: "场景原画师",
      agents: [...],
      state: {
        status: "working",
        progress: 60,
        activeAgents: 3,
        totalTasks: 5,
        completedTasks: 3,
        lastUpdate: 1775294400000
      },
      stats: { ... }
    },
    // ...
  ]
}
```

### 前端示例

```javascript
// 从 API 获取数据
async function loadGroupDashboard() {
  const response = await fetch('/api/groups/summary');
  const data = await response.json();
  
  // 渲染分组卡片
  const container = document.getElementById('groups-container');
  container.innerHTML = data.groups.map(group => `
    <div class="group-card" style="border-left-color: ${group.color}">
      <div class="group-header">
        <span class="group-icon">${group.icon}</span>
        <h3>${group.name}</h3>
        <span class="group-lead">组长：${group.lead}</span>
      </div>
      <div class="group-progress">
        <div class="progress-bar" style="width: ${group.state.progress}%"></div>
      </div>
      <div class="group-stats">
        <span>进度：${group.state.progress}%</span>
        <span>活跃：${group.state.activeAgents}/${group.agents.length}</span>
        <span class="status-${group.state.status}">${group.state.status}</span>
      </div>
    </div>
  `).join('');
}
```

### CSS 样式建议

```css
.group-card {
  background: white;
  border-radius: 8px;
  padding: 16px;
  margin: 12px 0;
  border-left: 4px solid #9E9E9E;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.group-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.group-icon {
  font-size: 24px;
}

.group-progress {
  height: 8px;
  background: #f0f0f0;
  border-radius: 4px;
  overflow: hidden;
  margin: 12px 0;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #4CAF50, #8BC34A);
  transition: width 0.3s ease;
}

.group-stats {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  color: #666;
}

.status-working { color: #2196F3; }
.status-blocked { color: #F44336; }
.status-idle { color: #9E9E9E; }
.status-completed { color: #4CAF50; }
```

---

## 最佳实践

### 1. 分组设计原则

- **规模适中**: 每组 3-7 个 Agent 最佳
- **职责明确**: 每组有清晰的专业领域
- **组长能力**: 组长应该是组内最资深的 Agent
- **颜色区分**: 使用不同颜色便于视觉识别

### 2. 状态更新频率

```javascript
// 推荐：每 5-10 秒更新一次
setInterval(() => {
  const agentStates = getAgentStates(); // 从 stateManager 获取
  groupManager.updateGroupStates(agentStates);
  
  // 如果有 WebSocket，推送更新
  wsServer.broadcast('groups:update', groupManager.getAllGroupsSummary());
}, 5000);
```

### 3. 组间协作处理

```javascript
// 定期检查需要协作的组
setInterval(() => {
  const collaborations = groupManager.getCollaborationInfo();
  
  for (const collab of collaborations) {
    console.log(`🤝 ${collab.group1.name} 和 ${collab.group2.name} 需要协作`);
    
    // 可以触发通知或自动协调
    notifyLeads(collab);
  }
}, 30000); // 每 30 秒检查一次
```

### 4. 性能优化

- **按需更新**: 只在状态变化时更新 Dashboard
- **增量同步**: 使用 WebSocket 推送变化，避免轮询
- **缓存汇总**: 缓存 `getAllGroupsSummary()` 结果

---

## 故障排查

### 问题 1: 分组未加载

**症状**: `getAllGroups()` 返回空数组

**检查**:
```bash
# 确认 groups/ 目录存在
ls -la orchestra/groups/

# 确认 JSON 文件有效
cat orchestra/groups/scene.json | jq .
```

**解决**:
```javascript
// 手动重新加载
groupManager.loadGroups();
```

### 问题 2: Agent 不在任何组

**症状**: `findGroupByAgent()` 返回 null

**检查**:
```javascript
const group = groupManager.findGroupByAgent('Agent 名称');
if (!group) {
  console.log('该 Agent 不属于任何分组');
}
```

**解决**: 将该 Agent 添加到对应分组的配置中。

### 问题 3: 进度计算错误

**症状**: 组进度与实际不符

**检查**:
```javascript
const summary = groupManager.getGroupSummary('scene');
console.log('Agent 状态:', summary.agents);
console.log('组状态:', summary.state);
```

**解决**: 确保传入了正确的 `agentStates` 到 `updateGroupStates()`。

---

## 示例代码

### 完整工作流

```javascript
const { groupManager } = require('./groupManager');
const { stateManager } = require('./stateManager');

// 1. 初始化
console.log(`加载了 ${groupManager.getAllGroups().length} 个分组`);

// 2. 定期同步状态
function syncGroupStates() {
  const agentStates = stateManager.getAllStates();
  groupManager.updateGroupStates(agentStates);
  
  // 3. 发送到 Dashboard
  const summary = groupManager.getAllGroupsSummary();
  dashboardApi.updateGroups(summary);
  
  // 4. 检查协作需求
  const collaborations = groupManager.getCollaborationInfo();
  if (collaborations.length > 0) {
    console.log('需要协作:', collaborations);
  }
}

// 每 5 秒同步一次
setInterval(syncGroupStates, 5000);

// 5. 手动添加新分组（可选）
groupManager.addGroup({
  id: 'audio',
  name: '音频组',
  lead: '音频总监',
  agents: ['音频总监', '音效师', '配乐师'],
  color: '#9C27B0',
  icon: '🎵'
});
```

---

## 相关文件

- `groupManager.js` - 分组管理器核心
- `groups/*.json` - 分组配置文件
- `stateManager.js` - Agent 状态管理
- `dashboard/app.js` - Dashboard 前端集成

---

## 更新日志

### v1.0.0 (2026-04-03)

- ✅ 初始版本
- ✅ 分组配置加载
- ✅ 组状态汇总
- ✅ 组长负责制
- ✅ Dashboard 数据支持
- ✅ 组间协作检测

---

**维护者**: Orchestra Team  
**最后更新**: 2026-04-03
