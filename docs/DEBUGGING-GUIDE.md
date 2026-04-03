# Orchestra 调试指南

> 工具调用追踪与性能分析完全指南

## 📖 目录

- [快速开始](#快速开始)
- [工具追踪器](#工具追踪器)
- [活动描述生成器](#活动描述生成器)
- [调试技巧](#调试技巧)
- [性能分析](#性能分析)
- [故障排查](#故障排查)
- [最佳实践](#最佳实践)

---

## 🚀 快速开始

### 1. 基础使用

```javascript
const { ToolTracker, ActivityDescriber } = require('./orchestra/toolTracker');

// 创建追踪器和描述器
const tracker = new ToolTracker({ verbose: true });
const describer = new ActivityDescriber({ language: 'zh-CN' });

// 包装工具函数
const trackedRead = tracker.wrap('read', originalReadFn, '读取配置文件');

// 或者手动记录
const callId = tracker.startCall('web_search', '搜索相关信息', { query: 'AI 趋势' });
try {
  const result = await webSearch('AI 趋势');
  tracker.endCall(callId, { count: result.length });
} catch (error) {
  tracker.endCall(callId, {}, error);
}
```

### 2. 查看状态

```javascript
// 获取性能报告
const report = tracker.getPerformanceReport();
console.log(report.summary);

// 获取时间线
const timeline = tracker.getTimeline();

// 获取错误追踪
const errors = tracker.getErrorTraces();

// 生成人类可读摘要
console.log(tracker.generateSummary());
```

---

## 🔧 工具追踪器 (ToolTracker)

### 配置选项

```javascript
const tracker = new ToolTracker({
  maxRecords: 10000,           // 最大记录数
  verbose: false,              // 详细日志
  logToFile: true,             // 写入文件
  logPath: './logs/trace.json', // 日志路径
  performanceThreshold: 1000   // 性能阈值 (ms)
});
```

### API 参考

#### 记录调用

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `startCall(toolName, description, input)` | 工具名、描述、输入 | `callId` | 开始记录调用 |
| `endCall(callId, output, error)` | 调用 ID、输出、错误 | - | 结束记录调用 |
| `wrap(toolName, toolFn, description)` | 工具名、函数、描述 | `Function` | 自动包装函数 |

#### 查询数据

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `getTimeline()` | - | `Array` | 获取调用时间线 |
| `getPerformanceReport()` | - | `Object` | 获取性能报告 |
| `getErrorTraces()` | - | `Array` | 获取错误堆栈 |
| `getRecentCalls(limit)` | 数量限制 | `Array` | 获取最近调用 |
| `getByTool(toolName)` | 工具名 | `Array` | 按工具筛选 |

#### 事件监听

```javascript
tracker.on('call:start', (record) => {
  console.log(`开始：${record.toolName}`);
});

tracker.on('call:end', (record) => {
  console.log(`结束：${record.toolName} (${record.duration}ms)`);
});

tracker.on('performance:warning', (data) => {
  console.warn(`性能警告：${data.toolName} 耗时 ${data.duration}ms`);
});

tracker.on('clear', () => {
  console.log('记录已清空');
});
```

### 记录数据结构

```javascript
{
  callId: 'read_1712134567890_abc123',
  toolName: 'read',
  description: '读取配置文件',
  input: { path: 'config.json' },
  output: { length: 1024 },
  startTime: 1712134567890,
  endTime: 1712134567940,
  duration: 50,
  timestamp: '2026-04-03T12:34:56.789Z',
  status: 'completed', // in_progress | completed | error
  stack: 'Error: ...', // 仅在 verbose 模式
  performanceWarning: false,
  error: null // 错误时包含 { message, name, stack }
}
```

---

## 📝 活动描述生成器 (ActivityDescriber)

### 配置选项

```javascript
const describer = new ActivityDescriber({
  language: 'zh-CN',           // 语言
  verbose: false,              // 详细日志
  customTemplates: {}          // 自定义模板
});
```

### 生成描述

```javascript
// 进度描述
describer.describeProgress('read', { path: 'src/main.js' });
// → "正在读取 src/main.js..."

// 完成描述
describer.describeComplete('read', { path: 'src/main.js', length: 1024 });
// → "已读取文件 src/main.js（1024 字节）"

// 错误描述
describer.describeError('read', new Error('权限不足'), { path: 'secret.txt' });
// → "读取文件 secret.txt 失败：权限不足"
```

### 自定义模板

```javascript
// 添加新工具模板
describer.addTemplate('my_tool', {
  default: '正在处理 {data}...',
  completed: '处理完成：{result} 条数据',
  error: '处理失败：{error}'
});

// 批量加载模板
describer.loadTemplates({
  'zh-CN': {
    'custom_api': {
      default: '调用 {endpoint}...',
      completed: 'API 调用成功',
      error: 'API 调用失败：{error}'
    }
  },
  'en-US': {
    'custom_api': {
      default: 'Calling {endpoint}...',
      completed: 'API call succeeded',
      error: 'API call failed: {error}'
    }
  }
});

// 切换语言
describer.setLanguage('en-US');
```

### 内置工具模板

已支持的工具类型：

- **文件操作**: `read`, `write`, `edit`
- **网络操作**: `web_search`, `web_fetch`
- **系统操作**: `exec`
- **消息操作**: `message`
- **飞书操作**: `feishu_create_doc`, `feishu_update_doc`, `feishu_sheet`, `feishu_bitable_app_table_record`

---

## 🐛 调试技巧

### 1. 启用详细模式

```javascript
const tracker = new ToolTracker({ verbose: true });
```

输出示例：
```
[ToolTracker] 开始调用 read: 读取配置文件
  → 开始：read
[ToolTracker] 结束调用 read: 45ms ✅
  ← 结束：read (45ms)
```

### 2. 查看调用堆栈

在 verbose 模式下，每个调用会记录堆栈信息：

```javascript
const tracker = new ToolTracker({ verbose: true });
const callId = tracker.startCall('read', '调试用', { path: 'test.js' });

// 查看记录
const records = tracker.getByTool('read');
console.log(records[0].stack); // 完整调用堆栈
```

### 3. 实时监听

```javascript
tracker.on('call:end', (record) => {
  if (record.duration > 500) {
    console.warn(`慢调用：${record.toolName} (${record.duration}ms)`);
    console.log('输入:', record.input);
    console.log('堆栈:', record.stack);
  }
});
```

### 4. 导出日志分析

```javascript
// 导出为 JSON
const json = tracker.exportJSON();
fs.writeFileSync('debug-trace.json', json);

// 或启用自动写入文件
const tracker = new ToolTracker({
  logToFile: true,
  logPath: './logs/tool-trace.json'
});
```

---

## 📊 性能分析

### 性能报告

```javascript
const report = tracker.getPerformanceReport();

// 报告结构
{
  summary: {
    totalCalls: 150,
    totalDuration: 45000,
    avgDuration: 300,
    errorCount: 3,
    errorRate: 2.0,
    activeCalls: 0
  },
  toolStats: [
    {
      toolName: 'web_search',
      callCount: 20,
      avgDuration: 850,
      maxDuration: 2100,
      errorRate: 5.0,
      totalDuration: 17000
    },
    // ...
  ],
  bottlenecks: [
    { toolName: 'web_search', avgDuration: 850, callCount: 20 }
  ],
  timestamp: '2026-04-03T12:34:56.789Z'
}
```

### 识别性能瓶颈

```javascript
const report = tracker.getPerformanceReport();

console.log('=== 性能瓶颈 ===');
report.bottlenecks.forEach(b => {
  console.log(`${b.toolName}: 平均 ${b.avgDuration}ms`);
});

console.log('=== 工具排行 (按平均耗时) ===');
report.toolStats.slice(0, 5).forEach((t, i) => {
  console.log(`${i + 1}. ${t.toolName}: ${t.avgDuration}ms (${t.callCount}次)`);
});
```

### 性能优化建议

| 问题 | 可能原因 | 解决方案 |
|------|----------|----------|
| 某工具平均耗时高 | 网络延迟/大文件 | 添加缓存、分页加载 |
| 错误率高 | API 不稳定/参数错误 | 增加重试、参数验证 |
| 频繁调用同一工具 | 代码逻辑问题 | 批量处理、结果缓存 |
| 内存占用高 | 记录过多 | 降低 maxRecords、定期 clear |

---

## 🔍 故障排查

### 常见问题

#### 1. 找不到调用记录

```javascript
// 问题：endCall 时 callId 不存在
tracker.endCall('invalid_id', {});

// 解决：确保 startCall 和 endCall 配对
const callId = tracker.startCall('read', '...', {});
try {
  // ... 执行操作
  tracker.endCall(callId, { result });
} catch (error) {
  tracker.endCall(callId, {}, error);
}
```

#### 2. 性能警告频繁

```javascript
// 调整性能阈值
const tracker = new ToolTracker({
  performanceThreshold: 2000 // 从 1000ms 调整到 2000ms
});

// 或针对特定工具忽略
tracker.on('performance:warning', (data) => {
  if (data.toolName === 'web_search') {
    return; // 网络搜索本来就慢
  }
  console.warn(data);
});
```

#### 3. 日志文件未生成

```javascript
// 检查路径权限
const tracker = new ToolTracker({
  logToFile: true,
  logPath: '/absolute/path/to/logs/trace.json'
});

// 确保目录存在
const path = require('path');
const fs = require('fs');
const logDir = path.dirname(tracker.config.logPath);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}
```

#### 4. 内存泄漏

```javascript
// 定期清理旧记录
setInterval(() => {
  const report = tracker.getPerformanceReport();
  if (report.summary.totalCalls > 5000) {
    console.log('清理旧记录...');
    tracker.clear();
  }
}, 3600000); // 每小时检查
```

### 错误堆栈分析

```javascript
const errors = tracker.getErrorTraces();

errors.forEach(err => {
  console.log(`\n=== ${err.toolName} ===`);
  console.log(`时间：${err.timestamp}`);
  console.log(`错误：${err.error.message}`);
  console.log(`类型：${err.error.name}`);
  console.log(`输入：`, err.input);
  console.log(`堆栈:\n${err.error.stack}`);
});
```

---

## ✨ 最佳实践

### 1. 生产环境配置

```javascript
const tracker = new ToolTracker({
  maxRecords: 5000,           // 限制记录数
  verbose: false,             // 关闭详细日志
  logToFile: true,            // 写入文件
  logPath: '/var/log/orchestra/trace.json',
  performanceThreshold: 2000  // 2 秒阈值
});

// 定期导出和清理
setInterval(() => {
  const report = tracker.getPerformanceReport();
  fs.writeFileSync(
    `/var/log/orchestra/report-${Date.now()}.json`,
    JSON.stringify(report, null, 2)
  );
  tracker.clear();
}, 86400000); // 每天
```

### 2. 开发环境配置

```javascript
const tracker = new ToolTracker({
  maxRecords: 10000,
  verbose: true,
  logToFile: true,
  logPath: './logs/dev-trace.json',
  performanceThreshold: 500   // 更敏感的阈值
});

// 实时监听
tracker.on('performance:warning', (data) => {
  console.warn(`⚠️ ${data.toolName} 耗时 ${data.duration}ms`);
});

tracker.on('call:end', (record) => {
  if (record.error) {
    console.error(`❌ ${record.toolName}: ${record.error.message}`);
  }
});
```

### 3. 与现有代码集成

```javascript
// 创建全局追踪器
const { globalTracker } = require('./orchestra/toolTracker');
const { globalDescriber } = require('./orchestra/activityDescriber');

// 包装所有工具调用
function trackedTool(toolName, fn, getDescription = (input) => '') {
  return async function(...args) {
    const input = args[0] || {};
    const description = getDescription(input);
    const callId = globalTracker.startCall(toolName, description, input);
    
    try {
      const result = await fn(...args);
      globalTracker.endCall(callId, result);
      return result;
    } catch (error) {
      globalTracker.endCall(callId, {}, error);
      throw error;
    }
  };
}

// 使用示例
const read = trackedTool(
  'read',
  originalRead,
  (input) => `读取 ${input.path}`
);
```

### 4. 生成调试报告

```javascript
function generateDebugReport(tracker, describer) {
  const report = tracker.getPerformanceReport();
  const errors = tracker.getErrorTraces();
  const timeline = tracker.getTimeline();
  
  return {
    timestamp: new Date().toISOString(),
    performance: report,
    errors: errors.slice(0, 10), // 最近 10 个错误
    timeline: timeline.slice(-50), // 最近 50 条调用
    summary: describer.generateSummary(timeline.slice(-20))
  };
}
```

---

## 📚 相关文档

- [ARCHITECTURE-REVIEW.md](./ARCHITECTURE-REVIEW.md) - 架构审查
- [MONITORING-GUIDE.md](./MONITORING-GUIDE.md) - 监控指南
- [API-REFERENCE.md](./API-REFERENCE.md) - API 参考

---

## 🆘 获取帮助

遇到问题？

1. 启用 verbose 模式查看详细日志
2. 检查 `getErrorTraces()` 获取错误堆栈
3. 查看性能报告识别瓶颈
4. 导出日志文件进行离线分析

```javascript
// 快速诊断脚本
const { globalTracker } = require('./orchestra/toolTracker');

console.log('=== 快速诊断 ===');
console.log('活跃调用:', globalTracker.activeCalls.size);
console.log('总记录数:', globalTracker.records.length);
console.log('错误数:', globalTracker.stats.errorCount);
console.log('平均耗时:', globalTracker.getPerformanceReport().summary.avgDuration + 'ms');
```

---

*最后更新：2026-04-03*
