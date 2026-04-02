#!/usr/bin/env node

/**
 * DecisionMatrix - Continue vs. Spawn 决策矩阵（Phase 1 核心功能）
 * 
 * 职责：智能决策是继续现有 Worker 还是创建新 Worker
 * 
 * 灵感来源：Claude Code Coordinator 的决策原则
 * > "Think about how much of the worker's context overlaps with the next task.
 * > High overlap → continue. Low overlap → spawn fresh."
 */

/**
 * 决策结果枚举
 */
const DecisionType = {
  CONTINUE: 'continue', // 继续现有 Worker
  SPAWN: 'spawn'        // 创建新 Worker
};

/**
 * 决策原因枚举
 */
const DecisionReason = {
  HIGH_OVERLAP: 'high_overlap',           // 高重叠 - Worker 已有上下文
  LOW_OVERLAP: 'low_overlap',             // 低重叠 - 避免探索噪音
  ERROR_CONTEXT: 'error_context',         // 错误上下文 - Worker 有错误上下文
  FRESH_EYES: 'fresh_eyes',               // 新鲜眼光 - 验证者应该用新鲜眼光
  WRONG_APPROACH: 'wrong_approach',       // 错误方法 - 错误方法上下文污染重试
  NO_USEFUL_CONTEXT: 'no_useful_context'  // 无有用上下文 - 无有用上下文可复用
};

/**
 * 决策配置
 */
const DecisionConfig = {
  // 上下文重叠阈值
  HIGH_OVERLAP_THRESHOLD: 0.7,  // >70% 重叠 → Continue
  LOW_OVERLAP_THRESHOLD: 0.3,   // <30% 重叠 → Spawn
  
  // 决策矩阵（6 种情况）
  MATRIX: {
    // 情况 1: 研究探索了 exactly 需要编辑的文件
    RESEARCH_EXACT_FILES: {
      decision: DecisionType.CONTINUE,
      reason: DecisionReason.HIGH_OVERLAP,
      description: 'Worker 已有文件上下文 + 清晰计划'
    },
    
    // 情况 2: 研究广泛但实现狭窄
    RESEARCH_BROAD_IMPLEMENTATION_NARROW: {
      decision: DecisionType.SPAWN,
      reason: DecisionReason.LOW_OVERLAP,
      description: '避免探索噪音，专注上下文'
    },
    
    // 情况 3: 纠正失败或扩展近期工作
    CORRECT_FAILURE_OR_EXTEND: {
      decision: DecisionType.CONTINUE,
      reason: DecisionReason.ERROR_CONTEXT,
      description: 'Worker 有错误上下文'
    },
    
    // 情况 4: 验证另一个 Worker 的代码
    VERIFY_ANOTHER_WORKER: {
      decision: DecisionType.SPAWN,
      reason: DecisionReason.FRESH_EYES,
      description: '验证者应该用新鲜眼光'
    },
    
    // 情况 5: 第一次尝试用了错误方法
    WRONG_METHOD_FIRST_TRY: {
      decision: DecisionType.SPAWN,
      reason: DecisionReason.WRONG_APPROACH,
      description: '错误方法上下文污染重试'
    },
    
    // 情况 6: 完全不相关的任务
    COMPLETELY_UNRELATED: {
      decision: DecisionType.SPAWN,
      reason: DecisionReason.NO_USEFUL_CONTEXT,
      description: '无有用上下文可复用'
    }
  }
};

/**
 * 计算上下文重叠度
 * @param {Object} task - 新任务
 * @param {Object} workerContext - Worker 现有上下文
 * @returns {number} 重叠度（0-1）
 */
function calculateContextOverlap(task, workerContext) {
  // 提取任务需要的文件
  const taskFiles = extractFilesFromTask(task);
  
  // 提取 Worker 已访问的文件
  const contextFiles = workerContext.visitedFiles || [];
  
  if (taskFiles.length === 0) {
    return 0;
  }
  
  // 计算重叠文件数
  const overlap = taskFiles.filter(file => contextFiles.includes(file)).length;
  
  return overlap / taskFiles.length;
}

/**
 * 从任务中提取文件列表
 */
