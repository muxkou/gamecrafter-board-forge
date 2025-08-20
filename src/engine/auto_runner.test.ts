import { describe, it, expect } from 'vitest';
import { compile } from '../compiler/index';
import { auto_runner } from './auto_runner';

function buildDSL(result: string) {
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
    victory: { order: [ { when: true, result } ] },
  };
}

describe('auto_runner victory handling', () => {
  it('counts wins', async () => {
    const dsl = buildDSL('win');
    const compiled = await compile({ dsl });
    expect(compiled.ok).toBe(true);
    const summary = await auto_runner({ compiled_spec: compiled.compiled_spec!, seats: ['A','B'], episodes: 1, max_steps: 5 });
    expect(summary.wins).toBe(1);
    expect(summary.losses).toBe(0);
    expect(summary.ties).toBe(0);
    expect(summary.no_action).toBe(0);
    expect(summary.violations).toBe(0);
  });

  it('counts losses', async () => {
    const dsl = buildDSL('loss');
    const compiled = await compile({ dsl });
    expect(compiled.ok).toBe(true);
    const summary = await auto_runner({ compiled_spec: compiled.compiled_spec!, seats: ['A','B'], episodes: 1, max_steps: 5 });
    expect(summary.losses).toBe(1);
    expect(summary.wins).toBe(0);
    expect(summary.ties).toBe(0);
    expect(summary.no_action).toBe(0);
    expect(summary.violations).toBe(0);
  });

  it('counts ties when no victory', async () => {
    const dsl = {
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
    const compiled = await compile({ dsl });
    expect(compiled.ok).toBe(true);
    const summary = await auto_runner({ compiled_spec: compiled.compiled_spec!, seats: ['A','B'], episodes: 1, max_steps: 1 });
    expect(summary.ties).toBe(1);
    expect(summary.wins).toBe(0);
    expect(summary.losses).toBe(0);
    expect(summary.no_action).toBe(1);
    expect(summary.violations).toBe(0);
  });
});
