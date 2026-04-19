# Orchestra 故障排查指南

**版本**: v1.0  
**最后更新**: 2026-04-05  
**阶段**: Phase 3 完成（95%）

---

## 📋 常见问题

### 1. Worker 创建失败

**问题**: `sessions_spawn` 调用失败

**可能原因**:
- OpenClaw 未正确集成
- `global.sessions_spawn` 未定义
- Agent 不存在或配置错误

**排查步骤**:
```javascript
// 1. 检查 OpenClaw API 是否可用
console.log('sessions_spawn:', global.sessions_spawn ? '✅' : '❌');

// 2. 检查 Agent 列表
console.log('可用 Agent:', global.agents_list ? '✅' : '❌');

// 3. 尝试手动调用
if (global.sessions_spawn) {
  const result = await global.sessions_spawn({
    agentId: 'AI 主策划',
    task: '测试任务',
    mode: 'run'
  });
  console.log('测试结果:', result);
}
```

**解决方案**:
- 确保在 OpenClaw 环境中运行
- 检查 `gateway.js` 中的 API 集成
- 确认 Agent 已正确配置

---

### 2. 缓存命中率低

**问题**: `cache.getStats().hitRate` < 50%

**可能原因**:
- TTL 设置过短
- 缓存 maxSize 过小
- 访问模式不适合缓存

**排查步骤**:
```javascript
// 1. 检查缓存统计
var stats = cache.getStats();
console.log('命中率:', stats.hitRate);
console.log('命中数:', stats.hits);
console.log('未命中数:', stats.misses);
console.log('淘汰数:', stats.evictions);

// 2. 检查缓存大小
console.log('当前大小:', cache.size());
console.log('最大容量:', cache.maxSize);

// 3. 检查 TTL
console.log('默认 TTL:', cache.defaultTTL / 1000, '秒');
```

**解决方案**:
- 增加 `defaultTTL`（默认 5 分钟 → 10-15 分钟）
- 增加 `maxSize`（默认 1000 → 2000-5000）
- 预热常用数据

---

### 3. 并发 Worker 失败

**问题**: 多个 Worker 同时执行时出错

**可能原因**:
- 超过 `maxConcurrent` 限制
- API 速率限制
- 资源竞争

**排查步骤**:
```javascript
// 1. 检查并发配置
console.log('最大并发:', gateway.options.maxConcurrent);

// 2. 检查 Worker 状态
var status = workerManager.getStatus();
console.log('活跃 Worker:', status.activeWorkers);

// 3. 检查错误日志
workerManager.on('error', (err) => {
  console.error('Worker 错误:', err);
});
```

**解决方案**:
- 降低 `maxConcurrent`（默认 5 → 3）
- 增加重试机制
- 使用队列限制并发

---

### 4. Scratchpad 数据丢失

**问题**: 跨 Worker 数据无法共享

**可能原因**:
- 路径配置错误
- 文件权限问题
- 数据未持久化

**排查步骤**:
```javascript
// 1. 检查 Scratchpad 配置
var scratchpad = new Scratchpad('task-001', {
  basePath: 'temp/scratchpad',
  verbose: true
});

// 2. 测试写入
await scratchpad.set('test:key', 'test value');

// 3. 测试读取
var value = await scratchpad.get('test:key');
console.log('读取结果:', value);
```

**解决方案**:
- 确保 `basePath` 目录存在
- 检查文件写入权限
- 启用 `enableHistory`

---

### 5. 任务通知失败

**问题**: 任务完成后未收到通知

**可能原因**:
- 通知管理器未初始化
- 存储路径错误
- 事件监听未绑定

**排查步骤**:
```javascript
// 1. 检查通知管理器
console.log('通知管理器:', taskNotificationManager ? '✅' : '❌');

// 2. 检查事件监听
gateway.on('task:completed', (result) => {
  console.log('任务完成:', result);
});

// 3. 手动发送测试通知
await taskNotificationManager.send({
  taskId: 'test-001',
  status: 'completed',
  summary: '测试通知'
});
```

**解决方案**:
- 确保初始化 `TaskNotificationManager`
- 绑定事件监听器
- 检查存储路径权限

---

### 6. 读写分离性能差

**问题**: 读写分离后性能反而下降

**可能原因**:
- 任务分类错误
- 并发读取数设置不当
- DryRun 模式误用

**排查步骤**:
```javascript
// 1. 检查任务类型识别
var taskType = separator.analyzeTaskType(task);
console.log('任务类型:', taskType);

// 2. 检查并发配置
console.log('最大并发读取:', separator.maxConcurrentReads);

// 3. 检查 DryRun 模式
console.log('DryRun:', separator.dryRun);
```

**解决方案**:
- 优化任务分类逻辑
- 调整 `maxConcurrentReads`（3-5 之间）
- 生产环境关闭 `dryRun`

---

### 7. 决策矩阵错误

**问题**: Continue vs. Spawn 决策不准确

**可能原因**:
- 权重配置不当
- 上下文信息不足
- 历史数据缺失

**排查步骤**:
```javascript
// 1. 检查决策结果
var decision = decideContinueOrSpawn(context);
console.log('决策:', decision.decision);
console.log('原因:', decision.reason);
console.log('置信度:', decision.confidence);

// 2. 检查上下文
console.log('任务上下文:', context.workerContext);
```

**解决方案**:
- 调整 `decisionMatrix.js` 中的权重
- 丰富上下文信息
- 积累历史数据

---

## 🔧 调试工具

### 启用详细日志

```javascript
const orchestra = new Orchestra({
  verbose: true,  // 启用详细日志
  model: 'qwen3.5-plus'
});
```

### 性能监控

```javascript
// 缓存性能报告
var report = cache.getPerformanceReport();
console.log('缓存性能:', report);

// Worker 状态
var status = workerManager.getStatus();
console.log('Worker 状态:', status);

// 读写分离统计
var stats = separator.getStats();
console.log('读写分离统计:', stats);
```

### 内存监控

```javascript
// 检查内存使用
console.log('内存使用:', process.memoryUsage());

// 缓存内存估算
console.log('缓存内存:', cache._estimateMemoryUsage(), 'bytes');
```

---

## 📊 性能基准

### 缓存层性能（实测）

| 指标 | 目标值 | 实测值 | 状态 |
|------|--------|--------|------|
| 写入速度 | >10 万条/秒 | 50 万条/秒 | ✅ |
| 读取速度 | >50 万条/秒 | 100 万条/秒 | ✅ |
| 命中率 | >80% | 100% (测试) | ✅ |
| 内存占用 | <100MB | ~1MB | ✅ |

### 读写分离性能（实测）

| 指标 | 目标值 | 实测值 | 状态 |
|------|--------|--------|------|
| 任务识别 | <10ms | <1ms | ✅ |
| 并发读取 | 5 个 | 5 个 | ✅ |
| DryRun 支持 | ✅ | ✅ | ✅ |

---

## 🆘 紧急处理

### 系统崩溃

```bash
# 1. 停止所有 Worker
workerManager.stopAll();

# 2. 清空缓存
cache.clear();

# 3. 重启 Gateway
gateway.restart();
```

### 数据恢复

```javascript
// 从文件导入缓存
await cache.importFromFile('temp/cache-backup.json');

// 从持久化恢复 Worker
await workerManager.loadFromStorage();
```

---

## 📞 获取帮助

- **GitHub Issues**: https://github.com/JingWang-Star996/orchestra/issues
- **文档**: https://github.com/JingWang-Star996/orchestra/tree/main/docs
- **邮件**: 联系作者

---

**Made with ❤️ for OpenClaw Community**
