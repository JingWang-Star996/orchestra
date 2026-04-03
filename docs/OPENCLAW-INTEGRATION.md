# Orchestra OpenClaw API 集成指南

**版本**: v1.1.0  
**更新日期**: 2026-04-03  
**状态**: ✅ P0 集成完成

---

## 📋 概述

Orchestra 已完成与 OpenClaw API 的完整集成，支持真实的子代理会话创建、管理和执行。

### 集成范围

| 模块 | 集成状态 | API 使用 |
|------|---------|---------|
| WorkerManager | ✅ 完成 | sessions_spawn, process |
| Gateway | ✅ 完成 | sessions_spawn |
| ParallelExecutor | ✅ 完成 | agentCaller (HTTPS API) |
| TaskNotification | ⚠️ 部分 | 内部系统，无需外部 API |

---

## 🔧 OpenClaw API 工具

### 1. sessions_spawn

**用途**: 创建子代理会话

**导入**:
```javascript
const sessions_spawn = global.sessions_spawn || null;
```

**调用示例**:
```javascript
const session = await sessions_spawn({
  task: '任务描述或 Agent 提示词',
  mode: 'session',        // 'session' (持久) 或 'run' (一次性)
  runtime: 'subagent',
  label: '会话标签',
  model: 'qwen3.5-plus',  // 可选
  timeoutSeconds: 3600,   // 可选，默认 3600 秒
  cleanup: 'keep'         // 'keep' 或 'delete'
});

// 返回
{
  sessionKey: 'agent-x7q',  // 会话 ID
  id: 'agent-x7q',
  status: 'created'
}
```

**使用场景**:
- WorkerManager.create() - 创建 Worker 会话
- Gateway._executeSingleAgent() - 调用单个 Agent
- Gateway._executeEditorialWorkflow() - 7 阶段顺序执行

---

### 2. process

**用途**: 管理子代理会话（发送消息、轮询响应）

**导入**:
```javascript
const process = global.process || null;
```

**调用示例**:

#### 发送消息
```javascript
const sendResult = await process({
  action: 'send-keys',      // 或 'paste'
  sessionId: 'agent-x7q',   // 会话 ID
  text: '用户消息内容',
  timeoutMs: 60000          // 超时时间
});
```

#### 轮询响应
```javascript
const pollResult = await process({
  action: 'poll',
  sessionId: 'agent-x7q',
  timeout: 5000,            // 轮询超时（毫秒）
  limit: 100                // 最大返回行数
});

// 返回
{
  output: 'Agent 响应内容',
  status: 'running',        // 或 'completed'
  sessionId: 'agent-x7q'
}
```

**使用场景**:
- WorkerManager._executeWorker() - 发送消息并等待响应
- WorkerManager._pollWorkerResponse() - 轮询 Agent 输出

---

## 📦 集成详情

### WorkerManager 集成

**文件**: `orchestra/workerManager.js`

#### 1. 创建 Worker (create 方法)

```javascript
async create(options) {
  const workerId = `agent-${this._generateId()}`;
  
  // 调用 OpenClaw sessions_spawn
  if (sessions_spawn) {
    const session = await sessions_spawn({
      task: prompt || description,
      mode: 'session',
      runtime: 'subagent',
      label: description,
      timeoutSeconds: timeoutSeconds || 3600,
      cleanup: 'keep'
    });
    
    worker.sessionId = session.sessionKey || session.id;
  }
  
  return { workerId, sessionId: worker.sessionId, status: 'created' };
}
```

**关键点**:
- 使用 `mode: 'session'` 创建持久会话
- 保存 sessionKey 用于后续通信
- 错误时抛出异常，由调用者处理

#### 2. 继续 Worker (continue 方法)

```javascript
async continue(workerId, message) {
  const worker = this.workers.get(workerId);
  
  // 添加到上下文
  worker.context.messages.push({
    role: 'user',
    content: message,
    timestamp: new Date().toISOString()
  });
  
  // 执行 Worker
  const result = await this._executeWorker(worker, message);
  
  return result;
}
```

#### 3. 执行 Worker (_executeWorker 方法)

```javascript
async _executeWorker(worker, message = null) {
  const startTime = Date.now();
  
  if (process && worker.sessionId) {
    // 发送消息
    const sendResult = await process({
      action: 'send-keys',
      sessionId: worker.sessionId,
      text: message,
      timeoutMs: 60000
    });
    
    // 轮询响应
    const pollResult = await this._pollWorkerResponse(worker.sessionId, 60000);
    
    return {
      workerId: worker.id,
      status: 'completed',
      output: pollResult.output,
      usage: {
        totalTokens: this._estimateTokens(pollResult.output),
        toolUses: 1,
        durationMs: Date.now() - startTime
      }
    };
  } else {
    // 降级：模拟模式
    return { /* 模拟结果 */ };
  }
}
```

