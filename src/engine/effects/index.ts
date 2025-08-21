import { exec_move_top, type MoveTopOp } from './move_top';
import { exec_shuffle, type ShuffleOp } from './shuffle';
import { exec_deal, type DealOp } from './deal';
import { exec_set_var, type SetVarOp } from './set_var';
import type { EffectExecutor } from './types';

export type EffectOp = MoveTopOp | ShuffleOp | DealOp | SetVarOp;

export const effectExecutors: Record<EffectOp['op'], EffectExecutor<any>> = {
  move_top: exec_move_top,
  shuffle: exec_shuffle,
  deal: exec_deal,
  set_var: exec_set_var,
};


