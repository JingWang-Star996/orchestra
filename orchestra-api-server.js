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
const InterAgentBridge = require('./interAgentBridge');

const PORT = process.env.ORCHESTRA_API_PORT || 3000;
const STATE_FILE = path.join(__dirname, 'temp/orchestra-state.json');

// 初始化 InterAgentBridge
const interAgentBridge = new InterAgentBridge({ verbose: false });

// CORS 头
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

// ─── 请求体解析 ──────────────────────────────────────────

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

// ─── API 路由 ────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  
  // 处理 CORS 预检请求
  if (req.method === 'OPTIONS') {
    res.writeHead(200, CORS_HEADERS);
    res.end();
    return;
  }
  
  try {
    // === 原有端点 ===
    
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
    
    // === 跨 Agent 通信端点 ===
    
    } else if (url.pathname === '/api/agent/register' && req.method === 'POST') {
      await handleAgentRegister(req, res);
    } else if (url.pathname.startsWith('/api/agent/') && url.pathname.endsWith('/message') && req.method === 'POST') {
      const agentId = extractAgentId(url.pathname, '/message');
      await handleAgentMessage(agentId, req, res);
    } else if (url.pathname.startsWith('/api/agent/') && url.pathname.endsWith('/task') && req.method === 'POST') {
      const agentId = extractAgentId(url.pathname, '/task');
      await handleAgentTask(agentId, req, res);
    } else if (url.pathname.startsWith('/api/agent/') && url.pathname.endsWith('/status') && req.method === 'GET') {
      const agentId = extractAgentId(url.pathname, '/status');
      handleAgentStatus(agentId, res);
    } else if (url.pathname.startsWith('/api/webhook/') && req.method === 'POST') {
      const agentId = url.pathname.replace('/api/webhook/', '');
      await handleWebhook(agentId, req, res);
    } else if (url.pathname === '/api/agents' && req.method === 'GET') {
      handleGetAllAgents(res);
    } else {
      handleNotFound(res);
    }
  } catch (err) {
    res.writeHead(500, CORS_HEADERS);
    res.end(JSON.stringify({ error: err.message }));
  }
});

function extractAgentId(pathname, suffix) {
  // /api/agent/:id/message → :id
  const prefix = '/api/agent/';
  const start = prefix.length;
  const end = pathname.indexOf(suffix, start);
  return pathname.substring(start, end);
}

// ─── 原有处理器 ──────────────────────────────────────────

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

// 获取 Agent 列表（原有，从 state 文件读取）
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

