/**
 * CacheLayer 单元测试
 */

var assert = require('assert');
var CacheLayer = require('../cacheLayer');

describe('CacheLayer', function() {
  var cache;
  
  beforeEach(function() {
    cache = new CacheLayer({
      maxSize: 100,
      defaultTTL: 60 * 1000, // 1 分钟
      verbose: false
    });
  });
  
  afterEach(function() {
    if (cache) {
      cache.destroy();
    }
  });
  
  describe('基本操作', function() {
    it('应该能设置和获取缓存', function() {
      cache.set('key1', 'value1');
      var value = cache.get('key1');
      assert.strictEqual(value, 'value1');
    });
    
    it('应该能检查缓存是否存在', function() {
      cache.set('key1', 'value1');
      assert.strictEqual(cache.has('key1'), true);
      assert.strictEqual(cache.has('key2'), false);
    });
    
    it('应该能删除缓存', function() {
      cache.set('key1', 'value1');
      assert.strictEqual(cache.has('key1'), true);
      
      cache.delete('key1');
      assert.strictEqual(cache.has('key1'), false);
    });
    
    it('应该能清空缓存', function() {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      
      cache.clear();
      assert.strictEqual(cache.size(), 0);
    });
  });
  
  describe('TTL 过期', function() {
    it('应该在过期后返回 null', function(done) {
      var shortTTLCache = new CacheLayer({
        maxSize: 100,
        defaultTTL: 100, // 100ms
        verbose: false
      });
      
      shortTTLCache.set('key1', 'value1');
      assert.strictEqual(shortTTLCache.get('key1'), 'value1');
      
      setTimeout(function() {
        assert.strictEqual(shortTTLCache.get('key1'), null);
        shortTTLCache.destroy();
        done();
      }, 150);
    });
    
    it('应该能自定义 TTL', function(done) {
      cache.set('key1', 'value1', { ttl: 100 });
      assert.strictEqual(cache.get('key1'), 'value1');
      
      setTimeout(function() {
        assert.strictEqual(cache.get('key1'), null);
        done();
      }, 150);
    });
  });
  
  describe('LRU 淘汰', function() {
    it('应该在达到最大容量时淘汰最久未使用的条目', function() {
      var smallCache = new CacheLayer({
        maxSize: 3,
        defaultTTL: 60 * 1000,
        verbose: false
      });
      
      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');
      smallCache.set('key3', 'value3');
      
      // 访问 key1，使其变为最近使用
      smallCache.get('key1');
      
      // 添加新条目，应该淘汰 key2（最久未使用）
      smallCache.set('key4', 'value4');
      
      assert.strictEqual(smallCache.has('key1'), true);
      assert.strictEqual(smallCache.has('key2'), false); // 被淘汰
      assert.strictEqual(smallCache.has('key3'), true);
      assert.strictEqual(smallCache.has('key4'), true);
      
      smallCache.destroy();
    });
  });
  
  describe('统计信息', function() {
    it('应该正确统计命中和未命中', function() {
      cache.set('key1', 'value1');
      
      cache.get('key1'); // hit
      cache.get('key1'); // hit
      cache.get('key2'); // miss
      cache.get('key3'); // miss
      
      var stats = cache.getStats();
      assert.strictEqual(stats.hits, 2);
      assert.strictEqual(stats.misses, 2);
      assert.strictEqual(stats.sets, 1);
    });
    
    it('应该计算命中率', function() {
      cache.set('key1', 'value1');
      
      cache.get('key1'); // hit
      cache.get('key2'); // miss
      
      var stats = cache.getStats();
      assert.strictEqual(stats.hitRate, '50.00%');
    });
  });
  
  describe('性能报告', function() {
    it('应该生成性能报告', function() {
      cache.set('key1', 'value1');
      cache.get('key1');
      cache.get('key2');
      
      var report = cache.getPerformanceReport();
      
      assert.strictEqual(typeof report.cacheSize, 'number');
      assert.strictEqual(typeof report.hitRate, 'string');
      assert.strictEqual(typeof report.totalRequests, 'number');
      assert.strictEqual(typeof report.estimatedSavings, 'number');
    });
  });
});
