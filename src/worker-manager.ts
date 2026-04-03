/**
 * Orchestra Worker Manager
 * 
 * 基于 Claude Coordinator 设计模式的 Worker 管理系统
 * 负责创建、管理和协调多个子代理 Worker
 * 
 * @author Orchestra Core Team
 * @version 1.0.0
 */

import { sessions_spawn, process } from './openclaw-api';
import type { SessionConfig, ProcessAction, ProcessResult } from './types';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * Worker 状态枚举
 */
export enum WorkerStatus {
  IDLE = 'idle',           // 空闲状态
  RUNNING = 'running',     // 正在执行任务
  PAUSED = 'paused',       // 已暂停
  STOPPED = 'stopped',     // 已停止
  ERROR = 'error'          // 错误状态
}

/**
 * Worker 配置接口
 * 对应 AGENT_TOOL_NAME 的输入参数
 */
export interface WorkerConfig {
  /** Worker 描述，用于标识其职责 */
  description: string;
  
  /** 子代理类型：agent、task、flow 等 */
  agentType: 'agent' | 'task' | 'flow' | 'specialist';
  
  /** Worker 的系统提示词，定义其行为模式 */
  prompt: string;
  
  /** 可选：父 Worker ID，用于建立层级关系 */
  parentWorkerId?: string;
  
  /** 可选：初始消息 */
  initialMessage?: string;
  
  /** 可选：模型配置 */
  model?: string;
  
  /** 可选：思考模式 */
  thinking?: boolean;
}

/**
 * Worker 实例接口
 */
export interface Worker {
  /** Worker 唯一标识符 */
  workerId: string;
  
  /** 会话 ID */
  sessionId: string;
  
  /** Worker 配置 */
  config: WorkerConfig;
  
  /** 当前状态 */
  status: WorkerStatus;
  
  /** 创建时间戳 */
  createdAt: number;
  
  /** 最后活动时间戳 */
  lastActiveAt: number;
  
  /** 消息历史计数 */
  messageCount: number;
  
  /** 上下文令牌数（估算） */
  contextTokens?: number;
}

/**
 * Continue vs. Spawn 决策结果
 */
export interface ContinueDecision {
  /** 是否应该继续现有 Worker */
  shouldContinue: boolean;
  
  /** 决策理由 */
  reason: string;
  
  /** 推荐的 Worker ID（如果继续） */
  recommendedWorkerId?: string;
  
  /** 决策矩阵得分 */
  scores: DecisionScores;
}

/**
 * 决策矩阵得分
 */
export interface DecisionScores {
  /** 上下文重叠度得分 (0-100) */
  contextOverlap: number;
  
  /** 任务连续性得分 (0-100) */
  taskContinuity: number;
  
  /** 资源效率得分 (0-100) */
  resourceEfficiency: number;
  
  /** 综合得分 (0-100) */
  totalScore: number;
}

// ============================================================================
// Worker 管理器类
// ============================================================================

/**
 * Worker Manager
 * 
 * 核心功能：
 * 1. Worker 创建工具 (AGENT_TOOL_NAME)
 * 2. Worker 继续工具 (SEND_MESSAGE_TOOL_NAME)
 * 3. Worker 停止工具 (TASK_STOP_TOOL_NAME)
 * 4. Continue vs. Spawn 决策逻辑
 */
export class WorkerManager {
  /** Worker 实例映射表 */
  private workers: Map<string, Worker> = new Map();
  
  /** Worker 会话 ID 到 Worker ID 的反向映射 */
  private sessionToWorker: Map<string, string> = new Map();
  
  /** 默认配置 */
  private defaultConfig: Partial<WorkerConfig> = {
    agentType: 'agent',
    model: 'bailian/qwen3.5-plus',
    thinking: false
  };

  // ==========================================================================
  // 1. Worker 创建工具 (对应 AGENT_TOOL_NAME)
  // ==========================================================================

