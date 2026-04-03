/**
 * Orchestra ML Optimizer - A/B 测试框架
 * 
 * 支持多权重配置的对比实验，通过统计显著性检验确定最优配置
 */

import { v4 as uuidv4 } from 'uuid';
import { Weights } from './weight-optimizer';
import { DecisionHistoryRepository } from '../storage/repository';

// ============================================================
// 类型定义
// ============================================================

export interface ABTestVariant {
  name: string;              // 变体名称（如 "control", "variant-a"）
  weights: Weights;          // 权重配置
  trafficPercent: number;    // 流量分配（0-100）
  description?: string;      // 变体描述
}

export interface ABTestExperiment {
  id: string;
  name: string;
  description?: string;
  status: 'draft' | 'running' | 'completed' | 'paused';
  
  // 变体配置
  variants: ABTestVariant[];
  
  // 实验参数
  startDate?: number;
  endDate?: number;
  minSampleSize: number;     // 最小样本数
  confidenceLevel: number;   // 置信水平（如 0.95）
  
  // 结果指标（实验过程中填充）
  metrics?: VariantMetrics[];
}

export interface VariantMetrics {
  variant: string;
  sampleCount: number;
  successCount: number;
  successRate: number;
  avgSatisfaction: number;
  avgExecutionTime: number;
  totalFeedbackScore: number;
}

export interface AnalysisResult {
  experimentId: string;
  completed: boolean;
  recommendations: VariantRecommendation[];
  statisticalSignificance: boolean;
  winner?: string;
}

export interface VariantRecommendation {
  variant: string;
  improvement: number;       // 相对对照组的改进百分比
  significant: boolean;      // 是否统计显著
  pValue: number;
  confidenceInterval: [number, number];
  recommendation: 'adopt' | 'reject' | 'inconclusive';
}

// ============================================================
// A/B 测试管理器
// ============================================================

export class ABTestManager {
  private repository: DecisionHistoryRepository;
  private experiments: Map<string, ABTestExperiment> = new Map();
  private activeExperimentId?: string;

  constructor(repository: DecisionHistoryRepository) {
    this.repository = repository;
  }

  // ============================================================
  // 实验管理
  // ============================================================

  /**
   * 创建新实验
   */
  createExperiment(config: {
    name: string;
    description?: string;
    variants: ABTestVariant[];
    minSampleSize?: number;
    confidenceLevel?: number;
  }): ABTestExperiment {
    // 验证流量分配总和为 100
    const totalTraffic = config.variants.reduce(
      (sum, v) => sum + v.trafficPercent,
      0
    );
    if (Math.abs(totalTraffic - 100) > 0.01) {
      throw new Error(
        `Traffic allocation must sum to 100%, got ${totalTraffic}%`
      );
    }

    const experiment: ABTestExperiment = {
      id: uuidv4(),
      name: config.name,
      description: config.description,
      status: 'draft',
      variants: config.variants,
      minSampleSize: config.minSampleSize || 100,
      confidenceLevel: config.confidenceLevel || 0.95,
      metrics: config.variants.map(v => ({
        variant: v.name,
        sampleCount: 0,
        successCount: 0,
        successRate: 0,
        avgSatisfaction: 0,
        avgExecutionTime: 0,
        totalFeedbackScore: 0
      }))
    };

    this.experiments.set(experiment.id, experiment);
    return experiment;
  }

  /**
   * 启动实验
   */
  startExperiment(experimentId: string): void {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    if (experiment.status !== 'draft') {
      throw new Error(
        `Cannot start experiment in ${experiment.status} state`
      );
    }

    experiment.status = 'running';
    experiment.startDate = Date.now();
    this.activeExperimentId = experimentId;
  }

  /**
   * 暂停实验
   */
  pauseExperiment(experimentId: string): void {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    experiment.status = 'paused';
    if (this.activeExperimentId === experimentId) {
      this.activeExperimentId = undefined;
    }
  }

  /**
   * 完成实验
   */
  completeExperiment(experimentId: string): AnalysisResult {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    experiment.status = 'completed';
    experiment.endDate = Date.now();

    // 分析结果
    const result = this.analyzeExperiment(experiment);
    
    if (this.activeExperimentId === experimentId) {
      this.activeExperimentId = undefined;
    }

    return result;
  }

