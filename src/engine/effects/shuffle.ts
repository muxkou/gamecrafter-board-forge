import type { EffectExecutor } from './types';
import { resolve_owner } from '../helpers/owner.util';
import { mulberry32 } from '../../utils/rng.util';

export type ShuffleOp = {
  op: 'shuffle';
  zone: string;
  owner: 'by' | 'active' | string;
};

export const exec_shuffle: EffectExecutor<ShuffleOp> = (op, ctx) => {
  const owner = resolve_owner(op.owner, ctx);
  const zone: any = ctx.state.zones[op.zone];
  if (!zone) throw new Error(`zone '${op.zone}' not found`);
  const inst = zone.instances?.[owner];
  if (!inst || !Array.isArray(inst.items)) {
    throw new Error(`owner '${owner}' not found in zone '${op.zone}'`);
  }
  const rng = mulberry32(Number(ctx.state.rng_state || 0));
  const items = [...inst.items];
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.next_uint32() % (i + 1);
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
  const nextZone = { ...zone, instances: { ...zone.instances } };
  nextZone.instances[owner] = { ...inst, items };
  return {
    ...ctx.state,
    zones: { ...ctx.state.zones, [op.zone]: nextZone },
    rng_state: String(rng.state >>> 0),
  } as any;
};
