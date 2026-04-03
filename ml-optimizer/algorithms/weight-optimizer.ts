/**
 * Orchestra ML Optimizer - 权重优化算法
 * 
 * 基于历史决策数据，自动优化 DecisionMatrix 的权重配置
 * 
 * 算法特点：
 * - 简单透明：基于成功/失败对比的增量调整
 * - 渐进收敛：小步调整，避免剧烈波动
 * - 边界保护：权重限制在合理范围内
 * - 冷启动友好：样本不足时使用保守的基础权重
 */

import { DecisionHistoryRepository, DecisionRecord } from '../storage/repository';

// ============================================================
// 类型定义
// ============================================================

export interface Weights {
  contextOverlap: number;
  taskContinuity: number;
  efficiency: number;
}

export interface ContextInfo {
  activeTaskId?: string;
  messageSource: string;
  timeOfDay: number;
  dayOfWeek: number;
  userId?: string;
}

export interface MLOptimizerConfig {
  // 基础权重（冷启动使用）
  baseWeights?: Weights;
  
  // 学习参数
  learningRate?: number;      // 学习率：每次调整的幅度 (默认 0.05)
  minWeight?: number;         // 最小权重 (默认 0.1)
  maxWeight?: number;         // 最大权重 (默认 0.7)
  minSamples?: number;        // 最小样本数 (默认 50)
  windowSize?: number;        // 滑动窗口大小 (默认 200)
  
  // 上下文感知
  enableContextAdjustment?: boolean;  // 是否启用上下文相关调整
}

export interface OptimizationResult {
  weights: Weights;
  source: 'base' | 'optimized' | 'context_adjusted';
  sampleCount: number;
  confidence: number;
  lastUpdated?: number;
}

// ============================================================
// 权重优化器主类
// ============================================================

export class WeightOptimizer {
  private repository: DecisionHistoryRepository;
  private config: Required<MLOptimizerConfig>;
  
  // 当前优化后的权重
  private currentWeights: Weights;
  private lastOptimizationTime?: number;
  private optimizationCount: number = 0;

  constructor(
    repository: DecisionHistoryRepository,
    config: MLOptimizerConfig = {}
  ) {
    this.repository = repository;
    this.config = {
      baseWeights: config.baseWeights || {
        contextOverlap: 0.4,
        taskContinuity: 0.4,
        efficiency: 0.2
      },
      learningRate: config.learningRate || 0.05,
      minWeight: config.minWeight || 0.1,
      maxWeight: config.maxWeight || 0.7,
      minSamples: config.minSamples || 50,
      windowSize: config.windowSize || 200,
      enableContextAdjustment: config.enableContextAdjustment || false
    };

    // 初始化为基准权重
    this.currentWeights = { ...this.config.baseWeights };
  }

  // ============================================================
  // 核心方法：获取最优权重
  // ============================================================

  /**
   * 获取当前最优权重
   * 
   * @param context 当前上下文（可选，用于上下文感知调整）
   * @returns 优化后的权重配置
   */
  async getOptimalWeights(context?: ContextInfo): Promise<OptimizationResult> {
    const sampleCount = this.repository.getSampleCount();
    
    // 冷启动：样本不足时使用基础权重
    if (sampleCount < this.config.minSamples) {
      return {
        weights: { ...this.config.baseWeights },
        source: 'base',
        sampleCount,
        confidence: this.calculateConfidence(sampleCount)
      };
    }

    // 基于历史数据计算优化权重
    const optimized = await this.calculateOptimalWeights();
    
    // 可选：应用上下文相关的调整
    if (this.config.enableContextAdjustment && context) {
      const adjusted = this.applyContextAdjustments(optimized, context);
      return {
        weights: adjusted,
        source: 'context_adjusted',
        sampleCount,
        confidence: this.calculateConfidence(sampleCount),
        lastUpdated: this.lastOptimizationTime
      };
    }

    return {
      weights: optimized,
      source: 'optimized',
      sampleCount,
      confidence: this.calculateConfidence(sampleCount),
      lastUpdated: this.lastOptimizationTime
    };
  }

