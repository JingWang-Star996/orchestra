#!/usr/bin/env node

/**
 * ActivityDescriber - 活动描述生成器
 * 
 * 职责：自动生成人类可读的活动描述
 * 功能：
 * - 基于工具调用生成自然语言描述
 * - 支持自定义描述模板
 * - 支持多语言
 * - 智能上下文感知
 */

class ActivityDescriber {
  constructor(options = {}) {
    this.language = options.language || 'zh-CN';
    this.templates = new Map();
    this.customTemplates = options.customTemplates || {};
    this.verbose = options.verbose || false;
    
    // 初始化内置模板
    this._initBuiltInTemplates();
    
    // 加载自定义模板
    if (Object.keys(this.customTemplates).length > 0) {
      this.loadTemplates(this.customTemplates);
    }
  }

  /**
   * 初始化内置模板
   * @private
   */
  _initBuiltInTemplates() {
    // 中文模板
    this.templates.set('zh-CN', {
      // 文件操作
      'read': {
        default: '正在读取 {path}...',
        completed: '已读取文件 {path}（{length} 字节）',
        error: '读取文件 {path} 失败：{error}'
      },
      'write': {
        default: '正在写入 {path}...',
        completed: '已写入文件 {path}（{length} 字节）',
        error: '写入文件 {path} 失败：{error}'
      },
      'edit': {
        default: '正在编辑 {path}...',
        completed: '已编辑文件 {path}（{edits} 处修改）',
        error: '编辑文件 {path} 失败：{error}'
      },
      
      // 网络操作
      'web_search': {
        default: '正在搜索 "{query}"...',
        completed: '搜索完成，找到 {count} 条结果',
        error: '搜索 "{query}" 失败：{error}'
      },
      'web_fetch': {
        default: '正在获取 {url}...',
        completed: '已获取网页内容（{chars} 字符）',
        error: '获取 {url} 失败：{error}'
      },
      
      // 系统操作
      'exec': {
        default: '正在执行命令：{command}...',
        completed: '命令执行完成（{duration}ms）',
        error: '命令执行失败：{error}'
      },
      
      // 消息操作
      'message': {
        default: '正在发送消息到 {target}...',
        completed: '消息已发送',
        error: '发送消息失败：{error}'
      },
      
      // 飞书操作
      'feishu_create_doc': {
        default: '正在创建文档 "{title}"...',
        completed: '文档已创建：{title}',
        error: '创建文档失败：{error}'
      },
      'feishu_update_doc': {
        default: '正在更新文档...',
        completed: '文档已更新',
        error: '更新文档失败：{error}'
      },
      'feishu_sheet': {
        default: '正在操作电子表格...',
        completed: '表格操作完成',
        error: '表格操作失败：{error}'
      },
      'feishu_bitable_app_table_record': {
        default: '正在操作多维表格记录...',
        completed: '记录操作完成',
        error: '记录操作失败：{error}'
      },
      
      // 默认模板
      '_default': {
        default: '正在执行 {toolName}...',
        completed: '{toolName} 执行完成',
        error: '{toolName} 执行失败：{error}'
      }
    });
    
    // 英文模板
    this.templates.set('en-US', {
      'read': {
        default: 'Reading {path}...',
        completed: 'Read file {path} ({length} bytes)',
        error: 'Failed to read {path}: {error}'
      },
      'write': {
        default: 'Writing to {path}...',
        completed: 'Written to {path} ({length} bytes)',
        error: 'Failed to write {path}: {error}'
      },
      'web_search': {
        default: 'Searching for "{query}"...',
        completed: 'Search completed, found {count} results',
        error: 'Search failed for "{query}": {error}'
      },
      'exec': {
        default: 'Executing command: {command}...',
        completed: 'Command executed ({duration}ms)',
        error: 'Command failed: {error}'
      },
      '_default': {
        default: 'Executing {toolName}...',
        completed: '{toolName} completed',
        error: '{toolName} failed: {error}'
      }
    });
  }

