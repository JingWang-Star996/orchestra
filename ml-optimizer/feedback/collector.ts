/**
 * Orchestra ML Optimizer - 反馈收集机制
 * 
 * 收集显式和隐式反馈，标准化后用于权重优化
 */

import { DecisionHistoryRepository } from '../storage/repository';

// ============================================================
// 类型定义
// ============================================================

export interface FeedbackData {
  decisionId: string;
  type: 'explicit' | 'implicit';
  source: 'user_rating' | 'completion' | 'timeout' | 'error';
  value: number;           // 标准化评分 (0-1)
  comment?: string;
  timestamp: number;
}

export interface FeedbackWeight {
  type: 'explicit' | 'implicit';
  source: string;
  weight: number;          // 0-1，表示该反馈源的可信度
}

export interface AggregatedFeedback {
  decisionId: string;
  score: number;           // 综合评分 (0-1)
  feedbackCount: number;
  breakdown: {
    explicit?: number;
    implicit?: number;
  };
}

// ============================================================
// 反馈收集器
// ============================================================

export class FeedbackCollector {
  private repository: DecisionHistoryRepository;
  
  // 反馈权重配置
  private feedbackWeights: Record<string, number> = {
    'explicit:user_rating': 1.0,   // 用户直接评分：最高权重
    'implicit:completion': 0.7,    // 任务完成：中等权重
    'implicit:timeout': 0.3,       // 超时：较低权重
    'implicit:error': 0.1          // 错误：最低权重
  };

  constructor(repository: DecisionHistoryRepository) {
    this.repository = repository;
  }

  // ============================================================
  // 显式反馈收集
  // ============================================================

  /**
   * 收集显式反馈（用户评分）
   * 
   * @param decisionId 决策 ID
   * @param rating 用户评分 (1-5)
   * @param comment 可选备注
   */
  async collectExplicit(
    decisionId: string,
    rating: number,
    comment?: string
  ): Promise<FeedbackData> {
    // 验证评分范围
    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    // 标准化到 0-1 范围
    const normalized = this.normalizeRating(rating);

    const feedback: FeedbackData = {
      decisionId,
      type: 'explicit',
      source: 'user_rating',
      value: normalized,
      comment,
      timestamp: Date.now()
    };

    // 保存到存储
    this.repository.addFeedback(decisionId, {
      type: 'explicit',
      source: 'user_rating',
      value: normalized,
      comment
    });

    return feedback;
  }

  /**
   * 收集拇指反馈（简化版）
   * 
   * @param decisionId 决策 ID
   * @param thumbsUp 是否点赞
   */
  async collectThumbs(
    decisionId: string,
    thumbsUp: boolean
  ): Promise<FeedbackData> {
    const rating = thumbsUp ? 5 : 2; // 点赞=5 星，点踩=2 星
    return this.collectExplicit(decisionId, rating);
  }

  // ============================================================
  // 隐式反馈收集
  // ============================================================

  /**
   * 收集隐式反馈（基于行为）
   * 
   * @param decisionId 决策 ID
   * @param outcome 决策执行结果
   */
  async collectImplicit(
    decisionId: string,
    outcome: {
      success: boolean;
      executionTime?: number;
      timeout?: boolean;
      error?: string;
    }
  ): Promise<FeedbackData> {
    let value: number;
    let source: string;

    if (outcome.success) {
      // 成功完成：基础分 0.7 + 速度奖励
      value = 0.7 + this.speedBonus(outcome.executionTime || 0);
      source = 'completion';
    } else if (outcome.timeout) {
      // 超时：低分
      value = 0.3;
      source = 'timeout';
    } else {
      // 错误：最低分
      value = 0.1;
      source = 'error';
    }

    const feedback: FeedbackData = {
      decisionId,
      type: 'implicit',
      source: source as any,
      value,
      timestamp: Date.now()
    };

    // 保存到存储
    this.repository.addFeedback(decisionId, {
      type: 'implicit',
      source: source as any,
      value
    });

    return feedback;
  }

  /**
   * 记录任务完成
   */
  async recordCompletion(
    decisionId: string,
    executionTime: number
  ): Promise<FeedbackData> {
    return this.collectImplicit(decisionId, {
      success: true,
      executionTime
    });
  }

  /**
   * 记录超时
   */
  async recordTimeout(decisionId: string): Promise<FeedbackData> {
    return this.collectImplicit(decisionId, {
      success: false,
      timeout: true
    });
  }

  /**
   * 记录错误
   */
  async recordError(
    decisionId: string,
    error: string
  ): Promise<FeedbackData> {
    return this.collectImplicit(decisionId, {
      success: false,
      error
    });
  }

  // ============================================================
  // 反馈聚合
  // ============================================================

