import type { EffectExecutor } from './types';
import { resolve_owner } from '../helpers/owner.util';
import { apply_move_top } from '../helpers/zones.util';

export type DealOp = {
  op: 'deal';
  from_zone: string;
  to_zone: string;
  from_owner: 'by' | 'active' | 'seat' | string;
  to_owner: 'by' | 'active' | 'seat' | string;
  count?: number;
};

export const exec_deal: EffectExecutor<DealOp> = (op, ctx) => {
  const count = typeof op.count === 'number' ? op.count : 1;

  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(`deal.count 非法：${count}`);
  }

  let state = ctx.state;
  const seats = ctx.state.seats;
  if (op.from_owner === 'seat' || op.to_owner === 'seat') {
    for (const seat of seats) {
      const from_owner = op.from_owner === 'seat' ? seat : resolve_owner(op.from_owner, ctx);
      const to_owner = op.to_owner === 'seat' ? seat : resolve_owner(op.to_owner, ctx);
      state = apply_move_top(state, {
        from_zone: op.from_zone,
        to_zone: op.to_zone,
        from_owner,
        to_owner,
        count,
      });
    }
    return state;
  }

  const from_owner = resolve_owner(op.from_owner, ctx);
  const to_owner = resolve_owner(op.to_owner, ctx);
  console.log(`op: ${op}`);
  return apply_move_top(state, {
    from_zone: op.from_zone,
    to_zone: op.to_zone,
    from_owner,
    to_owner,
    count,
  });
};
