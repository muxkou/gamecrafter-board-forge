/**
 * legal_actions_compiled
 * ----------------------
 * 用途：基于编译产物（actions_index + zones_index），在不执行效果的前提下，
 *       静态枚举“可能合法”的动作调用（ActionCall）。
 * 特点：
 *  - 轻量近似：仅分析首个 move_top 节点的资源/容量是否可行；不逐步模拟整条 pipeline。
 *  - 支持 shuffle/deal/set_var 等无资源消耗的 op；若 pipeline 无 move_top，则直接认为可行。
 *  - owner 解析：支持 'by' | 'active' | 'seat'（占位）以及常量 seat_id 字符串。
 *  - count 枚举：生成 1..max 的分支，可通过 maxCountsPerAction 限制规模。
 * 适用：提示 UI、简单 AI、可行性预估；对强一致性要求的合法性，仍需在 step/step_compiled 路径校验。
 */
import { CompiledSpecType } from "../schema";
import { GameState } from "../types";

type Seats = string[];
type Scope = 'public' | 'per_seat';

type ZoneMeta = {
  scope: Scope;
  container: 'list' | 'stack' | 'queue' | string;
  capacity?: number | null; // 无/0/undefined 视为无限
};

type ZonesIndex = Record<string, ZoneMeta>;

type MoveTopOp = {
  op: 'move_top';
  from_zone: string;
  to_zone: string;
  // 与编译器/解释器对齐：既支持占位符，也兼容常量 seat_id 字符串
  from_owner: 'by' | 'active' | 'seat' | string;
  to_owner: 'by' | 'active' | 'seat' | string;
  count?: number;
};

type SpawnOp = {
  op: 'spawn';
  to_zone: string;
  owner: 'by' | 'active' | 'seat' | string;
  count?: number;
};

type DestroyOp = {
  op: 'destroy';
  from_zone: string;
  owner: 'by' | 'active' | 'seat' | string;
  count?: number;
};
type EffectPipelineOp = { op: 'move_top' | 'shuffle' | 'deal' | 'set_var' | 'spawn' | 'destroy' } & Record<string, unknown>;

type EffectDef = {
  action_hash: string;
  effect_pipeline: EffectPipelineOp[]; // 混合多种 op
};

type ActionsIndex = Record<string, EffectDef>;

// 将编译产物收敛为本方法需要的最小形状（并与实际产物字段名对齐：actions_index）
export type CompiledLike = Pick<CompiledSpecType, 'zones_index' | 'actions_index'> & {
  zones_index: ZonesIndex;
  actions_index: ActionsIndex;
};

export type ActionCall = {
  action: string;
  by: string;
  payload?: Record<string, unknown>;
};

/**
 * 将 seat 标准化为实例 key：public → '_'；per_seat → seat_id
 */
function inst_key(meta: ZoneMeta, seat: string): string {
  return meta.scope === 'public' ? '_' : seat;
}

/**
 * 读取实例 items 数量（不抛错，缺失视为 0）
 */
function getItemsLen(gs: GameState, zone: string, ownerKey: string): number {
  const items = (gs as any).zones?.[zone]?.instances?.[ownerKey]?.items;
  return Array.isArray(items) ? items.length : 0;
}

/**
 * 计算实例剩余容量（无限制 → Infinity）
 */
function capacityLeft(gs: GameState, meta: ZoneMeta, zone: string, ownerKey: string): number {
  const cap = meta.capacity ?? Infinity;
  if (!Number.isFinite(cap)) return Infinity;
  const cur = getItemsLen(gs, zone, ownerKey);
  return Math.max(0, cap - cur);
}

/**
 * owner 候选集合：
 *  - 'by' → [by]
 *  - 'active' → [active_seat]
 *  - 'seat' → 所有 seats（用于生成时枚举，调用时需写入 payload.seat）
 *  - seat_id 字符串 → [seat_id]
 */
function resolveOwnerCandidates(mode: 'by' | 'active' | 'seat' | string, by: string, gs: GameState, seats: Seats): string[] {
  if (mode === 'by') return [by];
  if (mode === 'active') return [gs.active_seat || ''];
  if (mode === 'seat') return seats;
  // 常量 seat_id
  return [String(mode)];
}

/**
 * 仅支持：所有 op 都是 move_top，且不跨 seat 解析以外的外部条件
 * 对于 count：生成 1..maxCount 的全部分支（可用 options 限制）
 */
