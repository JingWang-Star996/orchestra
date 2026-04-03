/**
 * Orchestra Scratchpad - 跨 Worker 知识共享系统
 * 
 * 功能特性：
 * - 键值对存储，支持文本/代码/文件引用
 * - 跨 Worker 共享数据
 * - 文件系统持久化（JSON 格式）
 * - 并发安全（基于文件锁）
 * - 自动保存
 * 
 * @author Orchestra AI System
 * @version 1.0.0
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * Scratchpad 值类型
 */
export type ScratchpadValue = 
  | { type: 'text'; content: string }
  | { type: 'code'; language: string; content: string }
  | { type: 'file'; path: string; description?: string }
  | { type: 'json'; data: any };

/**
 * Scratchpad 条目
 */
export interface ScratchpadEntry {
  key: string;
  value: ScratchpadValue;
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
  updatedBy?: string;
}

/**
 * Scratchpad 数据结构
 */
export interface ScratchpadData {
  entries: Record<string, ScratchpadEntry>;
  version: string;
  lastSaved: number;
}

/**
 * Scratchpad 配置
 */
export interface ScratchpadConfig {
  /** 存储文件路径 */
  storagePath: string;
  /** 自动保存间隔（毫秒），0 表示禁用 */
  autoSaveInterval: number;
  /** Worker ID */
  workerId: string;
  /** 是否启用文件锁 */
  enableLock: boolean;
}

/**
 * Scratchpad API 接口
 */
export interface IScratchpad {
  write(key: string, value: ScratchpadValue): Promise<void>;
  read(key: string): Promise<ScratchpadValue | undefined>;
  list(): Promise<string[]>;
  clear(): Promise<void>;
  delete(key: string): Promise<boolean>;
  getEntry(key: string): Promise<ScratchpadEntry | undefined>;
  export(): Promise<ScratchpadData>;
  import(data: ScratchpadData): Promise<void>;
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 确保目录存在
 */
function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 获取当前时间戳
 */
function now(): number {
  return Date.now();
}

// ============================================================================
// Scratchpad 实现
// ============================================================================

export class Scratchpad implements IScratchpad {
  private config: ScratchpadConfig;
  private data: ScratchpadData;
  private saveTimer: NodeJS.Timeout | null = null;
  private lockFile: string;
  private pendingWrites: Set<string> = new Set();

  constructor(config?: Partial<ScratchpadConfig>) {
    const workspaceRoot = process.env.OPENCLAW_WORKSPACE || '/home/z3129119/.openclaw/workspace';
    
    this.config = {
      storagePath: config?.storagePath || path.join(workspaceRoot, 'orchestra', 'data', 'scratchpad.json'),
      autoSaveInterval: config?.autoSaveInterval ?? 5000, // 默认 5 秒自动保存
      workerId: config?.workerId || `worker-${generateId()}`,
      enableLock: config?.enableLock ?? true,
    };

    this.lockFile = this.config.storagePath + '.lock';
    this.data = this.load();
    
    // 启动自动保存
    if (this.config.autoSaveInterval > 0) {
      this.startAutoSave();
    }
  }

  // ============================================================================
  // 核心 API
  // ============================================================================

  /**
   * 写入数据
   * @param key 键
   * @param value 值
   */
  async write(key: string, value: ScratchpadValue): Promise<void> {
    await this.acquireLock();
    
    try {
      const existingEntry = this.data.entries[key];
      const entry: ScratchpadEntry = {
        key,
        value,
        createdAt: existingEntry?.createdAt || now(),
        updatedAt: now(),
        createdBy: existingEntry?.createdBy || this.config.workerId,
        updatedBy: this.config.workerId,
      };

      this.data.entries[key] = entry;
      this.pendingWrites.add(key);
      
      // 立即保存（如果禁用自动保存）
      if (this.config.autoSaveInterval === 0) {
        await this.save();
      }
    } finally {
      await this.releaseLock();
    }
  }

  /**
   * 读取数据
   * @param key 键
   * @returns 值，如果不存在则返回 undefined
   */
  async read(key: string): Promise<ScratchpadValue | undefined> {
    await this.acquireLock();
    
    try {
      const entry = this.data.entries[key];
      return entry?.value;
    } finally {
      await this.releaseLock();
    }
  }

  /**
   * 获取条目（包含元数据）
   * @param key 键
   * @returns 条目，如果不存在则返回 undefined
   */
  async getEntry(key: string): Promise<ScratchpadEntry | undefined> {
    await this.acquireLock();
    
    try {
      return this.data.entries[key];
    } finally {
      await this.releaseLock();
    }
  }

  /**
   * 列出所有键
   * @returns 键列表
   */
  async list(): Promise<string[]> {
    await this.acquireLock();
    
    try {
      return Object.keys(this.data.entries);
    } finally {
      await this.releaseLock();
    }
  }