  /**
   * 获取活跃实验
   */
  getActiveExperiment(): ABTestExperiment | undefined {
    if (!this.activeExperimentId) {
      return undefined;
    }
    return this.experiments.get(this.activeExperimentId);
  }

  /**
   * 获取所有实验
   */
  getAllExperiments(): ABTestExperiment[] {
    return Array.from(this.experiments.values());
  }

  // ============================================================
  // 流量分配
  // ============================================================

  /**
   * 为当前请求分配实验变体
   * 
   * 使用一致性哈希确保同一用户始终分配到同一变体
   */
  assignVariant(context: {
    userId?: string;
    sessionId?: string;
  }): string | undefined {
    if (!this.activeExperimentId) {
      return undefined;
    }

    const experiment = this.experiments.get(this.activeExperimentId);
    if (!experiment || experiment.status !== 'running') {
      return undefined;
    }

    // 计算哈希桶 (0-99)
    const hash = this.hashContext(context);
    const bucket = hash % 100;

    // 按流量分配确定变体
    let cumulative = 0;
    for (const variant of experiment.variants) {
      cumulative += variant.trafficPercent;
      if (bucket < cumulative) {
        return variant.name;
      }
    }

    // 默认返回对照组
    return experiment.variants.find(v => v.name === 'control')?.name || 
           experiment.variants[0].name;
  }

  /**
   * 获取指定变体的权重配置
   */
  getVariantWeights(variantName: string): Weights | undefined {
    if (!this.activeExperimentId) {
      return undefined;
    }

    const experiment = this.experiments.get(this.activeExperimentId);
    if (!experiment) {
      return undefined;
    }

    const variant = experiment.variants.find(v => v.name === variantName);
    return variant?.weights;
  }

  // ============================================================
  // 数据收集
  // ============================================================

  /**
   * 记录实验结果
   */
  recordResult(
    variantName: string,
    outcome: {
      success: boolean;
      satisfaction?: number;
      executionTime?: number;
      feedbackScore?: number;
    }
  ): void {
    if (!this.activeExperimentId) {
      return;
    }

    const experiment = this.experiments.get(this.activeExperimentId);
    if (!experiment || !experiment.metrics) {
      return;
    }

    const metrics = experiment.metrics.find(m => m.variant === variantName);
    if (!metrics) {
      return;
    }

    // 更新指标
    metrics.sampleCount++;
    if (outcome.success) {
      metrics.successCount++;
    }
    metrics.successRate = metrics.successCount / metrics.sampleCount;

    // 更新平均值（增量计算）
    if (outcome.satisfaction !== undefined) {
      metrics.avgSatisfaction =
        (metrics.avgSatisfaction * (metrics.sampleCount - 1) +
          outcome.satisfaction) /
        metrics.sampleCount;
    }

    if (outcome.executionTime !== undefined) {
      metrics.avgExecutionTime =
        (metrics.avgExecutionTime * (metrics.sampleCount - 1) +
          outcome.executionTime) /
        metrics.sampleCount;
    }

    if (outcome.feedbackScore !== undefined) {
      metrics.totalFeedbackScore += outcome.feedbackScore;
    }
  }

  // ============================================================
  // 结果分析
  // ============================================================

