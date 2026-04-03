# Orchestra ML Optimizer - 详细设计文档

## 1. 系统概述

### 1.1 问题陈述

当前 DecisionMatrix 使用固定权重进行决策：
- `contextOverlap`: 40%
- `taskContinuity`: 40%
- `efficiency`: 20%

**问题**：固定权重无法适应不同场景，导致次优决策。

**目标**：通过历史数据学习，动态调整权重以最大化决策质量。

### 1.2 设计原则

1. **简单优先** - 使用简单的加权平均算法，避免复杂 ML
2. **渐进优化** - 基于成功率的增量调整
3. **可解释性** - 权重变化可追踪、可理解
4. **低开销** - 决策延迟 <5ms

---

## 2. 决策历史记录系统

### 2.1 数据模型

```typescript
interface DecisionRecord {
  id: string;                    // 唯一标识
  timestamp: number;             // 决策时间戳
  context: {
    activeTaskId?: string;       // 当前任务 ID
    messageSource: string;       // 消息来源
    timeOfDay: number;           // 时间段 (0-23)
    dayOfWeek: number;           // 星期 (0-6)
  };
  scores: {
    contextOverlap: number;      // 上下文重叠分 (0-1)
    taskContinuity: number;      // 任务连续性分 (0-1)
    efficiency: number;          // 效率分 (0-1)
  };
  weights: {
    contextOverlap: number;      // 使用的权重 (0-1)
    taskContinuity: number;      // 使用的权重 (0-1)
    efficiency: number;          // 使用的权重 (0-1)
  };
  finalScore: number;            // 加权总分
  selectedModel: string;         // 选中的模型
  outcome?: {
    success: boolean;            // 决策是否成功
    userSatisfaction?: number;   // 用户满意度 (1-5)
    executionTime?: number;      // 执行时间 (ms)
    error?: string;              // 错误信息
  };
  feedback?: FeedbackData;       // 反馈数据
}

interface FeedbackData {
  type: 'explicit' | 'implicit'; // 反馈类型
  source: 'user_rating' | 'completion' | 'timeout' | 'error';
  value: number;                 // 标准化评分 (0-1)
  timestamp: number;
}
```

### 2.2 存储结构

使用 SQLite 存储（轻量、零配置）：

```sql
-- 决策历史表
CREATE TABLE decision_history (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  active_task_id TEXT,
  message_source TEXT NOT NULL,
  time_of_day INTEGER NOT NULL,
  day_of_week INTEGER NOT NULL,
  
  score_context_overlap REAL NOT NULL,
  score_task_continuity REAL NOT NULL,
  score_efficiency REAL NOT NULL,
  
  weight_context_overlap REAL NOT NULL,
  weight_task_continuity REAL NOT NULL,
  weight_efficiency REAL NOT NULL,
  
  final_score REAL NOT NULL,
  selected_model TEXT NOT NULL,
  
  outcome_success INTEGER,
  outcome_satisfaction REAL,
  outcome_execution_time REAL,
  outcome_error TEXT,
  
  feedback_type TEXT,
  feedback_source TEXT,
  feedback_value REAL,
  feedback_timestamp INTEGER
);

-- 索引优化查询性能
CREATE INDEX idx_timestamp ON decision_history(timestamp);
CREATE INDEX idx_task_id ON decision_history(active_task_id);
CREATE INDEX idx_success ON decision_history(outcome_success);
```

### 2.3 存储策略

- **保留策略**: 保留最近 10,000 条记录或 30 天数据
- **归档**: 超过保留期的数据压缩归档
- **清理**: 每日凌晨自动清理过期数据

---

## 3. 权重优化算法

### 3.1 核心算法 - 增量加权平均