  /**
   * 加载自定义模板
   * @param {object} templates - 自定义模板对象
   */
  loadTemplates(templates) {
    for (const [lang, langTemplates] of Object.entries(templates)) {
      if (!this.templates.has(lang)) {
        this.templates.set(lang, {});
      }
      const existing = this.templates.get(lang);
      Object.assign(existing, langTemplates);
    }
    
    if (this.verbose) {
      console.log(`[ActivityDescriber] 已加载自定义模板`);
    }
  }

  /**
   * 添加单个模板
   * @param {string} toolName - 工具名称
   * @param {object} template - 模板对象
   * @param {string} language - 语言（可选）
   */
  addTemplate(toolName, template, language = null) {
    const lang = language || this.language;
    
    if (!this.templates.has(lang)) {
      this.templates.set(lang, {});
    }
    
    this.templates.get(lang)[toolName] = template;
    
    if (this.verbose) {
      console.log(`[ActivityDescriber] 已添加模板：${toolName} (${lang})`);
    }
  }

  /**
   * 生成活动描述
   * @param {string} toolName - 工具名称
   * @param {string} status - 状态 (default|completed|error)
   * @param {object} context - 上下文数据（输入/输出/错误）
   * @returns {string} 人类可读的描述
   */
  describe(toolName, status = 'default', context = {}) {
    const lang = this.language;
    const templates = this.templates.get(lang) || this.templates.get('zh-CN');
    
    // 获取工具模板，如果没有则使用默认模板
    const toolTemplate = templates[toolName] || templates['_default'];
    
    if (!toolTemplate) {
      return this._generateFallback(toolName, status, context);
    }
    
    const template = toolTemplate[status] || toolTemplate['default'];
    
    if (!template) {
      return this._generateFallback(toolName, status, context);
    }
    
    // 替换模板变量
    return this._interpolate(template, { toolName, ...context });
  }

  /**
   * 生成进度描述（用于进行中的任务）
   * @param {string} toolName - 工具名称
   * @param {object} input - 输入参数
   * @returns {string} 进度描述
   */
  describeProgress(toolName, input = {}) {
    return this.describe(toolName, 'default', input);
  }

  /**
   * 生成完成描述
   * @param {string} toolName - 工具名称
   * @param {object} output - 输出结果
   * @returns {string} 完成描述
   */
  describeComplete(toolName, output = {}) {
    return this.describe(toolName, 'completed', output);
  }

  /**
   * 生成错误描述
   * @param {string} toolName - 工具名称
   * @param {Error} error - 错误对象
   * @param {object} input - 输入参数（可选）
   * @returns {string} 错误描述
   */
  describeError(toolName, error, input = {}) {
    return this.describe(toolName, 'error', { 
      error: error.message,
      ...input 
    });
  }

  /**
   * 批量生成描述（用于时间线）
   * @param {Array} records - 调用记录数组
   * @returns {Array} 带描述的记录
   */
  describeBatch(records) {
    return records.map(record => ({
      ...record,
      description: this.describe(
        record.toolName,
        record.status === 'error' ? 'error' : 
        record.status === 'completed' ? 'completed' : 'default',
        { ...record.input, ...record.output, error: record.error?.message }
      )
    }));
  }

  /**
   * 生成活动摘要
   * @param {Array} records - 调用记录数组
   * @returns {string} 摘要文本
   */
  generateSummary(records) {
    if (records.length === 0) {
      return this.language === 'zh-CN' 
        ? '暂无活动记录' 
        : 'No activity records';
    }
    
    const described = this.describeBatch(records);
    
    let text = this.language === 'zh-CN' 
      ? `📋 活动记录（${records.length}条）\n\n`
      : `📋 Activity Log (${records.length} items)\n\n`;
    
    described.forEach((r, i) => {
      const time = new Date(r.timestamp).toLocaleTimeString(
        this.language === 'zh-CN' ? 'zh-CN' : 'en-US'
      );
      const icon = r.status === 'error' ? '❌' : 
                   r.status === 'completed' ? '✅' : '⏳';
      
      text += `${icon} ${time} - ${r.description}\n`;
    });
    
    return text;
  }

  /**
   * 设置语言
   * @param {string} lang - 语言代码
   */
  setLanguage(lang) {
    this.language = lang;
    
    if (this.verbose) {
      console.log(`[ActivityDescriber] 语言已切换：${lang}`);
    }
  }

