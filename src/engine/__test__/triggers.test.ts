import { describe, it, expect } from 'vitest';

import { compile } from '../../compiler/index';
import { initial_state } from '../index';
import { step_compiled } from '../step_compiled';

function dslWithDraw() {
  return {
    schema_version: 0,
    engine_compat: '>=1.0.0',
    id: 'demo',
    name: 'Demo Game',
    metadata: { seats: { min: 2, max: 4, default: 2 } },
    entities: [{ id: 'card', props: { cost: 1 } }],
    zones: [
      { id: 'deck', kind: 'stack', scope: 'per_seat', of: ['card'], visibility: 'owner', capacity: 60 },
      { id: 'hand', kind: 'list', scope: 'per_seat', of: ['card'], visibility: 'owner' },
    ],
    phases: [{ id: 'main', transitions: [] }],
    actions: [
      { id: 'draw', effect: [{ op: 'move_top', from_zone: 'deck', to_zone: 'hand', count: 1 }] },
    ],
    victory: { order: [{ when: true, result: 'ongoing' }] },
  };
}

async function build() {
  const compiled = await compile({ dsl: dslWithDraw() });
  expect(compiled.ok).toBe(true);
  const seats = ['A', 'B'];
  const init = await initial_state({ compiled_spec: compiled.compiled_spec!, seats, seed: 1 });
  return { compiled_spec: compiled.compiled_spec!, init } as const;
}

describe('triggers', () => {
  it('runs after:draw triggers', async () => {
    const { compiled_spec, init } = await build();
    (compiled_spec as any).triggers_index['after:draw'] = [
      [{ op: 'set_var', key: 't1', value: 1 }],
      [{ op: 'set_var', key: 't2', value: 2 }],
    ];
    const gs: any = init.game_state;
    gs.zones.deck.instances['A'].items = ['c1'];
    gs.zones.hand.instances['A'].items = [];
    const { next_state } = step_compiled({
      compiled_spec,
      game_state: gs,
      action: { action: 'draw', by: 'A', payload: {} },
    });
    const ns: any = next_state as any;
    expect(ns.vars.t1).toBe(1);
    expect(ns.vars.t2).toBe(2);
  });
});
