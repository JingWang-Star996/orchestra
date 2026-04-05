#!/usr/bin/env node

/**
 * WriteWorker - 写入 Worker
 * 
 * 职责：专门处理写入操作（文件编辑、创建、删除等）
 * 优势：权限隔离、操作可追溯、支持事务
 * 
 * 使用场景：
 * - 创建新文件
 * - 编辑现有文件
 * - 删除文件
 * - 批量写入
 */

var util = require('util');

/**
 * WriteWorker 构造函数
 * @param {Object} options - 配置选项
 * @param {string} options.workerId - Worker ID
 * @param {string} options.taskId - 任务 ID
 * @param {boolean} options.verbose - 是否输出详细日志
 * @param {boolean} options.dryRun - 是否只模拟不实际写入
 */
function WriteWorker(options) {
  this.workerId = (options && options.workerId) || 'write-worker-' + Date.now();
  this.taskId = (options && options.taskId) || 'task-' + Date.now();
  this.verbose = (options && options.verbose) || false;
  this.dryRun = (options && options.dryRun) || false;
  
  this.status = 'idle'; // idle, working, completed, error
  this.writeOperations = [];
  this.transactionStack = [];
  this.startTime = null;
  this.endTime = null;
  
  if (this.verbose) {
    console.log('[WriteWorker] 初始化:', this.workerId, 'DryRun:', this.dryRun);
  }
}

/**
 * 写入文件（创建或覆盖）
 * @param {string} filePath - 文件路径
 * @param {string} content - 文件内容
 * @param {Object} options - 写入选项
 * @returns {Promise<Object>} 写入结果
 */
WriteWorker.prototype.writeFile = async function(filePath, content, options) {
  var self = this;
  var startTime = Date.now();
  
  this.status = 'working';
  this.writeOperations.push({
    type: 'writeFile',
    path: filePath,
    contentLength: content.length,
    startTime: startTime,
    status: 'pending'
  });
  
  if (this.verbose) {
    console.log('[WriteWorker] 写入文件:', filePath, '大小:', content.length, '字节');
  }
  
  if (this.dryRun) {
    if (this.verbose) {
      console.log('[WriteWorker] DryRun 模式，跳过实际写入');
    }
    
    var operation = this.writeOperations[this.writeOperations.length - 1];
    operation.status = 'simulated';
    operation.endTime = Date.now();
    operation.duration = operation.endTime - operation.startTime;
    
    return {
      success: true,
      path: filePath,
      simulated: true,
      contentLength: content.length,
      duration: operation.duration
    };
  }
  
  try {
    // 使用 OpenClaw write 工具
    var result = await this._executeWriteTool(filePath, content, options);
    
    var operation = this.writeOperations[this.writeOperations.length - 1];
    operation.status = 'completed';
    operation.endTime = Date.now();
    operation.duration = operation.endTime - operation.startTime;
    operation.result = result;
    
    // 记录到事务栈（用于回滚）
    this.transactionStack.push({
      type: 'write',
      path: filePath,
      previousContent: null, // 新文件，无旧内容
      timestamp: Date.now()
    });
    
    this.status = 'completed';
    
    return {
      success: true,
      path: filePath,
      contentLength: content.length,
      duration: operation.duration
    };
  } catch (error) {
    var operation = this.writeOperations[this.writeOperations.length - 1];
    operation.status = 'error';
    operation.error = error.message;
    
    this.status = 'error';
    
    return {
      success: false,
      path: filePath,
      error: error.message
    };
  }
};

/**
 * 编辑文件（精确替换）
 * @param {string} filePath - 文件路径
 * @param {Array<Object>} edits - 编辑操作列表
 * @param {string} edits[].oldText - 要替换的原文本
 * @param {string} edits[].newText - 替换后的新文本
 * @returns {Promise<Object>} 编辑结果
 */
