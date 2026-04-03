/**
 * Orchestra 类型定义
 * 
 * 包含 Worker 管理系统所需的核心类型
 */

// ============================================================================
// OpenClaw API 类型
// ============================================================================

/**
 * 会话配置接口
 * 用于 sessions_spawn API
 */
export interface SessionConfig {
  /** 代理类型 */
  agent: 'agent' | 'task' | 'flow' | 'specialist';
  
  /** 系统提示词 */
  prompt: string;
  
  /** 模型名称 */
  model?: string;
  
  /** 是否启用思考模式 */
  thinking?: boolean;
  
  /** 是否继承父会话上下文 */
  inheritContext?: boolean;
  
  /** 父会话 ID */
  parentSessionId?: string;
  
  /** 会话标签 */
  label?: string;
}

/**
 * 会话生成结果
 */
export interface SessionSpawnResult {
  /** 会话 ID */
  sessionId: string;
  
  /** 会话状态 */
  status: 'created' | 'running' | 'error';
  
  /** 错误信息（如果有） */
  error?: string;
}

/**
 * Process 工具动作类型
 */
export type ProcessActionType = 
  | 'list'
  | 'poll'
  | 'log'
  | 'write'
  | 'send-keys'
  | 'submit'
  | 'paste'
  | 'kill';

/**
 * Process 工具基础参数
 */
export interface ProcessAction {
  /** 动作类型 */
  action: ProcessActionType;
  
  /** 会话 ID */
  sessionId?: string;
  
  /** 日志偏移量 */
  offset?: number;
  
  /** 日志长度限制 */
  limit?: number;
  
  /** 轮询超时时间（毫秒） */
  timeout?: number;
  
  /** 要发送的文本 */
  text?: string;
  
  /** 要发送的按键 */
  keys?: string[];
  
  /** 十六进制数据 */
  hex?: string[];
  
  /** 写入的数据 */
  data?: string;
  
  /** 写入后关闭 stdin */
  eof?: boolean;
  
  /** 是否使用括号模式粘贴 */
  bracketed?: boolean;
}

/**
 * Process 工具返回结果
 */
export interface ProcessResult {
  /** 是否有新输出 */
  hasNewOutput: boolean;
  
  /** 输出内容 */
  output: string;
  
  /** 会话状态 */
  status: 'running' | 'completed' | 'error';
  
  /** 进程 ID */
  pid?: number;
  
  /** 退出码 */
  exitCode?: number;
}

// ============================================================================
// Worker 管理类型
// ============================================================================

/**
 * Worker 生命周期事件
 */
export interface WorkerEvent {
  /** 事件类型 */
  type: 'created' | 'started' | 'paused' | 'resumed' | 'stopped' | 'error';
  
  /** Worker ID */
  workerId: string;
  
  /** 时间戳 */
  timestamp: number;
  
  /** 附加数据 */
  payload?: any;
}

/**
 * Worker 事件监听器
 */
export type WorkerEventListener = (event: WorkerEvent) => void;

/**
 * Worker 管理器配置
 */
export interface WorkerManagerConfig {
  /** 默认模型 */
  defaultModel?: string;
  
  /** 默认代理类型 */
  defaultAgentType?: 'agent' | 'task' | 'flow' | 'specialist';
  
  /** 是否自动清理已停止的 Worker */
  autoCleanup?: boolean;
  
  /** 清理间隔（分钟） */
  cleanupIntervalMinutes?: number;
  
  /** 最大活跃 Worker 数量 */
  maxActiveWorkers?: number;
  
  /** 决策阈值 */
  continueDecisionThreshold?: number;
}

/**
 * Worker 上下文信息
 */
export interface WorkerContext {
  /** Worker ID */
  workerId: string;
  
  /** 会话 ID */
  sessionId: string;
  
  /** 描述 */
  description: string;
  
  /** 提示词 */
  prompt: string;
  
  /** 创建时间 */
  createdAt: number;
  
  /** 最后活动时间 */
  lastActiveAt: number;
  
  /** 消息数量 */
  messageCount: number;
  
  /** 估算的 token 数 */
  estimatedTokens?: number;
}

// ============================================================================
// 工具函数类型
// ============================================================================

/**
 * sessions_spawn API 函数签名
 */
export type SessionsSpawnFn = (config: SessionConfig) => Promise<SessionSpawnResult>;

/**
 * process API 函数签名
 */
export type ProcessFn = (action: ProcessAction) => Promise<ProcessResult>;

// ============================================================================
// 导出 OpenClaw API（实际实现由运行时提供）
// ============================================================================

/**
 * 生成新的会话
 * 
 * @param config - 会话配置
 * @returns 会话生成结果
 */
export async function sessions_spawn(config: SessionConfig): Promise<SessionSpawnResult> {
  // 实际实现由 OpenClaw 运行时注入
  // 这里提供类型定义和文档
  throw new Error('sessions_spawn is provided by OpenClaw runtime');
}

/**
 * 管理运行中的会话
 * 
 * @param action - Process 动作
 * @returns 处理结果
 */
export async function process(action: ProcessAction): Promise<ProcessResult> {
  // 实际实现由 OpenClaw 运行时注入
  throw new Error('process is provided by OpenClaw runtime');
}