```typescript
class WeightOptimizer {
  // 基础权重（冷启动使用）
  private baseWeights = {
    contextOverlap: 0.4,
    taskContinuity: 0.4,
    efficiency: 0.2
  };

  // 学习到的权重调整值
  private adjustments = {
    contextOverlap: 0,
    taskContinuity: 0,
    efficiency: 0
  };

  // 配置参数
  private config = {
    learningRate: 0.05,      // 学习率：每次调整的幅度
    minWeight: 0.1,          // 最小权重（避免某个因子被完全忽略）
    maxWeight: 0.7,          // 最大权重（避免某个因子主导）
    minSamples: 50,          // 最小样本数（达到前使用基础权重）
    windowSize: 200          // 滑动窗口大小（只考虑最近 N 次决策）
  };

  /**
   * 获取当前最优权重
   */
  async getOptimalWeights(context: ContextInfo): Promise<Weights> {
    const sampleCount = await this.getRecentSampleCount();
    
    // 冷启动：样本不足时使用基础权重
    if (sampleCount < this.config.minSamples) {
      return this.baseWeights;
    }

    // 基于历史数据计算优化权重
    const optimized = await this.calculateOptimalWeights();
    
    // 应用上下文相关的调整（可选）
    return this.applyContextAdjustments(optimized, context);
  }

  /**
   * 基于滑动窗口计算最优权重
   */
  private async calculateOptimalWeights(): Promise<Weights> {
    // 获取最近 N 次决策记录
    const records = await this.getRecentRecords(this.config.windowSize);
    
    // 按结果分组：成功 vs 失败
    const successful = records.filter(r => r.outcome?.success === true);
    const failed = records.filter(r => r.outcome?.success === false);

    // 计算成功决策的平均权重
    const avgSuccessWeights = this.averageWeights(
      successful.map(r => r.weights)
    );

    // 计算失败决策的平均权重
    const avgFailedWeights = this.averageWeights(
      failed.map(r => r.weights)
    );

    // 计算调整方向：成功的权重应该增加，失败的应该减少
    const adjustments = {
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
    return this.normalizeWeights(adjustments);
  }

  /**
   * 计算单个因子的调整量
   */
  private calculateAdjustment(successAvg: number, failedAvg: number): number {
    const diff = successAvg - failedAvg;
    // 使用学习率控制调整幅度
    return diff * this.config.learningRate;
  }

  /**
   * 归一化权重（总和为 1，且在合理范围内）
   */
  private normalizeWeights(weights: Weights): Weights {
    // 应用边界限制
    const clamped = {
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
   * 记录决策结果并更新权重
   */
  async recordDecision(record: DecisionRecord): Promise<void> {
    // 保存到存储
    await this.storage.save(record);

    // 异步触发权重更新（不阻塞决策流程）
    this.scheduleWeightUpdate();
  }
}
```

### 3.2 算法特点

1. **简单透明**: 基于成功/失败对比，易于理解和调试
2. **渐进收敛**: 小步调整，避免剧烈波动
3. **边界保护**: 权重限制在合理范围内
4. **冷启动友好**: 样本不足时使用保守的基础权重

---

## 4. A/B 测试框架

### 4.1 实验设计

```typescript
interface ABTestExperiment {
  id: string;
  name: string;
  status: 'draft' | 'running' | 'completed' | 'paused';
  
  // 实验组配置
  variants: {
    name: string;              // 变体名称（如 "control", "variant-a"）
    weights: Weights;          // 权重配置
    trafficPercent: number;    // 流量分配（0-100）
  }[];

  // 实验参数
  startDate: number;
  endDate?: number;
  minSampleSize: number;       // 最小样本数
  confidenceLevel: number;     // 置信水平（如 0.95）

  // 结果指标
  metrics: {
    variant: string;
    sampleCount: number;
    successRate: number;
    avgSatisfaction: number;
    avgExecutionTime: number;
  }[];
}
```

### 4.2 流量分配

```typescript
class TrafficAllocator {
  /**
   * 为当前请求分配实验变体
   */
  assignVariant(experiment: ABTestExperiment, context: ContextInfo): string {
    // 使用一致性哈希确保同一用户始终分配到同一变体
    const hash = this.hashContext(context);
    const bucket = hash % 100;

    let cumulative = 0;
    for (const variant of experiment.variants) {
      cumulative += variant.trafficPercent;
      if (bucket < cumulative) {
        return variant.name;
      }
    }

    // 默认返回对照组
    return 'control';
  }

  private hashContext(context: ContextInfo): number {
    // 使用用户 ID + 时间戳确保分布均匀
    const seed = context.userId || context.sessionId || Date.now();
    return this.simpleHash(seed) % 100;
  }
}
```

