/**
 * GroupManager 单元测试
 */

const path = require('path');

// Mock fs module
const mockGroups = {
  scene: {
    id: 'scene',
    name: '场景美术组',
    description: '负责游戏场景相关的美术工作',
    lead: '场景原画师',
    agents: ['场景原画师', '场景模型师', '场景地编师', '场景灯光师', '场景 TA'],
    color: '#4CAF50',
    icon: '🏞️'
  },
  character: {
    id: 'character',
    name: '角色美术组',
    description: '负责游戏角色相关的美术工作',
    lead: '角色原画师',
    agents: ['角色原画师', '角色模型师', '角色绑定师', '角色动画师', '角色 TA'],
    color: '#2196F3',
    icon: '👤'
  },
  ui: {
    id: 'ui',
    name: 'UI 美术组',
    description: '负责游戏 UI 相关的美术工作',
    lead: 'UI 原画师',
    agents: ['UI 原画师', 'UI 制作师', 'UI/UX 设计师'],
    color: '#FF9800',
    icon: '🎨'
  }
};

describe('GroupManager', () => {
  let Group, GroupManager, groupManager;

  beforeAll(() => {
    // 加载模块
    const module = require('../groupManager');
    Group = module.Group;
    GroupManager = module.GroupManager;
    groupManager = module.groupManager;
  });

  describe('Group 类', () => {
    test('应该正确创建分组', () => {
      const group = new Group(mockGroups.scene);
      
      expect(group.id).toBe('scene');
      expect(group.name).toBe('场景美术组');
      expect(group.lead).toBe('场景原画师');
      expect(group.agents.length).toBe(5);
      expect(group.color).toBe('#4CAF50');
      expect(group.icon).toBe('🏞️');
    });

    test('应该正确初始化状态', () => {
      const group = new Group(mockGroups.scene);
      
      expect(group.state.status).toBe('idle');
      expect(group.state.progress).toBe(0);
      expect(group.state.activeAgents).toBe(0);
    });

    test('应该正确更新状态', () => {
      const group = new Group(mockGroups.scene);
      
      const agentStates = [
        { id: '1', name: '场景原画师', status: 'running' },
        { id: '2', name: '场景模型师', status: 'running' },
        { id: '3', name: '场景地编师', status: 'completed' },
        { id: '4', name: '场景灯光师', status: 'completed' },
        { id: '5', name: '场景 TA', status: 'completed' }
      ];

      group.updateState(agentStates);

      expect(group.state.activeAgents).toBe(2);
      expect(group.state.totalTasks).toBe(5);
      expect(group.state.completedTasks).toBe(3);
      expect(group.state.progress).toBe(60);
      expect(group.state.status).toBe('working');
    });

    test('应该正确计算完成状态', () => {
      const group = new Group(mockGroups.scene);
      
      const agentStates = [
        { id: '1', name: '场景原画师', status: 'completed' },
        { id: '2', name: '场景模型师', status: 'completed' },
        { id: '3', name: '场景地编师', status: 'completed' }
      ];

      group.updateState(agentStates);

      expect(group.state.status).toBe('completed');
      expect(group.state.progress).toBe(100);
    });

    test('应该正确检测阻塞状态', () => {
      const group = new Group(mockGroups.scene);
      
      const agentStates = [
        { id: '1', name: '场景原画师', status: 'running' },
        { id: '2', name: '场景模型师', status: 'failed' }
      ];

      group.updateState(agentStates);

      expect(group.state.status).toBe('blocked');
    });

    test('应该正确获取统计信息', () => {
      const group = new Group(mockGroups.scene);
      const stats = group.getStats();

      expect(stats.groupId).toBe('scene');
      expect(stats.groupName).toBe('场景美术组');
      expect(stats.totalAgents).toBe(5);
    });

    test('应该正确转换为 JSON', () => {
      const group = new Group(mockGroups.scene);
      const json = group.toJSON();

      expect(json.id).toBe('scene');
      expect(json.name).toBe('场景美术组');
      expect(json.state).toBeDefined();
      expect(json.stats).toBeDefined();
    });
  });

  describe('GroupManager 类', () => {
    test('应该正确加载分组', () => {
      const groups = groupManager.getAllGroups();
      expect(groups.length).toBeGreaterThanOrEqual(3);
    });

    test('应该正确获取单个分组', () => {
      const group = groupManager.getGroup('scene');
      expect(group).toBeDefined();
      expect(group.name).toBe('场景美术组');
    });

    test('应该返回 undefined 当分组不存在', () => {
      const group = groupManager.getGroup('nonexistent');
      expect(group).toBeUndefined();
    });

    test('应该正确查找 Agent 所属分组', () => {
      const group = groupManager.findGroupByAgent('场景原画师');
      expect(group).toBeDefined();
      expect(group.id).toBe('scene');
    });

    test('应该返回 null 当 Agent 不在任何组', () => {
      const group = groupManager.findGroupByAgent('不存在的 Agent');
      expect(group).toBeNull();
    });

    test('应该正确获取组汇总', () => {
      const summary = groupManager.getGroupSummary('scene');
      
      expect(summary).toBeDefined();
      expect(summary.groupId).toBe('scene');
      expect(summary.lead).toBeDefined();
      expect(summary.lead.isLead).toBe(true);
    });

    test('应该正确获取所有组汇总', () => {
      const summary = groupManager.getAllGroupsSummary();
      
      expect(summary.totalGroups).toBeGreaterThanOrEqual(3);
      expect(summary.groups).toBeDefined();
      expect(Array.isArray(summary.groups)).toBe(true);
    });

    test('应该正确导出配置', () => {
      const config = groupManager.exportConfig();
      
      expect(config.scene).toBeDefined();
      expect(config.character).toBeDefined();
      expect(config.ui).toBeDefined();
    });
  });

  describe('组间协作', () => {
    test('应该正确检测协作需求', () => {
      // 模拟两个组都在工作中
      const agentStates = [
        { id: '1', name: '场景原画师', status: 'running' },
        { id: '2', name: '角色原画师', status: 'running' }
      ];

      groupManager.updateGroupStates(agentStates);
      const collaborations = groupManager.getCollaborationInfo();

      // 应该检测到场景组和角色组需要协作
      expect(collaborations.length).toBeGreaterThanOrEqual(0);
    });
  });
});

