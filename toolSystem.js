#!/usr/bin/env node

/**
 * ToolSystem - 工具系统（Phase 3 增强功能）
 * 
 * 职责：管理 Worker 的工具权限和工具调用
 * 
 * 灵感来源：Claude Code Coordinator 的工具权限系统
 */

var util = require('util');

// 工具定义
var TOOLS = {
  // 基础工具
  BASH_TOOL: {
    id: 'bash',
    name: 'Bash 工具',
    description: '执行 Bash 命令',
    permissions: ['read', 'execute']
  },
  FILE_READ_TOOL: {
    id: 'file_read',
    name: '文件读取工具',
    description: '读取文件内容',
    permissions: ['read']
  },
  FILE_EDIT_TOOL: {
    id: 'file_edit',
    name: '文件编辑工具',
    description: '编辑文件内容',
    permissions: ['read', 'write']
  },
  
  // 高级工具
  AGENT_TOOL: {
    id: 'agent',
    name: 'Agent 工具',
    description: '创建和管理 Worker',
    permissions: ['admin']
  },
  SEND_MESSAGE_TOOL: {
    id: 'send_message',
    name: '消息发送工具',
    description: '向 Worker 发送消息',
    permissions: ['admin']
  },
  TASK_STOP_TOOL: {
    id: 'task_stop',
    name: '任务停止工具',
    description: '停止 Worker 任务',
    permissions: ['admin']
  }
};

// 工具权限级别
var PERMISSION_LEVELS = {
  SIMPLE: ['bash', 'file_read', 'file_edit'],  // 简单模式
  FULL: ['bash', 'file_read', 'file_edit', 'agent', 'send_message', 'task_stop'],  // 完整模式
  ADMIN: ['agent', 'send_message', 'task_stop']  // 管理模式
};

function ToolSystem(options) {
  this.options = {
    verbose: (options && options.verbose) || false,
    defaultMode: (options && options.defaultMode) || 'simple'
  };
  
  this.registeredTools = {};
  this.workerPermissions = new Map();
  
  // 注册默认工具
  this._registerDefaultTools();
}

ToolSystem.prototype._registerDefaultTools = function() {
  var self = this;
  Object.keys(TOOLS).forEach(function(key) {
    self.registerTool(TOOLS[key]);
  });
};

ToolSystem.prototype.registerTool = function(tool) {
  if (!tool.id || !tool.name) {
    throw new Error('工具必须有 id 和 name');
  }
  
  this.registeredTools[tool.id] = tool;
  
  if (this.options.verbose) {
    console.log('[ToolSystem] 注册工具：' + tool.name);
  }
  
  return tool;
};

ToolSystem.prototype.setWorkerPermissions = function(workerId, mode) {
  var permissions = PERMISSION_LEVELS[mode.toUpperCase()] || PERMISSION_LEVELS.SIMPLE;
  this.workerPermissions.set(workerId, permissions);
  
  if (this.options.verbose) {
    console.log('[ToolSystem] 设置 Worker ' + workerId + ' 权限：' + mode);
  }
  
  return permissions;
};

ToolSystem.prototype.getWorkerPermissions = function(workerId) {
  return this.workerPermissions.get(workerId) || PERMISSION_LEVELS.SIMPLE;
};

ToolSystem.prototype.canUseTool = function(workerId, toolId) {
  var permissions = this.getWorkerPermissions(workerId);
  return permissions.indexOf(toolId) !== -1;
};

ToolSystem.prototype.getAvailableTools = function(workerId) {
  var self = this;
  var permissions = this.getWorkerPermissions(workerId);
  
  return permissions.map(function(toolId) {
    return self.registeredTools[toolId];
  }).filter(function(tool) {
    return tool !== undefined;
  });
};

ToolSystem.prototype.executeTool = function(workerId, toolId, params) {
  if (!this.canUseTool(workerId, toolId)) {
    throw new Error('Worker ' + workerId + ' 没有权限使用工具 ' + toolId);
  }
  
  var tool = this.registeredTools[toolId];
  if (!tool) {
    throw new Error('工具不存在：' + toolId);
  }
  
  if (this.options.verbose) {
    console.log('[ToolSystem] Worker ' + workerId + ' 执行工具：' + tool.name);
  }
  
  // TODO: 实际工具执行逻辑
  return {
    toolId: toolId,
    workerId: workerId,
    params: params,
    status: 'pending'
  };
};

ToolSystem.prototype.getStats = function() {
  return {
    totalTools: Object.keys(this.registeredTools).length,
    totalWorkers: this.workerPermissions.size,
    defaultMode: this.options.defaultMode
  };
};

module.exports = ToolSystem;

// CLI 入口
if (require.main === module) {
  var ToolSystem = require('./toolSystem');
  var ts = new ToolSystem({ verbose: true, defaultMode: 'simple' });
  
  console.log('\n=== 工具系统测试 ===\n');
  
  console.log('工具统计：', ts.getStats());
  
  console.log('\n1. 设置 Worker 权限');
  ts.setWorkerPermissions('worker-1', 'simple');
  ts.setWorkerPermissions('worker-2', 'full');
  ts.setWorkerPermissions('worker-3', 'admin');
  
  console.log('\n2. Worker-1 可用工具（简单模式）:');
  var tools1 = ts.getAvailableTools('worker-1');
  tools1.forEach(function(t) {
    console.log('  - ' + t.name);
  });
  
  console.log('\n3. Worker-2 可用工具（完整模式）:');
  var tools2 = ts.getAvailableTools('worker-2');
  tools2.forEach(function(t) {
    console.log('  - ' + t.name);
  });
  
  console.log('\n4. 权限检查:');
  console.log('  Worker-1 可以使用 bash:', ts.canUseTool('worker-1', 'bash'));
  console.log('  Worker-1 可以使用 agent:', ts.canUseTool('worker-1', 'agent'));
  console.log('  Worker-2 可以使用 agent:', ts.canUseTool('worker-2', 'agent'));
  
  console.log('\n5. 执行工具:');
  try {
    var result = ts.executeTool('worker-1', 'bash', { command: 'ls -la' });
    console.log('  执行成功：', result);
  } catch (e) {
    console.log('  执行失败：', e.message);
  }
}