WriteWorker.prototype.editFile = async function(filePath, edits) {
  var self = this;
  var startTime = Date.now();
  
  this.status = 'working';
  this.writeOperations.push({
    type: 'editFile',
    path: filePath,
    editsCount: edits.length,
    startTime: startTime,
    status: 'pending'
  });
  
  if (this.verbose) {
    console.log('[WriteWorker] 编辑文件:', filePath, '编辑数:', edits.length);
  }
  
  if (this.dryRun) {
    if (this.verbose) {
      console.log('[WriteWorker] DryRun 模式，跳过实际编辑');
    }
    
    var operation = this.writeOperations[this.writeOperations.length - 1];
    operation.status = 'simulated';
    operation.endTime = Date.now();
    operation.duration = operation.endTime - operation.startTime;
    
    return {
      success: true,
      path: filePath,
      simulated: true,
      editsCount: edits.length,
      duration: operation.duration
    };
  }
  
  try {
    // 使用 OpenClaw edit 工具
    var result = await this._executeEditTool(filePath, edits);
    
    var operation = this.writeOperations[this.writeOperations.length - 1];
    operation.status = 'completed';
    operation.endTime = Date.now();
    operation.duration = operation.endTime - operation.startTime;
    operation.result = result;
    
    // 记录到事务栈
    this.transactionStack.push({
      type: 'edit',
      path: filePath,
      edits: edits,
      timestamp: Date.now()
    });
    
    this.status = 'completed';
    
    return {
      success: true,
      path: filePath,
      editsApplied: edits.length,
      duration: operation.duration
    };
  } catch (error) {
    var operation = this.writeOperations[this.writeOperations.length - 1];
    operation.status = 'error';
    operation.error = error.message;
    
    this.status = 'error';
    
    return {
      success: false,
      path: filePath,
      error: error.message
    };
  }
};

/**
 * 追加内容到文件末尾
 * @param {string} filePath - 文件路径
 * @param {string} content - 要追加的内容
 * @returns {Promise<Object>} 追加结果
 */
WriteWorker.prototype.appendToFile = async function(filePath, content) {
  var self = this;
  
  if (this.verbose) {
    console.log('[WriteWorker] 追加内容到文件:', filePath);
  }
  
  // 先读取现有内容
  var readResult;
  if (this.onReadTool) {
    readResult = await this.onReadTool(filePath);
  } else {
    return {
      success: false,
      error: 'Read tool not configured'
    };
  }
  
  if (!readResult.success) {
    return readResult;
  }
  
  // 追加内容
  var newContent = readResult.content + '\n' + content;
  
  return await this.writeFile(filePath, newContent);
};

/**
 * 删除文件
 * @param {string} filePath - 文件路径
 * @returns {Promise<Object>} 删除结果
 */
WriteWorker.prototype.deleteFile = async function(filePath) {
  var self = this;
  var startTime = Date.now();
  
  this.status = 'working';
  this.writeOperations.push({
    type: 'deleteFile',
    path: filePath,
    startTime: startTime,
    status: 'pending'
  });
  
  if (this.verbose) {
    console.log('[WriteWorker] 删除文件:', filePath);
  }
  
  if (this.dryRun) {
    if (this.verbose) {
      console.log('[WriteWorker] DryRun 模式，跳过实际删除');
    }
    
    var operation = this.writeOperations[this.writeOperations.length - 1];
    operation.status = 'simulated';
    operation.endTime = Date.now();
    operation.duration = operation.endTime - operation.startTime;
    
    return {
      success: true,
      path: filePath,
      simulated: true,
      duration: operation.duration
    };
  }
  
  try {
    // 使用 OpenClaw exec 工具删除文件（需要批准）
    // 或者使用文件系统 API
    var result = await this._executeDeleteTool(filePath);
    
    var operation = this.writeOperations[this.writeOperations.length - 1];
    operation.status = 'completed';
    operation.endTime = Date.now();
    operation.duration = operation.endTime - operation.startTime;
    operation.result = result;
    
    // 记录到事务栈
    this.transactionStack.push({
      type: 'delete',
      path: filePath,
      timestamp: Date.now()
    });
    
    this.status = 'completed';
    
    return {
      success: true,
      path: filePath,
      duration: operation.duration
    };
  } catch (error) {
    var operation = this.writeOperations[this.writeOperations.length - 1];
    operation.status = 'error';
    operation.error = error.message;
    
    this.status = 'error';
    
    return {
      success: false,
      path: filePath,
      error: error.message
    };
  }
};

