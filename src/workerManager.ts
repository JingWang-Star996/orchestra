#!/usr/bin/env node

/**
 * WorkerManager - Worker 生命周期管理（Phase 1 核心功能）
 * 
 * 职责：实现 Worker 的创建、继续、停止管理
 * 
 * 灵感来源：Claude Code Coordinator 的三工具
 * - AGENT_TOOL_NAME（创建）
 * - SEND_MESSAGE_TOOL_NAME（继续）
 * - TASK_STOP_TOOL_NAME（停止）
 * 
 * @version 2.0.0 - TypeScript 重构版
 * @author Orchestra AI System
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { createTaskNotification, TaskNotification } from './taskNotification';
import { callAgent } from './agentCaller';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * Worker 状态枚举
 */
export enum WorkerStatus {
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  KILLED = 'killed'
}

/**
 * Worker 上下文消息
 */
export interface WorkerMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

/**
 * Worker 上下文
 */
export interface WorkerContext {
  messages: WorkerMessage[];
  visitedFiles: string[];
  discoveries: string[];
  lastStatus?: string;
  lastMethod?: string;
  isDifferentWorker?: boolean;
}

/**
 * Worker 使用情况统计
 */
export interface WorkerUsage {
  totalTokens: number;
  toolUses: number;
  durationMs: number;
}

/**
 * Worker 配置
 */
export interface WorkerConfig {
  description: string;
  subagent_type?: string;
  prompt?: string;
  tools?: string[];
}

/**
 * Worker 数据
 */
export interface Worker {
  id: string;
  description: string;
  type: string;
  prompt?: string;
  tools: string[];
  status: WorkerStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  stoppedAt?: string;
  stopReason?: string;
  error?: string;
  context: WorkerContext;
  usage: WorkerUsage;
}

/**
 * Worker 创建结果
 */
export interface WorkerCreateResult {
  workerId: string;
  status: 'created';
}

/**
 * Worker 继续结果
 */
export interface WorkerContinueResult {
  workerId: string;
  notification: TaskNotification;
}

/**
 * Worker 停止结果
 */
export interface WorkerStopResult {
  workerId: string;
  status: 'killed';
  notification: TaskNotification;
}

/**
 * Worker 状态信息
 */
export interface WorkerStatusInfo {
  id: string;
  status: WorkerStatus;
  description: string;
  createdAt: string;
  updatedAt: string;
  usage: WorkerUsage;
}

/**
 * Worker 管理器配置
 */
export interface WorkerManagerConfig {
  verbose?: boolean;
  maxWorkers?: number;
}

/**
 * Worker 历史导出
 */
export interface WorkerHistory {
  id: string;
  description: string;
  status: WorkerStatus;
  createdAt: string;
  completedAt?: string;
  stoppedAt?: string;
  usage: WorkerUsage;
}

// ============================================================================
// Worker 管理器类
// ============================================================================

export class WorkerManager extends EventEmitter {
  private workers: Map<string, Worker>;
  private workerCounter: number;
  private verbose: boolean;
  private maxWorkers: number;

  constructor(config: WorkerManagerConfig = {}) {
    super();
    this.workers = new Map();
    this.workerCounter = 0;
    this.verbose = config.verbose || false;
    this.maxWorkers = config.maxWorkers || 10;
  }

  /**
   * 创建 Worker（对应 AGENT_TOOL_NAME）
   * @param config - Worker 配置
   * @returns Worker 创建结果
   */
  async create(config: WorkerConfig): Promise<WorkerCreateResult> {
    const {
      description,
      subagent_type = 'worker',
      prompt,
      tools = []
    } = config;
    
    const workerId = `agent-${this._generateId()}`;
    
    console.log(`[WorkerManager] 创建 Worker: ${workerId}`);
    console.log(`  描述：${description}`);
    console.log(`  类型：${subagent_type}`);
    
    const worker: Worker = {
      id: workerId,
      description: description,
      type: subagent_type,
      prompt: prompt,
      tools: tools,
      status: WorkerStatus.RUNNING,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      context: {
        messages: [],
        visitedFiles: [],
        discoveries: []
      },
      usage: {
        totalTokens: 0,
        toolUses: 0,
        durationMs: 0
      }
    };
    
    this.workers.set(workerId, worker);
    this.emit('worker:create', worker);
    
    if (this.verbose) {
      console.log(`[WorkerManager] Worker 已创建：${workerId}`);
    }
    
    return {
      workerId: workerId,
      status: 'created'
    };
  }

