#!/usr/bin/env node

/**
 * Scratchpad - 跨 Worker 知识共享系统 v2.0
 * 
 * 职责：实现跨 Worker 的知识共享、持久化存储和并发安全
 * 
 * 核心功能：
 * - 键值对存储（支持任意 JSON 数据）
 * - 文件系统持久化
 * - 跨 Worker 共享与同步
 * - 并发安全（文件锁机制）
 * - 版本控制与历史追踪
 * - 事件驱动架构
 * 
 * 灵感来源：Claude Code Coordinator 的 Scratchpad 系统
 */

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

/**
 * 数据结构定义
 * 
 * Scratchpad 数据模型：
 * {
 *   version: string,          // 数据格式版本
 *   taskId: string,           // 任务 ID
 *   createdAt: number,        // 创建时间戳
 *   updatedAt: number,        // 最后更新时间戳
 *   entries: {                // 数据条目
 *     [key: string]: {
 *       value: any,           // 实际数据
 *       version: number,      // 字段版本号（用于冲突检测）
 *       timestamp: string,    // ISO 时间戳
 *       updatedAt: number,    // 更新时间戳
 *       workerId?: string,    // 创建/修改的 Worker ID
 *       metadata?: object     // 元数据
 *     }
 *   },
 *   history: {                // 历史记录（可选，用于审计）
 *     [key: string]: Array<{
 *       action: 'create' | 'update' | 'delete',
 *       timestamp: string,
 *       workerId?: string,
 *       oldValue?: any,
 *       newValue?: any
 *     }>
 *   },
 *   locks: {                  // 锁信息（用于并发控制）
 *     [key: string]: {
 *       workerId: string,
 *       acquiredAt: number,
 *       expiresAt: number
 *     }
 *   }
 * }
 */

class ScratchpadError extends Error {
  constructor(message, code = 'SCRATCHPAD_ERROR') {
    super(message);
    this.name = 'ScratchpadError';
    this.code = code;
  }
}

class Scratchpad extends EventEmitter {
  /**
   * 创建 Scratchpad 实例
   * 
   * @param {string} taskId - 任务/Worker ID
   * @param {Object} options - 配置选项
   * @param {string} options.basePath - 基础路径（默认：'temp/scratchpad'）
   * @param {boolean} options.verbose - 详细日志（默认：false）
   * @param {boolean} options.enableHistory - 启用历史记录（默认：true）
   * @param {number} options.lockTimeout - 锁超时时间（毫秒，默认：30000）
   * @param {boolean} options.autoSave - 自动保存（默认：true）
   */
  constructor(taskId, options = {}) {
    super();
    
    if (!taskId) {
      throw new ScratchpadError('taskId 是必填参数', 'MISSING_TASK_ID');
    }
    
    this.taskId = taskId;
    this.basePath = options.basePath || 'temp/scratchpad';
    this.verbose = options.verbose || false;
    this.enableHistory = options.enableHistory !== false;
    this.lockTimeout = options.lockTimeout || 30000; // 30 秒默认超时
    this.autoSave = options.autoSave !== false;
    
    // 文件路径
    this.filePath = path.join(this.basePath, `${taskId}.json`);
    this.lockFilePath = path.join(this.basePath, `${taskId}.lock`);
    
    // 内存中的数据
    this.data = {
      version: '2.0.0',
      taskId: taskId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      entries: {},
      history: {},
      locks: {}
    };
    
    // 初始化
    this._initialize();
  }

  /**
   * 初始化 Scratchpad
   */
  _initialize() {
    // 确保目录存在
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      if (this.verbose) {
        console.log(`[Scratchpad] 创建目录：${dir}`);
      }
    }
    
