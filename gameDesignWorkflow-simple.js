#!/usr/bin/env node

/**
 * GameDesignWorkflow - 简化版（用于测试）
 */

var util = require('util');

function GameDesignWorkflow(options) {
  this.options = {
    maxConcurrent: (options && options.maxConcurrent) || 8,
    verbose: (options && options.verbose) || false
  };
  
  this.ParallelExecutor = null;
  this.ScratchpadManager = null;
  this.roles = this._defineRoles();
  this.phases = {
    research: 'Phase 1: Research',
    synthesis: 'Phase 2: Synthesis',
    implementation: 'Phase 3: Implementation',
    verification: 'Phase 4: Verification'
  };
}

GameDesignWorkflow.prototype._defineRoles = function() {
  return [
    { id: 'ceo', name: 'AI CEO', phase: 'all' },
    { id: 'producer', name: 'AI 制作人', phase: 'all' },
    { id: 'lead-designer', name: 'AI 主策划', phase: 'research' },
    { id: 'numerical', name: 'AI 数值策划', phase: 'research' },
    { id: 'system', name: 'AI 系统策划', phase: 'research' },
    { id: 'art-lead', name: 'AI 主美', phase: 'research' },
    { id: 'data-analyst', name: 'AI 数据分析师', phase: 'research' },
    { id: 'art-director', name: 'AI 美术总监', phase: 'synthesis' },
    { id: 'tech-lead', name: 'AI 主程', phase: 'synthesis' },
    { id: 'product', name: 'AI 产品经理', phase: 'synthesis' },
    { id: 'ops-director', name: 'AI 运营总监', phase: 'synthesis' },
    { id: 'level', name: 'AI 关卡策划', phase: 'implementation' },
    { id: 'narrative', name: 'AI 剧情策划', phase: 'implementation' },
    { id: 'combat', name: 'AI 战斗策划', phase: 'implementation' },
    { id: 'economy', name: 'AI 经济策划', phase: 'implementation' },
    { id: 'character-artist', name: 'AI 角色原画师', phase: 'implementation' },
    { id: 'client', name: 'AI 客户端程序员', phase: 'implementation' },
    { id: 'server', name: 'AI 服务器程序员', phase: 'implementation' },
    { id: 'ai-architect', name: 'AI AI 技术总监', phase: 'implementation' },
    { id: 'ux', name: 'AI UX 设计师', phase: 'implementation' },
    { id: 'monetization', name: 'AI 变现设计师', phase: 'implementation' },
    { id: 'event', name: 'AI 活动策划', phase: 'verification' },
    { id: 'community', name: 'AI 社区经理', phase: 'verification' },
    { id: 'marketing', name: 'AI 市场营销经理', phase: 'verification' },
    { id: 'qa', name: 'AI QA 主管', phase: 'verification' },
    { id: 'user-ops', name: 'AI 用户运营', phase: 'verification' },
    { id: 'biz-ops', name: 'AI 商业化运营', phase: 'verification' }
  ];
};

GameDesignWorkflow.prototype._loadModules = function() {
  if (!this.ParallelExecutor) {
    this.ParallelExecutor = require('./parallelExecutor');
  }
  if (!this.ScratchpadManager) {
    var sp = require('./scratchpad');
    this.ScratchpadManager = sp.ScratchpadManager;
  }
};

GameDesignWorkflow.prototype.getStatus = function() {
  return {
    roles: this.roles.length,
    phases: Object.keys(this.phases).length,
    maxConcurrent: this.options.maxConcurrent
  };
};

module.exports = GameDesignWorkflow;

// 测试
if (require.main === module) {
  var workflow = new GameDesignWorkflow({ maxConcurrent: 8, verbose: true });
  console.log('GameDesignWorkflow loaded OK');
  console.log('Roles:', workflow.roles.length);
  console.log('Status:', workflow.getStatus());
}
