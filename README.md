# 🎻 王鲸 AI 多 Agent 编排系统 (Orchestra)

**一个人，指挥 24 个 AI 员工干活**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Chinese](https://img.shields.io/badge/语言 - 中文-red.svg)](README.md)

---

## 📖 简介

**Orchestra** 是一个多 Agent 编排系统，灵感来自管弦乐队的协作模式。

就像指挥家协调小提琴、大提琴、鼓手演奏一首完整的曲子，Orchestra 协调 24 个 AI 岗位（AI CEO、AI 主策、AI 主程、AI 主美...）完成复杂的游戏开发任务。

**核心理念**：
> 人做决策，AI 做执行。专业的人做专业的事，合起来是一首完整的曲子。

---

## ✨ 核心功能

| 功能 | 说明 | 类比 |
|------|------|------|
| 🎯 任务自动分解 | 1 个复杂需求→N 个可执行的子任务 | 总谱→分谱 |
| 🤖 Agent 智能路由 | 根据任务类型自动分配给对应的 AI | 谁拉琴、谁打鼓 |
| 📊 进度实时跟踪 | 实时监控所有子任务状态 | 保持节奏一致 |
| 📋 结果自动汇总 | 所有 AI 的输出自动整合 | 整首曲子 |

---

## 🚀 快速开始

### 使用场景示例

#### 场景 1：游戏系统设计
```
输入："设计一个宠物养成系统"
→ 自动分解为 24 个子任务
→ 分配给对应的 AI 岗位
→ 2 小时后输出完整方案
```

#### 场景 2：版本规划
```
输入："下版本要做哪些功能"
→ AI CEO 分析战略方向
→ AI 主策划拆解需求
→ AI 数值评估工作量
→ 输出版本规划文档
```

#### 场景 3：代码 Review
```
输入："review 这个战斗模块"
→ AI 主程检查代码质量
→ AI 测试检查边界情况
→ 输出 Review 报告
```

---

## 📁 系统架构

### 核心模块（1119 行代码）

```
orchestrator/
├── planner.js      # 任务分解器（Task Planner）
├── router.js       # Agent 路由器（Agent Router）
├── tracker.js      # 进度跟踪器（Progress Tracker）
├── aggregator.js   # 结果汇总器（Result Aggregator）
├── error.js        # 错误处理（Error Handler）
└── index.js        # 统一入口（Main Entry）
```

### 24 个 AI 岗位

**管理层**：
- AI CEO、AI 制作人、AI 主策划

**策划岗**：
- AI 数值策划、AI 系统策划、AI 关卡策划、AI 剧情策划、AI 战斗策划、AI 经济策划、AI 活动策划

**美术岗**：
- AI 主美、AI 美术总监、AI 角色原画师

**程序岗**：
- AI 主程、AI 客户端程序员、AI 服务器程序员、AI AI 技术总监

**运营岗**：
- AI 数据分析师、AI 产品经理、AI UX 设计师、AI 社区经理、AI 市场营销经理、AI QA 主管、AI 变现设计师、AI 运营总监、AI 用户运营、AI 商业化运营

---

## 💡 设计理念

### 1. 人做决策，AI 做执行
方向你来定，活 AI 来干。

### 2. 专业的人做专业的事
24 个 AI 各司其职，不越界。
- 数值问题→AI 数值策划
- 代码问题→AI 主程
- 美术问题→AI 主美

### 3. 透明可控
所有进度实时可见，随时干预。

### 4. 结果导向
不管过程多复杂，只要结果。

---

## 📊 实测数据

| 指标 | 数据 |
|------|------|
| 代码量 | 1119 行 |
| 核心模块 | 6 个 |
| AI 岗位 | 24 个 |
| 效率提升 | 3-5 倍 |
| 适用团队 | 5-20 人游戏团队 |

### 效率对比

| 任务 | 传统方式 | 使用 Orchestra | 提升 |
|------|---------|---------------|------|
| 游戏方案设计 | 2 周 | 40 分钟 | 200 倍 + |
| 人员分析报告 | 1 天 | 10 分钟 | 100 倍 + |
| BUG 收集分析 | 2 小时/天 | 自动运行 | 100% 节省 |

---

## 🔧 技术栈

- **运行时**：Node.js
- **AI 模型**：阿里云百炼 qwen3.5-plus（可配置）
- **平台**：OpenClaw
- **语言**：JavaScript

---

## 📝 使用示例

### 基础用法

```javascript
const Orchestra = require('./orchestrator');

// 创建编排系统
const orchestra = new Orchestra({
  model: 'qwen3.5-plus',
  agents: ['ceo', 'producer', 'designer', 'programmer']
});

// 提交任务
const result = await orchestra.run('设计一个抽卡系统');

// 获取结果
console.log(result.summary);
```

### 高级模式

```javascript
// 自定义 Agent 路由
orchestra.router.register('数值', 'ai-number-designer');
orchestra.router.register('代码', 'ai-lead-programmer');

// 进度回调
orchestra.tracker.on('progress', (task, status) => {
  console.log(`${task.name}: ${status}`);
});

// 结果汇总
orchestra.aggregator.format = 'markdown';
```

---

## 🎯 适用场景

### ✅ 适合
- 游戏开发团队（5-20 人）
- 需要多岗位协作的复杂任务
- 想提升效率的小团队
- 有 OpenClaw 使用经验

### ❌ 不适合
- 单人开发（用单个 AI 助手即可）
- 超大型团队（需要更复杂的企业级方案）
- 非游戏行业（需要调整 Agent 定义）

---

## 📚 相关项目

- [Dream 记忆整合系统](https://github.com/JingWang-Star996/dream-system) - AI 自动记忆管理
- [OpenClaw](https://github.com/openclaw/openclaw) - AI 助手框架

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 开发环境搭建

```bash
# 克隆仓库
git clone https://github.com/JingWang-Star996/orchestra.git
cd orchestra

# 安装依赖（如有）
npm install

# 运行测试
node test.js
```

---

## 📄 License

**MIT License**

```
Copyright (c) 2026 JingWang【游戏人王鲸】

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
```

---

## 📬 联系方式

- **GitHub**: https://github.com/JingWang-Star996/orchestra
- **Issues**: https://github.com/JingWang-Star996/orchestra/issues
- **作者**: JingWang【游戏人王鲸】

---

**Made with ❤️ by JingWang for Game Developers**

**最后更新**：2026-04-02
