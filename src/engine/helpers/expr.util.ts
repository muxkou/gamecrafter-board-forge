import type { InterpreterCtx } from '../effects/types';

// Utility to safely resolve a dotted path from ctx.state or ctx.call.payload
function resolve_path(path: string, ctx: InterpreterCtx): unknown {
  const parts = path.split('.');
  if (!parts.length) return undefined;
  let base: any;
  const first = parts.shift()!;
  if (first === 'state') {
    base = ctx.state as any;
  } else if (first === 'payload') {
    base = ctx.call.payload as any;
  } else if (first === 'call' && parts[0] === 'payload') {
    parts.shift();
    base = ctx.call.payload as any;
  } else {
    // attempt payload then state when no explicit prefix
    const tryPayload = path.split('.').reduce((o: any, k: string) => o?.[k], ctx.call.payload as any);
    if (tryPayload !== undefined) return tryPayload;
    return path.split('.').reduce((o: any, k: string) => o?.[k], ctx.state as any);
  }
  return parts.reduce((o: any, k: string) => o?.[k], base);
}

/**
 * Evaluate a DSL expression AST. Supports variable references,
 * comparisons, arithmetic and logical operations.
 */
export function eval_expr(ast: unknown, ctx: InterpreterCtx): any {
  if (ast === null || ast === undefined) return undefined;
  if (typeof ast === 'number' || typeof ast === 'string' || typeof ast === 'boolean') {
    return ast;
  }
  if (Array.isArray(ast)) return ast.map(a => eval_expr(a, ctx));
  if (typeof ast === 'object') {
    const node = ast as any;
    if ('const' in node) return node.const;
    if ('var' in node && typeof node.var === 'string') {
      return resolve_path(node.var, ctx);
    }
    if ('op' in node) {
      const op = node.op as string;
      const args = (node.args ?? []).map((a: any) => eval_expr(a, ctx));
      switch (op) {
        case 'get': {
          // get(base, key1, key2, ...)
          const [base, ...path] = args;
          let cur: any = base;
          for (const k of path) {
            if (cur == null) return undefined;
            const key = typeof k === 'number' ? k : String(k);
            cur = cur[key as any];
          }
          return cur;
        }
        case '+':
        case 'add':
          return args[0] + args[1];
        case '-':
        case 'sub':
          return args[0] - args[1];
        case '*':
        case 'mul':
          return args[0] * args[1];
        case '/':
        case 'div':
          return args[0] / args[1];
        case '%':
        case 'mod':
          return args[0] % args[1];
        case '==':
        case 'eq':
          return args[0] === args[1];
        case '!=':
        case 'neq':
          return args[0] !== args[1];
        case '>':
        case 'gt':
          return args[0] > args[1];
        case '>=':
        case 'gte':
        case 'ge':
          return args[0] >= args[1];
        case '<':
        case 'lt':
          return args[0] < args[1];
        case '<=':
        case 'lte':
        case 'le':
          return args[0] <= args[1];
        case 'and':
        case '&&':
          return args.every(Boolean);
        case 'or':
        case '||':
          return args.some(Boolean);
        case 'not':
        case '!':
          return !Boolean(args[0]);
        default:
          throw new Error(`Unsupported op: ${op}`);
      }
    }
  }
  return undefined;
}

/**
 * Convenience wrapper to coerce the result of `eval_expr`
 * into a boolean.
 */
export function eval_condition(ast: unknown, ctx: InterpreterCtx): boolean {
  if (ast === undefined) return true;
  return !!eval_expr(ast, ctx);
}
