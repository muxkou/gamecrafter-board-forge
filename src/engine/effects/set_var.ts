import type { EffectExecutor } from './types';

export type SetVarOp = {
  op: 'set_var';
  key: string;
  value: unknown;
};

export const exec_set_var: EffectExecutor<SetVarOp> = (op, ctx) => {
  return {
    ...ctx.state,
    vars: { ...ctx.state.vars, [op.key]: op.value },
  } as any;
};
