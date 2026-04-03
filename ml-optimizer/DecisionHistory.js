/**
 * DecisionHistory - 简单的决策历史记录器
 * 记录决策结果，用于后续的权重优化
 */

const fs = require('fs');
const path = require('path');

class DecisionHistory {
  constructor(options = {}) {
    this.storagePath = options.storagePath || path.join(__dirname, 'history.json');
    this.maxHistory = options.maxHistory || 1000; // 最多保留 1000 条记录
    this.history = this._load();
  }

  /**
   * 记录一次决策结果
   * @param {Object} record - 决策记录
   * @param {string} record.decisionId - 决策 ID
   * @param {string} record.strategy - 使用的策略名称
   * @param {number} record.timestamp - 时间戳
   * @param {boolean} record.success - 是否成功
   * @param {Object} record.metadata - 额外元数据
   */
  record(record) {
    const entry = {
      decisionId: record.decisionId,
      strategy: record.strategy,
      timestamp: record.timestamp || Date.now(),
      success: record.success,
      metadata: record.metadata || {}
    };

    this.history.push(entry);

    // 限制历史记录大小
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }

    this._save();
    return entry;
  }

  /**
   * 获取指定策略的统计数据
   * @param {string} strategy - 策略名称
   * @returns {Object} 统计数据
   */
  getStrategyStats(strategy) {
    const records = this.history.filter(r => r.strategy === strategy);
    const total = records.length;
    const success = records.filter(r => r.success).length;
    const failure = total - success;
    const successRate = total > 0 ? success / total : 0;

    return {
      strategy,
      total,
      success,
      failure,
      successRate,
      records
    };
  }

  /**
   * 获取所有策略的统计数据
   * @returns {Array<Object>} 所有策略的统计
   */
  getAllStats() {
    const strategyMap = {};

    this.history.forEach(record => {
      if (!strategyMap[record.strategy]) {
        strategyMap[record.strategy] = {
          strategy: record.strategy,
          total: 0,
          success: 0,
          failure: 0
        };
      }

      const stats = strategyMap[record.strategy];
      stats.total++;
      if (record.success) {
        stats.success++;
      } else {
        stats.failure++;
      }
    });

    return Object.values(strategyMap).map(stats => ({
      ...stats,
      successRate: stats.total > 0 ? stats.success / stats.total : 0
    }));
  }

  /**
   * 获取最近的决策记录
   * @param {number} limit - 返回数量限制
   * @returns {Array<Object>} 决策记录列表
   */
  getRecent(limit = 100) {
    return this.history.slice(-limit);
  }

  /**
   * 清空历史记录
   */
  clear() {
    this.history = [];
    this._save();
  }

  /**
   * 加载历史记录
   * @private
   */
  _load() {
    try {
      if (fs.existsSync(this.storagePath)) {
        const data = fs.readFileSync(this.storagePath, 'utf8');
        return JSON.parse(data);
      }
    } catch (err) {
      console.warn('Failed to load history:', err.message);
    }
    return [];
  }

  /**
   * 保存历史记录
   * @private
   */
  _save() {
    try {
      fs.writeFileSync(this.storagePath, JSON.stringify(this.history, null, 2), 'utf8');
    } catch (err) {
      console.warn('Failed to save history:', err.message);
    }
  }
}

module.exports = DecisionHistory;
