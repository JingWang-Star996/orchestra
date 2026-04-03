#!/usr/bin/env node

/**
 * Orchestra 实时监控演示脚本（增强版）
 * 
 * 运行后会自动更新状态文件，Dashboard 会实时显示状态变化
 * 
 * 用法：
 * node demo-monitor-enhanced.js
 * 
 * 然后访问：http://localhost:8080/orchestra/dashboard/live-monitor.html
 */

const { spawnAgent, spawnAgents, stateManager } = require('./agentExecutor');

console.log('🎻 Orchestra 实时监控演示（增强版）\n');
console.log('📊 Dashboard 地址：http://localhost:8080/orchestra/dashboard/live-monitor.html');
console.log('📁 状态文件位置:', require('./stateManager').STATE_FILE);
console.log('\n开始模拟 Agent 执行...\n');

// 模拟 Orchestra 升级开发任务
const agents = [
  { 
    name: 'AI 主程 - P0 飞书推送', 
    task: '实现飞书消息推送功能，包括状态变更推送、消息模板配置、推送开关等', 
    options: { timeout: 60 } 
  },
  { 
    name: 'AI 前端架构师 - P1 Dashboard', 
    task: '实现 Dashboard 可视化功能，包括 Token 消耗折线图、状态饼图、甘特图、成本柱状图等', 
    options: { timeout: 60 } 
  },
  { 
    name: 'AI 首席架构师 - P1 工作流引擎', 
    task: '实现工作流引擎，支持顺序/并行/混合执行模式，预定义编辑部/游戏设计/美术生产工作流', 
    options: { timeout: 60 } 
  },
  { 
    name: 'AI 系统架构师 - P2 工具追踪', 
    task: '增强工具追踪功能，记录工具调用历史、生成活动描述、提供调试支持', 
    options: { timeout: 60 } 
  },
  { 
    name: 'AI 后端架构师 - P2 分组管理', 
    task: '实现分组管理功能，支持 11 个专业组配置、组内状态汇总、组间协作', 
    options: { timeout: 60 } 
  }
];

// 分批启动 Agent（模拟真实执行顺序）
(async () => {
  try {
    // 启动所有 Agent（并行）
    console.log('📦 启动 5 个 Agent 并行开发...');
    const results = await spawnAgents(agents);
    
    // 统计结果
    const success = results.filter(r => !r.error);
    const failed = results.filter(r => r.error);
    
    console.log('\n✅ 所有 Agent 执行完成！');
    console.log(`成功：${success.length}, 失败：${failed.length}`);
    
    // 最终统计
    const stats = stateManager.getStats();
    console.log('\n📊 最终统计:');
    console.log('  总 Agent 数:', stats.total);
    console.log('  已完成:', stats.completed);
    console.log('  运行中:', stats.running);
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