  /**
   * 删除键
   * @param key 键
   * @returns 是否删除成功
   */
  async delete(key: string): Promise<boolean> {
    await this.acquireLock();
    
    try {
      if (this.data.entries[key]) {
        delete this.data.entries[key];
        await this.save();
        return true;
      }
      return false;
    } finally {
      await this.releaseLock();
    }
  }

  /**
   * 清空所有数据
   */
  async clear(): Promise<void> {
    await this.acquireLock();
    
    try {
      this.data.entries = {};
      await this.save();
    } finally {
      await this.releaseLock();
    }
  }

  /**
   * 导出数据
   * @returns 完整的 Scratchpad 数据
   */
  async export(): Promise<ScratchpadData> {
    await this.acquireLock();
    
    try {
      return { ...this.data };
    } finally {
      await this.releaseLock();
    }
  }

  /**
   * 导入数据
   * @param data 要导入的数据
   */
  async import(data: ScratchpadData): Promise<void> {
    await this.acquireLock();
    
    try {
      this.data = {
        ...data,
        lastSaved: now(),
      };
      await this.save();
    } finally {
      await this.releaseLock();
    }
  }

  // ============================================================================
  // 持久化
  // ============================================================================

  /**
   * 加载数据
   */
  private load(): ScratchpadData {
    try {
      if (fs.existsSync(this.config.storagePath)) {
        const content = fs.readFileSync(this.config.storagePath, 'utf-8');
        const data = JSON.parse(content) as ScratchpadData;
        
        // 验证数据结构
        if (!data.entries || !data.version) {
          console.warn('[Scratchpad] Invalid data format, initializing fresh');
          return this.createEmptyData();
        }
        
        return data;
      }
    } catch (error) {
      console.warn('[Scratchpad] Failed to load data:', error);
    }
    
    return this.createEmptyData();
  }

  /**
   * 保存数据
   */
  private async save(): Promise<void> {
    try {
      ensureDir(path.dirname(this.config.storagePath));
      
      this.data.lastSaved = now();
      const content = JSON.stringify(this.data, null, 2);
      
      // 原子写入（先写临时文件，再重命名）
      const tempPath = this.config.storagePath + '.tmp';
      fs.writeFileSync(tempPath, content, 'utf-8');
      fs.renameSync(tempPath, this.config.storagePath);
      
      this.pendingWrites.clear();
    } catch (error) {
      console.error('[Scratchpad] Failed to save:', error);
      throw error;
    }
  }

  /**
   * 创建空数据结构
   */
  private createEmptyData(): ScratchpadData {
    return {
      entries: {},
      version: '1.0.0',
      lastSaved: now(),
    };
  }

  // ============================================================================
  // 并发控制
  // ============================================================================

  /**
   * 获取文件锁
   */
  private async acquireLock(): Promise<void> {
    if (!this.config.enableLock) {
      return;
    }

    const maxRetries = 10;
    const retryDelay = 50; // ms

    for (let i = 0; i < maxRetries; i++) {
      try {
        // 尝试创建锁文件（独占模式）
        fs.writeFileSync(this.lockFile, this.config.workerId, { flag: 'wx' });
        return;
      } catch (error: any) {
        if (error.code === 'EEXIST') {
          // 锁已存在，等待后重试
          await this.sleep(retryDelay);
        } else {
          throw error;
        }
      }
    }

    throw new Error('[Scratchpad] Failed to acquire lock after max retries');
  }

  /**
   * 释放文件锁
   */
  private async releaseLock(): Promise<void> {
    if (!this.config.enableLock) {
      return;
    }

    try {
      if (fs.existsSync(this.lockFile)) {
        fs.unlinkSync(this.lockFile);
      }
    } catch (error) {
      console.warn('[Scratchpad] Failed to release lock:', error);
    }
  }

  // ============================================================================
  // 自动保存
  // ============================================================================

  /**
   * 启动自动保存
   */
  private startAutoSave(): void {
    this.saveTimer = setInterval(async () => {
      if (this.pendingWrites.size > 0) {
        await this.acquireLock();
        try {
          await this.save();
        } catch (error) {
          console.error('[Scratchpad] Auto-save failed:', error);
        } finally {
          await this.releaseLock();
        }
      }
    }, this.config.autoSaveInterval);

    // 进程退出时保存
    process.on('exit', () => this.saveSync());
    process.on('SIGINT', () => this.saveSync());
    process.on('SIGTERM', () => this.saveSync());
  }

