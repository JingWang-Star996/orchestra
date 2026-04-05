#!/usr/bin/env node

/**
 * CacheLayer - 缓存层（Phase 3 性能优化）
 * 
 * 职责：缓存文件内容、API 响应、计算结果，减少重复操作
 * 优势：提升性能、减少 API 调用、降低成本
 * 
 * 缓存策略：
 * - LRU 淘汰（Least Recently Used）
 * - TTL 过期（Time To Live）
 * - 大小限制
 */

var util = require('util');

/**
 * CacheLayer 构造函数
 * @param {Object} options - 配置选项
 * @param {number} options.maxSize - 最大缓存条目数（默认 1000）
 * @param {number} options.defaultTTL - 默认 TTL（毫秒，默认 5 分钟）
 * @param {boolean} options.verbose - 是否输出详细日志
 */
function CacheLayer(options) {
  this.maxSize = (options && options.maxSize) || 1000;
  this.defaultTTL = (options && options.defaultTTL) || 5 * 60 * 1000; // 5 分钟
  this.verbose = (options && options.verbose) || false;
  
  // 缓存存储：Map<key, CacheEntry>
  this.cache = new Map();
  
  // 访问顺序队列（用于 LRU）
  this.accessOrder = [];
  
  // 统计信息
  this.stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    evictions: 0,
    expirations: 0
  };
  
  // 启动定时清理（每 1 分钟）
  this.cleanupInterval = setInterval(this._cleanup.bind(this), 60 * 1000);
  
  if (this.verbose) {
    console.log('[CacheLayer] 初始化');
    console.log('  - MaxSize:', this.maxSize);
    console.log('  - DefaultTTL:', this.defaultTTL / 1000, '秒');
  }
}

/**
 * 缓存条目
 */
function CacheEntry(value, ttl) {
  this.value = value;
  this.createdAt = Date.now();
  this.expiresAt = this.createdAt + ttl;
  this.lastAccessedAt = this.createdAt;
  this.accessCount = 0;
}

/**
 * 设置缓存
 * @param {string} key - 缓存键
 * @param {any} value - 缓存值
 * @param {Object} options - 选项
 * @param {number} options.ttl - 自定义 TTL（毫秒）
 */
CacheLayer.prototype.set = function(key, value, options) {
  var ttl = (options && options.ttl) || this.defaultTTL;
  
  // 检查是否需要淘汰
  if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
    this._evictLRU();
  }
  
  // 创建缓存条目
  var entry = new CacheEntry(value, ttl);
  this.cache.set(key, entry);
  
  // 更新访问顺序
  this._updateAccessOrder(key);
  
  // 更新统计
  this.stats.sets++;
  
  if (this.verbose) {
    console.log('[CacheLayer] SET:', key, 'TTL:', ttl / 1000, '秒');
  }
};

/**
 * 获取缓存
 * @param {string} key - 缓存键
 * @returns {any|null} 缓存值（不存在或过期返回 null）
 */
CacheLayer.prototype.get = function(key) {
  var entry = this.cache.get(key);
  
  if (!entry) {
    this.stats.misses++;
    if (this.verbose) {
      console.log('[CacheLayer] MISS:', key);
    }
    return null;
  }
  
  // 检查是否过期
  if (Date.now() > entry.expiresAt) {
    this.cache.delete(key);
    this._removeFromAccessOrder(key);
    this.stats.expirations++;
    this.stats.misses++;
    
    if (this.verbose) {
      console.log('[CacheLayer] EXPIRED:', key);
    }
    return null;
  }
  
  // 更新访问信息
  entry.lastAccessedAt = Date.now();
  entry.accessCount++;
  this._updateAccessOrder(key);
  
  this.stats.hits++;
  
  if (this.verbose) {
    console.log('[CacheLayer] HIT:', key, 'AccessCount:', entry.accessCount);
  }
  
  return entry.value;
};

/**
 * 检查缓存是否存在且未过期
 * @param {string} key - 缓存键
 * @returns {boolean} 是否存在
 */
CacheLayer.prototype.has = function(key) {
  var entry = this.cache.get(key);
  
  if (!entry) {
    return false;
  }
  
  if (Date.now() > entry.expiresAt) {
    this.cache.delete(key);
    this._removeFromAccessOrder(key);
    this.stats.expirations++;
    return false;
  }
  
  return true;
};

/**
 * 删除缓存
 * @param {string} key - 缓存键
 */
CacheLayer.prototype.delete = function(key) {
  var existed = this.cache.has(key);
  this.cache.delete(key);
  this._removeFromAccessOrder(key);
  
  if (this.verbose && existed) {
    console.log('[CacheLayer] DELETE:', key);
  }
  
  return existed;
};

/**
 * 清空缓存
 */
CacheLayer.prototype.clear = function() {
  this.cache.clear();
  this.accessOrder = [];
  
  if (this.verbose) {
    console.log('[CacheLayer] CLEAR - 清空所有缓存');
  }
};

/**
 * 获取缓存大小
 * @returns {number} 缓存条目数
 */
CacheLayer.prototype.size = function() {
  return this.cache.size;
};

/**
 * 获取统计信息
 * @returns {Object} 统计信息
 */
