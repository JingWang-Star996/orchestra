#!/usr/bin/env node

/**
 * Orchestra 分组管理集成示例
 * 
 * 展示如何在实际项目中集成分组管理功能
 */

const path = require('path');
const { groupManager } = require('../groupManager');

console.log('=== Orchestra 分组管理集成示例 ===\n');

// ============================================
// 示例 1: 基本使用
// ============================================
console.log('📋 示例 1: 基本使用\n');

// 获取所有分组
const allGroups = groupManager.getAllGroups();
console.log(`已加载 ${allGroups.length} 个分组:`);
allGroups.forEach(g => {
  console.log(`  - ${g.icon} ${g.name} (${g.agents.length}个 Agent, 组长：${g.lead})`);
});

// ============================================
// 示例 2: 状态同步
// ============================================
console.log('\n\n📊 示例 2: 状态同步\n');

// 模拟从 stateManager 获取的 Agent 状态
const mockAgentStates = [
  { id: 'agent-1', name: '场景原画师', status: 'running', progress: 60 },
  { id: 'agent-2', name: '场景模型师', status: 'running', progress: 40 },
  { id: 'agent-3', name: '场景地编师', status: 'completed', progress: 100 },
  { id: 'agent-4', name: '场景灯光师', status: 'pending', progress: 0 },
  { id: 'agent-5', name: '场景 TA', status: 'pending', progress: 0 },
  
  { id: 'agent-6', name: '角色原画师', status: 'completed', progress: 100 },
  { id: 'agent-7', name: '角色模型师', status: 'completed', progress: 100 },
  { id: 'agent-8', name: '角色绑定师', status: 'completed', progress: 100 },
  { id: 'agent-9', name: '角色动画师', status: 'completed', progress: 100 },
  { id: 'agent-10', name: '角色 TA', status: 'completed', progress: 100 },
  
  { id: 'agent-11', name: 'UI 原画师', status: 'completed', progress: 100 },
  { id: 'agent-12', name: 'UI 制作师', status: 'completed', progress: 100 },
  { id: 'agent-13', name: 'UI/UX 设计师', status: 'completed', progress: 100 }
];

// 更新所有组的状态
groupManager.updateGroupStates(mockAgentStates);

// 获取更新后的汇总
const summary = groupManager.getAllGroupsSummary();
console.log(`总分组：${summary.totalGroups}`);
console.log(`工作中：${summary.workingGroups}`);
console.log(`已完成：${summary.completedGroups}`);

// ============================================
// 示例 3: 查看组详情
// ============================================
console.log('\n\n🔍 示例 3: 查看组详情\n');

const sceneGroup = groupManager.getGroupSummary('scene');
console.log(`分组：${sceneGroup.groupName}`);
console.log(`组长：${sceneGroup.lead.name} ${sceneGroup.lead.isLead ? '👑' : ''}`);
console.log(`状态：${sceneGroup.state.status}`);
console.log(`进度：${sceneGroup.state.progress}%`);
console.log(`活跃 Agent: ${sceneGroup.state.activeAgents}/${sceneGroup.state.totalTasks}`);
console.log(`\n组成员:`);
sceneGroup.agents.forEach(agent => {
  const agentState = mockAgentStates.find(s => s.name === agent.name);
  const status = agentState ? agentState.status : 'unknown';
  const icon = status === 'running' ? '🔄' : status === 'completed' ? '✅' : '⏳';
  console.log(`  ${icon} ${agent.name}${agent.isLead ? ' (组长)' : ''}`);
});

// ============================================
// 示例 4: 查找 Agent 所属分组
// ============================================
console.log('\n\n🔎 示例 4: 查找 Agent 所属分组\n');

const agentName = '场景原画师';
const group = groupManager.findGroupByAgent(agentName);

if (group) {
  console.log(`${agentName} 属于：${group.icon} ${group.name}`);
  console.log(`组长：${group.lead}`);
  console.log(`同组成员：${group.agents.join(', ')}`);
} else {
  console.log(`${agentName} 不属于任何分组`);
}

// ============================================
// 示例 5: 组间协作检测
// ============================================
console.log('\n\n🤝 示例 5: 组间协作检测\n');

const collaborations = groupManager.getCollaborationInfo();

if (collaborations.length > 0) {
  console.log(`发现 ${collaborations.length} 组需要协作:`);
  collaborations.forEach((collab, index) => {
    console.log(`\n  [${index + 1}] ${collab.group1.name} ↔ ${collab.group2.name}`);
    console.log(`      原因：${collab.reason}`);
    console.log(`      建议：通知两位组长 ${collab.group1.lead} 和 ${collab.group2.lead} 进行沟通`);
  });
} else {
  console.log('当前没有组间协作需求');
}

