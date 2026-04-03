#!/usr/bin/env node

/**
 * Orchestra 模拟模式测试（简化版）
 * 
 * 用法：
 * node test-simulation.js
 */

const { stateManager } = require('./stateManager');

console.log('🧪 Orchestra 模拟模式测试（简化版）\n');
console.log('='.repeat(50));

(async () => {
  try {
    const agentId = 'test-agent-' + Math.random().toString(36).substring(2, 6);
    
    console.log('\n📝 创建测试 Agent...\n');
    
    // 注册 Agent
    stateManager.register(agentId, '模拟测试 Agent', {
      description: '验证 Dashboard 数据显示'
    });
    
    console.log('✅ Agent 已创建\n');
    
    // 模拟进度更新
    let tokens = 0;
    let tools = 0;
    
    const interval = setInterval(() => {
      tokens += 500;
      tools += 2;
      
      stateManager.updateProgress(agentId, {
        tokenCount: tokens,
        toolUseCount: tools,
        recentActivities: [`执行任务... (${tokens} tokens)`]
      });
      
      console.log(`📊 进度更新：${tokens} tokens, ${tools} tools`);
      
      if (tokens >= 5000) {
        clearInterval(interval);
        stateManager.complete(agentId, {
          status: 'completed',
          output: '模拟任务完成'
        });
        console.log('\n✅ 任务完成！\n');
        console.log('📊 刷新 Dashboard 查看数据：');
        console.log('http://localhost:3000/dashboard/index-v4.html\n');
        console.log('='.repeat(50));
      }
    }, 2000);
    
  } catch (err) {
    console.error('\n❌ 测试失败:', err.message);
    process.exit(1);
  }
})();