  /**
   * 基于滑动窗口计算最优权重
   * 
   * 算法思路：
   * 1. 获取最近 N 次决策记录
   * 2. 分为成功组和失败组
   * 3. 计算两组权重的差异
   * 4. 向成功组权重方向调整
   */
  private async calculateOptimalWeights(): Promise<Weights> {
    const records = this.repository.getRecentRecordsWithOutcome(this.config.windowSize);
    
    if (records.length < this.config.minSamples) {
      return { ...this.config.baseWeights };
    }

    // 分组：成功 vs 失败
    const successful = records.filter(r => r.outcomeSuccess === true);
    const failed = records.filter(r => r.outcomeSuccess === false);

    // 边界检查
    if (successful.length < 10 || failed.length < 10) {
      return { ...this.config.baseWeights };
    }

    // 计算成功决策的平均权重
    const avgSuccessWeights = this.averageWeights(
      successful.map(r => ({
        contextOverlap: r.weightContextOverlap,
        taskContinuity: r.weightTaskContinuity,
        efficiency: r.weightEfficiency
      }))
    );

    // 计算失败决策的平均权重
    const avgFailedWeights = this.averageWeights(
      failed.map(r => ({
        contextOverlap: r.weightContextOverlap,
        taskContinuity: r.weightTaskContinuity,
        efficiency: r.weightEfficiency
      }))
    );

    // 计算调整方向：成功的权重应该增加，失败的应该减少
    const adjustments: Weights = {
      contextOverlap: this.calculateAdjustment(
        avgSuccessWeights.contextOverlap,
        avgFailedWeights.contextOverlap
      ),
      taskContinuity: this.calculateAdjustment(
        avgSuccessWeights.taskContinuity,
        avgFailedWeights.taskContinuity
      ),
      efficiency: this.calculateAdjustment(
        avgSuccessWeights.efficiency,
        avgFailedWeights.efficiency
      )
    };

    // 归一化权重（确保总和为 1）
    const normalized = this.normalizeWeights(adjustments);
    
    // 更新内部状态
    this.currentWeights = normalized;
    this.lastOptimizationTime = Date.now();
    this.optimizationCount++;

    return normalized;
  }

  /**
   * 计算单个因子的调整量
   * 
   * 使用学习率控制调整幅度，避免剧烈变化
   */
  private calculateAdjustment(successAvg: number, failedAvg: number): number {
    const diff = successAvg - failedAvg;
    
    // 如果差异很小，说明该因子对结果影响不大，保持当前值
    if (Math.abs(diff) < 0.01) {
      return this.currentWeights.contextOverlap; // 返回当前值
    }

    // 使用学习率控制调整幅度
    const adjustment = diff * this.config.learningRate;
    
    // 在当前值基础上调整
    return this.currentWeights.contextOverlap + adjustment;
  }

  /**
   * 归一化权重（总和为 1，且在合理范围内）
   */
  private normalizeWeights(weights: Weights): Weights {
    // 应用边界限制
    const clamped: Weights = {
      contextOverlap: this.clamp(weights.contextOverlap, this.config.minWeight, this.config.maxWeight),
      taskContinuity: this.clamp(weights.taskContinuity, this.config.minWeight, this.config.maxWeight),
      efficiency: this.clamp(weights.efficiency, this.config.minWeight, this.config.maxWeight)
    };

    // 归一化使总和为 1
    const sum = clamped.contextOverlap + clamped.taskContinuity + clamped.efficiency;
    return {
      contextOverlap: clamped.contextOverlap / sum,
      taskContinuity: clamped.taskContinuity / sum,
      efficiency: clamped.efficiency / sum
    };
  }

  /**
   * 应用上下文相关的权重调整
   * 
   * 例如：
   * - 早晨时段：提高效率权重
   * - 有活跃任务时：提高任务连续性权重
   * - 新会话：提高上下文重叠权重
   */
  private applyContextAdjustments(baseWeights: Weights, context: ContextInfo): Weights {
    const adjusted = { ...baseWeights };

    // 时间段调整
    const hour = context.timeOfDay;
    if (hour >= 9 && hour <= 11) {
      // 上午工作时间：稍微提高效率权重
      adjusted.efficiency = Math.min(adjusted.efficiency + 0.05, this.config.maxWeight);
      adjusted.contextOverlap = Math.max(adjusted.contextOverlap - 0.03, this.config.minWeight);
    } else if (hour >= 14 && hour <= 16) {
      // 下午工作时间：提高任务连续性权重
      adjusted.taskContinuity = Math.min(adjusted.taskContinuity + 0.05, this.config.maxWeight);
      adjusted.efficiency = Math.max(adjusted.efficiency - 0.03, this.config.minWeight);
    }

    // 有活跃任务时：提高任务连续性权重
    if (context.activeTaskId) {
      adjusted.taskContinuity = Math.min(adjusted.taskContinuity + 0.1, this.config.maxWeight);
      const reduction = 0.05;
      adjusted.contextOverlap = Math.max(adjusted.contextOverlap - reduction, this.config.minWeight);
      adjusted.efficiency = Math.max(adjusted.efficiency - reduction, this.config.minWeight);
    }

    // 重新归一化
    return this.normalizeWeights(adjusted);
  }

