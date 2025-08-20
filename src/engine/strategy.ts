import type { GameState } from '../types';
import type { ActionCall } from './legal_actions_compiled';

export interface StrategyContext {
  seat: string;
  state: GameState;
}

export interface Strategy {
  choose(actionCalls: ActionCall[], ctx: StrategyContext): ActionCall | null;
}

export const firstStrategy: Strategy = {
  choose(actionCalls) {
    return actionCalls[0] ?? null;
  },
};

export const randomStrategy: Strategy = {
  choose(actionCalls) {
    if (actionCalls.length === 0) return null;
    const idx = Math.floor(Math.random() * actionCalls.length);
    return actionCalls[idx];
  },
};
