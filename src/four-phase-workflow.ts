/**
 * Orchestra Four-Phase Workflow
 * 
 * 四阶段工作流编排器：
 * 1. Research（研究）- Workers 并行调查
 * 2. Synthesis（综合）- Coordinator 制定方案
 * 3. Implementation（实现）- Workers 执行
 * 4. Verification（验证）- Workers 测试
 * 
 * 使用 Scratchpad 在阶段间传递数据，确保信息流畅共享
 * 
 * @author Orchestra AI System
 * @version 1.0.0
 */

import { Scratchpad, createScratchpad, type ScratchpadValue } from './scratchpad';
import { WorkerManager, WorkerConfig, WorkerStatus } from './worker-manager';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 四阶段工作流阶段枚举
 */
export enum WorkflowPhase {
  RESEARCH = 'research',           // 研究阶段
  SYNTHESIS = 'synthesis',         // 综合阶段
  IMPLEMENTATION = 'implementation', // 实现阶段
  VERIFICATION = 'verification'    // 验证阶段
}

/**
 * 工作流状态枚举
 */
export enum WorkflowStatus {
  IDLE = 'idle',               // 未开始
  RUNNING = 'running',         // 运行中
  PAUSED = 'paused',           // 已暂停
  COMPLETED = 'completed',     // 已完成
  FAILED = 'failed',           // 失败
  CANCELLED = 'cancelled'      // 已取消
}

/**
 * Research 阶段配置
 */
export interface ResearchPhaseConfig {
  /** 研究主题/问题 */
  topic: string;
  
  /** 研究子任务列表（每个任务由一个 Worker 负责） */
  subTasks: string[];
  
  /** 每个子任务的提示词模板 */
  promptTemplate?: (task: string, topic: string) => string;
  
  /** 并行 Worker 数量上限 */
  maxParallelWorkers?: number;
  
  /** 研究超时时间（毫秒） */
  timeoutMs?: number;
}

/**
 * Research 阶段结果
 */
export interface ResearchPhaseResult {
  /** 阶段状态 */
  status: 'success' | 'partial' | 'failed';
  
  /** 每个子任务的研究报告 */
  findings: Record<string, string>;
  
  /** 使用的 Worker ID 列表 */
  workerIds: string[];
  
  /** 执行时间（毫秒） */
  durationMs: number;
}

/**
 * Synthesis 阶段配置
 */
export interface SynthesisPhaseConfig {
  /** 综合目标 */
  objective: string;
  
  /** Coordinator 的提示词 */
  coordinatorPrompt?: string;
  
  /** 是否需要结构化输出 */
  structuredOutput?: boolean;
  
  /** 输出格式要求（如 JSON Schema） */
  outputSchema?: string;
  
  /** 超时时间（毫秒） */
  timeoutMs?: number;
}

/**
 * Synthesis 阶段结果
 */
export interface SynthesisPhaseResult {
  /** 阶段状态 */
  status: 'success' | 'failed';
  
  /** 综合方案/计划 */
  synthesizedPlan: string;
  
  /** 结构化数据（如果有） */
  structuredData?: any;
  
  /** Coordinator Worker ID */
  coordinatorWorkerId: string;
  
  /** 执行时间（毫秒） */
  durationMs: number;
}

/**
 * Implementation 阶段配置
 */
export interface ImplementationPhaseConfig {
  /** 实现目标 */
  objective: string;
  
  /** 实现任务列表 */
  tasks: ImplementationTask[];
  
  /** 任务分配策略 */
  assignmentStrategy?: 'round-robin' | 'skill-based' | 'load-balance';
  
  /** 超时时间（毫秒） */
  timeoutMs?: number;
}

/**
 * 实现任务
 */
export interface ImplementationTask {
  /** 任务 ID */
  id: string;
  
  /** 任务描述 */
  description: string;
  
  /** 任务提示词 */
  prompt: string;
  
  /** 依赖的任务 ID 列表 */
  dependencies?: string[];
  
  /** 预期产出物 */
  expectedDeliverable?: string;
}

/**
 * Implementation 阶段结果
 */
export interface ImplementationPhaseResult {
  /** 阶段状态 */
  status: 'success' | 'partial' | 'failed';
  
  /** 每个任务的实现结果 */
  deliverables: Record<string, string>;
  
  /** 使用的 Worker ID 列表 */
  workerIds: string[];
  
  /** 执行时间（毫秒） */
  durationMs: number;
}

