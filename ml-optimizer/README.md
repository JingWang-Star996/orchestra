# Orchestra ML 优化模块

简单的决策历史统计与权重优化系统，无需复杂机器学习。

## 📁 文件结构

```
ml-optimizer/
├── DecisionHistory.js          # 决策历史记录器
├── WeightOptimizer.js          # 权重优化算法
├── DecisionMatrix-integration.js  # DecisionMatrix 集成示例
├── README.md                   # 使用说明
└── history.json                # 历史数据存储（运行时生成）
```

## 🚀 快速开始

### 1. 记录决策历史

```javascript
const DecisionHistory = require('./ml-optimizer/DecisionHistory');

const history = new DecisionHistory({
  storagePath: './data/history.json',
  maxHistory: 1000
});

// 记录一次决策结果
history.record({
  decisionId: 'dec_001',
  strategy: 'aggressive',
  timestamp: Date.now(),
  success: true,
  metadata: { userId: 'user123', context: 'battle' }
});
```

### 2. 查看统计数据

```javascript
// 获取单个策略统计
const stats = history.getStrategyStats('aggressive');
console.log(stats);
// { strategy: 'aggressive', total: 50, success: 35, failure: 15, successRate: 0.7 }

// 获取所有策略统计
const allStats = history.getAllStats();
console.log(allStats);

// 获取最近记录
const recent = history.getRecent(50);
```

### 3. 权重优化

```javascript
const WeightOptimizer = require('./ml-optimizer/WeightOptimizer');

const optimizer = new WeightOptimizer({
  baseWeights: {
    'aggressive': 1.0,
    'conservative': 1.0,
    'balanced': 1.0
  },
  adjustmentFactor: 0.1,
  minWeight: 0.1,
  maxWeight: 10.0
});

// 记录决策并自动优化权重
optimizer.recordAndOptimize({
  decisionId: 'dec_002',
  strategy: 'aggressive',
  success: true
});

// 获取当前权重
const weights = optimizer.getWeights();
console.log(weights);
// { aggressive: 1.15, conservative: 1.0, balanced: 1.0 }

// 获取推荐策略（权重最高）
const recommended = optimizer.getRecommendedStrategy(['aggressive', 'conservative', 'balanced']);

// 按权重随机选择（权重越高概率越大）
const selected = optimizer.selectStrategyWeighted(['aggressive', 'conservative', 'balanced']);
```

## 🔧 集成到 DecisionMatrix

**完整示例**: `DecisionMatrix-integration.js`

```javascript
const DecisionMatrix = require('./ml-optimizer/DecisionMatrix-integration');

const matrix = new DecisionMatrix({
  baseWeights: {
    'rule_based': 1.0,
    'keyword_match': 1.0,
    'fuzzy_match': 1.0
  },
  verbose: true
});

// 做出决策
const agent = matrix.decide(task, availableAgents);

// 记录结果（任务完成后）
matrix.recordResult(
  { taskId: task.id, strategy: 'rule_based', agent: agent },
  success // true/false
);

// 查看统计
const stats = matrix.getStats();
```

### 集成到 Router.js

修改 `router.js` 的 `_findBestAgent` 方法：

```javascript
const DecisionMatrix = require('./ml-optimizer/DecisionMatrix-integration');

class AgentRouter {
  constructor(options = {}) {
    // ... 现有代码 ...
    
    // 新增：决策矩阵
    this.decisionMatrix = new DecisionMatrix({
      baseWeights: {
        'rule_based': 1.0,
        'keyword_match': 1.0,
        'fuzzy_match': 1.0
      }
    });
  }
  
  _findBestAgent(task) {
    if (task.agent) return task.agent;
    
    // 使用决策矩阵
    const agent = this.decisionMatrix.decide(task, this.agents);
    return agent;
  }
  
  async route(tasks) {
    const assignments = new Map();
    
    for (const task of tasks) {
      const agent = this._findBestAgent(task);
      assignments.set(task.id, {
        task: task,
        agent: agent,
        status: 'assigned'
      });
    }
    
    return assignments;
  }
  
  // 任务完成后调用
  recordTaskResult(taskId, success) {
    // 从 assignments 中获取决策信息
    const assignment = this.assignments.get(taskId);
    if (assignment) {
      this.decisionMatrix.recordResult(
        { taskId, strategy: 'rule_based', agent: assignment.agent },
        success
      );
    }
  }
}
```

## 📊 配置选项

### DecisionHistory

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| storagePath | string | ./history.json | 历史数据存储路径 |
| maxHistory | number | 1000 | 最多保留的记录数 |

### WeightOptimizer

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| history | DecisionHistory | 新建实例 | 历史记录器实例 |
| baseWeights | Object | {} | 基础权重配置 |
| minWeight | number | 0.1 | 最小权重值 |
| maxWeight | number | 10.0 | 最大权重值 |
| adjustmentFactor | number | 0.1 | 权重调整系数（0-1） |

## 🎯 算法说明

### 权重调整逻辑

```
新权重 = 当前权重 + (目标权重 - 当前权重) × 调整系数

目标权重 = 成功率 × 2
```

- 成功率 100% → 目标权重 2.0
- 成功率 50% → 目标权重 1.0
- 成功率 0% → 目标权重 0.0

权重会被限制在 [minWeight, maxWeight] 范围内。

### 策略选择

1. **推荐策略**: 选择当前权重最高的策略
2. **加权随机**: 按权重比例随机选择，保留探索性

## 📝 注意事项

1. 历史记录保存在 JSON 文件中，适合中小型数据量
2. 如需更高性能，可替换为数据库存储
3. 调整系数越大，权重变化越快
4. 定期清理过期的历史记录

## 🧪 测试示例

```javascript
const optimizer = new WeightOptimizer({
  baseWeights: { 'a': 1.0, 'b': 1.0 }
});

// 模拟 100 次决策
for (let i = 0; i < 100; i++) {
  optimizer.recordAndOptimize({
    decisionId: `test_${i}`,
    strategy: i % 2 === 0 ? 'a' : 'b',
    success: Math.random() > 0.3 // 70% 成功率
  });
}

console.log('最终权重:', optimizer.getWeights());
console.log('推荐策略:', optimizer.getRecommendedStrategy(['a', 'b']));
```

---

**完成时间**: 2026-04-03  
**复杂度**: 简单统计，无复杂 ML  
**集成难度**: ⭐⭐☆☆☆