// ============================================
// 示例 6: Dashboard 数据导出
// ============================================
console.log('\n\n📈 示例 6: Dashboard 数据导出\n');

const dashboardData = groupManager.getAllGroupsSummary(mockAgentStates);
console.log('Dashboard 数据结构:');
console.log(JSON.stringify(dashboardData, null, 2).substring(0, 500) + '...');

// ============================================
// 示例 7: 添加新分组
// ============================================
console.log('\n\n➕ 示例 7: 添加新分组\n');

const newGroup = groupManager.addGroup({
  id: 'audio',
  name: '音频美术组',
  description: '负责游戏音频相关工作',
  lead: '音频总监',
  agents: ['音频总监', '音效师', '配乐师'],
  color: '#9C27B0',
  icon: '🎵'
});

console.log(`已添加新分组：${newGroup.icon} ${newGroup.name}`);
console.log(`组长：${newGroup.lead}`);
console.log(`成员：${newGroup.agents.join(', ')}`);

// ============================================
// 示例 8: 导出/导入配置
// ============================================
console.log('\n\n💾 示例 8: 导出/导入配置\n');

const exportedConfig = groupManager.exportConfig();
console.log('导出配置:');
console.log(JSON.stringify(exportedConfig, null, 2).substring(0, 300) + '...');

// ============================================
// 示例 9: 实时监控（模拟）
// ============================================
console.log('\n\n⏱️  示例 9: 实时监控（模拟 5 秒）\n');

function simulateRealtimeMonitor() {
  const states = [
    { id: '1', name: '场景原画师', status: 'running' },
    { id: '2', name: '场景模型师', status: 'completed' },
    { id: '3', name: 'UI 原画师', status: 'running' }
  ];
  
  groupManager.updateGroupStates(states);
  const summary = groupManager.getAllGroupsSummary();
  
  console.log(`[${new Date().toLocaleTimeString()}] 状态更新:`);
  summary.groups.forEach(g => {
    const statusIcon = g.state.status === 'working' ? '🔄' : g.state.status === 'completed' ? '✅' : '⏸️';
    console.log(`  ${statusIcon} ${g.name}: ${g.state.progress}% (${g.state.status})`);
  });
}

// 模拟一次更新
simulateRealtimeMonitor();

// ============================================
// 示例 10: 完整工作流
// ============================================
console.log('\n\n🎯 示例 10: 完整工作流\n');

async function fullWorkflow() {
  console.log('步骤 1: 初始化分组管理器');
  console.log(`  ✓ 加载了 ${groupManager.getAllGroups().length} 个分组`);
  
  console.log('\n步骤 2: 获取 Agent 状态');
  const agentStates = mockAgentStates; // 实际从 stateManager 获取
  console.log(`  ✓ 获取到 ${agentStates.length} 个 Agent 状态`);
  
  console.log('\n步骤 3: 更新组状态');
  groupManager.updateGroupStates(agentStates);
  console.log('  ✓ 状态已更新');
  
  console.log('\n步骤 4: 生成 Dashboard 数据');
  const dashboardData = groupManager.getAllGroupsSummary();
  console.log(`  ✓ 生成 ${dashboardData.totalGroups} 个分组数据`);
  
  console.log('\n步骤 5: 检查协作需求');
  const collaborations = groupManager.getCollaborationInfo();
  if (collaborations.length > 0) {
    console.log(`  ⚠️  发现 ${collaborations.length} 组需要协作`);
  } else {
    console.log('  ✓ 无需协作');
  }
  
  console.log('\n步骤 6: 发送到 Dashboard');
  console.log('  ✓ 数据已发送（模拟）');
  
  console.log('\n✅ 工作流完成\n');
}

// 运行完整工作流
fullWorkflow();

// ============================================
// 总结
// ============================================
console.log('\n\n============================================');
console.log('📚 分组管理集成示例完成！');
console.log('============================================\n');

console.log('关键要点:');
console.log('  1. 使用 groupManager 统一管理所有分组');
console.log('  2. 定期调用 updateGroupStates() 同步状态');
console.log('  3. 使用 getAllGroupsSummary() 获取 Dashboard 数据');
console.log('  4. 通过 getCollaborationInfo() 检测协作需求');
console.log('  5. 支持动态添加/删除分组');
console.log('\n下一步:');
console.log('  - 查看 docs/GROUP-MANAGEMENT.md 了解完整 API');
console.log('  - 查看 dashboard/groups-view.html 了解前端集成');
console.log('  - 运行 test/groupManager.test.js 运行单元测试\n');
