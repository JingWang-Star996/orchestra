#!/usr/bin/env node

/**
 * SharedContext — 跨系统共享上下文
 *
 * 职责：基于文件的共享状态管理，供 Orchestra 与外部 Agent（如 Hermes）之间
 *       跨任务、跨系统共享数据。
 *
 * 特点：
 * - 命名空间隔离（不同任务/团队有独立 context）
 * - 版本控制（乐观锁，避免并发写冲突）
 * - 与现有 Scratchpad 的集成（Scratchpad 是任务内共享，SharedContext 是跨系统共享）
 * - Watch 回调（数据变更通知）
 */

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

const BASE_DIR = path.join(__dirname, 'temp', 'shared-context');

// ─── 工具函数 ─────────────────────────────────────────────

function _ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function _contextFilePath(namespace, key) {
  // namespace 支持层级：a/b/c → temp/shared-context/a/b/c.json
  const parts = namespace.split('/').filter(Boolean);
  const fileName = `${key || '_meta'}.json`;
  return path.join(BASE_DIR, ...parts, fileName);
}

function _readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function _writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  _ensureDir(dir);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// ─── SharedContext 类 ─────────────────────────────────────

class SharedContext extends EventEmitter {
  constructor(options = {}) {
    super();
    this.verbose = options.verbose || false;
    this.baseDir = options.baseDir || BASE_DIR;
    _ensureDir(this.baseDir);
    this._watchers = new Map(); // namespace → Set of callbacks
  }

  /**
   * 获取值
   * @param {string} namespace - 命名空间，如 'task-123' 或 'team/editorial'
   * @param {string} key - 数据键
   * @returns {*} 存储的值，不存在则返回 null
   */
  get(namespace, key) {
    const filePath = _contextFilePath(namespace, key);
    const data = _readJson(filePath);
    if (!data) return null;
    if (this.verbose) console.log(`[SharedContext] GET ${namespace}/${key} → ${JSON.stringify(data.value).slice(0, 100)}`);
    return data.value;
  }

  /**
   * 设置值
   * @param {string} namespace
   * @param {string} key
   * @param {*} value
   * @param {Object} options - { version } 乐观锁版本号
   * @returns {Object} { success, version }
   */
  set(namespace, key, value, options = {}) {
    const filePath = _contextFilePath(namespace, key);
    const existing = _readJson(filePath);

    // 乐观锁检查
    if (options.version !== undefined && existing) {
      if (existing.version !== options.version) {
        return {
          success: false,
          error: `版本冲突：期望 ${options.version}，当前 ${existing.version}`,
          currentVersion: existing.version
        };
      }
    }

    const newVersion = existing ? existing.version + 1 : 1;
    const data = {
      key,
      namespace,
      value,
      version: newVersion,
      updatedAt: new Date().toISOString(),
      updatedBy: options.updatedBy || 'orchestra'
    };

    _writeJson(filePath, data);

    if (this.verbose) {
      console.log(`[SharedContext] SET ${namespace}/${key} v${newVersion}`);
    }

    // 通知 watcher
    this._notifyWatchers(namespace, key, value);
    this.emit('set', { namespace, key, version: newVersion });

    return { success: true, version: newVersion };
  }

  /**
   * 更新值（基于现有值修改）
   * @param {string} namespace
   * @param {string} key
   * @param {Function} updater - (currentValue) => newValue
   * @returns {Object} { success, version }
   */
  update(namespace, key, updater) {
    const filePath = _contextFilePath(namespace, key);
    const existing = _readJson(filePath);
    const currentValue = existing ? existing.value : null;
    const newValue = updater(currentValue);

    return this.set(namespace, key, newValue, {
      version: existing ? existing.version : undefined
    });
  }

  /**
   * 删除值
   * @param {string} namespace
   * @param {string} key
   * @returns {boolean} 是否删除成功
   */
  delete(namespace, key) {
    const filePath = _contextFilePath(namespace, key);
    if (!fs.existsSync(filePath)) return false;

    try {
      fs.unlinkSync(filePath);
      if (this.verbose) console.log(`[SharedContext] DELETE ${namespace}/${key}`);
      this.emit('delete', { namespace, key });
      return true;
    } catch (err) {
      this.emit('error', { namespace, key, error: err.message });
      return false;
    }
  }

