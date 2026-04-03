/**
 * Orchestra Core - 核心类型和接口定义
 * 
 * 提供多 Agent 协作框架的基础抽象
 */

// ============================================================================
// 核心接口
// ============================================================================

/**
 * 任务上下文
 * 
 * 传递给工作流的初始信息和配置
 */
export interface TaskContext {
  [key: string]: any;
  
  /** 代码库路径 */
  codebasePath?: string;
  
  /** Bug 报告描述 */
  bugReport?: string;
  
  /** 功能需求描述 */
  featureRequest?: string;
  
  /** 重构目标 */
  refactorGoal?: string;
  
  /** 搜索关键词 */
  searchQueries?: string[];
  
  /** 错误日志 */
  errorLogs?: string;
  
  /** 测试命令 */
  testCommand?: string;
  
  /** 手动验证步骤 */
  manualVerificationSteps?: string;
}

/**
 * 工作流接口
 * 
 * 所有工作流必须实现此接口
 */
export interface Workflow {
  /**
   * 执行工作流
   * @param context 任务上下文
   * @returns 执行结果
   */
  execute(context: TaskContext): Promise<any>;
}

/**
 * Worker 配置
 */
export interface WorkerConfig {
  /** Worker 唯一标识 */
  id: string;
  
  /** 专用提示词（可选） */
  systemPrompt?: string;
  
  /** 最大重试次数 */
  maxRetries?: number;
}

/**
 * Worker 执行结果
 */
export interface WorkerResult {
  /** 是否成功 */
  success?: boolean;
  
  /** 发现的信息 */
  findings?: string[];
  
  /** 分析的文件 */
  files?: string[];
  
  /** 识别的问题 */
  issues?: string[];
  
  /** 变更摘要 */
  changesSummary?: string;
  
  /** 测试报告 */
  report?: string;
  
  /** 测试是否通过 */
  passed?: boolean;
  
  /** 其他任意结果 */
  [key: string]: any;
}

/**
 * Worker 任务
 */
export interface WorkerTask {
  /** 任务 ID */
  id: string;
  
  /** 任务类型 */
  type: 'research' | 'synthesis' | 'implementation' | 'verification';
  
  /** 任务描述 */
  description: string;
  
  /** 详细指令 */
  instructions: string;
}

/**
 * Worker - 工作执行者
 * 
 * 负责执行具体任务（研究、实现、验证）
 */
export class Worker {
  public readonly id: string;
  private config: WorkerConfig;

  constructor(config: WorkerConfig) {
    this.id = config.id;
    this.config = {
      maxRetries: 3,
      ...config
    };
  }

  /**
   * 执行任务
   * @param task 任务定义
   * @param scratchpad 共享数据区
   * @returns 执行结果
   */
  async execute(task: WorkerTask, scratchpad: Scratchpad): Promise<WorkerResult> {
    console.log(`  🤖 Worker [${this.id}] 执行任务：${task.id}`);
    
    // 将任务信息写入 scratchpad
    scratchpad.set(`worker:${this.id}:currentTask`, task);
    
    try {
      // 根据任务类型执行不同逻辑
      let result: WorkerResult;
      
      switch (task.type) {
        case 'research':
          result = await this.executeResearch(task);
          break;
        case 'implementation':
          result = await this.executeImplementation(task);
          break;
        case 'verification':
          result = await this.executeVerification(task);
          break;
        default:
          result = { success: false, issues: [`未知任务类型：${task.type}`] };
      }
      
      // 记录结果
      scratchpad.set(`worker:${this.id}:lastResult`, result);
      
      return result;
    } catch (error) {
      console.error(`  ❌ Worker [${this.id}] 任务失败:`, error);
      return {
        success: false,
        issues: [`执行错误：${error instanceof Error ? error.message : '未知错误'}`]
      };
    }
  }

  /**
   * 执行研究任务
   */
  private async executeResearch(task: WorkerTask): Promise<WorkerResult> {
    // 实际实现中，这里会调用 LLM 或执行具体代码分析
    // 示例实现：返回模拟结果
    return {
      success: true,
      findings: [
        `发现关键代码模式`,
        `识别潜在问题点`,
        `收集到相关配置信息`
      ],
      files: ['src/example.ts', 'src/config.json'],
      issues: []
    };
  }

  /**
   * 执行实现任务
   */
  private async executeImplementation(task: WorkerTask): Promise<WorkerResult> {
    // 实际实现中，这里会读取文件、应用变更、保存
    return {
      success: true,
      changesSummary: `已按要求修改代码`
    };
  }

  /**
   * 执行验证任务
   */
  private async executeVerification(task: WorkerTask): Promise<WorkerResult> {
    // 实际实现中，这里会运行测试命令、检查结果
    return {
      success: true,
      passed: true,
      report: `测试通过：所有断言成功`
    };
  }
}

