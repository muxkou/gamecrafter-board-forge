import { describe, it, expect } from 'vitest';
import type { GameState } from '../../types';
import { exec_spawn } from '../effects/spawn';
import { exec_move_piece } from '../effects/move_piece';
import type { InterpreterCtx } from '../effects/types';

function emptyState(): GameState {
  return {
    phase: 'p',
    turn: 1,
    seats: ['P1'],
    active_seat: 'P1',
    vars: {},
    per_seat: { P1: {} },
    entities: {},
    zones: {
      board: { kind: 'grid', scope: 'per_seat', of: ['pawn'], instances: { P1: { kind: 'grid', cells: [] } } },
    } as any,
    rng_state: '0',
    meta: { schema_version: 1, last_seq: 0, next_eid: 0 },
  };
}

const compiled = { zones_index: { board: { kind: 'grid', scope: 'per_seat', of: ['pawn'] } } } as any;

describe('zones.board helpers', () => {
  it('spawns and moves piece on grid', () => {
    let ctx: InterpreterCtx = { compiled, state: emptyState(), call: { action: 'spawn', by: 'P1', payload: {} } };
    const s1 = exec_spawn({ op: 'spawn', entity: 'pawn', to_zone: 'board', owner: 'by', pos: { x: 0, y: 0 } }, ctx);
    const eid = s1.zones.board.instances.P1.cells[0][0];
    expect(eid).toBeDefined();
    ctx = { ...ctx, state: s1 };
    const s2 = exec_move_piece({ op: 'move_piece', zone: 'board', owner: 'by', from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }, ctx);
    expect(s2.zones.board.instances.P1.cells[0]?.[0]).toBeUndefined();
    expect(s2.zones.board.instances.P1.cells[1][1]).toBe(eid);
  });
});
