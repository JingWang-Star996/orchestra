#!/usr/bin/env node

/**
 * Router - 内部任务分配器
 * 
 * 职责：Orchestra 内部使用，将子任务分配给对应的 Worker
 * 输入：子任务列表（已分解）
 * 输出：任务→Worker 映射关系
 * 
 * 注意：这是 Orchestra 内部工具，不对外提供路由功能
 *       主 AI 负责决策是否调用 Orchestra，Router 只负责任务分配
 */

class AgentRouter {
  constructor(options = {}) {
    this.agents = options.agents || this._defaultAgents();
    this.loadBalance = options.loadBalance || true;
    this.verbose = options.verbose || false;
    
    // 任务类型到 Agent 的映射（100% 版本 - 完整映射）
    this.taskTypeMap = {
      // 通用任务
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
      '文档': 'AI 主策划',
      
      // 编辑部协作系统
      '文章': '编辑部 - 资深撰稿人',
      '写作': '编辑部 - 资深撰稿人',
      '编辑': '编辑部 - 文字编辑',
      '审核': '编辑部 - 技术审核编辑',
      '选题': '编辑部 - 选题策划',
      '总编辑': '编辑部 - 总编辑',
      '终审': '编辑部 - 终审官',
      
      // 游戏设计
      '玩法': 'AI 主策划',
      '系统': 'AI 系统策划',
      '关卡': 'AI 关卡策划',
      '剧情': 'AI 剧情策划',
      '战斗': 'AI 战斗策划',
      '经济': 'AI 经济策划',
      '活动': 'AI 活动策划',
      '抽卡': 'AI 数值策划',
      '付费': 'AI 变现设计师',
      
      // 技术实现
      '架构': 'AI 主程',
      '前端': 'AI 客户端程序员',
      '后端': 'AI 服务器程序员',
      'AI': 'AI AI 技术总监',
      '算法': 'AI AI 技术总监'
    };
    
    // 团队配置（100% 版本新增）
    this.teams = {
      '编辑部': {
        agents: [
          '编辑部 - 总编辑',
          '编辑部 - 选题策划',
          '编辑部 - 资深撰稿人',
          '编辑部 - 技术审核编辑',
          '编辑部 - 文字编辑',
          '编辑部 - 用户体验编辑',
          '编辑部 - 终审官'
        ],
        workflow: 'editorial',
        triggerWords: ['编辑部', '写文章', '整理成文章', '内容创作']
      },
      '游戏设计': {
        agents: null, // 延迟加载
        workflow: 'gameDesign',
        triggerWords: ['游戏设计', '系统设计', '数值设计', '玩法设计']
      },
      'OpenClaw 分析': {
        agents: null, // 延迟加载
        workflow: 'codeAnalysis', // 改为 Orchestra 开发工作流
        triggerWords: ['源码分析', '架构分析', '代码审查', '开发 Orchestra', 'Orchestra 版本', '100% 版本']
      }
    };
  }
  
  /**
   * OpenClaw 分析团队 Agent 列表（100% 版本新增）
   */
  _openClawAgents() {
    return [
      'AI CEO', 'AI CTO',
      'AI 首席架构师', 'AI 后端架构师', 'AI 前端架构师', 'AI 系统架构师',
      'AI AI 引擎专家', 'AI 工具链专家', 'AI 运行时专家',
      'AI 插件架构师', 'AI 集成专家', 'AI API 专家',
      'AI 技术写作主管', 'AI 文档工程师', 'AI 知识管理师'
    ];
  }
  
  /**
   * 获取团队 Agent 列表（100% 版本新增）
   */
  getTeamAgents(teamName) {
    const team = this.teams[teamName];
    if (!team) return [];
    
    if (team.agents === null) {
      // 延迟加载
      if (teamName === '游戏设计') {
        team.agents = this._defaultAgents();
      } else if (teamName === 'OpenClaw 分析') {
        team.agents = this._openClawAgents();
      }
    }
    
    return team.agents || [];
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
   * 为任务找到最合适的 Agent（100% 版本 - 增强版）
   */
  _findBestAgent(task) {
    // 1. 如果任务已指定 Agent，直接使用
    if (task.agent) {
      return task.agent;
    }

    // 2. 根据任务标题/描述匹配
    const keywords = (task.title + ' ' + task.description).toLowerCase();
    
    // 2.1 精确匹配
    for (const [type, agent] of Object.entries(this.taskTypeMap)) {
      if (keywords.includes(type.toLowerCase())) {
        return agent;
      }
    }
    
    // 2.2 模糊匹配（100% 版本新增）
    const fuzzyMatches = this._fuzzyMatch(keywords);
    if (fuzzyMatches) {
      return fuzzyMatches;
    }

    // 3. 根据优先级分配
    if (task.priority === 'P0') {
      return 'AI 主策划'; // 高优先级任务由主策划处理
    }

    // 4. 默认分配
    return 'AI 主策划';
  }
  
  /**
   * 模糊匹配（100% 版本新增）
   */
  _fuzzyMatch(keywords) {
    // 编辑部相关
    if (keywords.includes('写') || keywords.includes('文章') || keywords.includes('内容')) {
      return '编辑部 - 资深撰稿人';
    }
    // 游戏设计相关
    if (keywords.includes('游戏') || keywords.includes('玩法') || keywords.includes('系统')) {
      return 'AI 主策划';
    }
    // 技术相关
    if (keywords.includes('代码') || keywords.includes('技术') || keywords.includes('架构')) {
      return 'AI 主程';
    }
    return null;
  }
  
  /**
   * 识别团队（100% 版本新增）
   */
  identifyTeam(userInput) {
    for (const [teamName, config] of Object.entries(this.teams)) {
      for (const trigger of config.triggerWords) {
        if (userInput.toLowerCase().includes(trigger.toLowerCase())) {
          return {
            name: teamName,
            config: config,
            confidence: 'high'
          };
        }
      }
    }
    return null;
  }
  
  /**
   * 路由到团队（100% 版本新增）
   */
  async routeToTeam(teamName, task) {
    const team = this.teams[teamName];
    if (!team) {
      throw new Error(`未知团队：${teamName}`);
    }
    
    // 获取团队 Agent 列表（延迟加载）
    const agents = this.getTeamAgents(teamName);
    
    console.log(`[Router] 路由到团队：${teamName} (${agents.length}人)`);
    
    // 返回团队配置，由 Orchestrator 协调执行
    return {
      type: 'team',
      teamName: teamName,
      agents: agents,
      workflow: team.workflow,
      task: task
    };
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