  /**
   * 列出命名空间下的所有 key
   * @param {string} namespace
   * @returns {Array<string>}
   */
  listKeys(namespace) {
    const nsDir = path.join(this.baseDir, ...namespace.split('/').filter(Boolean));
    if (!fs.existsSync(nsDir)) return [];

    const keys = [];
    try {
      const files = fs.readdirSync(nsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          keys.push(file.replace(/\.json$/, ''));
        }
      }
    } catch {
      // ignore
    }
    return keys;
  }

  /**
   * 列出所有命名空间
   * @returns {Array<string>}
   */
  listNamespaces() {
    return this._scanDirs(this.baseDir, []);
  }

  _scanDirs(dir, prefix) {
    const namespaces = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const ns = [...prefix, entry.name].join('/');
          namespaces.push(ns);
          namespaces.push(...this._scanDirs(fullPath, [...prefix, entry.name]));
        }
      }
    } catch {
      // ignore
    }
    return namespaces;
  }

  /**
   * 获取命名空间的完整数据快照
   * @param {string} namespace
   * @returns {Object} { key: value, ... }
   */
  getSnapshot(namespace) {
    const keys = this.listKeys(namespace);
    const snapshot = {};
    for (const key of keys) {
      snapshot[key] = this.get(namespace, key);
    }
    return snapshot;
  }

  /**
   * 清除整个命名空间
   * @param {string} namespace
   */
  clearNamespace(namespace) {
    const nsDir = path.join(this.baseDir, ...namespace.split('/').filter(Boolean));
    if (!fs.existsSync(nsDir)) return;

    try {
      fs.rmSync(nsDir, { recursive: true, force: true });
      if (this.verbose) console.log(`[SharedContext] CLEAR ${namespace}`);
      this.emit('clear', { namespace });
    } catch (err) {
      this.emit('error', { namespace, error: err.message });
    }
  }

  /**
   * 监听命名空间 + key 的变更
   * @param {string} namespace
   * @param {string} key
   * @param {Function} callback - (namespace, key, value) => void
   * @returns {Function} 取消监听的函数
   */
  watch(namespace, key, callback) {
    const watcherKey = `${namespace}/${key}`;
    if (!this._watchers.has(watcherKey)) {
      this._watchers.set(watcherKey, new Set());
    }
    this._watchers.get(watcherKey).add(callback);

    // 返回取消监听的函数
    return () => {
      const set = this._watchers.get(watcherKey);
      if (set) {
        set.delete(callback);
        if (set.size === 0) this._watchers.delete(watcherKey);
      }
    };
  }

  _notifyWatchers(namespace, key, value) {
    const watcherKey = `${namespace}/${key}`;
    const watchers = this._watchers.get(watcherKey);
    if (watchers) {
      for (const cb of watchers) {
        try {
          cb(namespace, key, value);
        } catch (err) {
          this.emit('error', { namespace, key, error: err.message });
        }
      }
    }
    // 同时通知命名空间级 watcher
    const nsWatcherKey = `${namespace}/*`;
    const nsWatchers = this._watchers.get(nsWatcherKey);
    if (nsWatchers) {
      for (const cb of nsWatchers) {
        try {
          cb(namespace, key, value);
        } catch (err) {
          this.emit('error', { namespace, key, error: err.message });
        }
      }
    }
  }

  /**
   * 从现有 Scratchpad 导入数据到 SharedContext
   * @param {Object} scratchpad - Scratchpad 实例或数据对象
   * @param {string} namespace - 目标命名空间
   */
  importFromScratchpad(scratchpad, namespace) {
    if (!scratchpad) return 0;

    let data;
    if (typeof scratchpad.getData === 'function') {
      data = scratchpad.getData();
    } else if (typeof scratchpad.data !== 'undefined') {
      data = scratchpad.data;
    } else {
      data = scratchpad;
    }

    let count = 0;
    if (data && typeof data === 'object') {
      for (const [key, value] of Object.entries(data)) {
        this.set(namespace, key, value, { updatedBy: 'scratchpad-import' });
        count++;
      }
    }

    if (this.verbose) console.log(`[SharedContext] 从 Scratchpad 导入 ${count} 条到 ${namespace}`);
    return count;
  }
}

module.exports = SharedContext;

// ─── CLI 测试入口 ─────────────────────────────────────────

if (require.main === module) {
  const ctx = new SharedContext({ verbose: true });

  // 测试 set / get
  ctx.set('test-ns', 'greeting', 'Hello Orchestra');
  console.log('get:', ctx.get('test-ns', 'greeting'));

  // 测试版本控制
  const r1 = ctx.set('test-ns', 'counter', 0);
  console.log('set v1:', r1);
  const r2 = ctx.set('test-ns', 'counter', 1, { version: 1 });
  console.log('set v2:', r2);
  const r3 = ctx.set('test-ns', 'counter', 99, { version: 1 });
  console.log('version conflict:', r3);

  // 测试 update
  ctx.update('test-ns', 'counter', v => (v || 0) + 1);
  console.log('after update:', ctx.get('test-ns', 'counter'));

  // 测试 watch
  const unwatch = ctx.watch('test-ns', 'greeting', (ns, key, val) => {
    console.log(`[watch] ${ns}/${key} changed to:`, val);
  });
  ctx.set('test-ns', 'greeting', 'Updated!');
  unwatch();
  ctx.set('test-ns', 'greeting', 'After unwatch');

  // 清理
  ctx.clearNamespace('test-ns');
  console.log('测试完成');
}
