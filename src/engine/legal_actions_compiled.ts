/**
 * legal_actions_compiled
 * ----------------------
 * 用途：基于编译产物（actions_index + zones_index），在不执行效果的前提下，
 *       静态枚举“可能合法”的动作调用（ActionCall）。
 * 特点：
 *  - 逐步模拟 effect pipeline，动态维护临时资源状态。
 *  - 支持 move_top / deal / spawn / destroy / shuffle / set_var / set_phase 等 op。
 *  - owner 解析：支持 'by' | 'active' | 'seat'（占位）以及常量 seat_id 字符串。
 *  - count 枚举：生成 1..max 的分支，可通过 maxCountsPerAction 限制规模，并提供 maxBranches 总量限制。
 * 适用：提示 UI、简单 AI、可行性预估；对强一致性要求的合法性，仍需在 step/step_compiled 路径校验。
 */

import { CompiledSpecType } from "../schema";
import { GameState } from "../types";

type Seats = string[];
type Scope = "public" | "per_seat";

type ZoneMeta = {
  scope: Scope;
  container: "list" | "stack" | "queue" | string;
  capacity?: number | null; // 无/0/undefined 视为无限
};

type ZonesIndex = Record<string, ZoneMeta>;

type MoveTopOp = {
  op: "move_top";
  from_zone: string;
  to_zone: string;
  from_owner: "by" | "active" | "seat" | string;
  to_owner: "by" | "active" | "seat" | string;
  count?: number;
};

type SpawnOp = {
  op: "spawn";
  to_zone: string;
  owner: "by" | "active" | "seat" | string;
  count?: number;
};

type DestroyOp = {
  op: "destroy";
  from_zone: string;
  owner: "by" | "active" | "seat" | string;
  count?: number;
};

type EffectPipelineOp =
  | ({ op: "move_top" } & MoveTopOp)
  | ({ op: "spawn" } & SpawnOp)
  | ({ op: "destroy" } & DestroyOp)
  | { op: "deal" | "shuffle" | "set_var" | "set_phase"; [key: string]: any };

type EffectDef = {
  action_hash: string;
  effect_pipeline: EffectPipelineOp[];
};

type ActionsIndex = Record<string, EffectDef>;

export type CompiledLike = Pick<CompiledSpecType, "zones_index" | "actions_index"> & {
  zones_index: ZonesIndex;
  actions_index: ActionsIndex;
};

export type ActionCall = {
  action: string;
  by: string;
  payload?: Record<string, unknown>;
};

/** 将 seat 标准化为实例 key：public → '_'；per_seat → seat_id */
function inst_key(meta: ZoneMeta, seat: string): string {
  return meta.scope === "public" ? "_" : seat;
}

/** 读取实例 items 数量（不抛错，缺失视为 0） */
function getItemsLen(gs: GameState, zone: string, ownerKey: string): number {
  const items = (gs as any).zones?.[zone]?.instances?.[ownerKey]?.items;
  return Array.isArray(items) ? items.length : 0;
}

/** 将单个 owner 解析为具体 seat */
function resolveOwner(
  mode: "by" | "active" | "seat" | string,
  by: string,
  gs: GameState,
  seat?: string
): string {
  if (mode === "by") return by;
  if (mode === "active") return gs.active_seat || "";
  if (mode === "seat") return seat || "";
  return String(mode);
}

