import type { Strategy } from '../strategy';

export const randomStrategy: Strategy = {
  choose(actionCalls) {
    if (actionCalls.length === 0) return null;
    const idx = Math.floor(Math.random() * actionCalls.length);
    return actionCalls[idx];
  },
};
