import type { Strategy } from '../strategy';

export const firstStrategy: Strategy = {
  choose(actionCalls) {
    return actionCalls[0] ?? null;
  },
};
