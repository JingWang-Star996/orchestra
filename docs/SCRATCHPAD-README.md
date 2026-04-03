# Scratchpad 跨 Worker 知识共享系统

> Orchestra Phase 2 核心功能 - 为多 Worker 协作提供持久化存储和知识共享能力

## 📖 简介

Scratchpad 是一个专为 Orchestra Worker 管理系统设计的键值对存储系统，灵感来自 Claude Code Coordinator 的 Scratchpad 设计。它解决了多 Worker 协作中的核心问题：

- ❌ **问题**：Worker 之间无法共享信息，形成信息孤岛
- ❌ **问题**：任务中断后无法恢复，丢失进度
- ❌ **问题**：并发写入导致数据冲突
- ✅ **解决**：统一的持久化存储，支持跨 Worker 共享和同步

## 🎯 核心特性

| 特性 | 说明 | 状态 |
|------|------|------|
| 键值对存储 | 支持任意 JSON 数据 | ✅ |
| 文件持久化 | 自动保存到文件系统 | ✅ |
| 跨 Worker 共享 | Worker 之间共享数据 | ✅ |
| 数据同步 | 多 Worker 数据同步（3 种策略） | ✅ |
| 并发安全 | 文件锁机制，防止冲突 | ✅ |
| 版本控制 | 自动追踪数据版本 | ✅ |
| 历史记录 | 完整的变更历史 | ✅ |
| 回滚功能 | 恢复到历史版本 | ✅ |
| 事件驱动 | 监听数据变更事件 | ✅ |
| 自动清理 | 定期清理过期数据 | ✅ |

## 📦 安装

Scratchpad 已集成到 Orchestra 系统中，无需单独安装。

```javascript
const { Scratchpad, ScratchpadManager } = require('./scratchpad');
```

## 🚀 快速开始

### 5 分钟上手

```javascript
const { Scratchpad } = require('./scratchpad');

// 1. 创建 Scratchpad
const scratchpad = new Scratchpad('my-worker-123', {
  verbose: true,  // 显示详细日志
  enableHistory: true  // 启用历史记录
});

// 2. 写入数据
await scratchpad.write('status', 'analyzing');
await scratchpad.write('files', ['auth.js', 'user.js']);
await scratchpad.write('result', { 
  findings: ['找到认证模块'], 
  confidence: 0.95 
});

// 3. 读取数据
const status = await scratchpad.read('status');
console.log('当前状态:', status);

const result = await scratchpad.read('result');
console.log('分析结果:', result);

// 4. 列出所有键
const keys = scratchpad.keys();
console.log('所有键:', keys);  // ['status', 'files', 'result']

// 5. 共享给其他 Worker
await scratchpad.shareWith('my-worker-456');
```

### 跨 Worker 协作示例

```javascript
// Worker A: 数据分析
const workerA = new Scratchpad('worker-a');
await workerA.write('analysis', { total: 100, completed: 50 });
await workerA.shareWith('worker-b');

// Worker B: 导入并继续
const workerB = new Scratchpad('worker-b');
await workerB.importFrom('worker-a');
const analysis = await workerB.read('analysis');
await workerB.write('report', generateReport(analysis));

// Worker A: 同步结果
await workerA.syncWith(['worker-b'], { strategy: 'latest' });
const report = await workerA.read('report');
```

## 📚 详细文档

