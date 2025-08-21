import type { EffectExecutor } from './types';

export type SetPhaseOp = {
  op: 'set_phase';
  phase: string;
};

export const exec_set_phase: EffectExecutor<SetPhaseOp> = (op, ctx) => {
  return { ...ctx.state, phase: op.phase } as any;
};
