import { ExprNode, NodeKind } from '../ast';
import { Scope } from './scope';

export interface EvalContext {
  state: any;
  scope: Scope;
}

function resolvePath(path: string, ctx: EvalContext): unknown {
  if (!path) return undefined;
  const parts = path.split('.');
  if (!parts.length) return undefined;

  let current: any;
  const first = parts.shift()!;
  if (first.startsWith('$')) {
    current = ctx.scope.get(first);
  } else if (first === 'state') {
    current = ctx.state;
  } else {
    current = ctx.scope.get(first);
  }

  const indexRegex = /(.*?)\[(.+?)\]/;

  for (const part of parts) {
    let token = part;
    let base: any = current;
    let m: RegExpExecArray | null;
    // handle nested indices like a[0][1]
    while ((m = indexRegex.exec(token))) {
      const prop = m[1];
      const idxToken = m[2];
      if (prop) {
        let propName: any = prop;
        if (propName.startsWith('$')) {
          propName = ctx.scope.get(propName);
        }
        base = base?.[propName];
      }
      let idx: any = idxToken;
      if (idx.startsWith('$')) {
        idx = ctx.scope.get(idx);
      }
      idx = Number(idx);
      if (Array.isArray(base)) {
        if (idx < 0) idx = base.length + idx;
        base = base[idx];
      } else {
        base = undefined;
        break;
      }
      token = token.slice(m[0].length);
    }
    if (token) {
      let propName: any = token;
      if (propName.startsWith('$')) {
        propName = ctx.scope.get(propName);
      }
      base = base?.[propName];
    }
    current = base;
  }
  return current;
}

function isPath(value: string): boolean {
  return value.startsWith('$') || value.startsWith('state');
}

export function evaluateExpr(node: any, ctx: EvalContext): any {
  if (node === null || node === undefined) return undefined;
  if (typeof node === 'string') {
    return isPath(node) ? resolvePath(node, ctx) : node;
  }
  if (typeof node === 'number' || typeof node === 'boolean') return node;
  if (Array.isArray(node)) return node.map((n) => evaluateExpr(n, ctx));

  switch (node.kind) {
    case NodeKind.Bool:
      return node.value;
    case NodeKind.Compare: {
      const l = evaluateExpr(node.left, ctx);
      const r = evaluateExpr(node.right, ctx);
      switch (node.op) {
        case '==':
          return l === r;
        case '!=':
          return l !== r;
        case '>':
          return l > r;
        case '>=':
          return l >= r;
        case '<':
          return l < r;
        case '<=':
          return l <= r;
      }
      return false;
    }
    case NodeKind.Logic: {
      if (node.op === 'not') {
        return !Boolean(evaluateExpr(node.exprs[0], ctx));
      } else if (node.op === 'and') {
        for (const e of node.exprs) {
          if (!evaluateExpr(e, ctx)) return false;
        }
        return true;
      } else if (node.op === 'or') {
        for (const e of node.exprs) {
          if (evaluateExpr(e, ctx)) return true;
        }
        return false;
      }
      return false;
    }
    case NodeKind.Bind: {
      const val = evaluateExpr(node.expr, ctx);
      ctx.scope.set(node.name, val);
      return val;
    }
    case NodeKind.Quantifier: {
      const list = ctx.scope.get(node.variable);
      if (!Array.isArray(list)) {
        return node.quantifier === 'forall';
      }
      if (node.quantifier === 'exists') {
        for (const item of list) {
          ctx.scope.pushScope({ [node.variable]: item });
          const res = evaluateExpr(node.expr, ctx);
          ctx.scope.popScope();
          if (res) return true;
        }
        return false;
      } else {
        for (const item of list) {
          ctx.scope.pushScope({ [node.variable]: item });
          const res = evaluateExpr(node.expr, ctx);
          ctx.scope.popScope();
          if (!res) return false;
        }
        return true;
      }
    }
    default:
      return undefined;
  }
}
