#!/usr/bin/env node

/**
 * Orchestra Dashboard 启动脚本
 * 
 * 一键启动 API 服务器并打开 Dashboard
 * 
 * 用法：
 * node start-dashboard.js
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const API_SERVER = path.join(__dirname, 'orchestra-api-server.js');
const DASHBOARD = path.join(__dirname, 'dashboard/ultimate-dashboard.html');
const STATE_FILE = path.join(__dirname, 'temp/orchestra-state.json');

console.log('🎻 Orchestra Dashboard 启动中...\n');

// 检查状态文件是否存在
if (!fs.existsSync(STATE_FILE)) {
  console.log('⚠️  状态文件不存在，创建示例数据...');
  
  const initialData = {
    updatedAt: new Date().toISOString(),
    stats: {
      total: 16,
      running: 0,
      completed: 16,
      failed: 0,
      totalTokens: 350000,
      avgDuration: 900000
    },
    agents: [
      { id: "agent-p0-1", name: "AI 主程 - P0 飞书推送", status: "completed", startTime: Date.now() - 300000, endTime: Date.now(), tokens: 15000, tools: 45, description: "实现飞书消息推送功能" },
      { id: "agent-p1-1", name: "AI 前端架构师 - P1 Dashboard", status: "completed", startTime: Date.now() - 240000, endTime: Date.now(), tokens: 18000, tools: 38, description: "实现 Dashboard 可视化" },
      { id: "agent-p1-2", name: "AI 首席架构师 - P1 工作流引擎", status: "completed", startTime: Date.now() - 300000, endTime: Date.now(), tokens: 25000, tools: 52, description: "实现工作流引擎" },
      { id: "agent-p2-1", name: "AI 系统架构师 - P2 工具追踪", status: "completed", startTime: Date.now() - 315000, endTime: Date.now(), tokens: 20000, tools: 40, description: "增强工具追踪" },
      { id: "agent-p2-2", name: "AI 后端架构师 - P2 分组管理", status: "completed", startTime: Date.now() - 411000, endTime: Date.now(), tokens: 22000, tools: 47, description: "实现分组管理" }
    ],
    tokenHistory: []
  };
  
  // 确保目录存在
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(STATE_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
  console.log('✅ 示例数据已创建\n');
}

// 启动 API 服务器
console.log('🚀 启动 API 服务器...');
const apiServer = spawn('node', [API_SERVER], {
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: false
});

apiServer.stdout.on('data', (data) => {
  console.log(data.toString().trim());
});

apiServer.stderr.on('data', (data) => {
  console.error(data.toString().trim());
});

apiServer.on('close', (code) => {
  if (code !== 0) {
    console.error(`❌ API 服务器异常退出 (code: ${code})`);
  }
});

// 等待 API 服务器启动
setTimeout(() => {
  console.log('\n🌐 打开 Dashboard...');
  console.log('📊 访问地址：http://localhost:3000/api/state\n');
  
  // 根据操作系统打开浏览器
  const platform = process.platform;
  let openCommand;
  
  if (platform === 'win32') {
    openCommand = 'start';
  } else if (platform === 'darwin') {
    openCommand = 'open';
  } else {
    openCommand = 'xdg-open';
  }
  
  const browser = spawn(openCommand, [DASHBOARD], {
    shell: true,
    stdio: 'ignore'
  });
  
  browser.on('error', (err) => {
    console.log('⚠️  无法自动打开浏览器，请手动访问：');
    console.log(`file://${DASHBOARD}\n`);
  });
  
  console.log('✅ Dashboard 已启动\n');
  console.log('按 Ctrl+C 停止所有服务\n');
  
}, 2000);

// 处理退出
process.on('SIGINT', () => {
  console.log('\n👋 正在关闭...');
  apiServer.kill('SIGINT');
  process.exit(0);
});
