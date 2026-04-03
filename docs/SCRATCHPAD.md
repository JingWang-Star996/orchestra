# Orchestra Scratchpad 系统

跨 Worker 知识共享系统，提供统一的键值对存储接口。

## 🎯 核心功能

- ✅ **键值对存储** - 支持文本、代码、文件引用、JSON 数据
- ✅ **跨 Worker 共享** - 所有 Worker 可读写同一数据源
- ✅ **持久化** - 文件系统存储，JSON 格式
- ✅ **并发安全** - 基于文件锁的并发控制
- ✅ **自动保存** - 可配置的自动保存间隔
- ✅ **元数据追踪** - 记录创建者、更新者、时间戳

## 📦 数据类型

```typescript
type ScratchpadValue = 
  | { type: 'text'; content: string }           // 文本
  | { type: 'code'; language: string; content: string }  // 代码
  | { type: 'file'; path: string; description?: string } // 文件引用
  | { type: 'json'; data: any };                // JSON 数据
```

## 🚀 快速开始

### 基础使用

```typescript
import { createScratchpad } from './scratchpad';

const scratchpad = createScratchpad();

// 写入数据
await scratchpad.write('notes', {
  type: 'text',
  content: '会议记录：讨论了下季度的产品规划'
});

// 读取数据
const notes = await scratchpad.read('notes');
console.log(notes?.content); // "会议记录：..."

// 列出所有键
const keys = await scratchpad.list();
console.log(keys); // ['notes']

// 删除
await scratchpad.delete('notes');

// 清空
await scratchpad.clear();
```

### 跨 Worker 共享

```typescript
// Worker A
const workerA = createWorkerScratchpad('worker-A');
await workerA.write('task-result', {
  type: 'json',
  data: { processed: true, count: 100 }
});

// Worker B（读取 Worker A 的数据）
const workerB = createWorkerScratchpad('worker-B');
const result = await workerB.read('task-result');
console.log(result?.data.count); // 100
```

### Coordinator 完全控制

```typescript
import { createCoordinatorScratchpad } from './scratchpad';

const coordinator = createCoordinatorScratchpad();

// 查看所有条目（含元数据）
const keys = await coordinator.list();
for (const key of keys) {
  const entry = await coordinator.getEntry(key);
  console.log(`${key}:`);
  console.log(`  创建者：${entry?.createdBy}`);
  console.log(`  更新时间：${new Date(entry?.updatedAt || 0)}`);
}

// 导出备份
const backup = await coordinator.export();
fs.writeFileSync('backup.json', JSON.stringify(backup));

// 导入恢复
const restore = JSON.parse(fs.readFileSync('backup.json', 'utf-8'));
await coordinator.import(restore);
```

## 📖 API 参考

### 写入数据

```typescript
write(key: string, value: ScratchpadValue): Promise<void>
```

**示例：**

```typescript
// 文本
await scratchpad.write('readme', {
  type: 'text',
  content: '项目说明文档'
});

// 代码
await scratchpad.write('api-endpoint', {
  type: 'code',
  language: 'typescript',
  content: `
    const response = await fetch('/api/data');
    const data = await response.json();
  `
});

// 文件引用
await scratchpad.write('config', {
  type: 'file',
  path: '/home/user/.openclaw/workspace/config.json',
  description: '主配置文件'
});

// JSON 数据
await scratchpad.write('user-preferences', {
  type: 'json',
  data: {
    theme: 'dark',
    language: 'zh-CN',
    notifications: true
  }
});
```

### 读取数据

```typescript
read(key: string): Promise<ScratchpadValue | undefined>
getEntry(key: string): Promise<ScratchpadEntry | undefined>
```

**区别：**
- `read()` 只返回值
- `getEntry()` 返回完整条目（包含元数据）

```typescript
const value = await scratchpad.read('key');
console.log(value?.content);

const entry = await scratchpad.getEntry('key');
console.log(entry?.createdBy);
console.log(entry?.updatedAt);
```

