/**
 * MessageBus — 轻量级消息总线（EventEmitter + 文件队列）
 *
 * 职责:
 *  - 本地 publish / subscribe
 *  - 消息持久化（JSON 文件队列）
 *  - 跨节点消息路由（通过文件 + 轮询）
 *
 * 依赖: 仅 Node.js 内置模块
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const EventEmitter = require('events');

/**
 * @typedef {{ id: string, topic: string, payload: any, sender: string, ts: number }} Message
 */

class MessageBus extends EventEmitter {
  /**
   * @param {Object} opts
   * @param {string} [opts.nodeId]   本节点标识
   * @param {string} [opts.queueDir='./.orchestra-queue']  消息队列目录
   * @param {boolean} [opts.persist=true]  是否持久化消息到文件
   * @param {number} [opts.maxQueueSize=10000]  单主题最大消息数
   * @param {number} [opts.pollInterval=2000]  跨节点轮询间隔(ms)
   */
  constructor(opts = {}) {
    super();
    this.nodeId = opts.nodeId || crypto.randomUUID();
    this.queueDir = opts.queueDir || path.join(process.cwd(), '.orchestra-queue');
    this.persist = opts.persist !== false;
    this.maxQueueSize = opts.maxQueueSize || 10000;
    this.pollInterval = opts.pollInterval || 2000;

    /** @type {Map<string, Message[]>} key=topic, value=messages */
    this._queues = new Map();
    /** @type {Map<string, Set<Function>>} key=topic, value=callbacks */
    this._subs = new Map();
    this._pollTimer = null;
    this._started = false;
  }

  /* ───────── 生命周期 ───────── */

  start() {
    if (this._started) return;
    this._started = true;

    if (this.persist) {
      fs.mkdirSync(this.queueDir, { recursive: true });
      this._loadQueues();
    }

    // 跨节点消息轮询
    this._pollTimer = setInterval(() => this._pollRemote(), this.pollInterval);
    this._pollTimer.unref();

    this.emit('bus:started', this.nodeId);
  }

  stop() {
    if (!this._started) return;
    this._started = false;
    clearInterval(this._pollTimer);
    this._flushQueues();
    this.emit('bus:stopped', this.nodeId);
  }

  /* ───────── 发布 / 订阅 ───────── */

  /**
   * 发布消息到指定主题
   * @param {string} topic
   * @param {any} payload
   * @returns {string} messageId
   */
  publish(topic, payload) {
    const msg = {
      id: crypto.randomUUID(),
      topic,
      payload,
      sender: this.nodeId,
      ts: Date.now(),
    };

    // 本地分发
    this._deliver(msg);

    // 入队持久化
    this._enqueue(topic, msg);

    // 跨节点写入
    if (this.persist) this._writeOutbound(msg);

    return msg.id;
  }

  /**
   * 订阅主题
   * @param {string} topic
   * @param {Function} handler  (message) => void
   * @returns {Function} unsubscribe
   */
  subscribe(topic, handler) {
    if (!this._subs.has(topic)) {
      this._subs.set(topic, new Set());
    }
    this._subs.get(topic).add(handler);

    // 返回退订函数
    return () => {
      const set = this._subs.get(topic);
      if (set) set.delete(handler);
    };
  }

  /**
   * 一次性订阅（收到一条消息后自动退订）
   */
  subscribeOnce(topic) {
    return new Promise((resolve) => {
      const unsub = this.subscribe(topic, (msg) => {
        unsub();
        resolve(msg);
      });
    });
  }

  /* ───────── 内部方法 ───────── */

  _deliver(msg) {
    const handlers = this._subs.get(msg.topic);
    if (!handlers) return;
    for (const fn of handlers) {
      try {
        fn(msg);
      } catch (err) {
        this.emit('error', err);
      }
    }
  }

  _enqueue(topic, msg) {
    if (!this._queues.has(topic)) this._queues.set(topic, []);
    const queue = this._queues.get(topic);
    queue.push(msg);
    if (queue.length > this.maxQueueSize) queue.shift();
  }

  _deliverFromQueue(topic) {
    const queue = this._queues.get(topic);
    if (!queue || queue.length === 0) return;
    for (const msg of queue) {
      this._deliver(msg);
    }
  }

  /* ───────── 文件持久化 ───────── */

  _queueFile(topic) {
    return path.join(this.queueDir, `${topic.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
  }

  _loadQueues() {
    try {
      const files = fs.readdirSync(this.queueDir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const topic = file.replace('.json', '');
        const raw = fs.readFileSync(path.join(this.queueDir, file), 'utf8');
        const msgs = JSON.parse(raw);
        if (Array.isArray(msgs)) {
          this._queues.set(topic, msgs);
        }
      }
    } catch (err) {
      this.emit('error', err);
    }
  }

  _flushQueues() {
    if (!this.persist) return;
    for (const [topic, msgs] of this._queues) {
      try {
        fs.writeFileSync(this._queueFile(topic), JSON.stringify(msgs, null, 2), 'utf8');
      } catch (err) {
        this.emit('error', err);
      }
    }
  }

  /* ───────── 跨节点消息 ───────── */

  _outboundDir() {
    return path.join(this.queueDir, 'outbound');
  }

  _writeOutbound(msg) {
    try {
      const dir = this._outboundDir();
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${msg.id}.json`);
      fs.writeFileSync(file, JSON.stringify(msg), 'utf8');
    } catch (err) {
      this.emit('error', err);
    }
  }

  _pollRemote() {
    try {
      const dir = this._outboundDir();
      if (!fs.existsSync(dir)) return;

      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const filePath = path.join(dir, file);
        const raw = fs.readFileSync(filePath, 'utf8');
        const msg = JSON.parse(raw);

        // 忽略自己发的
        if (msg.sender === this.nodeId) {
          fs.unlinkSync(filePath);
          continue;
        }

        // 本地分发 + 入队
        this._enqueue(msg.topic, msg);
        this._deliver(msg);

        // 处理后删除
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      this.emit('error', err);
    }
  }
}

module.exports = MessageBus;
