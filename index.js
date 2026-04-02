#!/usr/bin/env node

/**
 * Orchestra - 多 Agent 编排系统
 * 
 * 统一入口
 * 
 * @example
 * const Orchestra = require('./orchestrator');
 * const orchestra = new Orchestra();
 * const result = await orchestra.run('设计一个抽卡系统');
 */

const TaskPlanner = require('./planner');
const AgentRouter = require('./router');
const ProgressTracker = require('./tracker');
const ResultAggregator = require('./aggregator');
const ErrorHandler = require('./error');

class Orchestra {
  constructor(options = {}) {
    this.options = {
      model: options.model || 'qwen3.5-plus',
      verbose: options.verbose || false,
      maxConcurrent: options.maxConcurrent || 5,
      timeout: options.timeout || 3600000,
      ...options
    };
    
    // 初始化核心模块
    this.planner = new TaskPlanner({
      model: this.options.model,
      verbose: this.options.verbose
    });
    
    this.router = new AgentRouter({
      verbose: this.options.verbose
    });
    
    this.tracker = new ProgressTracker({
      timeout: this.options.timeout,
      verbose: this.options.verbose
    });
    
    this.aggregator = new ResultAggregator({
      format: options.outputFormat || 'markdown',
      verbose: this.options.verbose
    });
    
    this.errorHandler = new ErrorHandler({
      maxRetries: options.maxRetries || 3,
      verbose: this.options.verbose
    });
    
    // 可用 AI 岗位
    this.availableAgents = options.agents || this._defaultAgents();
    
    console.log(`[Orchestra] 初始化完成，可用 Agent: ${this.availableAgents.length}个`);
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
      'AI 关卡策划',
      'AI 剧情策划',
      'AI 战斗策划',
      'AI 经济策划',
      'AI 活动策划',
      'AI 主美',
      'AI 美术总监',
      'AI 角色原画师',
      'AI 主程',
      'AI 客户端程序员',
      'AI 服务器程序员',
      'AI AI 技术总监',
      'AI 数据分析师',
      'AI 产品经理',
      'AI UX 设计师',
      'AI 社区经理',
      'AI 市场营销经理',
      'AI QA 主管',
      'AI 变现设计师',
      'AI 运营总监',
      'AI 用户运营',
      'AI 商业化运营'
    ];
  }

  /**
   * 执行任务（主入口）
   * @param {string} requirement - 需求描述
   * @returns {Promise<Object>} 执行结果
   */
  async run(requirement) {
    console.log(`\n🎻 Orchestra 开始执行任务`);
    console.log(`需求："${requirement}"\n`);
    
    const startTime = Date.now();
    
    try {
      // Phase 1: 任务分解
      console.log(`📋 Phase 1: 任务分解`);
      const subtasks = await this.planner.decompose(requirement, this.availableAgents);
      console.log(`分解为 ${subtasks.length} 个子任务\n`);
      
      // Phase 2: Agent 路由
      console.log(`🤖 Phase 2: Agent 路由`);
      const assignments = await this.router.route(subtasks);
      console.log();
      
      // Phase 3: 执行任务
      console.log(`⚙️  Phase 3: 执行任务`);
      await this._executeTasks(assignments);
      console.log();
      
      // Phase 4: 结果汇总
      console.log(`📊 Phase 4: 结果汇总`);
      const result = this.aggregator.aggregate({
        format: this.options.outputFormat,
        includeSuggestions: true
      });
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`执行完成，耗时：${duration}秒\n`);
      
      return {
        success: true,
        requirement: requirement,
        result: result,
        stats: this._generateStats(duration)
      };
      
    } catch (error) {
      console.error(`❌ 执行失败:`, error.message);
      
      return {
        success: false,
        requirement: requirement,
        error: error.message,
        stats: this._generateStats(((Date.now() - startTime) / 1000).toFixed(1))
      };
    }
  }

  /**
   * 执行所有任务
   */
  async _executeTasks(assignments) {
    // 注册进度事件
    this.tracker.on('progress', (data) => {
      const progress = this.tracker.getOverallProgress();
      console.log(`  进度：${progress}% - ${data.taskId}/${assignments.size}`);
    });
    
    this.tracker.on('complete', (data) => {
      console.log(`  ✅ 任务完成：${data.task.title}`);
    });
    
    this.tracker.on('error', (data) => {
      console.log(`  ❌ 任务错误：${data.task.title} - ${data.error}`);
    });
    
    // 添加任务到跟踪
    for (const [, assignment] of assignments.entries()) {
      this.tracker.track(assignment);
    }
    
    // 批量执行
    const tasks = [...assignments.entries()].map(([id, assignment]) => ({
      id: id,
      fn: async () => {
        // TODO: 实际调用 AI Agent 执行任务
        // 这里是模拟
        await this._sleep(1000);
        
        const result = {
          title: assignment.task.title,
          agent: assignment.agent,
          content: `**${assignment.task.title}**\n\n执行完成。`
        };
        
        this.aggregator.add(id, result);
        this.tracker.update(id, 'completed', 100);
        
        return { success: true, taskId: id, result };
      }
    }));
    
    await this.errorHandler.executeBatch(tasks, {
      maxConcurrent: this.options.maxConcurrent
    });
  }

  /**
   * 生成统计信息
   */
  _generateStats(duration) {
    return {
      duration: duration + '秒',
      totalTasks: this.tracker.tasks.size,
      status: this.tracker.getStatus(),
      errors: this.errorHandler.getStats(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 休眠
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取当前进度
   */
  getProgress() {
    return this.tracker.getStatus();
  }

  /**
   * 导出报告
   */
  exportReport(filePath, format = 'markdown') {
    return this.aggregator.exportToFile(filePath, { format });
  }

  /**
   * 注册自定义 Agent
   */
  registerAgent(name, config) {
    this.availableAgents.push(name);
    this.router.register(config.taskType, name);
    console.log(`[Orchestra] 注册新 Agent: ${name}`);
  }

  /**
   * 自定义路由规则
   */
  registerRoute(taskType, agent) {
    this.router.register(taskType, agent);
  }
}

// 导出
module.exports = Orchestra;

// CLI 入口
if (require.main === module) {
  const requirement = process.argv[2] || '设计一个抽卡系统';
  
  const orchestra = new Orchestra({
    verbose: true,
    maxConcurrent: 3
  });
  
  orchestra.run(requirement)
    .then(result => {
      if (result.success) {
        console.log('\n=== 执行结果 ===');
        console.log(result.result);
        console.log('\n=== 统计信息 ===');
        console.log(JSON.stringify(result.stats, null, 2));
      } else {
        console.error('执行失败:', result.error);
        process.exit(1);
      }
    })
    .catch(err => {
      console.error('未捕获的错误:', err.message);
      process.exit(1);
    });
}
