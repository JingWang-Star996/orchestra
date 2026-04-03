# 🎻 Orchestra 分组管理系统

> ⚡ **P2 功能已完成** - 大规模 Agent 协作支持

---

## 🚀 快速开始

### 3 步使用分组管理

```javascript
// 1. 加载模块
const { groupManager } = require('./groupManager');

// 2. 更新组状态
groupManager.updateGroupStates(agentStates);

// 3. 获取汇总
const summary = groupManager.getAllGroupsSummary();
console.log(`工作中：${summary.workingGroups} 组`);
```

---

## 📁 文件结构

```
orchestra/
├── groupManager.js              # 核心分组管理器
├── groups/                      # 分组配置目录
│   ├── scene.json              # 场景美术组
│   ├── character.json          # 角色美术组
│   └── ui.json                 # UI 美术组
├── dashboard/
│   └── groups-view.html        # Dashboard 示例页面
├── examples/
│   └── group-integration-example.js  # 集成示例
├── test/
│   └── groupManager.test.js    # 单元测试
└── docs/
    ├── GROUP-MANAGEMENT.md     # 完整使用指南
    ├── GROUP-QUICKREF.md       # 快速参考卡
    └── P2-GROUP-MANAGEMENT-COMPLETE.md  # 完成报告
```

---

## 🎯 核心功能

### 1. 分组定义

每个组是一个 JSON 配置文件：

```json
{
  "id": "scene",
  "name": "场景美术组",
  "lead": "场景原画师",
  "agents": ["场景原画师", "场景模型师", "场景地编师", "场景灯光师", "场景 TA"],
  "color": "#4CAF50",
  "icon": "🏞️"
}
```

### 2. 组内状态汇总

自动聚合组内所有 Agent 状态：

```javascript
const summary = groupManager.getGroupSummary('scene');
// {
//   state: {
//     status: 'working',
//     progress: 60,
//     activeAgents: 2,
//     completedTasks: 3,
//     totalTasks: 5
//   }
// }
```

### 3. 组长负责制

每个组有明确的负责人：

```javascript
const group = groupManager.getGroup('scene');
console.log(`组长：${group.lead}`); // 场景原画师
```

### 4. 组间协作

自动检测需要协作的组：

```javascript
const collaborations = groupManager.getCollaborationInfo();
// [{ group1: {...}, group2: {...}, reason: '...' }]
```

### 5. Dashboard 支持

完整的数据结构支持前端渲染：

```javascript
const data = groupManager.getAllGroupsSummary(agentStates);
// {
//   totalGroups: 3,
//   workingGroups: 1,
//   groups: [...]
// }
```

---

## 📖 文档导航

| 文档 | 说明 | 适合人群 |
|------|------|----------|
| [GROUP-MANAGEMENT.md](./docs/GROUP-MANAGEMENT.md) | 完整使用指南（400+ 行） | 开发者 |
| [GROUP-QUICKREF.md](./docs/GROUP-QUICKREF.md) | 快速参考卡（200+ 行） | 所有人 |
| [P2-GROUP-MANAGEMENT-COMPLETE.md](./docs/P2-GROUP-MANAGEMENT-COMPLETE.md) | 完成报告 | 项目管理者 |

---

## 🧪 测试

### 运行示例

```bash
cd orchestra
node examples/group-integration-example.js
```

### 运行测试

```bash
cd orchestra
npm test -- groupManager.test.js
```

---

## 💡 使用场景

### 场景 1: 查看某个组的状态

```javascript
const sceneGroup = groupManager.getGroupSummary('scene');
console.log(`${sceneGroup.groupName}: ${sceneGroup.state.progress}%`);
```

### 场景 2: 查找 Agent 所属分组

```javascript
const group = groupManager.findGroupByAgent('场景原画师');
if (group) {
  console.log(`属于：${group.name}`);
}
```

### 场景 3: 实时更新 Dashboard

```javascript
setInterval(() => {
  const agentStates = stateManager.getAllStates();
  groupManager.updateGroupStates(agentStates);
  
  const summary = groupManager.getAllGroupsSummary();
  wsServer.broadcast('groups:update', summary);
}, 5000);
```

### 场景 4: 添加新分组

```javascript
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

## 📊 Dashboard 预览

访问 `dashboard/groups-view.html` 查看示例页面：

- ✅ 分组卡片展示
- ✅ 实时状态更新
- ✅ 进度条动画
- ✅ Agent 状态指示器
- ✅ 协作警报提示

---

## 🔧 API 参考

### GroupManager 类

| 方法 | 说明 | 返回值 |
|------|------|--------|
| `getAllGroups()` | 获取所有分组 | `Group[]` |
| `getGroup(id)` | 获取单个分组 | `Group` |
| `getGroupSummary(id)` | 获取组汇总 | `Object` |
| `getAllGroupsSummary(states?)` | 获取所有组汇总 | `Object` |
| `findGroupByAgent(name)` | 查找 Agent 所属组 | `Group\|null` |
| `updateGroupStates(states)` | 更新组状态 | `void` |
| `getCollaborationInfo()` | 获取协作信息 | `Array` |
| `addGroup(config)` | 添加分组 | `Group` |
| `exportConfig()` | 导出配置 | `Object` |
| `importConfig(config)` | 导入配置 | `void` |

---

## 🎨 现有分组

| ID | 名称 | 组长 | Agent 数量 | 颜色 |
|----|------|------|-----------|------|
| scene | 场景美术组 | 场景原画师 | 5 | 🟢 #4CAF50 |
| character | 角色美术组 | 角色原画师 | 5 | 🔵 #2196F3 |
| ui | UI 美术组 | UI 原画师 | 3 | 🟠 #FF9800 |

---

## ⚡ 性能建议

- **更新频率**: 每 5-10 秒更新一次状态
- **按需加载**: 只在状态变化时更新 Dashboard
- **增量同步**: 使用 WebSocket 推送，避免轮询
- **缓存汇总**: 缓存 `getAllGroupsSummary()` 结果

---

## 🐛 故障排查

### 问题：分组未加载

```bash
# 检查配置文件
ls -la orchestra/groups/
cat orchestra/groups/scene.json
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

---

## 📞 支持

- **完整文档**: `docs/GROUP-MANAGEMENT.md`
- **快速参考**: `docs/GROUP-QUICKREF.md`
- **示例代码**: `examples/group-integration-example.js`
- **完成报告**: `docs/P2-GROUP-MANAGEMENT-COMPLETE.md`

---

## ✅ P2 完成状态

| 需求 | 状态 |
|------|------|
| 分组定义 | ✅ |
| 组内状态汇总 | ✅ |
| 组长负责制 | ✅ |
| 组间协作支持 | ✅ |
| Dashboard 分组视图 | ✅ |
| 文档完整 | ✅ |
| 测试覆盖 | ✅ |

**完成度**: 100% ✅

---

**🎉 P2 分组管理功能已开发完成！**

开始使用：`const { groupManager } = require('./groupManager');`