  /**
   * 创建新的 Worker
   * 
   * @param config - Worker 配置
   * @returns Worker ID
   * 
   * @example
   * ```typescript
   * const workerId = await manager.createWorker({
   *   description: '负责小红书内容创作的专家',
   *   agentType: 'specialist',
   *   prompt: '你是小红书内容创作专家，擅长...',
   *   initialMessage: '请帮我写一篇关于 AI 助手的笔记'
   * });
   * ```
   */
  async createWorker(config: WorkerConfig): Promise<string> {
    // 1. 验证配置
    this.validateWorkerConfig(config);
    
    // 2. 合并默认配置
    const mergedConfig: WorkerConfig = {
      ...this.defaultConfig,
      ...config
    };
    
    // 3. 构建会话配置
    const sessionConfig: SessionConfig = {
      agent: mergedConfig.agentType,
      prompt: mergedConfig.prompt,
      model: mergedConfig.model,
      thinking: mergedConfig.thinking,
      // 如果有父 Worker，继承其上下文
      inheritContext: !!mergedConfig.parentWorkerId,
      parentSessionId: mergedConfig.parentWorkerId 
        ? this.workers.get(mergedConfig.parentWorkerId)?.sessionId 
        : undefined
    };
    
    // 4. 调用 OpenClaw sessions_spawn API
    const spawnResult = await sessions_spawn(sessionConfig);
    
    // 5. 创建 Worker 实例
    const workerId = this.generateWorkerId();
    const worker: Worker = {
      workerId,
      sessionId: spawnResult.sessionId,
      config: mergedConfig,
      status: WorkerStatus.IDLE,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      messageCount: 0
    };
    
    // 6. 注册 Worker
    this.workers.set(workerId, worker);
    this.sessionToWorker.set(spawnResult.sessionId, workerId);
    
    // 7. 如果有初始消息，发送之
    if (mergedConfig.initialMessage) {
      await this.sendMessage(workerId, mergedConfig.initialMessage);
    }
    
    console.log(`[WorkerManager] Created worker: ${workerId} (session: ${spawnResult.sessionId})`);
    
    return workerId;
  }

  /**
   * 验证 Worker 配置
   */
  private validateWorkerConfig(config: WorkerConfig): void {
    if (!config.description || config.description.trim().length === 0) {
      throw new Error('Worker description is required');
    }
    
    if (!config.prompt || config.prompt.trim().length === 0) {
      throw new Error('Worker prompt is required');
    }
    
    if (!['agent', 'task', 'flow', 'specialist'].includes(config.agentType)) {
      throw new Error(`Invalid agent type: ${config.agentType}`);
    }
  }

