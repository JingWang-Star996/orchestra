# Orchestra 分组管理 - 快速参考

> ⚡ 5 分钟快速上手分组管理功能

## 一、核心概念

```
分组 (Group) = Agent 团队
  ├─ 组长 (Lead): 负责人，组长负责制
  ├─ 成员 (Agents): 组内所有 Agent
  ├─ 状态 (State): 组整体状态
  └─ 进度 (Progress): 自动计算
```

## 二、立即开始

### 1. 加载分组管理器

```javascript
const { groupManager } = require('./groupManager');
```

### 2. 查看所有分组

```javascript
const summary = groupManager.getAllGroupsSummary();
console.log(`共有 ${summary.totalGroups} 个分组`);
```

### 3. 更新组状态

```javascript
// 从 stateManager 获取所有 Agent 状态
const agentStates = stateManager.getAllStates();

// 更新所有组的状态
groupManager.updateGroupStates(agentStates);
```

### 4. 获取单个组信息

```javascript
const sceneGroup = groupManager.getGroupSummary('scene');
console.log(`组长：${sceneGroup.lead.name}`);
console.log(`进度：${sceneGroup.state.progress}%`);
```

## 三、配置文件

### 分组配置示例 (`groups/scene.json`)

```json
{
  "id": "scene",              // 分组 ID（唯一）
  "name": "场景美术组",        // 显示名称
  "description": "...",       // 描述（可选）
  "lead": "场景原画师",        // 组长
  "agents": [...],            // 成员列表
  "color": "#4CAF50",         // 主题色
  "icon": "🏞️"                // Emoji 图标
}
```

### 现有分组

| ID | 名称 | 组长 | Agent 数量 |
|----|------|------|-----------|
| scene | 场景美术组 | 场景原画师 | 5 |
| character | 角色美术组 | 角色原画师 | 5 |
| ui | UI 美术组 | UI 原画师 | 3 |

## 四、常用 API

### 获取信息

```javascript
// 所有分组
groupManager.getAllGroups()

// 所有分组汇总（Dashboard 用）
groupManager.getAllGroupsSummary(agentStates?)

// 单个分组
groupManager.getGroup('scene')

// 单个分组汇总
groupManager.getGroupSummary('scene')

// 查找 Agent 所属分组
groupManager.findGroupByAgent('场景原画师')
```

### 管理分组

```javascript
// 添加分组
groupManager.addGroup({...config})

// 重新加载配置
groupManager.loadGroups()

// 导出配置
const config = groupManager.exportConfig()

// 导入配置
groupManager.importConfig(config)
```

### 状态管理

```javascript
// 更新所有组状态
groupManager.updateGroupStates(agentStates)

// 获取组间协作信息
const collaborations = groupManager.getCollaborationInfo()
```

## 五、Dashboard 集成

### 数据结构

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
        status: "working",    // idle | working | blocked | completed
        progress: 60,         // 0-100
        activeAgents: 2,      // 工作中的 Agent 数
        totalTasks: 5,        // 总任务数
        completedTasks: 3,    // 已完成任务数
        lastUpdate: 1234567890
      }
    }
  ]
}
```

### 实时更新

```javascript
// 每 5 秒更新一次
setInterval(() => {
  const agentStates = stateManager.getAllStates();
  const summary = groupManager.getAllGroupsSummary(agentStates);
  
  // 发送到前端
  wsServer.broadcast('groups:update', summary);
}, 5000);
```

## 六、组间协作

### 检测协作需求

```javascript
const collaborations = groupManager.getCollaborationInfo();

collaborations.forEach(collab => {
  console.log(`${collab.group1.name} ↔ ${collab.group2.name}`);
  console.log(`原因：${collab.reason}`);
});
```

### 触发条件

- 两个或多个组同时处于 `working` 状态
- 自动识别并提示需要协作

## 七、最佳实践

### ✅ 推荐

- 每组 3-7 个 Agent（规模适中）
- 每 5-10 秒更新一次状态
- 使用不同颜色区分组
- 组长应该是组内最资深的 Agent

### ❌ 避免

- 组过大（>10 个 Agent）
- 频繁更新（<1 秒）
- 职责重叠的分组

## 八、故障排查

### 问题：分组未加载

```bash
# 检查配置文件
ls -la orchestra/groups/
cat orchestra/groups/scene.json | jq .
```

```javascript
// 手动重新加载
groupManager.loadGroups();
```

### 问题：Agent 不在任何组

```javascript
const group = groupManager.findGroupByAgent('Agent 名称');
if (!group) {
  console.log('该 Agent 不属于任何分组');
  // 添加到对应分组配置
}
```

### 问题：进度不正确

```javascript
// 检查 agentStates 是否正确
const agentStates = stateManager.getAllStates();
console.log(agentStates);

// 确保传入 updateGroupStates
groupManager.updateGroupStates(agentStates);
```

## 九、完整示例

```javascript
const { groupManager } = require('./groupManager');
const { stateManager } = require('./stateManager');

// 1. 初始化
console.log(`加载了 ${groupManager.getAllGroups().length} 个分组`);

// 2. 定期同步状态
function syncGroupStates() {
  const agentStates = stateManager.getAllStates();
  groupManager.updateGroupStates(agentStates);
  
  // 3. 获取汇总
  const summary = groupManager.getAllGroupsSummary();
  
  // 4. 发送到 Dashboard
  dashboardApi.updateGroups(summary);
  
  // 5. 检查协作
  const collaborations = groupManager.getCollaborationInfo();
  collaborations.forEach(c => {
    console.log(`🤝 ${c.group1.name} 和 ${c.group2.name} 需要协作`);
  });
}

// 每 5 秒同步一次
setInterval(syncGroupStates, 5000);

// 6. 添加新分组（可选）
groupManager.addGroup({
  id: 'audio',
  name: '音频组',
  lead: '音频总监',
  agents: ['音频总监', '音效师', '配乐师'],
  color: '#9C27B0',
  icon: '🎵'
});
```

## 十、相关文件

| 文件 | 说明 |
|------|------|
| `groupManager.js` | 分组管理器核心 |
| `groups/*.json` | 分组配置文件 |
| `dashboard/groups-view.html` | Dashboard 示例 |
| `docs/GROUP-MANAGEMENT.md` | 完整文档 |
| `test/groupManager.test.js` | 单元测试 |

---

**快速参考卡** - 打印贴在桌边！ 📌