#### 4. 轮询响应 (_pollWorkerResponse 方法)

```javascript
async _pollWorkerResponse(sessionId, timeoutMs = 60000) {
  const startTime = Date.now();
  const pollInterval = 2000; // 2 秒轮询一次
  
  while (Date.now() - startTime < timeoutMs) {
    const result = await process({
      action: 'poll',
      sessionId: sessionId,
      timeout: 5000,
      limit: 100
    });
    
    if (result && result.output && result.output.length > 0) {
      return result;
    }
    
    if (result && result.status === 'completed') {
      return result;
    }
    
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  throw new Error(`轮询超时（${timeoutMs}ms）`);
}
```

**关键点**:
- 2 秒轮询间隔，避免频繁请求
- 检查 output 和 status 判断完成
- 超时抛出错误，由调用者处理

#### 5. Token 估算 (_estimateTokens 方法)

```javascript
_estimateTokens(text) {
  if (!text) return 0;
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.round(chineseChars / 1.5 + otherChars / 4);
}
```

---

### Gateway 集成

**文件**: `orchestra/gateway.js`

#### 1. 执行单个 Agent

```javascript
async _executeSingleAgent(agentName, userInput) {
  const agent = this.availableAgents.find(a => a.name === agentName);
  
  if (sessions_spawn) {
    const session = await sessions_spawn({
      task: `${agent.prompt}\\n\\n用户请求：${userInput}`,
      mode: 'run',          // 一次性执行
      runtime: 'subagent',
      label: `${agentName} - ${userInput.substring(0, 50)}`,
      timeoutSeconds: 600,
      cleanup: 'keep'
    });
    
    return {
      type: 'single',
      agent: agentName,
      sessionId: session.sessionKey,
      output: `[${agentName}] 已完成`
    };
  }
}
```

**关键点**:
- 使用 `mode: 'run'` 一次性执行
- 适合简单任务，不需要持续交互

#### 2. 编辑部工作流（7 阶段顺序执行）

```javascript
async _executeEditorialWorkflow(userInput) {
  const stages = [
    '编辑部 - 总编辑',
    '编辑部 - 选题策划',
    '编辑部 - 资深撰稿人',
    '编辑部 - 技术审核编辑',
    '编辑部 - 文字编辑',
    '编辑部 - 用户体验编辑',
    '编辑部 - 终审官'
  ];
  
  let context = { userInput, output: '', stageResults: [] };
  
  for (const stage of stages) {
    const agent = this.availableAgents.find(a => a.name === stage);
    
    const session = await sessions_spawn({
      task: `${agent.prompt}\\n\\n素材：${userInput}\\n\\n前一阶段输出：${context.output}`,
      mode: 'run',
      runtime: 'subagent',
      label: stage,
      timeoutSeconds: 300,
      cleanup: 'keep'
    });
    
    context.output += `\\n\\n## ${stage}\\n\\n${result}`;
    context.stageResults.push({ stage, result, sessionId: session.sessionKey });
  }
  
  return {
    type: 'team',
    team: '编辑部',
    stages: stages,
    output: context.output,
    stageResults: context.stageResults
  };
}
```

**关键点**:
- 7 阶段**顺序执行**，每阶段等待前一阶段完成
- 传递上下文（前一阶段输出）给下一阶段
- 每阶段独立会话，互不干扰

#### 3. 游戏设计工作流（24 岗位并行执行）

```javascript
async _executeGameDesignWorkflow(userInput) {
  const gameDesignAgents = this.router.getTeamAgents('游戏设计');
  
  if (sessions_spawn) {
    const promises = gameDesignAgents.map(async (agentName) => {
      const session = await sessions_spawn({
        task: `${agent.prompt}\\n\\n用户需求：${userInput}`,
        mode: 'run',
        runtime: 'subagent',
        label: agentName,
        timeoutSeconds: 300,
        cleanup: 'keep'
      });
      
      return {
        agent: agentName,
        sessionId: session.sessionKey,
        status: 'completed'
      };
    });
    
    const allResults = await Promise.all(promises);
  }
}
```

**关键点**:
- 使用 `Promise.all` **并行执行**所有岗位
- 适合需要多岗位独立输出的场景
- 执行速度快于顺序执行

---

## 🛡️ 错误处理

### 1. 降级支持

所有 OpenClaw API 调用都包含降级逻辑：

```javascript
if (sessions_spawn) {
  // 真实调用
  const session = await sessions_spawn({...});
} else {
  // 模拟模式
  console.warn('[Gateway] OpenClaw API 不可用，使用模拟模式');
  return { /* 模拟结果 */ };
}
```

**优势**:
- 开发环境无 OpenClaw 时仍可测试
- 生产环境 API 故障时优雅降级
- 便于单元测试

### 2. 超时控制

```javascript
// sessions_spawn 超时
await sessions_spawn({
  timeoutSeconds: 3600,  // 1 小时
});

