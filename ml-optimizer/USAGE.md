# Orchestra ML Optimizer - 使用示例

## 快速开始

### 1. 基础用法

```typescript
import { createDecisionOptimizer } from '@orchestra/ml-optimizer';

// 创建优化器实例
const optimizer = createDecisionOptimizer({
  enabled: true,
  learningRate: 0.05,
  minSamples: 50
});

// 在 DecisionMatrix 中选择模型
const candidates = [
  {
    modelId: 'qwen-max',
    scores: {
      contextOverlap: 0.85,
      taskContinuity: 0.72,
      efficiency: 0.65
    }
  },
  {
    modelId: 'gpt-4',
    scores: {
      contextOverlap: 0.78,
      taskContinuity: 0.80,
      efficiency: 0.70
    }
  }
];

const context = {
  messageSource: 'chat',
  timeOfDay: 14,
  dayOfWeek: 3,
  activeTaskId: 'task-123',
  userId: 'user-456'
};

// 获取最优模型选择
const selection = await optimizer.selectModel(candidates, context);

console.log(`Selected: ${selection.modelId}`);
console.log(`Score: ${selection.finalScore}`);
console.log(`Weights used:`, selection.weights);
```

### 2. 记录决策结果

```typescript
// 决策执行完成后，记录结果
await optimizer.recordOutcome(selection.decisionId, {
  success: true,
  executionTime: 250,      // ms
  satisfaction: 4          // 1-5
});

// 或者记录失败
await optimizer.recordOutcome(selection.decisionId, {
  success: false,
  error: 'Model timeout',
  timeout: true
});
```

### 3. 收集用户反馈

```typescript
// 显式反馈（用户评分）
await optimizer.collectFeedback(
  selection.decisionId,
  5,                    // 1-5 星
  'Excellent response!' // 可选备注
);

// 简化版（点赞/点踩）
await optimizer.collectFeedback(
  selection.decisionId,
  thumbsUp ? 5 : 2
);
```

### 4. A/B 测试

```typescript
// 创建 A/B 测试实验
const experiment = optimizer.createABTest({
  name: 'Weight Optimization Test',
  description: 'Test higher efficiency weight',
  variants: [
    {
      name: 'control',
      weights: {
        contextOverlap: 0.4,
        taskContinuity: 0.4,
        efficiency: 0.2
      },
      trafficPercent: 50
    },
    {
      name: 'variant-a',
      weights: {
        contextOverlap: 0.3,
        taskContinuity: 0.3,
        efficiency: 0.4  // 提高效率权重
      },
      trafficPercent: 50
    }
  ],
  minSampleSize: 200
});

// 启动实验
optimizer.startABTest(experiment.id);

// ... 实验运行中 ...

// 分析结果
const analysis = optimizer.analyzeABTest(experiment.id);
console.log('Winner:', analysis.winner);
console.log('Recommendations:', analysis.recommendations);
```

### 5. 监控与统计

```typescript
// 获取当前权重
const weights = optimizer.getCurrentWeights();
console.log('Current weights:', weights);

// 获取统计信息
const stats = optimizer.getStats();
console.log('Sample count:', stats.sampleCount);
console.log('Success rate:', stats.last24hStats.successRatePercent);
console.log('Avg feedback:', stats.last24hStats.avgFeedbackScore);

// 获取模型表现
const performance = optimizer.getModelPerformance();
performance.forEach(model => {
  console.log(`${model.selectedModel}: ${model.successRatePercent}% success`);
});

// 获取趋势
const trend = optimizer.getWeightHistory(7); // 最近 7 天
console.log('Weight trend:', trend);
```

### 6. 集成到 DecisionMatrix

```typescript
// DecisionMatrix.ts
import { MLDecisionOptimizer } from '@orchestra/ml-optimizer';

class DecisionMatrix {
  private mlOptimizer: MLDecisionOptimizer;

  constructor() {
    this.mlOptimizer = new MLDecisionOptimizer({
      enabled: true,
      minSamples: 50
    });
  }

  async selectModel(candidates: ModelCandidate[]): Promise<ModelSelection> {
    const context = this.buildContext();
    
    // 使用 ML 优化器选择模型
    const selection = await this.mlOptimizer.selectModel(candidates, context);
    
    // 记录决策（异步，不阻塞）
    setImmediate(() => {
      // 后续会记录结果
    });

    return {
      modelId: selection.modelId,
      score: selection.finalScore
    };
  }

  async onTaskComplete(
    decisionId: string,
    result: TaskResult
  ) {
    // 记录决策结果
    await this.mlOptimizer.recordOutcome(decisionId, {
      success: result.success,
      executionTime: result.duration,
      satisfaction: result.userRating
    });
  }
}
```