function extractFilesFromTask(task) {
  const files = [];
  
  // 从 prompt 中提取文件引用
  if (task.prompt) {
    const fileMatches = task.prompt.match(/[\w\-\.]+\.(js|ts|py|md|json)/g) || [];
    files.push(...fileMatches);
  }
  
  // 从 explicit files 字段提取
  if (task.files) {
    files.push(...task.files);
  }
  
  return [...new Set(files)]; // 去重
}

/**
 * 判断任务类型
 */
function identifyTaskType(task, workerContext) {
  const prompt = (task.prompt || '').toLowerCase();
  
  // 情况 1: 研究探索了 exactly 需要编辑的文件
  if (prompt.includes('修改') || prompt.includes('实现') || prompt.includes('编辑')) {
    const taskFiles = extractFilesFromTask(task);
    const contextFiles = workerContext.visitedFiles || [];
    const exactMatch = taskFiles.every(f => contextFiles.includes(f));
    
    if (exactMatch) {
      return 'RESEARCH_EXACT_FILES';
    }
  }
  
  // 情况 2: 研究广泛但实现狭窄
  if (prompt.includes('研究') && (prompt.includes('实现') || prompt.includes('修改'))) {
    const taskFiles = extractFilesFromTask(task);
    const contextFiles = workerContext.visitedFiles || [];
    const visitedCount = contextFiles.length;
    const taskFileCount = taskFiles.length;
    
    if (visitedCount > taskFileCount * 2) {
      return 'RESEARCH_BROAD_IMPLEMENTATION_NARROW';
    }
  }
  
  // 情况 3: 纠正失败或扩展近期工作
  if (prompt.includes('修复') || prompt.includes('纠正') || prompt.includes('扩展')) {
    if (workerContext.lastStatus === 'failed' || workerContext.lastStatus === 'error') {
      return 'CORRECT_FAILURE_OR_EXTEND';
    }
  }
  
  // 情况 4: 验证另一个 Worker 的代码
  if (prompt.includes('验证') || prompt.includes('测试') || prompt.includes('review')) {
    if (workerContext.isDifferentWorker) {
      return 'VERIFY_ANOTHER_WORKER';
    }
  }
  
  // 情况 5: 第一次尝试用了错误方法
  if (prompt.includes('重试') || prompt.includes('重新')) {
    if (workerContext.lastMethod === 'wrong') {
      return 'WRONG_METHOD_FIRST_TRY';
    }
  }
  
  // 情况 6: 完全不相关的任务
  return 'COMPLETELY_UNRELATED';
}

/**
 * 决策函数：Continue vs. Spawn
 * @param {Object} task - 新任务
 * @param {Object} workerContext - Worker 现有上下文
 * @returns {Object} 决策结果
 */
function decideContinueOrSpawn(task, workerContext) {
  // 1. 计算上下文重叠度
  const overlap = calculateContextOverlap(task, workerContext);
  
  // 2. 识别任务类型
  const taskType = identifyTaskType(task, workerContext);
  const matrixEntry = DecisionConfig.MATRIX[taskType];
  
  // 3. 应用决策矩阵
  if (matrixEntry) {
    return {
      decision: matrixEntry.decision,
      reason: matrixEntry.reason,
      description: matrixEntry.description,
      taskType: taskType,
      overlap: overlap,
      confidence: 'high'
    };
  }
  
  // 4. 回退到重叠度决策
  if (overlap >= DecisionConfig.HIGH_OVERLAP_THRESHOLD) {
    return {
      decision: DecisionType.CONTINUE,
      reason: DecisionReason.HIGH_OVERLAP,
      description: '上下文重叠度高，继续现有 Worker',
      taskType: 'fallback',
      overlap: overlap,
      confidence: 'medium'
    };
  } else if (overlap <= DecisionConfig.LOW_OVERLAP_THRESHOLD) {
    return {
      decision: DecisionType.SPAWN,
      reason: DecisionReason.LOW_OVERLAP,
      description: '上下文重叠度低，创建新 Worker',
      taskType: 'fallback',
      overlap: overlap,
      confidence: 'medium'
    };
  }
  
  // 5. 中等重叠度，默认 Spawn（安全选择）
  return {
    decision: DecisionType.SPAWN,
    reason: DecisionReason.LOW_OVERLAP,
    description: '上下文重叠度中等，默认创建新 Worker',
    taskType: 'fallback',
    overlap: overlap,
    confidence: 'low'
  };
}

