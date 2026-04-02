#!/usr/bin/env node

/**
 * Scratchpad - 跨 Worker 知识共享系统（Phase 2 增强功能）
 * 
 * 职责：实现跨 Worker 的知识共享和持久化存储
 * 
 * 灵感来源：Claude Code Coordinator 的 Scratchpad 系统
 * > "跨 Worker 知识共享、持久化存储、无权限提示"
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

class Scratchpad extends EventEmitter {
  constructor(taskId, options = {}) {
    super();
    this.taskId = taskId;
    this.path = options.path || `temp/scratchpad/${taskId}.md`;
    this.data = {};
    this.verbose = options.verbose || false;
    
    // 确保目录存在
    const dir = path.dirname(this.path);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // 加载现有数据
    this._load();
  }

  /**
   * 写入数据
   */
  async write(key, value) {
    if (this.verbose) {
      console.log(`[Scratchpad] 写入：${this.taskId}.${key}`);
    }
    
    this.data[key] = {
      value: value,
      timestamp: new Date().toISOString(),
      updatedAt: Date.now()
    };
    
    await this._save();
    this.emit('write', { key, value });
    
    return true;
  }

  /**
   * 读取数据
   */
  async read(key) {
    const entry = this.data[key];
    if (!entry) {
      return null;
    }
    
    if (this.verbose) {
      console.log(`[Scratchpad] 读取：${this.taskId}.${key}`);
    }
    
    return entry.value;
  }

  /**
   * 删除数据
   */
  async delete(key) {
    if (this.data[key]) {
      delete this.data[key];
      await this._save();
      this.emit('delete', { key });
      return true;
    }
    return false;
  }

  /**
   * 列出所有键
   */
  keys() {
    return Object.keys(this.data);
  }

  /**
   * 清空数据
   */
  async clear() {
    this.data = {};
    await this._save();
    this.emit('clear');
    return true;
  }

  /**
   * 共享给其他 Worker
   */
  async shareWith(workerId) {
    const targetPath = `temp/scratchpad/${workerId}.md`;
    const targetDir = path.dirname(targetPath);
    
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    // 复制数据
    const sharedData = {
      ...this.data,
      _sharedFrom: this.taskId,
      _sharedAt: new Date().toISOString()
    };
    
    fs.writeFileSync(targetPath, JSON.stringify(sharedData, null, 2), 'utf-8');
    
    if (this.verbose) {
      console.log(`[Scratchpad] 共享给 Worker: ${workerId}`);
    }
    
    this.emit('share', { workerId });
    return true;
  }

  /**
   * 从其他 Worker 导入数据
   */
  async importFrom(workerId) {
    const sourcePath = `temp/scratchpad/${workerId}.md`;
    
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Scratchpad 不存在：${workerId}`);
    }
    
    const sourceData = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'));
    
    // 合并数据
    for (const [key, entry] of Object.entries(sourceData)) {
      if (!key.startsWith('_')) { // 跳过元数据
        this.data[key] = entry;
      }
    }
    
    await this._save();
    
    if (this.verbose) {
      console.log(`[Scratchpad] 从 Worker 导入：${workerId}`);
    }
    
    this.emit('import', { workerId });
    return true;
  }

  /**
   * 保存数据到文件
   */
  async _save() {
    const content = JSON.stringify(this.data, null, 2);
    fs.writeFileSync(this.path, content, 'utf-8');
  }

  /**
   * 从文件加载数据
   */
  _load() {
    if (fs.existsSync(this.path)) {
      try {
        const content = fs.readFileSync(this.path, 'utf-8');
        this.data = JSON.parse(content);
        
        if (this.verbose) {
          console.log(`[Scratchpad] 加载：${this.keys().length} 个键`);
        }
      } catch (err) {
        console.error(`[Scratchpad] 加载失败：`, err.message);
        this.data = {};
      }
    }
  }

  /**
   * 导出为 JSON
   */
  exportJSON() {
    return JSON.stringify(this.data, null, 2);
  }

  /**
   * 导出为 Markdown
   */
  exportMarkdown() {
    let md = `# Scratchpad: ${this.taskId}\n\n`;
    md += `**更新时间**: ${new Date().toISOString()}\n\n`;
    md += `---\n\n`;
    
    for (const [key, entry] of Object.entries(this.data)) {
      if (!key.startsWith('_')) {
        md += `## ${key}\n\n`;
        md += `${JSON.stringify(entry.value, null, 2)}\n\n`;
        md += `*更新时间*: ${entry.timestamp}\n\n`;
        md += `---\n\n`;
      }
    }
    
    return md;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const keys = this.keys();
    const totalSize = JSON.stringify(this.data).length;
    
    return {
      taskId: this.taskId,
      keyCount: keys.length,
      totalSize: totalSize,
      keys: keys,
      path: this.path
    };
  }
}