/**
 * Verification 阶段配置
 */
export interface VerificationPhaseConfig {
  /** 验证标准 */
  criteria: string[];
  
  /** 验证任务列表 */
  testCases: VerificationTestCase[];
  
  /** 验证者提示词 */
  verifierPrompt?: string;
  
  /** 是否需要自动化测试 */
  requireAutomatedTests?: boolean;
  
  /** 超时时间（毫秒） */
  timeoutMs?: number;
}

/**
 * 验证测试用例
 */
export interface VerificationTestCase {
  /** 测试用例 ID */
  id: string;
  
  /** 测试描述 */
  description: string;
  
  /** 测试步骤 */
  steps: string[];
  
  /** 预期结果 */
  expectedResult: string;
  
  /** 关联的实现任务 ID */
  relatedTaskId?: string;
}

/**
 * Verification 阶段结果
 */
export interface VerificationPhaseResult {
  /** 阶段状态 */
  status: 'success' | 'partial' | 'failed';
  
  /** 每个测试用例的结果 */
  testResults: VerificationTestResult[];
  
  /** 总体通过率 */
  passRate: number;
  
  /** 使用的 Worker ID 列表 */
  workerIds: string[];
  
  /** 执行时间（毫秒） */
  durationMs: number;
}

/**
 * 验证测试结果
 */
export interface VerificationTestResult {
  /** 测试用例 ID */
  testCaseId: string;
  
  /** 测试结果 */
  result: 'pass' | 'fail' | 'partial';
  
  /** 实际结果 */
  actualResult: string;
  
  /** 备注/说明 */
  notes?: string;
}

/**
 * 完整工作流配置
 */
export interface FourPhaseWorkflowConfig {
  /** 工作流名称 */
  name: string;
  
  /** 工作流描述 */
  description: string;
  
  /** 研究阶段配置 */
  research: ResearchPhaseConfig;
  
  /** 综合阶段配置 */
  synthesis: SynthesisPhaseConfig;
  
  /** 实现阶段配置 */
  implementation: ImplementationPhaseConfig;
  
  /** 验证阶段配置 */
  verification: VerificationPhaseConfig;
  
  /** 全局配置 */
  global?: {
    /** 默认模型 */
    defaultModel?: string;
    /** Scratchpad 存储路径 */
    scratchpadPath?: string;
    /** 是否启用详细日志 */
    verbose?: boolean;
  };
}

/**
 * 工作流执行结果
 */
export interface WorkflowExecutionResult {
  /** 工作流状态 */
  status: WorkflowStatus;
  
  /** 各阶段结果 */
  phases: {
    research?: ResearchPhaseResult;
    synthesis?: SynthesisPhaseResult;
    implementation?: ImplementationPhaseResult;
    verification?: VerificationPhaseResult;
  };
  
  /** 总执行时间（毫秒） */
  totalDurationMs: number;
  
  /** 错误信息（如果有） */
  error?: string;
}

// ============================================================================
// Four-Phase Workflow 类
// ============================================================================

/**
 * 四阶段工作流编排器
 * 
 * 核心职责：
 * 1. 编排四个阶段的执行顺序
 * 2. 管理每个阶段的 Worker 生命周期
 * 3. 使用 Scratchpad 在阶段间传递数据
 * 4. 提供完整的执行结果和日志
 * 
 * @example
 * ```typescript
 * const workflow = new FourPhaseWorkflow({
 *   name: '功能开发工作流',
 *   description: '从需求调研到验证的完整开发流程',
 *   research: {
 *     topic: '用户登录功能',
 *     subTasks: ['竞品分析', '技术方案调研', '用户需求分析']
 *   },
 *   synthesis: {
 *     objective: '制定完整的登录功能实现方案'
 *   },
 *   implementation: {
 *     objective: '实现登录功能',
 *     tasks: [...]
 *   },
 *   verification: {
 *     criteria: ['功能正确', '性能达标', '安全可靠'],
 *     testCases: [...]
 *   }
 * });
 * 
 * const result = await workflow.execute();
 * ```
 */
export class FourPhaseWorkflow {
  /** 工作流配置 */
  private config: FourPhaseWorkflowConfig;
  
  /** 工作流状态 */
  private status: WorkflowStatus = WorkflowStatus.IDLE;
  
  /** Scratchpad 实例 */
  private scratchpad: Scratchpad;
  
