import type { Strategy } from '../strategy';

export const random_strategy: Strategy = {
  choose(action_calls) {
    if (action_calls.length === 0) return null;
    const idx = Math.floor(Math.random() * action_calls.length);
    return action_calls[idx];
  },
};
