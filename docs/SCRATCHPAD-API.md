# Scratchpad API 文档

跨 Worker 知识共享系统 - 为 Orchestra 提供持久化存储和知识共享能力

## 📋 目录

- [概述](#概述)
- [核心概念](#核心概念)
- [数据结构](#数据结构)
- [API 参考](#api-参考)
  - [Scratchpad 类](#scratchpad-类)
  - [ScratchpadManager 类](#scratchpadmanager-类)
- [使用示例](#使用示例)
- [最佳实践](#最佳实践)
- [故障排查](#故障排查)

---

## 概述

Scratchpad 是一个专为 Orchestra Worker 管理系统设计的跨 Worker 知识共享系统。它提供：

- ✅ **键值对存储** - 支持任意 JSON 可序列化数据
- ✅ **持久化存储** - 自动保存到文件系统
- ✅ **跨 Worker 共享** - Worker 之间可以共享和同步数据
- ✅ **并发安全** - 基于文件锁的并发控制机制
- ✅ **版本控制** - 自动追踪数据版本和历史记录
- ✅ **事件驱动** - 支持事件监听和响应

### 适用场景

1. **跨 Worker 知识传递** - Worker A 的分析结果传递给 Worker B
2. **任务状态持久化** - 保存任务进度，支持断点续传
3. **共享配置管理** - 多个 Worker 共享同一份配置
4. **协作数据收集** - 多个 Worker 并行收集数据到共享存储
5. **审计与回溯** - 通过历史记录追踪数据变更

---

## 核心概念

### Scratchpad

每个 Worker 拥有独立的 Scratchpad 实例，通过 `taskId` 标识。Scratchpad 是数据的基本管理单元。

```typescript
const scratchpad = new Scratchpad('worker-123');
```

### Entry（数据条目）

每个数据条目包含：

- `value` - 实际数据（任意 JSON）
- `version` - 版本号（自动递增）
- `timestamp` - ISO 时间戳
- `updatedAt` - Unix 时间戳
- `workerId` - 创建/修改的 Worker ID
- `metadata` - 自定义元数据

### Lock（锁）

用于并发控制的锁机制：

- **全局锁** - 锁定整个 Scratchpad 文件
- **键级锁** - 锁定特定键
- **自动过期** - 默认 30 秒超时，防止死锁

### History（历史记录）

自动记录每次数据变更：

- 操作类型（create/update/delete）
- 时间戳
- 操作者 Worker ID
- 旧值和新值

---

## 数据结构

### Scratchpad 文件格式

```json
{
  "version": "2.0.0",
  "taskId": "worker-123",
  "createdAt": 1712137200000,
  "updatedAt": 1712137260000,
  "entries": {
    "analysis-result": {
      "value": { "status": "completed", "findings": [...] },
      "version": 3,
      "timestamp": "2026-04-03T10:00:00.000Z",
      "updatedAt": 1712137260000,
      "workerId": "worker-123",
      "metadata": { "priority": "high" }
    }
  },
  "history": {
    "analysis-result": [
      {
        "action": "create",
        "timestamp": "2026-04-03T09:50:00.000Z",
        "workerId": "worker-123",
        "oldValue": null,
        "newValue": { "status": "pending" }
      }
    ]
  },
  "locks": {
    "analysis-result": {
      "workerId": "worker-123",
      "acquiredAt": 1712137200000,
      "expiresAt": 1712137230000
    }
  }
}
```

---

## API 参考

### Scratchpad 类

#### 构造函数

```typescript
new Scratchpad(taskId: string, options?: ScratchpadOptions)
```

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| taskId | string | ✅ | - | 任务/Worker ID |
| options.basePath | string | ❌ | 'temp/scratchpad' | 基础路径 |
| options.verbose | boolean | ❌ | false | 详细日志 |
| options.enableHistory | boolean | ❌ | true | 启用历史记录 |
| options.lockTimeout | number | ❌ | 30000 | 锁超时（毫秒） |
| options.autoSave | boolean | ❌ | true | 自动保存 |

**示例：**

```typescript
const scratchpad = new Scratchpad('worker-123', {
  verbose: true,
  enableHistory: true,
  lockTimeout: 60000
});
```

---

#### write(key, value, options?)

写入数据到 Scratchpad。

```typescript
async write(key: string, value: any, options?: WriteOptions): Promise<boolean>
```

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| key | string | ✅ | - | 键名 |
| value | any | ✅ | - | 值（JSON 可序列化） |
| options.skipLock | boolean | ❌ | false | 跳过锁检查 |
| options.metadata | object | ❌ | {} | 元数据 |

**返回：** `Promise<boolean>` - 是否成功

**示例：**

```typescript
// 基本写入
await scratchpad.write('status', 'completed');

// 带元数据
await scratchpad.write('config', { timeout: 5000 }, {
  metadata: { priority: 'high', category: 'settings' }
});

// 跳过锁（高性能场景）
await scratchpad.write('temp-data', data, { skipLock: true });
```

**事件：** 触发 `'write'` 事件

---

#### read(key, options?)

读取数据。

```typescript
async read(key: string, options?: ReadOptions): Promise<any | null>
```

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| key | string | ✅ | - | 键名 |
| options.includeMetadata | boolean | ❌ | false | 包含元数据 |

**返回：** `Promise<any | null>` - 值或 null（不存在）

**示例：**

```typescript
// 基本读取
const value = await scratchpad.read('status');

// 包含元数据
const result = await scratchpad.read('config', { includeMetadata: true });
// 返回：{ value, version, timestamp, updatedAt, workerId, metadata }
```

**事件：** 触发 `'read'` 事件

---

#### readBatch(keys)

批量读取数据。

```typescript
async readBatch(keys: string[]): Promise<Object>
```

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| keys | string[] | ✅ | 键名数组 |

**返回：** `Promise<Object>` - `{ [key]: value }`

**示例：**

```typescript
const data = await scratchpad.readBatch(['status', 'config', 'result']);
// 返回：{ status: '...', config: {...}, result: {...} }
```

---

#### delete(key)

删除数据。

```typescript
async delete(key: string): Promise<boolean>
```

**返回：** `Promise<boolean>` - 是否成功删除

**示例：**

```typescript
const deleted = await scratchpad.delete('temp-data');
```

**事件：** 触发 `'delete'` 事件

---

#### keys(options?)

列出所有键。

```typescript
keys(options?: { prefix?: string }): string[]
```

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| options.prefix | string | ❌ | '' | 键名前缀过滤 |

**返回：** `string[]`

**示例：**

```typescript
// 所有键
const allKeys = scratchpad.keys();

// 带前缀过滤
const configKeys = scratchpad.keys({ prefix: 'config.' });
```

---

#### has(key)

检查键是否存在。

```typescript
has(key: string): boolean
```

**示例：**

```typescript
if (scratchpad.has('status')) {
  const status = await scratchpad.read('status');
}
```

---

#### clear(options?)

清空数据。

```typescript
async clear(options?: { preserveHistory?: boolean }): Promise<boolean>
```

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| options.preserveHistory | boolean | ❌ | false | 保留历史记录 |

**示例：**

```typescript
// 清空所有数据
await scratchpad.clear();

// 保留历史记录
await scratchpad.clear({ preserveHistory: true });
```

**事件：** 触发 `'clear'` 事件

---

#### acquireLock(key?)

获取锁。

```typescript
async acquireLock(key?: string): Promise<boolean>
```

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| key | string | ❌ | 键名（不传则全局锁） |

**返回：** `Promise<boolean>` - 是否成功获取

**示例：**

```typescript
// 获取全局锁
const locked = await scratchpad.acquireLock();

// 获取键级锁
const keyLocked = await scratchpad.acquireLock('critical-data');

if (locked) {
  try {
    // 执行临界区操作
    await scratchpad.write('data', value, { skipLock: true });
  } finally {
    await scratchpad.releaseLock();
  }
}
```

**事件：** 触发 `'lock'` 事件

---

#### releaseLock(key?)

释放锁。

```typescript
async releaseLock(key?: string): Promise<boolean>
```

**示例：**

```typescript
await scratchpad.releaseLock();
await scratchpad.releaseLock('critical-data');
```

**事件：** 触发 `'unlock'` 事件

---

#### shareWith(targetWorkerId, options?)

共享数据给其他 Worker。

```typescript
async shareWith(targetWorkerId: string, options?: ShareOptions): Promise<boolean>
```

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| targetWorkerId | string | ✅ | - | 目标 Worker ID |
| options.keys | string[] | ❌ | null | 要共享的键（不传则全部） |
| options.merge | boolean | ❌ | true | 合并模式（false 则覆盖） |

**示例：**

```typescript
// 共享全部数据
await scratchpad.shareWith('worker-456');

// 共享指定键
await scratchpad.shareWith('worker-456', {
  keys: ['result', 'config']
});

// 覆盖模式
await scratchpad.shareWith('worker-456', {
  merge: false
});
```

**事件：** 触发 `'share'` 事件

---

#### importFrom(sourceWorkerId, options?)

从其他 Worker 导入数据。

```typescript
async importFrom(sourceWorkerId: string, options?: ImportOptions): Promise<number>
```

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| sourceWorkerId | string | ✅ | - | 源 Worker ID |
| options.keys | string[] | ❌ | null | 要导入的键（不传则全部） |
| options.overwrite | boolean | ❌ | false | 覆盖本地已存在的键 |

**返回：** `Promise<number>` - 导入的键数量

**示例：**

```typescript
// 导入全部数据（跳过已存在的键）
const count = await scratchpad.importFrom('worker-456');

// 覆盖模式
const count = await scratchpad.importFrom('worker-456', {
  overwrite: true
});

// 导入指定键
const count = await scratchpad.importFrom('worker-456', {
  keys: ['result', 'config']
});
```

**事件：** 触发 `'import'` 事件

---

#### syncWith(workerIds, options?)

同步多个 Worker 的数据。

```typescript
async syncWith(workerIds: string[], options?: SyncOptions): Promise<SyncStats>
```

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| workerIds | string[] | ✅ | - | Worker ID 列表 |
| options.strategy | string | ❌ | 'latest' | 同步策略 |
| options.masterWorkerId | string | ❌ | null | 主 Worker ID（strategy='master' 时使用） |

**同步策略：**

- `'latest'` - 每个键取最新版本
- `'merge'` - 合并所有数据，冲突时保留本地
- `'master'` - 以指定 Worker 为准（主从同步）

**返回：** `Promise<SyncStats>`

```typescript
interface SyncStats {
  synced: number;      // 同步的键数量
  conflicts: number;   // 冲突数量
  errors: Array<{ workerId: string, error: string }>;
}
```

**示例：**

```typescript
// 最新优先同步
const stats = await scratchpad.syncWith(['worker-2', 'worker-3']);

// 主从同步
const stats = await scratchpad.syncWith(['worker-2', 'worker-3'], {
  strategy: 'master',
  masterWorkerId: 'worker-1'
});

// 合并模式
const stats = await scratchpad.syncWith(['worker-2', 'worker-3'], {
  strategy: 'merge'
});
```

---

#### getHistory(key?, options?)

获取历史记录。

```typescript
getHistory(key?: string, options?: { limit?: number }): Object | Array
```

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| key | string | ❌ | null | 键名（不传则返回所有） |
| options.limit | number | ❌ | 50 | 限制返回数量 |

**示例：**

```typescript
// 获取单个键的历史
const history = scratchpad.getHistory('counter');

// 限制返回数量
const recentHistory = scratchpad.getHistory('counter', { limit: 10 });

// 获取所有历史
const allHistory = scratchpad.getHistory();
```

---

#### rollback(key, version)

回滚到指定版本。

```typescript
async rollback(key: string, version: number): Promise<boolean>
```

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| key | string | ✅ | 键名 |
| version | number | ✅ | 版本号 |

**示例：**

```typescript
// 回滚到版本 1
await scratchpad.rollback('config', 1);
```

---

#### exportJSON(options?)

导出为 JSON 字符串。

```typescript
exportJSON(options?: { 
  includeHistory?: boolean, 
  includeLocks?: boolean 
}): string
```

**示例：**

```typescript
const json = scratchpad.exportJSON({ 
  includeHistory: true, 
  includeLocks: false 
});
```

---

#### exportMarkdown()

导出为 Markdown 格式。

```typescript
exportMarkdown(): string
```

**示例：**

```typescript
const md = scratchpad.exportMarkdown();
// 生成适合阅读的 Markdown 文档
```

---

#### getStats()

获取统计信息。

```typescript
getStats(): ScratchpadStats
```

**返回：**

```typescript
interface ScratchpadStats {
  taskId: string;
  version: string;
  keyCount: number;
  totalSize: number;       // 字节数
  totalHistoryEntries: number;
  keys: string[];
  filePath: string;
  createdAt: string;       // ISO 时间戳
  updatedAt: string;       // ISO 时间戳
}
```

**示例：**

```typescript
const stats = scratchpad.getStats();
console.log(`键数量：${stats.keyCount}, 大小：${stats.totalSize} bytes`);
```

---

#### getLockStatus()

获取锁状态。

```typescript
getLockStatus(): Object
```

**返回：** 活动锁的字典

```typescript
{
  'key-name': {
    workerId: 'worker-123',
    acquiredAt: '2026-04-03T10:00:00.000Z',
    expiresAt: '2026-04-03T10:00:30.000Z',
    remainingMs: 25000
  }
}
```

---

#### cleanupExpiredLocks()

清理过期的锁。

```typescript
cleanupExpiredLocks(): number
```

**返回：** 清理的锁数量

---

### ScratchpadManager 类

集中管理多个 Scratchpad 实例。

#### 构造函数

```typescript
new ScratchpadManager(options?: ManagerOptions)
```

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| options.basePath | string | ❌ | 'temp/scratchpad' | 基础路径 |
| options.verbose | boolean | ❌ | false | 详细日志 |
| options.autoCleanup | boolean | ❌ | true | 自动清理 |
| options.cleanupIntervalMinutes | number | ❌ | 30 | 清理间隔（分钟） |

---

#### get(taskId, options?)

创建或获取 Scratchpad 实例。

```typescript
get(taskId: string, options?: ScratchpadOptions): Scratchpad
```

**示例：**

```typescript
const manager = new ScratchpadManager();

// 获取或创建 Scratchpad
const scratchpad1 = manager.get('worker-1');
const scratchpad2 = manager.get('worker-2');
```

---

#### delete(taskId)

删除 Scratchpad。

```typescript
async delete(taskId: string): Promise<boolean>
```

---

#### list()

列出所有 Scratchpad。

```typescript
list(): string[]
```

**示例：**

```typescript
const allTaskIds = manager.list();
```

---

#### getAllStats()

获取所有统计信息。

```typescript
getAllStats(): ScratchpadStats[]
```

---

#### cleanup(maxAge?)

清理过期 Scratchpad。

```typescript
async cleanup(maxAge?: number): Promise<string[]>
```

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| maxAge | number | ❌ | 86400000 | 最大年龄（毫秒） |

**返回：** 被清理的 taskId 列表

---

#### stop()

停止管理器（停止自动清理）。

```typescript
stop(): void
```

---

## 使用示例

### 示例 1：基本使用

```typescript
const { Scratchpad } = require('./scratchpad');

// 创建 Scratchpad
const scratchpad = new Scratchpad('analysis-worker-1', {
  verbose: true,
  enableHistory: true
});

// 写入数据
await scratchpad.write('status', 'analyzing');
await scratchpad.write('files', ['auth.js', 'user.js']);
await scratchpad.write('result', { 
  findings: ['找到认证模块'], 
  confidence: 0.95 
});

// 读取数据
const status = await scratchpad.read('status');
const result = await scratchpad.read('result', { includeMetadata: true });

// 列出所有键
const keys = scratchpad.keys();
console.log('所有键:', keys);

// 更新状态
await scratchpad.write('status', 'completed');
```

---

### 示例 2：跨 Worker 共享

```typescript
// Worker A: 数据分析
const workerA = new Scratchpad('worker-a');
await workerA.write('analysis', { 
  totalFiles: 100,
  analyzedFiles: 50,
  findings: [...]
});

// 共享给 Worker B
await workerA.shareWith('worker-b', {
  keys: ['analysis'],
  merge: true
});

// Worker B: 导入数据
const workerB = new Scratchpad('worker-b');
const count = await workerB.importFrom('worker-a');
console.log(`导入了 ${count} 个键`);

// Worker B: 基于分析结果继续工作
const analysis = await workerB.read('analysis');
await workerB.write('report', generateReport(analysis));

// Worker A: 同步 Worker B 的结果
await workerA.syncWith(['worker-b'], { strategy: 'latest' });
const report = await workerA.read('report');
```

---

### 示例 3：并发安全

```typescript
const scratchpad = new Scratchpad('shared-worker');

// 场景：多个 Worker 同时写入共享配置
async function updateConfig(newConfig) {
  // 获取锁
  const locked = await scratchpad.acquireLock('config');
  
  if (!locked) {
    console.log('配置被其他 Worker 锁定，等待重试...');
    await sleep(1000);
    return updateConfig(newConfig); // 重试
  }
  
  try {
    // 读取现有配置
    const existing = await scratchpad.read('config');
    
    // 合并配置
    const merged = { ...existing, ...newConfig };
    
    // 写入（跳过锁检查，因为已持有锁）
    await scratchpad.write('config', merged, { skipLock: true });
    
    console.log('配置更新成功');
  } finally {
    // 释放锁
    await scratchpad.releaseLock('config');
  }
}

// 并发执行
await Promise.all([
  updateConfig({ timeout: 5000 }),
  updateConfig({ retries: 3 }),
  updateConfig({ debug: true })
]);
```

---

### 示例 4：使用管理器

```typescript
const { ScratchpadManager } = require('./scratchpad');

// 创建管理器
const manager = new ScratchpadManager({
  verbose: true,
  autoCleanup: true,
  cleanupIntervalMinutes: 60
});

// 获取多个 Worker 的 Scratchpad
const worker1 = manager.get('worker-1');
const worker2 = manager.get('worker-2');
const worker3 = manager.get('worker-3');

// 并行写入
await Promise.all([
  worker1.write('data', 'Worker 1 的数据'),
  worker2.write('data', 'Worker 2 的数据'),
  worker3.write('data', 'Worker 3 的数据')
]);

// 列出所有
console.log('所有 Worker:', manager.list());

// 获取统计
const stats = manager.getAllStats();
console.log('统计信息:', stats);

// 清理过期数据（手动）
const cleaned = await manager.cleanup(3600000); // 清理 1 小时前的
console.log('清理了:', cleaned);

// 停止管理器（程序退出前）
manager.stop();
```

---

### 示例 5：历史记录与回滚

```typescript
const scratchpad = new Scratchpad('config-worker', {
  enableHistory: true
});

// 多次修改配置
await scratchpad.write('config', { version: 1, timeout: 3000 });
await scratchpad.write('config', { version: 2, timeout: 5000 });
await scratchpad.write('config', { version: 3, timeout: 7000 });

// 查看历史
const history = scratchpad.getHistory('config');
console.log('历史记录:', history);
// [
//   { action: 'create', oldValue: null, newValue: {...} },
//   { action: 'update', oldValue: {...}, newValue: {...} },
//   { action: 'update', oldValue: {...}, newValue: {...} }
// ]

// 回滚到版本 1
await scratchpad.rollback('config', 1);

// 验证回滚
const config = await scratchpad.read('config');
console.log('回滚后的配置:', config); // { version: 1, timeout: 3000 }
```

---

### 示例 6：事件监听

```typescript
const scratchpad = new Scratchpad('event-worker', { verbose: true });

// 监听写入事件
scratchpad.on('write', ({ key, value, version }) => {
  console.log(`数据写入：${key} (v${version})`);
});

// 监听读取事件
scratchpad.on('read', ({ key, value }) => {
  console.log(`数据读取：${key}`);
});

// 监听删除事件
scratchpad.on('delete', ({ key, oldValue }) => {
  console.log(`数据删除：${key}`);
});

// 监听锁事件
scratchpad.on('lock', ({ key }) => {
  console.log(`获取锁：${key}`);
});

scratchpad.on('unlock', ({ key }) => {
  console.log(`释放锁：${key}`);
});

// 触发事件
await scratchpad.write('test', 'data');
await scratchpad.read('test');
await scratchpad.delete('test');
```

---

### 示例 7：多 Worker 协作流水线

```typescript
const { ScratchpadManager } = require('./scratchpad');

async function collaborativePipeline() {
  const manager = new ScratchpadManager({ verbose: true });
  
  // Worker 1: 数据收集
  const collector = manager.get('collector');
  await collector.write('raw-data', await fetchData());
  await collector.write('status', 'collection-complete');
  
  // Worker 2: 数据分析（导入收集的数据）
  const analyzer = manager.get('analyzer');
  await analyzer.importFrom('collector');
  const rawData = await analyzer.read('raw-data');
  const analysis = analyzeData(rawData);
  await analyzer.write('analysis', analysis);
  await analyzer.write('status', 'analysis-complete');
  
  // Worker 3: 报告生成（同步所有数据）
  const reporter = manager.get('reporter');
  await reporter.syncWith(['collector', 'analyzer'], { strategy: 'latest' });
  
  const allData = await reporter.readBatch(['raw-data', 'analysis']);
  const report = generateReport(allData);
  await reporter.write('final-report', report);
  
  // 导出最终报告
  const markdown = reporter.exportMarkdown();
  console.log(markdown);
  
  // 清理
  manager.stop();
}

collaborativePipeline().catch(console.error);
```

---

## 最佳实践

### 1. 键名命名规范

```typescript
// ✅ 好的命名
await scratchpad.write('config.database.timeout', 5000);
await scratchpad.write('analysis.result.findings', [...]);
await scratchpad.write('status.current', 'running');

// ❌ 避免模糊命名
await scratchpad.write('data', {...});  // 太宽泛
await scratchpad.write('temp', {...});  // 不明确
```

### 2. 合理使用锁

```typescript
// ✅ 需要并发控制的场景
async function updateSharedResource(data) {
  if (await scratchpad.acquireLock('shared-resource')) {
    try {
      await scratchpad.write('shared-resource', data, { skipLock: true });
    } finally {
      await scratchpad.releaseLock('shared-resource');
    }
  }
}

// ❌ 不需要锁的场景（独立数据）
await scratchpad.write('local-temp-data', data);  // 无需锁
```

### 3. 元数据使用

```typescript
// ✅ 添加有意义的元数据
await scratchpad.write('config', { timeout: 5000 }, {
  metadata: {
    category: 'settings',
    priority: 'high',
    owner: 'config-worker',
    tags: ['performance', 'network']
  }
});
```

### 4. 批量操作

```typescript
// ✅ 批量读取（减少 I/O）
const data = await scratchpad.readBatch(['key1', 'key2', 'key3']);

// ✅ 批量写入（使用 Promise.all）
await Promise.all([
  scratchpad.write('key1', value1),
  scratchpad.write('key2', value2),
  scratchpad.write('key3', value3)
]);
```

### 5. 历史记录管理

```typescript
// ✅ 启用历史记录（重要数据）
const criticalScratchpad = new Scratchpad('critical', {
  enableHistory: true
});

// ✅ 禁用历史记录（临时数据，节省空间）
const tempScratchpad = new Scratchpad('temp', {
  enableHistory: false
});
```

### 6. 错误处理

```typescript
const { ScratchpadError } = require('./scratchpad');

try {
  await scratchpad.write('data', value);
} catch (error) {
  if (error instanceof ScratchpadError) {
    switch (error.code) {
      case 'LOCK_CONFLICT':
        console.log('锁冲突，稍后重试');
        await sleep(1000);
        break;
      case 'SOURCE_NOT_FOUND':
        console.log('源 Scratchpad 不存在');
        break;
      default:
        console.error('Scratchpad 错误:', error.message);
    }
  } else {
    throw error; // 其他错误继续抛出
  }
}
```

### 7. 定期清理

```typescript
const manager = new ScratchpadManager({
  autoCleanup: true,
  cleanupIntervalMinutes: 30  // 每 30 分钟清理一次
});

// 或者手动清理
setInterval(async () => {
  const cleaned = await manager.cleanup(3600000); // 清理 1 小时前的
  console.log(`清理了 ${cleaned.length} 个过期 Scratchpad`);
}, 3600000); // 每小时执行一次
```

---

## 故障排查

### 问题 1：锁冲突

**现象：** `LOCK_CONFLICT` 错误

**解决方案：**

```typescript
// 1. 检查锁状态
const lockStatus = scratchpad.getLockStatus();
console.log('活动锁:', lockStatus);

// 2. 清理过期锁
const cleaned = scratchpad.cleanupExpiredLocks();
console.log(`清理了 ${cleaned} 个过期锁`);

// 3. 使用重试机制
async function writeWithRetry(key, value, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await scratchpad.write(key, value);
    } catch (error) {
      if (error.code === 'LOCK_CONFLICT' && i < maxRetries - 1) {
        await sleep(1000 * (i + 1)); // 指数退避
        continue;
      }
      throw error;
    }
  }
}
```

---

### 问题 2：数据丢失

**现象：** 读取返回 null，但之前写入过

**排查步骤：**

```typescript
// 1. 检查键名是否正确
const exists = scratchpad.has('your-key');
console.log('键是否存在:', exists);

// 2. 列出所有键
const keys = scratchpad.keys();
console.log('所有键:', keys);

// 3. 检查文件是否存在
const fs = require('fs');
const path = require('path');
const filePath = path.join('temp/scratchpad', 'your-task-id.json');
console.log('文件存在:', fs.existsSync(filePath));

// 4. 查看文件内容
if (fs.existsSync(filePath)) {
  const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  console.log('文件内容:', content);
}
```

---

### 问题 3：性能问题

**现象：** 读写操作缓慢

**优化建议：**

```typescript
// 1. 禁用详细日志
const scratchpad = new Scratchpad('task', { verbose: false });

// 2. 对于临时数据，禁用历史记录
const tempScratchpad = new Scratchpad('temp', { enableHistory: false });

// 3. 使用批量操作
const data = await scratchpad.readBatch(['key1', 'key2', 'key3']);

// 4. 对于高频写入，使用 skipLock（确保无并发冲突）
await scratchpad.write('temp', data, { skipLock: true });
```

---

### 问题 4：文件损坏

**现象：** 加载失败，JSON 解析错误

**解决方案：**

```typescript
// Scratchpad 会自动处理，创建新的空数据
// 如需手动恢复：

const fs = require('fs');
const path = require('path');

const filePath = path.join('temp/scratchpad', 'your-task-id.json');

// 1. 备份损坏文件
if (fs.existsSync(filePath)) {
  fs.copyFileSync(filePath, filePath + '.bak');
}

// 2. 删除损坏文件
fs.unlinkSync(filePath);

// 3. 重新创建 Scratchpad
const scratchpad = new Scratchpad('your-task-id');
```

---

## 版本历史

### v2.0.0 (当前版本)

- ✨ 新增版本控制（每个条目自动追踪版本）
- ✨ 新增历史记录（完整审计追踪）
- ✨ 新增回滚功能（可恢复到历史版本）
- ✨ 增强锁机制（支持键级锁和自动过期）
- ✨ 新增同步策略（latest/merge/master）
- ✨ 新增元数据支持
- ✨ 增强错误处理（ScratchpadError 带错误码）
- ✨ 原子写入（防止文件损坏）
- 🐛 修复并发安全问题
- 📈 性能优化

### v1.0.0

- 初始版本
- 基本读写操作
- 文件持久化
- 简单的跨 Worker 共享

---

## 许可证

MIT License

---

## 支持

如有问题，请提交 Issue 或联系开发团队。
