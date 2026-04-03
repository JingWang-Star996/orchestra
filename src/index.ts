/**
 * Orchestra - 四阶段多 Agent 协作框架
 * 
 * 基于 Claude Coordinator 模式，适配 OpenClaw
 * 
 * @packageDocumentation
 */

// 核心类型和接口
export {
  Workflow,
  Worker,
  Coordinator,
  Scratchpad,
  TaskContext,
  WorkerConfig,
  WorkerResult,
  WorkerTask,
  CoordinatorConfig,
  createWorkerPool,
  executeWithConcurrency,
  withTimeout
} from './core';

// 四阶段工作流
export {
  FourPhaseWorkflow,
  exampleBugFixWorkflow,
  exampleFeatureImplementationWorkflow,
  exampleRefactoringWorkflow
} from './four-phase-workflow';

// 类型导出
export type {
  ResearchTask,
  SynthesisResult,
  ImplementationTask,
  VerificationTask,
  FourPhaseConfig,
  WorkflowResult,
  ResearchPhaseResult,
  ImplementationPhaseResult,
  VerificationPhaseResult
} from './four-phase-workflow';

/**
 * 快速开始示例
 * 
 * ```typescript
 * import { FourPhaseWorkflow } from 'orchestra';
 * 
 * const workflow = new FourPhaseWorkflow({
 *   name: 'Bug 修复工作流',
 *   description: '修复用户登录问题'
 * });
 * 
 * const result = await workflow.execute({
 *   bugReport: '用户无法登录...',
 *   codebasePath: '/src/auth',
 *   testCommand: 'npm test -- auth'
 * });
 * 
 * console.log(result.summary);
 * ```
 */

// 版本信息
export const VERSION = '1.0.0';
export const LIBRARY_NAME = 'orchestra';