  /** Worker 管理器实例 */
  private workerManager: WorkerManager;
  
  /** 当前阶段 */
  private currentPhase: WorkflowPhase | null = null;
  
  /** 执行开始时间 */
  private startTime: number = 0;
  
  /** 活动 Worker ID 列表 */
  private activeWorkers: Set<string> = new Set();

  constructor(config: FourPhaseWorkflowConfig) {
    this.config = config;
    
    // 初始化 Scratchpad
    this.scratchpad = createScratchpad({
      storagePath: config.global?.scratchpadPath,
      workerId: `workflow-${config.name.replace(/\s+/g, '-').toLowerCase()}`
    });
    
    // 初始化 Worker 管理器
    this.workerManager = new WorkerManager();
    
    console.log(`[FourPhaseWorkflow] Initialized: ${config.name}`);
  }

  // ============================================================================
  // 核心执行方法
  // ============================================================================

  /**
   * 执行完整四阶段工作流
   * 
   * @returns 工作流执行结果
   */
  async execute(): Promise<WorkflowExecutionResult> {
    this.startTime = Date.now();
    this.status = WorkflowStatus.RUNNING;
    
    const result: WorkflowExecutionResult = {
      status: WorkflowStatus.RUNNING,
      phases: {},
      totalDurationMs: 0
    };
    
    try {
      // ========== 阶段 1: Research ==========
      console.log('[FourPhaseWorkflow] Starting Phase 1: Research');
      this.currentPhase = WorkflowPhase.RESEARCH;
      
      const researchResult = await this.executeResearchPhase();
      result.phases.research = researchResult;
      
      if (researchResult.status === 'failed') {
        throw new Error('Research phase failed');
      }
      
      // ========== 阶段 2: Synthesis ==========
      console.log('[FourPhaseWorkflow] Starting Phase 2: Synthesis');
      this.currentPhase = WorkflowPhase.SYNTHESIS;
      
      const synthesisResult = await this.executeSynthesisPhase();
      result.phases.synthesis = synthesisResult;
      
      if (synthesisResult.status === 'failed') {
        throw new Error('Synthesis phase failed');
      }
      
      // ========== 阶段 3: Implementation ==========
      console.log('[FourPhaseWorkflow] Starting Phase 3: Implementation');
      this.currentPhase = WorkflowPhase.IMPLEMENTATION;
      
      const implementationResult = await this.executeImplementationPhase();
      result.phases.implementation = implementationResult;
      
      if (implementationResult.status === 'failed') {
        throw new Error('Implementation phase failed');
      }
      
      // ========== 阶段 4: Verification ==========
      console.log('[FourPhaseWorkflow] Starting Phase 4: Verification');
      this.currentPhase = WorkflowPhase.VERIFICATION;
      
      const verificationResult = await this.executeVerificationPhase();
      result.phases.verification = verificationResult;
      
      // ========== 完成 ==========
      this.status = WorkflowStatus.COMPLETED;
      result.status = WorkflowStatus.COMPLETED;
      
      console.log('[FourPhaseWorkflow] Workflow completed successfully');
      
    } catch (error: any) {
      this.status = WorkflowStatus.FAILED;
      result.status = WorkflowStatus.FAILED;
      result.error = error.message;
      
      console.error('[FourPhaseWorkflow] Workflow failed:', error);
      
      // 清理所有活动 Worker
      await this.cleanupAllWorkers();
    } finally {
      result.totalDurationMs = Date.now() - this.startTime;
      this.currentPhase = null;
      
      // 最终清理
      await this.cleanupAllWorkers();
    }
    
    return result;
  }

  // ============================================================================
  // 阶段 1: Research（研究）
  // ============================================================================

