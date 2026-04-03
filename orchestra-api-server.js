#!/usr/bin/env node

/**
 * Orchestra API 服务器
 * 
 * 提供 HTTP API 接口，供 Dashboard 读取实时状态
 * 
 * 用法：
 * node orchestra-api-server.js
 * 
 * 然后访问：
 * http://localhost:3000/api/state
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.ORCHESTRA_API_PORT || 3000;
const STATE_FILE = path.join(__dirname, 'temp/orchestra-state.json');

// CORS 头
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

// 请求处理
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  
  // 处理 CORS 预检请求
  if (req.method === 'OPTIONS') {
    res.writeHead(200, CORS_HEADERS);
    res.end();
    return;
  }
  
  // API 路由
  if (url.pathname === '/api/state' && req.method === 'GET') {
    handleGetState(res);
  } else if (url.pathname === '/api/state' && req.method === 'POST') {
    handleUpdateState(req, res);
  } else if (url.pathname === '/api/agents' && req.method === 'GET') {
    handleGetAgents(res);
  } else if (url.pathname === '/health' && req.method === 'GET') {
    handleHealth(res);
  } else if (url.pathname.startsWith('/dashboard/')) {
    // 服务 Dashboard 静态文件
    const filePath = path.join(__dirname, url.pathname);
    serveStaticFile(res, filePath);
  } else {
    handleNotFound(res);
  }
});

// 获取状态
function handleGetState(res) {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      res.writeHead(404, CORS_HEADERS);
      res.end(JSON.stringify({ error: '状态文件不存在' }));
      return;
    }
    
    const data = fs.readFileSync(STATE_FILE, 'utf-8');
    const state = JSON.parse(data);
    
    res.writeHead(200, CORS_HEADERS);
    res.end(JSON.stringify(state));
  } catch (err) {
    res.writeHead(500, CORS_HEADERS);
    res.end(JSON.stringify({ error: err.message }));
  }
}

// 更新状态
function handleUpdateState(req, res) {
  let body = '';
  
  req.on('data', chunk => {
    body += chunk.toString();
  });
  
  req.on('end', () => {
    try {
      const update = JSON.parse(body);
      
      if (!fs.existsSync(STATE_FILE)) {
        res.writeHead(404, CORS_HEADERS);
        res.end(JSON.stringify({ error: '状态文件不存在' }));
        return;
      }
      
      const data = fs.readFileSync(STATE_FILE, 'utf-8');
      const state = JSON.parse(data);
      
      // 合并更新
      Object.assign(state, update);
      state.updatedAt = new Date().toISOString();
      
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
      
      res.writeHead(200, CORS_HEADERS);
      res.end(JSON.stringify({ success: true, state }));
    } catch (err) {
      res.writeHead(500, CORS_HEADERS);
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

// 获取 Agent 列表
function handleGetAgents(res) {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      res.writeHead(404, CORS_HEADERS);
      res.end(JSON.stringify({ error: '状态文件不存在' }));
      return;
    }
    
    const data = fs.readFileSync(STATE_FILE, 'utf-8');
    const state = JSON.parse(data);
    
    res.writeHead(200, CORS_HEADERS);
    res.end(JSON.stringify({ agents: state.agents || [] }));
  } catch (err) {
    res.writeHead(500, CORS_HEADERS);
    res.end(JSON.stringify({ error: err.message }));
  }
}

// 健康检查
function handleHealth(res) {
  res.writeHead(200, CORS_HEADERS);
  res.end(JSON.stringify({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    port: PORT 
  }));
}

// 404
function handleNotFound(res) {
  res.writeHead(404, CORS_HEADERS);
  res.end(JSON.stringify({ error: 'Not Found' }));
}

// 服务静态文件
function serveStaticFile(res, filePath) {
  const fs = require('fs');
  
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml'
  };
  
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('File not found');
      } else {
        res.writeHead(500);
        res.end('Server error: ' + err.code);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
}

// 启动服务器
server.listen(PORT, () => {
  console.log(`🎻 Orchestra API 服务器已启动`);
  console.log(`📊 API 地址：http://localhost:${PORT}`);
  console.log(`📈 状态接口：http://localhost:${PORT}/api/state`);
  console.log(`💚 健康检查：http://localhost:${PORT}/health`);
  console.log(`\n按 Ctrl+C 停止服务器`);
});

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n👋 正在关闭服务器...');
  server.close(() => {
    console.log('✅ 服务器已关闭');
    process.exit(0);
  });
});
