/**
 * WeightOptimizer - 基于成功率的权重调整算法
 * 简单统计方法，无需复杂 ML
 */

const DecisionHistory = require('./DecisionHistory');

class WeightOptimizer {
  constructor(options = {}) {
    this.history = options.history || new DecisionHistory(options);
    this.baseWeights = options.baseWeights || {}; // 基础权重
    this.currentWeights = { ...this.baseWeights };
    this.minWeight = options.minWeight || 0.1; // 最小权重
    this.maxWeight = options.maxWeight || 10.0; // 最大权重
    this.adjustmentFactor = options.adjustmentFactor || 0.1; // 调整系数
  }

  /**
   * 根据历史记录更新权重
   * 成功率高的策略增加权重，成功率低的降低权重
   * @returns {Object} 更新后的权重
   */
  updateWeights() {
    const stats = this.history.getAllStats();

    stats.forEach(stat => {
      const strategy = stat.strategy;
      const currentWeight = this.currentWeights[strategy] || 1.0;
      
      if (stat.total === 0) {
        // 没有数据，保持基础权重
        this.currentWeights[strategy] = this.baseWeights[strategy] || 1.0;
        return;
      }

      // 计算调整量：成功率越高，调整越积极
      const targetWeight = stat.successRate * 2; // 成功率映射到 0-2 范围
      const adjustment = (targetWeight - currentWeight) * this.adjustmentFactor;
      
      let newWeight = currentWeight + adjustment;
      
      // 限制权重范围
      newWeight = Math.max(this.minWeight, Math.min(this.maxWeight, newWeight));
      
      this.currentWeights[strategy] = newWeight;
    });

    return { ...this.currentWeights };
  }

  /**
   * 获取当前权重
   * @returns {Object} 当前权重
   */
  getWeights() {
    return { ...this.currentWeights };
  }

  /**
   * 获取推荐策略（权重最高的）
   * @param {Array<string>} availableStrategies - 可用策略列表
   * @returns {string} 推荐策略名称
   */
  getRecommendedStrategy(availableStrategies) {
    if (!availableStrategies || availableStrategies.length === 0) {
      return null;
    }

    let bestStrategy = availableStrategies[0];
    let bestWeight = this.currentWeights[bestStrategy] || 1.0;

    availableStrategies.forEach(strategy => {
      const weight = this.currentWeights[strategy] || 1.0;
      if (weight > bestWeight) {
        bestWeight = weight;
        bestStrategy = strategy;
      }
    });

    return bestStrategy;
  }

  /**
   * 根据权重随机选择策略（权重越高，被选中的概率越大）
   * @param {Array<string>} availableStrategies - 可用策略列表
   * @returns {string} 选中的策略名称
   */
  selectStrategyWeighted(availableStrategies) {
    if (!availableStrategies || availableStrategies.length === 0) {
      return null;
    }

    if (availableStrategies.length === 1) {
      return availableStrategies[0];
    }

    // 计算总权重
    const weights = availableStrategies.map(s => this.currentWeights[s] || 1.0);
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    // 随机选择一个权重位置
    let random = Math.random() * totalWeight;
    
    for (let i = 0; i < availableStrategies.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return availableStrategies[i];
      }
    }

    return availableStrategies[availableStrategies.length - 1];
  }

  /**
   * 记录决策结果并自动更新权重
   * @param {Object} record - 决策记录
   */
  recordAndOptimize(record) {
    this.history.record(record);
    return this.updateWeights();
  }

  /**
   * 重置权重为基础权重
   */
  reset() {
    this.currentWeights = { ...this.baseWeights };
  }

  /**
   * 设置基础权重
   * @param {Object} weights - 基础权重对象
   */
  setBaseWeights(weights) {
    this.baseWeights = { ...weights };
    this.currentWeights = { ...this.baseWeights };
  }
}

module.exports = WeightOptimizer;