// 获取所有 Agent（内部 + 外部，通过 bridge）
function handleGetAllAgents(res) {
  try {
    const agents = interAgentBridge.listAgents();
    res.writeHead(200, CORS_HEADERS);
    res.end(JSON.stringify({
      success: true,
      total: agents.length,
      agents: agents
    }));
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

// ─── 跨 Agent 通信处理器 ─────────────────────────────────

/**
 * POST /api/agent/register — 注册外部 Agent
 */
async function handleAgentRegister(req, res) {
  try {
    const body = await parseBody(req);
    
    if (!body.id || !body.name) {
      res.writeHead(400, CORS_HEADERS);
      res.end(JSON.stringify({ error: '缺少必填字段: id, name' }));
      return;
    }
    
    const result = interAgentBridge.registerAgent({
      id: body.id,
      name: body.name,
      type: body.type || 'external',
      endpoint: body.endpoint || null,
      auth_type: body.auth_type || 'none',
      api_key: body.api_key || null,
      capabilities: body.capabilities || [],
      healthPath: body.healthPath || '/health',
      messagePath: body.messagePath || '/api/message',
      taskPath: body.taskPath || '/api/task',
      callbackUrl: body.callbackUrl || null,
      metadata: body.metadata || {}
    });
    
    res.writeHead(201, CORS_HEADERS);
    res.end(JSON.stringify(result));
  } catch (err) {
    res.writeHead(500, CORS_HEADERS);
    res.end(JSON.stringify({ error: err.message }));
  }
}

/**
 * POST /api/agent/:id/message — 发消息到指定 Agent
 */
async function handleAgentMessage(agentId, req, res) {
  try {
    const body = await parseBody(req);
    
    if (!body.content) {
      res.writeHead(400, CORS_HEADERS);
      res.end(JSON.stringify({ error: '缺少必填字段: content' }));
      return;
    }
    
    const result = await interAgentBridge.sendMessage(agentId, {
      content: body.content,
      context: body.context || {},
      metadata: body.metadata || {}
    });
    
    res.writeHead(200, CORS_HEADERS);
    res.end(JSON.stringify({ success: true, result }));
  } catch (err) {
    res.writeHead(500, CORS_HEADERS);
    res.end(JSON.stringify({ error: err.message }));
  }
}

/**
 * POST /api/agent/:id/task — 委派任务到指定 Agent
 */
async function handleAgentTask(agentId, req, res) {
  try {
    const body = await parseBody(req);
    
    if (!body.task) {
      res.writeHead(400, CORS_HEADERS);
      res.end(JSON.stringify({ error: '缺少必填字段: task' }));
      return;
    }
    
    const task = typeof body.task === 'string'
      ? { title: 'Task', description: body.task }
      : body.task;
    
    const result = await interAgentBridge.delegateTask(agentId, task, body.context || {});
    
    res.writeHead(200, CORS_HEADERS);
    res.end(JSON.stringify({ success: true, result }));
  } catch (err) {
    res.writeHead(500, CORS_HEADERS);
    res.end(JSON.stringify({ error: err.message }));
  }
}

/**
 * GET /api/agent/:id/status — Agent 状态
 */
function handleAgentStatus(agentId, res) {
  try {
    const agent = interAgentBridge.getAgent(agentId);
    if (!agent) {
      res.writeHead(404, CORS_HEADERS);
      res.end(JSON.stringify({ error: `Agent 不存在: ${agentId}` }));
      return;
    }
    
    // 计算队列统计
    const queueSize = interAgentBridge.queue.size();
    
    res.writeHead(200, CORS_HEADERS);
    res.end(JSON.stringify({
      success: true,
      agent: agent,
      queueSize: queueSize
    }));
  } catch (err) {
    res.writeHead(500, CORS_HEADERS);
    res.end(JSON.stringify({ error: err.message }));
  }
}

/**
 * POST /api/webhook/:id — 接收外部 Agent 回调
 */
async function handleWebhook(agentId, req, res) {
  try {
    const body = await parseBody(req);
    
    interAgentBridge._handleExternalCallback({
      agentId,
      message: body
    });
    
    res.writeHead(200, CORS_HEADERS);
    res.end(JSON.stringify({ success: true, received: true }));
  } catch (err) {
    res.writeHead(500, CORS_HEADERS);
    res.end(JSON.stringify({ error: err.message }));
  }
}

// ─── 启动服务器 ──────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`🎻 Orchestra API 服务器已启动`);
  console.log(`📊 API 地址：http://localhost:${PORT}`);
  console.log(`📈 状态接口：http://localhost:${PORT}/api/state`);
  console.log(`💚 健康检查：http://localhost:${PORT}/health`);
  console.log(`🌐 Agent 注册：POST http://localhost:${PORT}/api/agent/register`);
  console.log(`🌐 Agent 列表：GET  http://localhost:${PORT}/api/agents`);
  console.log(`🌐 Agent 消息：POST http://localhost:${PORT}/api/agent/:id/message`);
  console.log(`🌐 Agent 任务：POST http://localhost:${PORT}/api/agent/:id/task`);
  console.log(`🌐 Agent 状态：GET  http://localhost:${PORT}/api/agent/:id/status`);
  console.log(`🌐 外部回调：POST http://localhost:${PORT}/api/webhook/:id`);
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
