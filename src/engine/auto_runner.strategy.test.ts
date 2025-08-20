import { describe, it, expect, vi } from 'vitest';
import type { Strategy } from './strategy';
import { first_strategy } from './strategies';

vi.mock('./index', () => {
  const initial_state = vi.fn(async ({ seats }: { seats: string[] }) => ({
    game_state: { seats, active_seat: seats[0], meta: { last_seq: 0 } } as any,
  }));
  const step = vi.fn(async ({ game_state, action }: any) => {
    const seats = game_state.seats;
    const idx = seats.indexOf(game_state.active_seat);
    const nextSeat = seats[(idx + 1) % seats.length];
    const next_state = { ...game_state, active_seat: nextSeat, meta: { ...game_state.meta, last_seq: action.seq } };
    return { ok: true, next_state } as any;
  });
  return { initial_state, step };
});

vi.mock('./legal_actions_compiled', () => ({
  legal_actions_compiled: ({ by }: { by: string }) => [{ action: 'end_turn', by, payload: {} }],
}));

import { auto_runner } from './auto_runner';

const compiled_spec = { victory: { order: [ { when: false, result: 'ongoing' } ] } } as any;

describe('auto_runner strategy behaviors', () => {
  it('records no_action when strategy returns null', async () => {
    const nullStrat: Strategy = { choose: () => null };
    const summary = await auto_runner({ compiled_spec, seats: ['A','B'], episodes: 1, strategies: { A: nullStrat }, max_steps: 5 });
    expect(summary.no_action).toBe(1);
    expect(summary.ties).toBe(1);
    expect(summary.violations).toBe(0);
    expect(summary.branch_hits.ongoing).toBe(1);
    expect(summary.action_hits.end_turn).toBeUndefined();
  });

  it('records violations when strategy throws', async () => {
    const badStrat: Strategy = { choose: () => { throw new Error('boom'); } };
    const summary = await auto_runner({ compiled_spec, seats: ['A','B'], episodes: 1, strategies: { A: badStrat }, max_steps: 5 });
    expect(summary.violations).toBe(1);
    expect(summary.no_action).toBe(0);
    expect(summary.ties).toBe(0);
    expect(summary.branch_hits.ongoing).toBe(1);
    expect(summary.action_hits.end_turn).toBeUndefined();
  });

  it('assigns strategies by seat order when array provided', async () => {
    const sA: Strategy = { choose: vi.fn(() => ({ action: 'end_turn', by: 'A' })) };
    const sB: Strategy = { choose: vi.fn(() => ({ action: 'end_turn', by: 'B' })) };
    const summary = await auto_runner({ compiled_spec, seats: ['A','B'], episodes: 1, strategies: [sA, sB], max_steps: 2 });
    expect(summary.steps).toBe(2);
    expect(sA.choose).toHaveBeenCalledTimes(1);
    expect(sB.choose).toHaveBeenCalledTimes(1);
  });

  it('falls back to first_strategy when seat strategy missing', async () => {
    const sA: Strategy = { choose: vi.fn(() => ({ action: 'end_turn', by: 'A' })) };
    const spy = vi.spyOn(first_strategy, 'choose');
    await auto_runner({ compiled_spec, seats: ['A','B'], episodes: 1, strategies: [sA], max_steps: 2 });
    expect(sA.choose).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
