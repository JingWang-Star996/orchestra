/**
 * Worker Manager 使用示例
 * 
 * 展示 Orchestra Worker 管理系统的核心功能
 */

import { workerManager, WorkerStatus } from './worker-manager';

// ============================================================================
// 示例 1: 基础 Worker 创建和管理
// ============================================================================

async function example1_BasicUsage() {
  console.log('=== 示例 1: 基础 Worker 创建和管理 ===\n');
  
  // 创建一个前端开发专家 Worker
  const frontendWorkerId = await workerManager.createWorker({
    description: '前端开发专家 - 负责 React 和 TypeScript 开发',
    agentType: 'specialist',
    prompt: `你是资深前端工程师，精通：
- React 18+ 和现代 Hooks
- TypeScript 类型系统
- 性能优化和代码质量

请提供专业、简洁的代码建议。`,
    initialMessage: '你好，我需要创建一个 React 组件，要求支持 TypeScript 类型定义'
  });
  
  console.log(`✓ 创建 Worker: ${frontendWorkerId}`);
  
  // 继续对话（不等待响应）
  await workerManager.continueWorker(frontendWorkerId, '请添加 PropTypes 验证');
  console.log('✓ 发送消息');
  
  // 继续对话（等待响应）
  const result = await workerManager.continueWorker(
    frontendWorkerId, 
    '请用 TypeScript 重写这个组件',
    { waitForResponse: true, timeoutMs: 60000 }
  );
  console.log('✓ 收到响应:', result.response?.substring(0, 100) + '...');
  
  // 查看 Worker 状态
  const worker = workerManager.getWorker(frontendWorkerId);
  console.log('✓ Worker 状态:', {
    status: worker?.status,
    messageCount: worker?.messageCount,
    contextTokens: worker?.contextTokens
  });
  
  // 优雅停止 Worker
  await workerManager.stopWorker(frontendWorkerId, {
    graceful: true,
    reason: '示例完成'
  });
  console.log('✓ 停止 Worker\n');
}

// ============================================================================
// 示例 2: Continue vs. Spawn 决策
// ============================================================================

async function example2_DecisionMaking() {
  console.log('=== 示例 2: Continue vs. Spawn 决策 ===\n');
  
  // 创建两个不同领域的 Worker
  const backendWorkerId = await workerManager.createWorker({
    description: '后端开发专家 - 负责 Node.js 和数据库',
    agentType: 'specialist',
    prompt: '你是后端专家，精通 Node.js、Express、MongoDB...'
  });
  
  const frontendWorkerId = await workerManager.createWorker({
    description: '前端开发专家 - 负责 React 和 UI',
    agentType: 'specialist',
    prompt: '你是前端专家，精通 React、Vue、CSS...'
  });
  
  console.log('✓ 创建了后端和前端 Worker');
  
  // 场景 1: 明显是后端任务
  const decision1 = await workerManager.makeContinueDecision(
    '帮我设计一个 RESTful API，支持用户认证和 JWT'
  );
  
  console.log('\n场景 1 - 后端任务:');
  console.log('  决策:', decision1.shouldContinue ? '继续现有 Worker' : '创建新 Worker');
  console.log('  推荐 Worker:', decision1.recommendedWorkerId);
  console.log('  得分:', decision1.scores);
  
  // 场景 2: 明确说"继续"
  const decision2 = await workerManager.makeContinueDecision(
    '继续刚才的工作，优化 API 性能'
  );
  
  console.log('\n场景 2 - 继续任务:');
  console.log('  决策:', decision2.shouldContinue ? '继续现有 Worker' : '创建新 Worker');
  console.log('  推荐 Worker:', decision2.recommendedWorkerId);
  console.log('  得分:', decision2.scores);
  
  // 场景 3: 完全不相关的任务
  const decision3 = await workerManager.makeContinueDecision(
    '帮我写一篇关于人工智能的科幻小说'
  );
  
  console.log('\n场景 3 - 创意写作:');
  console.log('  决策:', decision3.shouldContinue ? '继续现有 Worker' : '创建新 Worker');
  console.log('  推荐 Worker:', decision3.recommendedWorkerId);
  console.log('  得分:', decision3.scores);
  
  // 清理
  await workerManager.stopAllWorkers({ graceful: true });
  console.log('\n✓ 清理完成\n');
}

// ============================================================================
// 示例 3: 多层级 Worker 架构
// ============================================================================

