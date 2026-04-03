#!/usr/bin/env node

/**
 * AccessControl - 权限控制系统（P1 核心功能）
 * 
 * 职责：管理跨 Worker 数据共享的权限验证
 * 
 * 使用场景：
 * - Scratchpad 跨 Worker 共享验证
 * - Worker 间通信权限控制
 * - 敏感数据访问限制
 */

/**
 * 权限级别定义
 */
const PermissionLevel = {
  NONE: 'none',             // 无权限
  READ: 'read',             // 只读
  WRITE: 'write',           // 写入
  SHARE: 'share',           // 共享给其他 Worker
  ADMIN: 'admin'            // 管理员（完全控制）
};

/**
 * 访问控制列表（ACL）条目
 * @typedef {Object}ACLEntry
 * @property {string} workerId - Worker ID
 * @property {string[]} permissions - 权限列表 ['read', 'write', 'share']
 * @property {number} grantedAt - 授权时间戳
 * @property {string} grantedBy - 授权者 ID
 * @property {number} expiresAt - 过期时间戳（可选）
 */

/**
 * 访问控制管理器
 */
class AccessControlManager {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.acls = new Map(); // taskId -> Map<workerId, ACLEntry>
    this.defaultPermissions = options.defaultPermissions || [PermissionLevel.READ];
  }
  
  /**
   * 初始化任务的 ACL
   * @param {string} taskId - 任务 ID
   * @param {string} ownerWorkerId - 所有者 Worker ID
   */
  initialize(taskId, ownerWorkerId) {
    if (!this.acls.has(taskId)) {
      this.acls.set(taskId, new Map());
      
      // 所有者自动拥有 admin 权限
      this.grantPermission(taskId, ownerWorkerId, [PermissionLevel.ADMIN], 'system');
      
      if (this.verbose) {
        console.log(`[AccessControl] 初始化 ACL: ${taskId} (所有者：${ownerWorkerId})`);
      }
    }
  }
  
  /**
   * 授予权限
   * @param {string} taskId - 任务 ID
   * @param {string} workerId - Worker ID
   * @param {string[]} permissions - 权限列表
   * @param {string} grantedBy - 授权者 ID
   * @param {number} expiresAt - 过期时间戳（可选）
   * @returns {boolean} 是否成功
   */
  grantPermission(taskId, workerId, permissions, grantedBy, expiresAt = null) {
    const taskAcl = this.acls.get(taskId);
    if (!taskAcl) {
      console.error(`[AccessControl] 任务不存在：${taskId}`);
      return false;
    }
    
    const entry = {
      workerId,
      permissions: [...new Set(permissions)], // 去重
      grantedAt: Date.now(),
      grantedBy,
      expiresAt
    };
    
    taskAcl.set(workerId, entry);
    
    if (this.verbose) {
      console.log(`[AccessControl] 授予权限：${workerId} -> [${permissions.join(', ')}] (任务：${taskId})`);
    }
    
    return true;
  }
  
  /**
   * 撤销权限
   * @param {string} taskId - 任务 ID
   * @param {string} workerId - Worker ID
   * @param {string[]} permissions - 要撤销的权限列表
   * @returns {boolean} 是否成功
   */
  revokePermission(taskId, workerId, permissions) {
    const taskAcl = this.acls.get(taskId);
    if (!taskAcl) return false;
    
    const entry = taskAcl.get(workerId);
    if (!entry) return false;
    
    // 移除指定权限
    entry.permissions = entry.permissions.filter(p => !permissions.includes(p));
    
    // 如果没有剩余权限，删除条目
    if (entry.permissions.length === 0) {
      taskAcl.delete(workerId);
    } else {
      entry.updatedAt = Date.now();
    }
    
    if (this.verbose) {
      console.log(`[AccessControl] 撤销权限：${workerId} -> [${permissions.join(', ')}] (任务：${taskId})`);
    }
    
    return true;
  }
  
  /**
   * 检查权限
   * @param {string} taskId - 任务 ID
   * @param {string} workerId - Worker ID
   * @param {string} permission - 要检查的权限
   * @returns {boolean} 是否有权限
   */
  hasPermission(taskId, workerId, permission) {
    const taskAcl = this.acls.get(taskId);
    if (!taskAcl) {
      // 任务不存在，拒绝访问
      return false;
    }
    
    const entry = taskAcl.get(workerId);
    if (!entry) {
      // 没有 ACL 条目，使用默认权限
      return this.defaultPermissions.includes(permission);
    }
    
    // 检查是否过期
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      if (this.verbose) {
        console.log(`[AccessControl] 权限已过期：${workerId} (任务：${taskId})`);
      }
      taskAcl.delete(workerId);
      return false;
    }
    
    const hasPerm = entry.permissions.includes(permission);
    
    if (this.verbose && !hasPerm) {
      console.log(`[AccessControl] 权限拒绝：${workerId} 需要 ${permission} (任务：${taskId})`);
    }
    
    return hasPerm;
  }
  
  /**
   * 检查是否有任一权限
   * @param {string} taskId - 任务 ID
   * @param {string} workerId - Worker ID
   * @param {string[]} permissions - 权限列表
   * @returns {boolean} 是否有任一权限
   */
  hasAnyPermission(taskId, workerId, permissions) {
    return permissions.some(p => this.hasPermission(taskId, workerId, p));
  }
  
  /**
   * 检查是否有所有权限
   * @param {string} taskId - 任务 ID
   * @param {string} workerId - Worker ID
   * @param {string[]} permissions - 权限列表
   * @returns {boolean} 是否有所有权限
   */
  hasAllPermissions(taskId, workerId, permissions) {
    return permissions.every(p => this.hasPermission(taskId, workerId, p));
  }
  
  /**
   * 获取 Worker 的所有权限
   * @param {string} taskId - 任务 ID
   * @param {string} workerId - Worker ID
   * @returns {string[]} 权限列表
   */
  getWorkerPermissions(taskId, workerId) {
    const taskAcl = this.acls.get(taskId);
    if (!taskAcl) return this.defaultPermissions;
    
    const entry = taskAcl.get(workerId);
    if (!entry) return this.defaultPermissions;
    
    // 检查是否过期
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      taskAcl.delete(workerId);
      return this.defaultPermissions;
    }
    
    return [...entry.permissions];
  }
  
  /**
   * 获取任务的所有 ACL 条目
   * @param {string} taskId - 任务 ID
   * @returns {ACLEntry[]} ACL 条目列表
   */
  getTaskAcl(taskId) {
    const taskAcl = this.acls.get(taskId);
    if (!taskAcl) return [];
    return Array.from(taskAcl.values());
  }
  
  /**
   * 清理过期的 ACL 条目
   * @param {string} taskId - 任务 ID
   * @returns {number} 清理的条目数
   */
  cleanupExpired(taskId) {
    const taskAcl = this.acls.get(taskId);
    if (!taskAcl) return 0;
    
    let count = 0;
    const now = Date.now();
    
    for (const [workerId, entry] of taskAcl.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        taskAcl.delete(workerId);
        count++;
      }
    }
    
    if (count > 0 && this.verbose) {
      console.log(`[AccessControl] 清理 ${count} 个过期 ACL 条目 (任务：${taskId})`);
    }
    
    return count;
  }
  
  /**
   * 导出 ACL 为 JSON
   * @param {string} taskId - 任务 ID
   * @returns {Object} ACL 数据
   */
  exportJSON(taskId) {
    const taskAcl = this.acls.get(taskId);
    if (!taskAcl) return null;
    
    return {
      taskId,
      entries: Array.from(taskAcl.values()),
      exportedAt: new Date().toISOString()
    };
  }
}