/**
 * 批量写入多个文件
 * @param {Array<Object>} files - 文件列表 [{path, content}]
 * @returns {Promise<Object>} 批量写入结果
 */
WriteWorker.prototype.writeMultipleFiles = async function(files) {
  var self = this;
  var results = [];
  
  if (this.verbose) {
    console.log('[WriteWorker] 批量写入:', files.length, '个文件');
  }
  
  // 串行写入（避免并发冲突）
  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    var result = await this.writeFile(file.path, file.content);
    results.push(result);
    
    if (!result.success) {
      if (this.verbose) {
        console.log('[WriteWorker] 批量写入失败，在文件', file.path, '处中断');
      }
      break;
    }
  }
  
  var successCount = results.filter(function(r) { return r.success; }).length;
  
  return {
    total: files.length,
    success: successCount,
    failed: files.length - successCount,
    results: results
  };
};

/**
 * 回滚最后一个操作
 * @returns {Promise<Object>} 回滚结果
 */
WriteWorker.prototype.rollback = async function() {
  var self = this;
  
  if (this.transactionStack.length === 0) {
    return {
      success: false,
      error: '没有可回滚的操作'
    };
  }
  
  var lastOperation = this.transactionStack.pop();
  
  if (this.verbose) {
    console.log('[WriteWorker] 回滚操作:', lastOperation.type, lastOperation.path);
  }
  
  if (lastOperation.type === 'write') {
    // 删除新创建的文件
    return await this.deleteFile(lastOperation.path);
  } else if (lastOperation.type === 'edit') {
    // 编辑回滚需要原始内容，这里简化处理
    return {
      success: false,
      error: '编辑回滚需要原始内容，暂不支持'
    };
  } else if (lastOperation.type === 'delete') {
    return {
      success: false,
      error: '删除回滚需要备份内容，暂不支持'
    };
  }
  
  return {
    success: true,
    message: '回滚完成'
  };
};

/**
 * 获取 Worker 状态
 * @returns {Object} 状态信息
 */
WriteWorker.prototype.getStatus = function() {
  return {
    workerId: this.workerId,
    taskId: this.taskId,
    status: this.status,
    writeOperations: this.writeOperations.length,
    transactionStack: this.transactionStack.length,
    dryRun: this.dryRun,
    startTime: this.startTime,
    endTime: this.endTime,
    type: 'write-only'
  };
};

/**
 * 执行 OpenClaw write 工具（内部方法）
 * @private
 */
WriteWorker.prototype._executeWriteTool = async function(filePath, content, options) {
  if (this.onWriteTool) {
    return await this.onWriteTool(filePath, content, options);
  }
  
  throw new Error('Write tool not configured. Please set onWriteTool callback.');
};

/**
 * 执行 OpenClaw edit 工具（内部方法）
 * @private
 */
WriteWorker.prototype._executeEditTool = async function(filePath, edits) {
  if (this.onEditTool) {
    return await this.onEditTool(filePath, edits);
  }
  
  throw new Error('Edit tool not configured. Please set onEditTool callback.');
};

/**
 * 执行删除工具（内部方法）
 * @private
 */
WriteWorker.prototype._executeDeleteTool = async function(filePath) {
  if (this.onDeleteTool) {
    return await this.onDeleteTool(filePath);
  }
  
  throw new Error('Delete tool not configured. Please set onDeleteTool callback.');
};

module.exports = WriteWorker;