  /**
   * 生成 Worker ID
   * 格式：worker_<timestamp>_<random>
   */
  private generateWorkerId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `worker_${timestamp}_${random}`;
  }

  // ==========================================================================
  // 2. Worker 继续工具 (对应 SEND_MESSAGE_TOOL_NAME)
  // ==========================================================================

  /**
   * 向现有 Worker 发送消息（继续对话）
   * 
   * @param workerId - Worker ID
   * @param message - 消息内容
   * @param options - 可选配置
   * @returns 处理结果
   * 
   * @example
   * ```typescript
   * await manager.continueWorker('worker_abc123', '请继续完善这个功能');
   * ```
   */
  async continueWorker(
    workerId: string, 
    message: string,
    options?: {
      /** 是否等待响应 */
      waitForResponse?: boolean;
      /** 超时时间（毫秒） */
      timeoutMs?: number;
    }
  ): Promise<{ success: boolean; response?: string }> {
    // 1. 查找 Worker
    const worker = this.workers.get(workerId);
    if (!worker) {
      throw new Error(`Worker not found: ${workerId}`);
    }
    
    // 2. 检查 Worker 状态
    if (worker.status === WorkerStatus.STOPPED) {
      throw new Error(`Worker is stopped: ${workerId}`);
    }
    
    // 3. 更新 Worker 状态
    worker.status = WorkerStatus.RUNNING;
    worker.lastActiveAt = Date.now();
    worker.messageCount++;
    
    // 4. 使用 process 工具发送消息
    const result = await process({
      action: 'send-keys',
      sessionId: worker.sessionId,
      text: message
    });
    
    // 5. 可选：等待响应
    if (options?.waitForResponse) {
      const response = await this.waitForWorkerResponse(
        worker.sessionId, 
        options.timeoutMs || 30000
      );
      worker.contextTokens = response.tokenCount;
      return { success: true, response: response.content };
    }
    
    return { success: true };
  }

  /**
   * 等待 Worker 响应
   */
  private async waitForWorkerResponse(
    sessionId: string, 
    timeoutMs: number
  ): Promise<{ content: string; tokenCount: number }> {
    const startTime = Date.now();
    let lastOutput = '';
    
    while (Date.now() - startTime < timeoutMs) {
      const pollResult = await process({
        action: 'poll',
        sessionId,
        timeout: 5000,
        limit: 100
      });
      
      if (pollResult.hasNewOutput && pollResult.output) {
        lastOutput = pollResult.output;
        return {
          content: lastOutput,
          tokenCount: this.estimateTokens(lastOutput)
        };
      }
      
      // 检查是否结束
      if (pollResult.status === 'completed') {
        break;
      }
      
      // 短暂等待后再次轮询
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // 超时或结束时，如果有输出则返回
    if (lastOutput) {
      return {
        content: lastOutput,
        tokenCount: this.estimateTokens(lastOutput)
      };
    }
    
    throw new Error('Worker response timeout');
  }

  /**
   * 估算文本的 token 数量
   * 简化算法：中文字符数 + 英文字符数/4
   */
  private estimateTokens(text: string): number {
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return chineseChars + Math.floor(otherChars / 4);
  }

  // ==========================================================================
  // 3. Worker 停止工具 (对应 TASK_STOP_TOOL_NAME)
  // ==========================================================================

  /**
   * 停止指定 Worker
   * 
   * @param workerId - Worker ID
   * @param options - 可选配置
   * @returns 停止结果
   * 
   * @example
   * ```typescript
   * await manager.stopWorker('worker_abc123', { graceful: true });
   * ```
   */
  async stopWorker(
    workerId: string, 
    options?: {
      /** 是否优雅停止（发送结束消息） */
      graceful?: boolean;
      /** 停止原因 */
      reason?: string;
    }
  ): Promise<{ success: boolean; workerId: string }> {
    // 1. 查找 Worker
    const worker = this.workers.get(workerId);
    if (!worker) {
      throw new Error(`Worker not found: ${workerId}`);
    }
    
    // 2. 优雅停止：发送结束消息
    if (options?.graceful) {
      try {
        await this.continueWorker(workerId, '任务已完成，谢谢你的工作！');
        // 等待短暂延迟让 Worker 处理完最后的消息
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (e) {
        console.warn(`[WorkerManager] Graceful stop failed for ${workerId}:`, e);
      }
    }
    
    // 3. 停止会话
    await process({
      action: 'kill',
      sessionId: worker.sessionId
    });
    
    // 4. 更新 Worker 状态
    worker.status = WorkerStatus.STOPPED;
    worker.lastActiveAt = Date.now();
    
    // 5. 清理映射（可选：保留历史记录）
    // this.workers.delete(workerId);
    // this.sessionToWorker.delete(worker.sessionId);
    
    console.log(`[WorkerManager] Stopped worker: ${workerId}${options?.reason ? ` (${options.reason})` : ''}`);
    
    return { success: true, workerId };
  }

  /**
   * 批量停止所有 Worker
   */
  async stopAllWorkers(options?: { graceful?: boolean }): Promise<void> {
    const stopPromises = Array.from(this.workers.values())
      .filter(w => w.status !== WorkerStatus.STOPPED)
      .map(w => this.stopWorker(w.workerId, options));
    
    await Promise.all(stopPromises);
    console.log(`[WorkerManager] Stopped all workers`);
  }

  // ==========================================================================
  // 4. Continue vs. Spawn 决策逻辑
  // ==========================================================================

  /**
   * 决策矩阵：判断是否应该继续现有 Worker 还是创建新 Worker
   * 
   * 决策因素：
   * 1. 上下文重叠度 - 新任务与现有 Worker 的上下文相似度
   * 2. 任务连续性 - 是否是同一任务的延续
   * 3. 资源效率 - 复用现有 Worker 是否更节省资源
   * 
   * @param newTaskDescription - 新任务描述
   * @param currentWorkers - 可选：指定要评估的 Worker 列表
   * @returns 决策结果
   * 
   * @example
   * ```typescript
   * const decision = await manager.makeContinueDecision(
   *   '帮我继续优化刚才的代码',
   *   ['worker_abc123']
   * );
   * 
   * if (decision.shouldContinue) {
   *   await manager.continueWorker(decision.recommendedWorkerId!, '帮我继续优化...');
   * } else {
   *   const newWorkerId = await manager.createWorker({...});
   * }
   * ```
   */
  async makeContinueDecision(
    newTaskDescription: string,
    currentWorkers?: string[]
  ): Promise<ContinueDecision> {
    // 1. 获取候选 Worker 列表
    const candidates = currentWorkers
      ? Array.from(this.workers.values()).filter(w => currentWorkers.includes(w.workerId))
      : Array.from(this.workers.values()).filter(w => w.status !== WorkerStatus.STOPPED);
    
    if (candidates.length === 0) {
      return {
        shouldContinue: false,
        reason: '没有可用的 Worker',
        scores: {
          contextOverlap: 0,
          taskContinuity: 0,
          resourceEfficiency: 0,
          totalScore: 0
        }
      };
    }
    
    // 2. 为每个 Worker 计算得分
    const scoredWorkers = candidates.map(worker => ({
      worker,
      scores: this.calculateDecisionScores(worker, newTaskDescription)
    }));
    
    // 3. 选择得分最高的 Worker
    const bestMatch = scoredWorkers.reduce((best, current) => 
      current.scores.totalScore > best.scores.totalScore ? current : best
    );
    
    // 4. 决策阈值
    const CONTINUE_THRESHOLD = 60; // 综合得分 >= 60 则继续
    
    const shouldContinue = bestMatch.scores.totalScore >= CONTINUE_THRESHOLD;
    
    return {
      shouldContinue,
      reason: shouldContinue 
        ? `上下文匹配度良好 (得分：${bestMatch.scores.totalScore})`
        : `上下文匹配度不足 (得分：${bestMatch.scores.totalScore})`,
      recommendedWorkerId: shouldContinue ? bestMatch.worker.workerId : undefined,
      scores: bestMatch.scores
    };
  }

  /**
   * 计算决策矩阵得分
   */
  private calculateDecisionScores(
    worker: Worker, 
    newTaskDescription: string
  ): DecisionScores {
    // 1. 上下文重叠度得分
    const contextOverlap = this.calculateContextOverlap(
      worker.config.description + ' ' + worker.config.prompt,
      newTaskDescription
    );
    
    // 2. 任务连续性得分
    const taskContinuity = this.calculateTaskContinuity(worker, newTaskDescription);
    
    // 3. 资源效率得分
    const resourceEfficiency = this.calculateResourceEfficiency(worker);
    
    // 4. 加权计算总分
    // 权重：上下文重叠 40%, 任务连续性 40%, 资源效率 20%
    const totalScore = Math.round(
      contextOverlap * 0.4 + 
      taskContinuity * 0.4 + 
      resourceEfficiency * 0.2
    );
    
    return {
      contextOverlap: Math.round(contextOverlap),
      taskContinuity: Math.round(taskContinuity),
      resourceEfficiency: Math.round(resourceEfficiency),
      totalScore
    };
  }

  /**
   * 计算上下文重叠度
   * 使用简化的文本相似度算法（Jaccard 相似度）
   */
  private calculateContextOverlap(context: string, newTask: string): number {
    const contextWords = this.tokenize(context);
    const newTaskWords = this.tokenize(newTask);
    
    const intersection = new Set([...contextWords].filter(w => newTaskWords.has(w)));
    const union = new Set([...contextWords, ...newTaskWords]);
    
    const jaccard = intersection.size / union.size;
    
    // 映射到 0-100
    return Math.round(jaccard * 100);
  }

  /**
   * 计算任务连续性得分
   */
  private calculateTaskContinuity(worker: Worker, newTask: string): number {
    let score = 50; // 基础分
    
    // 因素 1：最近活动时间（越近得分越高）
    const minutesSinceActive = (Date.now() - worker.lastActiveAt) / 60000;
    if (minutesSinceActive < 5) {
      score += 30; // 5 分钟内：+30
    } else if (minutesSinceActive < 30) {
      score += 20; // 30 分钟内：+20
    } else if (minutesSinceActive < 60) {
      score += 10; // 1 小时内：+10
    }
    
    // 因素 2：消息历史（有历史得分高）
    if (worker.messageCount > 0) {
      score += Math.min(20, worker.messageCount * 2);
    }
    
    // 因素 3：任务描述中包含"继续"、"接着"等关键词
    const continuityKeywords = ['继续', '接着', '然后', '下一步', 'continue', 'next'];
    const hasContinuityKeyword = continuityKeywords.some(k => 
      newTask.toLowerCase().includes(k)
    );
    if (hasContinuityKeyword) {
      score += 15;
    }
    
    return Math.min(100, score);
  }

  /**
   * 计算资源效率得分
   */
  private calculateResourceEfficiency(worker: Worker): number {
    let score = 50; // 基础分
    
    // 因素 1：上下文令牌数（越少越高效）
    if (worker.contextTokens) {
      if (worker.contextTokens < 1000) {
        score += 30;
      } else if (worker.contextTokens < 5000) {
        score += 20;
      } else if (worker.contextTokens < 10000) {
        score += 10;
      }
    }
    
    // 因素 2：Worker 年龄（越新越高效）
    const ageInMinutes = (Date.now() - worker.createdAt) / 60000;
    if (ageInMinutes < 10) {
      score += 20;
    } else if (ageInMinutes < 60) {
      score += 10;
    }
    
    return Math.min(100, score);
  }

  /**
   * 文本分词（简化版）
   */
  private tokenize(text: string): Set<string> {
    // 移除标点，转小写，分割
    const words = text
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1);
    
    return new Set(words);
  }

  // ==========================================================================
  // 辅助方法
  // ==========================================================================

  /**
   * 获取 Worker 列表
   */
  getWorkers(filter?: { status?: WorkerStatus }): Worker[] {
    let workers = Array.from(this.workers.values());
    
    if (filter?.status) {
      workers = workers.filter(w => w.status === filter.status);
    }
    
    return workers;
  }

  /**
   * 获取 Worker 详情
   */
  getWorker(workerId: string): Worker | undefined {
    return this.workers.get(workerId);
  }

  /**
   * 获取活跃 Worker 数量
   */
  getActiveWorkerCount(): number {
    return Array.from(this.workers.values())
      .filter(w => w.status === WorkerStatus.RUNNING || w.status === WorkerStatus.IDLE)
      .length;
  }

  /**
   * 获取 Worker 统计信息
   */
  getStats(): {
    total: number;
    byStatus: Record<WorkerStatus, number>;
    totalMessages: number;
    avgContextTokens: number;
  } {
    const workers = Array.from(this.workers.values());
    
    const byStatus = {
      [WorkerStatus.IDLE]: 0,
      [WorkerStatus.RUNNING]: 0,
      [WorkerStatus.PAUSED]: 0,
      [WorkerStatus.STOPPED]: 0,
      [WorkerStatus.ERROR]: 0
    };
    
    let totalMessages = 0;
    let totalTokens = 0;
    let workersWithTokens = 0;
    
    workers.forEach(w => {
      byStatus[w.status]++;
      totalMessages += w.messageCount;
      if (w.contextTokens) {
        totalTokens += w.contextTokens;
        workersWithTokens++;
      }
    });
    
    return {
      total: workers.length,
      byStatus,
      totalMessages,
      avgContextTokens: workersWithTokens > 0 
        ? Math.round(totalTokens / workersWithTokens) 
        : 0
    };
  }

  /**
   * 清理已停止的 Worker（释放内存）
   */
  cleanupStoppedWorkers(olderThanMinutes?: number): number {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [workerId, worker] of this.workers.entries()) {
      if (worker.status !== WorkerStatus.STOPPED) {
        continue;
      }
      
      // 如果指定了时间阈值，只清理超过阈值的
      if (olderThanMinutes) {
        const ageInMinutes = (now - worker.lastActiveAt) / 60000;
        if (ageInMinutes < olderThanMinutes) {
          continue;
        }
      }
      
      this.workers.delete(workerId);
      this.sessionToWorker.delete(worker.sessionId);
      cleaned++;
    }
    
    if (cleaned > 0) {
      console.log(`[WorkerManager] Cleaned up ${cleaned} stopped workers`);
    }
    
    return cleaned;
  }
}

