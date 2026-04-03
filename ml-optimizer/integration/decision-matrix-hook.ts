/**
 * Orchestra ML Optimizer - DecisionMatrix 集成
 * 
 * 将 ML 优化器集成到 DecisionMatrix 的决策流程中
 */

import { WeightOptimizer, Weights, ContextInfo } from '../algorithms/weight-optimizer';
import { FeedbackCollector } from '../feedback/collector';
import { ABTestManager } from '../ab-testing/experiment';
import { DecisionHistoryRepository } from '../storage/repository';
import { v4 as uuidv4 } from 'uuid';

// ============================================================
// 类型定义
// ============================================================

export interface ModelCandidate {
  modelId: string;
  scores: {
    contextOverlap: number;
    taskContinuity: number;
    efficiency: number;
  };
  metadata?: any;
}

export interface ModelSelection {
  modelId: string;
  finalScore: number;
  weights: Weights;
  decisionId: string;
}

export interface DecisionOutcome {
  success: boolean;
  satisfaction?: number;
  executionTime?: number;
  error?: string;
  timeout?: boolean;
}

export interface MLOptimizerConfig {
  enabled: boolean;
  learningRate?: number;
  minSamples?: number;
  abTestingEnabled?: boolean;
}

// ============================================================
// ML 优化决策器
// ============================================================

export class MLDecisionOptimizer {
  private repository: DecisionHistoryRepository;
  private weightOptimizer: WeightOptimizer;
  private feedbackCollector: FeedbackCollector;
  private abTestManager: ABTestManager;
  private config: Required<MLOptimizerConfig>;

  constructor(config: MLOptimizerConfig = {}) {
    this.config = {
      enabled: config.enabled !== false,
      learningRate: config.learningRate || 0.05,
      minSamples: config.minSamples || 50,
      abTestingEnabled: config.abTestingEnabled || false
    };

    // 初始化各组件
    this.repository = new DecisionHistoryRepository();
    this.weightOptimizer = new WeightOptimizer(this.repository, {
      learningRate: this.config.learningRate,
      minSamples: this.config.minSamples
    });
    this.feedbackCollector = new FeedbackCollector(this.repository);
    this.abTestManager = new ABTestManager(this.repository);
  }

  // ============================================================
  // 核心决策方法
  // ============================================================

  /**
   * 选择最优模型
   * 
   * @param candidates 候选模型列表
   * @param context 决策上下文
   * @returns 选中的模型
   */
  async selectModel(
    candidates: ModelCandidate[],
    context: ContextInfo
  ): Promise<ModelSelection> {
    // 如果 ML 优化未启用，使用默认权重
    if (!this.config.enabled) {
      return this.selectWithDefaultWeights(candidates);
    }

    // 1. 获取当前最优权重
    const weightResult = await this.weightOptimizer.getOptimalWeights(context);
    const weights = weightResult.weights;

    // 2. 检查是否有活跃的 A/B 测试
    let finalWeights = weights;
    if (this.config.abTestingEnabled) {
      const variantName = this.abTestManager.assignVariant(context);
      if (variantName) {
        const variantWeights = this.abTestManager.getVariantWeights(variantName);
        if (variantWeights) {
          finalWeights = variantWeights;
        }
      }
    }

    // 3. 计算每个候选的加权分数
    const scored = candidates.map(candidate => {
      const finalScore = this.calculateWeightedScore(candidate.scores, finalWeights);
      return {
        ...candidate,
        finalScore
      };
    });

    // 4. 选择最高分模型
    const selected = scored.reduce((best, current) =>
      current.finalScore > best.finalScore ? current : best
    );

    // 5. 创建决策记录
    const decisionId = uuidv4();
    const record = {
      id: decisionId,
      timestamp: Date.now(),
      messageSource: context.messageSource,
      timeOfDay: context.timeOfDay,
      dayOfWeek: context.dayOfWeek,
      activeTaskId: context.activeTaskId,
      userId: context.userId,
      scoreContextOverlap: selected.scores.contextOverlap,
      scoreTaskContinuity: selected.scores.taskContinuity,
      scoreEfficiency: selected.scores.efficiency,
      weightContextOverlap: finalWeights.contextOverlap,
      weightTaskContinuity: finalWeights.taskContinuity,
      weightEfficiency: finalWeights.efficiency,
      finalScore: selected.finalScore,
      selectedModel: selected.modelId,
      allCandidates: JSON.stringify(candidates.map(c => c.modelId))
    };

    // 6. 异步保存决策记录（不阻塞）
    setImmediate(() => {
      this.weightOptimizer.recordDecision(record).catch(console.error);
    });

    return {
      modelId: selected.modelId,
      finalScore: selected.finalScore,
      weights: finalWeights,
      decisionId
    };
  }