CacheLayer.prototype.getStats = function() {
  var total = this.stats.hits + this.stats.misses;
  var hitRate = total > 0 ? (this.stats.hits / total * 100) : 0;
  
  return {
    size: this.cache.size,
    maxSize: this.maxSize,
    hits: this.stats.hits,
    misses: this.stats.misses,
    sets: this.stats.sets,
    evictions: this.stats.evictions,
    expirations: this.stats.expirations,
    hitRate: hitRate.toFixed(2) + '%'
  };
};

/**
 * 获取性能报告
 * @returns {Object} 性能报告
 */
CacheLayer.prototype.getPerformanceReport = function() {
  var stats = this.getStats();
  
  // 估算节省的 API 调用
  var estimatedSavings = this.stats.hits; // 每次 hit 节省一次操作
  
  return {
    cacheSize: stats.size,
    hitRate: stats.hitRate,
    totalRequests: this.stats.hits + this.stats.misses,
    estimatedSavings: estimatedSavings,
    memoryUsage: this._estimateMemoryUsage()
  };
};

/**
 * 估算内存使用（字节）
 * @private
 */
CacheLayer.prototype._estimateMemoryUsage = function() {
  // 粗略估算：每个条目约 1KB
  return this.cache.size * 1024;
};

/**
 * LRU 淘汰
 * @private
 */
CacheLayer.prototype._evictLRU = function() {
  if (this.accessOrder.length === 0) {
    return;
  }
  
  // 获取最久未访问的键
  var lruKey = this.accessOrder[0];
  
  this.cache.delete(lruKey);
  this._removeFromAccessOrder(lruKey);
  this.stats.evictions++;
  
  if (this.verbose) {
    console.log('[CacheLayer] EVICT LRU:', lruKey);
  }
};

/**
 * 更新访问顺序
 * @private
 */
CacheLayer.prototype._updateAccessOrder = function(key) {
  // 从当前位置移除
  var index = this.accessOrder.indexOf(key);
  if (index !== -1) {
    this.accessOrder.splice(index, 1);
  }
  
  // 添加到队尾（最近访问）
  this.accessOrder.push(key);
};

/**
 * 从访问顺序中移除
 * @private
 */
CacheLayer.prototype._removeFromAccessOrder = function(key) {
  var index = this.accessOrder.indexOf(key);
  if (index !== -1) {
    this.accessOrder.splice(index, 1);
  }
};

/**
 * 定时清理过期条目
 * @private
 */
CacheLayer.prototype._cleanup = function() {
  var now = Date.now();
  var expiredKeys = [];
  
  this.cache.forEach(function(entry, key) {
    if (now > entry.expiresAt) {
      expiredKeys.push(key);
    }
  });
  
  for (var i = 0; i < expiredKeys.length; i++) {
    var key = expiredKeys[i];
    this.cache.delete(key);
    this._removeFromAccessOrder(key);
    this.stats.expirations++;
  }
  
  if (this.verbose && expiredKeys.length > 0) {
    console.log('[CacheLayer] CLEANUP - 清理', expiredKeys.length, '个过期条目');
  }
};

/**
 * 停止清理定时器
 */
CacheLayer.prototype.destroy = function() {
  if (this.cleanupInterval) {
    clearInterval(this.cleanupInterval);
    this.cleanupInterval = null;
  }
  
  if (this.verbose) {
    console.log('[CacheLayer] 销毁');
  }
};

/**
 * 导出缓存到文件
 * @param {string} filePath - 文件路径
 * @returns {Promise<Object>} 导出结果
 */
CacheLayer.prototype.exportToFile = async function(filePath) {
  var fs = require('fs');
  
  var exportData = {
    timestamp: Date.now(),
    stats: this.getStats(),
    entries: {}
  };
  
  this.cache.forEach(function(entry, key) {
    exportData.entries[key] = {
      value: entry.value,
      expiresAt: entry.expiresAt,
      accessCount: entry.accessCount
    };
  });
  
  try {
    var content = JSON.stringify(exportData, null, 2);
    
    // 使用 write 工具或 fs
    if (this.onWriteTool) {
      await this.onWriteTool(filePath, content);
    } else {
      fs.writeFileSync(filePath, content, 'utf8');
    }
    
    return {
      success: true,
      path: filePath,
      entriesCount: Object.keys(exportData.entries).length
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * 从文件导入缓存
 * @param {string} filePath - 文件路径
 * @returns {Promise<Object>} 导入结果
 */
CacheLayer.prototype.importFromFile = async function(filePath) {
  var fs = require('fs');
  
  try {
    var content;
    
    // 使用 read 工具或 fs
    if (this.onReadTool) {
      var readResult = await this.onReadTool(filePath);
      if (!readResult.success) {
        return readResult;
      }
      content = readResult.content;
    } else {
      content = fs.readFileSync(filePath, 'utf8');
    }
    
    var importData = JSON.parse(content);
    
    var now = Date.now();
    var importedCount = 0;
    
    for (var key in importData.entries) {
      var entryData = importData.entries[key];
      
      // 只导入未过期的条目
      if (now < entryData.expiresAt) {
        var entry = new CacheEntry(entryData.value, entryData.expiresAt - now);
        entry.accessCount = entryData.accessCount || 0;
        this.cache.set(key, entry);
        this._updateAccessOrder(key);
        importedCount++;
      }
    }
    
    return {
      success: true,
      path: filePath,
      importedCount: importedCount,
      expiredCount: Object.keys(importData.entries).length - importedCount
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

module.exports = CacheLayer;
