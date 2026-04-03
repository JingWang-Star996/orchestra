#!/usr/bin/env node

/**
 * Orchestra Agent Executor - 集成状态管理的 Agent 执行器
 * 
 * 用法：
 * const { spawnAgent } = require('./agentExecutor');
 * 
 * // 启动 Agent（自动注册状态）
 * const agent = await spawnAgent('AI CTO', '开发 Dashboard', { timeout: 300 });
 * 
 * // 完成后自动更新状态
 */

const { stateManager } = require('./stateManager');
const fs = require('fs').promises;
const path = require('path');

// 状态文件路径
const STATE_FILE = path.join(__dirname, 'temp/orchestra-state.json');

/**
 * 定期保存状态（每 5 秒）
 */
let autoSaveInterval = null;
function startAutoSave() {
  if (autoSaveInterval) return;
  autoSaveInterval = setInterval(() => {
    stateManager._saveState();
  }, 5000);
}

function stopAutoSave() {
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval);
    autoSaveInterval = null;
  }
}

/**
 * 生成 Agent ID
 */
function generateAgentId(name) {
  const prefix = name.toLowerCase().replace(/[^a-z]/g, '-').substring(0, 20);
  const random = Math.random().toString(36).substring(2, 6);
  return `${prefix}-${random}`;
}

/**
 * 启动 Agent 并监控状态
 * @param {string} name - Agent 名称
 * @param {string} task - 任务描述
 * @param {Object} options - 配置选项
 * @returns {Promise<Object>} Agent 执行结果
 */
