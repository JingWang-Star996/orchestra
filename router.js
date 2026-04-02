#!/usr/bin/env node

/**
 * Router - Agent 路由器
 * 
 * 职责：根据任务类型自动分配给对应的 AI 岗位
 * 输入：子任务列表
 * 输出：任务→Agent 映射关系
 */

class AgentRouter {
  constructor(options = {}) {
    this.agents = options.agents || this._defaultAgents();
    this.loadBalance = options.loadBalance || true;
    this.verbose = options.verbose || false;
    
    // 任务类型到 Agent 的映射
    this.taskTypeMap = {
      '需求': 'AI 主策划',
      '设计': 'AI 主策划',
      '数值': 'AI 数值策划',
      '代码': 'AI 主程',
      '程序': 'AI 主程',
      '美术': 'AI 主美',
      'UI': 'AI 美术总监',
      '测试': 'AI QA 主管',
      '运营': 'AI 运营总监',
      '数据': 'AI 数据分析师',
      '文档': 'AI 主策划'
    };
  }

  /**
   * 默认 AI 岗位列表
   */
  _defaultAgents() {
    return [
      'AI CEO',
      'AI 制作人',
      'AI 主策划',
      'AI 数值策划',
      'AI 系统策划',
      'AI 主程',
      'AI 客户端程序员',
      'AI 服务器程序员',
      'AI 主美',
      'AI 美术总监',
      'AI 角色原画师',
      'AI 数据分析师',
      'AI QA 主管'
    ];
  }

  /**
   * 路由任务
   * @param {Array} tasks - 任务列表
   * @returns {Promise<Map>} 任务→Agent 映射
   */
  async route(tasks) {
    console.log(`[Router] 开始路由 ${tasks.length} 个任务`);
    
    const assignments = new Map();
    
    for (const task of tasks) {
      const agent = this._findBestAgent(task);
      assignments.set(task.id, {
        task: task,
        agent: agent,
        status: 'assigned',
        assignedAt: new Date().toISOString()
      });
      
      if (this.verbose) {
        console.log(`  任务 ${task.id}: ${task.title} → ${agent}`);
      }
    }
    
    console.log(`[Router] 路由完成`);
    return assignments;
  }

  /**
   * 为任务找到最合适的 Agent
   */
  _findBestAgent(task) {
    // 1. 如果任务已指定 Agent，直接使用
    if (task.agent) {
      return task.agent;
    }

    // 2. 根据任务标题/描述匹配
    const keywords = (task.title + ' ' + task.description).toLowerCase();
    
    for (const [type, agent] of Object.entries(this.taskTypeMap)) {
      if (keywords.includes(type.toLowerCase())) {
        return agent;
      }
    }

    // 3. 根据优先级分配
    if (task.priority === 'P0') {
      return 'AI 主策划'; // 高优先级任务由主策划处理
    }

    // 4. 默认分配
    return 'AI 主策划';
  }

  /**
   * 注册自定义路由规则
   */
  register(taskType, agent) {
    this.taskTypeMap[taskType] = agent;
    console.log(`[Router] 注册路由规则：${taskType} → ${agent}`);
  }

  /**
   * 获取 Agent 负载情况
   */
  getAgentWorkload(assignments) {
    const workload = {};
    
    for (const [, assignment] of assignments.entries()) {
      const agent = assignment.agent;
      if (!workload[agent]) {
        workload[agent] = 0;
      }
      workload[agent] += assignment.task.estimatedHours || 1;
    }
    
    return workload;
  }

  /**
   * 负载均衡
   */
  balance(assignments) {
    if (!this.loadBalance) return assignments;
    
    const workload = this.getAgentWorkload(assignments);
    const avgWorkload = Object.values(workload).reduce((a, b) => a + b, 0) / Object.keys(workload).length;
    
    // 找出过载的 Agent
    const overloaded = Object.entries(workload)
      .filter(([_, hours]) => hours > avgWorkload * 1.5)
      .map(([agent, _]) => agent);
    
    if (overloaded.length > 0 && this.verbose) {
      console.log(`[Router] 检测到过载 Agent: ${overloaded.join(', ')}`);
      // TODO: 实现任务重新分配逻辑
    }
    
    return assignments;
  }

  /**
   * 导出路由报告
   */
  exportReport(assignments) {
    const report = {
      totalTasks: assignments.size,
      assignedAgents: new Set([...assignments.values()].map(a => a.agent)).size,
      workload: this.getAgentWorkload(assignments),
      assignments: [...assignments.entries()].map(([id, a]) => ({
        taskId: id,
        taskTitle: a.task.title,
        agent: a.agent,
        estimatedHours: a.task.estimatedHours
      }))
    };
    
    return report;
  }
}

// 导出
module.exports = AgentRouter;

// CLI 入口
if (require.main === module) {
  const router = new AgentRouter({ verbose: true });
  
  // 测试数据
  const tasks = [
    { id: 1, title: '设计抽卡概率', priority: 'P0', estimatedHours: 4 },
    { id: 2, title: '编写抽卡代码', priority: 'P0', estimatedHours: 8 },
    { id: 3, title: '制作抽卡 UI', priority: 'P1', estimatedHours: 6 },
    { id: 4, title: '测试抽卡功能', priority: 'P1', estimatedHours: 4 }
  ];
  
  router.route(tasks)
    .then(assignments => {
      console.log('\n=== 路由报告 ===');
      const report = router.exportReport(assignments);
      console.log(JSON.stringify(report, null, 2));
    })
    .catch(err => {
      console.error('路由失败:', err.message);
      process.exit(1);
    });
}