export function legal_actions_compiled(args: {
  compiled_spec: CompiledLike;
  game_state: GameState;
  by: string;
  seats?: Seats;
  maxCountsPerAction?: number; // 限制 count 分支，默认生成完整 1..max
}) : ActionCall[] {

  const { compiled_spec, game_state, by, maxCountsPerAction } = args;
  const seats = args.seats ?? (game_state.seats as Seats);

  const out: ActionCall[] = [];
  const zones = compiled_spec.zones_index;
  const actions = compiled_spec.actions_index;

  for (const [name, def] of Object.entries(actions)) {
    const pipeline = def.effect_pipeline;
    if (!Array.isArray(pipeline) || pipeline.length === 0) continue;

    const supported = ['move_top', 'shuffle', 'deal', 'set_var', 'spawn', 'destroy'];
    if (pipeline.some(op => !supported.includes(op.op))) continue;

    // 找出首个涉及资源的 op（move_top/spawn/destroy）
    const first = pipeline.find(op => op.op === 'move_top' || op.op === 'spawn' || op.op === 'destroy') as (MoveTopOp | SpawnOp | DestroyOp | undefined);
    if (!first) {
      out.push({ action: name, by });
      continue;
    }

    if (first.op === 'move_top') {
      const fromMeta = zones[first.from_zone];
      const toMeta   = zones[first.to_zone];
      if (!fromMeta || !toMeta) continue;

      const fromOwners = resolveOwnerCandidates(first.from_owner as any, by, game_state, seats);
      const toOwners   = resolveOwnerCandidates(first.to_owner as any, by, game_state, seats);

      for (const fromSeat of fromOwners) {
        const fromKey = inst_key(fromMeta, fromSeat);
        const srcLen  = getItemsLen(game_state, first.from_zone, fromKey);
        if (srcLen <= 0) continue;

        for (const toSeat of toOwners) {
          const toKey     = inst_key(toMeta, toSeat);
          const destFree  = capacityLeft(game_state, toMeta, first.to_zone, toKey);
          let maxCount    = Math.min(srcLen, destFree);

          // 同区同 owner 移动：算 no-op，直接跳过
          if (first.from_zone === first.to_zone && fromKey === toKey) continue;
          if (maxCount <= 0) continue;

          const cap = typeof maxCountsPerAction === 'number' && maxCountsPerAction > 0
            ? Math.min(maxCount, maxCountsPerAction)
            : maxCount;

          for (let c = 1; c <= cap; c++) {
            const payload: Record<string, unknown> = { count: c };
            if (first.from_owner === 'seat') payload.seat = fromSeat;
            if (first.to_owner === 'seat') payload.seat = toSeat;
            out.push({ action: name, by, payload });
          }
        }
      }
    } else if (first.op === 'spawn') {
      const meta = zones[first.to_zone];
      if (!meta) continue;

      const owners = resolveOwnerCandidates(first.owner as any, by, game_state, seats);
      for (const seat of owners) {
        const key = inst_key(meta, seat);
        const destFree = capacityLeft(game_state, meta, first.to_zone, key);
        let maxCount = destFree;
        if (!Number.isFinite(maxCount)) maxCount = 1;
        if (maxCount <= 0) continue;

        const cap = typeof maxCountsPerAction === 'number' && maxCountsPerAction > 0
          ? Math.min(maxCount, maxCountsPerAction)
          : maxCount;

        for (let c = 1; c <= cap; c++) {
          const payload: Record<string, unknown> = { count: c };
          if (first.owner === 'seat') payload.seat = seat;
          out.push({ action: name, by, payload });
        }
      }
    } else if (first.op === 'destroy') {
      const meta = zones[first.from_zone];
      if (!meta) continue;

      const owners = resolveOwnerCandidates(first.owner as any, by, game_state, seats);
      for (const seat of owners) {
        const key = inst_key(meta, seat);
        const srcLen = getItemsLen(game_state, first.from_zone, key);
        let maxCount = srcLen;
        if (maxCount <= 0) continue;

        const cap = typeof maxCountsPerAction === 'number' && maxCountsPerAction > 0
          ? Math.min(maxCount, maxCountsPerAction)
          : maxCount;

        for (let c = 1; c <= cap; c++) {
          const payload: Record<string, unknown> = { count: c };
          if (first.owner === 'seat') payload.seat = seat;
          out.push({ action: name, by, payload });
        }
      }
    }
  }

  return out;
}
