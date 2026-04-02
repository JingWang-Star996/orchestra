#!/usr/bin/env node

/**
 * GameDesignWorkflow - 游戏设计 24 人并行工作流（Phase 2 增强功能）
 * 
 * 职责：实现 24 个 AI 岗位的并行协作工作流
 * 
 * 灵感来源：Claude Code Coordinator 的四阶段流程
 * - Research（研究）- Workers 并行
 * - Synthesis（综合）- Coordinator 负责
 * - Implementation（实现）- Workers 并行
 * - Verification（验证）- Workers 并行
 */

class GameDesignWorkflow {
  constructor(options) {
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

  _defineRoles() {
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
  }

  _loadModules() {
    if (!this.ParallelExecutor) {
      this.ParallelExecutor = require('./parallelExecutor');
    }
    if (!this.ScratchpadManager) {
      var sp = require('./scratchpad');
      this.ScratchpadManager = sp.ScratchpadManager;
    }
  }

  async execute(designBrief) {
    this._loadModules();
    console.log('\\n🎮 游戏设计工作流启动');
    console.log('设计简报：' + designBrief + '\\n');
    
    var executor = new this.ParallelExecutor({
      maxConcurrent: this.options.maxConcurrent,
      verbose: this.options.verbose
    });
    
    var scratchpadManager = new this.ScratchpadManager({
      verbose: this.options.verbose
    });
    
    var scratchpad = scratchpadManager.get('game-design-' + Date.now());
    var results = { phases: {}, deliverables: {} };
    
    console.log('📋 ' + this.phases.research);
    var researchRoles = this.roles.filter(function(r) { return r.phase === 'research'; });
    var researchTasks = researchRoles.map(function(role) {
      return { id: 'research-' + role.id, agent: role.name, prompt: '调研：' + designBrief };
    });
    
    results.phases.research = await executor.fanOut(researchTasks);
    await scratchpad.write('research-results', results.phases.research);
    console.log('  完成：' + researchRoles.length + '个岗位\\n');
    
    console.log('🤖 ' + this.phases.synthesis);
    var synthesisRoles = this.roles.filter(function(r) { return r.phase === 'synthesis'; });
    results.phases.synthesis = [];
    
    for (var i = 0; i < synthesisRoles.length; i++) {
      var role = synthesisRoles[i];
      var task = { id: 'synthesis-' + role.id, agent: role.name, prompt: '综合：' + designBrief };
      var batchResults = await executor.fanOut([task]);
      results.phases.synthesis.push.apply(results.phases.synthesis, batchResults);
    }
    
    await scratchpad.write('synthesis-results', results.phases.synthesis);
    console.log('  完成：' + synthesisRoles.length + '个岗位\\n');
    
    console.log('⚙️ ' + this.phases.implementation);
    var implementationRoles = this.roles.filter(function(r) { return r.phase === 'implementation'; });
    var implementationTasks = implementationRoles.map(function(role) {
      return { id: 'implementation-' + role.id, agent: role.name, prompt: '实现：' + designBrief };
    });
    
    results.phases.implementation = await executor.fanOut(implementationTasks);
    await scratchpad.write('implementation-results', results.phases.implementation);
    console.log('  完成：' + implementationRoles.length + '个岗位\\n');
    
    console.log('📊 ' + this.phases.verification);
    var verificationRoles = this.roles.filter(function(r) { return r.phase === 'verification'; });
    var verificationTasks = verificationRoles.map(function(role) {
      return { id: 'verification-' + role.id, agent: role.name, prompt: '验证：' + designBrief };
    });
    
    results.phases.verification = await executor.fanOut(verificationTasks);
    await scratchpad.write('verification-results', results.phases.verification);
    console.log('  完成：' + verificationRoles.length + '个岗位\\n');
    
    results.deliverables = this._aggregateDeliverables(results);
    await scratchpad.write('final-deliverables', results.deliverables);
    
    console.log('✅ 游戏设计工作流完成');
    console.log('交付物：' + Object.keys(results.deliverables).length + '个\\n');
    
    return results;
  }

  _aggregateDeliverables(results) {
    return {
      researchReport: '调研报告',
      technicalArchitecture: '技术架构方案',
      visualStyleGuide: '视觉风格规范',
      productRequirements: '产品需求文档',
      operationStrategy: '运营策略方案',
      gameDesignDocument: '游戏设计文档（GDD）',
      prototype: '可玩原型',
      testReport: '质量检查报告'
    };
  }

  getStatus() {
    return {
      roles: this.roles.length,
      phases: Object.keys(this.phases).length,
      maxConcurrent: this.options.maxConcurrent
    };
  }
}

module.exports = GameDesignWorkflow;

if (require.main === module) {
  var GameDesignWorkflow = require('./gameDesignWorkflow');
  var workflow = new GameDesignWorkflow({ maxConcurrent: 8, verbose: true });
  
  workflow.execute('设计一款竖屏肉鸽网游，包含抽卡、养成、PVP 系统')
    .then(function(results) {
      console.log('\\n=== 执行结果 ===');
      console.log('阶段完成：' + Object.keys(results.phases).length);
      console.log('交付物：' + Object.keys(results.deliverables).length);
      console.log('状态：', workflow.getStatus());
    })
    .catch(function(err) {
      console.error('执行失败：', err.message);
      process.exit(1);
    });
}
