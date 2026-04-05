#!/usr/bin/env node

/**
 * ReadWorker - 只读 Worker
 * 
 * 职责：专门处理只读操作（文件读取、代码分析、搜索等）
 * 优势：安全性高、可并行、无副作用
 * 
 * 使用场景：
 * - 读取文件内容
 * - 分析代码结构
 * - 搜索关键词
 * - 收集信息
 */

var util = require('util');

/**
 * ReadWorker 构造函数
 * @param {Object} options - 配置选项
 * @param {string} options.workerId - Worker ID
 * @param {string} options.taskId - 任务 ID
 * @param {boolean} options.verbose - 是否输出详细日志
 */
function ReadWorker(options) {
  this.workerId = (options && options.workerId) || 'read-worker-' + Date.now();
  this.taskId = (options && options.taskId) || 'task-' + Date.now();
  this.verbose = (options && options.verbose) || false;
  
  this.status = 'idle'; // idle, working, completed, error
  this.readOperations = [];
  this.startTime = null;
  this.endTime = null;
  
  if (this.verbose) {
    console.log('[ReadWorker] 初始化:', this.workerId);
  }
}

/**
 * 读取文件内容
 * @param {string} filePath - 文件路径
 * @param {Object} options - 读取选项
 * @returns {Promise<Object>} 读取结果
 */
ReadWorker.prototype.readFile = async function(filePath, options) {
  var self = this;
  var startTime = Date.now();
  
  this.status = 'working';
  this.readOperations.push({
    type: 'readFile',
    path: filePath,
    startTime: startTime,
    status: 'pending'
  });
  
  if (this.verbose) {
    console.log('[ReadWorker] 读取文件:', filePath);
  }
  
  try {
    // 使用 OpenClaw read 工具
    var result = await this._executeReadTool(filePath, options);
    
    var operation = this.readOperations[this.readOperations.length - 1];
    operation.status = 'completed';
    operation.endTime = Date.now();
    operation.duration = operation.endTime - operation.startTime;
    operation.result = result;
    
    this.status = 'completed';
    
    return {
      success: true,
      path: filePath,
      content: result.content,
      lines: result.lines,
      duration: operation.duration
    };
  } catch (error) {
    var operation = this.readOperations[this.readOperations.length - 1];
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
 * 批量读取多个文件
 * @param {Array<string>} filePaths - 文件路径列表
 * @returns {Promise<Array<Object>>} 读取结果列表
 */
ReadWorker.prototype.readMultipleFiles = async function(filePaths) {
  var self = this;
  var results = [];
  
  if (this.verbose) {
    console.log('[ReadWorker] 批量读取:', filePaths.length, '个文件');
  }
  
  // 并行读取所有文件
  var promises = filePaths.map(function(filePath) {
    return self.readFile(filePath);
  });
  
  results = await Promise.all(promises);
  
  var successCount = results.filter(function(r) { return r.success; }).length;
  
  return {
    total: filePaths.length,
    success: successCount,
    failed: filePaths.length - successCount,
    results: results
  };
};

/**
 * 搜索文件内容
 * @param {string} filePath - 文件路径
 * @param {string} pattern - 搜索模式（支持正则）
 * @param {Object} options - 搜索选项
 * @returns {Promise<Object>} 搜索结果
 */
ReadWorker.prototype.searchInFile = async function(filePath, pattern, options) {
  var self = this;
  var startTime = Date.now();
  
  this.status = 'working';
  
  if (this.verbose) {
    console.log('[ReadWorker] 搜索文件:', filePath, '模式:', pattern);
  }
  
  try {
    // 先读取文件
    var readResult = await this.readFile(filePath);
    
    if (!readResult.success) {
      return {
        success: false,
        error: '文件读取失败：' + readResult.error
      };
    }
    
    // 执行搜索
    var content = readResult.content;
    var matches = [];
    var lines = content.split('\n');
    
    var regex;
    try {
      regex = new RegExp(pattern, options && options.ignoreCase ? 'gi' : 'g');
    } catch (e) {
      return {
        success: false,
        error: '正则表达式无效：' + e.message
      };
    }
    
    lines.forEach(function(line, index) {
      var match;
      regex.lastIndex = 0;
      while ((match = regex.exec(line)) !== null) {
        matches.push({
          line: index + 1,
          content: line.trim(),
          match: match[0],
          position: match.index
        });
      }
    });
    
    return {
      success: true,
      path: filePath,
      pattern: pattern,
      totalMatches: matches.length,
      matches: matches.slice(0, options && options.limit || 100),
      duration: Date.now() - startTime
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * 分析代码结构
 * @param {string} filePath - 文件路径
 * @returns {Promise<Object>} 分析结果
 */
ReadWorker.prototype.analyzeCodeStructure = async function(filePath) {
  var self = this;
  
  if (this.verbose) {
    console.log('[ReadWorker] 分析代码结构:', filePath);
  }
  
  try {
    var readResult = await this.readFile(filePath);
    
    if (!readResult.success) {
      return {
        success: false,
        error: readResult.error
      };
    }
    
    var content = readResult.content;
    var lines = content.split('\n');
    
    // 分析代码结构
    var structure = {
      path: filePath,
      totalLines: lines.length,
      codeLines: 0,
      commentLines: 0,
      emptyLines: 0,
      functions: [],
      classes: [],
      imports: []
    };
    
    lines.forEach(function(line, index) {
      var trimmed = line.trim();
      
      // 统计行数
      if (trimmed === '') {
        structure.emptyLines++;
      } else if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
        structure.commentLines++;
      } else {
        structure.codeLines++;
      }
      
      // 检测函数定义
      if (trimmed.match(/^(function|async function|const \w+ = (async )?\()/)) {
        var funcName = trimmed.match(/(?:function|const)\s+(\w+)/);
        if (funcName) {
          structure.functions.push({
            name: funcName[1],
            line: index + 1
          });
        }
      }
      
      // 检测类定义
      if (trimmed.match(/^(class|export class)/)) {
        var className = trimmed.match(/class\s+(\w+)/);
        if (className) {
          structure.classes.push({
            name: className[1],
            line: index + 1
          });
        }
      }
      
      // 检测导入
      if (trimmed.match(/^(import|require)/)) {
        structure.imports.push({
          line: index + 1,
          content: trimmed
        });
      }
    });
    
    return {
      success: true,
      structure: structure
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * 获取 Worker 状态
 * @returns {Object} 状态信息
 */
ReadWorker.prototype.getStatus = function() {
  return {
    workerId: this.workerId,
    taskId: this.taskId,
    status: this.status,
    readOperations: this.readOperations.length,
    startTime: this.startTime,
    endTime: this.endTime,
    type: 'read-only'
  };
};

/**
 * 执行 OpenClaw read 工具（内部方法）
 * @private
 */
ReadWorker.prototype._executeReadTool = async function(filePath, options) {
  // 这里应该调用 OpenClaw 的 read 工具
  // 由于在 Orchestra 内部，我们通过回调或事件传递
  // 实际使用时由 WorkerManager 注入
  
  if (this.onReadTool) {
    return await this.onReadTool(filePath, options);
  }
  
  throw new Error('Read tool not configured. Please set onReadTool callback.');
};

module.exports = ReadWorker;