  /**
   * 同步保存（用于进程退出）
   */
  private saveSync(): void {
    if (this.pendingWrites.size === 0) {
      return;
    }

    try {
      ensureDir(path.dirname(this.config.storagePath));
      this.data.lastSaved = now();
      fs.writeFileSync(this.config.storagePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (error) {
      console.error('[Scratchpad] Final save failed:', error);
    }
  }

  /**
   * 停止自动保存
   */
  stopAutoSave(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }
  }

  // ============================================================================
  // 工具方法
  // ============================================================================

  /**
   * 休眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取配置信息
   */
  getConfig(): ScratchpadConfig {
    return { ...this.config };
  }

  /**
   * 获取统计信息
   */
  async getStats(): Promise<{
    totalEntries: number;
    lastSaved: number;
    pendingWrites: number;
  }> {
    await this.acquireLock();
    
    try {
      return {
        totalEntries: Object.keys(this.data.entries).length,
        lastSaved: this.data.lastSaved,
        pendingWrites: this.pendingWrites.size,
      };
    } finally {
      await this.releaseLock();
    }
  }
}

// ============================================================================
// 便捷工厂函数
// ============================================================================

/**
 * 创建默认 Scratchpad 实例
 */
export function createScratchpad(config?: Partial<ScratchpadConfig>): Scratchpad {
  return new Scratchpad(config);
}

/**
 * 创建 Coordinator 专用的 Scratchpad（完全控制）
 */
export function createCoordinatorScratchpad(config?: Partial<ScratchpadConfig>): Scratchpad {
  return new Scratchpad({
    ...config,
    workerId: config?.workerId || 'coordinator',
  });
}

/**
 * 创建 Worker 专用的 Scratchpad
 */
export function createWorkerScratchpad(workerId: string, config?: Partial<ScratchpadConfig>): Scratchpad {
  return new Scratchpad({
    ...config,
    workerId,
  });
}

// ============================================================================
// 使用示例
// ============================================================================

/**
 * 使用示例代码
 * 
 * @example
 * ```typescript
 * import { createScratchpad, createWorkerScratchpad } from './scratchpad';
 * 
 * // 1. 基础使用
 * const scratchpad = createScratchpad();
 * 
 * // 写入文本
 * await scratchpad.write('notes', {
 *   type: 'text',
 *   content: '这是重要的会议记录'
 * });
 * 
 * // 写入代码
 * await scratchpad.write('api-code', {
 *   type: 'code',
 *   language: 'typescript',
 *   content: 'const result = await fetchData();'
 * });
 * 
 * // 写入文件引用
 * await scratchpad.write('config-file', {
 *   type: 'file',
 *   path: '/path/to/config.json',
 *   description: '主配置文件'
 * });
 * 
 * // 写入 JSON 数据
 * await scratchpad.write('user-data', {
 *   type: 'json',
 *   data: { name: 'Alice', age: 30 }
 * });
 * 
 * // 读取数据
 * const notes = await scratchpad.read('notes');
 * console.log(notes?.content);
 * 
 * // 列出所有键
 * const keys = await scratchpad.list();
 * console.log(keys);
 * 
 * // 删除
 * await scratchpad.delete('notes');
 * 
 * // 清空
 * await scratchpad.clear();
 * ```
 * 
 * @example
 * ```typescript
 * // 2. 跨 Worker 共享
 * // Worker A
 * const workerA = createWorkerScratchpad('worker-A');
 * await workerA.write('shared-data', {
 *   type: 'json',
 *   data: { processed: true, count: 100 }
 * });
 * 
 * // Worker B
 * const workerB = createWorkerScratchpad('worker-B');
 * const data = await workerB.read('shared-data');
 * console.log('Worker A 处理了:', data?.data.count);
 * ```
 * 
 * @example
 * ```typescript
 * // 3. Coordinator 完全控制
 * const coordinator = createCoordinatorScratchpad();
 * 
 * // 查看所有条目（含元数据）
 * const keys = await coordinator.list();
 * for (const key of keys) {
 *   const entry = await coordinator.getEntry(key);
 *   console.log(`${key}: 创建者=${entry?.createdBy}, 更新时间=${entry?.updatedAt}`);
 * }
 * 
 * // 导出数据备份
 * const backup = await coordinator.export();
 * fs.writeFileSync('backup.json', JSON.stringify(backup));
 * 
 * // 导入恢复
 * const restore = JSON.parse(fs.readFileSync('backup.json', 'utf-8'));
 * await coordinator.import(restore);
 * ```
 * 
 * @example
 * ```typescript
 * // 4. 自定义配置
 * const custom = createScratchpad({
 *   storagePath: '/custom/path/scratchpad.json',
 *   autoSaveInterval: 10000, // 10 秒自动保存
 *   workerId: 'my-worker',
 *   enableLock: true
 * });
 * ```
 */
export const EXAMPLES = null;
