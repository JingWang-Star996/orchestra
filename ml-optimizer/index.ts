/**
 * Orchestra ML Optimizer
 * 
 * 机器学习驱动的 DecisionMatrix 权重优化模块
 * 
 * @module @orchestra/ml-optimizer
 */

// 核心算法
export {
  WeightOptimizer,
  Weights,
  ContextInfo,
  MLOptimizerConfig,
  OptimizationResult
} from './algorithms/weight-optimizer';

// 存储层
export {
  DecisionHistoryRepository,
  DecisionRecord,
  WeightSnapshot,
  ABExperiment,
  DecisionStats,
  ModelPerformance
} from './storage/repository';

// A/B 测试
export {
  ABTestManager,
  ABTestExperiment,
  ABTestVariant,
  VariantMetrics,
  AnalysisResult,
  VariantRecommendation
} from './ab-testing/experiment';

// 反馈收集
export {
  FeedbackCollector,
  FeedbackAggregator,
  FeedbackData,
  AggregatedFeedback
} from './feedback/collector';

// DecisionMatrix 集成
export {
  MLDecisionOptimizer,
  ModelCandidate,
  ModelSelection,
  DecisionOutcome,
  MLOptimizerConfig as MLDecisionOptimizerConfig
} from './integration/decision-matrix-hook';

// ============================================================
// 快捷创建函数
// ============================================================

import { DecisionHistoryRepository } from './storage/repository';
import { WeightOptimizer } from './algorithms/weight-optimizer';
import { FeedbackCollector } from './feedback/collector';
import { ABTestManager } from './ab-testing/experiment';
import { MLDecisionOptimizer } from './integration/decision-matrix-hook';

/**
 * 创建 ML 优化器实例
 * 
 * @param dbPath 数据库路径（可选）
 * @returns 优化器实例
 */
export function createMLOptimizer(dbPath?: string) {
  const repository = new DecisionHistoryRepository(dbPath);
  return new WeightOptimizer(repository);
}

/**
 * 创建完整的决策优化器（包含所有组件）
 * 
 * @param config 配置选项
 * @returns 决策优化器实例
 */
export function createDecisionOptimizer(config?: {
  enabled?: boolean;
  learningRate?: number;
  minSamples?: number;
  abTestingEnabled?: boolean;
}) {
  return new MLDecisionOptimizer(config);
}

// ============================================================
// 默认导出
// ============================================================

export default MLDecisionOptimizer;
