#!/usr/bin/env node

/**
 * Orchestra GroupManager - 分组管理器
 * 
 * 功能：
 * - 加载和管理 Agent 分组配置
 * - 组内状态汇总
 * - 组长负责制
 * - 组间协作支持
 * - Dashboard 分组视图数据支持
 * 
 * @version 1.0.0
 * @author Orchestra Team
 */

const fs = require('fs');
const path = require('path');

// 分组配置目录
const GROUPS_DIR = path.join(__dirname, 'groups');

/**
 * 分组类
 */
class Group {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.description = config.description || '';
    this.lead = config.lead;
    this.agents = config.agents || [];
    this.color = config.color || '#9E9E9E';
    this.icon = config.icon || '📦';
    this.state = {
      status: 'idle',           // idle | working | blocked | completed
      progress: 0,              // 0-100
      activeAgents: 0,          // 正在工作的 Agent 数量
      totalTasks: 0,            // 总任务数
      completedTasks: 0,        // 已完成任务数
      lastUpdate: Date.now()    // 最后更新时间
    };
  }

  /**
   * 更新组状态
   */
  updateState(agentStates) {
    const groupAgents = this.agents;
    const relevantStates = agentStates.filter(s => 
      groupAgents.includes(s.name) || groupAgents.includes(s.id)
    );

    this.state.activeAgents = relevantStates.filter(s => s.status === 'running').length;
    this.state.totalTasks = relevantStates.length;
    this.state.completedTasks = relevantStates.filter(s => s.status === 'completed').length;
    
    // 计算进度
    if (this.state.totalTasks > 0) {
      this.state.progress = Math.round((this.state.completedTasks / this.state.totalTasks) * 100);
    } else {
      this.state.progress = 0;
    }

    // 确定组状态
    if (this.state.completedTasks === this.state.totalTasks && this.state.totalTasks > 0) {
      this.state.status = 'completed';
    } else if (relevantStates.some(s => s.status === 'failed')) {
      this.state.status = 'blocked';
    } else if (this.state.activeAgents > 0) {
      this.state.status = 'working';
    } else {
      this.state.status = 'idle';
    }

    this.state.lastUpdate = Date.now();
  }

  /**
   * 获取组长信息
   */
  getLead() {
    return {
      name: this.lead,
      isLead: true
    };
  }

  /**
   * 获取组统计信息
   */
  getStats() {
    return {
      groupId: this.id,
      groupName: this.name,
      totalAgents: this.agents.length,
      activeAgents: this.state.activeAgents,
      progress: this.state.progress,
      status: this.state.status,
      completedTasks: this.state.completedTasks,
      totalTasks: this.state.totalTasks
    };
  }

  /**
   * 转换为 JSON
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      lead: this.lead,
      agents: this.agents,
      color: this.color,
      icon: this.icon,
      state: this.state,
      stats: this.getStats()
    };
  }
}

/**
 * 分组管理器
 */
class GroupManager {
  constructor() {
    this.groups = new Map();
    this.configPath = GROUPS_DIR;
    this.loadGroups();
  }

  /**
   * 加载所有分组配置
   */
  loadGroups() {
    try {
      if (!fs.existsSync(this.configPath)) {
        console.warn('[GroupManager] 分组配置目录不存在:', this.configPath);
        return;
      }

      const files = fs.readdirSync(this.configPath).filter(f => f.endsWith('.json'));
      
      for (const file of files) {
        const filePath = path.join(this.configPath, file);
        try {
          const config = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          const group = new Group(config);
          this.groups.set(group.id, group);
          console.log(`[GroupManager] 加载分组：${group.name} (${group.agents.length}个Agent)`);
        } catch (err) {
          console.error(`[GroupManager] 加载分组配置失败 ${file}:`, err.message);
        }
      }

      console.log(`[GroupManager] 已加载 ${this.groups.size} 个分组`);
    } catch (err) {
      console.error('[GroupManager] 加载分组失败:', err.message);
    }
  }

