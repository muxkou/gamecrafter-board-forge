import { initial_state, step } from './index';
import type { CompiledSpecType } from '../schema';
import type { GameState } from '../types';

export interface AutoRunnerOptions {
  compiled_spec: CompiledSpecType;
  seats: string[];
  episodes: number;
  max_steps?: number;
}

export interface AutoRunnerSummary {
  episodes: number;
  steps: number;
  ties: number;
  wins: number;
  losses: number;
}

function evalVictory(compiled_spec: CompiledSpecType, state: GameState): string {
  const chain = compiled_spec.victory?.order || [];
  for (const { when, result } of chain) {
    // 支持布尔或 { const: boolean } 占位
    const cond = typeof when === 'object' && when !== null && 'const' in (when as any)
      ? (when as any).const
      : when;
    if (cond) return result;
  }
  return 'ongoing';
}

/**
 * 简单的自动运行器：循环执行 "noop" 动作并在每步后检查胜负。
 * 若 victory 表达式返回 win/loss/tie 则提前结束该局。
 */
export async function auto_runner(opts: AutoRunnerOptions): Promise<AutoRunnerSummary> {
  const { compiled_spec, seats, episodes, max_steps = 100 } = opts;
  let wins = 0;
  let losses = 0;
  let ties = 0;
  let steps = 0;

  for (let ep = 0; ep < episodes; ep++) {
    const init = await initial_state({ compiled_spec, seats, seed: ep });
    let state = init.game_state;
    for (let i = 0; i < max_steps; i++) {
      const action = {
        id: 'noop',
        by: state.active_seat || '',
        payload: {},
        seq: state.meta.last_seq + 1,
      };
      const r = await step({ compiled_spec, game_state: state, action });
      if (!r.ok || !r.next_state) {
        ties++;
        break;
      }
      state = r.next_state;
      steps++;
      const result = evalVictory(compiled_spec, state);
      if (result === 'win') { wins++; break; }
      if (result === 'loss') { losses++; break; }
      if (result === 'tie') { ties++; break; }
      if (i === max_steps - 1) ties++;
    }
  }

  return { episodes, steps, ties, wins, losses };
}