## 配置选项

### MLOptimizerConfig

```typescript
interface MLOptimizerConfig {
  // 是否启用 ML 优化（默认 true）
  enabled: boolean;
  
  // 学习率：每次权重调整的幅度（默认 0.05）
  // 范围：0.01 - 0.2
  learningRate?: number;
  
  // 最小样本数：达到前使用基础权重（默认 50）
  minSamples?: number;
  
  // 是否启用 A/B 测试（默认 false）
  abTestingEnabled?: boolean;
}
```

### 推荐配置

```typescript
// 开发/测试环境
const devConfig = {
  enabled: true,
  learningRate: 0.1,    // 较快收敛
  minSamples: 10        // 快速开始优化
};

// 生产环境
const prodConfig = {
  enabled: true,
  learningRate: 0.03,   // 保守调整
  minSamples: 100,      // 确保统计显著性
  abTestingEnabled: true
};

// 保守模式（仅监控，不自动调整）
const conservativeConfig = {
  enabled: false,       // 使用固定权重
  abTestingEnabled: true // 但可以运行 A/B 测试
};
```

## 最佳实践

### 1. 冷启动处理

```typescript
// 样本不足时，ML 优化器会自动使用基础权重
// 可以通过监控了解收敛进度

const stats = optimizer.getStats();
if (stats.sampleCount < 50) {
  console.log(`Cold start: ${stats.sampleCount}/50 samples`);
}
```

### 2. 权重边界保护

优化器会自动将权重限制在合理范围内：
- 最小权重：0.1（避免完全忽略某个因子）
- 最大权重：0.7（避免某个因子主导）
- 总和：始终为 1.0

### 3. 异步写入

决策记录是异步保存的，不会阻塞决策流程：

```typescript
// 这不会阻塞
await optimizer.selectModel(candidates, context);

// 这也是异步的
optimizer.recordOutcome(decisionId, outcome);
```

### 4. 定期清理数据

```typescript
// 建议每天凌晨清理过期数据
import { DecisionHistoryRepository } from '@orchestra/ml-optimizer';

const repository = new DecisionHistoryRepository();

// 清理 30 天前的数据，保留最近 10000 条
const deleted = repository.cleanupOldData(30, 10000);
console.log(`Cleaned up ${deleted} old records`);
```

### 5. 监控告警

```typescript
// 监控成功率下降
const stats = optimizer.getLast24hStats();
if (stats.successRatePercent < 70) {
  alert('Decision success rate dropped below 70%');
}

// 监控权重异常变化
const weights = optimizer.getCurrentWeights();
if (weights.efficiency > 0.6) {
  alert('Efficiency weight unusually high');
}
```

## 故障排查

### 问题：权重不更新

**原因**：样本数量不足

```typescript
const stats = optimizer.getStats();
console.log(`Samples: ${stats.sampleCount}/50`);

// 确保记录决策结果
await optimizer.recordOutcome(decisionId, outcome);
```

### 问题：决策延迟高

**原因**：数据库写入阻塞

```typescript
// 确保使用异步写入
setImmediate(() => {
  optimizer.recordOutcome(decisionId, outcome);
});

// 或使用 WAL 模式的数据库
const repository = new DecisionHistoryRepository('./data/ml.db');
// 内部已配置 PRAGMA journal_mode = WAL
```

### 问题：A/B 测试无结果

**原因**：样本量不足或流量分配不均

```typescript
const analysis = optimizer.analyzeABTest(experimentId);
console.log('Completed:', analysis.completed);
console.log('Significant:', analysis.statisticalSignificance);

// 检查流量分配
const experiment = getExperiment(experimentId);
console.log(experiment.variants); // 确保 trafficPercent 总和为 100
```

## 性能基准

| 操作 | P50 | P95 | P99 |
|------|-----|-----|-----|
| selectModel | 2ms | 5ms | 8ms |
| recordOutcome | <1ms | <1ms | <1ms |
| getStats | 1ms | 3ms | 5ms |
| cleanupOldData | 50ms | 100ms | 200ms |

*测试环境：SQLite in-memory, 10k 条记录*

## 下一步

1. **集成到 DecisionMatrix** - 修改 `DecisionMatrix.ts` 使用 ML 优化器
2. **配置监控** - 接入现有监控系统
3. **A/B 测试** - 设计并启动第一个实验
4. **参数调优** - 根据实际效果调整学习率等参数

---

更多详情请参考 [DESIGN.md](./DESIGN.md)