/**
 * Coordinator 配置
 */
export interface CoordinatorConfig {
  /** 协调器 ID */
  id?: string;
  
  /** 系统提示词 */
  systemPrompt?: string;
}

/**
 * Coordinator - 协调者
 * 
 * 负责综合信息、制定规范、分配任务
 */
export class Coordinator {
  private config: CoordinatorConfig;

  constructor(config: CoordinatorConfig = {}) {
    this.config = {
      id: 'coordinator-001',
      ...config
    };
  }

  /**
   * 综合研究发现，制定解决方案
   * @param task 综合任务
   * @param scratchpad 共享数据区
   * @returns 综合结果
   */
  async synthesize(task: any, scratchpad: Scratchpad): Promise<any> {
    console.log(`  🧠 Coordinator 执行综合`);
    
    // 记录任务
    scratchpad.set('coordinator:currentTask', task);
    
    // 实际实现中，这里会调用 LLM 进行综合分析
    // 示例实现：返回模拟结果
    const result = {
      problemStatement: '分析研究发现的问题',
      rootCause: '识别的根本原因',
      solutionSpec: '详细的解决方案规范',
      affectedFiles: ['src/file1.ts', 'src/file2.ts'],
      testPlan: '运行单元测试和集成测试'
    };
    
    // 记录结果
    scratchpad.set('coordinator:lastResult', result);
    
    return result;
  }

  /**
   * 分配任务给 Workers
   */
  async assignTasks(workers: Worker[], tasks: any[]): Promise<void> {
    console.log(`  📋 Coordinator 分配 ${tasks.length} 个任务给 ${workers.length} 个 Workers`);
    // 实际实现中，这里会将任务分配给具体的 Worker
  }
}

/**
 * Scratchpad - 共享数据区
 * 
 * 用于在阶段间和 Agent 间传递数据
 * 
 * 使用示例：
 * ```typescript
 * const scratchpad = new Scratchpad();
 * 
 * // 写入数据
 * scratchpad.set('research:findings', ['发现 1', '发现 2']);
 * 
 * // 读取数据
 * const findings = scratchpad.get('research:findings');
 * 
 * // 追加数据
 * scratchpad.append('log', '新日志条目');
 * ```
 */
export class Scratchpad {
  private data: Map<string, any>;
  private logs: string[];

  constructor() {
    this.data = new Map();
    this.logs = [];
  }

  /**
   * 设置键值
   */
  set<T>(key: string, value: T): void {
    this.data.set(key, value);
    console.log(`    📝 Scratchpad: ${key} = ${this.stringify(value)}`);
  }

  /**
   * 获取值
   */
  get<T>(key: string): T | undefined {
    const value = this.data.get(key);
    return value as T | undefined;
  }

  /**
   * 追加到列表
   */
  append(key: string, value: any): void {
    const existing = this.get<any[]>(key) || [];
    existing.push(value);
    this.set(key, existing);
  }

  /**
   * 追加日志
   */
  log(message: string): void {
    const timestamp = new Date().toISOString();
    this.logs.push(`[${timestamp}] ${message}`);
  }

  /**
   * 获取所有日志
   */
  getLogs(): string[] {
    return [...this.logs];
  }

  /**
   * 清除所有数据
   */
  clear(): void {
    this.data.clear();
    this.logs = [];
  }

  /**
   * 导出为 JSON
   */
  toJSON(): Record<string, any> {
    const obj: Record<string, any> = {};
    this.data.forEach((value, key) => {
      obj[key] = value;
    });
    obj['_logs'] = this.logs;
    return obj;
  }

  /**
   * 从 JSON 导入
   */
  fromJSON(json: Record<string, any>): void {
    this.clear();
    Object.entries(json).forEach(([key, value]) => {
      if (key === '_logs') {
        this.logs = value as string[];
      } else {
        this.set(key, value);
      }
    });
  }

  /**
   * 字符串化（用于日志）
   */
  private stringify(value: any): string {
    if (Array.isArray(value)) {
      return `[${value.length} items]`;
    }
    if (typeof value === 'object' && value !== null) {
      return `{${Object.keys(value).length} keys}`;
    }
    return String(value).substring(0, 50);
  }
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 创建 Worker 池
 */
export function createWorkerPool(size: number): Worker[] {
  return Array.from({ length: size }, (_, i) => 
    new Worker({ id: `worker-${i + 1}` })
  );
}

/**
 * 并行执行任务（带并发限制）
 */
export async function executeWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  executor: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<void>[] = [];

  for (const item of items) {
    const promise = executor(item).then(result => {
      results.push(result);
      executing.splice(executing.indexOf(promise), 1);
    });
    
    executing.push(promise);
    
    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}

/**
 * 超时包装器
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    )
  ]);
}
