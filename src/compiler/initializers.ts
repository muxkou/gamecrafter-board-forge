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

// 更统一的错误码常量
const ERR = {
  SCHEMA: 'SCHEMA_ERROR',
  REF: 'REF_NOT_FOUND',
  OP: 'INIT_UNSUPPORTED', // 原 EFFECT_UNSUPPORTED
} as const;

type ZonesIndex = CompiledSpecType['zones_index'];
type AddIssue = (code: string, path: string, msg: string) => void;

function is_positive_int(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) > 0;
}

function req_string(x: unknown): string {
  return String(x ?? '');
}

function assert_zone_exists(zones: ZonesIndex, zone: string, path: string, add: AddIssue) {
  if (!zones[zone]) add(ERR.REF, path, `zone '${zone}' not found`);
}

export function normalize_initializer_plan(
  raw: unknown,
  zones_index: ZonesIndex,
  entities_index: Record<string, unknown>,
  add_issue: AddIssue
): InitOp[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    add_issue(ERR.SCHEMA, '/setup', 'setup must be an array');
    return [];
  }

  const out: InitOp[] = [];

  for (let i = 0; i < raw.length; i++) {
    const node = raw[i] as any;
    const base_path = `/setup/${i}`;

    if (!node || typeof node !== 'object') {
      add_issue(ERR.SCHEMA, base_path, 'node must be object');
      continue;
    }

    switch (node.op) {
      case 'spawn': {
        const to_zone = req_string(node.to_zone);
        const entity = req_string(node.entity);
        const entity_type = req_string(node.entity_type);
        const owner = (node.owner ?? 'seat') as InitSpawn['owner'];

        if (!to_zone || (!entity && !entity_type)) {
          add_issue(ERR.SCHEMA, base_path, 'to_zone and (entity or entity_type) are required');
          break;
        }

        assert_zone_exists(zones_index, to_zone, `${base_path}/to_zone`, add_issue);

        // 如果设置了 entity 优先通过 entity id 来获取实体
        if (entity) {
          // 此时 count 默认为 1
          const count = node.count == null ? 1 : Number(node.count);

          if (!entities_index[entity]) {
            add_issue(ERR.REF, `${base_path}/entity`, `entity '${entity}' not found`);
          }
          if (!is_positive_int(count)) {
            add_issue(ERR.SCHEMA, `${base_path}/count`, 'count must be positive integer');
          }

          out.push({ op: 'spawn', entity, to_zone, owner, count, props: node.props });
        } else if (entity_type) {
          // 否则通过 entity_type 获取所有实体
          const type_entities = Object.values(entities_index).filter((e: any) => e.type === entity_type);
          if (type_entities.length === 0) {
            add_issue(ERR.REF, `${base_path}/entity_type`, `no entity of type '${entity_type}' found`);
            break;
          }
          for (let index = 0; index < type_entities.length; index++) {
            out.push({ op: 'spawn', entity: (type_entities[index] as any).id, to_zone, owner, count: 1, props: node.props});
          }
        }

        break;
      }

      case 'shuffle': {
        const zone = req_string(node.zone);
        const owner = (node.owner ?? 'seat') as InitShuffle['owner'];

        if (!zone) {
          add_issue(ERR.SCHEMA, base_path, 'zone is required');
          break;
        }

        assert_zone_exists(zones_index, zone, `${base_path}/zone`, add_issue);
        out.push({ op: 'shuffle', zone, owner });
        break;
      }

      case 'deal': {
        const from_zone = req_string(node.from_zone);
        const to_zone = req_string(node.to_zone);
        const from_owner = (node.from_owner ?? 'seat') as InitDeal['from_owner'];
        const to_owner = (node.to_owner ?? 'seat') as InitDeal['to_owner'];
        const count = node.count == null ? 1 : Number(node.count);

        if (!from_zone || !to_zone) {
          add_issue(ERR.SCHEMA, base_path, 'from_zone and to_zone are required');
          break;
        }

        assert_zone_exists(zones_index, from_zone, `${base_path}/from_zone`, add_issue);
        assert_zone_exists(zones_index, to_zone, `${base_path}/to_zone`, add_issue);

        if (!is_positive_int(count)) {
          add_issue(ERR.SCHEMA, `${base_path}/count`, 'count must be positive integer');
        }

        out.push({ op: 'deal', from_zone, to_zone, from_owner, to_owner, count });
        break;
      }

      default: {
        add_issue(ERR.OP, base_path, `unsupported op '${node.op}'`);
        break;
      }
    }
  }

  return out;
}
