import type { EffectExecutor } from './types';
import { resolve_owner } from '../helpers/owner.util';
import { apply_move_piece } from '../helpers/zones.util';

export type MovePieceOp = {
  op: 'move_piece';
  zone: string;
  owner: 'by' | 'active' | string;
  from: { x: number; y: number };
  to: { x: number; y: number };
};

export const exec_move_piece: EffectExecutor<MovePieceOp> = (op, ctx) => {
  const owner = resolve_owner(op.owner, ctx);
  return apply_move_piece(ctx.state, {
    zone: op.zone,
    owner,
    from: op.from,
    to: op.to,
  });
};
