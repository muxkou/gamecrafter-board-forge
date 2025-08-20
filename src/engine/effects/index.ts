import { exec_move_top, type MoveTopOp } from './move_top';
import type { EffectExecutor } from './types';

export type EffectOp = MoveTopOp; // 后续并入更多 op

export const effectExecutors: Record<EffectOp['op'], EffectExecutor<any>> = {
  move_top: exec_move_top,
};


