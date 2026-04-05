#!/usr/bin/env node

/**
 * ReadWriteSeparator - 读写分离管理器
 * 
 * 职责：根据任务类型自动路由到 ReadWorker 或 WriteWorker
 * 优势：权限隔离、性能优化、错误隔离
 * 
 * 工作流程：
 * 1. 分析任务类型（只读/写入/混合）
 * 2. 创建对应的 Worker（ReadWorker/WriteWorker）
 * 3. 执行任务
 * 4. 汇总结果
 */

var util = require('util');
var ReadWorker = require('./readWorker');
var WriteWorker = require('./writeWorker');

/**
 * 任务类型枚举
 */
var TaskType = {
  READ_ONLY: 'read_only',           // 只读任务
  WRITE_ONLY: 'write_only',         // 只写任务
  READ_THEN_WRITE: 'read_then_write', // 先读后写
  MIXED: 'mixed'                    // 混合任务
};

/**
 * ReadWriteSeparator 构造函数
 * @param {Object} options - 配置选项
 * @param {boolean} options.verbose - 是否输出详细日志
 * @param {boolean} options.dryRun - 是否 DryRun 模式
 * @param {number} options.maxConcurrentReads - 最大并发读取数
 */
function ReadWriteSeparator(options) {
  this.verbose = (options && options.verbose) || false;
  this.dryRun = (options && options.dryRun) || false;
  this.maxConcurrentReads = (options && options.maxConcurrentReads) || 5;
  
  this.readWorkers = [];
  this.writeWorkers = [];
  this.taskHistory = [];
  
  // 工具回调（由外部注入）
  this.onReadTool = null;
  this.onWriteTool = null;
  this.onEditTool = null;
  this.onDeleteTool = null;
  
  if (this.verbose) {
    console.log('[ReadWriteSeparator] 初始化');
    console.log('  - DryRun:', this.dryRun);
    console.log('  - MaxConcurrentReads:', this.maxConcurrentReads);
  }
}

/**
 * 分析任务类型
 * @param {Object} task - 任务对象
 * @returns {string} 任务类型
 */
ReadWriteSeparator.prototype.analyzeTaskType = function(task) {
  var actions = task.actions || [];
  
  var hasRead = false;
  var hasWrite = false;
  
  for (var i = 0; i < actions.length; i++) {
    var action = actions[i];
    var actionType = action.type || '';
    
    // 检测读操作
    if (actionType.indexOf('read') !== -1 ||
        actionType.indexOf('search') !== -1 ||
        actionType.indexOf('analyze') !== -1) {
      hasRead = true;
    }
    
    // 检测写操作
    if (actionType.indexOf('write') !== -1 ||
        actionType.indexOf('edit') !== -1 ||
        actionType.indexOf('create') !== -1 ||
        actionType.indexOf('delete') !== -1) {
      hasWrite = true;
    }
  }
  
  if (hasRead && hasWrite) {
    return TaskType.READ_THEN_WRITE;
  } else if (hasWrite) {
    return TaskType.WRITE_ONLY;
  } else if (hasRead) {
    return TaskType.READ_ONLY;
  } else {
    return TaskType.MIXED;
  }
};

/**
 * 执行任务（自动路由）
 * @param {Object} task - 任务对象
 * @returns {Promise<Object>} 执行结果
 */
ReadWriteSeparator.prototype.executeTask = async function(task) {
  var self = this;
  var startTime = Date.now();
  
  // 分析任务类型
  var taskType = this.analyzeTaskType(task);
  
  if (this.verbose) {
    console.log('[ReadWriteSeparator] 执行任务');
    console.log('  - 任务类型:', taskType);
    console.log('  - 任务描述:', task.description);
  }
  
  var result;
  
  switch (taskType) {
    case TaskType.READ_ONLY:
      result = await this._executeReadOnly(task);
      break;
    
    case TaskType.WRITE_ONLY:
      result = await this._executeWriteOnly(task);
      break;
    
    case TaskType.READ_THEN_WRITE:
      result = await this._executeReadThenWrite(task);
      break;
    
    case TaskType.MIXED:
    default:
      result = await this._executeMixed(task);
      break;
  }
  
  // 记录任务历史
  this.taskHistory.push({
    taskType: taskType,
    startTime: startTime,
    endTime: Date.now(),
    duration: Date.now() - startTime,
    success: result.success
  });
  
  return result;
};

