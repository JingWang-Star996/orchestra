/**
 * DecisionMatrix - 集成 ML 优化模块的决策矩阵
 * 
 * 展示如何将 WeightOptimizer 集成到现有 Orchestra 系统
 */

const WeightOptimizer = require('./WeightOptimizer');

class DecisionMatrix {
  constructor(options = {}) {
    // 初始化权重优化器
    this.optimizer = new WeightOptimizer({
      baseWeights: options.baseWeights || {
        'rule_based': 1.0,      // 规则匹配
        'keyword_match': 1.0,   // 关键词匹配
        'fuzzy_match': 1.0,     // 模糊匹配
        'ml_predict': 1.0       // ML 预测（预留）
      },
      adjustmentFactor: options.adjustmentFactor || 0.1,
      minWeight: options.minWeight || 0.1,
      maxWeight: options.maxWeight || 10.0
    });

    this.verbose = options.verbose || false;
    this.decisionCount = 0;
  }

  /**
   * 做出决策（集成到 Router 的 _findBestAgent 方法）
   * @param {Object} task - 任务对象
   * @param {Array} availableAgents - 可用 Agent 列表
   * @returns {string} 选中的 Agent
   */
  decide(task, availableAgents) {
    this.decisionCount++;
    
    // 1. 获取可用策略（匹配规则）
    const strategies = this._getMatchingStrategies(task, availableAgents);
    
    if (strategies.length === 0) {
      // 没有匹配，返回默认
      return this._defaultDecision(task, availableAgents);
    }

    if (strategies.length === 1) {
      // 只有一个匹配，直接返回
      return strategies[0];
    }

    // 2. 使用优化器按权重随机选择策略
    const selectedStrategy = this.optimizer.selectStrategyWeighted(
      strategies.map(s => s.strategy)
    );

    // 3. 找到对应的 Agent
    const selected = strategies.find(s => s.strategy === selectedStrategy);
    
    if (this.verbose) {
      console.log(`[DecisionMatrix] 任务 ${task.id}: ${selected.strategy} → ${selected.agent}`);
    }

    return selected.agent;
  }

  /**
   * 记录决策结果（在任务执行完成后调用）
   * @param {Object} decision - 决策信息
   * @param {boolean} success - 是否成功
   */
  recordResult(decision, success) {
    const newWeights = this.optimizer.recordAndOptimize({
      decisionId: `dec_${Date.now()}_${this.decisionCount}`,
      strategy: decision.strategy,
      success: success,
      metadata: {
        taskId: decision.taskId,
        agent: decision.agent,
        timestamp: Date.now()
      }
    });

    if (this.verbose) {
      console.log(`[DecisionMatrix] 记录结果：${decision.strategy} ${success ? '✅' : '❌'}`);
      console.log(`[DecisionMatrix] 当前权重:`, newWeights);
    }

    return newWeights;
  }

  /**
   * 获取匹配的策略列表
   * @private
   */
  _getMatchingStrategies(task, availableAgents) {
    const strategies = [];
    const keywords = (task.title + ' ' + (task.description || '')).toLowerCase();

    // 策略 1: 规则匹配（精确匹配 taskTypeMap）
    const ruleMatch = this._ruleMatch(keywords, availableAgents);
    if (ruleMatch) {
      strategies.push({ strategy: 'rule_based', agent: ruleMatch, confidence: 0.9 });
    }

    // 策略 2: 关键词匹配
    const keywordMatch = this._keywordMatch(keywords, availableAgents);
    if (keywordMatch) {
      strategies.push({ strategy: 'keyword_match', agent: keywordMatch, confidence: 0.7 });
    }

    // 策略 3: 模糊匹配
    const fuzzyMatch = this._fuzzyMatch(keywords, availableAgents);
    if (fuzzyMatch) {
      strategies.push({ strategy: 'fuzzy_match', agent: fuzzyMatch, confidence: 0.5 });
    }

    return strategies;
  }