  /**
   * 执行研究阶段
   * Workers 并行调查不同子任务
   */
  private async executeResearchPhase(): Promise<ResearchPhaseResult> {
    const phaseStart = Date.now();
    const config = this.config.research;
    const findings: Record<string, string> = {};
    const workerIds: string[] = [];
    
    // 1. 将研究主题写入 Scratchpad
    await this.scratchpad.write('research-topic', {
      type: 'text',
      content: config.topic
    });
    
    // 2. 为每个子任务创建 Worker
    const maxParallel = config.maxParallelWorkers || config.subTasks.length;
    const batches = this.chunkArray(config.subTasks, maxParallel);
    
    let hasFailure = false;
    
    for (const batch of batches) {
      const batchPromises = batch.map(async (subTask) => {
        const workerId = await this.createResearchWorker(subTask, config);
        workerIds.push(workerId);
        this.activeWorkers.add(workerId);
        
        try {
          // 等待 Worker 完成研究
          const finding = await this.waitForResearchCompletion(workerId, config.timeoutMs);
          findings[subTask] = finding;
          
          // 将研究发现写入 Scratchpad
          await this.scratchpad.write(`research-${this.sanitizeKey(subTask)}`, {
            type: 'text',
            content: finding
          });
          
          console.log(`[Research] Completed: ${subTask}`);
        } catch (error: any) {
          console.error(`[Research] Failed for task "${subTask}":`, error.message);
          hasFailure = true;
          findings[subTask] = `研究失败：${error.message}`;
        } finally {
          // 停止 Worker
          await this.workerManager.stopWorker(workerId, { graceful: true });
          this.activeWorkers.delete(workerId);
        }
      });
      
      // 等待当前批次完成
      await Promise.all(batchPromises);
    }
    
    // 3. 汇总所有研究发现
    const allFindings = Object.entries(findings)
      .map(([task, finding]) => `## ${task}\n${finding}`)
      .join('\n\n');
    
    await this.scratchpad.write('research-summary', {
      type: 'text',
      content: `# 研究报告汇总\n\n主题：${config.topic}\n\n${allFindings}`
    });
    
    const durationMs = Date.now() - phaseStart;
    
    return {
      status: hasFailure ? 'partial' : 'success',
      findings,
      workerIds,
      durationMs
    };
  }

  /**
   * 创建研究 Worker
   */
  private async createResearchWorker(
    subTask: string, 
    config: ResearchPhaseConfig
  ): Promise<string> {
    const promptTemplate = config.promptTemplate || this.defaultResearchPrompt;
    const prompt = promptTemplate(subTask, config.topic);
    
    const workerConfig: WorkerConfig = {
      description: `研究 Worker - ${subTask}`,
      agentType: 'specialist',
      prompt: prompt,
      initialMessage: `请开始研究：${subTask}`
    };
    
    return await this.workerManager.createWorker(workerConfig);
  }

  /**
   * 默认研究提示词模板
   */
  private defaultResearchPrompt(task: string, topic: string): string {
    return `你是专业研究员，负责调研"${topic}"主题下的"${task}"子课题。

请完成以下任务：
1. 深入调研该子课题的关键信息
2. 收集相关数据、案例和最佳实践
3. 分析优缺点和潜在风险
4. 输出结构化的研究报告

研究报告格式：
## 背景
## 关键发现
## 数据分析
## 结论与建议

请确保信息准确、全面、有深度。`;
  }

  /**
   * 等待研究完成
   */
  private async waitForResearchCompletion(
    workerId: string, 
    timeoutMs?: number
  ): Promise<string> {
    const result = await this.workerManager.continueWorker(
      workerId,
      '请输出完整的研究结论',
      {
        waitForResponse: true,
        timeoutMs: timeoutMs || 300000 // 默认 5 分钟
      }
    );
    
    return result.response || '无研究结果';
  }

  // ============================================================================
  // 阶段 2: Synthesis（综合）
  // ============================================================================

