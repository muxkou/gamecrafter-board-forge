import { CompiledSpecType } from "../schema";
import { GameState } from "../types";
import { eval_condition } from "./helpers/expr.util";
import type { InterpreterCtx } from "./effects/types";

/**
 * 输入枚举来源：
 * - zone：从某个分区（如 hand、discard_pile 等）读取 items 作为候选值
 * - owner：实例归属者；支持特殊值 "active"/"by"（当前操作者）、"_"/"public"（公共实例）
 * - values：直接给定候选值列表（跳过从状态读取）
 */
export type EnumSource = { zone?: string; owner?: string; values?: unknown[] };

/**
 * 编译产出的动作定义：
 * - action_hash：动作哈希（标识流水线版本）
 * - effect_pipeline：效果流水线（解释器将据此执行）
 * - require_ast：前置条件 AST（布尔表达式）
 * - input_enum：各输入字段的枚举来源定义
 */
export type EffectDef = {
  action_hash: string;
  effect_pipeline: unknown[];
  require_ast?: unknown;
  input_enum?: Record<string, EnumSource>;
};

/**
 * 只要求具备 actions_index 的编译结果接口（用于行动枚举）
 */
export type CompiledLike = Pick<CompiledSpecType, "actions_index"> & {
  actions_index: Record<string, EffectDef>;
};

/**
 * 可执行的动作调用（枚举结果）
 * - action：动作名
 * - by：发起者
 * - payload：输入参数（从枚举笛卡尔积或空）
 */
export type ActionCall = { action: string; by: string; payload?: Record<string, unknown> };

/**
 * 枚举合法行动：
 * - 若 action 定义了 input_enum，则对各字段枚举候选值并用 require_ast 过滤
 * - 否则回退到 require-only 模式（与旧版 legal_actions_compiled 一致）
 *
 * 参数说明：
 * - compiled_spec：包含 actions_index 的编译产物
 * - game_state：当前游戏状态
 * - by：发起者（玩家/实体 id）
 * - max_counts_per_action：每个 action 最多保留多少条不同 payload 的调用
 * - max_branches：本次枚举的全局上限（避免组合爆炸）
 */
export function legal_actions(args: {
  compiled_spec: CompiledLike;
  game_state: GameState;
  by: string;
  max_counts_per_action?: number;
  max_branches?: number;
}): ActionCall[] {
  const { compiled_spec, game_state, by } = args;
  // 全局枚举上限（分支数）
  const branch_cap =
    typeof args.max_branches === "number" && args.max_branches > 0
      ? args.max_branches
      : Infinity;
  // 每个动作的 payload 变体上限
  const count_cap =
    typeof args.max_counts_per_action === "number" && args.max_counts_per_action > 0
      ? args.max_counts_per_action
      : Infinity;

  const out: ActionCall[] = [];
  const actions = compiled_spec.actions_index;

  /**
   * 判定某次调用是否满足 require_ast
   */
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

  /**
   * 解析 owner 语义到具体实例键
   */
  const resolve_owner = (owner: string | undefined): string | undefined => {
    if (!owner) return owner;
    if (owner === "active" || owner === "by") return by;
    if (owner === "_" || owner === "public") return "_";
    return owner;
  };

  for (const [name, def] of Object.entries(actions)) {
    // 是否定义了输入枚举：有则进行“笛卡尔积枚举 + require 过滤”，否则进入 require-only 分支
    const meta = def.input_enum && Object.keys(def.input_enum).length > 0 ? def.input_enum : null;

    if (meta) {
      // 1) 收集每个字段的候选列表
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
      // 将候选映射为有序列表，准备做深度优先的笛卡尔积遍历
      const lists = fields.map(f => candidates[f]);
      const perAction: ActionCall[] = [];

      // 2) 递归构造 payload：对每个字段依次挑选一个值
      const build = (idx: number, payload: Record<string, unknown>) => {
        // 容量控制：达到任一上限即停止进一步枚举
        if (perAction.length >= count_cap || out.length >= branch_cap) return;
        if (idx === fields.length) {
          // 所有字段都已填充，进行 require 判定
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
      // 无输入枚举：仅按 require 过滤一次
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

