import { ExprNode, NodeKind } from '../ast';
import { Scope } from './scope';

/**
 * 表达式求值上下文
 * - state: 外部状态树
 * - scope: 变量作用域栈
 */
export interface EvalContext {
  state: any;
  scope: Scope;
}

/**
 * 根据路径访问 state/作用域变量，支持数组索引与负索引
 * 例如：state.vars.hp[-1]、$user.items[0]
 */
function resolve_path(path: string, ctx: EvalContext): unknown {
  if (!path) return undefined;
  const parts = path.split('.');
  if (!parts.length) return undefined;

  let current_value: any;
  const first_token = parts.shift()!;
  if (first_token.startsWith('$')) {
    current_value = ctx.scope.get_var(first_token);
  } else if (first_token === 'state') {
    current_value = ctx.state;
  } else {
    current_value = ctx.scope.get_var(first_token);
  }

  const index_regex = /(.*?)\[(.+?)\]/;

  for (const part of parts) {
    let token = part;
    let base_value: any = current_value;
    let match: RegExpExecArray | null;
    // 处理嵌套索引，例如 a[0][1]
    while ((match = index_regex.exec(token))) {
      const prop_str = match[1];
      const idx_token = match[2];
      if (prop_str) {
        let prop_name: any = prop_str;
        if (prop_name.startsWith('$')) {
          prop_name = ctx.scope.get_var(prop_name);
        }
        base_value = base_value?.[prop_name];
      }
      let idx: any = idx_token;
      if (idx.startsWith('$')) {
        idx = ctx.scope.get_var(idx);
      }
      idx = Number(idx);
      if (Array.isArray(base_value)) {
        if (idx < 0) idx = base_value.length + idx;
        base_value = base_value[idx];
      } else {
        base_value = undefined;
        break;
      }
      token = token.slice(match[0].length);
    }
    if (token) {
      let prop_name: any = token;
      if (prop_name.startsWith('$')) {
        prop_name = ctx.scope.get_var(prop_name);
      }
      base_value = base_value?.[prop_name];
    }
    current_value = base_value;
  }
  return current_value;
}

/**
 * 判断字符串是否是可解析路径
 */
function is_path(value: string): boolean {
  return value.startsWith('$') || value.startsWith('state');
}

/**
 * 递归求值表达式节点
 */
export function evaluate_expr(node: any, ctx: EvalContext): any {
  if (node === null || node === undefined) return undefined;
  if (typeof node === 'string') {
    return is_path(node) ? resolve_path(node, ctx) : node;
  }
  if (typeof node === 'number' || typeof node === 'boolean') return node;
  if (Array.isArray(node)) return node.map((n) => evaluate_expr(n, ctx));

  switch (node.kind) {
    case NodeKind.Bool:
      return node.value;
    case NodeKind.Compare: {
      const left_val = evaluate_expr(node.left, ctx);
      const right_val = evaluate_expr(node.right, ctx);
      switch (node.op) {
        case '==':
          return left_val === right_val;
        case '!=':
          return left_val !== right_val;
        case '>':
          return left_val > right_val;
        case '>=':
          return left_val >= right_val;
        case '<':
          return left_val < right_val;
        case '<=':
          return left_val <= right_val;
      }
      return false;
    }
    case NodeKind.Logic: {
      if (node.op === 'not') {
        return !Boolean(evaluate_expr(node.exprs[0], ctx));
      } else if (node.op === 'and') {
        for (const expr_item of node.exprs) {
          if (!evaluate_expr(expr_item, ctx)) return false;
        }
        return true;
      } else if (node.op === 'or') {
        for (const expr_item of node.exprs) {
          if (evaluate_expr(expr_item, ctx)) return true;
        }
        return false;
      }
      return false;
    }
    case NodeKind.Bind: {
      const bound_val = evaluate_expr(node.expr, ctx);
      ctx.scope.set_var(node.name, bound_val);
      return bound_val;
    }
    case NodeKind.Quantifier: {
      const value_list = ctx.scope.get_var(node.variable);
      if (!Array.isArray(value_list)) {
        return node.quantifier === 'forall';
      }
      if (node.quantifier === 'exists') {
        for (const item of value_list) {
          ctx.scope.push_scope({ [node.variable]: item });
          const res = evaluate_expr(node.expr, ctx);
          ctx.scope.pop_scope();
          if (res) return true;
        }
        return false;
      } else {
        for (const item of value_list) {
          ctx.scope.push_scope({ [node.variable]: item });
          const res = evaluate_expr(node.expr, ctx);
          ctx.scope.pop_scope();
          if (!res) return false;
        }
        return true;
      }
    }
    default:
      return undefined;
  }
}