/** 主体：枚举可能合法的动作调用 */
export function legal_actions_compiled(args: {
  compiled_spec: CompiledLike;
  game_state: GameState;
  by: string;
  seats?: Seats;
  maxCountsPerAction?: number;
  maxBranches?: number;
}): ActionCall[] {
  const { compiled_spec, game_state, by, maxCountsPerAction } = args;
  const seats = args.seats ?? (game_state.seats as Seats);
  const branchCap =
    typeof args.maxBranches === "number" && args.maxBranches > 0
      ? args.maxBranches
      : Infinity;

  const out: ActionCall[] = [];
  const zones = compiled_spec.zones_index;
  const actions = compiled_spec.actions_index;

  const read = (map: Map<string, number>, zone: string, ownerKey: string) => {
    const k = `${zone}|${ownerKey}`;
    if (!map.has(k)) map.set(k, getItemsLen(game_state, zone, ownerKey));
    return map.get(k)!;
  };
  const write = (
    map: Map<string, number>,
    zone: string,
    ownerKey: string,
    val: number
  ) => {
    map.set(`${zone}|${ownerKey}`, val);
  };

  const simulate = (
    pipeline: EffectPipelineOp[],
    seat: string | undefined,
    count: number
  ): boolean => {
    const temp = new Map<string, number>();
    for (const op of pipeline) {
      if (op.op === "move_top") {
        const fromMeta = zones[op.from_zone];
        const toMeta = zones[op.to_zone];
        if (!fromMeta || !toMeta) return false;
        const c = typeof op.count === "number" ? op.count : count;
        const fromOwner = resolveOwner(op.from_owner, by, game_state, seat);
        const toOwner = resolveOwner(op.to_owner, by, game_state, seat);
        const fromKey = inst_key(fromMeta, fromOwner);
        const toKey = inst_key(toMeta, toOwner);
        if (op.from_zone === op.to_zone && fromKey === toKey) continue;
        const src = read(temp, op.from_zone, fromKey);
        const dest = read(temp, op.to_zone, toKey);
        const cap = toMeta.capacity ?? Infinity;
        if (src < c) return false;
        if (dest + c > cap && Number.isFinite(cap)) return false;
        write(temp, op.from_zone, fromKey, src - c);
        write(temp, op.to_zone, toKey, dest + c);
      } else if (op.op === "deal") {
        const fromMeta = zones[op.from_zone];
        const toMeta = zones[op.to_zone];
        if (!fromMeta || !toMeta) return false;
        const c = typeof op.count === "number" ? op.count : count;
        const seatIter =
          op.from_owner === "seat" || op.to_owner === "seat"
            ? seats
            : [undefined];
        for (const s of seatIter) {
          const fromOwner =
            op.from_owner === "seat"
              ? s
              : resolveOwner(op.from_owner, by, game_state, seat);
          const toOwner =
            op.to_owner === "seat"
              ? s
              : resolveOwner(op.to_owner, by, game_state, seat);
          const fromKey = inst_key(fromMeta, fromOwner);
          const toKey = inst_key(toMeta, toOwner);
          if (op.from_zone === op.to_zone && fromKey === toKey) continue;
          const src = read(temp, op.from_zone, fromKey);
          const dest = read(temp, op.to_zone, toKey);
          const cap = toMeta.capacity ?? Infinity;
          if (src < c) return false;
          if (dest + c > cap && Number.isFinite(cap)) return false;
          write(temp, op.from_zone, fromKey, src - c);
          write(temp, op.to_zone, toKey, dest + c);
        }
      } else if (op.op === "spawn") {
        const meta = zones[op.to_zone];
        if (!meta) return false;
        const c = typeof op.count === "number" ? op.count : count;
        const owners =
          op.owner === "seat"
            ? [seat]
            : [resolveOwner(op.owner, by, game_state, seat)];
        for (const o of owners) {
          if (!o) return false;
          const key = inst_key(meta, o);
          const dest = read(temp, op.to_zone, key);
          const cap = meta.capacity ?? Infinity;
          if (dest + c > cap && Number.isFinite(cap)) return false;
          write(temp, op.to_zone, key, dest + c);
        }
      } else if (op.op === "destroy") {
        const meta = zones[op.from_zone];
        if (!meta) return false;
        const c = typeof op.count === "number" ? op.count : count;
        const owners =
          op.owner === "seat"
            ? [seat]
            : [resolveOwner(op.owner, by, game_state, seat)];
        for (const o of owners) {
          if (!o) return false;
          const key = inst_key(meta, o);
          const src = read(temp, op.from_zone, key);
          if (src < c) return false;
          write(temp, op.from_zone, key, src - c);
        }
      } else if (
        op.op === "shuffle" ||
        op.op === "set_var" ||
        op.op === "set_phase"
      ) {
        continue;
      } else {
        return false;
      }
    }
    return true;
  };

  for (const [name, def] of Object.entries(actions)) {
    const pipeline = def.effect_pipeline;
    if (!Array.isArray(pipeline) || pipeline.length === 0) continue;

    const supported = [
      "move_top",
      "shuffle",
      "deal",
      "set_var",
      "spawn",
      "destroy",
      "set_phase",
    ];
    if (pipeline.some((op) => !supported.includes(op.op))) continue;

    const needsSeat = pipeline.some(
      (op) =>
        (op.op === "move_top" &&
          (op.from_owner === "seat" || op.to_owner === "seat")) ||
        (op.op === "spawn" && op.owner === "seat") ||
        (op.op === "destroy" && op.owner === "seat")
    );
    const seatCandidates = needsSeat ? seats : [undefined];

    const variableCount = pipeline.some(
      (op) => typeof (op as any).count !== "number"
    );

    for (const seat of seatCandidates) {
      if (!variableCount) {
        if (simulate(pipeline, seat, 1)) {
          const payload: Record<string, unknown> = {};
          if (needsSeat && seat) payload.seat = seat;
          out.push({ action: name, by, payload });
          if (out.length >= branchCap) return out;
        }
      } else {
        const cap =
          typeof maxCountsPerAction === "number" && maxCountsPerAction > 0
            ? maxCountsPerAction
            : Infinity;
        for (let c = 1; c <= cap && out.length < branchCap; c++) {
          if (!simulate(pipeline, seat, c)) break;
          const payload: Record<string, unknown> = { count: c };
          if (needsSeat && seat) payload.seat = seat;
          out.push({ action: name, by, payload });
        }
        if (out.length >= branchCap) return out;
      }
    }
  }

  return out;
}