### 4.3 结果分析

```typescript
class ExperimentAnalyzer {
  /**
   * 分析实验结果，判断是否达到统计显著性
   */
  analyze(experiment: ABTestExperiment): AnalysisResult {
    const control = experiment.metrics.find(m => m.variant === 'control');
    const variants = experiment.metrics.filter(m => m.variant !== 'control');

    const results = variants.map(variant => {
      const zScore = this.calculateZScore(control, variant);
      const pValue = this.zToPValue(zScore);
      const significant = pValue < (1 - experiment.confidenceLevel);

      return {
        variant: variant.variant,
        improvement: (variant.successRate - control.successRate) / control.successRate,
        significant,
        pValue,
        recommendation: significant && variant.successRate > control.successRate 
          ? 'adopt' 
          : 'reject'
      };
    });

    return {
      experimentId: experiment.id,
      completed: this.isComplete(experiment),
      recommendations: results
    };
  }
}
```

---

## 5. 反馈收集机制

### 5.1 反馈类型

| 类型 | 来源 | 权重 | 说明 |
|------|------|------|------|
| explicit | 用户评分 | 1.0 | 用户直接评分（1-5 星） |
| implicit | 任务完成 | 0.7 | 任务成功完成 |
| implicit | 超时 | 0.3 | 决策后超时未执行 |
| implicit | 错误 | 0.1 | 执行出错 |

### 5.2 反馈收集器

```typescript
class FeedbackCollector {
  /**
   * 收集显式反馈（用户评分）
   */
  async collectExplicit(
    decisionId: string,
    rating: number,  // 1-5
    comment?: string
  ): Promise<void> {
    const normalized = this.normalizeRating(rating); // 转为 0-1
    await this.saveFeedback({
      decisionId,
      type: 'explicit',
      source: 'user_rating',
      value: normalized,
      comment,
      timestamp: Date.now()
    });
  }

  /**
   * 收集隐式反馈（基于行为）
   */
  async collectImplicit(
    decisionId: string,
    outcome: DecisionOutcome
  ): Promise<void> {
    let value: number;
    let source: string;

    if (outcome.success) {
      value = 0.7 + (outcome.executionTime ? this.speedBonus(outcome.executionTime) : 0);
      source = 'completion';
    } else if (outcome.timeout) {
      value = 0.3;
      source = 'timeout';
    } else {
      value = 0.1;
      source = 'error';
    }

    await this.saveFeedback({
      decisionId,
      type: 'implicit',
      source,
      value,
      timestamp: Date.now()
    });
  }

  /**
   * 标准化评分到 0-1 范围
   */
  private normalizeRating(rating: number): number {
    // 1-5 星 -> 0-1
    return (rating - 1) / 4;
  }

  /**
   * 执行时间奖励（越快分数越高）
   */
  private speedBonus(executionTime: number): number {
    // <100ms: +0.3, <500ms: +0.2, <1000ms: +0.1
    if (executionTime < 100) return 0.3;
    if (executionTime < 500) return 0.2;
    if (executionTime < 1000) return 0.1;
    return 0;
  }
}
```

### 5.3 反馈聚合

```typescript
class FeedbackAggregator {
  /**
   * 聚合多个反馈源，计算综合评分
   */
  aggregate(feedbacks: FeedbackData[]): number {
    if (feedbacks.length === 0) return 0.5; // 无反馈时返回中性值

    const weightedSum = feedbacks.reduce((sum, f) => {
      const weight = this.getFeedbackWeight(f.type, f.source);
      return sum + (f.value * weight);
    }, 0);

    const totalWeight = feedbacks.reduce((sum, f) => {
      return sum + this.getFeedbackWeight(f.type, f.source);
    }, 0);

    return weightedSum / totalWeight;
  }

  private getFeedbackWeight(type: string, source: string): number {
    const weights: Record<string, number> = {
      'explicit:user_rating': 1.0,
      'implicit:completion': 0.7,
      'implicit:timeout': 0.3,
      'implicit:error': 0.1
    };
    return weights[`${type}:${source}`] || 0.5;
  }
}
```

