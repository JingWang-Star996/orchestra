/**
 * NodeRegistry — 多实例节点注册与发现
 *
 * 职责:
 *  - 节点注册/注销
 *  - 心跳机制（定时发送 + 超时检测）
 *  - 节点上下线事件通知
 *  - 支持本地文件存储或纯内存模式
 *
 * 依赖: 仅 Node.js 内置模块
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const EventEmitter = require('events');

/** @typedef {{ nodeId: string, role: string, host: string, port: number, status: string, lastHeartbeat: number, meta: Object }} NodeInfo */

class NodeRegistry extends EventEmitter {
  /**
   * @param {Object} opts
   * @param {string} [opts.nodeId]  节点唯一标识（不传则自动生成）
   * @param {string} [opts.role='hybrid']  节点角色: primary | replica | worker | hybrid
   * @param {string} [opts.host='127.0.0.1']
   * @param {number} [opts.port=3000]
   * @param {Object} [opts.meta={}]  自定义元数据
   * @param {'memory'|'file'} [opts.storageMode='memory']  存储模式
   * @param {string} [opts.storagePath='./.orchestra-nodes']  文件存储目录
   * @param {number} [opts.heartbeatInterval=5000]  心跳间隔(ms)
   * @param {number} [opts.offlineThreshold=15000]  判定离线阈值(ms)
   */
  constructor(opts = {}) {
    super();
    this.nodeId = opts.nodeId || crypto.randomUUID();
    this.role = opts.role || 'hybrid';
    this.host = opts.host || '127.0.0.1';
    this.port = opts.port || 3000;
    this.meta = opts.meta || {};
    this.storageMode = opts.storageMode || 'memory';
    this.storagePath = opts.storagePath || path.join(process.cwd(), '.orchestra-nodes');
    this.heartbeatInterval = opts.heartbeatInterval || 5000;
    this.offlineThreshold = opts.offlineThreshold || 15000;

    /** @type {Map<string, NodeInfo>} */
    this._nodes = new Map();
    this._heartbeatTimer = null;
    this._detectTimer = null;
    this._started = false;
  }

  /* ───────── 生命周期 ───────── */

  /** 启动本节点（注册自身 + 开启心跳） */
  start() {
    if (this._started) return;
    this._started = true;

    // 加载已有节点
    if (this.storageMode === 'file') this._loadFromFile();

    // 注册自身
    this.register({
      nodeId: this.nodeId,
      role: this.role,
      host: this.host,
      port: this.port,
      status: 'online',
      lastHeartbeat: Date.now(),
      meta: this.meta,
    });

    // 定时发心跳
    this._heartbeatTimer = setInterval(() => this._sendHeartbeat(), this.heartbeatInterval);
    this._heartbeatTimer.unref();

    // 定时检测离线节点
    this._detectTimer = setInterval(() => this._detectOffline(), this.heartbeatInterval);
    this._detectTimer.unref();

    this.emit('node:online', this.nodeId);
  }

  /** 停止本节点 */
  stop() {
    if (!this._started) return;
    this._started = false;

    clearInterval(this._heartbeatTimer);
    clearInterval(this._detectTimer);

    // 将自身标记为 offline
    const self = this._nodes.get(this.nodeId);
    if (self) {
      self.status = 'offline';
      self.lastHeartbeat = Date.now();
      this._persist();
      this.emit('node:offline', this.nodeId);
    }

    this._nodes.delete(this.nodeId);
  }

  /* ───────── 节点操作 ───────── */

  /**
   * 注册/更新节点
   * @param {NodeInfo} info
   */
  register(info) {
    const existed = this._nodes.has(info.nodeId);
    this._nodes.set(info.nodeId, { ...info, lastHeartbeat: Date.now() });
    this._persist();

    if (!existed) {
      this.emit('node:joined', info.nodeId, info);
    } else {
      this.emit('node:updated', info.nodeId, info);
    }
  }

  /**
   * 注销节点
   * @param {string} nodeId
   */
  unregister(nodeId) {
    const node = this._nodes.get(nodeId);
    if (!node) return;
    this._nodes.delete(nodeId);
    this._persist();
    this.emit('node:left', nodeId, node);
  }

  /** 获取单个节点信息 */
  getNode(nodeId) {
    return this._nodes.get(nodeId) || null;
  }

  /** 获取所有在线节点 */
  getOnlineNodes() {
    const result = [];
    for (const [, node] of this._nodes) {
      if (node.status === 'online') result.push(node);
    }
    return result;
  }

  /** 获取全部节点（含离线） */
  getAllNodes() {
    return Array.from(this._nodes.values());
  }

  /** 按角色筛选 */
  getByRole(role) {
    return this.getOnlineNodes().filter((n) => n.role === role);
  }

  /* ───────── 内部方法 ───────── */

  _sendHeartbeat() {
    const self = this._nodes.get(this.nodeId);
    if (!self) return;
    self.lastHeartbeat = Date.now();
    self.status = 'online';
    this._persist();
    this.emit('heartbeat', this.nodeId, Date.now());
  }

  _detectOffline() {
    const now = Date.now();
    for (const [id, node] of this._nodes) {
      if (id === this.nodeId) continue; // 不检测自己
      if (node.status === 'offline') continue;
      if (now - node.lastHeartbeat > this.offlineThreshold) {
        node.status = 'offline';
        this._persist();
        this.emit('node:offline', id, node);
      }
    }
  }

  /* ───────── 持久化 ───────── */

  _persist() {
    if (this.storageMode !== 'file') return;
    try {
      fs.mkdirSync(this.storagePath, { recursive: true });
      const data = JSON.stringify(Array.from(this._nodes.entries()), null, 2);
      fs.writeFileSync(path.join(this.storagePath, 'nodes.json'), data, 'utf8');
    } catch (err) {
      this.emit('error', err);
    }
  }

  _loadFromFile() {
    const file = path.join(this.storagePath, 'nodes.json');
    try {
      if (!fs.existsSync(file)) return;
      const raw = fs.readFileSync(file, 'utf8');
      const entries = JSON.parse(raw);
      for (const [id, info] of entries) {
        this._nodes.set(id, info);
      }
    } catch (err) {
      this.emit('error', err);
    }
  }
}

module.exports = NodeRegistry;