### 列出键

```typescript
list(): Promise<string[]>
```

### 删除

```typescript
delete(key: string): Promise<boolean>
clear(): Promise<void>
```

### 导入导出

```typescript
export(): Promise<ScratchpadData>
import(data: ScratchpadData): Promise<void>
```

## ⚙️ 配置选项

```typescript
interface ScratchpadConfig {
  storagePath: string;        // 存储文件路径
  autoSaveInterval: number;   // 自动保存间隔（毫秒），0 表示禁用
  workerId: string;           // Worker ID
  enableLock: boolean;        // 是否启用文件锁
}
```

**自定义配置：**

```typescript
const scratchpad = createScratchpad({
  storagePath: '/custom/path/scratchpad.json',
  autoSaveInterval: 10000,    // 10 秒自动保存
  workerId: 'my-worker',
  enableLock: true
});
```

## 🔒 并发安全

Scratchpad 使用文件锁机制确保并发安全：

1. **写前加锁** - 写入数据前获取独占锁
2. **原子写入** - 先写临时文件，再重命名
3. **锁超时重试** - 最多重试 10 次，每次间隔 50ms

**注意：** 测试时可禁用锁（`enableLock: false`）以提高性能。

## 💾 持久化

- **存储格式：** JSON
- **存储位置：** `workspace/orchestra/data/scratchpad.json`（默认）
- **自动保存：** 每 5 秒保存一次（可配置）
- **进程退出：** 自动保存未保存的更改

## 📊 数据结构

```typescript
interface ScratchpadData {
  entries: Record<string, ScratchpadEntry>;
  version: string;
  lastSaved: number;
}

interface ScratchpadEntry {
  key: string;
  value: ScratchpadValue;
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
  updatedBy?: string;
}
```

## 🧪 测试

运行单元测试：

```bash
cd /home/z3129119/.openclaw/workspace/orchestra
npm test -- scratchpad.test.ts
```

## 🎯 使用场景

### 1. Worker 间传递数据

```typescript
// Worker A 处理数据
await workerA.write('processed-data', {
  type: 'json',
  data: { items: [...], count: 100 }
});

// Worker B 读取并继续处理
const data = await workerB.read('processed-data');
```

### 2. 共享配置

```typescript
// Coordinator 设置配置
await coordinator.write('global-config', {
  type: 'json',
  data: { maxWorkers: 5, timeout: 30000 }
});

// Worker 读取配置
const config = await worker.read('global-config');
```

### 3. 代码片段共享

```typescript
await scratchpad.write('utils', {
  type: 'code',
  language: 'typescript',
  content: `
    export function formatDate(date: Date): string {
      return date.toISOString().split('T')[0];
    }
  `
});
```

### 4. 文件引用

```typescript
await scratchpad.write('input-file', {
  type: 'file',
  path: '/data/input.csv',
  description: '输入数据文件'
});
```

## 🔧 工厂函数

```typescript
// 默认 Scratchpad
createScratchpad(config?: Partial<ScratchpadConfig>)

// Coordinator 专用
createCoordinatorScratchpad(config?: Partial<ScratchpadConfig>)

// Worker 专用
createWorkerScratchpad(workerId: string, config?: Partial<ScratchpadConfig>)
```

## 📝 最佳实践

1. **键名规范** - 使用有意义的键名，如 `module-purpose` 格式
2. **定期清理** - 使用 `delete()` 删除不再需要的数据
3. **备份重要数据** - 使用 `export()` 定期备份
4. **合理配置自动保存** - 根据数据重要性调整间隔
5. **并发场景启用锁** - 多 Worker 环境务必启用文件锁

---

**版本：** 1.0.0  
**作者：** Orchestra AI System  
**位置：** `/home/z3129119/.openclaw/workspace/orchestra/src/scratchpad.ts`
