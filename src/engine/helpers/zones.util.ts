import type { GameState } from '../../types';

export type MoveTopParams = {
  from_zone: string;
  to_zone: string;
  from_owner: string;
  to_owner: string;
  count: number;
};

export function apply_move_top(state: GameState, params: MoveTopParams): GameState {
  const { from_zone, to_zone, from_owner, to_owner, count } = params;
  const zones: any = state.zones as any;

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
    throw new Error(`from_zone kind '${inst_from.kind}' not supported by move_top`);
  }
  if (!supported(inst_to.kind) || !Array.isArray(inst_to.items)) {
    throw new Error(`to_zone kind '${inst_to.kind}' not supported by move_top`);
  }

  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(`move_top.count 非法：${count}`);
  }

  if (inst_from.items.length < count) {
    throw new Error(`need ${count}, have ${inst_from.items.length}`);
  }
  const cap: number | undefined = zr_to.capacity;
  if (typeof cap === 'number' && inst_to.items.length + count > cap) {
    throw new Error(`would exceed capacity ${cap}`);
  }

  const next: GameState = {
    ...state,
    zones: { ...state.zones },
  } as any;

  const next_from_zone = { ...zr_from, instances: { ...zr_from.instances } };
  const next_to_zone = { ...zr_to, instances: { ...zr_to.instances } };
  const from_items: string[] = [...inst_from.items];
  const to_items: string[] = [...inst_to.items];

  for (let i = 0; i < count; i++) {
    const eid = from_items.pop() as string;
    to_items.push(eid);
  }

  next_from_zone.instances[from_owner] = { ...inst_from, items: from_items };
  next_to_zone.instances[to_owner] = { ...inst_to, items: to_items };
  (next.zones as any)[from_zone] = next_from_zone;
  (next.zones as any)[to_zone] = next_to_zone;

  return next;
}