  /**
   * 添加分组
   */
  addGroup(config) {
    const group = new Group(config);
    this.groups.set(group.id, group);
    
    // 保存到文件
    const filePath = path.join(this.configPath, `${group.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');
    
    console.log(`[GroupManager] 添加分组：${group.name}`);
    return group;
  }

  /**
   * 获取分组
   */
  getGroup(groupId) {
    return this.groups.get(groupId);
  }

  /**
   * 获取所有分组
   */
  getAllGroups() {
    return Array.from(this.groups.values());
  }

  /**
   * 根据 Agent 名称查找所属分组
   */
  findGroupByAgent(agentName) {
    for (const group of this.groups.values()) {
      if (group.agents.includes(agentName)) {
        return group;
      }
    }
    return null;
  }

  /**
   * 更新组状态（批量）
   */
  updateGroupStates(agentStates) {
    for (const group of this.groups.values()) {
      group.updateState(agentStates);
    }
  }

  /**
   * 获取组内状态汇总
   */
  getGroupSummary(groupId) {
    const group = this.groups.get(groupId);
    if (!group) {
      return null;
    }

    return {
      groupId: group.id,
      groupName: group.name,
      lead: group.getLead(),
      stats: group.getStats(),
      agents: group.agents.map(name => ({
        name,
        isLead: name === group.lead
      })),
      state: group.state
    };
  }

  /**
   * 获取所有组状态汇总（用于 Dashboard）
   */
  getAllGroupsSummary(agentStates = []) {
    // 如果有传入 agentStates，先更新状态
    if (agentStates.length > 0) {
      this.updateGroupStates(agentStates);
    }

    const summaries = [];
    for (const group of this.groups.values()) {
      summaries.push(group.toJSON());
    }

    // 按状态排序：working > blocked > idle > completed
    summaries.sort((a, b) => {
      const order = { working: 0, blocked: 1, idle: 2, completed: 3 };
      return order[a.state.status] - order[b.state.status];
    });

    return {
      totalGroups: summaries.length,
      workingGroups: summaries.filter(g => g.state.status === 'working').length,
      blockedGroups: summaries.filter(g => g.state.status === 'blocked').length,
      completedGroups: summaries.filter(g => g.state.status === 'completed').length,
      groups: summaries
    };
  }

  /**
   * 获取组间协作信息
   */
  getCollaborationInfo() {
    const collaborations = [];
    const groups = Array.from(this.groups.values());

    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const g1 = groups[i];
        const g2 = groups[j];
        
        // 如果两个组都在工作中，可能需要协作
        if (g1.state.status === 'working' && g2.state.status === 'working') {
          collaborations.push({
            group1: { id: g1.id, name: g1.name, lead: g1.lead },
            group2: { id: g2.id, name: g2.name, lead: g2.lead },
            reason: '两组同时在工作中，可能需要协作'
          });
        }
      }
    }

    return collaborations;
  }

  /**
   * 导出分组配置（用于备份或迁移）
   */
  exportConfig() {
    const config = {};
    for (const [id, group] of this.groups.entries()) {
      config[id] = {
        id: group.id,
        name: group.name,
        description: group.description,
        lead: group.lead,
        agents: group.agents,
        color: group.color,
        icon: group.icon
      };
    }
    return config;
  }

  /**
   * 导入分组配置
   */
  importConfig(config) {
    for (const [id, groupConfig] of Object.entries(config)) {
      this.addGroup(groupConfig);
    }
    console.log(`[GroupManager] 导入 ${Object.keys(config).length} 个分组`);
  }
}

// 创建单例实例
const groupManager = new GroupManager();

// 导出
module.exports = {
  Group,
  GroupManager,
  groupManager,
  GROUPS_DIR
};

// 如果直接运行，显示分组信息
if (require.main === module) {
  console.log('\n=== Orchestra 分组管理系统 ===\n');
  
  const summary = groupManager.getAllGroupsSummary();
  console.log(`总分组数：${summary.totalGroups}`);
  console.log(`工作中：${summary.workingGroups}`);
  console.log(`阻塞：${summary.blockedGroups}`);
  console.log(`已完成：${summary.completedGroups}`);
  console.log('\n分组列表:');
  
  for (const group of summary.groups) {
    console.log(`\n${group.icon} ${group.name} (${group.id})`);
    console.log(`  组长：${group.lead}`);
    console.log(`  Agent 数量：${group.agents.length}`);
    console.log(`  状态：${group.state.status}`);
    console.log(`  进度：${group.state.progress}%`);
    console.log(`  颜色：${group.color}`);
  }

  const collaborations = groupManager.getCollaborationInfo();
  if (collaborations.length > 0) {
    console.log('\n组间协作:');
    for (const collab of collaborations) {
      console.log(`  ${collab.group1.name} ↔ ${collab.group2.name}: ${collab.reason}`);
    }
  }
}
