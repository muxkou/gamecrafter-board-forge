import type { GameState } from "../types";
import type { ActionNode } from "./ast";
import { evaluate_expr } from "./runtime/evaluate";
import { Scope } from "./runtime/scope";

export type GeneratedAction = { action: string; by: string; payload?: Record<string, unknown> };

/**
 * Enumerate possible action calls from action nodes under current game state.
 * - Supports simple enumeration over a player's hand when `card_id` is required.
 * - Applies require expressions as a second pass filter after enumeration.
 * - Uses `maxGeneratedActions` to cap output to avoid explosion.
 */
export function legal_actions(args: {
  actions: ActionNode[];
  game_state: GameState;
  by: string;
  maxGeneratedActions?: number;
}): GeneratedAction[] {
  const { actions, game_state, by } = args;
  const cap =
    typeof args.maxGeneratedActions === "number" && args.maxGeneratedActions > 0
      ? args.maxGeneratedActions
      : Infinity;

  const out: GeneratedAction[] = [];

  const zones: any = game_state.zones as any;
  const hand: string[] =
    zones?.hand?.instances?.[by]?.items && Array.isArray(zones.hand.instances[by].items)
      ? [...zones.hand.instances[by].items]
      : [];

  const discardItems: string[] =
    zones?.discard_pile?.instances?._?.items && Array.isArray(zones.discard_pile.instances._.items)
      ? zones.discard_pile.instances._.items
      : [];
  const topEntity =
    discardItems.length > 0 ? (game_state.entities as any)[discardItems[0]] : undefined;

  for (const node of actions) {
    if (node.input && (node.input as any).properties?.card_id) {
      for (const card_id of hand) {
        const payload = { card_id } as Record<string, unknown>;
        const scope = new Scope();
        scope.set_var("$card_id", card_id);
        scope.set_var("$card", (game_state.entities as any)[card_id]);
        scope.set_var("$top", topEntity);
        const ctx = { state: game_state, scope } as const;
        const ok = node.require ? Boolean(evaluate_expr(node.require, ctx)) : true;
        if (ok) {
          out.push({ action: node.action, by, payload });
          if (out.length >= cap) return out;
        }
      }
    } else {
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

