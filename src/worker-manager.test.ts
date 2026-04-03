/**
 * Worker Manager 单元测试
 * 
 * 测试覆盖：
 * 1. Worker 创建工具
 * 2. Worker 继续工具
 * 3. Worker 停止工具
 * 4. Continue vs. Spawn 决策逻辑
 */

import { WorkerManager, workerManager } from './worker-manager';
import { WorkerStatus } from './worker-manager';
import type { WorkerConfig } from './worker-manager';

// 设置测试环境
process.env.NODE_ENV = 'test';

describe('WorkerManager', () => {
  let manager: WorkerManager;

  beforeEach(() => {
    // 每个测试使用新的实例
    manager = new WorkerManager();
  });

  afterEach(() => {
    // 清理所有 Worker
    manager.stopAllWorkers();
  });

  // ============================================================================
  // 1. Worker 创建工具测试
  // ============================================================================

  describe('createWorker', () => {
    it('should create worker with valid config', async () => {
      const config: WorkerConfig = {
        description: '前端开发专家',
        agentType: 'specialist',
        prompt: '你是资深前端工程师，精通 React 和 TypeScript'
      };

      const workerId = await manager.createWorker(config);

      expect(workerId).toMatch(/^worker_[a-z0-9]+_[a-z0-9]+$/);
      
      const worker = manager.getWorker(workerId);
      expect(worker).toBeDefined();
      expect(worker?.config.description).toBe('前端开发专家');
      expect(worker?.config.agentType).toBe('specialist');
      expect(worker?.status).toBe(WorkerStatus.IDLE);
    });

    it('should create worker with initial message', async () => {
      const config: WorkerConfig = {
        description: '测试 Worker',
        agentType: 'agent',
        prompt: '你是一个助手',
        initialMessage: '你好，请帮我写代码'
      };

      const workerId = await manager.createWorker(config);
      const worker = manager.getWorker(workerId);

      expect(worker?.messageCount).toBeGreaterThan(0);
    });

    it('should merge default config', async () => {
      const config: WorkerConfig = {
        description: '测试 Worker',
        agentType: 'task',
        prompt: '测试提示词'
      };

      const workerId = await manager.createWorker(config);
      const worker = manager.getWorker(workerId);

      expect(worker?.config.model).toBe('bailian/qwen3.5-plus');
      expect(worker?.config.thinking).toBe(false);
    });

    it('should throw error when description is empty', async () => {
      const config: any = {
        description: '',
        agentType: 'agent',
        prompt: '测试'
      };

      await expect(manager.createWorker(config)).rejects.toThrow('description');
    });

    it('should throw error when prompt is empty', async () => {
      const config: any = {
        description: '测试',
        agentType: 'agent',
        prompt: ''
      };

      await expect(manager.createWorker(config)).rejects.toThrow('prompt');
    });

    it('should throw error with invalid agent type', async () => {
      const config: any = {
        description: '测试',
        agentType: 'invalid-type',
        prompt: '测试'
      };

      await expect(manager.createWorker(config)).rejects.toThrow('Invalid agent type');
    });

    it('should create worker with parent worker', async () => {
      // 创建父 Worker
      const parentId = await manager.createWorker({
        description: '父 Worker',
        agentType: 'agent',
        prompt: '父提示词'
      });

      // 创建子 Worker
      const childId = await manager.createWorker({
        description: '子 Worker',
        agentType: 'agent',
        prompt: '子提示词',
        parentWorkerId: parentId
      });

      const child = manager.getWorker(childId);
      expect(child?.config.parentWorkerId).toBe(parentId);
    });
  });

  // ============================================================================
  // 2. Worker 继续工具测试
  // ============================================================================

  describe('continueWorker', () => {
    it('should send message to worker', async () => {
      const workerId = await manager.createWorker({
        description: '测试 Worker',
        agentType: 'agent',
        prompt: '测试'
      });

      const result = await manager.continueWorker(workerId, '你好');

      expect(result.success).toBe(true);
      
      const worker = manager.getWorker(workerId);
      expect(worker?.messageCount).toBeGreaterThan(0);
      expect(worker?.status).toBe(WorkerStatus.RUNNING);
    });

    it('should throw error when worker not found', async () => {
      await expect(manager.continueWorker('non-existent', '消息'))
        .rejects.toThrow('Worker not found');
    });

    it('should throw error when worker is stopped', async () => {
      const workerId = await manager.createWorker({
        description: '测试',
        agentType: 'agent',
        prompt: '测试'
      });

      await manager.stopWorker(workerId);

      await expect(manager.continueWorker(workerId, '消息'))
        .rejects.toThrow('Worker is stopped');
    });

    it('should wait for response when waitForResponse is true', async () => {
      const workerId = await manager.createWorker({
        description: '测试',
        agentType: 'agent',
        prompt: '测试'
      });

      const result = await manager.continueWorker(workerId, '你好', {
        waitForResponse: true,
        timeoutMs: 5000
      });

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
      expect(typeof result.response).toBe('string');
    });

    it('should update lastActiveAt timestamp', async () => {
      const workerId = await manager.createWorker({
        description: '测试',
        agentType: 'agent',
        prompt: '测试'
      });

      const worker1 = manager.getWorker(workerId);
      const lastActiveAt1 = worker1?.lastActiveAt;

      // 等待一小段时间
      await new Promise(resolve => setTimeout(resolve, 10));

      await manager.continueWorker(workerId, '消息');

      const worker2 = manager.getWorker(workerId);
      expect(worker2?.lastActiveAt).toBeGreaterThan(lastActiveAt1!);
    });
  });

  // ============================================================================
  // 3. Worker 停止工具测试
  // ============================================================================

  describe('stopWorker', () => {
    it('should stop worker gracefully', async () => {
      const workerId = await manager.createWorker({
        description: '测试',
        agentType: 'agent',
        prompt: '测试'
      });

      const result = await manager.stopWorker(workerId, {
        graceful: true,
        reason: '任务完成'
      });

      expect(result.success).toBe(true);
      expect(result.workerId).toBe(workerId);

      const worker = manager.getWorker(workerId);
      expect(worker?.status).toBe(WorkerStatus.STOPPED);
    });

    it('should stop worker immediately', async () => {
      const workerId = await manager.createWorker({
        description: '测试',
        agentType: 'agent',
        prompt: '测试'
      });

      const result = await manager.stopWorker(workerId, {
        graceful: false
      });

      expect(result.success).toBe(true);
      
      const worker = manager.getWorker(workerId);
      expect(worker?.status).toBe(WorkerStatus.STOPPED);
    });

    it('should throw error when worker not found', async () => {
      await expect(manager.stopWorker('non-existent'))
        .rejects.toThrow('Worker not found');
    });

    it('should stop all workers', async () => {
      // 创建多个 Worker
      const worker1 = await manager.createWorker({
        description: 'Worker 1',
        agentType: 'agent',
        prompt: '测试'
      });
      const worker2 = await manager.createWorker({
        description: 'Worker 2',
        agentType: 'agent',
        prompt: '测试'
      });
      const worker3 = await manager.createWorker({
        description: 'Worker 3',
        agentType: 'agent',
        prompt: '测试'
      });

      await manager.stopAllWorkers({ graceful: false });

      expect(manager.getWorker(worker1)?.status).toBe(WorkerStatus.STOPPED);
      expect(manager.getWorker(worker2)?.status).toBe(WorkerStatus.STOPPED);
      expect(manager.getWorker(worker3)?.status).toBe(WorkerStatus.STOPPED);
    });
  });

  // ============================================================================
  // 4. Continue vs. Spawn 决策逻辑测试
  // ============================================================================

  describe('makeContinueDecision', () => {
    it('should return false when no workers available', async () => {
      const decision = await manager.makeContinueDecision('新任务');

      expect(decision.shouldContinue).toBe(false);
      expect(decision.reason).toBe('没有可用的 Worker');
      expect(decision.scores.totalScore).toBe(0);
    });

    it('should return true for high context overlap', async () => {
      // 创建 Worker
      const workerId = await manager.createWorker({
        description: '前端开发专家',
        agentType: 'specialist',
        prompt: '精通 React、TypeScript、前端工程化'
      });

      // 发送消息激活
      await manager.continueWorker(workerId, '帮我写一个 React 组件');

      // 决策：相关任务
      const decision = await manager.makeContinueDecision(
        '继续优化这个 React 组件的性能',
        [workerId]
      );

      expect(decision.shouldContinue).toBe(true);
      expect(decision.recommendedWorkerId).toBe(workerId);
      expect(decision.scores.contextOverlap).toBeGreaterThan(30);
    });

    it('should return false for unrelated task', async () => {
      // 创建 Worker
      const workerId = await manager.createWorker({
        description: '前端开发专家',
        agentType: 'specialist',
        prompt: '精通 React、TypeScript'
      });

      // 决策：不相关任务
      const decision = await manager.makeContinueDecision(
        '帮我做一道数学题：1+1=?',
        [workerId]
      );

      expect(decision.shouldContinue).toBe(false);
      expect(decision.scores.totalScore).toBeLessThan(60);
    });

    it('should prefer recently active worker', async () => {
      // 创建两个 Worker
      const worker1 = await manager.createWorker({
        description: '前端开发',
        agentType: 'specialist',
        prompt: 'React 专家'
      });
      
      const worker2 = await manager.createWorker({
        description: '前端开发',
        agentType: 'specialist',
        prompt: 'React 专家'
      });

      // worker2 更活跃
      await manager.continueWorker(worker2, '最新消息');

      const decision = await manager.makeContinueDecision(
        '继续前端开发工作',
        [worker1, worker2]
      );

      expect(decision.shouldContinue).toBe(true);
      expect(decision.recommendedWorkerId).toBe(worker2);
    });

    it('should calculate decision scores correctly', async () => {
      const workerId = await manager.createWorker({
        description: '测试 Worker',
        agentType: 'agent',
        prompt: '测试提示词'
      });

      const decision = await manager.makeContinueDecision(
        '继续完成任务',
        [workerId]
      );

      // 验证得分结构
      expect(decision.scores).toHaveProperty('contextOverlap');
      expect(decision.scores).toHaveProperty('taskContinuity');
      expect(decision.scores).toHaveProperty('resourceEfficiency');
      expect(decision.scores).toHaveProperty('totalScore');

      // 验证得分范围
      expect(decision.scores.contextOverlap).toBeGreaterThanOrEqual(0);
      expect(decision.scores.contextOverlap).toBeLessThanOrEqual(100);
      expect(decision.scores.taskContinuity).toBeGreaterThanOrEqual(0);
      expect(decision.scores.taskContinuity).toBeLessThanOrEqual(100);
      expect(decision.scores.resourceEfficiency).toBeGreaterThanOrEqual(0);
      expect(decision.scores.resourceEfficiency).toBeLessThanOrEqual(100);
      expect(decision.scores.totalScore).toBeGreaterThanOrEqual(0);
      expect(decision.scores.totalScore).toBeLessThanOrEqual(100);
    });

    it('should detect continuity keywords', async () => {
      const workerId = await manager.createWorker({
        description: '测试',
        agentType: 'agent',
        prompt: '测试'
      });

      // 包含"继续"关键词
      const decision1 = await manager.makeContinueDecision(
        '继续刚才的工作',
        [workerId]
      );

      // 不包含连续性关键词
      const decision2 = await manager.makeContinueDecision(
        '开始一个新任务',
        [workerId]
      );

      expect(decision1.scores.taskContinuity)
        .toBeGreaterThan(decision2.scores.taskContinuity);
    });
  });

  // ============================================================================
  // 5. 辅助方法测试
  // ============================================================================

  describe('getWorkers', () => {
    it('should return all workers', async () => {
      await manager.createWorker({
        description: 'Worker 1',
        agentType: 'agent',
        prompt: '测试'
      });
      await manager.createWorker({
        description: 'Worker 2',
        agentType: 'agent',
        prompt: '测试'
      });

      const workers = manager.getWorkers();
      expect(workers).toHaveLength(2);
    });

    it('should filter by status', async () => {
      const worker1 = await manager.createWorker({
        description: 'Worker 1',
        agentType: 'agent',
        prompt: '测试'
      });
      const worker2 = await manager.createWorker({
        description: 'Worker 2',
        agentType: 'agent',
        prompt: '测试'
      });

      await manager.stopWorker(worker2);

      const activeWorkers = manager.getWorkers({ status: WorkerStatus.IDLE });
      expect(activeWorkers).toHaveLength(1);
      expect(activeWorkers[0].workerId).toBe(worker1);

      const stoppedWorkers = manager.getWorkers({ status: WorkerStatus.STOPPED });
      expect(stoppedWorkers).toHaveLength(1);
      expect(stoppedWorkers[0].workerId).toBe(worker2);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      const worker1 = await manager.createWorker({
        description: 'Worker 1',
        agentType: 'agent',
        prompt: '测试'
      });
      const worker2 = await manager.createWorker({
        description: 'Worker 2',
        agentType: 'agent',
        prompt: '测试'
      });

      await manager.continueWorker(worker1, '消息 1');
      await manager.continueWorker(worker1, '消息 2');
      await manager.continueWorker(worker2, '消息 1');

      const stats = manager.getStats();

      expect(stats.total).toBe(2);
      expect(stats.totalMessages).toBeGreaterThan(0);
      expect(stats.byStatus[WorkerStatus.IDLE]).toBe(2);
    });
  });

  describe('cleanupStoppedWorkers', () => {
    it('should cleanup stopped workers', async () => {
      const worker1 = await manager.createWorker({
        description: 'Worker 1',
        agentType: 'agent',
        prompt: '测试'
      });
      const worker2 = await manager.createWorker({
        description: 'Worker 2',
        agentType: 'agent',
        prompt: '测试'
      });

      await manager.stopWorker(worker1);
      await manager.stopWorker(worker2);

      const cleaned = manager.cleanupStoppedWorkers();
      expect(cleaned).toBe(2);

      expect(manager.getWorkers()).toHaveLength(0);
    });

    it('should not cleanup recent stopped workers', async () => {
      const worker = await manager.createWorker({
        description: 'Worker',
        agentType: 'agent',
        prompt: '测试'
      });

      await manager.stopWorker(worker);

      // 清理 1 分钟前的，应该不清理
      const cleaned = manager.cleanupStoppedWorkers(1);
      expect(cleaned).toBe(0);
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens for Chinese text', () => {
      const text = '你好世界';
      const tokens = (manager as any).estimateTokens(text);
      expect(tokens).toBe(4); // 4 个中文字符
    });

    it('should estimate tokens for English text', () => {
      const text = 'Hello World';
      const tokens = (manager as any).estimateTokens(text);
      expect(tokens).toBeLessThanOrEqual(11); // 11 个字符 / 4
    });

    it('should estimate tokens for mixed text', () => {
      const text = '你好 Hello';
      const tokens = (manager as any).estimateTokens(text);
      expect(tokens).toBeGreaterThan(2);
    });
  });

  describe('tokenize', () => {
    it('should tokenize text into words', () => {
      const text = 'Hello World, this is a test!';
      const tokens = (manager as any).tokenize(text);
      
      expect(tokens.has('hello')).toBe(true);
      expect(tokens.has('world')).toBe(true);
      expect(tokens.has('test')).toBe(true);
    });

    it('should filter out single characters', () => {
      const text = 'a b c test';
      const tokens = (manager as any).tokenize(text);
      
      expect(tokens.has('a')).toBe(false);
      expect(tokens.has('test')).toBe(true);
    });
  });
});

