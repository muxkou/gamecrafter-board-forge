import type { GameState } from "../types";
import type { ActionNode } from "./ast";
import { evaluate_expr } from "./runtime/evaluate";
import { Scope } from "./runtime/scope";

/**
 * 代表一次可执行动作的产出
 * - action: 动作标识（来自 ActionNode.op）
 * - by: 执行动作者（玩家/实体 id）
 * - payload: 该动作所需的输入载荷（例如 card_id）
 */
export type GeneratedAction = { action: string; by: string; payload?: Record<string, unknown> };

/**
 *
 * 基本流程
 * 1. 从游戏状态中取出当前玩家手牌与弃牌堆顶部实体（若存在）。
 * 2. 遍历传入的动作节点列表：
 *    - 若该动作的输入声明中需要 `card_id`，则对手牌中的每一张牌进行枚举，分别构造 payload。
 *    - 为每一次尝试构造一个新的 Scope，并注入便捷变量：
 *        $card_id（当前枚举的卡牌 id）、$card（该卡牌实体）、$top（弃牌堆顶部实体）。
 *    - 若节点声明了 require，则用 evaluate_expr 在 { state, scope } 上下文下进行布尔判断；为真才加入候选动作。
 *    - 若不需要 `card_id`，则只注入 $top，直接按 require 过滤。
 * 3. 通过 maxGeneratedActions 上限避免枚举爆炸，达到上限后提前返回。
 *
 * 说明：这里的“手牌枚举 + require 过滤”是一个简单的生成-筛选过程，
 *       适合常见的 "选择一张手牌打出" 等场景。
 */
export function legal_actions(args: {
  actions: ActionNode[];
  game_state: GameState;
  by: string;
  maxGeneratedActions?: number;
}): GeneratedAction[] {
  const { actions, game_state, by } = args;
  // 生成数量上限：未传或无效时使用 Infinity
  const cap =
    typeof args.maxGeneratedActions === "number" && args.maxGeneratedActions > 0
      ? args.maxGeneratedActions
      : Infinity;

  // 输出的合法动作集合
  const out: GeneratedAction[] = [];

  // 便捷访问：zones/hand/与弃牌堆（discard_pile）
  const zones: any = game_state.zones as any;
  const hand: string[] =
    zones?.hand?.instances?.[by]?.items && Array.isArray(zones.hand.instances[by].items)
      ? [...zones.hand.instances[by].items]
      : [];

  const discardItems: string[] =
    zones?.discard_pile?.instances?._?.items && Array.isArray(zones.discard_pile.instances._.items)
      ? zones.discard_pile.instances._.items
      : [];
  // 弃牌堆顶部实体（若存在）
  const topEntity =
    discardItems.length > 0 ? (game_state.entities as any)[discardItems[0]] : undefined;

  for (const node of actions) {
    // 若动作声明里需要 card_id，则对手牌逐一枚举
    if (node.input && (node.input as any).properties?.card_id) {
      for (const card_id of hand) {
        const payload = { card_id } as Record<string, unknown>;
        const scope = new Scope();
        // 为 require 评估注入便捷变量
        scope.set_var("$card_id", card_id);             // 当前枚举的手牌 id
        scope.set_var("$card", (game_state.entities as any)[card_id]); // 当前手牌实体
        scope.set_var("$top", topEntity);               // 弃牌堆顶部实体
        const ctx = { state: game_state, scope } as const;
        // require 为真才认为该枚举是合法的
        const ok = node.require ? Boolean(evaluate_expr(node.require, ctx)) : true;
        if (ok) {
          out.push({ action: node.action, by, payload });
          if (out.length >= cap) return out;
        }
      }
    } else {
      // 不需要 card_id 的动作：仅根据 require 与上下文进行一次性判定
      const scope = new Scope();
      scope.set_var("$top", topEntity);
      const ctx = { state: game_state, scope } as const;
      const ok = node.require ? Boolean(evaluate_expr(node.require, ctx)) : true;
      if (ok) {
        out.push({ action: node.action, by, payload: undefined });
        if (out.length >= cap) return out;
      }
    }
  }

  return out;
}

