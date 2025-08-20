import { initial_state, step } from './index';
import type { CompiledSpecType } from '../schema';
import type { GameState, Event } from '../types';
import { legal_actions_compiled } from './legal_actions_compiled';
import type { Strategy } from './strategy';
import { first_strategy } from './strategies';

export interface AutoRunnerOptions {
  compiled_spec: CompiledSpecType;
  seats: string[];
  episodes: number;
  max_steps?: number;
  strategies?: Record<string, Strategy> | Strategy[];
  /** when true, collect event trajectory for each episode */
  collect_trajectory?: boolean;
}

export interface AutoRunnerSummary {
  episodes: number;
  steps: number;
  ties: number;
  wins: number;
  losses: number;
  /** episodes ended because no legal action was available or strategy returned null */
  no_action: number;
  /** episodes terminated due to strategy throwing an exception */
  violations: number;
  /** count of executed actions */
  action_hits: Record<string, number>;
  /** count of hit branches (e.g. victory conditions) */
  branch_hits: Record<string, number>;
  /** optional trajectory of events for each episode */
  trajectories?: Event[][];
}

function eval_victory(compiled_spec: CompiledSpecType, state: GameState, hit?: (key: string) => void): string {
  const chain = compiled_spec.victory?.order || [];
  for (const { when, result } of chain) {
    const cond = typeof when === 'object' && when !== null && 'const' in (when as any)
      ? (when as any).const
      : when;
    if (cond) {
      hit?.(String(result));
      return result;
    }
  }
  hit?.('ongoing');
  return 'ongoing';
}

function get_strategry(strategies: AutoRunnerOptions['strategies'], seat: string, seats: string[]): Strategy {
  if (Array.isArray(strategies)) {
    const idx = seats.indexOf(seat);
    return strategies[idx] || first_strategy;
  }
  if (strategies && seat in strategies) return strategies[seat];
  return first_strategy;
}

/**
 * 基于策略的自动运行器：
 * - 每步通过 legal_actions_compiled 枚举候选行动
 * - 根据席位对应的 Strategy 选择下一步
 * - 无候选或 Strategy 返回 null：结束该局，计为平局且记 no_action
 * - Strategy.choose 抛错：记 violations 并终止该局
 */
export async function auto_runner(opts: AutoRunnerOptions): Promise<AutoRunnerSummary> {
  const { compiled_spec, seats, episodes, max_steps = 100, strategies, collect_trajectory } = opts;
  let wins = 0;
  let losses = 0;
  let ties = 0;
  let steps = 0;
  let no_action = 0;
  let violations = 0;
  const action_hits: Record<string, number> = {};
  const branch_hits: Record<string, number> = {};

  const hitAction = (id: string) => {
    action_hits[id] = (action_hits[id] || 0) + 1;
  };
  const hitBranch = (key: string) => {
    branch_hits[key] = (branch_hits[key] || 0) + 1;
  };

  const trajectories: Event[][] = [];
  for (let ep = 0; ep < episodes; ep++) {
    const init = await initial_state({ compiled_spec, seats, seed: ep });
    let state = init.game_state;
    let result = eval_victory(compiled_spec, state, hitBranch);
    if (result === 'win') { wins++; continue; }
    if (result === 'loss') { losses++; continue; }
    if (result === 'tie') { ties++; continue; }
    const events: Event[] = [];
    if (collect_trajectory) trajectories.push(events);

    for (let i = 0; i < max_steps; i++) {
      const seat = state.active_seat || '';
      const calls = legal_actions_compiled({ compiled_spec: compiled_spec as any, game_state: state, by: seat, seats });
      if (calls.length === 0) { ties++; no_action++; break; }
      const strat = get_strategry(strategies, seat, seats);
      let next;
      try {
        next = strat.choose(calls, { seat, state });
      } catch (e) {
        violations++;
        break;
      }
      if (!next) { ties++; no_action++; break; }

      const action = { id: next.action, by: next.by, payload: next.payload || {}, seq: state.meta.last_seq + 1 };
      const r = await step({ compiled_spec, game_state: state, action });
      
      if (!r.ok || !r.next_state) { 
        ties++; 
        break; 
      }

      hitAction(action.id);
      state = r.next_state;
      steps++;
      if (collect_trajectory && r.event) events.push(r.event);
      result = eval_victory(compiled_spec, state, hitBranch);

      if (result === 'win') { wins++; break; }
      if (result === 'loss') { losses++; break; }
      if (result === 'tie') { ties++; break; }
      if (i === max_steps - 1) ties++;
    }
  }

  return { episodes, steps, ties, wins, losses, no_action, violations, action_hits, branch_hits, trajectories: collect_trajectory ? trajectories : undefined };
}
