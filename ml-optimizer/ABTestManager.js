/**
 * A/B Testing Framework - Orchestra ML Optimizer
 * 
 * 提供 A/B 测试能力，用于对比不同策略/算法的效果
 * 支持实验创建、流量分配、结果记录、统计分析
 */

const fs = require('fs');
const path = require('path');

/**
 * 实验状态
 */
const ExperimentStatus = {
  DRAFT: 'draft',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  ARCHIVED: 'archived'
};

/**
 * A/B 测试管理器
 */
class ABTestManager {
  constructor(options = {}) {
    this.storagePath = options.storagePath || path.join(__dirname, 'experiments.json');
    this.experiments = this._load();
  }

  /**
   * 创建新实验
   */
  createExperiment(config) {
    const experiment = {
      id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: config.name,
      variants: config.variants.map(name => ({
        name,
        assignments: 0,
        successes: 0,
        failures: 0,
        totalLatency: 0
      })),
      status: ExperimentStatus.DRAFT,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      minSamples: config.minSamples || 100,
      maxDuration: config.maxDuration || 86400000,
      metric: config.metric || 'successRate',
      result: null
    };

    this.experiments.push(experiment);
    this._save();
    return { ...experiment };
  }

  /**
   * 启动实验
   */
  startExperiment(experimentId) {
    const exp = this._find(experimentId);
    if (!exp) throw new Error(`实验 ${experimentId} 不存在`);
    if (exp.status !== ExperimentStatus.DRAFT) {
      throw new Error(`实验状态不允许启动: ${exp.status}`);
    }
    exp.status = ExperimentStatus.RUNNING;
    exp.startedAt = Date.now();
    this._save();
    return { ...exp };
  }

  /**
   * 暂停实验
   */
  pauseExperiment(experimentId) {
    const exp = this._find(experimentId);
    if (!exp) throw new Error(`实验 ${experimentId} 不存在`);
    if (exp.status !== ExperimentStatus.RUNNING) throw new Error(`实验状态不允许暂停`);
    exp.status = ExperimentStatus.PAUSED;
    this._save();
  }

  /**
   * 恢复实验
   */
  resumeExperiment(experimentId) {
    const exp = this._find(experimentId);
    if (!exp) throw new Error(`实验 ${experimentId} 不存在`);
    if (exp.status !== ExperimentStatus.PAUSED) throw new Error(`实验状态不允许恢复`);
    exp.status = ExperimentStatus.RUNNING;
    this._save();
  }

  /**
   * 完成实验并生成分析结果
   */
  completeExperiment(experimentId) {
    const exp = this._find(experimentId);
    if (!exp) throw new Error(`实验 ${experimentId} 不存在`);
    exp.status = ExperimentStatus.COMPLETED;
    exp.completedAt = Date.now();
    exp.result = this._analyze(exp);
    this._save();
    return exp.result;
  }

  /**
   * 为请求分配变体（轮询分配）
   * @returns {string|null} 分配的变体名称
   */
  assignVariant(experimentId) {
    const exp = this._find(experimentId);
    if (!exp || exp.status !== ExperimentStatus.RUNNING) return null;

    // 选择分配次数最少的变体
    const minCount = Math.min(...exp.variants.map(v => v.assignments));
    const candidates = exp.variants.filter(v => v.assignments === minCount);
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    return chosen.name;
  }

  /**
   * 记录实验结果
   */
  recordResult(experimentId, variantName, result) {
    const exp = this._find(experimentId);
    if (!exp || exp.status !== ExperimentStatus.RUNNING) return null;

    const variant = exp.variants.find(v => v.name === variantName);
    if (!variant) throw new Error(`变体 ${variantName} 不存在`);

    if (result.success) variant.successes++;
    else variant.failures++;
    variant.totalLatency += (result.latency || 0);

    this._checkAutoComplete(exp);
    this._save();
  }

  /**
   * 获取实验列表
   */
  listExperiments(status) {
    if (status) return this.experiments.filter(e => e.status === status).map(e => ({ ...e }));
    return this.experiments.map(e => ({ ...e }));
  }

