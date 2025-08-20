import { describe, it, expect } from 'vitest';
import { compile } from '../compiler/index';
import { initial_state } from './index';
import { legal_actions_compiled } from './legal_actions_compiled';
import { firstStrategy, randomStrategy } from './strategies';
import type { Strategy } from './strategy';

function buildDSL() {
  return {
    schema_version: 0,
    engine_compat: '>=1.0.0',
    id: 'demo',
    name: 'Demo Game',
    metadata: { seats: { min: 1, max: 1, default: 1 } },
    entities: [ { id: 'card', props: {} } ],
    zones: [
      { id: 'deck', kind: 'stack', scope: 'per_seat', of: ['card'], visibility: 'owner' },
      { id: 'hand', kind: 'list', scope: 'per_seat', of: ['card'], visibility: 'owner' },
    ],
    phases: [ { id: 'main', transitions: [] } ],
    actions: [
      { id: 'drawA', effect: [ { op: 'move_top', from_zone: 'deck', to_zone: 'hand' } ] },
      { id: 'drawB', effect: [ { op: 'move_top', from_zone: 'deck', to_zone: 'hand' } ] },
    ],
    victory: { order: [ { when: true, result: 'ongoing' } ] },
  };
}

describe('built-in strategies', () => {
  it('firstStrategy picks the first legal action', async () => {
    const compiled = await compile({ dsl: buildDSL() });
    expect(compiled.ok).toBe(true);
    const init = await initial_state({ compiled_spec: compiled.compiled_spec!, seats: ['A'], seed: 1 });
    const gs: any = init.game_state;
    gs.zones.deck.instances['A'].items = ['c1'];
    const calls = legal_actions_compiled({ compiled_spec: compiled.compiled_spec!, game_state: gs, by: 'A', seats: ['A'] });
    expect(calls.length).toBe(2);
    const strat: Strategy = firstStrategy;
    const chosen = strat.choose(calls, { seat: 'A', state: gs });
    expect(chosen).toEqual(calls[0]);
  });

  it('randomStrategy returns one of the legal actions or null on empty input', async () => {
    const compiled = await compile({ dsl: buildDSL() });
    const init = await initial_state({ compiled_spec: compiled.compiled_spec!, seats: ['A'], seed: 1 });
    const gs: any = init.game_state;
    gs.zones.deck.instances['A'].items = ['c1'];
    const calls = legal_actions_compiled({ compiled_spec: compiled.compiled_spec!, game_state: gs, by: 'A', seats: ['A'] });
    const chosen = randomStrategy.choose(calls, { seat: 'A', state: gs });
    expect(calls.includes(chosen!)).toBe(true);
    expect(randomStrategy.choose([], { seat: 'A', state: gs })).toBeNull();
    expect(firstStrategy.choose([], { seat: 'A', state: gs })).toBeNull();
  });
});
