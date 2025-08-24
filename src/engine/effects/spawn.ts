import type { EffectExecutor } from './types';
import { resolve_owner } from '../helpers/owner.util';
import { apply_set_cell } from '../helpers/zones.util';

export type SpawnOp = {
  op: 'spawn';
  entity: string;
  to_zone: string;
  owner: 'seat' | 'by' | 'active' | string;
  count?: number;
  props?: Record<string, unknown>;
  pos?: { x: number; y: number };
};

export const exec_spawn: EffectExecutor<SpawnOp> = (op, ctx) => {
  /***
   * count 获取与校验
   * ****
   */
  const count = typeof op.count === 'number' ? op.count : 1;
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(`spawn.count 非法：${count}`);
  }

  /***
   * owner 获取与校验
   * ****
   */
  const owners = op.owner === 'seat' ? ctx.state.seats : [resolve_owner(op.owner, ctx)];

  let state = ctx.state;
  let eid_counter = state.meta?.next_eid || 1;
  for (const owner of owners) {
    const zone: any = state.zones[op.to_zone];
    if (!zone) throw new Error(`zone '${op.to_zone}' not found`);
    
    const inst = zone.instances?.[owner];
    if (!inst) {
      throw new Error(`owner '${owner}' not found in zone '${op.to_zone}'`);
    }

    const entities = { ...state.entities } as any;
    const board_kinds = ['grid', 'hexgrid', 'track'];
    if (board_kinds.includes(zone.kind)) {
      if (count !== 1) throw new Error('board spawn supports count=1');
      if (!op.pos || !Number.isInteger(op.pos.x) || !Number.isInteger(op.pos.y)) {
        throw new Error('spawn.pos required for board zones');
      }
      const eid = `e${++eid_counter}`;
      entities[eid] = { entity_type: op.entity, props: { ...(op.props || {}) } };
      const base = {
        ...state,
        entities,
        meta: { ...state.meta, next_eid: eid_counter },
      } as any;
      state = apply_set_cell(base, {
        zone: op.to_zone,
        owner,
        coord: op.pos,
        eid,
      });
    } else {
      const instList = inst.items;
      if (!Array.isArray(instList)) {
        throw new Error(`owner '${owner}' not found in zone '${op.to_zone}'`);
      }
      const cap: number | undefined = zone.capacity;
      if (typeof cap === 'number' && instList.length + count > cap) {
        throw new Error(`would exceed capacity ${cap}`);
      }
      const items = [...instList];
      for (let i = 0; i < count; i++) {
        const eid = `e${++eid_counter}`;
        entities[eid] = { entity_type: op.entity, props: { ...(op.props || {}) } };
        items.push(eid);
      }
      const nextZone = { ...zone, instances: { ...zone.instances, [owner]: { ...inst, items } } };
      state = {
        ...state,
        entities,
        zones: { ...state.zones, [op.to_zone]: nextZone },
        meta: { ...state.meta, next_eid: eid_counter },
      } as any;
    }
  }
  return state;
};

