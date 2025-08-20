import { Action, EngineError, GameState } from "../types";

export async function end_turn(game_state: GameState, action: Action): Promise<GameState> {
  const seats = game_state.seats;
  // 当前席位在 seats 中的索引（若 active_seat 为 null，则回退 seats[0]）
  const idx = seats.indexOf(game_state.active_seat ?? seats[0]);
  // 下一个席位（循环取模）
  const next_seat = seats[(idx + 1) % seats.length];

  // 计算是否整圈轮回（从最后一个席位走到第一个席位 → 回合数自增）
  const next_turn = game_state.turn + (idx + 1 >= seats.length ? 1 : 0);

  // 产生下一状态：只更新 active_seat / turn / meta.last_seq
  const next: GameState = {
    ...game_state,
    active_seat: next_seat,
    turn: next_turn,
    meta: { ...game_state.meta, last_seq: action.seq }
  };

  return next;
}


// --- move_top：把源区“顶”的 N 张实体移到目标区“顶” ---
// 统一把 top 视为数组尾部
// payload: {
//   from_zone: string; 
//   to_zone: string;
//   from_owner?: "by" | "active" | string;  // 缺省 "by"
//   to_owner?: "by" | "active" | string;    // 缺省 "by"
//   count?: number;                          // 缺省 1，必须 > 0 的整数
// }
// owner 解析顺序："by" ⇒ action.by；"active" ⇒ state.active_seat；否则当作具体 seat_id。
// count 缺省视为 1；必须 >0 且 Number.isInteger
export async function move_top(
  game_state: GameState, 
  action: Action, 
  err: (code: string, message: string, details?: unknown) => EngineError
): Promise<GameState | EngineError> {
  // 1) 读取与规范化载荷
  const p = (action as any).payload ?? {};
  const from_zone: string = String(p.from_zone ?? "");
  const to_zone: string   = String(p.to_zone   ?? "");
  const count: number     = p.count === null ? 1 : Number(p.count);

  // 基本字段校验
  if (!from_zone || !to_zone) {
    return err("BAD_PAYLOAD", "from_zone/to_zone is required");
  }
  if (!Number.isInteger(count) || count <= 0) {
    return err("COUNT_INVALID", "count must be a positive integer", { count });
  }

  // owner 解析辅助：支持 "by"（动作发起人）与 "active"（当前行动席位）
  const resolve_owner = (raw: string | undefined): string | null => {
    if (!raw || raw === "by") return action.by ?? null;
    if (raw === "active")     return game_state.active_seat ?? null;
    return String(raw);
  };

  const from_owner_raw: string | undefined = p.from_owner ?? "by";
  const to_owner_raw:   string | undefined = p.to_owner   ?? "by";
  const from_owner = resolve_owner(from_owner_raw);
  const to_owner   = resolve_owner(to_owner_raw);

  if (!from_owner || !to_owner) {
    return err("OWNER_RESOLVE_FAILED", "cannot resolve from_owner/to_owner", { from_owner_raw, to_owner_raw });
  }

  // 禁止同一实例自搬（避免多张时产生顺序副作用）
  if (from_zone === to_zone && from_owner === to_owner) {
    return err("SAME_SOURCE_AND_TARGET", "source equals target (zone+owner)");
  }

  // 2) 取源/目标实例
  const zones: any = game_state.zones as any;
  const zr_from = zones[from_zone];
  const zr_to = zones[to_zone];
  if (!zr_from) return err("ZONE_NOT_FOUND", `from_zone '${from_zone}' not found`);
  if (!zr_to)  return err("ZONE_NOT_FOUND", `to_zone '${to_zone}' not found`);

  const inst_from = zr_from.instances?.[from_owner];
  const inst_to = zr_to.instances?.[to_owner];
  if (!inst_from) return err("OWNER_INSTANCE_NOT_FOUND", `owner '${from_owner}' not found in zone '${from_zone}'`);
  if (!inst_to)   return err("OWNER_INSTANCE_NOT_FOUND", `owner '${to_owner}' not found in zone '${to_zone}'`);

  // 3) 容器类型校验：只允许 list/stack/queue，且都要求有 items[]
  const supported = (k: string) => k === "list" || k === "stack" || k === "queue";
  if (!supported(inst_from.kind) || !Array.isArray(inst_from.items)) {
    return err("KIND_UNSUPPORTED", `from_zone kind '${inst_from.kind}' not supported by move_top`);
  }
  if (!supported(inst_to.kind) || !Array.isArray(inst_to.items)) {
    return err("KIND_UNSUPPORTED", `to_zone kind '${inst_to.kind}' not supported by move_top`);
  }

  // 4) 资源与容量校验
  if (inst_from.items.length < count) {
    return err("INSUFFICIENT_SOURCE", `need ${count}, have ${inst_from.items.length}`, { from_zone, from_owner });
  }
  const cap: number | undefined = zr_to.capacity;
  if (typeof cap === "number" && inst_to.items.length + count > cap) {
    return err("CAPACITY_EXCEEDED", `would exceed capacity ${cap}`, {
      to_zone, to_owner, have: inst_to.items.length, add: count
    });
  }

  // 5) 纯函数式地构造 next_state（只拷贝受影响的分支）
  const next: GameState = {
    ...game_state,
    zones: { ...game_state.zones },
    meta: { ...game_state.meta, last_seq: action.seq }
  };

  // 深拷贝受影响的两个 zone 与两个实例（最小必要拷贝，减少 GC 压力）
  const next_from_zone = { ...zr_from, instances: { ...zr_from.instances } };
  const next_to_zone   = { ...zr_to,   instances: { ...zr_to.instances } };

  const from_items: string[] = [...inst_from.items];
  const to_items:   string[] = [...inst_to.items];

  // 统一把 top 视为数组尾部：
  // pop from tail → push to tail
  for (let i = 0; i < count; i++) {
    const eid = from_items.pop() as string; // 前面已保证足够，断言非空
    to_items.push(eid);
  }

  next_from_zone.instances[from_owner] = { ...inst_from, items: from_items };
  next_to_zone.instances[to_owner]     = { ...inst_to,   items: to_items };
  (next.zones as any)[from_zone] = next_from_zone;
  (next.zones as any)[to_zone]   = next_to_zone;

  return next;
}