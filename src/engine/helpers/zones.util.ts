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

// --- board helpers ------------------------------------------------------

export type BoardCoord = { x: number; y: number };

function ensure_board(inst: any) {
  const supported = (k: string) => k === 'grid' || k === 'hexgrid' || k === 'track';
  if (!supported(inst.kind) || !Array.isArray(inst.cells)) {
    throw new Error(`zone kind '${inst.kind}' not supported`);
  }
}

function clone_cells(cells: string[][]): string[][] {
  return cells.map((row) => [...row]);
}

function get_cell(cells: string[][], { x, y }: BoardCoord): string | undefined {
  return cells[y]?.[x];
}

function set_cell(cells: string[][], { x, y }: BoardCoord, eid: string | undefined) {
  if (!cells[y]) cells[y] = [];
  cells[y][x] = eid as any;
}

export type SetCellParams = {
  zone: string;
  owner: string;
  coord: BoardCoord;
  eid: string;
};

export function apply_set_cell(state: GameState, params: SetCellParams): GameState {
  const { zone, owner, coord, eid } = params;
  const zr: any = (state.zones as any)[zone];
  if (!zr) throw new Error(`zone '${zone}' not found`);
  const inst = zr.instances?.[owner];
  if (!inst) throw new Error(`owner '${owner}' not found in zone '${zone}'`);
  ensure_board(inst);

  const next: GameState = { ...state, zones: { ...state.zones } } as any;
  const next_zone = { ...zr, instances: { ...zr.instances } };
  const cells = clone_cells(inst.cells);
  if (get_cell(cells, coord)) {
    throw new Error('target cell occupied');
  }
  set_cell(cells, coord, eid);
  next_zone.instances[owner] = { ...inst, cells };
  (next.zones as any)[zone] = next_zone;
  return next;
}

export type MovePieceParams = {
  zone: string;
  owner: string;
  from: BoardCoord;
  to: BoardCoord;
};

export function apply_move_piece(state: GameState, params: MovePieceParams): GameState {
  const { zone, owner, from, to } = params;
  const zr: any = (state.zones as any)[zone];
  if (!zr) throw new Error(`zone '${zone}' not found`);
  const inst = zr.instances?.[owner];
  if (!inst) throw new Error(`owner '${owner}' not found in zone '${zone}'`);
  ensure_board(inst);

  const eid = get_cell(inst.cells, from);
  if (!eid) throw new Error('source cell empty');
  if (get_cell(inst.cells, to)) throw new Error('target cell occupied');

  const next: GameState = { ...state, zones: { ...state.zones } } as any;
  const next_zone = { ...zr, instances: { ...zr.instances } };
  const cells = clone_cells(inst.cells);
  set_cell(cells, from, undefined);
  set_cell(cells, to, eid);
  next_zone.instances[owner] = { ...inst, cells };
  (next.zones as any)[zone] = next_zone;
  return next;
}


