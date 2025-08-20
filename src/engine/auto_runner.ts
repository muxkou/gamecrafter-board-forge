import { initial_state, step } from './index';
import type { CompiledSpecType } from '../schema';
import type { GameState } from '../types';
import { legal_actions_compiled } from './legal_actions_compiled';
import type { Strategy } from './strategy';
import { firstStrategy } from './strategies';

export interface AutoRunnerOptions {
  compiled_spec: CompiledSpecType;
  seats: string[];
  episodes: number;
  max_steps?: number;
  strategies?: Record<string, Strategy> | Strategy[];
}

export interface AutoRunnerSummary {
  episodes: number;
  steps: number;
  ties: number;
  wins: number;
  losses: number;
  no_actions: number;
}

function evalVictory(compiled_spec: CompiledSpecType, state: GameState): string {
  const chain = compiled_spec.victory?.order || [];
  for (const { when, result } of chain) {
    const cond = typeof when === 'object' && when !== null && 'const' in (when as any)
      ? (when as any).const
      : when;
    if (cond) return result;
  }
  return 'ongoing';
}

function getStrategy(strategies: AutoRunnerOptions['strategies'], seat: string, seats: string[]): Strategy {
  if (Array.isArray(strategies)) {
    const idx = seats.indexOf(seat);
    return strategies[idx] || firstStrategy;
  }
  if (strategies && seat in strategies) return strategies[seat];
  return firstStrategy;
}

/**
 * 基于策略的自动运行器：
 * - 每步通过 legal_actions_compiled 枚举候选行动
 * - 根据席位对应的 Strategy 选择下一步
 * - 无候选或 Strategy 返回 null 时结束该局，计为平局/无行动
 */
export async function auto_runner(opts: AutoRunnerOptions): Promise<AutoRunnerSummary> {
  const { compiled_spec, seats, episodes, max_steps = 100, strategies } = opts;
  let wins = 0;
  let losses = 0;
  let ties = 0;
  let steps = 0;
  let no_actions = 0;

  for (let ep = 0; ep < episodes; ep++) {
    const init = await initial_state({ compiled_spec, seats, seed: ep });
    let state = init.game_state;
    let result = evalVictory(compiled_spec, state);
    if (result === 'win') { wins++; continue; }
    if (result === 'loss') { losses++; continue; }
    if (result === 'tie') { ties++; continue; }

    for (let i = 0; i < max_steps; i++) {
      const seat = state.active_seat || '';
      const calls = legal_actions_compiled({ compiled_spec: compiled_spec as any, game_state: state, by: seat, seats });
      const strat = getStrategy(strategies, seat, seats);
      const next = strat.choose(calls, { seat, state });
      if (!next) { ties++; no_actions++; break; }

      const action = { id: next.action, by: next.by, payload: next.payload || {}, seq: state.meta.last_seq + 1 };
      const r = await step({ compiled_spec, game_state: state, action });
      if (!r.ok || !r.next_state) { ties++; break; }
      state = r.next_state;
      steps++;
      result = evalVictory(compiled_spec, state);
      if (result === 'win') { wins++; break; }
      if (result === 'loss') { losses++; break; }
      if (result === 'tie') { ties++; break; }
      if (i === max_steps - 1) ties++;
    }
  }

  return { episodes, steps, ties, wins, losses, no_actions };
}