    // 加载现有数据
    this._load();
  }

  /**
   * 获取文件锁
   * 
   * @param {string} key - 要锁定的键（可选，不传则锁定整个文件）
   * @returns {Promise<boolean>} - 是否成功获取锁
   */
  async acquireLock(key = null) {
    const lockKey = key || '__global__';
    const now = Date.now();
    
    // 检查锁是否存在且未过期
    if (this.data.locks[lockKey]) {
      const lock = this.data.locks[lockKey];
      if (lock.expiresAt > now && lock.workerId !== this.taskId) {
        // 锁被其他 Worker 持有且未过期
        if (this.verbose) {
          console.log(`[Scratchpad] 锁被占用：${lockKey} by ${lock.workerId}`);
        }
        return false;
      }
    }
    
    // 获取锁
    this.data.locks[lockKey] = {
      workerId: this.taskId,
      acquiredAt: now,
      expiresAt: now + this.lockTimeout
    };
    
    if (this.autoSave) {
      await this._save();
    }
    
    if (this.verbose) {
      console.log(`[Scratchpad] 获取锁：${lockKey}`);
    }
    
    this.emit('lock', { key: lockKey });
    return true;
  }

  /**
   * 释放文件锁
   * 
   * @param {string} key - 要释放的键（可选，不传则释放全局锁）
   * @returns {Promise<boolean>}
   */
  async releaseLock(key = null) {
    const lockKey = key || '__global__';
    
    if (this.data.locks[lockKey] && this.data.locks[lockKey].workerId === this.taskId) {
      delete this.data.locks[lockKey];
      
      if (this.autoSave) {
        await this._save();
      }
      
      if (this.verbose) {
        console.log(`[Scratchpad] 释放锁：${lockKey}`);
      }
      
      this.emit('unlock', { key: lockKey });
      return true;
    }
    
    return false;
  }

  /**
   * 写入数据
   * 
   * @param {string} key - 键名
   * @param {any} value - 值（任意 JSON 可序列化数据）
   * @param {Object} options - 选项
   * @param {boolean} options.skipLock - 跳过锁检查（默认：false）
   * @param {Object} options.metadata - 元数据
   * @returns {Promise<boolean>}
   */
  async write(key, value, options = {}) {
    if (!key || typeof key !== 'string') {
      throw new ScratchpadError('key 必须是字符串', 'INVALID_KEY');
    }
    
    const { skipLock = false, metadata = {} } = options;
    
    // 获取锁（除非跳过）
    if (!skipLock && !await this.acquireLock(key)) {
      throw new ScratchpadError(`无法获取锁：${key}`, 'LOCK_CONFLICT');
    }
    
    try {
      const now = Date.now();
      const timestamp = new Date().toISOString();
      const oldEntry = this.data.entries[key];
      const oldVersion = oldEntry ? oldEntry.version : 0;
      const oldValue = oldEntry ? oldEntry.value : undefined;
      
      // 更新数据
      this.data.entries[key] = {
        value: value,
        version: oldVersion + 1,
        timestamp: timestamp,
        updatedAt: now,
        workerId: this.taskId,
        metadata: metadata
      };
      
      this.data.updatedAt = now;
      
      // 记录历史
      if (this.enableHistory) {
        if (!this.data.history[key]) {
          this.data.history[key] = [];
        }
        
        this.data.history[key].push({
          action: oldValue === undefined ? 'create' : 'update',
          timestamp: timestamp,
          workerId: this.taskId,
          oldValue: oldValue,
          newValue: value
        });
        
        // 限制历史记录数量（最多 100 条）
        if (this.data.history[key].length > 100) {
          this.data.history[key] = this.data.history[key].slice(-100);
        }
      }
      
      if (this.autoSave) {
        await this._save();
      }
      
      if (this.verbose) {
        console.log(`[Scratchpad] 写入：${this.taskId}.${key} (version: ${this.data.entries[key].version})`);
      }
      
      this.emit('write', { key, value, version: this.data.entries[key].version });
      return true;
      
    } finally {
      // 释放锁（除非跳过）
      if (!skipLock) {
        await this.releaseLock(key);
      }
    }
  }

  /**
   * 读取数据
   * 
   * @param {string} key - 键名
   * @param {Object} options - 选项
   * @param {boolean} options.includeMetadata - 包含元数据（默认：false）
   * @returns {Promise<any|null>} - 返回 null 如果键不存在
   */
  async read(key, options = {}) {
    const { includeMetadata = false } = options;
    
    const entry = this.data.entries[key];
    if (!entry) {
      if (this.verbose) {
        console.log(`[Scratchpad] 读取失败：${this.taskId}.${key} (不存在)`);
      }
      return null;
    }
    
    if (this.verbose) {
      console.log(`[Scratchpad] 读取：${this.taskId}.${key} (version: ${entry.version})`);
    }
    
    this.emit('read', { key, value: entry.value });
    
    if (includeMetadata) {
      return {
        value: entry.value,
        version: entry.version,
        timestamp: entry.timestamp,
        updatedAt: entry.updatedAt,
        workerId: entry.workerId,
        metadata: entry.metadata
      };
    }
    
    return entry.value;
  }

  /**
   * 批量读取数据
   * 
   * @param {string[]} keys - 键名数组
   * @returns {Promise<Object>} - 返回 { [key]: value } 对象
   */
  async readBatch(keys) {
    const result = {};
    for (const key of keys) {
      result[key] = await this.read(key);
    }
    return result;
  }

  /**
   * 删除数据
   * 
   * @param {string} key - 键名
   * @returns {Promise<boolean>}
   */
  async delete(key) {
    if (this.data.entries[key]) {
      const oldEntry = this.data.entries[key];
      const now = Date.now();
      const timestamp = new Date().toISOString();
      
      // 删除数据
      delete this.data.entries[key];
      this.data.updatedAt = now;
      
      // 记录历史
      if (this.enableHistory) {
        if (!this.data.history[key]) {
          this.data.history[key] = [];
        }
        
        this.data.history[key].push({
          action: 'delete',
          timestamp: timestamp,
          workerId: this.taskId,
          oldValue: oldEntry.value
        });
      }
      
      if (this.autoSave) {
        await this._save();
      }
      
      if (this.verbose) {
        console.log(`[Scratchpad] 删除：${this.taskId}.${key}`);
      }
      
      this.emit('delete', { key, oldValue: oldEntry.value });
      return true;
    }
    
    return false;
  }

  /**
   * 列出所有键
   * 
   * @param {Object} options - 选项
   * @param {string} options.prefix - 键名前缀过滤
   * @returns {string[]}
   */
  keys(options = {}) {
    const { prefix = '' } = options;
    
    let keys = Object.keys(this.data.entries);
    if (prefix) {
      keys = keys.filter(k => k.startsWith(prefix));
    }
    
    return keys;
  }

  /**
   * 检查键是否存在
   * 
   * @param {string} key - 键名
   * @returns {boolean}
   */
  has(key) {
    return key in this.data.entries;
  }

  /**
   * 清空数据
   * 
   * @param {Object} options - 选项
   * @param {boolean} options.preserveHistory - 保留历史记录（默认：false）
   * @returns {Promise<boolean>}
   */
  async clear(options = {}) {
    const { preserveHistory = false } = options;
    
    const oldData = { ...this.data.entries };
    
    this.data.entries = {};
    this.data.updatedAt = Date.now();
    
    if (!preserveHistory && this.enableHistory) {
      this.data.history = {};
    }
    
    if (this.autoSave) {
      await this._save();
    }
    
    if (this.verbose) {
      console.log(`[Scratchpad] 清空：${this.taskId}`);
    }
    
    this.emit('clear', { oldData, preservedHistory: preserveHistory });
    return true;
  }

  /**
   * 共享给其他 Worker
   * 
   * @param {string} targetWorkerId - 目标 Worker ID
   * @param {Object} options - 选项
   * @param {string[]} options.keys - 要共享的键（不传则共享全部）
   * @param {boolean} options.merge - 合并模式（默认：true，false 则覆盖）
   * @returns {Promise<boolean>}
   */
  async shareWith(targetWorkerId, options = {}) {
    if (!targetWorkerId) {
      throw new ScratchpadError('targetWorkerId 是必填参数', 'MISSING_TARGET_WORKER_ID');
    }
    
    const { keys = null, merge = true } = options;
    
    const targetPath = path.join(this.basePath, `${targetWorkerId}.json`);
    const targetDir = path.dirname(targetPath);
    
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    // 准备共享数据
    const keysToShare = keys || this.keys();
    const sharedEntries = {};
    
    for (const key of keysToShare) {
      if (this.data.entries[key]) {
        sharedEntries[key] = this.data.entries[key];
      }
    }
    
    // 如果目标文件存在且是合并模式，读取现有数据
    let targetData = {
      version: '2.0.0',
      taskId: targetWorkerId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      entries: {},
      history: {},
      locks: {}
    };
    
    if (merge && fs.existsSync(targetPath)) {
      try {
        const content = fs.readFileSync(targetPath, 'utf-8');
        targetData = JSON.parse(content);
      } catch (err) {
        if (this.verbose) {
          console.log(`[Scratchpad] 读取目标文件失败，使用空数据：${err.message}`);
        }
      }
    }
    
    // 合并数据
    targetData.entries = {
      ...targetData.entries,
      ...sharedEntries
    };
    targetData.updatedAt = Date.now();
    targetData._sharedFrom = this.taskId;
    targetData._sharedAt = new Date().toISOString();
    
    // 写入目标文件
    fs.writeFileSync(targetPath, JSON.stringify(targetData, null, 2), 'utf-8');
    
    if (this.verbose) {
      console.log(`[Scratchpad] 共享给 Worker: ${targetWorkerId} (${keysToShare.length} 个键)`);
    }
    
    this.emit('share', { targetWorkerId, keys: keysToShare });
    return true;
  }

  /**
   * 从其他 Worker 导入数据
   * 
   * @param {string} sourceWorkerId - 源 Worker ID
   * @param {Object} options - 选项
   * @param {string[]} options.keys - 要导入的键（不传则导入全部）
   * @param {boolean} options.overwrite - 覆盖本地数据（默认：false，false 则跳过已存在的键）
   * @returns {Promise<number>} - 返回导入的键数量
   */
  async importFrom(sourceWorkerId, options = {}) {
    const { keys = null, overwrite = false } = options;
    
    const sourcePath = path.join(this.basePath, `${sourceWorkerId}.json`);
    
    if (!fs.existsSync(sourcePath)) {
      throw new ScratchpadError(`Scratchpad 不存在：${sourceWorkerId}`, 'SOURCE_NOT_FOUND');
    }
    
    const sourceData = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'));
    const sourceEntries = sourceData.entries || {};
    
    const keysToImport = keys || Object.keys(sourceEntries);
    let importedCount = 0;
    
    for (const key of keysToImport) {
      if (sourceEntries[key]) {
        // 如果键已存在且不覆盖，跳过
        if (!overwrite && this.data.entries[key]) {
          continue;
        }
        
        this.data.entries[key] = sourceEntries[key];
        importedCount++;
      }
    }
    
    this.data.updatedAt = Date.now();
    
    if (this.autoSave) {
      await this._save();
    }
    
    if (this.verbose) {
      console.log(`[Scratchpad] 从 Worker 导入：${sourceWorkerId} (${importedCount}/${keysToImport.length} 个键)`);
    }
    
    this.emit('import', { sourceWorkerId, importedCount });
    return importedCount;
  }

  /**
   * 同步多个 Worker 的数据
   * 
   * @param {string[]} workerIds - Worker ID 列表
   * @param {Object} options - 选项
   * @param {string} options.strategy - 同步策略：'latest' | 'merge' | 'master'（默认：'latest'）
   * @param {string} options.masterWorkerId - 主 Worker ID（strategy='master' 时使用）
   * @returns {Promise<Object>} - 同步统计信息
   */
  async syncWith(workerIds, options = {}) {
    const { strategy = 'latest', masterWorkerId = null } = options;
    
    const stats = {
      synced: 0,
      conflicts: 0,
      errors: []
    };
    
    if (strategy === 'master') {
      // 主从同步：以指定 Worker 为准
      if (!masterWorkerId) {
        throw new ScratchpadError('masterWorkerId 是必填参数（strategy=master）', 'MISSING_MASTER_ID');
      }
      
      await this.importFrom(masterWorkerId, { overwrite: true });
      stats.synced = 1;
      
    } else if (strategy === 'latest') {
      // 最新优先：每个键取最新版本
      const allEntries = new Map();
      
      // 收集所有 Worker 的数据
      for (const workerId of [this.taskId, ...workerIds]) {
        const workerPath = path.join(this.basePath, `${workerId}.json`);
        if (fs.existsSync(workerPath)) {
          const workerData = JSON.parse(fs.readFileSync(workerPath, 'utf-8'));
          for (const [key, entry] of Object.entries(workerData.entries || {})) {
            if (!allEntries.has(key) || entry.updatedAt > allEntries.get(key).updatedAt) {
              allEntries.set(key, entry);
            }
          }
        }
      }
      
      // 更新本地数据
      let changed = false;
      for (const [key, entry] of allEntries.entries()) {
        if (!this.data.entries[key] || this.data.entries[key].updatedAt < entry.updatedAt) {
          this.data.entries[key] = entry;
          changed = true;
          stats.synced++;
        }
      }
      
      if (changed) {
        this.data.updatedAt = Date.now();
        if (this.autoSave) {
          await this._save();
        }
      }
      
    } else if (strategy === 'merge') {
      // 合并模式：合并所有数据，冲突时保留多个版本
      for (const workerId of workerIds) {
        try {
          const count = await this.importFrom(workerId, { overwrite: false });
          stats.synced += count;
        } catch (err) {
          stats.errors.push({ workerId, error: err.message });
        }
      }
    }
    
    if (this.verbose) {
      console.log(`[Scratchpad] 同步完成：${stats.synced} 个键，${stats.conflicts} 个冲突`);
    }
    
    return stats;
  }

  /**
   * 获取历史记录
   * 
   * @param {string} key - 键名（可选，不传则返回所有历史）
   * @param {Object} options - 选项
   * @param {number} options.limit - 限制返回数量（默认：50）
   * @returns {Object|Array}
   */
  getHistory(key = null, options = {}) {
    const { limit = 50 } = options;
    
    if (key) {
      const history = this.data.history[key] || [];
      return history.slice(-limit);
    }
    
    // 返回所有历史
    const allHistory = {};
    for (const [k, h] of Object.entries(this.data.history)) {
      allHistory[k] = h.slice(-limit);
    }
    return allHistory;
  }

  /**
   * 回滚到指定版本
   * 
   * @param {string} key - 键名
   * @param {number} version - 版本号
   * @returns {Promise<boolean>}
   */
  async rollback(key, version) {
    const history = this.data.history[key];
    if (!history || history.length === 0) {
      throw new ScratchpadError(`没有历史记录：${key}`, 'NO_HISTORY');
    }
    
    // 查找指定版本
    const targetEntry = history.find(h => {
      if (h.newValue === undefined) return false; // 删除操作
      const entryVersion = this._getVersionFromHistory(h);
      return entryVersion === version;
    });
    
    if (!targetEntry) {
      throw new ScratchpadError(`版本不存在：${key} v${version}`, 'VERSION_NOT_FOUND');
    }
    
    // 回滚
    await this.write(key, targetEntry.newValue, {
      metadata: { rolledBackFrom: version, rolledBackAt: new Date().toISOString() }
    });
    
    if (this.verbose) {
      console.log(`[Scratchpad] 回滚：${this.taskId}.${key} -> v${version}`);
    }
    
    return true;
  }

  /**
   * 从历史记录中提取版本号（辅助方法）
   */
  _getVersionFromHistory(historyEntry) {
    // 简化实现：根据在历史中的位置推断版本
    const key = historyEntry.action === 'delete' ? null : Object.keys(this.data.history).find(
      k => this.data.history[k].includes(historyEntry)
    );
    
    if (!key) return 1;
    
    const index = this.data.history[key].indexOf(historyEntry);
    return index + 1;
  }

  /**
   * 保存数据到文件
   */
  async _save() {
    const content = JSON.stringify(this.data, null, 2);
    
    // 原子写入：先写临时文件，再重命名
    const tempPath = this.filePath + '.tmp';
    fs.writeFileSync(tempPath, content, 'utf-8');
    fs.renameSync(tempPath, this.filePath);
    
    if (this.verbose) {
      console.log(`[Scratchpad] 保存：${this.filePath} (${content.length} bytes)`);
    }
  }

  /**
   * 从文件加载数据
   */
  _load() {
    if (fs.existsSync(this.filePath)) {
      try {
        const content = fs.readFileSync(this.filePath, 'utf-8');
        const loadedData = JSON.parse(content);
        
        // 合并数据（保留内存中的锁信息）
        this.data = {
          ...loadedData,
          locks: this.data.locks // 保留当前锁
        };
        
        if (this.verbose) {
          console.log(`[Scratchpad] 加载：${this.keys().length} 个键`);
        }
      } catch (err) {
        console.error(`[Scratchpad] 加载失败：`, err.message);
        this.data = {
          version: '2.0.0',
          taskId: this.taskId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          entries: {},
          history: {},
          locks: {}
        };
      }
    }
  }

  /**
   * 导出为 JSON 字符串
   * 
   * @param {Object} options - 选项
   * @param {boolean} options.includeHistory - 包含历史记录（默认：false）
   * @param {boolean} options.includeLocks - 包含锁信息（默认：false）
   * @returns {string}
   */
  exportJSON(options = {}) {
    const { includeHistory = false, includeLocks = false } = options;
    
    const exportData = {
      version: this.data.version,
      taskId: this.data.taskId,
      createdAt: this.data.createdAt,
      updatedAt: this.data.updatedAt,
      entries: this.data.entries
    };
    
    if (includeHistory) {
      exportData.history = this.data.history;
    }
    
    if (includeLocks) {
      exportData.locks = this.data.locks;
    }
    
    return JSON.stringify(exportData, null, 2);
  }

  /**
   * 导出为 Markdown
   * 
   * @returns {string}
   */
  exportMarkdown() {
    let md = `# Scratchpad: ${this.taskId}\n\n`;
    md += `**版本**: ${this.data.version}\n`;
    md += `**创建时间**: ${new Date(this.data.createdAt).toISOString()}\n`;
    md += `**最后更新**: ${new Date(this.data.updatedAt).toISOString()}\n`;
    md += `**键数量**: ${this.keys().length}\n`;
    md += `\n---\n\n`;
    
    for (const [key, entry] of Object.entries(this.data.entries)) {
      md += `## ${key}\n\n`;
      md += '```json\n' + JSON.stringify(entry.value, null, 2) + '\n```\n\n';
      md += `*版本*: ${entry.version} | *更新时间*: ${entry.timestamp} | *Worker*: ${entry.workerId || 'N/A'}\n\n`;
      md += `---\n\n`;
    }
    
    return md;
  }

  /**
   * 获取统计信息
   * 
   * @returns {Object}
   */
  getStats() {
    const keys = this.keys();
    const totalSize = JSON.stringify(this.data).length;
    const totalHistoryEntries = Object.values(this.data.history).reduce(
      (sum, h) => sum + h.length, 0
    );
    
    return {
      taskId: this.taskId,
      version: this.data.version,
      keyCount: keys.length,
      totalSize: totalSize,
      totalHistoryEntries: totalHistoryEntries,
      keys: keys,
      filePath: this.filePath,
      createdAt: new Date(this.data.createdAt).toISOString(),
      updatedAt: new Date(this.data.updatedAt).toISOString()
    };
  }

  /**
   * 获取锁状态
   * 
   * @returns {Object}
   */
  getLockStatus() {
    const now = Date.now();
    const activeLocks = {};
    
    for (const [key, lock] of Object.entries(this.data.locks)) {
      if (lock.expiresAt > now) {
        activeLocks[key] = {
          workerId: lock.workerId,
          acquiredAt: new Date(lock.acquiredAt).toISOString(),
          expiresAt: new Date(lock.expiresAt).toISOString(),
          remainingMs: lock.expiresAt - now
        };
      }
    }
    
    return activeLocks;
  }

  /**
   * 清理过期的锁
   * 
   * @returns {number} - 清理的锁数量
   */
  cleanupExpiredLocks() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, lock] of Object.entries(this.data.locks)) {
      if (lock.expiresAt <= now) {
        delete this.data.locks[key];
        cleaned++;
      }
    }
    
    if (cleaned > 0 && this.autoSave) {
      this._save();
    }
    
    return cleaned;
  }
}