  // ============================================================
  // 记录决策结果
  // ============================================================

  /**
   * 记录决策结果并触发权重更新
   * 
   * @param record 决策记录
   */
  async recordDecision(record: DecisionRecord): Promise<void> {
    // 保存到存储
    this.repository.saveDecision(record);

    // 每 N 次决策后重新计算权重（异步，不阻塞）
    const sampleCount = this.repository.getSampleCount();
    if (sampleCount % 10 === 0) {
      // 异步触发权重更新
      setImmediate(() => {
        this.calculateOptimalWeights().catch(console.error);
      });
    }
  }

  /**
   * 更新决策结果（决策执行后调用）
   */
  async recordOutcome(
    decisionId: string,
    outcome: {
      success: boolean;
      satisfaction?: number;
      executionTime?: number;
      error?: string;
    }
  ): Promise<void> {
    this.repository.updateOutcome(decisionId, outcome);

    // 异步触发权重更新
    setImmediate(() => {
      this.calculateOptimalWeights().catch(console.error);
    });
  }

  /**
   * 添加反馈
   */
  async recordFeedback(
    decisionId: string,
    feedback: {
      type: 'explicit' | 'implicit';
      source: 'user_rating' | 'completion' | 'timeout' | 'error';
      value: number;
      comment?: string;
    }
  ): Promise<void> {
    this.repository.addFeedback(decisionId, feedback);
  }

  // ============================================================
  // 统计与监控
  // ============================================================

  /**
   * 获取当前权重
   */
  getCurrentWeights(): Weights {
    return { ...this.currentWeights };
  }

  /**
   * 获取优化统计信息
   */
  getStats() {
    const stats = this.repository.getLast24hStats();
    return {
      currentWeights: this.currentWeights,
      baseWeights: this.config.baseWeights,
      sampleCount: this.repository.getSampleCount(),
      optimizationCount: this.optimizationCount,
      lastOptimizationTime: this.lastOptimizationTime,
      last24hStats: stats,
      modelPerformance: this.repository.getModelPerformance()
    };
  }

  /**
   * 获取权重变化历史
   */
  getWeightHistory(days: number = 7): any[] {
    return this.repository.getSuccessRateTrend(days);
  }

  // ============================================================
  // 工具方法
  // ============================================================

  /**
   * 计算权重平均值
   */
  private averageWeights(weightsList: Weights[]): Weights {
    if (weightsList.length === 0) {
      return { ...this.config.baseWeights };
    }

    const sum = weightsList.reduce(
      (acc, w) => ({
        contextOverlap: acc.contextOverlap + w.contextOverlap,
        taskContinuity: acc.taskContinuity + w.taskContinuity,
        efficiency: acc.efficiency + w.efficiency
      }),
      { contextOverlap: 0, taskContinuity: 0, efficiency: 0 }
    );

    const count = weightsList.length;
    return {
      contextOverlap: sum.contextOverlap / count,
      taskContinuity: sum.taskContinuity / count,
      efficiency: sum.efficiency / count
    };
  }

  /**
   * 限制值在指定范围内
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * 计算置信度（基于样本数量）
   * 
   * 样本越多，置信度越高
   */
  private calculateConfidence(sampleCount: number): number {
    if (sampleCount < this.config.minSamples) {
      return sampleCount / this.config.minSamples;
    }
    
    // 超过最小样本数后，置信度缓慢增长，上限 0.95
    const extra = sampleCount - this.config.minSamples;
    const maxExtra = 500; // 500 个额外样本后接近最大置信度
    
    return 0.5 + 0.45 * Math.min(extra / maxExtra, 1);
  }

  /**
   * 重置为基准权重（用于调试或 A/B 测试）
   */
  resetToBase(): void {
    this.currentWeights = { ...this.config.baseWeights };
    this.optimizationCount = 0;
    this.lastOptimizationTime = undefined;
  }
}

export default WeightOptimizer;