  /**
   * 执行综合阶段
   * Coordinator 整合研究发现，制定方案
   */
  private async executeSynthesisPhase(): Promise<SynthesisPhaseResult> {
    const phaseStart = Date.now();
    const config = this.config.synthesis;
    
    // 1. 从 Scratchpad 读取所有研究发现
    const researchSummary = await this.scratchpad.read('research-summary');
    if (!researchSummary || researchSummary.type !== 'text') {
      throw new Error('No research summary found in scratchpad');
    }
    
    // 2. 创建 Coordinator Worker
    const coordinatorPrompt = config.coordinatorPrompt || this.defaultCoordinatorPrompt;
    const coordinatorConfig: WorkerConfig = {
      description: '综合协调员 - 整合研究发现，制定执行方案',
      agentType: 'agent',
      prompt: coordinatorPrompt,
      initialMessage: `请根据以下研究发现，制定完整的执行方案：\n\n${researchSummary.content}`
    };
    
    const coordinatorWorkerId = await this.workerManager.createWorker(coordinatorConfig);
    this.activeWorkers.add(coordinatorWorkerId);
    
    // 3. 等待 Coordinator 输出方案
    try {
      const result = await this.workerManager.continueWorker(
        coordinatorWorkerId,
        '请输出完整的综合方案，包括：目标、策略、实施步骤、资源需求、风险评估',
        {
          waitForResponse: true,
          timeoutMs: config.timeoutMs || 600000 // 默认 10 分钟
        }
      );
      
      const synthesizedPlan = result.response || '无综合方案';
      
      // 4. 将综合方案写入 Scratchpad
      await this.scratchpad.write('synthesis-plan', {
        type: 'text',
        content: synthesizedPlan
      });
      
      // 5. 如果是结构化输出，解析 JSON
      let structuredData: any = undefined;
      if (config.structuredOutput) {
        try {
          // 尝试从响应中提取 JSON
          const jsonMatch = synthesizedPlan.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            structuredData = JSON.parse(jsonMatch[0]);
            await this.scratchpad.write('synthesis-structured', {
              type: 'json',
              data: structuredData
            });
          }
        } catch (e) {
          console.warn('[Synthesis] Failed to parse structured output:', e);
        }
      }
      
      const durationMs = Date.now() - phaseStart;
      
      return {
        status: 'success',
        synthesizedPlan,
        structuredData,
        coordinatorWorkerId,
        durationMs
      };
      
    } finally {
      // 停止 Coordinator
      await this.workerManager.stopWorker(coordinatorWorkerId, { graceful: true });
      this.activeWorkers.delete(coordinatorWorkerId);
    }
  }

  /**
   * 默认 Coordinator 提示词
   */
  private defaultCoordinatorPrompt: string = `你是经验丰富的项目协调员，擅长整合多方信息并制定可执行的方案。

你的职责：
1. 仔细阅读所有研究报告
2. 识别关键洞察和模式
3. 制定清晰、可执行的综合方案
4. 考虑资源约束和风险

输出要求：
- 结构清晰、逻辑严密
- 包含具体实施步骤
- 明确责任分工
- 评估潜在风险及应对措施`;

  // ============================================================================
  // 阶段 3: Implementation（实现）
  // ============================================================================

  /**
   * 执行实现阶段
   * Workers 根据综合方案执行具体任务
   */
  private async executeImplementationPhase(): Promise<ImplementationPhaseResult> {
    const phaseStart = Date.now();
    const config = this.config.implementation;
    const deliverables: Record<string, string> = {};
    const workerIds: string[] = [];
    
    // 1. 从 Scratchpad 读取综合方案
    const synthesisPlan = await this.scratchpad.read('synthesis-plan');
    if (!synthesisPlan || synthesisPlan.type !== 'text') {
      throw new Error('No synthesis plan found in scratchpad');
    }
    
    // 2. 将综合方案写入 Scratchpad 供 Workers 参考
    await this.scratchpad.write('implementation-context', {
      type: 'text',
      content: `综合方案：\n${synthesisPlan.content}\n\n请根据上述方案执行你的任务。`
    });
    
    // 3. 按依赖关系排序任务（拓扑排序）
    const sortedTasks = this.topologicalSort(config.tasks);
    
    let hasFailure = false;
    
    // 4. 执行任务
    for (const task of sortedTasks) {
      const workerId = await this.createImplementationWorker(task);
      workerIds.push(workerId);
      this.activeWorkers.add(workerId);
      
      try {
        // 等待任务完成
        const deliverable = await this.waitForTaskCompletion(
          workerId, 
          task,
          config.timeoutMs
        );
        
        deliverables[task.id] = deliverable;
        
        // 将产出物写入 Scratchpad
        await this.scratchpad.write(`deliverable-${task.id}`, {
          type: 'text',
          content: deliverable
        });
        
        console.log(`[Implementation] Completed task: ${task.id}`);
        
      } catch (error: any) {
        console.error(`[Implementation] Failed task "${task.id}":`, error.message);
        hasFailure = true;
        deliverables[task.id] = `实现失败：${error.message}`;
      } finally {
        await this.workerManager.stopWorker(workerId, { graceful: true });
        this.activeWorkers.delete(workerId);
      }
    }
    
    const durationMs = Date.now() - phaseStart;
    
    return {
      status: hasFailure ? 'partial' : 'success',
      deliverables,
      workerIds,
      durationMs
    };
  }

  /**
   * 创建实现 Worker
   */
  private async createImplementationWorker(task: ImplementationTask): Promise<string> {
    const workerConfig: WorkerConfig = {
      description: `实现 Worker - ${task.id}`,
      agentType: 'specialist',
      prompt: task.prompt,
      initialMessage: `请执行任务：${task.description}`
    };
    
    return await this.workerManager.createWorker(workerConfig);
  }

  /**
   * 等待任务完成
   */
  private async waitForTaskCompletion(
    workerId: string,
    task: ImplementationTask,
    timeoutMs?: number
  ): Promise<string> {
    const result = await this.workerManager.continueWorker(
      workerId,
      `请完成任务并交付：${task.expectedDeliverable || '任务成果'}`,
      {
        waitForResponse: true,
        timeoutMs: timeoutMs || 600000
      }
    );
    
    return result.response || '无交付物';
  }

  /**
   * 拓扑排序（处理任务依赖）
   */
  private topologicalSort(tasks: ImplementationTask[]): ImplementationTask[] {
    // 简化实现：如果有依赖，按依赖顺序排列
    // 实际场景可能需要更复杂的图算法
    const sorted: ImplementationTask[] = [];
    const visited = new Set<string>();
    
    const visit = (task: ImplementationTask) => {
      if (visited.has(task.id)) return;
      
      // 先处理依赖
      if (task.dependencies) {
        for (const depId of task.dependencies) {
          const depTask = tasks.find(t => t.id === depId);
          if (depTask) {
            visit(depTask);
          }
        }
      }
      
      visited.add(task.id);
      sorted.push(task);
    };
    
    for (const task of tasks) {
      visit(task);
    }
    
    return sorted;
  }

  // ============================================================================
  // 阶段 4: Verification（验证）
  // ============================================================================

  /**
   * 执行验证阶段
   * Workers 测试实现结果
   */
  private async executeVerificationPhase(): Promise<VerificationPhaseResult> {
    const phaseStart = Date.now();
    const config = this.config.verification;
    const testResults: VerificationTestResult[] = [];
    const workerIds: string[] = [];
    
    // 1. 从 Scratchpad 读取所有交付物
    const deliverablesContext: string[] = [];
    for (const task of this.config.implementation.tasks) {
      const deliverable = await this.scratchpad.read(`deliverable-${task.id}`);
      if (deliverable && deliverable.type === 'text') {
        deliverablesContext.push(`任务 ${task.id}:\n${deliverable.content}`);
      }
    }
    
    await this.scratchpad.write('verification-context', {
      type: 'text',
      content: `待验证的交付物：\n\n${deliverablesContext.join('\n\n')}`
    });
    
    // 2. 为每个测试用例创建验证 Worker
    let passCount = 0;
    
    for (const testCase of config.testCases) {
      const workerId = await this.createVerificationWorker(testCase, config);
      workerIds.push(workerId);
      this.activeWorkers.add(workerId);
      
      try {
        const testResult = await this.waitForTestCompletion(
          workerId,
          testCase,
          config.timeoutMs
        );
        
        testResults.push(testResult);
        
        if (testResult.result === 'pass') {
          passCount++;
        }
        
        console.log(`[Verification] Test ${testCase.id}: ${testResult.result}`);
        
      } catch (error: any) {
        console.error(`[Verification] Test "${testCase.id}" failed:`, error.message);
        testResults.push({
          testCaseId: testCase.id,
          result: 'fail',
          actualResult: `测试执行失败：${error.message}`
        });
      } finally {
        await this.workerManager.stopWorker(workerId, { graceful: true });
        this.activeWorkers.delete(workerId);
      }
    }
    
    const passRate = passCount / config.testCases.length;
    const durationMs = Date.now() - phaseStart;
    
    // 3. 将验证结果写入 Scratchpad
    await this.scratchpad.write('verification-report', {
      type: 'json',
      data: {
        passRate,
        totalTests: config.testCases.length,
        passedTests: passCount,
        testResults
      }
    });
    
    return {
      status: passRate === 1 ? 'success' : passRate > 0.5 ? 'partial' : 'failed',
      testResults,
      passRate,
      workerIds,
      durationMs
    };
  }

  /**
   * 创建验证 Worker
   */
  private async createVerificationWorker(
    testCase: VerificationTestCase,
    config: VerificationPhaseConfig
  ): Promise<string> {
    const verifierPrompt = config.verifierPrompt || this.defaultVerifierPrompt;
    
    const workerConfig: WorkerConfig = {
      description: `验证 Worker - ${testCase.id}`,
      agentType: 'specialist',
      prompt: verifierPrompt,
      initialMessage: `请执行测试用例：${testCase.description}`
    };
    
    return await this.workerManager.createWorker(workerConfig);
  }

  /**
   * 默认验证者提示词
   */
  private defaultVerifierPrompt: string = `你是严谨的测试工程师，负责验证实现结果是否符合要求。

你的职责：
1. 仔细阅读测试用例和预期结果
2. 执行测试步骤
3. 对比实际结果与预期结果
4. 给出明确的测试结论（通过/失败/部分通过）

输出格式：
## 测试步骤执行
## 实际结果
## 与预期的差异
## 测试结论`;

  /**
   * 等待测试完成
   */
  private async waitForTestCompletion(
    workerId: string,
    testCase: VerificationTestCase,
    timeoutMs?: number
  ): Promise<VerificationTestResult> {
    const steps = testCase.steps.join('\n');
    
    const result = await this.workerManager.continueWorker(
      workerId,
      `请执行以下测试步骤并报告结果：\n${steps}\n\n预期结果：${testCase.expectedResult}`,
      {
        waitForResponse: true,
        timeoutMs: timeoutMs || 300000
      }
    );
    
    const response = result.response || '';
    
    // 简单判断测试结果（实际场景可能需要更智能的解析）
    const resultLower = response.toLowerCase();
    let testResult: 'pass' | 'fail' | 'partial' = 'fail';
    
    if (resultLower.includes('通过') || resultLower.includes('pass')) {
      if (resultLower.includes('部分') || resultLower.includes('partial')) {
        testResult = 'partial';
      } else {
        testResult = 'pass';
      }
    }
    
    return {
      testCaseId: testCase.id,
      result: testResult,
      actualResult: response
    };
  }

  // ============================================================================
  // 辅助方法
  // ============================================================================

  /**
   * 清理所有活动 Worker
   */
  private async cleanupAllWorkers(): Promise<void> {
    const cleanupPromises = Array.from(this.activeWorkers).map(workerId =>
      this.workerManager.stopWorker(workerId, { graceful: false })
        .catch(e => console.warn(`[FourPhaseWorkflow] Failed to stop worker ${workerId}:`, e))
    );
    
    await Promise.all(cleanupPromises);
    this.activeWorkers.clear();
  }

  /**
   * 数组分块
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * 清理键名（用于 Scratchpad）
   */
  private sanitizeKey(key: string): string {
    return key.replace(/[^a-zA-Z0-9_-]/g, '-');
  }

  // ============================================================================
  // 公共 API
  // ============================================================================

  /**
   * 获取当前状态
   */
  getStatus(): WorkflowStatus {
    return this.status;
  }

  /**
   * 获取当前阶段
   */
  getCurrentPhase(): WorkflowPhase | null {
    return this.currentPhase;
  }

  /**
   * 获取 Scratchpad 实例（用于外部访问）
   */
  getScratchpad(): Scratchpad {
    return this.scratchpad;
  }

  /**
   * 获取 Worker 管理器（用于外部访问）
   */
  getWorkerManager(): WorkerManager {
    return this.workerManager;
  }

  /**
   * 暂停工作流
   */
  pause(): void {
    if (this.status === WorkflowStatus.RUNNING) {
      this.status = WorkflowStatus.PAUSED;
      console.log('[FourPhaseWorkflow] Paused');
    }
  }

  /**
   * 恢复工作流
   */
  resume(): void {
    if (this.status === WorkflowStatus.PAUSED) {
      this.status = WorkflowStatus.RUNNING;
      console.log('[FourPhaseWorkflow] Resumed');
    }
  }

  /**
   * 取消工作流
   */
  async cancel(): Promise<void> {
    if (this.status === WorkflowStatus.RUNNING || this.status === WorkflowStatus.PAUSED) {
      this.status = WorkflowStatus.CANCELLED;
      console.log('[FourPhaseWorkflow] Cancelled');
      await this.cleanupAllWorkers();
    }
  }
}

