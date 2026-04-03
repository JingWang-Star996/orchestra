# ML Optimizer - 快速参考卡

## 核心 API

### 创建优化器

```typescript
import { createDecisionOptimizer } from '@orchestra/ml-optimizer';

const optimizer = createDecisionOptimizer({
  enabled: true,
  learningRate: 0.05,
  minSamples: 50
});
```

### 选择模型

```typescript
const selection = await optimizer.selectModel(candidates, context);
// 返回：{ modelId, finalScore, weights, decisionId }
```

### 记录结果

```typescript
await optimizer.recordOutcome(decisionId, {
  success: true,
  executionTime: 250,
  satisfaction: 4
});
```

### 收集反馈

```typescript
await optimizer.collectFeedback(decisionId, 5, 'Great!');
```

---

## 权重配置

### 默认权重
```
contextOverlap:  40%
taskContinuity:  40%
efficiency:      20%
```

### 权重范围
- 最小：0.1
- 最大：0.7
- 总和：1.0

---

## 反馈类型

| 类型 | 来源 | 权重 | 分值 |
|------|------|------|------|
| explicit | user_rating | 1.0 | 1-5 星 → 0-1 |
| implicit | completion | 0.7 | 0.7 + 速度奖励 |
| implicit | timeout | 0.3 | 固定 0.3 |
| implicit | error | 0.1 | 固定 0.1 |

### 速度奖励
- <100ms: +0.3
- <500ms: +0.2
- <1000ms: +0.1

---

## A/B 测试

### 创建实验

```typescript
const experiment = optimizer.createABTest({
  name: 'Test',
  variants: [
    { name: 'control', weights: {...}, trafficPercent: 50 },
    { name: 'variant-a', weights: {...}, trafficPercent: 50 }
  ],
  minSampleSize: 200
});
```

### 启动实验

```typescript
optimizer.startABTest(experiment.id);
```

### 分析结果

```typescript
const analysis = optimizer.analyzeABTest(experiment.id);
// 返回：{ winner, recommendations, statisticalSignificance }
```

---

## 统计查询

```typescript
// 当前权重
const weights = optimizer.getCurrentWeights();

// 完整统计
const stats = optimizer.getStats();
// { currentWeights, sampleCount, last24hStats, modelPerformance }

// 24 小时统计
const daily = optimizer.getLast24hStats();
// { totalDecisions, successRatePercent, avgFeedbackScore }

// 模型表现
const perf = optimizer.getModelPerformance();
// [{ modelId, decisionCount, successRatePercent, ... }]

// 趋势
const trend = optimizer.getWeightHistory(7); // 7 天
```

---

## 配置参数

```typescript
interface Config {
  enabled: boolean;          // 默认 true
  learningRate: number;      // 默认 0.05 (0.01-0.2)
  minSamples: number;        // 默认 50
  abTestingEnabled: boolean; // 默认 false
}
```

### 推荐配置

**开发环境**:
```typescript
{ learningRate: 0.1, minSamples: 10 }
```

**生产环境**:
```typescript
{ learningRate: 0.03, minSamples: 100 }
```

---

## 数据库表

### decision_history
主表，存储所有决策记录

### weight_snapshots
权重变化历史

### ab_experiments
A/B 实验配置

### feedback_records
反馈详情（可选）

---

## 性能指标

| 操作 | P95 |
|------|-----|
| selectModel | 5ms |
| recordOutcome | <1ms |
| getStats | 3ms |

---

## 常见问题

### Q: 权重为什么不更新？
A: 检查样本数量 `stats.sampleCount >= minSamples`

### Q: 如何重置权重？
A: `optimizer.reset()`

### Q: 如何禁用 ML 优化？
A: `optimizer.disable()` 或配置 `enabled: false`

### Q: 数据保留多久？
A: 默认 30 天或 10000 条，可调用 `cleanupOldData()` 手动清理

---

## 文件位置

```
orchestra/ml-optimizer/
├── DESIGN.md          # 详细设计
├── USAGE.md           # 使用示例
├── DELIVERY.md        # 交付报告
├── QUICK-REFERENCE.md # 本文件
└── ...                # 源代码
```

---

**版本**: 0.1.0  
**更新**: 2026-04-03