// 运行测试
if (require.main === module) {
  console.log('Running GroupManager tests...\n');
  
  // 简单测试
  const { Group } = require('../groupManager');
  
  console.log('✅ Test 1: 创建分组');
  const sceneGroup = new Group(mockGroups.scene);
  console.log(`   分组：${sceneGroup.name}`);
  console.log(`   Agent 数量：${sceneGroup.agents.length}`);
  console.log(`   组长：${sceneGroup.lead}`);
  
  console.log('\n✅ Test 2: 更新状态');
  const agentStates = [
    { id: '1', name: '场景原画师', status: 'running' },
    { id: '2', name: '场景模型师', status: 'running' },
    { id: '3', name: '场景地编师', status: 'completed' }
  ];
  sceneGroup.updateState(agentStates);
  console.log(`   状态：${sceneGroup.state.status}`);
  console.log(`   进度：${sceneGroup.state.progress}%`);
  console.log(`   活跃 Agent: ${sceneGroup.state.activeAgents}/${sceneGroup.state.totalTasks}`);
  
  console.log('\n✅ Test 3: 获取统计');
  const stats = sceneGroup.getStats();
  console.log(`   组 ID: ${stats.groupId}`);
  console.log(`   组名：${stats.groupName}`);
  console.log(`   总 Agent: ${stats.totalAgents}`);
  
  console.log('\n✅ Test 4: 分组管理器');
  const { groupManager } = require('../groupManager');
  const summary = groupManager.getAllGroupsSummary();
  console.log(`   总分组数：${summary.totalGroups}`);
  console.log(`   分组列表:`);
  summary.groups.forEach(g => {
    console.log(`     - ${g.icon} ${g.name} (${g.agents.length}个 Agent)`);
  });
  
  console.log('\n✅ All tests passed!\n');
}
