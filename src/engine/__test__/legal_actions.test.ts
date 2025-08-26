import { describe, it, expect } from 'vitest';
import { legal_actions } from '../legal_actions';
import { ActionNode, create_comparison_node, create_logic_node, NodeKind } from '../ast';
import type { GameState } from '../../types';

function baseState(): GameState {
  return {
    phase: 'main',
    turn: 0,
    seats: ['A', 'B'],
    active_seat: 'A',
    vars: {},
    per_seat: {},
    entities: {},
    zones: {},
    rng_state: '',
    meta: { schema_version: 0, last_seq: 0, next_eid: 1 },
  } as GameState;
}

const playMatchNode: ActionNode = {
  kind: NodeKind.Action,
  action: 'play_match',
  require: create_logic_node('or', [
    create_comparison_node('==', '$card.props.color', '$top.props.color'),
    create_comparison_node('==', '$card.props.num', '$top.props.num'),
  ]),
  input: { type: 'object', properties: { card_id: { type: 'string' } }, required: ['card_id'] },
};

const drawOneNode: ActionNode = { kind: NodeKind.Action, action: 'draw_one' };

describe('legal_actions enumeration', () => {
  it('scenario A: multiple matching cards yield multiple play_match actions', () => {
    const gs = baseState();
    gs.entities = {
      c1: { entity_type: 'card', props: { color: 'red', num: 1 } },
      c2: { entity_type: 'card', props: { color: 'red', num: 2 } },
      c3: { entity_type: 'card', props: { color: 'blue', num: 3 } },
      t0: { entity_type: 'card', props: { color: 'red', num: 5 } },
    } as any;
    gs.zones = {
      hand: { instances: { A: { kind: 'stack', items: ['c1', 'c2', 'c3'] } } },
      discard_pile: { instances: { _: { kind: 'stack', items: ['t0'] } } },
    } as any;

    const calls = legal_actions({ actions: [playMatchNode, drawOneNode], game_state: gs, by: 'A' });
    const matches = calls.filter((c) => c.action === 'play_match');
    expect(matches.map((m) => (m.payload as any).card_id).sort()).toEqual(['c1', 'c2']);
  });

  it('scenario B: no matching cards yields only draw_one', () => {
    const gs = baseState();
    gs.entities = {
      c1: { entity_type: 'card', props: { color: 'green', num: 1 } },
      c2: { entity_type: 'card', props: { color: 'yellow', num: 2 } },
      t0: { entity_type: 'card', props: { color: 'red', num: 5 } },
    } as any;
    gs.zones = {
      hand: { instances: { A: { kind: 'stack', items: ['c1', 'c2'] } } },
      discard_pile: { instances: { _: { kind: 'stack', items: ['t0'] } } },
    } as any;

    const calls = legal_actions({ actions: [playMatchNode, drawOneNode], game_state: gs, by: 'A' });
    expect(calls).toHaveLength(1);
    expect(calls[0].action).toBe('draw_one');
  });
});

