/**
 * 自动对局运行器（Auto Runner）
 * 在给定规则与策略下批量模拟对局，产出胜负/平局、步数、
 * 无法行动次数、策略违规次数、命中统计与可选事件轨迹等。
 */
import { initial_state, step, eval_victory } from './index';
import type { CompiledSpecType } from '../schema';
import type { GameState, Event } from '../types';
import { ActionCall, CompiledLike, legal_actions_compiled } from './legal_actions_compiled';
import type { Strategy } from './strategy';
import { first_strategy } from './strategies';

/**
 * 自动运行器的配置项
 * - strategies 支持数组或映射形式，均提供 `first_strategy` 作为兜底
 */
export interface AutoRunnerOptions {
  compiled_spec: CompiledSpecType;
  seats: string[];
  episodes: number;
  /** limit of steps per episode (default 100) */
  max_steps?: number;
  /** 策略配置：数组按 `seats` 顺序映射，映射按席位名映射，缺省回退到默认策略 */
  strategies?: Record<string, Strategy> | Strategy[];
  /** when true, collect event trajectory for each episode */
  collect_trajectory?: boolean;
}

/**
 * 自动运行摘要结果
 */
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
  /** actual step count for each episode */
  episode_steps: number[];
  /** optional trajectory of events for each episode */
  trajectories?: Event[][];
}


/**
 * 为指定席位选择策略：
 * - 数组：按 `seats` 的索引对应；越界回退到默认策略
 * - 映射：按席位名取；缺失回退到默认策略
 */
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
  // 全局统计
  let wins = 0;
  let losses = 0;
  let ties = 0;
  let steps = 0;
  let no_action = 0;
  let violations = 0;

  // 行动/分支命中统计
  const action_hits: Record<string, number> = {};
  const branch_hits: Record<string, number> = {};

  // 命中记录器
  const hit_action = (id: string) => {
    action_hits[id] = (action_hits[id] || 0) + 1;
  };
  const hit_branch = (key: string) => {
    branch_hits[key] = (branch_hits[key] || 0) + 1;
  };

  // 轨迹与每局步数
  const trajectories: Event[][] = [];
  const episode_steps: number[] = [];

  for (let ep = 0; ep < episodes; ep++) {
    // 每局初始化（使用 ep 作为随机种子，便于复现）
    const init = await initial_state({ compiled_spec, seats, seed: ep });
    let state = init.game_state;
    // 开局先判定是否已处于终局
    let result = eval_victory(compiled_spec, state, hit_branch);
    if (result === 'win') { wins++; episode_steps.push(0); continue; }
    if (result === 'loss') { losses++; episode_steps.push(0); continue; }
    if (result === 'tie') { ties++; episode_steps.push(0); continue; }

    const events: Event[] = [];
    if (collect_trajectory) trajectories.push(events);

    let ep_steps = 0;
    for (let i = 0; i < max_steps; i++) {
      const seat = state.active_seat || '';

      // 1) 列举当前席位的所有合法行动
      const calls = legal_actions_compiled({ 
        compiled_spec: compiled_spec as CompiledLike, 
        game_state: state, 
        by: seat, 
        seats 
      });
      // 无合法行动：记平局与 no_action，结束该局
      if (calls.length === 0) { ties++; no_action++; break; }

      // 2) 选择策略
      const strat = get_strategry(strategies, seat, seats);
      let next: ActionCall | null = null;
      try {
        // 3) 使用策略基于候选行动与当前状态进行决策
        next = strat.choose(calls, { seat, state });
      } catch (e) {
        // 策略抛错：计入 violations 并终止该局
        violations++;
        break;
      }

      // 策略放弃（null）：记平局与 no_action，结束该局
      if (!next) { ties++; no_action++; break; }

      // 4) 组装动作并推进状态机
      const action = { 
        id: next.action, 
        by: next.by, 
        payload: next.payload || {}, 
        seq: state.meta.last_seq + 1 
      };
      const r = await step({ compiled_spec, game_state: state, action });
      
      // 执行失败或无后继状态：保守记为平局
      if (!r.ok || !r.next_state) { 
        ties++; 
        break; 
      }

      // 5) 记录命中与步数推进
      hit_action(action.id);
      state = r.next_state;
      steps++;
      ep_steps++;
      // 可选：记录事件轨迹
      if (collect_trajectory && r.event) events.push(r.event);

      // 6) 每步后检查是否达成终局
      result = eval_victory(compiled_spec, state, hit_branch);

      if (result === 'win') { wins++; break; }
      if (result === 'loss') { losses++; break; }
      if (result === 'tie') { ties++; break; }
    }
    // 达到最大步数仍未结束：判为平局
    if (result === 'ongoing' && ep_steps >= max_steps) { ties++; }

    episode_steps.push(ep_steps);
  }

  return { 
    episodes, 
    steps, 
    ties, 
    wins, 
    losses, 
    no_action, 
    violations, 
    action_hits, 
    branch_hits, 
    episode_steps, 
    trajectories: collect_trajectory ? trajectories : undefined 
  };
}
