# Orchestra API 参考文档

**版本**: v1.0  
**最后更新**: 2026-04-05  
**阶段**: Phase 3

---

## 📖 目录

1. [核心入口](#核心入口)
2. [Gateway](#gateway)
3. [WorkerManager](#workermanager)
4. [ReadWriteSeparator](#readwriteseparator)
5. [CacheLayer](#cachelayer)
6. [ParallelExecutor](#parallelexecutor)
7. [DecisionMatrix](#decisionmatrix)
8. [Scratchpad](#scratchpad)
9. [TaskNotification](#tasknotification)
10. [工具系统](#工具系统)
11. [灵活恢复](#灵活恢复)
12. [权限控制](#访问控制)

---

## 核心入口

### Orchestra 主类

```javascript
const Orchestra = require('./index.js');

const orchestra = new Orchestra(options);
```

**参数**:
- `options.model` (string): AI 模型，默认 'qwen3.5-plus'
- `options.verbose` (boolean): 是否输出详细日志
- `options.maxConcurrent` (number): 最大并发数，默认 3
- `options.timeout` (number): 超时时间（毫秒）

**方法**:
- `run(task)` - 执行任务
- `getStatus()` - 获取状态
- `destroy()` - 销毁实例

---

## Gateway

### 创建实例

```javascript
const { Gateway } = require('./index.js');

const gateway = new Gateway(options);
```

**参数**:
- `options.model` (string): AI 模型
- `options.verbose` (boolean): 详细日志
- `options.maxConcurrent` (number): 最大并发数
- `options.timeout` (number): 超时时间

### 方法

#### execute(task)

执行工作流任务。

**参数**:
- `task.task` (string): 任务描述
- `task.agents` (Array<string>): Agent 列表
- `task.options` (Object): 选项

**返回**: Promise<Object>

**示例**:
```javascript
const result = await gateway.execute({
  task: '设计一个宠物养成系统',
  agents: ['AI 主策划', 'AI 数值策划', 'AI 系统策划']
});
```

---

## WorkerManager

### 创建实例

```javascript
const { WorkerManager } = require('./index.js');

const manager = new WorkerManager(options);
```

**参数**:
- `options.storage` (string): 存储类型 ('file' | 'memory')
- `options.storagePath` (string): 文件存储路径
- `options.maxWorkers` (number): 最大 Worker 数
- `options.verbose` (boolean): 详细日志

### 方法

#### create(config)

创建 Worker。

**参数**:
- `config.description` (string): Worker 描述
- `config.prompt` (string): Worker 提示词
- `config.timeoutSeconds` (number): 超时时间

**返回**: Promise<{workerId: string}>

#### continue(workerId, message)

继续 Worker 对话。

**参数**:
- `workerId` (string): Worker ID
- `message` (string): 消息内容

**返回**: Promise<Object>

#### stop(options)

停止 Worker。

**参数**:
- `options.task_id` (string): Worker ID
- `options.reason` (string): 停止原因

**返回**: Promise<Object>

#### getStatus(workerId)

获取 Worker 状态。

**返回**: Object

---

## ReadWriteSeparator

### 创建实例

```javascript
const ReadWriteSeparator = require('./readWriteSeparator');

const separator = new ReadWriteSeparator(options);
```

**参数**:
- `options.verbose` (boolean): 详细日志
- `options.dryRun` (boolean): DryRun 模式
- `options.maxConcurrentReads` (number): 最大并发读取数

### 方法

#### executeTask(task)

执行任务（自动路由）。

**参数**:
- `task.id` (string): 任务 ID
- `task.description` (string): 任务描述
- `task.actions` (Array<Object>): 操作列表

**返回**: Promise<Object>

#### setTools(tools)

设置工具回调。

**参数**:
- `tools.onReadTool` (Function): 读取工具回调
- `tools.onWriteTool` (Function): 写入工具回调
- `tools.onEditTool` (Function): 编辑工具回调
- `tools.onDeleteTool` (Function): 删除工具回调

#### getStats()

获取统计信息。

**返回**: Object

#### getPerformanceReport()

获取性能报告。

**返回**: Object

---

## CacheLayer

### 创建实例

```javascript
const CacheLayer = require('./cacheLayer');

const cache = new CacheLayer(options);
```

**参数**:
- `options.maxSize` (number): 最大缓存条目数
- `options.defaultTTL` (number): 默认 TTL（毫秒）
- `options.verbose` (boolean): 详细日志

### 方法

#### set(key, value, options)

设置缓存。

**参数**:
- `key` (string): 缓存键
- `value` (any): 缓存值
- `options.ttl` (number): 自定义 TTL

#### get(key)

获取缓存。

**返回**: any|null

#### has(key)

检查缓存是否存在。

**返回**: boolean

#### delete(key)

删除缓存。

**返回**: boolean

#### clear()

清空缓存。

#### size()

获取缓存大小。

**返回**: number

#### getStats()

获取统计信息。

**返回**: Object

#### getPerformanceReport()

获取性能报告。

**返回**: Object

#### destroy()

销毁缓存层（停止定时器）。

---

## ParallelExecutor

### 创建实例

```javascript
const { ParallelExecutor } = require('./index.js');

const executor = new ParallelExecutor(options);
```

**参数**:
- `options.maxConcurrent` (number): 最大并发数

### 方法

#### executeParallel(tasks, options)

并行执行多个任务。

**参数**:
- `tasks` (Array<Object>): 任务列表
- `options.timeout` (number): 超时时间

**返回**: Promise<Array<Object>>

#### waitForAll(promises)

等待所有 Promise 完成。

**返回**: Promise<Array>

---

## DecisionMatrix

### 函数

#### decideContinueOrSpawn(context)

智能决策：继续现有 Worker 还是创建新 Worker。

**参数**:
- `context.task` (Object): 任务对象
- `context.workerContext` (Object): Worker 上下文

**返回**: Object

**返回结构**:
```javascript
{
  decision: 'continue' | 'spawn' | 'stop',
  reason: 'high_overlap' | 'new_domain' | 'error',
  confidence: 0.95
}
```

---

## Scratchpad

### 创建实例

```javascript
const Scratchpad = require('./scratchpad');

const scratchpad = new Scratchpad(taskId, options);
```

**参数**:
- `taskId` (string): 任务 ID
- `options.basePath` (string): 基础路径
- `options.verbose` (boolean): 详细日志
- `options.enableHistory` (boolean): 启用历史记录

### 方法

#### set(key, value)

写入数据。

**返回**: Promise<Object>

#### get(key)

读取数据。

**返回**: Promise<any>

#### acquireLock(key)

获取锁。

**返回**: Promise<boolean>

#### releaseLock(key)

释放锁。

**返回**: Promise<Object>

---

## TaskNotification

### 创建实例

```javascript
const { TaskNotificationManager } = require('./index.js');

const manager = new TaskNotificationManager(options);
```

### 方法

#### send(notification)

发送通知。

**参数**:
- `notification.taskId` (string): 任务 ID
- `notification.status` (string): 状态
- `notification.summary` (string): 摘要
- `notification.result` (Object): 结果

#### search(query, options)

搜索通知。

**返回**: Array<Object>

---

## 工具系统

### ToolSystem

```javascript
const ToolSystem = require('./toolSystem');

const toolSystem = new ToolSystem(options);
```

### 方法

#### grantPermission(workerId, toolId, permissions)

授予工具权限。

#### revokePermission(workerId, toolId)

撤销工具权限。

#### hasPermission(workerId, toolId, permission)

检查权限。

---

## 灵活恢复

### FlexibleRecovery

```javascript
const FlexibleRecovery = require('./flexibleRecovery');

const recovery = new FlexibleRecovery(options);
```

### 方法

#### classifyError(error)

分类错误。

**返回**: string (错误类型)

#### suggestRecovery(error, context)

建议恢复策略。

**返回**: string (恢复策略)

#### executeRecovery(strategy, context)

执行恢复。

**返回**: Promise<Object>

---

## 访问控制

### AccessControlManager

```javascript
const { AccessControlManager, PermissionLevel } = require('./accessControl');

const acm = new AccessControlManager();
```

### 方法

#### initialize(taskId, ownerId)

初始化任务 ACL。

#### grantPermission(taskId, userId, permissions, grantedBy, expiresAt)

授予权限。

#### revokePermission(taskId, userId, permission)

撤销权限。

#### hasPermission(taskId, userId, permission)

检查权限。

**返回**: boolean

---

## 📚 完整示例

### 完整工作流

```javascript
const Orchestra = require('./index.js');

// 创建实例
const orchestra = new Orchestra({
  model: 'qwen3.5-plus',
  verbose: true,
  maxConcurrent: 5
});

// 执行任务
const result = await orchestra.run({
  task: '修复支付 Bug',
  codebasePath: '/src/payment',
  searchQueries: ['payment', 'checkout'],
  testCommand: 'npm test -- payment'
});

console.log(result.summary);
```

---

**Made with ❤️ for OpenClaw Community**
