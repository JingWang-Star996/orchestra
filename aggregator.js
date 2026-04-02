#!/usr/bin/env node

/**
 * Aggregator - 结果汇总器
 * 
 * 职责：整合所有 AI 的输出，生成完整报告
 * 输入：所有任务的完成结果
 * 输出：整合后的完整文档/方案/代码
 */

class ResultAggregator {
  constructor(options = {}) {
    this.results = new Map();
    this.format = options.format || 'markdown';
    this.verbose = options.verbose || false;
  }

  /**
   * 添加任务结果
   */
  add(taskId, result) {
    this.results.set(taskId, {
      ...result,
      receivedAt: new Date().toISOString()
    });
    
    if (this.verbose) {
      console.log(`[Aggregator] 收到任务 ${taskId} 的结果`);
    }
  }

  /**
   * 汇总所有结果
   */
  aggregate(options = {}) {
    const format = options.format || this.format;
    
    switch (format) {
      case 'markdown':
        return this._aggregateMarkdown(options);
      case 'json':
        return this._aggregateJson(options);
      case 'html':
        return this._aggregateHtml(options);
      default:
        throw new Error(`不支持的格式：${format}`);
    }
  }

  /**
   * Markdown 格式汇总
   */
  _aggregateMarkdown(options = {}) {
    let md = `# 任务执行报告\n\n`;
    md += `**生成时间**: ${new Date().toLocaleString('zh-CN')}\n`;
    md += `**任务总数**: ${this.results.size}\n\n`;
    md += `---\n\n`;

    // 执行摘要
    md += `## 📊 执行摘要\n\n`;
    const summary = this._generateSummary();
    md += summary;
    md += `\n\n`;

    // 详细结果
    md += `## 📋 详细结果\n\n`;
    
    for (const [taskId, result] of this.results.entries()) {
      md += `### 任务 ${taskId}: ${result.title}\n\n`;
      md += `**负责**: ${result.agent}\n\n`;
      md += `**输出**:\n\n`;
      md += result.content || result.output || '无内容\n';
      md += `\n\n---\n\n`;
    }

    // 建议和下一步
    if (options.includeSuggestions) {
      md += `## 💡 建议和下一步\n\n`;
      md += this._generateSuggestions();
    }

    return md;
  }

  /**
   * JSON 格式汇总
   */
  _aggregateJson(options = {}) {
    return {
      metadata: {
        generatedAt: new Date().toISOString(),
        totalTasks: this.results.size,
        format: 'json'
      },
      summary: this._generateSummary(),
      results: [...this.results.entries()].map(([id, r]) => ({
        taskId: id,
        title: r.title,
        agent: r.agent,
        content: r.content,
        receivedAt: r.receivedAt
      })),
      suggestions: options.includeSuggestions ? this._generateSuggestions() : null
    };
  }

  /**
   * HTML 格式汇总
   */
  _aggregateHtml(options = {}) {
    let html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>任务执行报告</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
    h2 { color: #555; margin-top: 30px; }
    .task { background: #f8f9fa; padding: 15px; margin: 15px 0; border-radius: 5px; }
    .meta { color: #666; font-size: 0.9em; }
    .content { background: white; padding: 10px; margin: 10px 0; border-left: 3px solid #007bff; }
  </style>
</head>
<body>
  <h1>📊 任务执行报告</h1>
  <p class="meta">生成时间：${new Date().toLocaleString('zh-CN')}</p>
  <p class="meta">任务总数：${this.results.size}</p>
  
  <h2>执行摘要</h2>
  <p>${this._generateSummary()}</p>
  
  <h2>详细结果</h2>
`;

    for (const [taskId, result] of this.results.entries()) {
      html += `
  <div class="task">
    <h3>任务 ${taskId}: ${result.title}</h3>
    <p class="meta"><strong>负责:</strong> ${result.agent}</p>
    <div class="content">${result.content || result.output || '无内容'}</div>
  </div>`;
    }

    html += `
</body>
</html>`;

    return html;
  }

  /**
   * 生成执行摘要
   */
  _generateSummary() {
    const total = this.results.size;
    const agents = new Set([...this.results.values()].map(r => r.agent));
    
    return `本次任务共执行 **${total}** 个子任务，涉及 **${agents.size}** 个 AI 岗位。所有任务均已完成，输出内容已整合到下方详细结果中。`;
  }

  /**
   * 生成建议
   */
  _generateSuggestions() {
    // TODO: 基于 AI 分析生成建议
    return `基于本次执行结果，建议：\n\n1.  review 所有输出内容，确保符合预期\n2. 标记需要进一步优化的部分\n3. 规划下一阶段任务`;
  }

  /**
   * 质量检查
   */
  qualityCheck() {
    const issues = [];
    
    for (const [taskId, result] of this.results.entries()) {
      // 检查内容是否为空
      if (!result.content && !result.output) {
        issues.push({
          taskId,
          type: 'empty_content',
          message: '任务输出为空'
        });
      }
      
      // 检查内容长度
      const contentLength = (result.content || result.output || '').length;
      if (contentLength < 50) {
        issues.push({
          taskId,
          type: 'short_content',
          message: `任务输出过短（${contentLength} 字符）`
        });
      }
    }
    
    return {
      passed: issues.length === 0,
      issues: issues,
      total: this.results.size
    };
  }

  /**
   * 导出到文件
   */
  exportToFile(filePath, options = {}) {
    const fs = require('fs');
    const content = this.aggregate(options);
    
    let fileContent = content;
    if (typeof content === 'object') {
      fileContent = JSON.stringify(content, null, 2);
    }
    
    fs.writeFileSync(filePath, fileContent, 'utf-8');
    console.log(`[Aggregator] 报告已导出到：${filePath}`);
    
    return filePath;
  }
}

// 导出
module.exports = ResultAggregator;

// CLI 入口
if (require.main === module) {
  const aggregator = new ResultAggregator({ verbose: true });
  
  // 测试数据
  aggregator.add(1, {
    title: '需求分析',
    agent: 'AI 主策划',
    content: '## 需求分析\n\n用户需求：...\n功能列表：...'
  });
  
  aggregator.add(2, {
    title: '数值设计',
    agent: 'AI 数值策划',
    content: '## 数值设计\n\n基础公式：...\n成长曲线：...'
  });
  
  // 生成报告
  console.log('\n=== Markdown 报告 ===');
  console.log(aggregator.aggregate({ format: 'markdown', includeSuggestions: true }));
  
  console.log('\n=== 质量检查 ===');
  console.log(aggregator.qualityCheck());
}