// ============================================================================
// 集成测试
// ============================================================================

describe('WorkerManager Integration', () => {
  it('should complete full worker lifecycle', async () => {
    const manager = new WorkerManager();

    // 1. 创建 Worker
    const workerId = await manager.createWorker({
      description: '全栈开发专家',
      agentType: 'specialist',
      prompt: '你是全栈开发专家，精通前后端技术',
      initialMessage: '你好，我需要帮助'
    });

    expect(workerId).toMatch(/^worker_/);

    // 2. 继续对话
    const result = await manager.continueWorker(workerId, '请帮我写一个 API', {
      waitForResponse: true,
      timeoutMs: 5000
    });

    expect(result.success).toBe(true);
    expect(result.response).toBeDefined();

    // 3. 再次继续
    await manager.continueWorker(workerId, '请添加错误处理');

    // 4. 查看统计
    const stats = manager.getStats();
    expect(stats.total).toBe(1);
    expect(stats.totalMessages).toBeGreaterThan(1);

    // 5. 优雅停止
    await manager.stopWorker(workerId, {
      graceful: true,
      reason: '任务完成'
    });

    const worker = manager.getWorker(workerId);
    expect(worker?.status).toBe(WorkerStatus.STOPPED);

    // 6. 清理
    manager.cleanupStoppedWorkers();
    expect(manager.getWorkers()).toHaveLength(0);
  });

  it('should handle multiple concurrent workers', async () => {
    const manager = new WorkerManager();

    // 创建多个 Worker
    const workers = await Promise.all([
      manager.createWorker({
        description: '前端开发',
        agentType: 'specialist',
        prompt: '前端专家'
      }),
      manager.createWorker({
        description: '后端开发',
        agentType: 'specialist',
        prompt: '后端专家'
      }),
      manager.createWorker({
        description: '测试工程师',
        agentType: 'specialist',
        prompt: '测试专家'
      })
    ]);

    expect(workers).toHaveLength(3);

    // 并发发送消息
    const results = await Promise.all(
      workers.map(id => manager.continueWorker(id, '你好'))
    );

    results.forEach(result => {
      expect(result.success).toBe(true);
    });

    // 验证所有 Worker 都在运行
    const activeCount = manager.getActiveWorkerCount();
    expect(activeCount).toBe(3);

    // 停止所有
    await manager.stopAllWorkers();
    expect(manager.getActiveWorkerCount()).toBe(0);
  });
});

// ============================================================================
// 单例测试
// ============================================================================

describe('workerManager singleton', () => {
  it('should export singleton instance', () => {
    expect(workerManager).toBeDefined();
    expect(workerManager).toBeInstanceOf(WorkerManager);
  });

  it('should maintain state across calls', async () => {
    const workerId = await workerManager.createWorker({
      description: '测试单例',
      agentType: 'agent',
      prompt: '测试'
    });

    // 验证单例状态
    const worker = workerManager.getWorker(workerId);
    expect(worker).toBeDefined();
    expect(worker?.workerId).toBe(workerId);

    // 清理
    await workerManager.stopWorker(workerId);
    workerManager.cleanupStoppedWorkers();
  });
});