// ============================================================================
// 完整示例场景
// ============================================================================

/**
 * 示例：开发一个用户登录功能
 * 
 * 演示完整的四阶段工作流：
 * 1. Research: 调研登录功能的最佳实践
 * 2. Synthesis: 制定实现方案
 * 3. Implementation: 实现各个模块
 * 4. Verification: 测试功能
 */
export async function exampleLoginFeatureWorkflow() {
  console.log('========== 示例：用户登录功能开发工作流 ==========\n');
  
  const workflow = new FourPhaseWorkflow({
    name: '用户登录功能开发',
    description: '从需求调研到验证的完整登录功能开发流程',
    
    // 阶段 1: Research
    research: {
      topic: '用户登录功能',
      subTasks: [
        '竞品分析：主流产品的登录方式对比',
        '技术方案调研：OAuth2.0、JWT、Session 等方案优劣',
        '安全最佳实践：密码加密、防暴力破解、防 CSRF'
      ],
      maxParallelWorkers: 3,
      timeoutMs: 300000 // 5 分钟
    },
    
    // 阶段 2: Synthesis
    synthesis: {
      objective: '制定完整的登录功能实现方案',
      structuredOutput: true,
      timeoutMs: 600000 // 10 分钟
    },
    
    // 阶段 3: Implementation
    implementation: {
      objective: '实现登录功能',
      tasks: [
        {
          id: 'backend-api',
          description: '实现后端登录 API',
          prompt: '你是后端工程师，请使用 Node.js + Express 实现登录 API，包括密码验证、JWT 生成等',
          expectedDeliverable: '可运行的登录 API 代码'
        },
        {
          id: 'frontend-ui',
          description: '实现前端登录界面',
          prompt: '你是前端工程师，请使用 React + TypeScript 实现登录界面，包括表单验证、错误提示等',
          expectedDeliverable: '可运行的登录界面组件',
          dependencies: ['backend-api'] // 依赖后端 API 设计
        },
        {
          id: 'security-hardening',
          description: '安全加固',
          prompt: '你是安全工程师，请审查代码并实施安全加固措施',
          expectedDeliverable: '安全审查报告和改进代码',
          dependencies: ['backend-api', 'frontend-ui']
        }
      ],
      timeoutMs: 600000
    },
    
    // 阶段 4: Verification
    verification: {
      criteria: ['功能正确', '性能达标', '安全可靠'],
      testCases: [
        {
          id: 'tc-001',
          description: '正常登录流程测试',
          steps: [
            '输入正确的用户名和密码',
            '点击登录按钮',
            '验证跳转到首页',
            '验证用户信息正确显示'
          ],
          expectedResult: '用户成功登录并跳转到首页',
          relatedTaskId: 'backend-api'
        },
        {
          id: 'tc-002',
          description: '错误密码测试',
          steps: [
            '输入正确的用户名和错误的密码',
            '点击登录按钮',
            '验证错误提示显示'
          ],
          expectedResult: '显示"密码错误"提示，不跳转页面',
          relatedTaskId: 'backend-api'
        },
        {
          id: 'tc-003',
          description: '暴力破解防护测试',
          steps: [
            '连续输入错误密码 5 次',
            '验证账户是否被临时锁定',
            '验证是否有验证码要求'
          ],
          expectedResult: '账户被锁定 15 分钟，要求输入验证码',
          relatedTaskId: 'security-hardening'
        }
      ],
      timeoutMs: 300000
    },
    
    global: {
      verbose: true
    }
  });
  
  // 执行工作流
  const result = await workflow.execute();
  
  // 输出结果
  console.log('\n========== 工作流执行结果 ==========\n');
  console.log(`状态：${result.status}`);
  console.log(`总耗时：${result.totalDurationMs / 1000}秒`);
  
  if (result.error) {
    console.log(`错误：${result.error}`);
  }
  
  if (result.phases.research) {
    console.log(`\n研究阶段：${result.phases.research.status}`);
    console.log(`  完成子任务：${Object.keys(result.phases.research.findings).length}`);
  }
  
  if (result.phases.synthesis) {
    console.log(`\n综合阶段：${result.phases.synthesis.status}`);
    console.log(`  方案长度：${result.phases.synthesis.synthesizedPlan.length}字符`);
  }
  
  if (result.phases.implementation) {
    console.log(`\n实现阶段：${result.phases.implementation.status}`);
    console.log(`  完成任务：${Object.keys(result.phases.implementation.deliverables).length}`);
  }
  
  if (result.phases.verification) {
    console.log(`\n验证阶段：${result.phases.verification.status}`);
    console.log(`  通过率：${(result.phases.verification.passRate * 100).toFixed(1)}%`);
    console.log(`  测试用例：${result.phases.verification.testResults.length}`);
  }
  
  return result;
}

// ============================================================================
// 导出
// ============================================================================

export default FourPhaseWorkflow;