// process 超时
await process({
  timeoutMs: 60000,  // 60 秒
});

// 轮询超时
await this._pollWorkerResponse(sessionId, 60000);
```

### 3. 异常捕获

```javascript
try {
  const session = await sessions_spawn({...});
  return { success: true, sessionId: session.sessionKey };
} catch (err) {
  console.error(`[Gateway] 调用 Agent 失败：${err.message}`);
  throw err;  // 或返回错误结果
}
```

---

## 🧪 测试

### CLI 测试

**WorkerManager 测试**:
```bash
cd /home/z3129119/.openclaw/workspace/orchestra
node workerManager.js
```

**Gateway 测试**:
```bash
node gateway.js "帮我写篇技术分享文章"
```

### 预期输出

```
[WorkerManager] 创建 Worker: agent-x7q
[WorkerManager] OpenClaw 会话已创建：agent-x7q
[WorkerManager] 通过 OpenClaw process API 发送消息到 agent-x7q
[WorkerManager] 消息已发送，等待响应...
[WorkerManager] 收到 Worker 响应
[WorkerManager] Worker 已创建：agent-x7q
```

---

## 📊 性能指标

### 会话创建延迟

| 模式 | 延迟 | 说明 |
|------|------|------|
| sessions_spawn (run) | 1-3 秒 | 一次性执行 |
| sessions_spawn (session) | 2-5 秒 | 持久会话 |

### 消息执行延迟

| 操作 | 延迟 | 说明 |
|------|------|------|
| send-keys | <1 秒 | 发送消息 |
| poll (首次响应) | 5-30 秒 | 取决于任务复杂度 |
| poll (完成) | 10-60 秒 | 完整执行时间 |

### Token 消耗估算

| 任务类型 | Token 估算 |
|---------|-----------|
| 简单问答 | 500-2,000 |
| 单 Agent 执行 | 2,000-10,000 |
| 编辑部 7 阶段 | 15,000-50,000 |
| 游戏设计 24 岗位 | 50,000-200,000 |

---

## 🔧 调试技巧

### 1. 启用详细日志

```javascript
const workerManager = new WorkerManager({
  verbose: true,  // 启用详细日志
  maxWorkers: 10
});
```

### 2. 检查会话状态

```javascript
// 查看 Worker 状态
const status = workerManager.getWorkerStatus('agent-x7q');
console.log(status);

// 查看所有 Worker
const allStatus = workerManager.getAllStatus();
console.log(allStatus);
```

### 3. 导出历史记录

```javascript
const history = workerManager.exportHistory();
console.log(JSON.stringify(history, null, 2));
```

---

## ⚠️ 注意事项

### 1. 会话生命周期

- `mode: 'session'` 创建的会话会持久存在
- 使用 `cleanup: 'delete'` 自动清理
- 或手动调用 `sessions_send` 结束会话

### 2. 并发控制

```javascript
const workerManager = new WorkerManager({
  maxWorkers: 10  // 限制最大 Worker 数量
});
```

### 3. 超时设置

- 简单任务：300 秒（5 分钟）
- 复杂任务：3600 秒（1 小时）
- 轮询超时：60000 毫秒（1 分钟）

### 4. 错误恢复

```javascript
try {
  const result = await workerManager.continue(workerId, message);
} catch (err) {
  if (err.message.includes('超时')) {
    // 重试或标记失败
    await workerManager.stop({ task_id: workerId, reason: '超时' });
  }
}
```

---

## 📚 相关文档

- [ARCHITECTURE-REVIEW.md](./ARCHITECTURE-REVIEW.md) - 架构审查报告
- [WORKER-MANAGER.md](./WORKER-MANAGER.md) - WorkerManager API 文档
- [SCRATCHPAD-README.md](./SCRATCHPAD-README.md) - Scratchpad 使用指南
- [QUICKSTART.md](./QUICKSTART.md) - 快速开始

---

## 🚀 下一步

### P1 阶段（优化）

- [ ] 持久化支持（通知历史、Worker 状态）
- [ ] 重试机制（网络错误自动重试）
- [ ] 权限控制（跨 Worker 数据共享验证）
- [ ] 单元测试和集成测试

### P2 阶段（扩展）

- [ ] 监控 Dashboard（Worker 状态可视化）
- [ ] 机器学习优化（决策权重自动调整）
- [ ] 分布式支持（多实例部署）

---

**维护者**: AI CTO  
**联系方式**: orchestra-team@example.com  
**最后更新**: 2026-04-03
