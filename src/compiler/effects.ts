import type { CompiledSpecType } from '../schema';

type MoveTopNode = {
  op: 'move_top';
  from_zone: string;
  to_zone: string;
  from_owner: 'by' | 'active' | string;
  to_owner: 'by' | 'active' | string;
  count: number;
};

const Supported_Effect_Op = ['move_top'];

export function normalize_effect_pipeline(
  raw: unknown,
  zones_index: CompiledSpecType['zones_index'],
  add_issue: (_code: string, _path: string, _msg: string) => void
): MoveTopNode[] | null {
  if (!Array.isArray(raw)) {
    add_issue('SCHEMA_ERROR', '/actions/*/effect', 'effect 必须是一个数组');
    return null;
  }

  const out: MoveTopNode[] = [];

  for (let i = 0; i < raw.length; i++) {
    const node = raw[i] as any;

    if (!node || !Supported_Effect_Op.includes(node.op)) {
      add_issue('EFFECT_UNSUPPORTED', `/actions/*/effect/${i}`, `unsupported op '${node?.op}'`);
      return null;
    }

    if (node.op === 'move_top') {
      const from_zone = String(node.from_zone ?? "");
      const to_zone   = String(node.to_zone ?? "");
      const from_owner = (node.from_owner ?? "by") as MoveTopNode["from_owner"];
      const to_owner   = (node.to_owner   ?? "by") as MoveTopNode["to_owner"];
      const count      = node.count == null ? 1 : Number(node.count);
      
      if (!from_zone || !to_zone) {
        add_issue("SCHEMA_ERROR", `/actions/*/effect/${i}`, "from_zone/to_zone is required");
        return null;
      }
      if (!Number.isInteger(count) || count <= 0) {
        add_issue("SCHEMA_ERROR", `/actions/*/effect/${i}/count`, "count must be positive integer");
        return null;
      }

      const zFrom = zones_index[from_zone];
      const zTo   = zones_index[to_zone];
      if (!zFrom) add_issue("REF_NOT_FOUND", `/actions/*/effect/${i}/from_zone`, `zone '${from_zone}' not found`);
      if (!zTo)   add_issue("REF_NOT_FOUND", `/actions/*/effect/${i}/to_zone`,   `zone '${to_zone}' not found`);

      const supported = (k: string) => k === "list" || k === "stack" || k === "queue";
      if (zFrom && !supported(zFrom.kind)) add_issue("KIND_UNSUPPORTED", `/actions/*/effect/${i}/from_zone`, `kind '${zFrom.kind}' not supported by move_top`);
      if (zTo   && !supported(zTo.kind))   add_issue("KIND_UNSUPPORTED", `/actions/*/effect/${i}/to_zone`,   `kind '${zTo.kind}' not supported by move_top`);

      out.push({
        op: "move_top",
        from_zone,
        to_zone,
        from_owner,
        to_owner,
        count
      });
    }
    
  }

  return out;
}