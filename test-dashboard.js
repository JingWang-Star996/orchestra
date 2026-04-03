#!/usr/bin/env node

/**
 * Dashboard 系统功能测试脚本
 * 
 * 用法：
 * 1. 先启动 API 服务器：node orchestra-api-server.js
 * 2. 运行测试：node test-dashboard.js
 */

const http = require('http');

const API_BASE = 'http://localhost:3000';

console.log('🔍 Dashboard 系统功能测试\n');
console.log('='.repeat(50));

// 测试 API 连接
async function testAPI() {
  console.log('\n📡 测试 1: API 服务器连接...');
  
  try {
    const response = await fetch(`${API_BASE}/health`);
    const data = await response.json();
    
    if (data.status === 'ok') {
      console.log('✅ API 服务器运行正常');
      console.log(`   端口：${data.port}`);
      console.log(`   时间：${data.timestamp}`);
      return true;
    } else {
      console.log('❌ API 服务器响应异常');
      return false;
    }
  } catch (err) {
    console.log('❌ 无法连接到 API 服务器');
    console.log(`   错误：${err.message}`);
    console.log('\n💡 请先运行：node orchestra-api-server.js');
    return false;
  }
}

// 测试状态读取
async function testGetState() {
  console.log('\n📊 测试 2: 读取状态...');
  
  try {
    const response = await fetch(`${API_BASE}/api/state`);
    const data = await response.json();
    
    console.log('✅ 状态读取成功');
    console.log(`   总 Agent 数：${data.stats?.total || 0}`);
    console.log(`   运行中：${data.stats?.running || 0}`);
    console.log(`   已完成：${data.stats?.completed || 0}`);
    console.log(`   总 Token: ${data.stats?.totalTokens?.toLocaleString() || 0}`);
    
    if (data.agents && data.agents.length > 0) {
      console.log(`   Agent 数量：${data.agents.length}`);
      console.log('   Agent 列表:');
      data.agents.forEach(agent => {
        console.log(`     - ${agent.name} (${agent.status})`);
      });
    }
    
    return true;
  } catch (err) {
    console.log('❌ 状态读取失败');
    console.log(`   错误：${err.message}`);
    return false;
  }
}

// 测试 Agent 列表
async function testGetAgents() {
  console.log('\n👥 测试 3: 获取 Agent 列表...');
  
  try {
    const response = await fetch(`${API_BASE}/api/agents`);
    const data = await response.json();
    
    if (data.agents) {
      console.log(`✅ 获取到 ${data.agents.length} 个 Agent`);
      return true;
    } else {
      console.log('❌ 响应格式异常');
      return false;
    }
  } catch (err) {
    console.log('❌ 获取 Agent 列表失败');
    console.log(`   错误：${err.message}`);
    return false;
  }
}

// 测试状态更新
async function testUpdateState() {
  console.log('\n✏️  测试 4: 更新状态...');
  
  try {
    const testUpdate = {
      stats: { test: true, timestamp: Date.now() }
    };
    
    const response = await fetch(`${API_BASE}/api/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUpdate)
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log('✅ 状态更新成功');
      return true;
    } else {
      console.log('❌ 状态更新失败');
      return false;
    }
  } catch (err) {
    console.log('❌ 状态更新失败');
    console.log(`   错误：${err.message}`);
    return false;
  }
}

// 测试 Dashboard 页面
async function testDashboard() {
  console.log('\n📊 测试 5: Dashboard 页面...');
  
  const fs = require('fs');
  const path = require('path');
  
  const dashboardPath = path.join(__dirname, 'dashboard/ultimate-dashboard.html');
  
  if (fs.existsSync(dashboardPath)) {
    const stats = fs.statSync(dashboardPath);
    console.log(`✅ Dashboard 文件存在`);
    console.log(`   路径：${dashboardPath}`);
    console.log(`   大小：${(stats.size / 1024).toFixed(1)} KB`);
    console.log(`   修改时间：${stats.mtime.toLocaleString()}`);
    return true;
  } else {
    console.log('❌ Dashboard 文件不存在');
    return false;
  }
}

// 运行所有测试
(async () => {
  const results = {
    api: await testAPI(),
    state: false,
    agents: false,
    update: false,
    dashboard: false
  };
  
  if (results.api) {
    results.state = await testGetState();
    results.agents = await testGetAgents();
    results.update = await testUpdateState();
  }
  
  results.dashboard = await testDashboard();
  
  // 总结
  console.log('\n' + '='.repeat(50));
  console.log('📋 测试总结\n');
  
  const total = 5;
  const passed = Object.values(results).filter(r => r).length;
  
  console.log(`总测试数：${total}`);
  console.log(`通过：${passed}`);
  console.log(`失败：${total - passed}`);
  console.log(`通过率：${(passed / total * 100).toFixed(0)}%`);
  
  console.log('\n详细结果:');
  console.log(`  ${results.api ? '✅' : '❌'} API 服务器连接`);
  console.log(`  ${results.state ? '✅' : '❌'} 状态读取`);
  console.log(`  ${results.agents ? '✅' : '❌'} Agent 列表`);
  console.log(`  ${results.update ? '✅' : '❌'} 状态更新`);
  console.log(`  ${results.dashboard ? '✅' : '❌'} Dashboard 文件`);
  
  if (passed === total) {
    console.log('\n🎉 所有测试通过！Dashboard 系统功能正常！');
  } else {
    console.log('\n⚠️  部分测试失败，请检查系统配置');
  }
  
  console.log('\n' + '='.repeat(50));
})();
