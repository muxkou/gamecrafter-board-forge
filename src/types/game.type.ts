export interface GameState {
  phase: string;
  turn: number;
  seats: string[];
  active_seat: string | null;
  vars: Record<string, unknown>;
  per_seat: Record<string, Record<string, unknown>>;
  entities: Record<string, {
    entity_type: string;
    props: Record<string, unknown>;
    tags?: string[];
  }>;
  zones: Record<string, unknown>;
  rng_state: string;
  meta: {
    schema_version: number;
    created_at?: number;
    last_seq: number;
    next_eid: number;
  };
}

// 动作
export interface Action { 
  // 动作名（如 "play_card"）。
  id: string; 
  // 发起方（系统/玩家/模拟器）。
  by: string | "system"; 
  // 动作参数（仅包含 ID/索引/标量，不允许随机种子/时间）。
  payload: unknown; 
  // 去重序号
  seq: number; 
  // 便于调试（如策略名、测试用例编号），不影响确定性。[可选]
  trace?: string 
}

// 事件
export interface Event { 
  // 运行 ID（可选）
  run_id?: string; 
  // 去重序号
  seq: number; 
  // 同 Action
  by: string | "system"; 
  // 同 Action
  id: string; 
  // 同 Action
  payload: unknown; 
  // 可直接用 seq；也可存壁钟时间 tsWall 供观战 UI
  ts_logical: number; 
  // 便于一致性校验 [可选]
  state_hash?: string 
}

// 错误
export interface EngineError { code: string; message: string; details?: unknown }