import type { GameState, ReduceContext } from '../types';
import type { CompiledSpecType } from '../schema';
import { effectExecutors, type EffectOp } from './effects';
import type { CompiledActionCall, InterpreterCtx } from './effects/types';

/**
 * 根据触发 key 执行效果管线。
 *
 * 编译产物中的 triggers_index 按触发 key 存放一组效果管线，每条管线为一系列原子效果。
 */
export function run_triggers(args: {
  compiled_spec: CompiledSpecType;
  game_state: GameState;
  trigger_key: string;
  call: CompiledActionCall;
  context?: ReduceContext;
}): GameState {
  const { compiled_spec, game_state, trigger_key, call, context } = args;
  const pipelines = ((compiled_spec as any).triggers_index ?? {})[trigger_key] as Array<any> | undefined;
  if (!pipelines || pipelines.length === 0) return game_state;

  let state = game_state;
  const ctx: InterpreterCtx = { compiled: compiled_spec, state, call, context };

  for (const pipeline of pipelines) {
    const ops = Array.isArray(pipeline) ? pipeline : [pipeline];
    for (const op of ops) {
      const exec = effectExecutors[op.op as EffectOp['op']];
      if (!exec) throw new Error(`不支持的 op: ${(op as any).op}`);
      ctx.state = state;
      state = exec(op as any, ctx);
    }
  }

  return state;
}
