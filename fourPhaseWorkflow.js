#!/usr/bin/env node

/**
 * FourPhaseWorkflow - 四阶段工作流引擎（Phase 3 新增）
 * 
 * 职责：标准化的 Research → Synthesis → Implementation → Verification 流程
 * 
 * 阶段说明：
 *   Phase 1: Research（研究） - 信息收集、问题分析
 *   Phase 2: Synthesis（综合） - 方案制定、决策
 *   Phase 3: Implementation（实现） - 执行、编码
 *   Phase 4: Verification（验证） - 测试、确认
 * 
 * 特性：
 *   - 阶段间通过 Scratchpad 共享上下文
 *   - 支持自定义阶段处理器
 *   - 支持超时控制
 *   - 支持跳过阶段
 * 
 * 灵感来源：Claude Code 的四阶段工作流模型
 */

var EventEmitter = require('events');
var util = require('util');

var PHASES = {
  RESEARCH: 'research',
  SYNTHESIS: 'synthesis',
  IMPLEMENTATION: 'implementation',
  VERIFICATION: 'verification'
};

var DEFAULT_PHASE_CONFIG = {
  research: { enabled: true, timeout: 120000 },
  synthesis: { enabled: true, timeout: 60000 },
  implementation: { enabled: true, timeout: 300000 },
  verification: { enabled: true, timeout: 120000 }
};

/**
 * FourPhaseWorkflow 构造函数
 * @param {Object} options
 * @param {Object} options.scratchpad - Scratchpad 实例
 * @param {boolean} options.verbose - 详细日志
 */
function FourPhaseWorkflow(options) {
  EventEmitter.call(this);
  options = options || {};
  this.scratchpad = options.scratchpad || null;
  this.verbose = options.verbose || false;
  this.phaseConfig = {};
  for (var k in DEFAULT_PHASE_CONFIG) {
    this.phaseConfig[k] = Object.assign({}, DEFAULT_PHASE_CONFIG[k]);
  }
  this.handlers = {};
  this.currentTask = null;
  this.phaseResults = {};
}

util.inherits(FourPhaseWorkflow, EventEmitter);

/**
 * 注册阶段处理器
 */
FourPhaseWorkflow.prototype.registerHandler = function(phase, handler) {
  if (!PHASES[phase.toUpperCase()]) throw new Error('未知阶段: ' + phase);
  this.handlers[phase] = handler;
  return this;
};

/**
 * 注册阶段处理器（register 是 registerHandler 的别名）
 */
FourPhaseWorkflow.prototype.register = function(phase, handler) {
  return this.registerHandler(phase, handler);
};

/**
 * 配置阶段
 */
FourPhaseWorkflow.prototype.configurePhase = function(phase, config) {
  if (this.phaseConfig[phase]) Object.assign(this.phaseConfig[phase], config);
  return this;
};

/**
 * 执行完整工作流
 */
FourPhaseWorkflow.prototype.execute = async function(task) {
  var self = this;
  this.currentTask = task;
  this.phaseResults = {};
  var startTime = Date.now();
  var context = Object.assign({}, task.context || {});
  var skipPhases = task.skipPhases || [];
  var taskId = task.id || 'task-' + Date.now();
  var phaseOrder = [PHASES.RESEARCH, PHASES.SYNTHESIS, PHASES.IMPLEMENTATION, PHASES.VERIFICATION];
  var success = true;

  this.emit('start', { taskId: taskId, task: task });
  if (this.verbose) console.log('[FourPhaseWorkflow] 开始: ' + task.description);

  for (var i = 0; i < phaseOrder.length; i++) {
    var phase = phaseOrder[i];
    var config = this.phaseConfig[phase];

    if (!config.enabled || skipPhases.indexOf(phase) !== -1) {
      this.phaseResults[phase] = { status: 'skipped', duration: 0 };
      continue;
    }

    this.emit('phase:start', { phase: phase });
    var result = await this._executePhase(phase, context, config);
    this.phaseResults[phase] = result;

    if (result.context) Object.assign(context, result.context);

    // 保存到 Scratchpad
    if (this.scratchpad && result.status === 'success') {
      try { await this.scratchpad.put(taskId, phase, result.output); }
      catch (e) { if (this.verbose) console.log('[FourPhaseWorkflow] Scratchpad 写入失败'); }
    }

    this.emit('phase:complete', { phase: phase, result: result });
    if (this.verbose) {
      console.log('[FourPhaseWorkflow] ' + phase + ': ' + result.status + ' (' + result.duration + 'ms)');
    }

    if (result.status === 'failed' || result.status === 'timeout') {
      success = false;
      if (this.verbose) console.log('[FourPhaseWorkflow] 阶段失败，终止');
      break;
    }
  }

  var duration = Date.now() - startTime;
  var result = {
    taskId: taskId, description: task.description, success: success,
    phases: this.phaseResults, context: context, duration: duration
  };
  this.emit('complete', result);
  if (this.verbose) console.log('[FourPhaseWorkflow] 完成: ' + (success ? '成功' : '失败') + ' (' + duration + 'ms)');
  return result;
};

/**
 * 执行单个阶段
 */
FourPhaseWorkflow.prototype._executePhase = async function(phase, context, config) {
  var startTime = Date.now();
  var handler = this.handlers[phase] || this._defaultHandler(phase);
  try {
    var result = await this._withTimeout(handler(context), config.timeout, phase + ' 超时');
    return { status: 'success', output: result, context: result.context || context, duration: Date.now() - startTime };
  } catch (err) {
    return { status: err.message.indexOf('超时') !== -1 ? 'timeout' : 'failed', error: err.message, duration: Date.now() - startTime };
  }
};

/**
 * 超时控制
 */
FourPhaseWorkflow.prototype._withTimeout = function(promise, ms, message) {
  var timeout = new Promise(function(_, reject) { setTimeout(function() { reject(new Error(message)); }, ms); });
  return Promise.race([promise, timeout]);
};

/**
 * 默认阶段处理器
 */
FourPhaseWorkflow.prototype._defaultHandler = function(phase) {
  switch (phase) {
    case PHASES.RESEARCH: return function(c) { return Promise.resolve({ phase: 'research', summary: '信息收集完成', context: c }); };
    case PHASES.SYNTHESIS: return function(c) { return Promise.resolve({ phase: 'synthesis', plan: [], context: c }); };
    case PHASES.IMPLEMENTATION: return function(c) { return Promise.resolve({ phase: 'implementation', changes: [], context: c }); };
    case PHASES.VERIFICATION: return function(c) { return Promise.resolve({ phase: 'verification', passed: true, context: c }); };
    default: return function() { return Promise.reject(new Error('未知阶段')); };
  }
};

/**
 * 获取执行报告
 */
FourPhaseWorkflow.prototype.getReport = function() {
  var self = this;
  var report = { task: this.currentTask ? this.currentTask.description : null, duration: 0, phases: {} };
  Object.keys(this.phaseResults).forEach(function(p) {
    var r = self.phaseResults[p];
    report.phases[p] = { status: r.status, duration: r.duration, error: r.error || null };
  });
  return report;
};

module.exports = FourPhaseWorkflow;
module.exports.PHASES = PHASES;

// CLI 入口
if (require.main === module) {
  var FourPhaseWorkflow = require('./fourPhaseWorkflow');
  var w = new FourPhaseWorkflow({ verbose: true });
  w.execute({ id: 'test-001', description: '修复登录 Bug' }).then(function(r) {
    console.log('报告:', JSON.stringify(w.getReport(), null, 2));
  });
}
