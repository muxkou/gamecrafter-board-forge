import type { Strategy } from '../strategy';

export const first_strategy: Strategy = {
  choose(action_calls) {
    return action_calls[0] ?? null;
  },
};
