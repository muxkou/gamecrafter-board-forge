import { describe, it, expect } from 'vitest';
import { compile } from '../../compiler';
import { initial_state } from '../index';
import { legal_actions_compiled } from '../legal_actions_compiled';

function dsl() {
  return {
    schema_version: 0,
    engine_compat: '>=1.0.0',
    id: 'demo',
    name: 'Demo',
    metadata: { seats: { min: 2, max: 2, default: 2 } },
    entities: [ { id: 'card', props: {} } ],
    zones: [
      { id: 'deck', kind: 'stack', scope: 'public', of: ['card'], visibility: 'all' },
      { id: 'hand', kind: 'list', scope: 'per_seat', of: ['card'], visibility: 'owner' },
    ],
    phases: [ { id: 'main', transitions: [] } ],
    actions: [
      {
        id: 'double_draw',
        effect: [
          { op: 'move_top', from_zone: 'deck', to_zone: 'hand', from_owner: 'by', to_owner: 'by' },
          { op: 'move_top', from_zone: 'deck', to_zone: 'hand', from_owner: 'by', to_owner: 'by' },
        ],
      },
      {
        id: 'spawn1_deal',
        effect: [
          { op: 'spawn', entity: 'card', to_zone: 'deck', owner: 'by', count: 1 },
          { op: 'deal', from_zone: 'deck', to_zone: 'hand', from_owner: '_', to_owner: 'seat', count: 1 },
        ],
      },
      {
        id: 'spawn2_deal',
        effect: [
          { op: 'spawn', entity: 'card', to_zone: 'deck', owner: 'by', count: 2 },
          { op: 'deal', from_zone: 'deck', to_zone: 'hand', from_owner: '_', to_owner: 'seat', count: 1 },
        ],
      },
    ],
    victory: { order: [ { when: true, result: 'ongoing' } ] },
  } as const;
}

describe('legal_actions_compiled pipeline simulation', () => {
  it('considers resources across multiple steps', async () => {
    const compiled = await compile({ dsl: dsl() });
    expect(compiled.ok).toBe(true);
    const seats = ['A', 'B'];
    const init = await initial_state({ compiled_spec: compiled.compiled_spec!, seats, seed: 1 });
    const gs: any = init.game_state;

    gs.zones.deck.instances['_'].items = ['c1'];
    const calls0 = legal_actions_compiled({ compiled_spec: compiled.compiled_spec!, game_state: gs, by: 'A', seats });
    expect(calls0.some(c => c.action === 'double_draw')).toBe(false);

    gs.zones.deck.instances['_'].items = ['c1', 'c2'];
    const calls1 = legal_actions_compiled({ compiled_spec: compiled.compiled_spec!, game_state: gs, by: 'A', seats, maxCountsPerAction: 2 });
    expect(calls1.some(c => c.action === 'double_draw')).toBe(true);
  });

  it('takes prior spawn into account for subsequent deal', async () => {
    const compiled = await compile({ dsl: dsl() });
    expect(compiled.ok).toBe(true);
    const seats = ['A', 'B'];
    const init = await initial_state({ compiled_spec: compiled.compiled_spec!, seats, seed: 1 });
    const gs: any = init.game_state;
    gs.zones.deck.instances['_'].items = [];
    const calls = legal_actions_compiled({ compiled_spec: compiled.compiled_spec!, game_state: gs, by: 'A', seats });
    expect(calls.some(c => c.action === 'spawn2_deal')).toBe(true);
    expect(calls.some(c => c.action === 'spawn1_deal')).toBe(false);
  });
});

