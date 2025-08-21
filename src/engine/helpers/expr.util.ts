import type { InterpreterCtx } from '../effects/types';

/**
 * Evaluate a DSL expression AST. Placeholder implementation
 * supports booleans or objects in the shape of `{ const: any }`.
 * Other shapes default to `true`.
 */
export function eval_expr(ast: unknown, _ctx: InterpreterCtx): any {
  if (typeof ast === 'boolean') return ast;
  if (ast && typeof ast === 'object' && 'const' in (ast as any)) {
    return (ast as any).const;
  }
  // TODO: hook up real expression evaluator
  return true;
}

/**
 * Convenience wrapper to coerce the result of `eval_expr`
 * into a boolean.
 */
export function eval_condition(ast: unknown, ctx: InterpreterCtx): boolean {
  return Boolean(eval_expr(ast, ctx));
}
