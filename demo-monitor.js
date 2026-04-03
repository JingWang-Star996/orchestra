#!/usr/bin/env node

/**
 * Orchestra 监控演示脚本
 * 
 * 运行后会在后台模拟 Agent 执行，Dashboard 会实时显示状态变化
 * 
 * 用法：
 * node demo-monitor.js
 * 
 * 然后访问：http://localhost:8080/orchestra/dashboard/live-monitor.html
 */

const { spawnAgent, spawnAgents, stateManager } = require('./agentExecutor');

console.log('🎻 Orchestra 实时监控演示\n');
console.log('📊 Dashboard 地址：http://localhost:8080/orchestra/dashboard/live-monitor.html');
console.log('📁 状态文件位置:', require('./stateManager').STATE_FILE);
console.log('\n开始模拟 Agent 执行...\n');

// 模拟 Orchestra 极限测试的 Agent 列表
const agents = [
  { name: '场景美术组 - 5 Agent', task: '设计赛博朋克场景体系', options: { timeout: 30 } },
  { name: '角色美术组 - 5 Agent', task: '设计赛博朋克角色体系', options: { timeout: 30 } },
  { name: '概念设计组 - 3 Agent', task: '世界观/怪物/载具设计', options: { timeout: 30 } },
  { name: '特效原画师', task: '特效原画设计', options: { timeout: 30 } },
  { name: '特效制作师', task: '特效制作方案', options: { timeout: 30 } },
  { name: '特效 TA', task: '特效技术方案', options: { timeout: 30 } },
  { name: 'UI 原画师', task: 'UI 原画设计', options: { timeout: 30 } },
  { name: 'UI 制作师', task: 'UI 制作方案', options: { timeout: 30 } },
  { name: 'UI/UX 设计师', task: 'UI/UX 设计', options: { timeout: 30 } },
  { name: '美术管理组', task: '统筹审核', options: { timeout: 30 } },
  { name: '纪录片导演', task: '全程记录', options: { timeout: 60 } }
];

// 分批启动 Agent（模拟真实执行顺序）
(async () => {
  try {
    // 第一批：场景/角色/概念
    console.log('📦 第一批：场景/角色/概念设计组启动');
    const batch1 = await spawnAgents(agents.slice(0, 3));
    console.log('✅ 第一批完成:', batch1.filter(r => !r.error).length, '/', batch1.length);
    
    // 第二批：特效组
    console.log('\n📦 第二批：特效美术组启动');
    const batch2 = await spawnAgents(agents.slice(3, 6));
    console.log('✅ 第二批完成:', batch2.filter(r => !r.error).length, '/', batch2.length);
    
    // 第三批：UI 组
    console.log('\n📦 第三批：UI 美术组启动');
    const batch3 = await spawnAgents(agents.slice(6, 9));
    console.log('✅ 第三批完成:', batch3.filter(r => !r.error).length, '/', batch3.length);
    
    // 第四批：管理/纪录片
    console.log('\n📦 第四批：美术管理/纪录片启动');
    const batch4 = await spawnAgents(agents.slice(9, 11));
    console.log('✅ 第四批完成:', batch4.filter(r => !r.error).length, '/', batch4.length);
    
    // 最终统计
    console.log('\n🎉 所有 Agent 执行完成！');
    const stats = stateManager.getStats();
    console.log('\n📊 最终统计:');
    console.log('  总 Agent 数:', stats.total);
    console.log('  已完成:', stats.completed);
    console.log('  总 Token:', stats.totalTokens.toLocaleString());
    console.log('  平均耗时:', (stats.avgDuration / 60000).toFixed(1), '分钟');
    
  } catch (err) {
    console.error('❌ 执行失败:', err.message);
  }
})();

// 保持进程运行
process.on('SIGINT', () => {
  console.log('\n👋 退出演示');
  process.exit(0);
});
