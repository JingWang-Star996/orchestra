-- Orchestra ML Optimizer - 数据库表结构
-- SQLite 格式

-- ============================================================
-- 决策历史表 - 存储所有决策记录
-- ============================================================
CREATE TABLE IF NOT EXISTS decision_history (
  -- 基础信息
  id TEXT PRIMARY KEY,                          -- 决策唯一标识 (UUID)
  timestamp INTEGER NOT NULL,                   -- 决策时间戳 (毫秒)
  session_id TEXT,                              -- 会话 ID
  
  -- 上下文信息
  active_task_id TEXT,                          -- 当前任务 ID (可选)
  message_source TEXT NOT NULL,                 -- 消息来源 (chat/memory/tool 等)
  time_of_day INTEGER NOT NULL,                 -- 时间段 (0-23)
  day_of_week INTEGER NOT NULL,                 -- 星期 (0-6, 0=周日)
  user_id TEXT,                                 -- 用户 ID (可选，用于分桶)
  
  -- 原始评分 (0-1)
  score_context_overlap REAL NOT NULL,          -- 上下文重叠分
  score_task_continuity REAL NOT NULL,          -- 任务连续性分
  score_efficiency REAL NOT NULL,               -- 效率分
  
  -- 使用的权重 (0-1, 总和为 1)
  weight_context_overlap REAL NOT NULL,         -- contextOverlap 权重
  weight_task_continuity REAL NOT NULL,         -- taskContinuity 权重
  weight_efficiency REAL NOT NULL,              -- efficiency 权重
  
  -- 决策结果
  final_score REAL NOT NULL,                    -- 加权总分
  selected_model TEXT NOT NULL,                 -- 选中的模型 ID
  all_candidates TEXT,                          -- 所有候选模型 (JSON 数组)
  
  -- 执行结果 (决策后填充)
  outcome_success INTEGER,                      -- 是否成功 (1=成功，0=失败)
  outcome_satisfaction REAL,                    -- 用户满意度 (1-5)
  outcome_execution_time REAL,                  -- 执行时间 (ms)
  outcome_error TEXT,                           -- 错误信息
  
  -- 反馈信息 (可选)
  feedback_type TEXT,                           -- feedback/implicit
  feedback_source TEXT,                         -- user_rating/completion/timeout/error
  feedback_value REAL,                          -- 标准化评分 (0-1)
  feedback_timestamp INTEGER,                   -- 反馈时间戳
  feedback_comment TEXT,                        -- 反馈备注
  
  -- 元数据
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- ============================================================
-- 索引 - 优化查询性能
-- ============================================================

-- 时间范围查询（最常用）
CREATE INDEX IF NOT EXISTS idx_decision_timestamp 
ON decision_history(timestamp DESC);

-- 按任务 ID 查询（追踪特定任务的决策）
CREATE INDEX IF NOT EXISTS idx_decision_task_id 
ON decision_history(active_task_id) 
WHERE active_task_id IS NOT NULL;

-- 按成功状态查询（统计成功率）
CREATE INDEX IF NOT EXISTS idx_decision_success 
ON decision_history(outcome_success) 
WHERE outcome_success IS NOT NULL;

-- 按模型查询（分析各模型表现）
CREATE INDEX IF NOT EXISTS idx_decision_model 
ON decision_history(selected_model);

-- 复合索引：时间 + 成功状态（常用组合查询）
CREATE INDEX IF NOT EXISTS idx_decision_timestamp_success 
ON decision_history(timestamp DESC, outcome_success) 
WHERE outcome_success IS NOT NULL;

-- ============================================================
-- A/B 测试表 - 实验配置与结果
-- ============================================================
CREATE TABLE IF NOT EXISTS ab_experiments (
  id TEXT PRIMARY KEY,                          -- 实验唯一标识
  name TEXT NOT NULL,                           -- 实验名称
  description TEXT,                             -- 实验描述
  
  -- 状态
  status TEXT NOT NULL DEFAULT 'draft',         -- draft/running/completed/paused
  start_date INTEGER,                           -- 开始时间
  end_date INTEGER,                             -- 结束时间
  
  -- 变体配置 (JSON)
  variants_config TEXT NOT NULL,                -- 变体配置 JSON
  
  -- 流量分配
  traffic_allocation TEXT,                      -- 流量分配 JSON
  
  -- 实验参数
  min_sample_size INTEGER DEFAULT 100,          -- 最小样本数
  confidence_level REAL DEFAULT 0.95,           -- 置信水平
  
  -- 结果指标 (JSON)
  metrics TEXT,                                 -- 实验结果指标 JSON
  
  -- 元数据
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  created_by TEXT                               -- 创建者
);

-- ============================================================
-- 权重快照表 - 记录权重变化历史
-- ============================================================
CREATE TABLE IF NOT EXISTS weight_snapshots (
  id TEXT PRIMARY KEY,                          -- 快照 ID
  timestamp INTEGER NOT NULL,                   -- 快照时间
  
  -- 权重值
  weight_context_overlap REAL NOT NULL,
  weight_task_continuity REAL NOT NULL,
  weight_efficiency REAL NOT NULL,
  
  -- 统计信息
  sample_count INTEGER NOT NULL,                -- 样本数量
  success_rate REAL,                            -- 成功率
  avg_feedback_score REAL,                      -- 平均反馈评分
  
  -- 变化原因
  change_reason TEXT,                           -- 变化原因 (scheduled/manual/ab_test)
  previous_snapshot_id TEXT,                    -- 上一个快照 ID
  
  -- 元数据
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- ============================================================
-- 反馈记录表 - 独立存储反馈（可选，用于详细分析）
-- ============================================================
CREATE TABLE IF NOT EXISTS feedback_records (
  id TEXT PRIMARY KEY,                          -- 反馈 ID
  decision_id TEXT NOT NULL,                    -- 关联的决策 ID
  timestamp INTEGER NOT NULL,                   -- 反馈时间
  
  -- 反馈内容
  type TEXT NOT NULL,                           -- explicit/implicit
  source TEXT NOT NULL,                         -- user_rating/completion/timeout/error
  value REAL NOT NULL,                          -- 标准化评分 (0-1)
  comment TEXT,                                 -- 备注
  
  -- 元数据
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  
  FOREIGN KEY (decision_id) REFERENCES decision_history(id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_decision_id 
ON feedback_records(decision_id);

CREATE INDEX IF NOT EXISTS idx_feedback_timestamp 
ON feedback_records(timestamp DESC);

-- ============================================================
-- 视图 - 常用查询
-- ============================================================

-- 最近 24 小时决策统计
CREATE VIEW IF NOT EXISTS v_last_24h_stats AS
SELECT 
  COUNT(*) as total_decisions,
  SUM(CASE WHEN outcome_success = 1 THEN 1 ELSE 0 END) as successful_decisions,
  ROUND(
    100.0 * SUM(CASE WHEN outcome_success = 1 THEN 1 ELSE 0 END) / COUNT(*),
    2
  ) as success_rate_percent,
  ROUND(AVG(feedback_value), 3) as avg_feedback_score,
  ROUND(AVG(outcome_execution_time), 2) as avg_execution_time_ms
FROM decision_history
WHERE timestamp >= (strftime('%s', 'now') - 86400) * 1000
  AND outcome_success IS NOT NULL;

-- 各模型表现统计
CREATE VIEW IF NOT EXISTS v_model_performance AS
SELECT 
  selected_model,
  COUNT(*) as decision_count,
  ROUND(
    100.0 * SUM(CASE WHEN outcome_success = 1 THEN 1 ELSE 0 END) / COUNT(*),
    2
  ) as success_rate_percent,
  ROUND(AVG(feedback_value), 3) as avg_feedback_score,
  ROUND(AVG(outcome_execution_time), 2) as avg_execution_time_ms
FROM decision_history
WHERE outcome_success IS NOT NULL
GROUP BY selected_model
ORDER BY decision_count DESC;

-- 权重变化趋势（按天）
CREATE VIEW IF NOT EXISTS v_weight_trend AS
SELECT 
  DATE(timestamp / 1000, 'unixepoch') as date,
  ROUND(AVG(weight_context_overlap), 3) as avg_context_overlap,
  ROUND(AVG(weight_task_continuity), 3) as avg_task_continuity,
  ROUND(AVG(weight_efficiency), 3) as avg_efficiency,
  COUNT(*) as decision_count
FROM decision_history
GROUP BY DATE(timestamp / 1000, 'unixepoch')
ORDER BY date DESC
LIMIT 30;

-- ============================================================
-- 数据清理 - 保留策略
-- ============================================================

-- 清理超过 30 天的数据（保留最近 10000 条）
-- 建议通过定时任务执行
-- DELETE FROM decision_history 
-- WHERE timestamp < (strftime('%s', 'now') - 2592000) * 1000
--   AND id NOT IN (
--     SELECT id FROM decision_history 
--     ORDER BY timestamp DESC 
--     LIMIT 10000
--   );

-- ============================================================
-- 初始数据 - 基础权重快照
-- ============================================================

INSERT OR IGNORE INTO weight_snapshots (
  id, timestamp,
  weight_context_overlap, weight_task_continuity, weight_efficiency,
  sample_count, change_reason
) VALUES (
  'init-001',
  strftime('%s', 'now') * 1000,
  0.4, 0.4, 0.2,
  0, 'initial'
);