/**
 * Scratchpad 管理器
 */
class ScratchpadManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.scratchpads = new Map();
    this.verbose = options.verbose || false;
    this.basePath = options.basePath || 'temp/scratchpad';
    
    // 确保基础目录存在
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
    }
  }

  /**
   * 创建或获取 Scratchpad
   */
  get(taskId) {
    if (!this.scratchpads.has(taskId)) {
      const scratchpad = new Scratchpad(taskId, {
        path: `${this.basePath}/${taskId}.md`,
        verbose: this.verbose
      });
      this.scratchpads.set(taskId, scratchpad);
      
      if (this.verbose) {
        console.log(`[ScratchpadManager] 创建：${taskId}`);
      }
    }
    
    return this.scratchpads.get(taskId);
  }

  /**
   * 删除 Scratchpad
   */
  async delete(taskId) {
    const scratchpad = this.scratchpads.get(taskId);
    if (scratchpad) {
      const filePath = scratchpad.path;
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      this.scratchpads.delete(taskId);
      
      if (this.verbose) {
        console.log(`[ScratchpadManager] 删除：${taskId}`);
      }
      
      return true;
    }
    return false;
  }

  /**
   * 列出所有 Scratchpad
   */
  list() {
    return Array.from(this.scratchpads.keys());
  }

  /**
   * 获取所有统计信息
   */
  getAllStats() {
    const stats = [];
    for (const scratchpad of this.scratchpads.values()) {
      stats.push(scratchpad.getStats());
    }
    return stats;
  }

  /**
   * 清理过期 Scratchpad
   */
  async cleanup(maxAge = 86400000) { // 默认 24 小时
    const now = Date.now();
    const cleaned = [];
    
    for (const [taskId, scratchpad] of this.scratchpads.entries()) {
      const stats = scratchpad.getStats();
      const filePath = stats.path;
      
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        const age = now - stats.mtimeMs;
        
        if (age > maxAge) {
          await this.delete(taskId);
          cleaned.push(taskId);
        }
      }
    }
    
    if (this.verbose && cleaned.length > 0) {
      console.log(`[ScratchpadManager] 清理：${cleaned.length} 个过期 Scratchpad`);
    }
    
    return cleaned;
  }
}

// 导出
module.exports = {
  Scratchpad,
  ScratchpadManager
};

// CLI 入口
if (require.main === module) {
  const { Scratchpad, ScratchpadManager } = require('./scratchpad');
  
  console.log('=== Scratchpad 系统测试 ===\n');
  
  // 测试 1: 基本操作
  console.log('1. 基本读写操作');
  const scratchpad = new Scratchpad('task-1', { verbose: true });
  
  scratchpad.write('discovery', '找到 auth.js 和 user.js');
  scratchpad.write('files', ['auth.js', 'user.js', 'session.js']);
  scratchpad.write('summary', '认证模块分析完成');
  
  console.log('读取 discovery:', scratchpad.read('discovery'));
  console.log('读取 files:', scratchpad.read('files'));
  console.log('所有键:', scratchpad.keys());
  
  // 测试 2: 共享
  console.log('\n2. 共享给其他 Worker');
  scratchpad.shareWith('task-2');
  
  // 测试 3: 导入
  console.log('\n3. 从其他 Worker 导入');
  const scratchpad2 = new Scratchpad('task-2', { verbose: true });
  scratchpad2.importFrom('task-1');
  console.log('导入后的键:', scratchpad2.keys());
  
  // 测试 4: 导出
  console.log('\n4. 导出为 Markdown');
  console.log(scratchpad.exportMarkdown().substring(0, 200) + '...');
  
  // 测试 5: 管理器
  console.log('\n5. Scratchpad 管理器');
  const manager = new ScratchpadManager({ verbose: true });
  const sp1 = manager.get('worker-1');
  const sp2 = manager.get('worker-2');
  
  sp1.write('data', 'Worker 1 的数据');
  sp2.write('data', 'Worker 2 的数据');
  
  console.log('所有 Scratchpad:', manager.list());
  console.log('统计信息:', manager.getAllStats());
}