- **[API 完整文档](./SCRATCHPAD-API.md)** - 包含所有方法、参数和示例
- [使用示例](#使用示例)
- [最佳实践](#最佳实践)

## 🏗️ 架构设计

### 数据结构

```
temp/scratchpad/
├── worker-1.json      # Worker 1 的 Scratchpad
├── worker-2.json      # Worker 2 的 Scratchpad
├── worker-3.json      # Worker 3 的 Scratchpad
└── ...
```

### 文件格式

每个 Scratchpad 文件包含：

```json
{
  "version": "2.0.0",
  "taskId": "worker-123",
  "createdAt": 1712137200000,
  "updatedAt": 1712137260000,
  "entries": {
    "key-name": {
      "value": { ... },           // 实际数据
      "version": 3,               // 版本号
      "timestamp": "2026-04-03T10:00:00.000Z",
      "updatedAt": 1712137260000,
      "workerId": "worker-123",
      "metadata": { ... }
    }
  },
  "history": { ... },             // 历史记录
  "locks": { ... }                // 锁信息
}
```

## 使用示例

### 示例 1：任务进度持久化

```javascript
const scratchpad = new Scratchpad('long-running-task');

// 保存进度
await scratchpad.write('progress', {
  current: 50,
  total: 100,
  stage: 'analyzing',
  startTime: Date.now()
});

// 恢复进度
const progress = await scratchpad.read('progress');
console.log(`进度：${progress.current}/${progress.total}`);
```

### 示例 2：并发安全写入

```javascript
async function safeUpdate(key, value) {
  const locked = await scratchpad.acquireLock(key);
  
  if (!locked) {
    console.log('数据被锁定，稍后重试');
    return false;
  }
  
  try {
    await scratchpad.write(key, value, { skipLock: true });
    return true;
  } finally {
    await scratchpad.releaseLock(key);
  }
}
```

### 示例 3：使用管理器

```javascript
const { ScratchpadManager } = require('./scratchpad');

const manager = new ScratchpadManager({
  verbose: true,
  autoCleanup: true,
  cleanupIntervalMinutes: 60
});

// 获取多个 Worker 的 Scratchpad
const worker1 = manager.get('worker-1');
const worker2 = manager.get('worker-2');

// 批量操作
await Promise.all([
  worker1.write('data', 'Worker 1'),
  worker2.write('data', 'Worker 2')
]);

// 查看统计
const stats = manager.getAllStats();
console.log('统计:', stats);
```

### 示例 4：历史与回滚

```javascript
const scratchpad = new Scratchpad('config-worker');

// 多次修改
await scratchpad.write('config', { v: 1, timeout: 3000 });
await scratchpad.write('config', { v: 2, timeout: 5000 });
await scratchpad.write('config', { v: 3, timeout: 7000 });

// 查看历史
const history = scratchpad.getHistory('config');
console.log('历史:', history);

// 回滚到版本 1
await scratchpad.rollback('config', 1);
```

## 最佳实践

### ✅ 推荐做法

1. **使用有意义的键名**
   ```javascript
   // ✅ 好
   await scratchpad.write('config.database.timeout', 5000);
   
   // ❌ 避免
   await scratchpad.write('data', {...});
   ```

2. **合理使用锁**
   ```javascript
   // 仅在并发场景使用锁
   if (await scratchpad.acquireLock('shared-key')) {
     try {
       await scratchpad.write('shared-key', data, { skipLock: true });
     } finally {
       await scratchpad.releaseLock('shared-key');
     }
   }
   ```

3. **启用历史记录（重要数据）**
   ```javascript
   const critical = new Scratchpad('critical', {
     enableHistory: true
   });
   ```

4. **批量操作**
   ```javascript
   // 批量读取
   const data = await scratchpad.readBatch(['key1', 'key2', 'key3']);
   ```

### ❌ 避免的做法

1. **不要存储大文件** - Scratchpad 适合存储 JSON 数据，大文件请用文件系统
2. **不要频繁写入** - 合并多次写入为一次批量写入
3. **不要忘记释放锁** - 始终在 finally 块中释放锁

## 测试

运行内置测试：

```bash
node orchestra/scratchpad.js
```

这将执行完整的测试套件，包括：

1. ✅ 基本读写操作
2. ✅ 带元数据的写入
3. ✅ 历史记录
4. ✅ 共享与导入
5. ✅ 多 Worker 同步
6. ✅ 锁机制
7. ✅ 导出功能
8. ✅ 管理器
9. ✅ 统计信息

## 与 Orchestra 集成

Scratchpad 已集成到 Orchestra Worker 管理系统中：

```javascript
// 在 Worker 中使用
const { Scratchpad } = require('./scratchpad');

async function workerFunction(taskId) {
  const scratchpad = new Scratchpad(taskId);
  
  // Worker 的工作逻辑
  await scratchpad.write('status', 'working');
  const result = await doWork();
  await scratchpad.write('result', result);
  await scratchpad.write('status', 'completed');
  
  return result;
}
```

## 性能考虑

- **读写速度**: ~1-5ms（取决于数据大小）
- **文件大小**: 建议单个 Scratchpad < 1MB
- **并发**: 支持多进程并发访问（通过文件锁）
- **清理**: 建议定期清理过期 Scratchpad（默认 24 小时）

## 故障排查

### 常见问题

**Q: 遇到 `LOCK_CONFLICT` 错误**

A: 使用重试机制：
```javascript
async function writeWithRetry(key, value, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await scratchpad.write(key, value);
    } catch (e) {
      if (e.code === 'LOCK_CONFLICT') {
        await sleep(1000 * (i + 1));
        continue;
      }
      throw e;
    }
  }
}
```

**Q: 数据丢失**

A: 检查：
1. 键名是否正确
2. 文件是否存在（`temp/scratchpad/{taskId}.json`）
3. 是否使用了正确的 taskId

**Q: 性能缓慢**

A: 优化：
1. 禁用 verbose 日志
2. 临时数据禁用历史记录
3. 使用批量操作

## 版本历史

- **v2.0.0** (当前) - 版本控制、历史记录、回滚、增强锁机制
- **v1.0.0** - 初始版本，基本读写和共享

## 许可证

MIT License

---

**开发团队**: Orchestra Core Team  
**文档**: [SCRATCHPAD-API.md](./SCRATCHPAD-API.md)  
**示例**: 运行 `node orchestra/scratchpad.js` 查看完整测试
