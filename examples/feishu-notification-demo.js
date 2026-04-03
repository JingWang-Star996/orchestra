#!/usr/bin/env node

/**
 * 飞书通知集成示例
 * 
 * 演示如何在 Orchestra 中集成飞书消息推送
 */

const { stateManager } = require('./stateManager');
const { feishuNotifier } = require('./feishuNotifier');
const { notificationConfig } = require('./notificationConfig');

console.log('=== Orchestra 飞书通知集成示例 ===\n');

// 1. 配置通知
console.log('1. 配置通知接收人');
notificationConfig.addTarget('users', 'ou_xxx');  // 替换为你的 open_id
notificationConfig.addTarget('chats', 'oc_xxx');  // 替换为你的 chat_id（可选）

// 2. 注册一个测试 Agent
console.log('\n2. 注册测试 Agent');
const agent = stateManager.register('agent-demo', 'AI CTO - 示例任务', {
  description: '演示飞书通知功能'
});

// 3. 模拟任务执行
console.log('\n3. 模拟任务执行...');
setTimeout(() => {
  stateManager.updateProgress('agent-demo', {
    toolUseCount: 10,
    tokenCount: 5000,
    recentActivities: [
      { toolName: 'read', activityDescription: '读取文件' },
      { toolName: 'write', activityDescription: '写入文件' },
      { toolName: 'exec', activityDescription: '执行命令' }
    ]
  });
}, 1000);

// 4. 完成任务（会自动触发飞书通知）
console.log('\n4. 完成任务（触发飞书通知）');
setTimeout(() => {
  stateManager.complete('agent-demo', {
    output: '示例任务完成',
    files: ['file1.js', 'file2.js']
  });
}, 2000);

// 5. 监听通知事件
stateManager.on('agent:complete', (agent) => {
  console.log(`\n✅ 收到 Agent 完成事件：${agent.name}`);
});

stateManager.on('agent:failed', (agent) => {
  console.log(`\n❌ 收到 Agent 失败事件：${agent.name}`);
});

// 6. 测试失败通知（可选）
// setTimeout(() => {
//   const failedAgent = stateManager.register('agent-fail', 'AI 测试 - 失败示例', {
//     description: '演示失败通知'
//   });
//   setTimeout(() => {
//     stateManager.fail('agent-fail', '模拟错误：文件不存在');
//   }, 1000);
// }, 3000);

console.log('\n等待任务完成...\n');

// 保持进程运行
setTimeout(() => {
  console.log('\n=== 示例结束 ===');
  process.exit(0);
}, 5000);
