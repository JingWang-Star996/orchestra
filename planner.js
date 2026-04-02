#!/usr/bin/env node

/**
 * Planner - 任务分解器
 * 
 * 职责：将复杂需求拆解为可执行的子任务
 * 输入：1 个复杂需求（如"设计一个抽卡系统"）
 * 输出：N 个子任务（带依赖关系、优先级、预计工时）
 */

class TaskPlanner {
  constructor(options = {}) {
    this.model = options.model || 'qwen3.5-plus';
    this.maxSubtasks = options.maxSubtasks || 50;
    this.verbose = options.verbose || false;
  }

  /**
   * 分解任务
   * @param {string} requirement - 原始需求
   * @param {Array} availableAgents - 可用的 AI 岗位列表
   * @returns {Promise<Array>} 子任务列表
   */
  async decompose(requirement, availableAgents = []) {
    console.log(`[Planner] 开始分解任务："${requirement}"`);
    
    // 构建分析 Prompt
    const prompt = this._buildPrompt(requirement, availableAgents);
    
    // 调用 AI 分析
    const analysis = await this._analyzeWithAI(prompt);
    
    // 解析结果
    const subtasks = this._parseSubtasks(analysis);
    
    // 验证和修正
    const validated = this._validate(subtasks);
    
    console.log(`[Planner] 分解完成：${validated.length} 个子任务`);
    
    return validated;
  }

  /**
   * 构建分析 Prompt
   */
  _buildPrompt(requirement, agents) {
    const agentList = agents.length > 0 
      ? `可用岗位：${agents.join(', ')}`
      : '使用标准游戏开发岗位（CEO/制作人/主策/主程/主美/数值/系统等）';

    return `你是一个专业的游戏制作人和项目管理专家。

任务：将以下复杂需求拆解为可执行的子任务

需求：${requirement}

${agentList}

要求：
1. 每个子任务必须是可执行的（有明确的输入输出）
2. 标注每个任务的优先级（P0/P1/P2）
3. 标注预计工时（小时）
4. 标注依赖关系（哪些任务需要先完成）
5. 标注负责的 AI 岗位

输出格式（JSON）：
{
  "summary": "需求概述",
  "subtasks": [
    {
      "id": 1,
      "title": "任务标题",
      "description": "任务描述",
      "agent": "负责的 AI 岗位",
      "priority": "P0/P1/P2",
      "estimatedHours": 2,
      "dependencies": [0],
      "output": "预期输出"
    }
  ]
}

请确保子任务数量合理（5-20 个），不要过度拆分。`;
  }

  /**
   * 调用 AI 分析
   */
  async _analyzeWithAI(prompt) {
    // TODO: 集成实际的 AI 调用
    // 这里使用模拟数据用于测试
    
    return {
      summary: "任务分析结果",
      subtasks: [
        {
          id: 1,
          title: "需求分析",
          description: "分析需求文档，明确功能范围",
          agent: "AI 主策划",
          priority: "P0",
          estimatedHours: 2,
          dependencies: [],
          output: "需求分析文档"
        }
      ]
    };
  }

  /**
   * 解析子任务
   */
  _parseSubtasks(analysis) {
    if (!analysis || !analysis.subtasks) {
      throw new Error('AI 返回格式错误');
    }

    return analysis.subtasks.map(task => ({
      ...task,
      status: 'pending',
      createdAt: new Date().toISOString()
    }));
  }

  /**
   * 验证子任务
   */
  _validate(subtasks) {
    // 检查循环依赖
    this._checkCircularDependencies(subtasks);
    
    // 检查优先级分布
    this._checkPriorityDistribution(subtasks);
    
    // 检查工时估算
    this._checkEstimation(subtasks);
    
    return subtasks;
  }

  /**
   * 检查循环依赖
   */
  _checkCircularDependencies(subtasks) {
    const visited = new Set();
    const stack = new Set();

    function hasCycle(taskId, deps) {
      if (stack.has(taskId)) return true;
      if (visited.has(taskId)) return false;

      visited.add(taskId);
      stack.add(taskId);

      for (const dep of deps) {
        if (hasCycle(dep, subtasks[dep]?.dependencies || [])) {
          return true;
        }
      }

      stack.delete(taskId);
      return false;
    }

    for (let i = 0; i < subtasks.length; i++) {
      if (hasCycle(i, subtasks[i].dependencies)) {
        throw new Error(`检测到循环依赖：任务 ${i}`);
      }
    }
  }

  /**
   * 检查优先级分布
   */
  _checkPriorityDistribution(subtasks) {
    const p0 = subtasks.filter(t => t.priority === 'P0').length;
    const p1 = subtasks.filter(t => t.priority === 'P1').length;
    const p2 = subtasks.filter(t => t.priority === 'P2').length;

    if (this.verbose) {
      console.log(`[Planner] 优先级分布：P0=${p0}, P1=${p1}, P2=${p2}`);
    }

    // P0 任务不应超过总数的 30%
    if (p0 > subtasks.length * 0.3) {
      console.warn('[Planner] 警告：P0 任务过多，建议重新评估优先级');
    }
  }

  /**
   * 检查工时估算
   */
  _checkEstimation(subtasks) {
    const total = subtasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
    
    if (this.verbose) {
      console.log(`[Planner] 总工时估算：${total} 小时`);
    }

    // 单个任务不应超过 40 小时
    const overestimated = subtasks.filter(t => t.estimatedHours > 40);
    if (overestimated.length > 0) {
      console.warn('[Planner] 警告：以下任务工时估算过长，建议拆分：');
      overestimated.forEach(t => console.warn(`  - ${t.title}: ${t.estimatedHours}h`));
    }
  }

  /**
   * 获取任务关键路径
   */
  getCriticalPath(subtasks) {
    // TODO: 实现关键路径算法
    return subtasks.filter(t => t.priority === 'P0');
  }

  /**
   * 导出为甘特图数据
   */
  exportToGantt(subtasks) {
    // TODO: 实现甘特图数据导出
    return {
      tasks: subtasks,
      startDate: new Date().toISOString(),
      totalHours: subtasks.reduce((sum, t) => sum + t.estimatedHours, 0)
    };
  }
}

// 导出
module.exports = TaskPlanner;

// CLI 入口
if (require.main === module) {
  const planner = new TaskPlanner({ verbose: true });
  
  const requirement = process.argv[2] || '设计一个抽卡系统';
  
  planner.decompose(requirement)
    .then(tasks => {
      console.log('\n=== 任务分解结果 ===');
      tasks.forEach((t, i) => {
        console.log(`${i + 1}. [${t.priority}] ${t.title} (${t.agent}, ${t.estimatedHours}h)`);
      });
    })
    .catch(err => {
      console.error('任务分解失败:', err.message);
      process.exit(1);
    });
}
