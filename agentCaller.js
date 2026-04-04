#!/usr/bin/env node

/**
 * AgentCaller - 通用 Agent 调用器
 * 
 * 职责：调用任意 Agent 执行任务
 * 
 * 灵感来源：Claude Code 的 Agent 工具
 */

const https = require('https');
const path = require('path');
const fs = require('fs');

// AI 配置 - 支持多种 AI 服务商（动态读取环境变量）
const AI_CONFIG = {
  model: process.env.ORCHESTRA_MODEL || process.env.DREAM_MODEL || 'qwen3.5-plus',
  apiKey: process.env.ORCHESTRA_API_KEY || process.env.DREAM_API_KEY || '',
  baseUrl: process.env.ORCHESTRA_API_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1'
};

/**
 * 调用 Agent 执行任务
 * @param {string} agentName - Agent 名称
 * @param {string} task - 任务描述
 * @param {string} agentPromptPath - Agent 提示词文件路径
 * @returns {Promise<Object>} Agent 执行结果
 */
async function callAgent(agentName, task, agentPromptPath = null) {
  console.log(`[AgentCaller] 调用 ${agentName}...`);
  
  // 加载 Agent 提示词
  let agentPrompt = '';
  if (agentPromptPath && fs.existsSync(agentPromptPath)) {
    agentPrompt = fs.readFileSync(agentPromptPath, 'utf-8');
  }
  
  // 构建调用提示词
  const prompt = buildAgentPrompt(agentName, task, agentPrompt);
  
  // 调用 AI
  const result = await callAI(prompt);
  
  console.log(`[AgentCaller] ${agentName} 完成`);
  
  return {
    agent: agentName,
    task: task,
    result: result,
    tokens: result.usage?.total_tokens || 0,
    time: new Date().toISOString()
  };
}

/**
 * 构建 Agent 调用提示词
 */
function buildAgentPrompt(agentName, task, agentPrompt) {
  let prompt = '';
  
  // 如果有 Agent 提示词，先加载
  if (agentPrompt) {
    prompt += `${agentPrompt}\n\n`;
  }
  
  // 添加当前任务
  prompt += `---

**当前任务**：
${task}

**要求**：
1. 专业、详细地完成任务
2. 展现该岗位的专业知识深度
3. 提供可执行的方案
4. 如果有多个方案，请提供差异化选择

**输出格式**：
请清晰组织你的回答，使用 Markdown 格式。
`;
  
  return prompt;
}

/**
 * 调用 AI API
 */
function callAI(prompt) {
  return new Promise((resolve, reject) => {
    if (!AI_CONFIG.apiKey) {
      reject(new Error('未配置 API Key'));
      return;
    }
    
    const postData = JSON.stringify({
      model: AI_CONFIG.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 4000
    });
    
    // 解析 baseUrl
    const url = new URL(AI_CONFIG.baseUrl);
    
    const options = {
      hostname: url.hostname,
      port: 443,
      path: '/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_CONFIG.apiKey}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          
          if (response.choices && response.choices.length > 0) {
            resolve({
              content: response.choices[0].message.content,
              usage: response.usage
            });
          } else {
            reject(new Error(`AI 响应格式错误：${data}`));
          }
        } catch (error) {
          reject(new Error(`解析 AI 响应失败：${error.message}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(new Error(`调用 AI API 失败：${error.message}`));
    });
    
    req.write(postData);
    req.end();
  });
}

// 导出
module.exports = {
  callAgent,
  callAI
};

// CLI 测试
if (require.main === module) {
  // 测试调用
  callAgent('测试 Agent', '测试任务')
    .then(result => {
      console.log('\n=== 测试结果 ===');
      console.log(result);
    })
    .catch(console.error);
}
