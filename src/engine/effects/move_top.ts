import type { EffectExecutor } from './types';
import { resolve_owner } from '../helpers/owner.util';
import { apply_move_top } from '../helpers/zones.util';

export type MoveTopOp = {
  op: 'move_top';
  from_zone: string;
  to_zone: string;
  from_owner: 'by' | 'active' | string;
  to_owner: 'by' | 'active' | string;
  count?: number;
};

export const exec_move_top: EffectExecutor<MoveTopOp> = (op, ctx) => {
  const baseCount = typeof op.count === 'number' ? op.count : 1;
  const overriddenCount = ctx.call.payload?.count;
  const count = Number.isFinite(overriddenCount as number) ? Number(overriddenCount) : baseCount;

  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(`move_top.count 非法：${count}`);
  }

  const next = apply_move_top(ctx.state, {
    from_zone: op.from_zone,
    to_zone: op.to_zone,
    from_owner: resolve_owner(op.from_owner, ctx),
    to_owner: resolve_owner(op.to_owner, ctx),
    count,
  });

  return next;
};


