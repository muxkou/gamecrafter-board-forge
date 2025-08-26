import { CompiledSpecType } from "../schema";
import { GameState } from "../types";
import { eval_condition } from "./helpers/expr.util";
import type { InterpreterCtx } from "./effects/types";

export type EnumSource = { zone?: string; owner?: string; values?: unknown[] };

export type EffectDef = {
  action_hash: string;
  effect_pipeline: unknown[];
  require_ast?: unknown;
  input_enum?: Record<string, EnumSource>;
};

export type CompiledLike = Pick<CompiledSpecType, "actions_index"> & {
  actions_index: Record<string, EffectDef>;
};

export type ActionCall = { action: string; by: string; payload?: Record<string, unknown> };

/**
 * 枚举合法行动：
 * - 若 action 定义了 input_enum，则对各字段枚举候选值并用 require_ast 过滤
 * - 否则回退到 require-only 模式（与旧版 legal_actions_compiled 一致）
 */
export function legal_actions(args: {
  compiled_spec: CompiledLike;
  game_state: GameState;
  by: string;
  maxCountsPerAction?: number;
  maxBranches?: number;
}): ActionCall[] {
  const { compiled_spec, game_state, by } = args;
  const branch_cap =
    typeof args.maxBranches === "number" && args.maxBranches > 0
      ? args.maxBranches
      : Infinity;
  const count_cap =
    typeof args.maxCountsPerAction === "number" && args.maxCountsPerAction > 0
      ? args.maxCountsPerAction
      : Infinity;

  const out: ActionCall[] = [];
  const actions = compiled_spec.actions_index;

  const passes_require = (
    def: EffectDef,
    actionName: string,
    payload: Record<string, unknown> | undefined,
  ): boolean => {
    const ctx: InterpreterCtx = {
      compiled: (compiled_spec as unknown) as CompiledSpecType,
      state: game_state,
      call: { action: actionName, by, payload },
      context: undefined as any,
    };
    return eval_condition(def.require_ast, ctx);
  };

  const resolve_owner = (owner: string | undefined): string | undefined => {
    if (!owner) return owner;
    if (owner === "active" || owner === "by") return by;
    if (owner === "_" || owner === "public") return "_";
    return owner;
  };

  for (const [name, def] of Object.entries(actions)) {
    const meta = def.input_enum && Object.keys(def.input_enum).length > 0 ? def.input_enum : null;
    if (meta) {
      const fields = Object.keys(meta);
      const candidates: Record<string, unknown[]> = {};
      let valid = true;
      for (const f of fields) {
        const info = meta[f];
        let list: unknown[] = [];
        if (info.values) {
          list = info.values;
        } else if (info.zone) {
          const owner = resolve_owner(info.owner);
          const zone = (game_state.zones as any)[info.zone];
          const inst = zone?.instances?.[owner as any];
          if (inst && Array.isArray(inst.items)) list = inst.items;
        }
        if (!list || list.length === 0) {
          valid = false;
          break;
        }
        candidates[f] = list;
      }
      if (!valid) continue;
      const lists = fields.map(f => candidates[f]);
      const perAction: ActionCall[] = [];
      const build = (idx: number, payload: Record<string, unknown>) => {
        if (perAction.length >= count_cap || out.length >= branch_cap) return;
        if (idx === fields.length) {
          const ok = passes_require(def, name, payload);
          if (ok) {
            perAction.push({ action: name, by, payload: { ...payload } });
            out.push({ action: name, by, payload: { ...payload } });
          }
          return;
        }
        const field = fields[idx];
        for (const v of lists[idx]) {
          payload[field] = v;
          build(idx + 1, payload);
          if (perAction.length >= count_cap || out.length >= branch_cap) return;
        }
        delete payload[field];
      };
      build(0, {});
      if (out.length >= branch_cap) break;
    } else {
      const payload: Record<string, unknown> | undefined = undefined;
      const ok = def.require_ast === undefined ? true : passes_require(def, name, payload);
      if (ok) {
        out.push({ action: name, by, payload });
        if (out.length >= branch_cap) break;
      }
    }
  }

  return out;
}

