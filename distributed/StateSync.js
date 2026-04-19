/**
 * StateSync — 跨节点状态同步协议
 *
 * 职责:
 *  - 使用版本向量（Version Vector）跟踪变更
 *  - 支持 Scratchpad 数据的跨实例同步
 *  - 冲突解决：最后写者胜出（LWW）+ 版本向量合并
 *  - 通过 MessageBus 进行跨节点通知
 *
 * 依赖: 仅 Node.js 内置模块 + 本地 MessageBus
 */

const crypto = require('crypto');
const EventEmitter = require('events');

/**
 * @typedef {{ value: any, version: number, node: string, ts: number }} VersionedValue
 * @typedef {Object<string, Object<string, number>>} VersionVector  { key: { nodeId: version } }
 */

const TOPIC_SYNC = 'orchestra:state:sync';
const TOPIC_REQUEST = 'orchestra:state:request';
const TOPIC_RESPONSE = 'orchestra:state:response';

class StateSync extends EventEmitter {
  /**
   * @param {Object} opts
   * @param {string} opts.nodeId            本节点标识（必填）
   * @param {Object} opts.messageBus         MessageBus 实例（必填）
   * @param {number} [opts.syncDelay=1000]   同步延迟(ms)
   * @param {number} [opts.maxEntries=5000]  最大条目数
   */
  constructor(opts) {
    super();
    if (!opts || !opts.nodeId || !opts.messageBus) {
      throw new Error('StateSync requires nodeId and messageBus options');
    }
    this.nodeId = opts.nodeId;
    this.bus = opts.messageBus;
    this.syncDelay = opts.syncDelay || 1000;
    this.maxEntries = opts.maxEntries || 5000;

    /** @type {Map<string, VersionedValue>} */
    this._store = new Map();
    /** @type {Object<string, Object<string, number>>} */
    this._versionVector = {};

    // 监听来自其他节点的同步消息
    this._subSync = this.bus.subscribe(TOPIC_SYNC, (msg) => this._handleSync(msg));
    this._subRequest = this.bus.subscribe(TOPIC_REQUEST, (msg) => this._handleRequest(msg));
    this._subResponse = this.bus.subscribe(TOPIC_RESPONSE, (msg) => this._handleResponse(msg));

    this._started = false;
  }

  /* ───────── 生命周期 ───────── */

  start() {
    if (this._started) return;
    this._started = true;
    this.emit('statesync:started', this.nodeId);
  }

  stop() {
    if (!this._started) return;
    this._started = false;
    this._subSync();
    this._subRequest();
    this._subResponse();
    this.emit('statesync:stopped', this.nodeId);
  }

  /* ───────── CRUD ───────── */

  /**
   * 设置键值（自动递增版本 + 广播）
   * @param {string} key
   * @param {any} value
   */
  set(key, value) {
    const current = this._store.get(key);
    const version = current ? current.version + 1 : 1;

    // 更新版本向量
    if (!this._versionVector[key]) this._versionVector[key] = {};
    this._versionVector[key][this.nodeId] = version;

    const entry = { value, version, node: this.nodeId, ts: Date.now() };
    this._store.set(key, entry);

    // 清理超限
    if (this._store.size > this.maxEntries) {
      const oldest = this._store.keys().next().value;
      this._store.delete(oldest);
      delete this._versionVector[oldest];
    }

    // 广播变更
    this._broadcastSync(key, entry);
    this.emit('state:set', key, value);
  }

  /**
   * 获取键值
   * @param {string} key
   * @returns {any|null}
   */
  get(key) {
    const entry = this._store.get(key);
    return entry ? entry.value : null;
  }

  /**
   * 删除键
   * @param {string} key
   */
  delete(key) {
    this._store.delete(key);
    delete this._versionVector[key];
    this._broadcastSync(key, null);
    this.emit('state:delete', key);
  }

  /**
   * 获取所有键值对
   * @returns {Object<string, any>}
   */
  getAll() {
    const result = {};
    for (const [key, entry] of this._store) {
      result[key] = entry.value;
    }
    return result;
  }

  /** 获取版本号 */
  getVersion(key) {
    return this._versionVector[key] || {};
  }

  /* ───────── 同步协议 ───────── */

  /**
   * 请求全量状态（用于新节点加入时）
   * @param {string} targetNodeId  目标节点（不传则广播）
   */
  requestFullSync(targetNodeId) {
    const requestId = crypto.randomUUID();
    this.bus.publish(TOPIC_REQUEST, {
      requestId,
      requesterId: this.nodeId,
      targetNodeId,
      ts: Date.now(),
    });
    return requestId;
  }

  _broadcastSync(key, entry) {
    this.bus.publish(TOPIC_SYNC, {
      key,
      entry,
      sender: this.nodeId,
      ts: Date.now(),
    });
  }

  _handleSync(msg) {
    if (msg.sender === this.nodeId) return;
    const { key, entry } = msg.payload;

    if (!entry) {
      // 删除操作
      if (this._store.has(key)) {
        this._store.delete(key);
        delete this._versionVector[key];
        this.emit('state:delete', key);
      }
      return;
    }

    // 冲突解决
    if (this._shouldUpdate(key, entry)) {
      this._store.set(key, entry);
      if (!this._versionVector[key]) this._versionVector[key] = {};
      this._versionVector[key][entry.node] = entry.version;
      this.emit('state:sync', key, entry.value, entry.node);
    }
  }

  /**
   * 版本向量比较 + LWW 兜底
   * @returns {boolean} 是否应该更新
   */
  _shouldUpdate(key, remoteEntry) {
    const local = this._store.get(key);
    if (!local) return true;

    const localVV = this._versionVector[key] || {};
    const remoteNodeVersion = remoteEntry.version;
    const localNodeVersion = localVV[remoteEntry.node] || 0;

    // 远端版本更高 → 接受
    if (remoteNodeVersion > localNodeVersion) return true;

    // 版本相同 → 比较时间戳（LWW）
    if (remoteNodeVersion === localNodeVersion && remoteEntry.ts > local.ts) return true;

    return false;
  }

  _handleRequest(msg) {
    const payload = msg.payload;
    // 如果是指定请求自己，或是广播
    if (payload.targetNodeId && payload.targetNodeId !== this.nodeId) return;

    // 回复全量状态
    const state = {};
    for (const [key, entry] of this._store) {
      state[key] = entry;
    }
    this.bus.publish(TOPIC_RESPONSE, {
      requestId: payload.requestId,
      responderId: this.nodeId,
      state,
      ts: Date.now(),
    });
  }

  _handleResponse(msg) {
    const payload = msg.payload;
    // 合并远端状态
    for (const [key, entry] of Object.entries(payload.state || {})) {
      if (this._shouldUpdate(key, entry)) {
        this._store.set(key, entry);
        if (!this._versionVector[key]) this._versionVector[key] = {};
        this._versionVector[key][entry.node] = entry.version;
        this.emit('state:sync', key, entry.value, payload.responderId);
      }
    }
    this.emit('statesync:merged', payload.responderId);
  }

  /** 获取当前状态统计 */
  stats() {
    return {
      nodeId: this.nodeId,
      entryCount: this._store.size,
      versionVectorKeys: Object.keys(this._versionVector).length,
    };
  }
}

module.exports = StateSync;
