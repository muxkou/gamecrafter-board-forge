import type { EffectExecutor } from './types';
import { resolve_owner } from '../helpers/owner.util';

export type SpawnOp = {
  op: 'spawn';
  entity: string;
  to_zone: string;
  owner: 'seat' | 'by' | 'active' | string;
  count?: number;
  props?: Record<string, unknown>;
};

export const exec_spawn: EffectExecutor<SpawnOp> = (op, ctx) => {
  const count = typeof op.count === 'number' ? op.count : 1;
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(`spawn.count 非法：${count}`);
  }
  const owners = op.owner === 'seat' ? ctx.state.seats : [resolve_owner(op.owner, ctx)];
  let state = ctx.state;
  let eidCounter = state.meta?.next_eid || 1;
  for (const owner of owners) {
    const zone: any = state.zones[op.to_zone];
    if (!zone) throw new Error(`zone '${op.to_zone}' not found`);
    const inst = zone.instances?.[owner];
    if (!inst || !Array.isArray(inst.items)) {
      throw new Error(`owner '${owner}' not found in zone '${op.to_zone}'`);
    }
    const cap: number | undefined = zone.capacity;
    if (typeof cap === 'number' && inst.items.length + count > cap) {
      throw new Error(`would exceed capacity ${cap}`);
    }
    const items = [...inst.items];
    const entities = { ...state.entities } as any;
    for (let i = 0; i < count; i++) {
      const eid = `e${++eidCounter}`;
      entities[eid] = { entity_type: op.entity, props: { ...(op.props || {}) } };
      items.push(eid);
    }
    const nextZone = { ...zone, instances: { ...zone.instances, [owner]: { ...inst, items } } };
    state = {
      ...state,
      entities,
      zones: { ...state.zones, [op.to_zone]: nextZone },
      meta: { ...state.meta, next_eid: eidCounter },
    } as any;
  }
  return state;
};

