/**
 * Orchestra ML Optimizer - 单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WeightOptimizer } from '../algorithms/weight-optimizer';
import { DecisionHistoryRepository } from '../storage/repository';
import { FeedbackCollector } from '../feedback/collector';
import { ABTestManager } from '../ab-testing/experiment';
import { MLDecisionOptimizer } from '../integration/decision-matrix-hook';

// ============================================================
// WeightOptimizer 测试
// ============================================================

describe('WeightOptimizer', () => {
  let repository: DecisionHistoryRepository;
  let optimizer: WeightOptimizer;

  beforeEach(() => {
    repository = new DecisionHistoryRepository(':memory:');
    optimizer = new WeightOptimizer(repository, {
      minSamples: 10,
      windowSize: 50,
      learningRate: 0.1
    });
  });

  it('should return base weights when sample count is low', async () => {
    const result = await optimizer.getOptimalWeights();
    
    expect(result.source).toBe('base');
    expect(result.weights).toEqual({
      contextOverlap: 0.4,
      taskContinuity: 0.4,
      efficiency: 0.2
    });
    expect(result.confidence).toBeLessThan(1);
  });

  it('should calculate optimized weights with enough samples', async () => {
    // 添加模拟数据
    for (let i = 0; i < 20; i++) {
      repository.saveDecision({
        id: `decision-${i}`,
        timestamp: Date.now() - i * 1000,
        messageSource: 'chat',
        timeOfDay: 10,
        dayOfWeek: 1,
        scoreContextOverlap: 0.8,
        scoreTaskContinuity: 0.7,
        scoreEfficiency: 0.6,
        weightContextOverlap: i % 2 === 0 ? 0.5 : 0.3,
        weightTaskContinuity: 0.3,
        weightEfficiency: 0.2,
        finalScore: 0.75,
        selectedModel: 'model-a',
        outcomeSuccess: i % 2 === 0 // 偶数成功，奇数失败
      });
    }

    const result = await optimizer.getOptimalWeights();
    
    expect(result.source).toBe('optimized');
    expect(result.sampleCount).toBe(20);
    expect(result.weights.contextOverlap + result.weights.taskContinuity + result.weights.efficiency)
      .toBeCloseTo(1, 5);
  });

  it('should normalize weights to sum to 1', async () => {
    // 边界情况测试
    for (let i = 0; i < 15; i++) {
      repository.saveDecision({
        id: `decision-${i}`,
        timestamp: Date.now(),
        messageSource: 'chat',
        timeOfDay: 10,
        dayOfWeek: 1,
        scoreContextOverlap: 0.8,
        scoreTaskContinuity: 0.7,
        scoreEfficiency: 0.6,
        weightContextOverlap: 0.9,
        weightTaskContinuity: 0.9,
        weightEfficiency: 0.9,
        finalScore: 0.8,
        selectedModel: 'model-a',
        outcomeSuccess: true
      });
    }

    const result = await optimizer.getOptimalWeights();
    
    // 权重应该在合理范围内且总和为 1
    expect(result.weights.contextOverlap).toBeGreaterThanOrEqual(0.1);
    expect(result.weights.contextOverlap).toBeLessThanOrEqual(0.7);
    expect(result.weights.contextOverlap + result.weights.taskContinuity + result.weights.efficiency)
      .toBeCloseTo(1, 5);
  });
});

// ============================================================
// FeedbackCollector 测试
// ============================================================

describe('FeedbackCollector', () => {
  let repository: DecisionHistoryRepository;
  let collector: FeedbackCollector;

  beforeEach(() => {
    repository = new DecisionHistoryRepository(':memory:');
    collector = new FeedbackCollector(repository);
  });

  it('should normalize rating from 1-5 to 0-1', async () => {
    const feedback = await collector.collectExplicit('decision-1', 5);
    expect(feedback.value).toBe(1);

    const feedback2 = await collector.collectExplicit('decision-2', 3);
    expect(feedback2.value).toBe(0.5);

    const feedback3 = await collector.collectExplicit('decision-3', 1);
    expect(feedback3.value).toBe(0);
  });

  it('should collect implicit feedback based on outcome', async () => {
    const success = await collector.collectImplicit('decision-1', {
      success: true,
      executionTime: 50
    });
    expect(success.value).toBeGreaterThan(0.7);

    const timeout = await collector.collectImplicit('decision-2', {
      success: false,
      timeout: true
    });
    expect(timeout.value).toBe(0.3);

    const error = await collector.collectImplicit('decision-3', {
      success: false,
      error: 'Something went wrong'
    });
    expect(error.value).toBe(0.1);
  });

  it('should aggregate multiple feedbacks', () => {
    const feedbacks = [
      { decisionId: 'd1', type: 'explicit' as const, source: 'user_rating' as const, value: 0.8, timestamp: Date.now() },
      { decisionId: 'd1', type: 'implicit' as const, source: 'completion' as const, value: 0.7, timestamp: Date.now() }
    ];

    const aggregated = collector.aggregate(feedbacks);
    
    expect(aggregated.score).toBeGreaterThan(0);
    expect(aggregated.score).toBeLessThan(1);
    expect(aggregated.feedbackCount).toBe(2);
  });
});

// ============================================================
// ABTestManager 测试
// ============================================================

describe('ABTestManager', () => {
  let repository: DecisionHistoryRepository;
  let abTestManager: ABTestManager;

  beforeEach(() => {
    repository = new DecisionHistoryRepository(':memory:');
    abTestManager = new ABTestManager(repository);
  });

  it('should create experiment with valid traffic allocation', () => {
    const experiment = abTestManager.createExperiment({
      name: 'Test Experiment',
      variants: [
        { name: 'control', weights: { contextOverlap: 0.4, taskContinuity: 0.4, efficiency: 0.2 }, trafficPercent: 50 },
        { name: 'variant-a', weights: { contextOverlap: 0.5, taskContinuity: 0.3, efficiency: 0.2 }, trafficPercent: 50 }
      ]
    });

    expect(experiment.status).toBe('draft');
    expect(experiment.variants.length).toBe(2);
  });

  it('should throw error when traffic allocation does not sum to 100', () => {
    expect(() => {
      abTestManager.createExperiment({
        name: 'Invalid Experiment',
        variants: [
          { name: 'control', weights: { contextOverlap: 0.4, taskContinuity: 0.4, efficiency: 0.2 }, trafficPercent: 60 },
          { name: 'variant-a', weights: { contextOverlap: 0.5, taskContinuity: 0.3, efficiency: 0.2 }, trafficPercent: 60 }
        ]
      });
    }).toThrow('Traffic allocation must sum to 100%');
  });

  it('should assign variants consistently', () => {
    const experiment = abTestManager.createExperiment({
      name: 'Consistency Test',
      variants: [
        { name: 'control', weights: { contextOverlap: 0.4, taskContinuity: 0.4, efficiency: 0.2 }, trafficPercent: 50 },
        { name: 'variant-a', weights: { contextOverlap: 0.5, taskContinuity: 0.3, efficiency: 0.2 }, trafficPercent: 50 }
      ]
    });

    abTestManager.startExperiment(experiment.id);

    // 同一用户应该始终分配到同一变体
    const context = { userId: 'user-123' };
    const variant1 = abTestManager.assignVariant(context);
    const variant2 = abTestManager.assignVariant(context);
    
    expect(variant1).toBe(variant2);
  });
});

// ============================================================
// MLDecisionOptimizer 集成测试
// ============================================================

describe('MLDecisionOptimizer', () => {
  let optimizer: MLDecisionOptimizer;

  beforeEach(() => {
    optimizer = new MLDecisionOptimizer({
      enabled: true,
      minSamples: 5
    });
  });

  it('should select model with highest weighted score', async () => {
    const candidates = [
      {
        modelId: 'model-a',
        scores: { contextOverlap: 0.9, taskContinuity: 0.8, efficiency: 0.7 }
      },
      {
        modelId: 'model-b',
        scores: { contextOverlap: 0.5, taskContinuity: 0.5, efficiency: 0.5 }
      }
    ];

    const context = {
      messageSource: 'chat',
      timeOfDay: 10,
      dayOfWeek: 1
    };

    const selection = await optimizer.selectModel(candidates, context);
    
    expect(selection.modelId).toBe('model-a');
    expect(selection.finalScore).toBeGreaterThan(0);
    expect(selection.decisionId).toBeDefined();
  });

  it('should record outcome and feedback', async () => {
    const candidates = [
      {
        modelId: 'model-a',
        scores: { contextOverlap: 0.8, taskContinuity: 0.7, efficiency: 0.6 }
      }
    ];

    const context = {
      messageSource: 'chat',
      timeOfDay: 10,
      dayOfWeek: 1
    };

    const selection = await optimizer.selectModel(candidates, context);
    
    // 记录执行结果
    await optimizer.recordOutcome(selection.decisionId, {
      success: true,
      executionTime: 150,
      satisfaction: 4
    });

    // 收集用户反馈
    await optimizer.collectFeedback(selection.decisionId, 5, 'Great response!');

    const stats = optimizer.getStats();
    expect(stats.sampleCount).toBeGreaterThan(0);
  });

  it('should use default weights when disabled', async () => {
    const disabledOptimizer = new MLDecisionOptimizer({ enabled: false });
    
    const candidates = [
      {
        modelId: 'model-a',
        scores: { contextOverlap: 0.8, taskContinuity: 0.7, efficiency: 0.6 }
      }
    ];

    const context = {
      messageSource: 'chat',
      timeOfDay: 10,
      dayOfWeek: 1
    };

    const selection = await disabledOptimizer.selectModel(candidates, context);
    
    expect(selection.weights).toEqual({
      contextOverlap: 0.4,
      taskContinuity: 0.4,
      efficiency: 0.2
    });
  });
});

// ============================================================
// 集成场景测试
// ============================================================

describe('Integration Scenarios', () => {
  it('should complete full decision lifecycle', async () => {
    const optimizer = new MLDecisionOptimizer({ minSamples: 5 });

    // 模拟多次决策
    for (let i = 0; i < 10; i++) {
      const candidates = [
        {
          modelId: `model-${i % 2}`,
          scores: {
            contextOverlap: 0.7 + Math.random() * 0.2,
            taskContinuity: 0.6 + Math.random() * 0.2,
            efficiency: 0.5 + Math.random() * 0.2
          }
        }
      ];

      const context = {
        messageSource: 'chat',
        timeOfDay: 9 + (i % 12),
        dayOfWeek: i % 7
      };

      const selection = await optimizer.selectModel(candidates, context);
      
      // 模拟执行结果
      await optimizer.recordOutcome(selection.decisionId, {
        success: Math.random() > 0.3,
        executionTime: 100 + Math.random() * 400,
        satisfaction: 3 + Math.floor(Math.random() * 3)
      });
    }

    const stats = optimizer.getStats();
    expect(stats.sampleCount).toBe(10);
    expect(stats.last24hStats.totalDecisions).toBe(10);
  });
});
