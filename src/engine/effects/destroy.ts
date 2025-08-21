import type { EffectExecutor } from './types';
import { resolve_owner } from '../helpers/owner.util';

export type DestroyOp = {
  op: 'destroy';
  from_zone: string;
  owner: 'seat' | 'by' | 'active' | string;
  count?: number;
};

export const exec_destroy: EffectExecutor<DestroyOp> = (op, ctx) => {
  const count = typeof op.count === 'number' ? op.count : 1;
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(`destroy.count 非法：${count}`);
  }
  const owners = op.owner === 'seat' ? ctx.state.seats : [resolve_owner(op.owner, ctx)];
  let state = ctx.state;
  for (const owner of owners) {
    const zone: any = state.zones[op.from_zone];
    if (!zone) throw new Error(`zone '${op.from_zone}' not found`);
    const inst = zone.instances?.[owner];
    if (!inst || !Array.isArray(inst.items)) {
      throw new Error(`owner '${owner}' not found in zone '${op.from_zone}'`);
    }
    if (inst.items.length < count) {
      throw new Error(`need ${count}, have ${inst.items.length}`);
    }
    const items = [...inst.items];
    const entities = { ...state.entities } as any;
    for (let i = 0; i < count; i++) {
      const eid = items.pop();
      if (eid) delete entities[eid];
    }
    const nextZone = { ...zone, instances: { ...zone.instances, [owner]: { ...inst, items } } };
    state = {
      ...state,
      entities,
      zones: { ...state.zones, [op.from_zone]: nextZone },
    } as any;
  }
  return state;
};

