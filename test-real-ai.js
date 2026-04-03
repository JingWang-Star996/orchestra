#!/usr/bin/env node

/**
 * Orchestra 真实 AI 调用验证测试
 * 
 * 用法：
 * node test-real-ai.js
 */

const { spawnAgent } = require('./agentExecutor');

console.log('🧪 Orchestra 真实 AI 调用验证测试\n');
console.log('='.repeat(50));

(async () => {
  try {
    console.log('\n📝 启动测试 Agent...\n');
    
    const result = await spawnAgent(
      '验证测试 Agent', 
      '生成 10 个随机数并求和',
      { timeout: 60 }
    );
    
    console.log('\n✅ 测试完成！\n');
    console.log('结果:', result);
    
    console.log('\n📊 请刷新 Dashboard 查看真实数据：');
    console.log('http://localhost:3000/dashboard/index-v4.html\n');
    console.log('='.repeat(50));
    
  } catch (err) {
    console.error('\n❌ 测试失败:', err.message);
    process.exit(1);
  }
})();
