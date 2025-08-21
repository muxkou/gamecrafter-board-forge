import type { CompiledSpecType } from '../schema';

export type InitSpawn = {
  op: 'spawn';
  entity: string;
  to_zone: string;
  owner: 'seat' | 'by' | 'active' | string;
  count: number;
  props?: Record<string, unknown>;
};

export type InitShuffle = {
  op: 'shuffle';
  zone: string;
  owner: 'seat' | 'by' | 'active' | string;
};

export type InitDeal = {
  op: 'deal';
  from_zone: string;
  to_zone: string;
  from_owner: 'seat' | 'by' | 'active' | string;
  to_owner: 'seat' | 'by' | 'active' | string;
  count: number;
};

export type InitOp = InitSpawn | InitShuffle | InitDeal;

export function normalize_initializer_plan(
  raw: unknown,
  zones_index: CompiledSpecType['zones_index'],
  entities_index: Record<string, any>,
  add_issue: (code: string, path: string, msg: string) => void
): InitOp[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    add_issue('SCHEMA_ERROR', '/setup', 'setup must be an array');
    return [];
  }

  const out: InitOp[] = [];

  for (let i = 0; i < raw.length; i++) {
    const node = raw[i] as any;
    if (!node || typeof node !== 'object') {
      add_issue('SCHEMA_ERROR', `/setup/${i}`, 'node must be object');
      continue;
    }
    if (node.op === 'spawn') {
      const to_zone = String(node.to_zone ?? '');
      const entity = String(node.entity ?? '');
      const owner = (node.owner ?? 'seat') as InitSpawn['owner'];
      const count = node.count == null ? 1 : Number(node.count);
      if (!to_zone || !entity) {
        add_issue('SCHEMA_ERROR', `/setup/${i}`, 'to_zone and entity are required');
        continue;
      }
      const z = zones_index[to_zone];
      if (!z) add_issue('REF_NOT_FOUND', `/setup/${i}/to_zone`, `zone '${to_zone}' not found`);
      if (!entities_index[entity])
        add_issue('REF_NOT_FOUND', `/setup/${i}/entity`, `entity '${entity}' not found`);
      if (!Number.isInteger(count) || count <= 0)
        add_issue('SCHEMA_ERROR', `/setup/${i}/count`, 'count must be positive integer');
      out.push({ op: 'spawn', entity, to_zone, owner, count, props: node.props });
    } else if (node.op === 'shuffle') {
      const zone = String(node.zone ?? '');
      const owner = (node.owner ?? 'seat') as InitShuffle['owner'];
      if (!zone) {
        add_issue('SCHEMA_ERROR', `/setup/${i}`, 'zone is required');
        continue;
      }
      const z = zones_index[zone];
      if (!z) add_issue('REF_NOT_FOUND', `/setup/${i}/zone`, `zone '${zone}' not found`);
      out.push({ op: 'shuffle', zone, owner });
    } else if (node.op === 'deal') {
      const from_zone = String(node.from_zone ?? '');
      const to_zone = String(node.to_zone ?? '');
      const from_owner = (node.from_owner ?? 'seat') as InitDeal['from_owner'];
      const to_owner = (node.to_owner ?? 'seat') as InitDeal['to_owner'];
      const count = node.count == null ? 1 : Number(node.count);
      if (!from_zone || !to_zone) {
        add_issue('SCHEMA_ERROR', `/setup/${i}`, 'from_zone and to_zone are required');
        continue;
      }
      const zFrom = zones_index[from_zone];
      const zTo = zones_index[to_zone];
      if (!zFrom) add_issue('REF_NOT_FOUND', `/setup/${i}/from_zone`, `zone '${from_zone}' not found`);
      if (!zTo) add_issue('REF_NOT_FOUND', `/setup/${i}/to_zone`, `zone '${to_zone}' not found`);
      if (!Number.isInteger(count) || count <= 0)
        add_issue('SCHEMA_ERROR', `/setup/${i}/count`, 'count must be positive integer');
      out.push({ op: 'deal', from_zone, to_zone, from_owner, to_owner, count });
    } else {
      add_issue('EFFECT_UNSUPPORTED', `/setup/${i}`, `unsupported op '${node.op}'`);
    }
  }

  return out;
}