async function example3_HierarchicalWorkers() {
  console.log('=== 示例 3: 多层级 Worker 架构 ===\n');
  
  // 创建总协调员
  const coordinatorId = await workerManager.createWorker({
    description: '项目协调员 - 负责任务分解和分配',
    agentType: 'agent',
    prompt: '你是项目协调员，负责：\n- 理解复杂需求\n- 分解为子任务\n- 分配给专业 Worker'
  });
  
  console.log('✓ 创建协调员 Worker');
  
  // 创建专业 Worker（作为子 Worker）
  const designerId = await workerManager.createWorker({
    description: 'UI 设计师 - 负责界面设计',
    agentType: 'specialist',
    prompt: '你是 UI 设计师，精通 Figma、设计系统...',
    parentWorkerId: coordinatorId  // 建立层级关系
  });
  
  const developerId = await workerManager.createWorker({
    description: '全栈工程师 - 负责实现',
    agentType: 'specialist',
    prompt: '你是全栈工程师，精通 MERN 栈...',
    parentWorkerId: coordinatorId
  });
  
  const testerId = await workerManager.createWorker({
    description: '测试工程师 - 负责质量保证',
    agentType: 'specialist',
    prompt: '你是测试专家，精通单元测试、E2E 测试...',
    parentWorkerId: coordinatorId
  });
  
  console.log('✓ 创建了 3 个专业 Worker');
  
  // 查看统计
  const stats = workerManager.getStats();
  console.log('\n✓ Worker 统计:');
  console.log('  总数:', stats.total);
  console.log('  状态分布:', stats.byStatus);
  console.log('  总消息数:', stats.totalMessages);
  
  // 清理
  await workerManager.stopAllWorkers({ graceful: true });
  console.log('✓ 清理完成\n');
}

// ============================================================================
// 示例 4: 批量操作和生命周期管理
// ============================================================================

async function example4_BatchOperations() {
  console.log('=== 示例 4: 批量操作和生命周期管理 ===\n');
  
  // 批量创建 Worker
  const workerIds: string[] = [];
  for (let i = 0; i < 5; i++) {
    const id = await workerManager.createWorker({
      description: `数据处理 Worker #${i + 1}`,
      agentType: 'task',
      prompt: `你是数据处理专家，负责第 ${i + 1} 批数据的处理...`
    });
    workerIds.push(id);
  }
  
  console.log(`✓ 创建了 ${workerIds.length} 个 Worker`);
  
  // 批量发送消息
  const messages = [
    '请开始处理数据',
    '继续分析数据模式',
    '生成数据报告',
    '优化数据处理性能',
    '完成数据验证'
  ];
  
  await Promise.all(
    workerIds.map((id, index) => 
      workerManager.continueWorker(id, messages[index])
    )
  );
  console.log('✓ 批量发送消息完成');
  
  // 查看活跃 Worker 数量
  const activeCount = workerManager.getActiveWorkerCount();
  console.log(`✓ 活跃 Worker 数量：${activeCount}`);
  
  // 清理已停止的 Worker
  const cleaned = workerManager.cleanupStoppedWorkers(5); // 清理停止超过 5 分钟的
  console.log(`✓ 清理了 ${cleaned} 个 Worker`);
  
  // 批量停止所有 Worker
  await workerManager.stopAllWorkers({ graceful: true });
  console.log('✓ 停止所有 Worker\n');
}

// ============================================================================
// 示例 5: 高级决策场景
// ============================================================================

async function example5_AdvancedDecision() {
  console.log('=== 示例 5: 高级决策场景 ===\n');
  
  // 创建多个 Worker
  const worker1 = await workerManager.createWorker({
    description: 'Python 数据科学家',
    agentType: 'specialist',
    prompt: '你是数据科学家，精通 Python、Pandas、Scikit-learn...'
  });
  
  const worker2 = await workerManager.createWorker({
    description: 'Python 后端工程师',
    agentType: 'specialist',
    prompt: '你是后端工程师，精通 Python、FastAPI、PostgreSQL...'
  });
  
  const worker3 = await workerManager.createWorker({
    description: 'JavaScript 前端工程师',
    agentType: 'specialist',
    prompt: '你是前端工程师，精通 JavaScript、React、TypeScript...'
  });
  
  // 测试决策：指定 Worker 范围
  const decision = await workerManager.makeContinueDecision(
    '帮我优化这个 Python 数据处理脚本的性能',
    [worker1, worker2]  // 只在这两个 Worker 中选择
  );
  
  console.log('决策结果:');
  console.log('  是否继续:', decision.shouldContinue);
  console.log('  推荐 Worker:', decision.recommendedWorkerId);
  console.log('  决策理由:', decision.reason);
  console.log('  详细得分:');
  console.log('    - 上下文重叠度:', decision.scores.contextOverlap);
  console.log('    - 任务连续性:', decision.scores.taskContinuity);
  console.log('    - 资源效率:', decision.scores.resourceEfficiency);
  console.log('    - 综合得分:', decision.scores.totalScore);
  
  // 清理
  await workerManager.stopAllWorkers({ graceful: true });
}

// ============================================================================
// 主函数 - 运行所有示例
// ============================================================================

async function runAllExamples() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     Orchestra Worker Manager - 使用示例                  ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
  
  try {
    await example1_BasicUsage();
    await example2_DecisionMaking();
    await example3_HierarchicalWorkers();
    await example4_BatchOperations();
    await example5_AdvancedDecision();
    
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║     所有示例运行完成 ✓                                   ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
  } catch (error) {
    console.error('❌ 示例运行出错:', error);
  }
}

// 如果直接运行此文件
if (require.main === module) {
  runAllExamples();
}

// 导出示例函数供测试使用
export {
  example1_BasicUsage,
  example2_DecisionMaking,
  example3_HierarchicalWorkers,
  example4_BatchOperations,
  example5_AdvancedDecision,
  runAllExamples
};
