import type { GameState } from '../types';
import type { ActionCall } from './legal_actions_compiled';

export interface StrategyContext {
  seat: string;
  state: GameState;
}

export interface Strategy {
  choose(action_calls: ActionCall[], ctx: StrategyContext): ActionCall | null;
}