// ============================================================================
// 导出单例实例
// ============================================================================

/**
 * Worker Manager 单例实例
 * 
 * @example
 * ```typescript
 * import { workerManager } from './worker-manager';
 * 
 * // 创建 Worker
 * const workerId = await workerManager.createWorker({...});
 * 
 * // 发送消息
 * await workerManager.continueWorker(workerId, 'Hello');
 * 
 * // 停止 Worker
 * await workerManager.stopWorker(workerId);
 * ```
 */
export const workerManager = new WorkerManager();

// ============================================================================
// 使用示例
// ============================================================================

/**
 * 完整使用示例
 */
export async function exampleUsage() {
  // 示例 1：创建并管理 Worker
  const workerId = await workerManager.createWorker({
    description: '前端开发专家',
    agentType: 'specialist',
    prompt: '你是资深前端工程师，精通 React、TypeScript...',
    initialMessage: '请帮我创建一个 React 组件'
  });
  
  // 示例 2：继续对话
  const result = await workerManager.continueWorker(workerId, '请添加 TypeScript 类型定义', {
    waitForResponse: true,
    timeoutMs: 60000
  });
  console.log('Worker response:', result.response);
  
  // 示例 3：决策是否继续
  const decision = await workerManager.makeContinueDecision(
    '接着帮我优化这个组件的性能'
  );
  
  if (decision.shouldContinue) {
    console.log(`继续 Worker: ${decision.recommendedWorkerId}`);
    console.log(`决策得分：`, decision.scores);
  } else {
    console.log('创建新 Worker:', decision.reason);
  }
  
  // 示例 4：优雅停止
  await workerManager.stopWorker(workerId, {
    graceful: true,
    reason: '任务完成'
  });
  
  // 示例 5：查看统计
  const stats = workerManager.getStats();
  console.log('Worker 统计:', stats);
}
