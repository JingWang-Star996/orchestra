/**
 * Scratchpad 单元测试
 */

import { Scratchpad, createScratchpad, createWorkerScratchpad } from './scratchpad';
import * as fs from 'fs';
import * as path from 'path';

const TEST_STORAGE_PATH = path.join(__dirname, '../../test-data/scratchpad-test.json');

describe('Scratchpad', () => {
  let scratchpad: Scratchpad;

  beforeEach(() => {
    // 清理测试数据
    if (fs.existsSync(TEST_STORAGE_PATH)) {
      fs.unlinkSync(TEST_STORAGE_PATH);
    }
    
    scratchpad = new Scratchpad({
      storagePath: TEST_STORAGE_PATH,
      autoSaveInterval: 0, // 测试时禁用自动保存
      workerId: 'test-worker',
      enableLock: false, // 测试时禁用锁
    });
  });

  afterEach(async () => {
    // 清理测试数据
    if (fs.existsSync(TEST_STORAGE_PATH)) {
      fs.unlinkSync(TEST_STORAGE_PATH);
    }
    if (fs.existsSync(TEST_STORAGE_PATH + '.lock')) {
      fs.unlinkSync(TEST_STORAGE_PATH + '.lock');
    }
  });

  describe('write & read', () => {
    it('should write and read text value', async () => {
      await scratchpad.write('test-key', {
        type: 'text',
        content: 'Hello, World!',
      });

      const value = await scratchpad.read('test-key');
      expect(value).toBeDefined();
      expect(value?.type).toBe('text');
      expect(value?.content).toBe('Hello, World!');
    });

    it('should write and read code value', async () => {
      await scratchpad.write('code-key', {
        type: 'code',
        language: 'typescript',
        content: 'const x = 42;',
      });

      const value = await scratchpad.read('code-key');
      expect(value?.type).toBe('code');
      expect(value?.language).toBe('typescript');
      expect(value?.content).toBe('const x = 42;');
    });

    it('should write and read file reference', async () => {
      await scratchpad.write('file-key', {
        type: 'file',
        path: '/path/to/file.txt',
        description: 'Test file',
      });

      const value = await scratchpad.read('file-key');
      expect(value?.type).toBe('file');
      expect(value?.path).toBe('/path/to/file.txt');
      expect(value?.description).toBe('Test file');
    });

    it('should write and read JSON value', async () => {
      const testData = { name: 'Alice', age: 30, tags: ['admin', 'user'] };
      
      await scratchpad.write('json-key', {
        type: 'json',
        data: testData,
      });

      const value = await scratchpad.read('json-key');
      expect(value?.type).toBe('json');
      expect(value?.data).toEqual(testData);
    });

    it('should return undefined for non-existent key', async () => {
      const value = await scratchpad.read('non-existent');
      expect(value).toBeUndefined();
    });

    it('should update existing key', async () => {
      await scratchpad.write('key', { type: 'text', content: 'v1' });
      await scratchpad.write('key', { type: 'text', content: 'v2' });

      const value = await scratchpad.read('key');
      expect(value?.content).toBe('v2');
    });
  });

  describe('list', () => {
    it('should return empty list initially', async () => {
      const keys = await scratchpad.list();
      expect(keys).toEqual([]);
    });

    it('should return all keys', async () => {
      await scratchpad.write('key1', { type: 'text', content: 'v1' });
      await scratchpad.write('key2', { type: 'text', content: 'v2' });
      await scratchpad.write('key3', { type: 'text', content: 'v3' });

      const keys = await scratchpad.list();
      expect(keys).toHaveLength(3);
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toContain('key3');
    });
  });

  describe('delete', () => {
    it('should delete existing key', async () => {
      await scratchpad.write('key', { type: 'text', content: 'value' });
      
      const deleted = await scratchpad.delete('key');
      expect(deleted).toBe(true);
      
      const value = await scratchpad.read('key');
      expect(value).toBeUndefined();
    });

    it('should return false for non-existent key', async () => {
      const deleted = await scratchpad.delete('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all entries', async () => {
      await scratchpad.write('key1', { type: 'text', content: 'v1' });
      await scratchpad.write('key2', { type: 'text', content: 'v2' });
      
      await scratchpad.clear();
      
      const keys = await scratchpad.list();
      expect(keys).toHaveLength(0);
    });
  });

  describe('getEntry', () => {
    it('should return entry with metadata', async () => {
      await scratchpad.write('key', { type: 'text', content: 'value' });
      
      const entry = await scratchpad.getEntry('key');
      expect(entry).toBeDefined();
      expect(entry?.key).toBe('key');
      expect(entry?.createdBy).toBe('test-worker');
      expect(entry?.updatedBy).toBe('test-worker');
      expect(entry?.createdAt).toBeDefined();
      expect(entry?.updatedAt).toBeDefined();
    });

    it('should update metadata on write', async () => {
      await scratchpad.write('key', { type: 'text', content: 'v1' });
      const entry1 = await scratchpad.getEntry('key');
      
      // 模拟不同 worker 更新
      const scratchpad2 = new Scratchpad({
        storagePath: TEST_STORAGE_PATH,
        autoSaveInterval: 0,
        workerId: 'worker-2',
        enableLock: false,
      });
      await scratchpad2.write('key', { type: 'text', content: 'v2' });
      
      const entry2 = await scratchpad2.getEntry('key');
      expect(entry2?.createdBy).toBe('test-worker');
      expect(entry2?.updatedBy).toBe('worker-2');
      expect(entry2?.updatedAt).toBeGreaterThan(entry1?.updatedAt || 0);
    });
  });

  describe('export & import', () => {
    it('should export all data', async () => {
      await scratchpad.write('key1', { type: 'text', content: 'v1' });
      await scratchpad.write('key2', { type: 'json', data: { x: 1 } });
      
      const exported = await scratchpad.export();
      
      expect(exported.version).toBe('1.0.0');
      expect(Object.keys(exported.entries)).toHaveLength(2);
      expect(exported.lastSaved).toBeDefined();
    });

    it('should import data', async () => {
      const importData = {
        version: '1.0.0',
        lastSaved: Date.now(),
        entries: {
          'imported-key': {
            key: 'imported-key',
            value: { type: 'text', content: 'imported' },
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        },
      };
      
      await scratchpad.import(importData);
      
      const value = await scratchpad.read('imported-key');
      expect(value?.content).toBe('imported');
    });
  });

  describe('persistence', () => {
    it('should persist data to file', async () => {
      await scratchpad.write('key', { type: 'text', content: 'persistent' });
      
      // 创建新实例，应该能读取到已保存的数据
      const scratchpad2 = new Scratchpad({
        storagePath: TEST_STORAGE_PATH,
        autoSaveInterval: 0,
        workerId: 'new-worker',
        enableLock: false,
      });
      
      const value = await scratchpad2.read('key');
      expect(value?.content).toBe('persistent');
    });

    it('should handle missing file gracefully', () => {
      const scratchpad = new Scratchpad({
        storagePath: '/non-existent/path/data.json',
        autoSaveInterval: 0,
        workerId: 'test',
        enableLock: false,
      });
      
      expect(scratchpad).toBeDefined();
    });
  });

  describe('concurrent access', () => {
    it('should handle concurrent writes', async () => {
      const workers = [
        createWorkerScratchpad('worker-1', { 
          storagePath: TEST_STORAGE_PATH, 
          autoSaveInterval: 0,
          enableLock: true,
        }),
        createWorkerScratchpad('worker-2', { 
          storagePath: TEST_STORAGE_PATH, 
          autoSaveInterval: 0,
          enableLock: true,
        }),
        createWorkerScratchpad('worker-3', { 
          storagePath: TEST_STORAGE_PATH, 
          autoSaveInterval: 0,
          enableLock: true,
        }),
      ];

      // 并发写入不同的键
      await Promise.all([
        workers[0].write('key-1', { type: 'text', content: 'from worker 1' }),
        workers[1].write('key-2', { type: 'text', content: 'from worker 2' }),
        workers[2].write('key-3', { type: 'text', content: 'from worker 3' }),
      ]);

      // 验证所有数据都正确保存
      const keys = await workers[0].list();
      expect(keys).toHaveLength(3);
      
      const value1 = await workers[1].read('key-1');
      expect(value1?.content).toBe('from worker 1');
    });
  });
});

describe('Factory functions', () => {
  it('should create default scratchpad', () => {
    const sp = createScratchpad();
    expect(sp).toBeDefined();
    expect(sp.getConfig().workerId).toMatch(/worker-/);
  });

  it('should create coordinator scratchpad', () => {
    const sp = createCoordinatorScratchpad();
    expect(sp.getConfig().workerId).toBe('coordinator');
  });

  it('should create worker scratchpad with custom ID', () => {
    const sp = createWorkerScratchpad('my-worker');
    expect(sp.getConfig().workerId).toBe('my-worker');
  });
});
