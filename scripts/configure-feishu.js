#!/usr/bin/env node

/**
 * 飞书通知配置向导
 * 
 * 交互式配置飞书通知接收人
 */

const { notificationConfig } = require('./notificationConfig');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('=== 飞书通知配置向导 ===\n');

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function configure() {
  // 1. 配置个人接收人
  console.log('📱 配置个人接收人 (open_id)');
  console.log('提示：open_id 格式如 ou_xxx，可以从飞书开发者后台获取\n');
  
  let userIds = notificationConfig.get('targets.users') || [];
  console.log(`当前已配置：${userIds.join(', ') || '无'}`);
  
  const addUsers = await askQuestion('是否添加个人接收人？(y/n): ');
  if (addUsers.toLowerCase() === 'y') {
    const userId = await askQuestion('请输入 open_id: ');
    if (userId) {
      notificationConfig.addTarget('users', userId);
      console.log(`✅ 已添加：${userId}\n`);
    }
  }
  
  // 2. 配置群聊接收人
  console.log('👥 配置群聊接收人 (chat_id)');
  console.log('提示：chat_id 格式如 oc_xxx，可以从飞书群设置中获取\n');
  
  let chatIds = notificationConfig.get('targets.chats') || [];
  console.log(`当前已配置：${chatIds.join(', ') || '无'}`);
  
  const addChats = await askQuestion('是否添加群聊接收人？(y/n): ');
  if (addChats.toLowerCase() === 'y') {
    const chatId = await askQuestion('请输入 chat_id: ');
    if (chatId) {
      notificationConfig.addTarget('chats', chatId);
      console.log(`✅ 已添加：${chatId}\n`);
    }
  }
  
  // 3. 配置通知开关
  console.log('⚙️  配置通知类型');
  
  const enableComplete = await askQuestion('启用 Agent 完成通知？(y/n): ');
  notificationConfig.set('types.agentComplete', enableComplete.toLowerCase() === 'y');
  
  const enableFailed = await askQuestion('启用 Agent 失败通知？(y/n): ');
  notificationConfig.set('types.agentFailed', enableFailed.toLowerCase() === 'y');
  
  const enableMilestone = await askQuestion('启用里程碑通知？(y/n): ');
  notificationConfig.set('types.milestoneReached', enableMilestone.toLowerCase() === 'y');
  
  // 4. 配置静默时段
  console.log('\n🌙 配置静默时段');
  const enableQuiet = await askQuestion('启用静默时段？(y/n): ');
  if (enableQuiet.toLowerCase() === 'y') {
    notificationConfig.set('advanced.quietHours.enabled', true);
    const start = await askQuestion('开始时间（小时，0-23）: ');
    const end = await askQuestion('结束时间（小时，0-23）: ');
    notificationConfig.set('advanced.quietHours.start', parseInt(start) || 22);
    notificationConfig.set('advanced.quietHours.end', parseInt(end) || 8);
  } else {
    notificationConfig.set('advanced.quietHours.enabled', false);
  }
  
  // 5. 显示最终配置
  console.log('\n=== 配置完成 ===\n');
  const finalConfig = notificationConfig.get();
  console.log(JSON.stringify(finalConfig, null, 2));
  
  console.log('\n✅ 配置已保存到:', notificationConfig.configFile);
  console.log('\n提示：可以通过以下命令测试通知:');
  console.log('  node examples/feishu-notification-demo.js\n');
  
  rl.close();
}

configure().catch(console.error);