  /**
   * 分析实验结果
   */
  analyzeExperiment(
    experiment: ABTestExperiment
  ): AnalysisResult {
    if (!experiment.metrics || experiment.metrics.length < 2) {
      throw new Error('Not enough variants to analyze');
    }

    const control = experiment.metrics.find(m => m.variant === 'control');
    const variants = experiment.metrics.filter(m => m.variant !== 'control');

    if (!control) {
      throw new Error('Control variant not found');
    }

    // 分析每个变体
    const recommendations = variants.map(variant => {
      const zScore = this.calculateZScore(control, variant);
      const pValue = this.zToPValue(zScore);
      const significant = pValue < (1 - experiment.confidenceLevel);

      const improvement =
        (variant.successRate - control.successRate) / control.successRate;

      const confidenceInterval = this.calculateConfidenceInterval(
        control,
        variant,
        experiment.confidenceLevel
      );

      let recommendation: 'adopt' | 'reject' | 'inconclusive' = 'inconclusive';
      if (significant && variant.successRate > control.successRate) {
        recommendation = 'adopt';
      } else if (significant && variant.successRate < control.successRate) {
        recommendation = 'reject';
      }

      return {
        variant: variant.variant,
        improvement,
        significant,
        pValue,
        confidenceInterval,
        recommendation
      };
    });

    // 确定获胜者
    const winner = recommendations.find(
      r => r.recommendation === 'adopt'
    )?.variant;

    // 检查是否完成（达到最小样本数）
    const totalSamples = experiment.metrics.reduce(
      (sum, m) => sum + m.sampleCount,
      0
    );
    const completed = totalSamples >= experiment.minSampleSize;

    return {
      experimentId: experiment.id,
      completed,
      recommendations,
      statisticalSignificance: recommendations.some(r => r.significant),
      winner
    };
  }

  /**
   * 检查是否应该停止实验
   */
  shouldStopExperiment(): {
    shouldStop: boolean;
    reason?: 'winner' | 'sample_size' | 'futility';
  } {
    if (!this.activeExperimentId) {
      return { shouldStop: false };
    }

    const experiment = this.experiments.get(this.activeExperimentId);
    if (!experiment || !experiment.metrics) {
      return { shouldStop: false };
    }

    // 检查是否达到最小样本数
    const totalSamples = experiment.metrics.reduce(
      (sum, m) => sum + m.sampleCount,
      0
    );
    if (totalSamples >= experiment.minSampleSize) {
      return { shouldStop: true, reason: 'sample_size' };
    }

    // 检查是否有明显获胜者（提前停止）
    if (totalSamples >= experiment.minSampleSize * 0.5) {
      const analysis = this.analyzeExperiment(experiment);
      if (analysis.winner && analysis.statisticalSignificance) {
        return { shouldStop: true, reason: 'winner' };
      }
    }

    return { shouldStop: false };
  }

  // ============================================================
  // 统计方法
  // ============================================================

  /**
   * 计算 Z 分数（两比例检验）
   */
  private calculateZScore(
    control: VariantMetrics,
    variant: VariantMetrics
  ): number {
    const p1 = control.successRate;
    const n1 = control.sampleCount;
    const p2 = variant.successRate;
    const n2 = variant.sampleCount;

    // 合并比例
    const pPool =
      (control.successCount + variant.successCount) /
      (control.sampleCount + variant.sampleCount);

    // 标准误
    const se = Math.sqrt(
      pPool * (1 - pPool) * (1 / n1 + 1 / n2)
    );

    if (se === 0) {
      return 0;
    }

    // Z 分数
    return (p2 - p1) / se;
  }

  /**
   * Z 分数转 P 值（双尾检验）
   */
  private zToPValue(zScore: number): number {
    // 使用标准正态分布近似
    const absZ = Math.abs(zScore);
    
    // 近似公式（Abramowitz and Stegun approximation）
    const t = 1 / (1 + 0.2316419 * absZ);
    const d = 0.3989423 * Math.exp(-absZ * absZ / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));

    // 双尾检验
    return 2 * p;
  }

  /**
   * 计算置信区间
   */
  private calculateConfidenceInterval(
    control: VariantMetrics,
    variant: VariantMetrics,
    confidenceLevel: number
  ): [number, number] {
    const diff = variant.successRate - control.successRate;
    
    // 标准误
    const se = Math.sqrt(
      (control.successRate * (1 - control.successRate)) / control.sampleCount +
      (variant.successRate * (1 - variant.successRate)) / variant.sampleCount
    );

    // Z 临界值（95% 置信度约为 1.96）
    const zCritical = confidenceLevel === 0.95 ? 1.96 : 1.645;

    const margin = zCritical * se;
    return [diff - margin, diff + margin];
  }

  /**
   * 一致性哈希
   */
  private hashContext(context: {
    userId?: string;
    sessionId?: string;
  }): number {
    const seed = context.userId || context.sessionId || Date.now().toString();
    
    // 简单哈希函数
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // 转为 32 位整数
    }
    
    return Math.abs(hash);
  }
}

export default ABTestManager;
