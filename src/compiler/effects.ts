import type { CompiledSpecType } from '../schema';

type MoveTopNode = {
  op: 'move_top';
  from_zone: string;
  to_zone: string;
  from_owner: 'by' | 'active' | string;
  to_owner: 'by' | 'active' | string;
  count: number;
};

type ShuffleNode = {
  op: 'shuffle';
  zone: string;
  owner: 'by' | 'active' | string;
};

type DealNode = {
  op: 'deal';
  from_zone: string;
  to_zone: string;
  from_owner: 'by' | 'active' | string;
  to_owner: 'by' | 'active' | 'seat' | string;
  count: number;
};

type SetVarNode = {
  op: 'set_var';
  key: string;
  value: unknown;
};

type SetPhaseNode = {
  op: 'set_phase';
  phase: string;
};

type EffectNode =
  | MoveTopNode
  | ShuffleNode
  | DealNode
  | SetVarNode
  | SetPhaseNode;

const Supported_Effect_Op = ['move_top', 'shuffle', 'deal', 'set_var', 'set_phase'];

export function normalize_effect_pipeline(
  raw: unknown,
  zones_index: CompiledSpecType['zones_index'],
  add_issue: (_code: string, _path: string, _msg: string) => void
): EffectNode[] | null {
  if (!Array.isArray(raw)) {
    add_issue('SCHEMA_ERROR', '/actions/*/effect', 'effect 必须是一个数组');
    return null;
  }

  const out: EffectNode[] = [];

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
    else if (node.op === 'shuffle') {
      const zone = String(node.zone ?? "");
      const owner = (node.owner ?? 'by') as ShuffleNode['owner'];
      if (!zone) {
        add_issue('SCHEMA_ERROR', `/actions/*/effect/${i}`, 'zone is required');
        return null;
      }
      const z = zones_index[zone];
      if (!z) add_issue('REF_NOT_FOUND', `/actions/*/effect/${i}/zone`, `zone '${zone}' not found`);
      const supported = (k: string) => k === 'list' || k === 'stack' || k === 'queue';
      if (z && !supported(z.kind)) add_issue('KIND_UNSUPPORTED', `/actions/*/effect/${i}/zone`, `kind '${z.kind}' not supported by shuffle`);
      out.push({ op: 'shuffle', zone, owner });
    }
    else if (node.op === 'deal') {
      const from_zone = String(node.from_zone ?? "");
      const to_zone   = String(node.to_zone ?? "");
      const from_owner = (node.from_owner ?? 'by') as DealNode['from_owner'];
      const to_owner   = (node.to_owner   ?? 'seat') as DealNode['to_owner'];
      const count      = node.count == null ? 1 : Number(node.count);

      if (!from_zone || !to_zone) {
        add_issue('SCHEMA_ERROR', `/actions/*/effect/${i}`, 'from_zone/to_zone is required');
        return null;
      }
      if (!Number.isInteger(count) || count <= 0) {
        add_issue('SCHEMA_ERROR', `/actions/*/effect/${i}/count`, 'count must be positive integer');
        return null;
      }

      const zFrom = zones_index[from_zone];
      const zTo   = zones_index[to_zone];
      if (!zFrom) add_issue('REF_NOT_FOUND', `/actions/*/effect/${i}/from_zone`, `zone '${from_zone}' not found`);
      if (!zTo)   add_issue('REF_NOT_FOUND', `/actions/*/effect/${i}/to_zone`, `zone '${to_zone}' not found`);
      const supported = (k: string) => k === 'list' || k === 'stack' || k === 'queue';
      if (zFrom && !supported(zFrom.kind)) add_issue('KIND_UNSUPPORTED', `/actions/*/effect/${i}/from_zone`, `kind '${zFrom.kind}' not supported by deal`);
      if (zTo   && !supported(zTo.kind))   add_issue('KIND_UNSUPPORTED', `/actions/*/effect/${i}/to_zone`,   `kind '${zTo.kind}' not supported by deal`);

      out.push({ op: 'deal', from_zone, to_zone, from_owner, to_owner, count });
    }
    else if (node.op === 'set_var') {
      const key = String(node.key ?? "");
      if (!key) {
        add_issue('SCHEMA_ERROR', `/actions/*/effect/${i}`, 'key is required');
        return null;
      }
      out.push({ op: 'set_var', key, value: node.value });
    }
    else if (node.op === 'set_phase') {
      const phase = String(node.phase ?? "");
      if (!phase) {
        add_issue('SCHEMA_ERROR', `/actions/*/effect/${i}`, 'phase is required');
        return null;
      }
      out.push({ op: 'set_phase', phase });
    }

  }

  return out;
}