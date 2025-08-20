// 假设公共类型都在 @bge/rc-types
import type { GameState } from '../types';
import { CompiledSpecType } from '../schema';
import { validate_state } from './validate';
import { effectExecutors, type EffectOp } from './effects';
import type { CompiledActionCall, InterpreterCtx } from './effects/types';

// 与编译产物的 actions_index[key] 对齐的最小必要形状
type CompiledActionDef = {
  input_spec?: unknown;
  require_ast?: unknown;
  effect_pipeline: Array<{ op: EffectOp['op'] } & Record<string, unknown>>;
  action_hash: string;
};

const EXECUTORS: Record<EffectOp['op'], (op: any, ctx: InterpreterCtx) => GameState> = effectExecutors;

export function step_compiled(args: {
  compiled_spec: CompiledSpecType;
  game_state: GameState;
  action: CompiledActionCall;
}): { next_state: GameState; action_hash: string } {
  const { compiled_spec, game_state, action } = args;

  // 取动作定义
  const def = (compiled_spec as any).actions_index?.[action.action] as CompiledActionDef | undefined;
  if (!def) {
    throw new Error(`未找到动作定义：${action.action}`);
  }
  const pipeline = def.effect_pipeline || [];
  if (!Array.isArray(pipeline)) {
    throw new Error(`动作 ${action.action} 的 effect_pipeline 非数组`);
  }

  // 逐条执行（纯函数，不就地修改）
  let state = game_state;
  const ctx: InterpreterCtx = { compiled: compiled_spec, state, call: action };

  for (const op of pipeline) {
    const exec = EXECUTORS[op.op as EffectOp['op']];
    if (!exec) throw new Error(`不支持的 op: ${(op as any).op}`);
    ctx.state = state;                 // 保持最新
    state = exec(op as any, ctx);
  }

  // 不变量
  const v = validate_state(state);
  if (v.errors.length) {
    throw new Error(`state invariants violated: ${JSON.stringify(v.errors)}`);
  }

  return { next_state: state, action_hash: def.action_hash };
}