  /**
   * 获取实验详情
   */
  getExperiment(experimentId) {
    const exp = this._find(experimentId);
    return exp ? { ...exp } : null;
  }

  /**
   * 获取推荐变体
   */
  getRecommendedVariant() {
    const completed = this.experiments
      .filter(e => e.status === ExperimentStatus.COMPLETED && e.result && e.result.winner)
      .sort((a, b) => b.completedAt - a.completedAt);
    if (completed.length === 0) return null;
    const latest = completed[0];
    return {
      experimentId: latest.id,
      variantName: latest.result.winner.name,
      confidence: latest.result.winner.confidence,
      improvement: latest.result.winner.improvement,
      pValue: latest.result.pValue
    };
  }

  /**
   * 分析实验结果
   * @private
   */
  _analyze(exp) {
    const variantStats = exp.variants.map(v => ({
      name: v.name,
      assignments: v.assignments,
      successRate: v.assignments > 0 ? v.successes / v.assignments : 0,
      avgLatency: v.assignments > 0 ? v.totalLatency / v.assignments : 0,
      successes: v.successes,
      failures: v.failures
    }));

    const sorted = [...variantStats].sort((a, b) => b.successRate - a.successRate);
    let pValue = 1.0;
    let significant = false;
    let winner = null;

    if (sorted.length >= 2 && sorted[0].assignments >= 30 && sorted[1].assignments >= 30) {
      const test = this._zTest(sorted[0], sorted[1]);
      pValue = test.pValue;
      significant = test.significant;
      if (significant) {
        winner = {
          name: sorted[0].name,
          successRate: sorted[0].successRate,
          confidence: pValue < 0.01 ? 'high' : 'medium',
          improvement: ((sorted[0].successRate - sorted[1].successRate) * 100).toFixed(1) + '%'
        };
      }
    }

    return {
      variants: variantStats,
      winner,
      significant,
      pValue,
      totalSamples: variantStats.reduce((sum, v) => sum + v.assignments, 0),
      analyzedAt: Date.now()
    };
  }

  /**
   * 两比例 Z 检验
   * @private
   */
  _zTest(a, b) {
    const pPool = (a.successes + b.successes) / (a.assignments + b.assignments);
    if (pPool === 0 || pPool === 1) return { pValue: 1.0, significant: false };
    const se = Math.sqrt(pPool * (1 - pPool) * (1/a.assignments + 1/b.assignments));
    if (se === 0) return { pValue: 1.0, significant: false };
    const z = Math.abs(a.successRate - b.successRate) / se;
    const pValue = 2 * (1 - this._normalCDF(z));
    return { pValue, significant: pValue < 0.05 };
  }

  /**
   * 标准正态分布 CDF 近似
   * @private
   */
  _normalCDF(x) {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5*t + a4)*t) + a3)*t + a2)*t + a1)*t * Math.exp(-x*x);
    return 0.5 * (1.0 + sign * y);
  }

  /**
   * 自动检查完成条件
   * @private
   */
  _checkAutoComplete(exp) {
    const totalSamples = exp.variants.reduce((s, v) => s + v.assignments, 0);
    const elapsed = Date.now() - exp.startedAt;

    if (totalSamples >= exp.minSamples) {
      const analysis = this._analyze(exp);
      if (analysis.significant) {
        exp.status = ExperimentStatus.COMPLETED;
        exp.completedAt = Date.now();
        exp.result = analysis;
      }
    }
    if (elapsed >= exp.maxDuration) {
      exp.status = ExperimentStatus.COMPLETED;
      exp.completedAt = Date.now();
      exp.result = this._analyze(exp);
    }
  }

  _find(id) { return this.experiments.find(e => e.id === id); }

  _load() {
    try {
      if (fs.existsSync(this.storagePath)) {
        return JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
      }
    } catch (err) { console.warn('[ABTest] 加载失败:', err.message); }
    return [];
  }

  _save() {
    try {
      fs.writeFileSync(this.storagePath, JSON.stringify(this.experiments, null, 2), 'utf8');
    } catch (err) { console.warn('[ABTest] 保存失败:', err.message); }
  }
}

module.exports = { ABTestManager, ExperimentStatus };
