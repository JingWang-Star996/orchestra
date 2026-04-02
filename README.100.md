# 🎻 Orchestra 100% 版本 - 完整多 Agent 编排系统

**一个人，指挥 53 个 AI 员工干活**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/版本 -100%25-green.svg)](https://github.com/JingWang-Star996/orchestra)

---

## 📖 概述

**Orchestra 100% 版本**是一个完整的多 Agent 编排系统，包含：

- **53 个专业 AI Agent**（编辑部 7 人 + 游戏设计 24 人 + OpenClaw 分析 15 人 + 其他 7 人）
- **自动路由系统**（Orchestrator 总调度 Agent）
- **统一入口 Gateway**（智能判断单个 Agent 或多 Agent 协作）
- **完整工作流引擎**（编辑部 7 阶段/游戏设计 24 岗位/代码分析 15 人）

**核心哲学**：
> 人做决策，AI 执行。专业的人做专业的事，自动路由，智能协作。

---

## ✨ 100% 版本新特性

### vs 80% 版本

| 功能 | 80% | 100% |
|------|-----|------|
| Agent 数量 | 53 个 | 53 个 ✅ |
| 自动路由 | ❌ | ✅ Orchestrator Agent |
| 统一入口 | ❌ | ✅ Gateway |
| 团队识别 | ❌ | ✅ 自动识别编辑部/游戏设计/代码分析 |
| Agent 间通信 | ❌ | ✅ 上下文传递 |
| 工作流引擎 | ❌ | ✅ 编辑部 7 阶段/游戏设计 24 岗位 |

---

## 🚀 快速开始

### 方式 1：单个 Agent

```javascript
const Orchestra = require('./orchestra');
const gateway = new Orchestra();

// 直接调用指定 Agent
const result = await gateway.handle('编辑部 - 总编辑，分析这个素材：...');
console.log(result);
```

### 方式 2：团队协作（自动路由）

```javascript
const Orchestra = require('./orchestra');
const gateway = new Orchestra();

// 提到"编辑部"→自动调用 7 人编辑部协作
const result = await gateway.handle('编辑部，帮我写篇技术分享文章：...');
console.log(result);

// 提到"游戏设计"→自动调用 24 人游戏设计团队
const result = await gateway.handle('游戏设计，设计一个抽卡系统：...');
console.log(result);
```

### 方式 3：命令行

```bash
# 单个 Agent
node orchestra/gateway.js "编辑部 - 总编辑，分析这个素材"

# 团队协作
node orchestra/gateway.js "编辑部，帮我写篇文章"

# 游戏设计
node orchestra/gateway.js "游戏设计，设计一个抽卡系统"
```

---

## 📁 系统架构

### 核心组件

```
orchestra/
├── gateway.js          # 统一入口（100% 版本核心）
├── planner.js          # 任务分解器
├── router.js           # Agent 路由器（增强版）
├── tracker.js          # 进度跟踪器
├── aggregator.js       # 结果汇总器
├── error.js            # 错误处理
└── index.js            # 导出（包含 Gateway）

agents/
├── Orchestrator/       # 总调度 Agent（100% 版本新增）
├── 编辑部 -*/          # 编辑部 7 人
├── 王鲸 AI-*/          # Orchestra 24 岗位
└── ...                 # 其他 22 个 Agent
```

---

## 🎯 自动路由规则

### 触发词识别

| 用户输入包含 | 路由决策 | 调用团队 |
|------------|---------|---------|
| "编辑部"/"写文章"/"整理成文章" | 团队协作 | 编辑部 7 人 |
| "游戏设计"/"系统设计"/"数值设计" | 团队协作 | 游戏设计 24 人 |
| "源码分析"/"架构分析"/"代码审查" | 团队协作 | OpenClaw 分析 15 人 |
| Agent 名称（如"编辑部 - 总编辑"） | 单个 Agent | 指定 Agent |
| 其他复杂任务 | Orchestra | 默认流程 |

### 路由流程

```
用户输入
    ↓
Orchestrator 分析（意图/复杂度/领域）
    ↓
路由决策（单个 Agent / 团队 / Orchestra）
    ↓
执行调度
    ↓
结果汇总
    ↓
输出
```

---

## 📊 团队配置

### AI 编辑部协作系统（7 人）

| 岗位 | Agent | 职责 |
|------|------|------|
| 管理层 | 编辑部 - 总编辑 | 统筹全局，把控文章调性和质量标准 |
| 策划岗 | 编辑部 - 选题策划 | 从素材中提炼核心价值点，确定文章角度 |
| 创作岗 | 编辑部 - 资深撰稿人 | 将素材转化为有深度、有温度的正文内容 |
| 审核岗 | 编辑部 - 技术审核编辑 | 确保技术细节准确、逻辑严密 |
| 编辑岗 | 编辑部 - 文字编辑 | 打磨语言表达，提升文字质量 |
| UX 岗 | 编辑部 - 用户体验编辑 | 从读者角度审视文章，优化阅读体验 |
| 审核岗 | 编辑部 - 终审官 | 全面质检，确保文章达到出版标准 |

**工作流**：7 阶段顺序执行

---

### Orchestra 编排系统（24 岗位）

**管理层**：AI CEO、AI 制作人  
**策划岗**：AI 主策划、AI 数值策划、AI 系统策划、AI 关卡策划、AI 剧情策划、AI 战斗策划、AI 经济策划、AI 活动策划  
**美术岗**：AI 主美、AI 美术总监、AI 角色原画师  
**程序岗**：AI 主程、AI 客户端程序员、AI 服务器程序员、AI AI 技术总监  
**运营岗**：AI 数据分析师、AI 产品经理、AI UX 设计师、AI 社区经理、AI 市场营销经理、AI QA 主管、AI 变现设计师、AI 运营总监、AI 用户运营、AI 商业化运营

**工作流**：任务分解 → Agent 路由 → 并行执行 → 结果汇总

---

### OpenClaw 源码分析团队（15 人）

**管理层**：AI CEO、AI CTO  
**架构分析组**：AI 首席架构师、AI 后端架构师、AI 前端架构师、AI 系统架构师  
**核心引擎组**：AI AI 引擎专家、AI 工具链专家、AI 运行时专家  
**生态插件组**：AI 插件架构师、AI 集成专家、AI API 专家  
**文档工程组**：AI 技术写作主管、AI 文档工程师、AI 知识管理师

**工作流**：源码扫描 → 核心分析 → 集成分析 → 文档输出

---

## 🔧 技术实现

### Gateway 核心逻辑

```javascript
class OrchestraGateway {
  async handle(userInput) {
    // Phase 1: Orchestrator 意图分析
    const intent = await this._analyzeIntent(userInput);
    
    // Phase 2: 路由决策
    const routing = await this._makeRoutingDecision(intent, userInput);
    
    // Phase 3: 执行调度
    let result;
    if (routing.type === 'single') {
      result = await this._executeSingleAgent(routing.target, userInput);
    } else if (routing.type === 'team') {
      result = await this._executeTeam(routing.target, routing.team, userInput);
    } else {
      result = await this._executeOrchestra(userInput);
    }
    
    // Phase 4: 结果汇总
    const output = this._summarizeResult(result, intent, routing);
    
    return output;
  }
}
```

### Router 增强（团队识别）

```javascript
class AgentRouter {
  identifyTeam(userInput) {
    for (const [teamName, config] of Object.entries(this.teams)) {
      for (const trigger of config.triggerWords) {
        if (userInput.toLowerCase().includes(trigger.toLowerCase())) {
          return {
            name: teamName,
            config: config,
            confidence: 'high'
          };
        }
      }
    }
    return null;
  }
  
  async routeToTeam(teamName, task) {
    const team = this.teams[teamName];
    return {
      type: 'team',
      teamName: teamName,
      agents: team.agents,
      workflow: team.workflow,
      task: task
    };
  }
}
```

---

## 📝 使用示例

### 示例 1：编辑部协作

**输入**：
```
编辑部，帮我写篇技术分享文章，素材如下：
我最近用 Claude Code 的 memory 功能做了个记忆整合系统...
```

**路由**：
- 识别触发词："编辑部"
- 路由决策：团队协作 → 编辑部 7 人
- 执行流程：7 阶段顺序执行

**输出**：
```
【Gateway 执行报告】

【意图分析】
任务类型：team_collaboration
复杂度：complex
领域：内容

【路由决策】
类型：team
目标：编辑部
理由：用户提到团队：编辑部

【执行结果】
[编辑部 7 人协作完成的完整文章]
```

---

### 示例 2：游戏设计

**输入**：
```
游戏设计，设计一个抽卡系统，包含保底机制和概率公示
```

**路由**：
- 识别触发词："游戏设计"
- 路由决策：团队协作 → 游戏设计 24 人
- 执行流程：任务分解 → 24 岗位并行执行

---

### 示例 3：单个 Agent

**输入**：
```
编辑部 - 总编辑，分析这个素材的目标受众和文章定位
```

**路由**：
- 识别指定 Agent："编辑部 - 总编辑"
- 路由决策：单个 Agent
- 执行流程：直接调用总编辑 Agent

---

## 📊 性能指标

| 指标 | 80% | 100% |
|------|-----|------|
| Agent 数量 | 53 | 53 |
| 自动路由 | ❌ | ✅ |
| 团队识别 | ❌ | ✅ 3 个团队 |
| 工作流引擎 | ❌ | ✅ 3 个工作流 |
| 平均响应时间 | - | ~30 秒（编辑部 7 阶段） |
| 并发执行 | ✅ | ✅ 最多 5 个并行 |

---

## 🤝 贡献

Issues and Pull Requests are welcome!

---

## 📄 License

MIT License

---

## 📬 联系方式

- **GitHub**: https://github.com/JingWang-Star996/orchestra
- **Issues**: https://github.com/JingWang-Star996/orchestra/issues
- **作者**: JingWang【游戏人王鲸】

---

**Made with ❤️ by JingWang for Multi-Agent Systems**

**最后更新**：2026-04-02  
**版本**：100%
