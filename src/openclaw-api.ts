/**
 * OpenClaw API 适配层
 * 
 * 提供与 OpenClaw 运行时环境的集成接口
 * 在实际运行时，这些函数会被 OpenClaw 的 sessions_spawn 和 process API 替换
 */

import type { SessionConfig, SessionSpawnResult, ProcessAction, ProcessResult } from './types';

/**
 * 模拟的会话存储（用于测试环境）
 */
const mockSessions: Map<string, {
  config: SessionConfig;
  messages: string[];
  status: 'created' | 'running' | 'completed' | 'error';
  createdAt: number;
}> = new Map();

/**
 * 生成新的会话
 * 
 * @param config - 会话配置
 * @returns 会话生成结果
 * 
 * @example
 * ```typescript
 * const result = await sessions_spawn({
 *   agent: 'agent',
 *   prompt: '你是一个助手',
 *   model: 'bailian/qwen3.5-plus'
 * });
 * ```
 */
export async function sessions_spawn(config: SessionConfig): Promise<SessionSpawnResult> {
  // 检查是否在测试环境
  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
  
  if (isTestEnv) {
    // 测试环境：使用模拟实现
    const sessionId = `session_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    
    mockSessions.set(sessionId, {
      config,
      messages: [],
      status: 'running',
      createdAt: Date.now()
    });
    
    return {
      sessionId,
      status: 'created'
    };
  }
  
  // 生产环境：调用实际的 OpenClaw API
  // 注意：在实际运行时，这个函数会被 OpenClaw 运行时注入
  // 这里提供一个兼容层，确保 TypeScript 编译通过
  
  if (typeof globalThis.sessions_spawn === 'function') {
    return globalThis.sessions_spawn(config);
  }
  
  // 如果既不是测试环境也没有运行时注入，抛出错误
  throw new Error(
    'sessions_spawn: OpenClaw runtime not available. ' +
    'Ensure this code runs within OpenClaw environment or set NODE_ENV=test for testing.'
  );
}

/**
 * 管理运行中的会话
 * 
 * @param action - Process 动作
 * @returns 处理结果
 * 
 * @example
 * ```typescript
 * // 发送消息
 * const result = await process({
 *   action: 'send-keys',
 *   sessionId: 'session_abc123',
 *   text: 'Hello'
 * });
 * 
 * // 轮询输出
 * const pollResult = await process({
 *   action: 'poll',
 *   sessionId: 'session_abc123',
 *   timeout: 5000,
 *   limit: 100
 * });
 * 
 * // 停止会话
 * await process({
 *   action: 'kill',
 *   sessionId: 'session_abc123'
 * });
 * ```
 */
export async function process(action: ProcessAction): Promise<ProcessResult> {
  // 检查是否在测试环境
  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
  
  if (isTestEnv) {
    return handleMockProcess(action);
  }
  
  // 生产环境：调用实际的 OpenClaw API
  if (typeof globalThis.process === 'function') {
    return globalThis.process(action);
  }
  
  throw new Error(
    'process: OpenClaw runtime not available. ' +
    'Ensure this code runs within OpenClaw environment or set NODE_ENV=test for testing.'
  );
}

/**
 * 测试环境的模拟 process 实现
 */
async function handleMockProcess(action: ProcessAction): Promise<ProcessResult> {
  const sessionId = action.sessionId;
  
  switch (action.action) {
    case 'send-keys': {
      if (!sessionId) {
        throw new Error('sessionId is required for send-keys action');
      }
      
      const session = mockSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }
      
      if (action.text) {
        session.messages.push(action.text);
      }
      
      // 模拟响应
      const mockResponse = generateMockResponse(action.text || '', session.config);
      session.messages.push(mockResponse);
      
      return {
        hasNewOutput: true,
        output: mockResponse,
        status: 'running'
      };
    }
    
    case 'poll': {
      if (!sessionId) {
        throw new Error('sessionId is required for poll action');
      }
      
      const session = mockSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }
      
      // 模拟：如果有消息则返回输出
      const hasMessages = session.messages.length > 0;
      const lastMessage = session.messages[session.messages.length - 1] || '';
      
      // 模拟超时行为
      if (action.timeout) {
        await new Promise(resolve => setTimeout(resolve, Math.min(action.timeout, 100)));
      }
      
      return {
        hasNewOutput: hasMessages,
        output: lastMessage,
        status: session.status
      };
    }
    
    case 'kill': {
      if (!sessionId) {
        throw new Error('sessionId is required for kill action');
      }
      
      const session = mockSessions.get(sessionId);
      if (session) {
        session.status = 'completed';
      }
      
      return {
        hasNewOutput: false,
        output: '',
        status: 'completed'
      };
    }
    
    case 'log': {
      if (!sessionId) {
        throw new Error('sessionId is required for log action');
      }
      
      const session = mockSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }
      
      const offset = action.offset || 0;
      const limit = action.limit || 100;
      const logs = session.messages.slice(offset, offset + limit);
      
      return {
        hasNewOutput: logs.length > 0,
        output: logs.join('\n'),
        status: session.status
      };
    }
    
    default:
      return {
        hasNewOutput: false,
        output: '',
        status: 'running'
      };
  }
}

/**
 * 生成模拟响应（用于测试）
 */
function generateMockResponse(input: string, config?: SessionConfig): string {
  const lowerInput = input.toLowerCase();
  
  // 根据输入生成合理的模拟响应
  if (lowerInput.includes('你好') || lowerInput.includes('hello')) {
    return '你好！我是你的助手，有什么可以帮你的吗？';
  }
  
  if (lowerInput.includes('代码') || lowerInput.includes('code')) {
    return '好的，我来帮你编写代码。\n\n```typescript\nconst result = "Hello, World!";\nconsole.log(result);\n```';
  }
  
  if (lowerInput.includes('继续') || lowerInput.includes('continue')) {
    return '好的，我继续完成这个任务。\n\n已完成的工作：\n1. 分析了需求\n2. 设计了架构\n3. 实现了核心功能\n\n接下来我会进行测试和优化。';
  }
  
  if (lowerInput.includes('完成') || lowerInput.includes('结束') || lowerInput.includes('谢谢')) {
    return '任务已完成！如果还有其他需要，随时告诉我。';
  }
  
  // 默认响应
  const agentType = config?.agentType || 'agent';
  return `[${agentType}] 收到你的消息："${input}"\n\n我正在处理中，请稍等...`;
}

/**
 * 导出全局类型声明
 */
declare global {
  var sessions_spawn: ((config: SessionConfig) => Promise<SessionSpawnResult>) | undefined;
  var process: ((action: ProcessAction) => Promise<ProcessResult>) | undefined;
}

export default { sessions_spawn, process };