  /**
   * 获取当前语言
   * @returns {string} 语言代码
   */
  getLanguage() {
    return this.language;
  }

  /**
   * 注册自定义插值函数
   * @param {string} name - 函数名
   * @param {Function} fn - 插值函数
   */
  registerInterpolator(name, fn) {
    if (!this._interpolators) {
      this._interpolators = new Map();
    }
    this._interpolators.set(name, fn);
  }

  /**
   * 模板插值
   * @private
   */
  _interpolate(template, data) {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      if (data.hasOwnProperty(key)) {
        const value = data[key];
        
        // 处理自定义插值函数
        if (this._interpolators && this._interpolators.has(key)) {
          return this._interpolators.get(key)(value, data);
        }
        
        // 默认处理
        if (typeof value === 'object' && value !== null) {
          try {
            return JSON.stringify(value);
          } catch (e) {
            return '[Object]';
          }
        }
        return String(value);
      }
      return match;
    });
  }

  /**
   * 生成回退描述（当没有模板时）
   * @private
   */
  _generateFallback(toolName, status, context) {
    const zh = this.language === 'zh-CN';
    
    switch (status) {
      case 'completed':
        return zh 
          ? `${toolName} 执行完成` 
          : `${toolName} completed`;
      case 'error':
        return zh 
          ? `${toolName} 执行失败：${context.error || '未知错误'}` 
          : `${toolName} failed: ${context.error || 'Unknown error'}`;
      default:
        return zh 
          ? `正在执行 ${toolName}...` 
          : `Executing ${toolName}...`;
    }
  }
}

// 导出单例
const globalDescriber = new ActivityDescriber({ language: 'zh-CN' });

module.exports = {
  ActivityDescriber,
  globalDescriber,
  createDescriber: (options) => new ActivityDescriber(options)
};

// CLI 入口 - 测试模式
if (require.main === module) {
  console.log('=== ActivityDescriber 测试模式 ===\n');
  
  const describer = new ActivityDescriber({ 
    language: 'zh-CN',
    verbose: true 
  });
  
  // 测试各种场景
  const tests = [
    {
      toolName: 'read',
      status: 'default',
      context: { path: 'src/main.js' }
    },
    {
      toolName: 'read',
      status: 'completed',
      context: { path: 'src/main.js', length: 1024 }
    },
    {
      toolName: 'web_search',
      status: 'default',
      context: { query: 'AI 发展趋势' }
    },
    {
      toolName: 'web_search',
      status: 'completed',
      context: { query: 'AI 发展趋势', count: 10 }
    },
    {
      toolName: 'exec',
      status: 'error',
      context: { command: 'npm install', error: '权限不足' }
    },
    {
      toolName: 'unknown_tool',
      status: 'default',
      context: {}
    }
  ];
  
  console.log('=== 模板描述测试 ===');
  tests.forEach(test => {
    const desc = describer.describe(test.toolName, test.status, test.context);
    console.log(`${test.toolName} (${test.status}): ${desc}`);
  });
  
  console.log('\n=== 快捷方法测试 ===');
  console.log('Progress:', describer.describeProgress('write', { path: 'config.json' }));
  console.log('Complete:', describer.describeComplete('feishu_create_doc', { title: '周报' }));
  console.log('Error:', describer.describeError('read', new Error('文件不存在'), { path: 'missing.txt' }));
  
  console.log('\n=== 批量描述测试 ===');
  const records = [
    { toolName: 'read', status: 'completed', timestamp: new Date().toISOString(), input: { path: 'a.js' }, output: { length: 100 } },
    { toolName: 'web_search', status: 'completed', timestamp: new Date().toISOString(), input: { query: 'test' }, output: { count: 5 } },
    { toolName: 'exec', status: 'error', timestamp: new Date().toISOString(), input: { command: 'ls' }, error: { message: '失败' } }
  ];
  console.log(describer.generateSummary(records));
  
  console.log('\n=== 多语言测试 ===');
  describer.setLanguage('en-US');
  console.log('EN:', describer.describe('read', 'completed', { path: 'test.js', length: 200 }));
}
