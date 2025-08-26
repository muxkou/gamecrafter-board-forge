/**
 * legal_actions_compiled
 * ----------------------
 * 精简版：完全移除静态模拟逻辑，仅基于 require 校验；
 * - 若存在 require_ast，则以当前 state/call(by, 空 payload) 进行求值
 * - 若无 require_ast，则直接视为合法
 */

import { CompiledSpecType } from "../schema";
import { GameState } from "../types";
import { eval_condition } from "./helpers/expr.util";
import type { InterpreterCtx } from "./effects/types";

type EffectDef = {
  action_hash: string;
  effect_pipeline: unknown[];
  require_ast?: unknown;
};

type ActionsIndex = Record<string, EffectDef>;

export type CompiledLike = Pick<CompiledSpecType, "actions_index"> & {
  actions_index: ActionsIndex;
};

export type ActionCall = {
  action: string;
  by: string;
  payload?: Record<string, unknown>;
};

/** 主体：基于 require 判定合法动作（无 require 则直接合法） */
export function legal_actions_compiled(args: {
  compiled_spec: CompiledLike;
  game_state: GameState;
  by: string;
  seats?: string[];
  maxCountsPerAction?: number;
  maxBranches?: number;
}): ActionCall[] {
  const { compiled_spec, game_state, by } = args;
  const branch_cap =
    typeof args.maxBranches === "number" && args.maxBranches > 0
      ? args.maxBranches
      : Infinity;

  const out: ActionCall[] = [];
  const actions = compiled_spec.actions_index;
  // require 判定：用当前 state/compiled 与待提交的 call（action/by/空 payload）做一次 expr 求值
  const passes_require = (
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
    // 无 require 直接合法；有 require 则以空 payload 校验
    const payload: Record<string, unknown> | undefined = undefined;
    const ok = def.require_ast === undefined ? true : passes_require(def, name, payload);
    if (ok) {
      out.push({ action: name, by, payload });
      if (out.length >= branch_cap) return out;
    }
  }

  return out;
}