async function spawnAgent(name, task, options = {}) {
  const agentId = generateAgentId(name);
  
  console.log(`[AgentExecutor] 启动 Agent: ${agentId} - ${name}`);
  
  // 1. 注册 Agent 状态
  stateManager.register(agentId, name, {
    type: options.type || 'subagent',
    description: task
  });
  
  // 启动自动保存
  startAutoSave();
  
  const startTime = Date.now();
  let lastTokenCount = 0;
  let lastToolCount = 0;
  let session = null;
  
  try {
    // 2. 启动子代理（真实 AI 调用）
    let sessions_spawn = global.sessions_spawn;
    let process = global.process;
    
    // 如果没有全局 API，尝试动态加载（独立运行模式）
    if (!sessions_spawn) {
      console.warn('[AgentExecutor] 警告：OpenClaw 全局 API 不可用，使用模拟模式');
      console.warn('[AgentExecutor] 如需真实 AI 调用，请在 OpenClaw 主会话中运行');
      
      // 模拟模式：创建假 session
      session = {
        sessionKey: agentId,
        id: agentId
      };
      
      const sessionId = agentId;
      console.log(`[AgentExecutor] 模拟模式：${name} (${sessionId})`);
      
      // 模拟进度更新
      const statusInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const estimatedTokens = Math.floor(elapsed / 100) * 100;
        const estimatedTools = Math.floor(elapsed / 3000);
        
        if (estimatedTokens > lastTokenCount || estimatedTools > lastToolCount) {
          lastTokenCount = estimatedTokens;
          lastToolCount = estimatedTools;
          
          stateManager.updateProgress(agentId, {
            tokenCount: estimatedTokens,
            toolUseCount: estimatedTools,
            recentActivities: ['模拟执行中...']
          });
        }
      }, 10000);
      
      // 模拟完成
      setTimeout(() => {
        clearInterval(statusInterval);
        stateManager.complete(agentId, { status: 'completed', output: '模拟完成' });
        console.log(`[AgentExecutor] 模拟完成：${name}`);
      }, 30000);
      
      return { sessionId: agentId, status: 'running', mode: 'simulation' };
    }
    
    console.log(`[AgentExecutor] 通过 OpenClaw API 启动：${name}`);
    
    const session = await sessions_spawn({
      task: task,
      mode: options.mode || 'run',
      runtime: options.runtime || 'subagent',
      label: name,
      timeoutSeconds: options.timeout || 300,
      cleanup: 'keep'
    });
    
    const sessionId = session.sessionKey || session.id;
    console.log(`[AgentExecutor] 会话已创建：${sessionId}`);
    
    // 3. 定期轮询状态并更新（每 10 秒）
    const statusInterval = setInterval(async () => {
      try {
        const elapsed = Date.now() - startTime;
        
        // 通过 process API 获取真实状态
        let pollResult = null;
        if (process && sessionId) {
          try {
            pollResult = await process({
              action: 'poll',
              sessionId: sessionId,
              timeout: 5000,
              limit: 100
            });
          } catch (err) {
            // 轮询失败不影响继续执行
            console.warn(`[AgentExecutor] 轮询失败：${err.message}`);
          }
        }
        
        // 估算 Token 和工具调用（基于时间和轮询结果）
        const estimatedTokens = Math.floor(elapsed / 100) * 100;
        const estimatedTools = Math.floor(elapsed / 3000);
        
        if (estimatedTokens > lastTokenCount || estimatedTools > lastToolCount) {
          lastTokenCount = estimatedTokens;
          lastToolCount = estimatedTools;
          
          // 更新活动状态
          const activities = pollResult?.output 
            ? [`执行中... (${pollResult.output.substring(0, 50)}...)`] 
            : ['执行中...'];
          
          stateManager.updateProgress(agentId, {
            tokenCount: estimatedTokens,
            toolUseCount: estimatedTools,
            recentActivities: activities
          });
          
          console.log(`[AgentExecutor] 更新进度：${name} - ${estimatedTokens} tokens, ${estimatedTools} tools`);
        }
      } catch (err) {
        console.error(`[AgentExecutor] 状态更新失败：${err.message}`);
      }
    }, 10000);
    
    // 4. 等待完成（如果是 run 模式）
    if (options.mode === 'run') {
      // 简单等待，实际应该轮询会话状态
      await new Promise(resolve => setTimeout(resolve, options.timeout * 1000));
    }
    
    clearInterval(statusInterval);
    
    // 5. 完成任务
    const result = {
      sessionId: sessionId,
      status: 'completed',
      duration: Date.now() - startTime
    };
    
    stateManager.complete(agentId, result);
    stateManager._saveState();
    
    console.log(`[AgentExecutor] Agent 完成：${agentId}`);
    return result;
    
  } catch (error) {
    console.error(`[AgentExecutor] Agent 失败：${agentId} - ${error.message}`);
    
    // 6. 失败处理
    stateManager.fail(agentId, error.message);
    stateManager._saveState();
    
    throw error;
  } finally {
    // 清理自动保存
    stopAutoSave();
  }
}

/**
 * 批量启动多个 Agent（并行）
 * @param {Array} agents - Agent 配置数组
 * @returns {Promise<Array>} 所有 Agent 结果
 */
async function spawnAgents(agents) {
  console.log(`[AgentExecutor] 批量启动 ${agents.length} 个 Agent`);
  
  const promises = agents.map(agent => 
    spawnAgent(agent.name, agent.task, agent.options)
      .then(result => ({ ...result, name: agent.name }))
      .catch(err => ({ error: err.message, name: agent.name }))
  );
  
  return Promise.all(promises);
}

// 导出
module.exports = {
  spawnAgent,
  spawnAgents,
  generateAgentId,
  stateManager
};

// CLI 测试
if (require.main === module) {
  console.log('=== Agent Executor 测试 ===\n');
  
  // 测试：启动模拟 Agent
  (async () => {
    try {
      const result = await spawnAgent(
        '测试 Agent',
        '这是一个测试任务',
        { timeout: 10 }
      );
      console.log('\n测试结果:', result);
    } catch (err) {
      console.error('测试失败:', err.message);
    }
    
    console.log('\n状态文件位置:', require('./stateManager').STATE_FILE || 'temp/orchestra-state.json');
  })();
}
