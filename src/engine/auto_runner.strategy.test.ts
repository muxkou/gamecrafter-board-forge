import { describe, it, expect, vi } from 'vitest';
import { compile } from '../compiler/index';
import type { Strategy } from './strategy';

vi.mock('./legal_actions_compiled', () => ({
  legal_actions_compiled: () => [ { action: 'noop', by: 'A', payload: {} } ]
}));

import { auto_runner } from './auto_runner';

function buildDSL() {
  return {
    schema_version: 0,
    engine_compat: '>=1.0.0',
    id: 'demo',
    name: 'Demo Game',
    metadata: { seats: { min: 2, max: 2, default: 2 } },
    entities: [],
    zones: [],
    phases: [ { id: 'main', transitions: [] } ],
    actions: [ { id: 'noop', effect: [] } ],
    victory: { order: [ { when: false, result: 'ongoing' } ] },
  };
}

describe('auto_runner strategy behaviors', () => {
  it('records no_action when strategy returns null', async () => {
    const dsl = buildDSL();
    const compiled = await compile({ dsl });
    const nullStrat: Strategy = { choose: () => null };
    const summary = await auto_runner({ compiled_spec: compiled.compiled_spec!, seats: ['A','B'], episodes: 1, strategies: { A: nullStrat }, max_steps: 5 });
    expect(summary.no_action).toBe(1);
    expect(summary.ties).toBe(1);
    expect(summary.violations).toBe(0);
    expect(summary.branch_hits.ongoing).toBe(1);
    expect(summary.action_hits.noop).toBeUndefined();
  });

  it('records violations when strategy throws', async () => {
    const dsl = buildDSL();
    const compiled = await compile({ dsl });
    const badStrat: Strategy = { choose: () => { throw new Error('boom'); } };
    const summary = await auto_runner({ compiled_spec: compiled.compiled_spec!, seats: ['A','B'], episodes: 1, strategies: { A: badStrat }, max_steps: 5 });
    expect(summary.violations).toBe(1);
    expect(summary.no_action).toBe(0);
    expect(summary.ties).toBe(0);
    expect(summary.branch_hits.ongoing).toBe(1);
    expect(summary.action_hits.noop).toBeUndefined();
  });
});