  /**
   * 规则匹配
   * @private
   */
  _ruleMatch(keywords, availableAgents) {
    const taskTypeMap = {
      '需求': 'AI 主策划',
      '设计': 'AI 主策划',
      '数值': 'AI 数值策划',
      '代码': 'AI 主程',
      '程序': 'AI 主程',
      '美术': 'AI 主美',
      '测试': 'AI QA 主管',
      '数据': 'AI 数据分析师'
    };

    for (const [type, agent] of Object.entries(taskTypeMap)) {
      if (keywords.includes(type.toLowerCase()) && availableAgents.includes(agent)) {
        return agent;
      }
    }
    return null;
  }

  /**
   * 关键词匹配
   * @private
   */
  _keywordMatch(keywords, availableAgents) {
    const keywordMap = {
      '玩法': 'AI 主策划',
      '系统': 'AI 系统策划',
      '关卡': 'AI 关卡策划',
      '剧情': 'AI 剧情策划',
      '战斗': 'AI 战斗策划',
      '架构': 'AI 主程',
      '前端': 'AI 客户端程序员',
      '后端': 'AI 服务器程序员'
    };

    for (const [keyword, agent] of Object.entries(keywordMap)) {
      if (keywords.includes(keyword.toLowerCase()) && availableAgents.includes(agent)) {
        return agent;
      }
    }
    return null;
  }

  /**
   * 模糊匹配
   * @private
   */
  _fuzzyMatch(keywords, availableAgents) {
    if (keywords.includes('写') || keywords.includes('文章')) {
      return '编辑部 - 资深撰稿人';
    }
    if (keywords.includes('游戏') || keywords.includes('玩法')) {
      return 'AI 主策划';
    }
    if (keywords.includes('代码') || keywords.includes('技术')) {
      return 'AI 主程';
    }
    return null;
  }

  /**
   * 默认决策
   * @private
   */
  _defaultDecision(task, availableAgents) {
    // 高优先级任务由主策划处理
    if (task.priority === 'P0') {
      return 'AI 主策划';
    }
    return availableAgents[0] || 'AI 主策划';
  }

  /**
   * 获取当前权重配置
   */
  getWeights() {
    return this.optimizer.getWeights();
  }

  /**
   * 获取推荐策略
   */
  getRecommendedStrategy() {
    return this.optimizer.getRecommendedStrategy([
      'rule_based',
      'keyword_match',
      'fuzzy_match',
      'ml_predict'
    ]);
  }

  /**
   * 导出统计信息
   */
  getStats() {
    const stats = this.optimizer.history.getAllStats();
    return {
      totalDecisions: this.decisionCount,
      strategyStats: stats,
      currentWeights: this.getWeights(),
      recommendedStrategy: this.getRecommendedStrategy()
    };
  }

  /**
   * 重置优化器
   */
  reset() {
    this.optimizer.reset();
    this.decisionCount = 0;
  }
}

// 使用示例
if (require.main === module) {
  const matrix = new DecisionMatrix({ verbose: true });

  // 模拟任务
  const tasks = [
    { id: 1, title: '设计抽卡概率', priority: 'P0' },
    { id: 2, title: '编写抽卡代码', priority: 'P0' },
    { id: 3, title: '制作抽卡 UI', priority: 'P1' },
    { id: 4, title: '测试抽卡功能', priority: 'P1' },
    { id: 5, title: '分析用户数据', priority: 'P1' }
  ];

  const availableAgents = [
    'AI 主策划',
    'AI 数值策划',
    'AI 主程',
    'AI 客户端程序员',
    'AI 主美',
    'AI QA 主管',
    'AI 数据分析师'
  ];

  console.log('=== 开始决策测试 ===\n');

  tasks.forEach(task => {
    const agent = matrix.decide(task, availableAgents);
    console.log(`任务 ${task.id}: ${task.title} → ${agent}\n`);

    // 模拟执行结果（随机成功/失败）
    const success = Math.random() > 0.3; // 70% 成功率
    matrix.recordResult(
      { taskId: task.id, strategy: 'rule_based', agent: agent },
      success
    );
  });

  console.log('\n=== 统计信息 ===');
  console.log(JSON.stringify(matrix.getStats(), null, 2));
}

module.exports = DecisionMatrix;