  /**
   * 记录决策结果
   * 
   * @param decisionId 决策 ID
   * @param outcome 执行结果
   */
  async recordOutcome(
    decisionId: string,
    outcome: DecisionOutcome
  ): Promise<void> {
    // 更新决策结果
    this.weightOptimizer.recordOutcome(decisionId, outcome);

    // 收集隐式反馈
    this.feedbackCollector.collectImplicit(decisionId, {
      success: outcome.success,
      executionTime: outcome.executionTime,
      timeout: outcome.timeout,
      error: outcome.error
    });

    // 如果是 A/B 测试，记录结果
    if (this.config.abTestingEnabled) {
      this.abTestManager.recordResult('control', {
        success: outcome.success,
        satisfaction: outcome.satisfaction,
        executionTime: outcome.executionTime,
        feedbackScore: this.normalizeOutcome(outcome)
      });
    }
  }

  /**
   * 收集用户反馈
   * 
   * @param decisionId 决策 ID
   * @param rating 用户评分 (1-5)
   * @param comment 备注
   */
  async collectFeedback(
    decisionId: string,
    rating: number,
    comment?: string
  ): Promise<void> {
    await this.feedbackCollector.collectExplicit(decisionId, rating, comment);
  }

  // ============================================================
  // A/B 测试管理
  // ============================================================

  /**
   * 创建 A/B 测试实验
   */
  createABTest(config: {
    name: string;
    description?: string;
    variants: Array<{
      name: string;
      weights: Weights;
      trafficPercent: number;
    }>;
    minSampleSize?: number;
  }) {
    return this.abTestManager.createExperiment(config);
  }

  /**
   * 启动 A/B 测试
   */
  startABTest(experimentId: string): void {
    this.abTestManager.startExperiment(experimentId);
  }

  /**
   * 分析 A/B 测试结果
   */
  analyzeABTest(experimentId: string) {
    return this.abTestManager.completeExperiment(experimentId);
  }

  // ============================================================
  // 统计与监控
  // ============================================================

  /**
   * 获取优化器统计信息
   */
  getStats() {
    return this.weightOptimizer.getStats();
  }

  /**
   * 获取当前权重
   */
  getCurrentWeights(): Weights {
    return this.weightOptimizer.getCurrentWeights();
  }

  /**
   * 获取模型表现统计
   */
  getModelPerformance() {
    return this.repository.getModelPerformance();
  }

  /**
   * 获取最近 24 小时统计
   */
  getLast24hStats() {
    return this.repository.getLast24hStats();
  }

  // ============================================================
  // 工具方法
  // ============================================================

  /**
   * 计算加权分数
   */
  private calculateWeightedScore(
    scores: {
      contextOverlap: number;
      taskContinuity: number;
      efficiency: number;
    },
    weights: Weights
  ): number {
    return (
      scores.contextOverlap * weights.contextOverlap +
      scores.taskContinuity * weights.taskContinuity +
      scores.efficiency * weights.efficiency
    );
  }

  /**
   * 使用默认权重选择模型（ML 优化未启用时）
   */
  private selectWithDefaultWeights(candidates: ModelCandidate[]): ModelSelection {
    const defaultWeights: Weights = {
      contextOverlap: 0.4,
      taskContinuity: 0.4,
      efficiency: 0.2
    };

    const scored = candidates.map(candidate => ({
      ...candidate,
      finalScore: this.calculateWeightedScore(candidate.scores, defaultWeights)
    }));

    const selected = scored.reduce((best, current) =>
      current.finalScore > best.finalScore ? current : best
    );

    return {
      modelId: selected.modelId,
      finalScore: selected.finalScore,
      weights: defaultWeights,
      decisionId: uuidv4()
    };
  }

  /**
   * 标准化执行结果为反馈分数
   */
  private normalizeOutcome(outcome: DecisionOutcome): number {
    if (!outcome.success) {
      return 0.1;
    }

    let score = 0.7;

    // 执行时间奖励
    if (outcome.executionTime) {
      if (outcome.executionTime < 100) score += 0.3;
      else if (outcome.executionTime < 500) score += 0.2;
      else if (outcome.executionTime < 1000) score += 0.1;
    }

    // 用户满意度
    if (outcome.satisfaction) {
      score = (score + (outcome.satisfaction - 1) / 4) / 2;
    }

    return Math.min(score, 1.0);
  }

  /**
   * 启用 ML 优化
   */
  enable(): void {
    this.config.enabled = true;
  }

  /**
   * 禁用 ML 优化
   */
  disable(): void {
    this.config.enabled = false;
  }

  /**
   * 重置为初始状态
   */
  reset(): void {
    this.weightOptimizer.resetToBase();
  }
}

export default MLDecisionOptimizer;
