import type { EffectExecutor } from './types';
import { resolve_owner } from '../helpers/owner.util';

export type MoveIdOp = {
  op: 'move_id';
  from_zone: string;
  to_zone: string;
  from_owner: 'by' | 'active' | string;
  to_owner: 'by' | 'active' | string;
  entity_id: string | { var: string } | unknown;
};

export const exec_move_id: EffectExecutor<MoveIdOp> = (op, ctx) => {
  const from_zone = op.from_zone;
  const to_zone = op.to_zone;
  const from_owner = resolve_owner(op.from_owner, ctx);
  const to_owner = resolve_owner(op.to_owner, ctx);
  const zones: any = ctx.state.zones as any;

  const zr_from = zones[from_zone];
  const zr_to = zones[to_zone];
  if (!zr_from) throw new Error(`from_zone '${from_zone}' not found`);
  if (!zr_to) throw new Error(`to_zone '${to_zone}' not found`);

  const inst_from = zr_from.instances?.[from_owner];
  const inst_to = zr_to.instances?.[to_owner];
  if (!inst_from) throw new Error(`owner '${from_owner}' not found in zone '${from_zone}'`);
  if (!inst_to) throw new Error(`owner '${to_owner}' not found in zone '${to_zone}'`);

  const supported = (k: string) => k === 'list' || k === 'stack' || k === 'queue';
  if (!supported(inst_from.kind) || !Array.isArray(inst_from.items)) {
    throw new Error(`from_zone kind '${inst_from.kind}' not supported by move_id`);
  }
  if (!supported(inst_to.kind) || !Array.isArray(inst_to.items)) {
    throw new Error(`to_zone kind '${inst_to.kind}' not supported by move_id`);
  }

  // 解析 entity_id（允许 {var: 'payload.xxx'} 这种形态）
  const entity_id = typeof op.entity_id === 'object' && op.entity_id && 'var' in (op.entity_id as any)
    ? String((ctx.call.payload as any)[(op.entity_id as any).var.split('.').slice(1).join('.')])
    : String(op.entity_id as any);

  if (!entity_id) throw new Error('move_id.entity_id is required');

  const idx = (inst_from.items as string[]).indexOf(entity_id);
  if (idx < 0) throw new Error(`entity '${entity_id}' not found in zone '${from_zone}' of owner '${from_owner}'`);

  const cap: number | undefined = zr_to.capacity;
  if (typeof cap === 'number' && inst_to.items.length + 1 > cap) {
    throw new Error(`would exceed capacity ${cap}`);
  }

  const next: any = { ...ctx.state, zones: { ...ctx.state.zones } };
  const next_from_zone = { ...zr_from, instances: { ...zr_from.instances } };
  const next_to_zone = { ...zr_to, instances: { ...zr_to.instances } };
  const from_items: string[] = [...inst_from.items];
  const to_items: string[] = [...inst_to.items];

  from_items.splice(idx, 1);
  to_items.push(entity_id);

  next_from_zone.instances[from_owner] = { ...inst_from, items: from_items };
  next_to_zone.instances[to_owner] = { ...inst_to, items: to_items };
  next.zones[from_zone] = next_from_zone;
  next.zones[to_zone] = next_to_zone;

  return next;
};


