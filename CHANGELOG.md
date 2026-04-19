# Changelog

All notable changes to Orchestra will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-04-03

### 🎉 Initial Release

#### Added

**核心功能**
- `FourPhaseWorkflow` 类 - 完整的四阶段工作流编排器
- `Worker` 类 - 任务执行者，支持研究、实现、验证三种任务类型
- `Coordinator` 类 - 协调者，负责综合信息和制定规范
- `Scratchpad` 类 - 共享数据区，支持阶段间数据传递

**四阶段流程**
- **Phase 1: Research** - 支持多 Worker 并行研究代码库
- **Phase 2: Synthesis** - Coordinator 综合研究发现，制定解决方案
- **Phase 3: Implementation** - 多 Worker 并行实现修改
- **Phase 4: Verification** - 多 Worker 并行验证修改

**工具函数**
- `createWorkerPool()` - 创建 Worker 池
- `executeWithConcurrency()` - 带并发限制的任务执行
- `withTimeout()` - 超时控制包装器

**示例场景**
- 示例 1: Bug 修复工作流（登录问题）
- 示例 2: 新功能实现工作流（个人资料编辑）
- 示例 3: 代码重构工作流（支付模块）
- 实战示例：电商支付 Bug 修复
- 实战示例：社交 Feed 流功能开发
- 实战示例：API 性能优化
- 实战示例：XSS 安全漏洞修复
- 实战示例：数据库迁移

**文档**
- README.md - 项目概述和快速开始
- USAGE.md - 详细使用指南
- CHANGELOG.md - 变更日志
- TypeScript JSDoc 注释 - 完整的 API 文档

**项目配置**
- package.json - NPM 包配置
- tsconfig.json - TypeScript 配置
- src/index.ts - 统一导出入口

#### Features

- ✅ 完整的四阶段工作流实现
- ✅ 支持多 Worker 并行执行
- ✅ Scratchpad 数据共享机制
- ✅ 灵活的配置选项
- ✅ 详细的错误处理
- ✅ 完整的类型定义
- ✅ 丰富的实战示例
- ✅ 详尽的文档

#### Technical Details

- **语言**: TypeScript 5.3+
- **目标环境**: Node.js 18+
- **依赖**: OpenClaw (peer dependency)
- **模块系统**: CommonJS
- **类型支持**: 完整的 TypeScript 类型定义

---

## [1.2.0] - 2026-04-19

### 🆕 P2 阶段新增

**监控 Dashboard**
- `dashboard/server.js` — HTTP 服务器 + WebSocket 实时更新
- `dashboard/api.js` — 后端 REST API
- `dashboard/app.js` — 前端主应用逻辑
- `dashboard/metrics.js` — 性能指标收集与计算
- `dashboard/alerts.js` — 告警规则与通知系统
- `dashboard/index-v6.0.html` — 最终版 Worker 状态可视化 UI

**ML 优化模块**
- `ml-optimizer/WeightOptimizer.js` — 基于成功率的权重自动调整
- `ml-optimizer/DecisionHistory.js` — 决策历史记录与回放
- `ml-optimizer/ABTestManager.js` — A/B 测试框架
- `ml-optimizer/DecisionMatrix-integration.js` — 与现有 DecisionMatrix 无缝集成

**分布式架构**
- `distributed/NodeRegistry.js` — 多实例节点注册/心跳/上下线管理
- `distributed/MessageBus.js` — EventEmitter pub/sub + 文件队列持久化
- `distributed/StateSync.js` — 版本向量 + LWW 冲突解决
- `distributed/index.js` — 统一导出 + createRuntime() 快捷创建
- `distributed/01-04` — 架构设计/消息队列/状态同步/部署指南 四份设计文档

**文档**
- `P2-SUMMARY.md` — P2 阶段完成总结
- `DEPLOYMENT.md` — 完整部署指南（单机 + 分布式）
- `USER-MANUAL.md` — 用户使用手册

### [Unreleased]

#### Planned Features

- [ ] 支持自定义阶段类型
- [ ] 支持动态 Worker 创建
- [ ] 支持工作流暂停/恢复
- [ ] 支持工作流模板
- [ ] 支持工作流版本控制

#### Under Consideration

- 支持更多 Coordinator 策略
- 支持多工作流协作
- 增加性能分析工具

---

## Version History

| Version | Release Date | Key Features |
|---------|-------------|--------------|
| 1.2.0 | 2026-04-19 | Dashboard + ML Optimizer + Distributed |
| 1.0.0 | 2026-04-03 | Initial release with four-phase workflow |

---

## Migration Guide

### From Beta to 1.0.0

No breaking changes. Beta users can upgrade directly to 1.0.0.

---

## Contributing

We welcome contributions! Please see our contributing guidelines for more details.

### How to Contribute

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

### Reporting Issues

- Use GitHub Issues
- Include version information
- Provide reproduction steps
- Include error messages and logs

---

## License

MIT License - see LICENSE file for details