  /**
   * 聚合多个反馈源，计算综合评分
   */
  aggregate(feedbacks: FeedbackData[]): AggregatedFeedback {
    if (feedbacks.length === 0) {
      return {
        decisionId: feedbacks[0]?.decisionId || '',
        score: 0.5, // 无反馈时返回中性值
        feedbackCount: 0,
        breakdown: {}
      };
    }

    // 按类型分组
    const explicitFeedbacks = feedbacks.filter(f => f.type === 'explicit');
    const implicitFeedbacks = feedbacks.filter(f => f.type === 'implicit');

    // 计算加权平均
    let weightedSum = 0;
    let totalWeight = 0;

    for (const feedback of feedbacks) {
      const weight = this.getFeedbackWeight(feedback.type, feedback.source);
      weightedSum += feedback.value * weight;
      totalWeight += weight;
    }

    const score = totalWeight > 0 ? weightedSum / totalWeight : 0.5;

    return {
      decisionId: feedbacks[0].decisionId,
      score,
      feedbackCount: feedbacks.length,
      breakdown: {
        explicit: explicitFeedbacks.length > 0
          ? explicitFeedbacks.reduce((sum, f) => sum + f.value, 0) / explicitFeedbacks.length
          : undefined,
        implicit: implicitFeedbacks.length > 0
          ? implicitFeedbacks.reduce((sum, f) => sum + f.value, 0) / implicitFeedbacks.length
          : undefined
      }
    };
  }

  /**
   * 获取决策的综合反馈评分
   */
  async getDecisionScore(decisionId: string): Promise<AggregatedFeedback> {
    // 从存储中获取该决策的所有反馈
    // 这里简化处理，实际应该查询数据库
    return {
      decisionId,
      score: 0.5,
      feedbackCount: 0,
      breakdown: {}
    };
  }

  // ============================================================
  // 工具方法
  // ============================================================

  /**
   * 标准化评分（1-5 星 -> 0-1）
   */
  private normalizeRating(rating: number): number {
    return (rating - 1) / 4;
  }

  /**
   * 执行时间奖励（越快分数越高）
   * 
   * <100ms: +0.3
   * <500ms: +0.2
   * <1000ms: +0.1
   */
  private speedBonus(executionTime: number): number {
    if (executionTime < 100) return 0.3;
    if (executionTime < 500) return 0.2;
    if (executionTime < 1000) return 0.1;
    return 0;
  }

  /**
   * 获取反馈权重
   */
  private getFeedbackWeight(type: string, source: string): number {
    const key = `${type}:${source}`;
    return this.feedbackWeights[key] || 0.5;
  }

  /**
   * 更新反馈权重配置
   */
  updateWeights(weights: Record<string, number>): void {
    this.feedbackWeights = { ...this.feedbackWeights, ...weights };
  }

  /**
   * 获取当前权重配置
   */
  getWeights(): Record<string, number> {
    return { ...this.feedbackWeights };
  }
}

// ============================================================
// 反馈聚合器（独立工具类）
// ============================================================

export class FeedbackAggregator {
  /**
   * 聚合多个决策的反馈，计算整体满意度
   */
  static aggregateMultiple(
    feedbacks: AggregatedFeedback[]
  ): {
    avgScore: number;
    totalFeedbackCount: number;
    distribution: {
      excellent: number;  // 0.8-1.0
      good: number;       // 0.6-0.8
      average: number;    // 0.4-0.6
      poor: number;       // 0.2-0.4
      bad: number;        // 0.0-0.2
    };
  } {
    if (feedbacks.length === 0) {
      return {
        avgScore: 0.5,
        totalFeedbackCount: 0,
        distribution: { excellent: 0, good: 0, average: 0, poor: 0, bad: 0 }
      };
    }

    const totalScore = feedbacks.reduce((sum, f) => sum + f.score, 0);
    const totalCount = feedbacks.reduce((sum, f) => sum + f.feedbackCount, 0);

    // 计算分布
    const distribution = {
      excellent: feedbacks.filter(f => f.score >= 0.8).length,
      good: feedbacks.filter(f => f.score >= 0.6 && f.score < 0.8).length,
      average: feedbacks.filter(f => f.score >= 0.4 && f.score < 0.6).length,
      poor: feedbacks.filter(f => f.score >= 0.2 && f.score < 0.4).length,
      bad: feedbacks.filter(f => f.score < 0.2).length
    };

    return {
      avgScore: totalScore / feedbacks.length,
      totalFeedbackCount: totalCount,
      distribution
    };
  }

  /**
   * 计算滚动平均评分
   */
  static rollingAverage(
    scores: number[],
    windowSize: number = 10
  ): number[] {
    if (scores.length === 0) return [];

    const result: number[] = [];
    
    for (let i = 0; i < scores.length; i++) {
      const start = Math.max(0, i - windowSize + 1);
      const window = scores.slice(start, i + 1);
      const avg = window.reduce((sum, s) => sum + s, 0) / window.length;
      result.push(avg);
    }

    return result;
  }
}

export default FeedbackCollector;
