/**
 * Orchestra ML Optimizer - 数据访问层
 * 
 * 负责决策历史、权重快照、A/B 测试数据的持久化
 */

import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';

// ============================================================
// 类型定义
// ============================================================

export interface DecisionRecord {
  id: string;
  timestamp: number;
  sessionId?: string;
  activeTaskId?: string;
  messageSource: string;
  timeOfDay: number;
  dayOfWeek: number;
  userId?: string;
  
  // 评分
  scoreContextOverlap: number;
  scoreTaskContinuity: number;
  scoreEfficiency: number;
  
  // 权重
  weightContextOverlap: number;
  weightTaskContinuity: number;
  weightEfficiency: number;
  
  // 决策结果
  finalScore: number;
  selectedModel: string;
  allCandidates?: string; // JSON
  
  // 执行结果
  outcomeSuccess?: boolean;
  outcomeSatisfaction?: number;
  outcomeExecutionTime?: number;
  outcomeError?: string;
  
  // 反馈
  feedbackType?: 'explicit' | 'implicit';
  feedbackSource?: 'user_rating' | 'completion' | 'timeout' | 'error';
  feedbackValue?: number;
  feedbackTimestamp?: number;
  feedbackComment?: string;
}

export interface WeightSnapshot {
  id: string;
  timestamp: number;
  weightContextOverlap: number;
  weightTaskContinuity: number;
  weightEfficiency: number;
  sampleCount: number;
  successRate?: number;
  avgFeedbackScore?: number;
  changeReason: 'scheduled' | 'manual' | 'ab_test' | 'initial';
  previousSnapshotId?: string;
}

export interface ABExperiment {
  id: string;
  name: string;
  description?: string;
  status: 'draft' | 'running' | 'completed' | 'paused';
  startDate?: number;
  endDate?: number;
  variantsConfig: any;
  trafficAllocation?: any;
  minSampleSize: number;
  confidenceLevel: number;
  metrics?: any;
}

export interface DecisionStats {
  totalDecisions: number;
  successfulDecisions: number;
  successRatePercent: number;
  avgFeedbackScore: number;
  avgExecutionTimeMs: number;
}

export interface ModelPerformance {
  selectedModel: string;
  decisionCount: number;
  successRatePercent: number;
  avgFeedbackScore: number;
  avgExecutionTimeMs: number;
}

// ============================================================
// 仓储类
// ============================================================

export class DecisionHistoryRepository {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(process.cwd(), 'data', 'ml-optimizer.db');
    