/**
 * 决策报告生成器
 */
function generateDecisionReport(task, workerContext, decision) {
  return {
    timestamp: new Date().toISOString(),
    task: {
      id: task.id,
      prompt: task.prompt?.substring(0, 100) + '...',
      files: extractFilesFromTask(task)
    },
    workerContext: {
      id: workerContext.id,
      visitedFiles: workerContext.visitedFiles,
      lastStatus: workerContext.lastStatus
    },
    decision: {
      type: decision.decision,
      reason: decision.reason,
      description: decision.description,
      taskType: decision.taskType,
      overlap: decision.overlap.toFixed(2),
      confidence: decision.confidence
    }
  };
}

// 导出
module.exports = {
  DecisionType,
  DecisionReason,
  DecisionConfig,
  calculateContextOverlap,
  extractFilesFromTask,
  identifyTaskType,
  decideContinueOrSpawn,
  generateDecisionReport
};

// CLI 入口
if (require.main === module) {
  const { decideContinueOrSpawn, generateDecisionReport } = require('./decisionMatrix');
  
  console.log('=== Continue vs. Spawn 决策矩阵测试 ===\n');
  
  // 测试用例 1: 研究探索了 exactly 需要编辑的文件
  console.log('测试 1: 研究探索了 exactly 需要编辑的文件');
  const decision1 = decideContinueOrSpawn(
    {
      id: 'task-1',
      prompt: '修改 auth.js 和 user.js 的认证逻辑',
      files: ['auth.js', 'user.js']
    },
    {
      id: 'worker-1',
      visitedFiles: ['auth.js', 'user.js', 'session.js'],
      lastStatus: 'completed'
    }
  );
  console.log(`决策：${decision1.decision}`);
  console.log(`原因：${decision1.reason}`);
  console.log(`描述：${decision1.description}`);
  console.log(`重叠度：${decision1.overlap.toFixed(2)}`);
  console.log();
  
  // 测试用例 2: 研究广泛但实现狭窄
  console.log('测试 2: 研究广泛但实现狭窄');
  const decision2 = decideContinueOrSpawn(
    {
      id: 'task-2',
      prompt: '实现登录功能',
      files: ['login.js']
    },
    {
      id: 'worker-2',
      visitedFiles: ['auth.js', 'user.js', 'session.js', 'token.js', 'permission.js', 'role.js'],
      lastStatus: 'completed'
    }
  );
  console.log(`决策：${decision2.decision}`);
  console.log(`原因：${decision2.reason}`);
  console.log(`描述：${decision2.description}`);
  console.log(`重叠度：${decision2.overlap.toFixed(2)}`);
  console.log();
  
  // 测试用例 3: 验证另一个 Worker 的代码
  console.log('测试 3: 验证另一个 Worker 的代码');
  const decision3 = decideContinueOrSpawn(
    {
      id: 'task-3',
      prompt: '验证登录功能的正确性',
      files: ['login.js']
    },
    {
      id: 'worker-3',
      visitedFiles: ['login.js'],
      lastStatus: 'completed',
      isDifferentWorker: true
    }
  );
  console.log(`决策：${decision3.decision}`);
  console.log(`原因：${decision3.reason}`);
  console.log(`描述：${decision3.description}`);
  console.log();
  
  // 生成决策报告
  console.log('测试 4: 决策报告');
  const report = generateDecisionReport(
    {
      id: 'task-1',
      prompt: '修改 auth.js 和 user.js 的认证逻辑',
      files: ['auth.js', 'user.js']
    },
    {
      id: 'worker-1',
      visitedFiles: ['auth.js', 'user.js', 'session.js'],
      lastStatus: 'completed'
    },
    decision1
  );
  console.log(JSON.stringify(report, null, 2));
}