/**
 * 执行只读任务
 * @private
 */
ReadWriteSeparator.prototype._executeReadOnly = async function(task) {
  var self = this;
  
  if (this.verbose) {
    console.log('[ReadWriteSeparator] 执行只读任务');
  }
  
  // 创建 ReadWorker
  var readWorker = new ReadWorker({
    verbose: this.verbose,
    taskId: task.id
  });
  
  // 注入工具回调
  readWorker.onReadTool = this.onReadTool;
  
  this.readWorkers.push(readWorker);
  
  // 执行读取操作
  var results = [];
  
  for (var i = 0; i < task.actions.length; i++) {
    var action = task.actions[i];
    var result;
    
    if (action.type === 'readFile') {
      result = await readWorker.readFile(action.path, action.options);
    } else if (action.type === 'searchInFile') {
      result = await readWorker.searchInFile(action.path, action.pattern, action.options);
    } else if (action.type === 'analyzeCodeStructure') {
      result = await readWorker.analyzeCodeStructure(action.path);
    }
    
    if (result) {
      results.push(result);
    }
  }
  
  var successCount = results.filter(function(r) { return r.success; }).length;
  
  return {
    success: successCount === results.length,
    taskType: TaskType.READ_ONLY,
    results: results,
    workerStatus: readWorker.getStatus()
  };
};

/**
 * 执行只写任务
 * @private
 */
ReadWriteSeparator.prototype._executeWriteOnly = async function(task) {
  var self = this;
  
  if (this.verbose) {
    console.log('[ReadWriteSeparator] 执行只写任务');
  }
  
  // 创建 WriteWorker
  var writeWorker = new WriteWorker({
    verbose: this.verbose,
    taskId: task.id,
    dryRun: this.dryRun
  });
  
  // 注入工具回调
  writeWorker.onWriteTool = this.onWriteTool;
  writeWorker.onEditTool = this.onEditTool;
  writeWorker.onDeleteTool = this.onDeleteTool;
  
  this.writeWorkers.push(writeWorker);
  
  // 执行写入操作
  var results = [];
  
  for (var i = 0; i < task.actions.length; i++) {
    var action = task.actions[i];
    var result;
    
    if (action.type === 'writeFile') {
      result = await writeWorker.writeFile(action.path, action.content, action.options);
    } else if (action.type === 'editFile') {
      result = await writeWorker.editFile(action.path, action.edits);
    } else if (action.type === 'deleteFile') {
      result = await writeWorker.deleteFile(action.path);
    }
    
    if (result) {
      results.push(result);
    }
  }
  
  var successCount = results.filter(function(r) { return r.success; }).length;
  
  return {
    success: successCount === results.length,
    taskType: TaskType.WRITE_ONLY,
    results: results,
    workerStatus: writeWorker.getStatus()
  };
};

/**
 * 执行先读后写任务
 * @private
 */
ReadWriteSeparator.prototype._executeReadThenWrite = async function(task) {
  var self = this;
  
  if (this.verbose) {
    console.log('[ReadWriteSeparator] 执行先读后写任务');
  }
  
  // 分离读操作和写操作
  var readActions = [];
  var writeActions = [];
  
  for (var i = 0; i < task.actions.length; i++) {
    var action = task.actions[i];
    var actionType = action.type || '';
    
    if (actionType.indexOf('read') !== -1 ||
        actionType.indexOf('search') !== -1 ||
        actionType.indexOf('analyze') !== -1) {
      readActions.push(action);
    } else {
      writeActions.push(action);
    }
  }
  
  // 先执行读操作
  var readTask = {
    id: task.id + '-read',
    description: task.description + ' (读取阶段)',
    actions: readActions
  };
  
  var readResult = await this._executeReadOnly(readTask);
  
  if (!readResult.success) {
    return {
      success: false,
      taskType: TaskType.READ_THEN_WRITE,
      error: '读取阶段失败',
      readResult: readResult
    };
  }
  
  // 再执行写操作（使用读取的结果）
  var writeTask = {
    id: task.id + '-write',
    description: task.description + ' (写入阶段)',
    actions: writeActions,
    context: readResult.results // 传递读取结果
  };
  
  var writeResult = await this._executeWriteOnly(writeTask);
  
  return {
    success: writeResult.success,
    taskType: TaskType.READ_THEN_WRITE,
    readResult: readResult,
    writeResult: writeResult
  };
};