  /**
   * 继续 Worker（对应 SEND_MESSAGE_TOOL_NAME）
   * @param workerId - Worker ID
   * @param message - 继续消息
   * @returns Worker 继续结果
   */
  async continue(workerId: string, message: string): Promise<WorkerContinueResult> {
    const worker = this.workers.get(workerId);
    
    if (!worker) {
      throw new Error(`Worker 不存在：${workerId}`);
    }
    
    if (worker.status !== WorkerStatus.RUNNING) {
      throw new Error(`Worker 不在运行状态：${workerId} (当前状态：${worker.status})`);
    }
    
    console.log(`[WorkerManager] 继续 Worker: ${workerId}`);
    console.log(`  消息：${message}`);
    
    // 添加消息到上下文
    worker.context.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    });
    
    worker.updatedAt = new Date().toISOString();
    
    // 实际调用 Agent 继续执行
    const result = await this._executeWorker(worker);
    
    this.emit('worker:continue', { workerId, result });
    
    return result;
  }

  /**
   * 停止 Worker（对应 TASK_STOP_TOOL_NAME）
   * @param options - 停止配置
   * @returns Worker 停止结果
   */
  async stop(options: { task_id: string; reason?: string }): Promise<WorkerStopResult> {
    const { task_id: workerId, reason = '用户请求' } = options;
    
    const worker = this.workers.get(workerId);
    
    if (!worker) {
      throw new Error(`Worker 不存在：${workerId}`);
    }
    
    console.log(`[WorkerManager] 停止 Worker: ${workerId}`);
    console.log(`  原因：${reason}`);
    
    worker.status = WorkerStatus.KILLED;
    worker.updatedAt = new Date().toISOString();
    worker.stoppedAt = new Date().toISOString();
    worker.stopReason = reason;
    
    // 发送任务通知
    const notification = createTaskNotification({
      taskId: workerId,
      status: 'killed',
      summary: `Worker 已停止：${reason}`,
      usage: worker.usage
    });
    
    this.emit('worker:stop', { workerId, notification });
    
    return {
      workerId: workerId,
      status: 'killed',
      notification: notification
    };
  }

  /**
   * 执行 Worker（内部方法）
   */
  private async _executeWorker(worker: Worker): Promise<WorkerContinueResult> {
    const startTime = Date.now();
    
    try {
      // 真实调用 Agent 执行
      const result = await callAgent(
        worker.type,
        worker.prompt || worker.context.messages[worker.context.messages.length - 1]?.content || '',
        null
      );
      
      const duration = Date.now() - startTime;
      
      // 更新 Worker 状态
      worker.status = WorkerStatus.COMPLETED;
      worker.usage = {
        totalTokens: result.tokens,
        toolUses: 1,
        durationMs: duration
      };
      worker.completedAt = new Date().toISOString();
      
      // 发送任务通知
      const notification = createTaskNotification({
        taskId: worker.id,
        status: 'completed',
        summary: '任务完成',
        result: result.result.content,
        usage: worker.usage
      });
      
      this.emit('worker:complete', { workerId: worker.id, notification });
      
      return {
        workerId: worker.id,
        notification: notification
      };
      
    } catch (error: any) {
      worker.status = WorkerStatus.FAILED;
      worker.error = error.message;
      
      const notification = createTaskNotification({
        taskId: worker.id,
        status: 'failed',
        summary: `任务失败：${error.message}`,
        usage: worker.usage
      });
      
      this.emit('worker:fail', { workerId: worker.id, notification });
      
      return {
        workerId: worker.id,
        notification: notification
      };
    }
  }

  /**
   * 生成 Worker ID
   */
  private _generateId(): string {
    this.workerCounter++;
    return `${this.workerCounter.toString(36)}${Date.now().toString(36)}`;
  }

  /**
   * 获取 Worker 状态
   */
  getWorkerStatus(workerId: string): WorkerStatusInfo | null {
    const worker = this.workers.get(workerId);
    if (!worker) {
      return null;
    }
    
    return {
      id: worker.id,
      status: worker.status,
      description: worker.description,
      createdAt: worker.createdAt,
      updatedAt: worker.updatedAt,
      usage: worker.usage
    };
  }

  /**
   * 获取所有 Worker 状态
   */
  getAllStatus(): {
    total: number;
    running: number;
    completed: number;
    failed: number;
    killed: number;
    workers: WorkerStatusInfo[];
  } {
    const status = {
      total: this.workers.size,
      running: 0,
      completed: 0,
      failed: 0,
      killed: 0,
      workers: [] as WorkerStatusInfo[]
    };
    
    for (const worker of this.workers.values()) {
      const workerStatus = this.getWorkerStatus(worker.id);
      if (workerStatus) {
        status.workers.push(workerStatus);
        
        if (worker.status === WorkerStatus.RUNNING) status.running++;
        else if (worker.status === WorkerStatus.COMPLETED) status.completed++;
        else if (worker.status === WorkerStatus.FAILED) status.failed++;
        else if (worker.status === WorkerStatus.KILLED) status.killed++;
      }
    }
    
    return status;
  }

  /**
   * 导出 Worker 历史
   */
  exportHistory(): WorkerHistory[] {
    return Array.from(this.workers.values()).map(worker => ({
      id: worker.id,
      description: worker.description,
      status: worker.status,
      createdAt: worker.createdAt,
      completedAt: worker.completedAt,
      stoppedAt: worker.stoppedAt,
      usage: worker.usage
    }));
  }

  /**
   * 获取 Worker 数量
   */
  getWorkerCount(): number {
    return this.workers.size;
  }

  /**
   * 清理已完成的 Worker
   */
  cleanupCompleted(): number {
    let cleaned = 0;
    for (const [id, worker] of this.workers.entries()) {
      if (worker.status === WorkerStatus.COMPLETED || worker.status === WorkerStatus.KILLED) {
        this.workers.delete(id);
        cleaned++;
      }
    }
    return cleaned;
  }
}

// 导出默认实例
export default WorkerManager;