    // 确保目录存在
    const fs = require('fs');
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL'); // 优化并发性能
    this.initializeSchema();
  }

  /**
   * 初始化数据库表结构
   */
  private initializeSchema() {
    const fs = require('fs');
    const schemaPath = path.join(__dirname, 'schema.sql');
    
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf-8');
      this.db.exec(schema);
    }
  }

  // ============================================================
  // 决策历史 CRUD
  // ============================================================

  /**
   * 保存决策记录
   */
  saveDecision(record: DecisionRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO decision_history (
        id, timestamp, session_id, active_task_id, message_source,
        time_of_day, day_of_week, user_id,
        score_context_overlap, score_task_continuity, score_efficiency,
        weight_context_overlap, weight_task_continuity, weight_efficiency,
        final_score, selected_model, all_candidates,
        outcome_success, outcome_satisfaction, outcome_execution_time, outcome_error,
        feedback_type, feedback_source, feedback_value, feedback_timestamp, feedback_comment
      ) VALUES (
        @id, @timestamp, @sessionId, @activeTaskId, @messageSource,
        @timeOfDay, @dayOfWeek, @userId,
        @scoreContextOverlap, @scoreTaskContinuity, @scoreEfficiency,
        @weightContextOverlap, @weightTaskContinuity, @weightEfficiency,
        @finalScore, @selectedModel, @allCandidates,
        @outcomeSuccess, @outcomeSatisfaction, @outcomeExecutionTime, @outcomeError,
        @feedbackType, @feedbackSource, @feedbackValue, @feedbackTimestamp, @feedbackComment
      )
    `);

    stmt.run({
      id: record.id || uuidv4(),
      timestamp: record.timestamp,
      sessionId: record.sessionId,
      activeTaskId: record.activeTaskId,
      messageSource: record.messageSource,
      timeOfDay: record.timeOfDay,
      dayOfWeek: record.dayOfWeek,
      userId: record.userId,
      scoreContextOverlap: record.scoreContextOverlap,
      scoreTaskContinuity: record.scoreTaskContinuity,
      scoreEfficiency: record.scoreEfficiency,
      weightContextOverlap: record.weightContextOverlap,
      weightTaskContinuity: record.weightTaskContinuity,
      weightEfficiency: record.weightEfficiency,
      finalScore: record.finalScore,
      selectedModel: record.selectedModel,
      allCandidates: record.allCandidates,
      outcomeSuccess: record.outcomeSuccess ? 1 : 0,
      outcomeSatisfaction: record.outcomeSatisfaction,
      outcomeExecutionTime: record.outcomeExecutionTime,
      outcomeError: record.outcomeError,
      feedbackType: record.feedbackType,
      feedbackSource: record.feedbackSource,
      feedbackValue: record.feedbackValue,
      feedbackTimestamp: record.feedbackTimestamp,
      feedbackComment: record.feedbackComment
    });
  }

  /**
   * 更新决策结果（决策后调用）
   */
  updateOutcome(
    decisionId: string,
    outcome: {
      success: boolean;
      satisfaction?: number;
      executionTime?: number;
      error?: string;
    }
  ): void {
    const stmt = this.db.prepare(`
      UPDATE decision_history
      SET 
        outcome_success = @success,
        outcome_satisfaction = @satisfaction,
        outcome_execution_time = @executionTime,
        outcome_error = @error,
        updated_at = strftime('%s', 'now') * 1000
      WHERE id = @id
    `);

    stmt.run({
      id: decisionId,
      success: outcome.success ? 1 : 0,
      satisfaction: outcome.satisfaction,
      executionTime: outcome.executionTime,
      error: outcome.error
    });
  }

  /**
   * 添加反馈
   */
  addFeedback(
    decisionId: string,
    feedback: {
      type: 'explicit' | 'implicit';
      source: 'user_rating' | 'completion' | 'timeout' | 'error';
      value: number;
      comment?: string;
    }
  ): void {
    const stmt = this.db.prepare(`
      UPDATE decision_history
      SET 
        feedback_type = @type,
        feedback_source = @source,
        feedback_value = @value,
        feedback_comment = @comment,
        feedback_timestamp = strftime('%s', 'now') * 1000,
        updated_at = strftime('%s', 'now') * 1000
      WHERE id = @id
    `);

    stmt.run({
      id: decisionId,
      type: feedback.type,
      source: feedback.source,
      value: feedback.value,
      comment: feedback.comment
    });
  }

  /**
   * 获取最近的决策记录
   */
  getRecentDecisions(limit: number = 200): DecisionRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM decision_history
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(limit).map(this.rowToRecord);
  }

  /**
   * 获取指定时间范围内的决策记录
   */
  getDecisionsByTimeRange(
    startTime: number,
    endTime: number
  ): DecisionRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM decision_history
      WHERE timestamp BETWEEN ? AND ?
      ORDER BY timestamp DESC
    `);

    return stmt.all(startTime, endTime).map(this.rowToRecord);
  }

  /**
   * 获取成功的决策记录
   */
  getSuccessfulDecisions(limit: number = 100): DecisionRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM decision_history
      WHERE outcome_success = 1
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(limit).map(this.rowToRecord);
  }

  /**
   * 获取失败的决策记录
   */
  getFailedDecisions(limit: number = 100): DecisionRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM decision_history
      WHERE outcome_success = 0
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(limit).map(this.rowToRecord);
  }

  /**
   * 获取决策样本数量
   */
  getSampleCount(): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM decision_history
      WHERE outcome_success IS NOT NULL
    `);
    const result = stmt.get() as { count: number };
    return result.count;
  }

  /**
   * 获取最近 N 条记录（用于权重计算）
   */
  getRecentRecordsWithOutcome(limit: number = 200): DecisionRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM decision_history
      WHERE outcome_success IS NOT NULL
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(limit).map(this.rowToRecord);
  }

  // ============================================================
  // 统计查询
  // ============================================================

  /**
   * 获取最近 24 小时统计
   */
  getLast24hStats(): DecisionStats {
    const stmt = this.db.prepare(`
      SELECT 
        COUNT(*) as totalDecisions,
        SUM(CASE WHEN outcome_success = 1 THEN 1 ELSE 0 END) as successfulDecisions,
        ROUND(
          100.0 * SUM(CASE WHEN outcome_success = 1 THEN 1 ELSE 0 END) / COUNT(*),
          2
        ) as successRatePercent,
        ROUND(AVG(feedback_value), 3) as avgFeedbackScore,
        ROUND(AVG(outcome_execution_time), 2) as avgExecutionTimeMs
      FROM decision_history
      WHERE timestamp >= (strftime('%s', 'now') - 86400) * 1000
        AND outcome_success IS NOT NULL
    `);

    return stmt.get() as DecisionStats;
  }

  /**
   * 获取各模型表现统计
   */
  getModelPerformance(): ModelPerformance[] {
    const stmt = this.db.prepare(`
      SELECT 
        selected_model,
        COUNT(*) as decisionCount,
        ROUND(
          100.0 * SUM(CASE WHEN outcome_success = 1 THEN 1 ELSE 0 END) / COUNT(*),
          2
        ) as successRatePercent,
        ROUND(AVG(feedback_value), 3) as avgFeedbackScore,
        ROUND(AVG(outcome_execution_time), 2) as avgExecutionTimeMs
      FROM decision_history
      WHERE outcome_success IS NOT NULL
      GROUP BY selected_model
      ORDER BY decisionCount DESC
    `);

    return stmt.all() as ModelPerformance[];
  }

  /**
   * 获取成功率趋势（按天）
   */
  getSuccessRateTrend(days: number = 30): any[] {
    const stmt = this.db.prepare(`
      SELECT 
        DATE(timestamp / 1000, 'unixepoch') as date,
        COUNT(*) as decisionCount,
        ROUND(
          100.0 * SUM(CASE WHEN outcome_success = 1 THEN 1 ELSE 0 END) / COUNT(*),
          2
        ) as successRatePercent
      FROM decision_history
      WHERE outcome_success IS NOT NULL
      GROUP BY DATE(timestamp / 1000, 'unixepoch')
      ORDER BY date DESC
      LIMIT ?
    `);

    return stmt.all(days);
  }

  // ============================================================
  // 数据清理
  // ============================================================

  /**
   * 清理过期数据
   * 保留策略：最近 30 天 或 最近 10000 条
   */
  cleanupOldData(keepDays: number = 30, keepCount: number = 10000): number {
    const cutoffTime = (Date.now() - keepDays * 24 * 60 * 60 * 1000);
    
    const stmt = this.db.prepare(`
      DELETE FROM decision_history
      WHERE timestamp < ?
        AND id NOT IN (
          SELECT id FROM decision_history
          ORDER BY timestamp DESC
          LIMIT ?
        )
    `);

    const result = stmt.run(cutoffTime, keepCount);
    return result.changes;
  }

  /**
   * 清空所有数据（仅用于测试）
   */
  clearAll(): void {
    this.db.exec('DELETE FROM decision_history');
    this.db.exec('DELETE FROM weight_snapshots');
    this.db.exec('DELETE FROM ab_experiments');
    this.db.exec('DELETE FROM feedback_records');
  }

  // ============================================================
  // 工具方法
  // ============================================================

  private rowToRecord(row: any): DecisionRecord {
    return {
      id: row.id,
      timestamp: row.timestamp,
      sessionId: row.session_id,
      activeTaskId: row.active_task_id,
      messageSource: row.message_source,
      timeOfDay: row.time_of_day,
      dayOfWeek: row.day_of_week,
      userId: row.user_id,
      scoreContextOverlap: row.score_context_overlap,
      scoreTaskContinuity: row.score_task_continuity,
      scoreEfficiency: row.score_efficiency,
      weightContextOverlap: row.weight_context_overlap,
      weightTaskContinuity: row.weight_task_continuity,
      weightEfficiency: row.weight_efficiency,
      finalScore: row.final_score,
      selectedModel: row.selected_model,
      allCandidates: row.all_candidates,
      outcomeSuccess: row.outcome_success === 1,
      outcomeSatisfaction: row.outcome_satisfaction,
      outcomeExecutionTime: row.outcome_execution_time,
      outcomeError: row.outcome_error,
      feedbackType: row.feedback_type as 'explicit' | 'implicit',
      feedbackSource: row.feedback_source as any,
      feedbackValue: row.feedback_value,
      feedbackTimestamp: row.feedback_timestamp,
      feedbackComment: row.feedback_comment
    };
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    this.db.close();
  }
}

export default DecisionHistoryRepository;