/**
 * 执行混合任务
 * @private
 */
ReadWriteSeparator.prototype._executeMixed = async function(task) {
  var self = this;
  
  if (this.verbose) {
    console.log('[ReadWriteSeparator] 执行混合任务');
  }
  
  // 混合任务：为每个操作创建合适的 Worker
  var results = [];
  
  for (var i = 0; i < task.actions.length; i++) {
    var action = task.actions[i];
    var actionType = action.type || '';
    var result;
    
    // 判断操作类型
    var isReadOp = actionType.indexOf('read') !== -1 ||
                   actionType.indexOf('search') !== -1 ||
                   actionType.indexOf('analyze') !== -1;
    
    if (isReadOp) {
      // 读操作
      var readWorker = new ReadWorker({
        verbose: this.verbose,
        taskId: task.id + '-action-' + i
      });
      readWorker.onReadTool = this.onReadTool;
      
      if (action.type === 'readFile') {
        result = await readWorker.readFile(action.path, action.options);
      } else if (action.type === 'searchInFile') {
        result = await readWorker.searchInFile(action.path, action.pattern, action.options);
      }
      
      this.readWorkers.push(readWorker);
    } else {
      // 写操作
      var writeWorker = new WriteWorker({
        verbose: this.verbose,
        taskId: task.id + '-action-' + i,
        dryRun: this.dryRun
      });
      writeWorker.onWriteTool = this.onWriteTool;
      writeWorker.onEditTool = this.onEditTool;
      writeWorker.onDeleteTool = this.onDeleteTool;
      
      if (action.type === 'writeFile') {
        result = await writeWorker.writeFile(action.path, action.content, action.options);
      } else if (action.type === 'editFile') {
        result = await writeWorker.editFile(action.path, action.edits);
      }
      
      this.writeWorkers.push(writeWorker);
    }
    
    if (result) {
      results.push(result);
    }
  }
  
  var successCount = results.filter(function(r) { return r.success; }).length;
  
  return {
    success: successCount === results.length,
    taskType: TaskType.MIXED,
    results: results,
    readWorkersCount: this.readWorkers.length,
    writeWorkersCount: this.writeWorkers.length
  };
};

/**
 * 设置工具回调
 * @param {Object} tools - 工具回调对象
 */
ReadWriteSeparator.prototype.setTools = function(tools) {
  this.onReadTool = tools.onReadTool;
  this.onWriteTool = tools.onWriteTool;
  this.onEditTool = tools.onEditTool;
  this.onDeleteTool = tools.onDeleteTool;
};

/**
 * 获取统计信息
 * @returns {Object} 统计信息
 */
ReadWriteSeparator.prototype.getStats = function() {
  var totalReadOps = this.readWorkers.reduce(function(sum, w) {
    return sum + w.readOperations.length;
  }, 0);
  
  var totalWriteOps = this.writeWorkers.reduce(function(sum, w) {
    return sum + w.writeOperations.length;
  }, 0);
  
  return {
    totalTasks: this.taskHistory.length,
    readWorkers: this.readWorkers.length,
    writeWorkers: this.writeWorkers.length,
    totalReadOperations: totalReadOps,
    totalWriteOperations: totalWriteOps,
    taskHistory: this.taskHistory.slice(-10) // 最近 10 个任务
  };
};

/**
 * 获取性能报告
 * @returns {Object} 性能报告
 */
ReadWriteSeparator.prototype.getPerformanceReport = function() {
  if (this.taskHistory.length === 0) {
    return {
      message: '没有任务历史'
    };
  }
  
  var totalDuration = 0;
  var successCount = 0;
  
  for (var i = 0; i < this.taskHistory.length; i++) {
    var task = this.taskHistory[i];
    totalDuration += task.duration;
    if (task.success) {
      successCount++;
    }
  }
  
  var avgDuration = totalDuration / this.taskHistory.length;
  var successRate = (successCount / this.taskHistory.length) * 100;
  
  return {
    totalTasks: this.taskHistory.length,
    averageDuration: Math.round(avgDuration),
    successRate: successRate.toFixed(2) + '%',
    readWorkersCreated: this.readWorkers.length,
    writeWorkersCreated: this.writeWorkers.length
  };
};

module.exports = ReadWriteSeparator;
module.exports.TaskType = TaskType;
