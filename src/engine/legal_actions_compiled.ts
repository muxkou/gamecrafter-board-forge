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
 *
 * 工作原理（高层）：
 * 1) 遍历所有已编译的动作定义（actions_index）。
 * 2) 对每个动作的 effect pipeline 做“数量级”层面的静态模拟：
 *    - 不真正移动实体，只在一个 Map 中按 zone/owner 维度维护计数变化。
 *    - 对需要 seat 变量的 op，会为每个 seat 候选位点各跑一遍。
 *    - 对 count 为变量的 op，会尝试从 1 开始递增，直到受限或失败。
 * 3) 若整个 pipeline 在上述静态约束下均可满足（不欠账、不溢出容量），则认为“可能合法”，产出一个 ActionCall。
 * 4) 通过 maxCountsPerAction 与 maxBranches 限制枚举规模，避免组合爆炸。
 */

import { CompiledSpecType } from "../schema";
import { GameState } from "../types";
import { eval_condition } from "./helpers/expr.util";
import type { InterpreterCtx } from "./effects/types";

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
  require_ast?: unknown;
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

/** 是否启用静态数量级模拟（关闭时将仅做 require 过滤，不做容量/数量约束模拟） */
export const ENABLE_STATIC_SIMULATION = false as const;

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

/**
 * 将 effect pipeline 在“数量/容量约束层面”做一次静态模拟。
 * 成功返回 true，任何一步违反约束则返回 false。
 */
export function simulate_effect_pipeline(args: {
  pipeline: EffectPipelineOp[];
  zones: ZonesIndex;
  game_state: GameState;
  seats: Seats;
  by: string;
  seat: string | undefined;
  count: number;
}): boolean {
  const { pipeline, zones, game_state, seats, by, seat, count } = args;
  // 临时读写接口：在一次 pipeline 模拟中，缓存每个 zone|owner 实例的“当前估算数量”。
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
        op.from_owner === "seat" || op.to_owner === "seat" ? seats : [undefined];
      for (const s of seatIter) {
        const fromOwner =
          op.from_owner === "seat"
            ? s
            : resolveOwner(op.from_owner, by, game_state, seat);
        const toOwner =
          op.to_owner === "seat"
            ? s
            : resolveOwner(op.to_owner, by, game_state, seat);
        const fromKey = inst_key(fromMeta, fromOwner || "");
        const toKey = inst_key(toMeta, toOwner || "");
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

  // 临时读写接口：在一次 pipeline 模拟中，缓存每个 zone|owner 实例的“当前估算数量”。
  // 读：如果缓存未命中，则回退到真实 game_state 的初始数量。
  const read = (map: Map<string, number>, zone: string, ownerKey: string) => {
    const k = `${zone}|${ownerKey}`;
    if (!map.has(k)) map.set(k, getItemsLen(game_state, zone, ownerKey));
    return map.get(k)!;
  };
  
  // 写：仅更新缓存，不触碰真实 game_state。
  const write = (
    map: Map<string, number>,
    zone: string,
    ownerKey: string,
    val: number
  ) => {
    map.set(`${zone}|${ownerKey}`, val);
  };


  // 轻量 require 判定：用当前 state/compiled 与待提交的 call（action/by/payload）做一次 expr 求值
  const passesRequire = (
    def: EffectDef,
    actionName: string,
    payload: Record<string, unknown> | undefined
  ): boolean => {
    const ctx: InterpreterCtx = {
      compiled: (compiled_spec as unknown) as CompiledSpecType,
      state: game_state,
      call: { action: actionName, by, payload },
      context: undefined as any,
    };
    return eval_condition(def.require_ast, ctx);
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
    // 跳过包含未支持操作符的动作；仅在上述集合内的 op 才可静态评估。
    if (pipeline.some((op) => !supported.includes(op.op))) continue;

    // 如果 pipeline 中出现依赖 seat 的 owner 语义，则需要按 seat 穷举。
    const needsSeat = pipeline.some(
      (op) =>
        (op.op === "move_top" &&
          (op.from_owner === "seat" || op.to_owner === "seat")) ||
        (op.op === "spawn" && op.owner === "seat") ||
        (op.op === "destroy" && op.owner === "seat")
    );
    const seatCandidates = needsSeat ? seats : [undefined];

    // 是否存在“变量 count”的步骤：若存在，则从 1..cap 逐步尝试，直到 simulate 失败为止。
    const variableCount = pipeline.some(
      (op) => typeof (op as any).count !== "number"
    );

    for (const seat of seatCandidates) {
      if (!variableCount) {
        // 固定 count（或无需 count）的动作：只需尝试一次。
        const ok = ENABLE_STATIC_SIMULATION
          ? simulate_effect_pipeline({
              pipeline,
              zones,
              game_state,
              seats,
              by,
              seat,
              count: 1,
            })
          : true;
        if (ok) {
          const payload: Record<string, unknown> = {};
          if (needsSeat && seat) payload.seat = seat;
          // require 过滤
          if (passesRequire(def, name, Object.keys(payload).length ? payload : undefined)) {
            out.push({ action: name, by, payload: Object.keys(payload).length ? payload : undefined });
            if (out.length >= branchCap) return out;
          }
        }
      } else {
        // 变量 count：从 1 递增；一旦某个 c 失败，则更大 c 理论上更不可能成功，故 break。
        const cap =
          typeof maxCountsPerAction === "number" && maxCountsPerAction > 0
            ? maxCountsPerAction
            : Infinity;
        for (let c = 1; c <= cap && out.length < branchCap; c++) {
          const ok = ENABLE_STATIC_SIMULATION
            ? simulate_effect_pipeline({
                pipeline,
                zones,
                game_state,
                seats,
                by,
                seat,
                count: c,
              })
            : true;
          if (!ok) break;
          const payload: Record<string, unknown> = { count: c };
          if (needsSeat && seat) payload.seat = seat;
          // require 过滤
          if (passesRequire(def, name, payload)) {
            out.push({ action: name, by, payload });
          }
        }
        if (out.length >= branchCap) return out;
      }
    }
  }

  return out;
}