/**
 * Scratchpad 管理器
 * 用于管理多个 Scratchpad 实例
 */
class ScratchpadManager extends EventEmitter {
  /**
   * 创建管理器
   * 
   * @param {Object} options - 配置选项
   * @param {string} options.basePath - 基础路径（默认：'temp/scratchpad'）
   * @param {boolean} options.verbose - 详细日志（默认：false）
   * @param {boolean} options.autoCleanup - 自动清理（默认：true）
   * @param {number} options.cleanupIntervalMinutes - 清理间隔（分钟，默认：30）
   */
  constructor(options = {}) {
    super();
    
    this.scratchpads = new Map();
    this.verbose = options.verbose || false;
    this.basePath = options.basePath || 'temp/scratchpad';
    this.autoCleanup = options.autoCleanup !== false;
    this.cleanupIntervalMinutes = options.cleanupIntervalMinutes || 30;
    
    // 确保基础目录存在
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
    }
    
    // 启动自动清理
    if (this.autoCleanup) {
      this._startAutoCleanup();
    }
  }

  /**
   * 创建或获取 Scratchpad 实例
   * 
   * @param {string} taskId - 任务/Worker ID
   * @param {Object} options - Scratchpad 配置选项
   * @returns {Scratchpad}
   */
  get(taskId, options = {}) {
    if (!this.scratchpads.has(taskId)) {
      const scratchpad = new Scratchpad(taskId, {
        basePath: this.basePath,
        verbose: this.verbose,
        ...options
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
   * 
   * @param {string} taskId - 任务/Worker ID
   * @returns {Promise<boolean>}
   */
  async delete(taskId) {
    const scratchpad = this.scratchpads.get(taskId);
    if (scratchpad) {
      const filePath = scratchpad.filePath;
      const lockFilePath = scratchpad.lockFilePath;
      
      // 删除文件
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      if (fs.existsSync(lockFilePath)) {
        fs.unlinkSync(lockFilePath);
      }
      
      this.scratchpads.delete(taskId);
      
      if (this.verbose) {
        console.log(`[ScratchpadManager] 删除：${taskId}`);
      }
      
      this.emit('delete', { taskId });
      return true;
    }
    return false;
  }

  /**
   * 列出所有 Scratchpad
   * 
   * @returns {string[]}
   */
  list() {
    return Array.from(this.scratchpads.keys());
  }

  /**
   * 获取所有统计信息
   * 
   * @returns {Object[]}
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
   * 
   * @param {number} maxAge - 最大年龄（毫秒，默认：24 小时）
   * @returns {Promise<string[]>} - 返回被清理的 taskId 列表
   */
  async cleanup(maxAge = 86400000) {
    const now = Date.now();
    const cleaned = [];
    
    // 从文件系统扫描
    const files = fs.readdirSync(this.basePath);
    
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      
      const filePath = path.join(this.basePath, file);
      const stats = fs.statSync(filePath);
      const age = now - stats.mtimeMs;
      
      if (age > maxAge) {
        const taskId = file.replace('.json', '');
        
        // 从内存中移除
        if (this.scratchpads.has(taskId)) {
          this.scratchpads.delete(taskId);
        }
        
        // 删除文件
        fs.unlinkSync(filePath);
        cleaned.push(taskId);
        
        if (this.verbose) {
          console.log(`[ScratchpadManager] 清理过期：${taskId} (${Math.round(age / 60000)} 分钟)`);
        }
      }
    }
    
    this.emit('cleanup', { cleaned, count: cleaned.length });
    return cleaned;
  }

  /**
   * 启动自动清理
   */
  _startAutoCleanup() {
    const intervalMs = this.cleanupIntervalMinutes * 60 * 1000;
    
    this.cleanupTimer = setInterval(() => {
      this.cleanup().catch(err => {
        console.error('[ScratchpadManager] 自动清理失败:', err);
      });
    }, intervalMs);
    
    // 允许进程退出
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
    
    if (this.verbose) {
      console.log(`[ScratchpadManager] 自动清理已启动（间隔：${this.cleanupIntervalMinutes} 分钟）`);
    }
  }

  /**
   * 停止管理器
   */
  stop() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    if (this.verbose) {
      console.log('[ScratchpadManager] 已停止');
    }
  }
}

// 导出
module.exports = {
  Scratchpad,
  ScratchpadManager,
  ScratchpadError
};

// CLI 入口（测试用）
if (require.main === module) {
  (async () => {
    const { Scratchpad, ScratchpadManager } = require('./scratchpad');
    
    console.log('=== Scratchpad 系统 v2.0 测试 ===\n');
    
    // 测试 1: 基本操作
    console.log('1. 基本读写操作');
    const scratchpad = new Scratchpad('task-1', { verbose: true });
    
    await scratchpad.write('discovery', '找到 auth.js 和 user.js');
  await scratchpad.write('files', ['auth.js', 'user.js', 'session.js']);
  await scratchpad.write('summary', '认证模块分析完成');
  
  console.log('读取 discovery:', await scratchpad.read('discovery'));
  console.log('读取 files:', await scratchpad.read('files'));
  console.log('所有键:', scratchpad.keys());
  
  // 测试 2: 带元数据的写入
  console.log('\n2. 带元数据的写入');
  await scratchpad.write('config', { timeout: 5000, retries: 3 }, {
    metadata: { priority: 'high', category: 'settings' }
  });
  
  const configWithMetadata = await scratchpad.read('config', { includeMetadata: true });
  console.log('配置（含元数据）:', JSON.stringify(configWithMetadata, null, 2));
  
  // 测试 3: 历史记录
  console.log('\n3. 历史记录');
  await scratchpad.write('counter', 1);
  await scratchpad.write('counter', 2);
  await scratchpad.write('counter', 3);
  
  const history = scratchpad.getHistory('counter');
  console.log('counter 的历史:', JSON.stringify(history, null, 2));
  
  // 测试 4: 共享与导入
  console.log('\n4. 共享给其他 Worker');
  await scratchpad.shareWith('task-2');
  
  console.log('\n5. 从其他 Worker 导入');
  const scratchpad2 = new Scratchpad('task-2', { verbose: true });
  await scratchpad2.importFrom('task-1');
  console.log('导入后的键:', scratchpad2.keys());
  
  // 测试 6: 同步
  console.log('\n6. 多 Worker 同步');
  await scratchpad2.write('new-key', 'Task 2 的数据');
  await scratchpad.syncWith(['task-2'], { strategy: 'merge' });
  console.log('同步后的键:', scratchpad.keys());
  
  // 测试 7: 锁机制
  console.log('\n7. 锁机制测试');
  const locked = await scratchpad.acquireLock('test-lock');
  console.log('获取锁:', locked);
  const lockStatus = scratchpad.getLockStatus();
  console.log('锁状态:', JSON.stringify(lockStatus, null, 2));
  await scratchpad.releaseLock('test-lock');
  
  // 测试 8: 导出
  console.log('\n8. 导出为 Markdown');
  console.log(scratchpad.exportMarkdown().substring(0, 300) + '...');
  
  // 测试 9: 管理器
  console.log('\n9. Scratchpad 管理器');
  const manager = new ScratchpadManager({ verbose: true });
  const sp1 = manager.get('worker-1');
  const sp2 = manager.get('worker-2');
  
  await sp1.write('data', 'Worker 1 的数据');
  await sp2.write('data', 'Worker 2 的数据');
  
  console.log('所有 Scratchpad:', manager.list());
  console.log('统计信息:', JSON.stringify(manager.getAllStats(), null, 2));
  
  // 测试 10: 统计信息
  console.log('\n10. 统计信息');
  console.log('Scratchpad 统计:', JSON.stringify(scratchpad.getStats(), null, 2));
  
  console.log('\n=== 测试完成 ===');
  })();
}