/**
 * 权限验证装饰器（P1 新增）
 * @param {AccessControlManager} accessControl - 访问控制管理器
 * @param {string} taskId - 任务 ID
 * @param {string} requiredPermission - 需要的权限
 * @returns {Function} 包装后的函数
 * 
 * @example
 * ```javascript
 * this.shareWith = requirePermission(accessControl, taskId, 'share')(
 *   async function(targetWorkerId, keys) {
 *     // 共享逻辑
 *   }
 * );
 * ```
 */
function requirePermission(accessControl, taskId, requiredPermission) {
  return function(targetFn) {
    return async function(...args) {
      // 第一个参数通常是 workerId 或 targetWorkerId
      const workerId = args[0];
      
      if (!accessControl.hasPermission(taskId, workerId, requiredPermission)) {
        throw new Error(
          `权限拒绝：Worker ${workerId} 需要 ${requiredPermission} 权限来执行此操作`
        );
      }
      
      return await targetFn.apply(this, args);
    };
  };
}

// 导出
module.exports = {
  PermissionLevel,
  AccessControlManager,
  requirePermission
};

// CLI 测试
if (require.main === module) {
  console.log('=== 权限控制系统测试 ===\n');
  
  const acm = new AccessControlManager({ verbose: true });
  
  // 测试 1: 初始化
  console.log('测试 1: 初始化 ACL');
  acm.initialize('task-001', 'worker-owner');
  console.log();
  
  // 测试 2: 所有者权限
  console.log('测试 2: 检查所有者权限');
  console.log(`worker-owner 有 admin 权限：${acm.hasPermission('task-001', 'worker-owner', 'admin')}`);
  console.log(`worker-owner 有 read 权限：${acm.hasPermission('task-001', 'worker-owner', 'read')}`);
  console.log();
  
  // 测试 3: 授予权限
  console.log('测试 3: 授予权限');
  acm.grantPermission('task-001', 'worker-collaborator', ['read', 'write'], 'worker-owner');
  console.log(`worker-collaborator 有 read 权限：${acm.hasPermission('task-001', 'worker-collaborator', 'read')}`);
  console.log(`worker-collaborator 有 write 权限：${acm.hasPermission('task-001', 'worker-collaborator', 'write')}`);
  console.log(`worker-collaborator 有 share 权限：${acm.hasPermission('task-001', 'worker-collaborator', 'share')}`);
  console.log();
  
  // 测试 4: 撤销权限
  console.log('测试 4: 撤销权限');
  acm.revokePermission('task-001', 'worker-collaborator', ['write']);
  console.log(`worker-collaborator 有 write 权限（撤销后）：${acm.hasPermission('task-001', 'worker-collaborator', 'write')}`);
  console.log();
  
  // 测试 5: 权限过期
  console.log('测试 5: 权限过期');
  const expiresAt = Date.now() + 1000; // 1 秒后过期
  acm.grantPermission('task-001', 'worker-temp', ['read'], 'worker-owner', expiresAt);
  console.log(`worker-temp 有 read 权限：${acm.hasPermission('task-001', 'worker-temp', 'read')}`);
  
  setTimeout(() => {
    console.log(`worker-temp 有 read 权限（过期后）：${acm.hasPermission('task-001', 'worker-temp', 'read')}`);
  }, 1500);
}
