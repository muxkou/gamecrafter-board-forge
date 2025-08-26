import { describe, it, expect } from 'vitest';
import { create_bind_node, create_comparison_node, create_quantifier_node } from '../../ast';
import { evaluateExpr, Scope, type EvalContext } from '../index';

function createCtx(state: any): EvalContext {
  return { state, scope: new Scope() };
}

describe('evaluateExpr runtime', () => {
  it('supports variable binding and path resolution with negative index', () => {
    const state = { vars: { hp: [5, 7, 9] } };
    const ctx = createCtx(state);

    // bind last hp value to $hp
    const bind = create_bind_node('$hp', 'state.vars.hp[-1]' as any);
    evaluateExpr(bind, ctx);
    expect(ctx.scope.get('$hp')).toBe(9);

    // use bound variable in comparison
    const cmp = create_comparison_node('==', '$hp' as any, 9 as any);
    expect(evaluateExpr(cmp, ctx)).toBe(true);
  });

  it('evaluates quantifiers with local scopes', () => {
    const state = { nums: [1, 2, 3] };
    const ctx = createCtx(state);
    evaluateExpr(create_bind_node('$n', 'state.nums' as any), ctx);

    const exists = create_quantifier_node(
      'exists',
      '$n',
      create_comparison_node('>', '$n' as any, 2 as any),
    );
    expect(evaluateExpr(exists, ctx)).toBe(true);

    const forall = create_quantifier_node(
      'forall',
      '$n',
      create_comparison_node('>', '$n' as any, 0 as any),
    );
    expect(evaluateExpr(forall, ctx)).toBe(true);

    const forallFail = create_quantifier_node(
      'forall',
      '$n',
      create_comparison_node('>', '$n' as any, 2 as any),
    );
    expect(evaluateExpr(forallFail, ctx)).toBe(false);

    // ensure outer binding remains intact
    expect(ctx.scope.get('$n')).toEqual([1, 2, 3]);
  });
});
