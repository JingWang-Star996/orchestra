/**
 * ReadWriteSeparator 单元测试
 */

var assert = require('assert');
var ReadWriteSeparator = require('../readWriteSeparator');
var TaskType = require('../readWriteSeparator').TaskType;

describe('ReadWriteSeparator', function() {
  var separator;
  
  beforeEach(function() {
    separator = new ReadWriteSeparator({
      verbose: false,
      dryRun: true,
      maxConcurrentReads: 5
    });
  });
  
  describe('任务类型分析', function() {
    it('应该识别只读任务', function() {
      var task = {
        actions: [
          { type: 'readFile', path: '/test.js' },
          { type: 'searchInFile', path: '/test.js', pattern: 'test' }
        ]
      };
      
      var taskType = separator.analyzeTaskType(task);
      assert.strictEqual(taskType, TaskType.READ_ONLY);
    });
    
    it('应该识别只写任务', function() {
      var task = {
        actions: [
          { type: 'writeFile', path: '/test.js', content: 'test' },
          { type: 'editFile', path: '/test.js', edits: [] }
        ]
      };
      
      var taskType = separator.analyzeTaskType(task);
      assert.strictEqual(taskType, TaskType.WRITE_ONLY);
    });
    
    it('应该识别先读后写任务', function() {
      var task = {
        actions: [
          { type: 'readFile', path: '/test.js' },
          { type: 'writeFile', path: '/test.js', content: 'test' }
        ]
      };
      
      var taskType = separator.analyzeTaskType(task);
      assert.strictEqual(taskType, TaskType.READ_THEN_WRITE);
    });
    
    it('应该识别混合任务', function() {
      var task = {
        actions: [
          { type: 'unknown', path: '/test.js' }
        ]
      };
      
      var taskType = separator.analyzeTaskType(task);
      assert.strictEqual(taskType, TaskType.MIXED);
    });
  });
  
  describe('工具回调设置', function() {
    it('应该能设置工具回调', function() {
      var tools = {
        onReadTool: function() {},
        onWriteTool: function() {},
        onEditTool: function() {},
        onDeleteTool: function() {}
      };
      
      separator.setTools(tools);
      
      assert.strictEqual(separator.onReadTool, tools.onReadTool);
      assert.strictEqual(separator.onWriteTool, tools.onWriteTool);
      assert.strictEqual(separator.onEditTool, tools.onEditTool);
      assert.strictEqual(separator.onDeleteTool, tools.onDeleteTool);
    });
  });
  
  describe('统计信息', function() {
    it('应该能获取统计信息', function() {
      var stats = separator.getStats();
      
      assert.strictEqual(typeof stats.totalTasks, 'number');
      assert.strictEqual(typeof stats.readWorkers, 'number');
      assert.strictEqual(typeof stats.writeWorkers, 'number');
      assert.strictEqual(typeof stats.totalReadOperations, 'number');
      assert.strictEqual(typeof stats.totalWriteOperations, 'number');
    });
    
    it('应该记录任务历史', function() {
      assert.strictEqual(separator.taskHistory.length, 0);
    });
  });
  
  describe('性能报告', function() {
    it('应该能生成性能报告（无任务时）', function() {
      var report = separator.getPerformanceReport();
      
      assert.strictEqual(report.totalTasks, 0);
    });
  });
  
  describe('DryRun 模式', function() {
    it('应该启用 DryRun 模式', function() {
      assert.strictEqual(separator.dryRun, true);
    });
    
    it('应该能禁用 DryRun 模式', function() {
      var separatorNoDryRun = new ReadWriteSeparator({
        dryRun: false
      });
      
      assert.strictEqual(separatorNoDryRun.dryRun, false);
    });
  });
});

describe('ReadWorker', function() {
  var ReadWorker = require('../readWorker');
  var readWorker;
  
  beforeEach(function() {
    readWorker = new ReadWorker({
      verbose: false
    });
  });
  
  describe('初始化', function() {
    it('应该能创建 ReadWorker', function() {
      assert.ok(readWorker);
      assert.strictEqual(readWorker.status, 'idle');
    });
    
    it('应该能获取状态', function() {
      var status = readWorker.getStatus();
      
      assert.strictEqual(status.type, 'read-only');
      assert.ok(status.workerId);
      assert.ok(status.taskId);
    });
  });
  
  describe('工具回调', function() {
    it('应该在没有配置工具时抛出错误', async function() {
      try {
        await readWorker.readFile('/test.js');
        assert.fail('应该抛出错误');
      } catch (error) {
        assert.ok(error.message.indexOf('not configured') !== -1);
      }
    });
    
    it('应该能配置工具回调', function() {
      readWorker.onReadTool = async function(filePath, options) {
        return { content: 'test content', lines: 10 };
      };
      
      assert.ok(readWorker.onReadTool);
    });
  });
});

describe('WriteWorker', function() {
  var WriteWorker = require('../writeWorker');
  var writeWorker;
  
  beforeEach(function() {
    writeWorker = new WriteWorker({
      verbose: false,
      dryRun: true
    });
  });
  
  describe('初始化', function() {
    it('应该能创建 WriteWorker', function() {
      assert.ok(writeWorker);
      assert.strictEqual(writeWorker.status, 'idle');
      assert.strictEqual(writeWorker.dryRun, true);
    });
    
    it('应该能获取状态', function() {
      var status = writeWorker.getStatus();
      
      assert.strictEqual(status.type, 'write-only');
      assert.strictEqual(status.dryRun, true);
      assert.ok(status.workerId);
      assert.ok(status.taskId);
    });
  });
  
  describe('DryRun 模式', function() {
    it('在 DryRun 模式下不应该实际写入', async function() {
      writeWorker.onWriteTool = async function(filePath, content) {
        throw new Error('不应该调用实际写入');
      };
      
      var result = await writeWorker.writeFile('/test.js', 'content');
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.simulated, true);
    });
  });
  
  describe('回滚', function() {
    it('应该能回滚操作', async function() {
      var result = await writeWorker.rollback();
      
      // 没有操作可回滚
      assert.strictEqual(result.success, false);
    });
  });
});
