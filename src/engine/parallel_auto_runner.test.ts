import { describe, it, expect } from 'vitest';
import { compile } from '../compiler/index';
import { parallel_auto_runner } from './parallel_auto_runner';
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
    phases: [{ id: 'main', transitions: [] }],
    actions: [{ id: 'noop', effect: [] }],
    victory: { order: [{ when: false, result: 'ongoing' }] },
  };
}

describe.skip('parallel_auto_runner', () => {
  it('aggregates summaries across workers', async () => {
    const dsl = buildDSL();
    const compiled = await compile({ dsl });
    expect(compiled.ok).toBe(true);
    const seq = await auto_runner({ compiled_spec: compiled.compiled_spec!, seats: ['A', 'B'], episodes: 4, max_steps: 1, collect_trajectory: true });
    const par = await parallel_auto_runner({ compiled_spec: compiled.compiled_spec!, seats: ['A', 'B'], episodes: 4, max_steps: 1, parallelism: 2, collect_trajectory: true });
    expect(par.ties).toBe(seq.ties);
    expect(par.episodes).toBe(seq.episodes);
    expect(par.steps).toBe(seq.steps);
    expect(par.trajectories?.length).toBe(4);
  });
});
