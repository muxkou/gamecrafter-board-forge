import { describe, it, expect } from 'vitest';
import { compile } from '../../compiler';
import { initial_state } from '../index';
import { legal_actions } from '../legal_actions';

function dsl() {
  return {
    schema_version: 0,
    engine_compat: '>=1.0.0',
    id: 'enum-demo',
    name: 'Enum Demo',
    metadata: { seats: { min: 1, max: 1, default: 1 } },
    entities: [],
    zones: [],
    phases: [ { id: 'main', transitions: [] } ],
    actions: [ {
      id: 'choose',
      input: { type: 'object', properties: { dir: { enum: ['L','R','U'] } }, required: ['dir'] },
      require: { op: '!=', args: [ { var: 'payload.dir' }, 'U' ] },
      effect: []
    } ],
    victory: { order: [ { when: true, result: 'ongoing' } ] }
  } as const;
}

describe('legal_actions enumeration with explicit values', () => {
  it('enumerates value list and filters via require', async () => {
    const compiled = await compile({ dsl: dsl() });
    expect(compiled.ok).toBe(true);
    const init = await initial_state({ compiled_spec: compiled.compiled_spec!, seats: ['A'], seed: 1 });
    const calls = legal_actions({ compiled_spec: compiled.compiled_spec!, game_state: init.game_state, by: 'A', seats: ['A'] });
    const dirs = calls.map(c => (c.payload as any).dir).sort();
    expect(dirs).toEqual(['L','R']);
  });
});
