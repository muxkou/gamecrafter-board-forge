import { describe, it, expect } from 'vitest';

import { eval_expr, eval_condition } from './expr.util';
import type { InterpreterCtx } from '../effects/types';

const ctx: InterpreterCtx = {
  compiled: {} as any,
  state: { vars: { score: 5 }, active_seat: 'A' } as any,
  call: { action: 'dummy', by: 'A', payload: { count: 3 } }
};

describe('eval_expr', () => {
  it('resolves constants and variables', () => {
    expect(eval_expr({ const: 1 }, ctx)).toBe(1);
    expect(eval_expr({ var: 'payload.count' }, ctx)).toBe(3);
    expect(eval_expr({ var: 'state.vars.score' }, ctx)).toBe(5);
  });

  it('supports arithmetic and comparison', () => {
    const ast = { op: '>', args: [ { op: '+', args: [ { var: 'payload.count' }, { const: 1 } ] }, { const: 3 } ] };
    expect(eval_expr(ast, ctx)).toBe(true);
  });

  it('supports logical combination and eval_condition', () => {
    const ast = {
      op: 'and',
      args: [
        { op: '>', args: [ { var: 'payload.count' }, { const: 1 } ] },
        { op: '<', args: [ { var: 'payload.count' }, { const: 5 } ] }
      ]
    };
    expect(eval_expr(ast, ctx)).toBe(true);

    const ast2 = { op: 'or', args: [ { const: false }, { op: 'not', args: [ { const: false } ] } ] };
    expect(eval_condition(ast2, ctx)).toBe(true);
  });
});