---

## 6. DecisionMatrix 集成

### 6.1 集成点

```typescript
// DecisionMatrix.ts 修改点
class DecisionMatrix {
  private mlOptimizer: MLOptimizer;

  async selectModel(candidates: ModelCandidate[]): Promise<ModelSelection> {
    // 1. 获取当前最优权重
    const weights = await this.mlOptimizer.getOptimalWeights(this.context);

    // 2. 使用优化后的权重计算分数
    const scored = candidates.map(candidate => ({
      ...candidate,
      score: this.calculateWeightedScore(candidate, weights)
    }));

    // 3. 选择最高分模型
    const selected = this.selectHighest(scored);

    // 4. 记录决策（异步，不阻塞）
    this.mlOptimizer.recordDecision({
      context: this.context,
      scores: this.extractScores(scored),
      weights,
      selectedModel: selected.modelId,
      timestamp: Date.now()
    });

    return selected;
  }

  // 决策结果回调（在任务执行后调用）
  async onDecisionComplete(
    decisionId: string,
    outcome: DecisionOutcome
  ): Promise<void> {
    await this.mlOptimizer.recordOutcome(decisionId, outcome);
  }
}
```

### 6.2 配置选项

```typescript
interface MLOptimizerConfig {
  enabled: boolean;              // 是否启用 ML 优化
  mode: 'learning' | 'inference'; // 学习模式或推理模式
  
  // 算法参数
  learningRate: number;
  minSamples: number;
  windowSize: number;
  
  // A/B 测试
  abTestingEnabled: boolean;
  abTestExperimentId?: string;
  
  // 反馈
  collectExplicitFeedback: boolean;
  collectImplicitFeedback: boolean;
}
```

---

## 7. 性能与监控

### 7.1 性能目标

| 指标 | 目标 | 测量方式 |
|------|------|----------|
| 权重查询延迟 | <5ms | P95 延迟 |
| 决策记录延迟 | <10ms（异步） | 后台写入 |
| 存储占用 | <100MB (10k 记录) | 数据库大小 |
| 内存占用 | <50MB | 进程 RSS |

### 7.2 监控指标

```typescript
interface MLOptimizerMetrics {
  // 权重变化
  currentWeights: Weights;
  weightChanges24h: number;
  
  // 学习效果
  avgSuccessRate: number;
  successRateTrend: 'improving' | 'stable' | 'degrading';
  
  // 样本统计
  totalDecisions: number;
  decisionsLast24h: number;
  avgFeedbackScore: number;
  
  // A/B 测试
  activeExperiments: number;
  bestPerformingVariant?: string;
}
```

---

## 8. 实施路线图

### Phase 1 (P2-2) - 核心功能
- [x] 决策历史存储设计
- [x] 权重优化算法实现
- [x] A/B 测试框架设计
- [x] 反馈收集机制
- [ ] DecisionMatrix 集成

### Phase 2 (P2-3) - 完善优化
- [ ] 单元测试覆盖 >80%
- [ ] 性能基准测试
- [ ] 监控指标接入
- [ ] 文档完善

### Phase 3 (P3) - 生产部署
- [ ] A/B 实验配置
- [ ] 灰度发布
- [ ] 效果评估
- [ ] 参数调优

---

## 9. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 冷启动问题 | 初期决策质量不稳定 | 使用保守基础权重，设置最小样本数 |
| 过拟合 | 权重对历史数据过度适应 | 使用滑动窗口，限制学习率 |
| 性能开销 | 决策延迟增加 | 异步写入，缓存权重结果 |
| 数据隐私 | 存储用户行为数据 | 仅存储必要字段，支持数据清理 |

---

## 10. 附录

### 10.1 术语表

- **DecisionMatrix**: 模型决策矩阵，负责选择最优模型
- **Weights**: 权重配置，决定各评分因子的重要性
- **A/B Testing**: 对比实验，验证不同权重配置的效果
- **Feedback Loop**: 反馈循环，收集决策结果用于优化

### 10.2 参考资料

- 多臂老虎机算法 (Multi-Armed Bandit)
- 强化学习基础 (Reinforcement Learning)
- A/B 测试统计显著性检验
