// 假设公共类型都在 @bge/rc-types
import type { GameState, ReduceContext } from '../types';
import { CompiledSpecType } from '../schema';
import { validate_state } from './validate';
import { effect_executors, type EffectOp } from './effects';
import type { CompiledActionCall, InterpreterCtx } from './effects/types';
import { eval_condition } from './helpers/expr.util';
import { run_triggers } from './triggers';
import z from 'zod';

// 与编译产物的 actions_index[key] 对齐的最小必要形状
type CompiledActionDef = {
  input_spec?: unknown;
  require_ast?: unknown;
  effect_pipeline: Array<{ op: EffectOp['op'] } & Record<string, unknown>>;
  action_hash: string;
};

const EXECUTORS: Record<EffectOp['op'], (op: any, ctx: InterpreterCtx) => GameState> = effect_executors;

function jsonSchemaToZod(schema: any): z.ZodTypeAny {
  if (!schema || Object.keys(schema).length === 0) return z.any();
  switch (schema.type) {
    case 'object': {
      const props = schema.properties || {};
      const required: string[] = schema.required || [];
      const shape: Record<string, z.ZodTypeAny> = {};
      for (const key of Object.keys(props)) {
        const child = jsonSchemaToZod(props[key]);
        shape[key] = required.includes(key) ? child : child.optional();
      }
      let obj = z.object(shape);
      if (schema.additionalProperties === false) obj = obj.strict();
      return obj;
    }
    case 'string':
      return z.string();
    case 'number':
    case 'integer':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'array':
      return z.array(jsonSchemaToZod(schema.items || {}));
    default:
      return z.any();
  }
}

function getInputValidator(def: CompiledActionDef): z.ZodTypeAny {
  return (def as any).__inputValidator ?? ((def as any).__inputValidator = jsonSchemaToZod(def.input_spec));
}

export function step_compiled(args: {
  compiled_spec: CompiledSpecType;
  game_state: GameState;
  action: CompiledActionCall;
  context?: ReduceContext;
}): { next_state: GameState; action_hash: string } {
  const { compiled_spec, game_state, action, context } = args;

  // 取动作定义
  const def = (compiled_spec as any).actions_index?.[action.action] as CompiledActionDef | undefined;
  if (!def) {
    throw new Error(`未找到动作定义：${action.action}`);
  }
  const pipeline = def.effect_pipeline || [];
  if (!Array.isArray(pipeline)) {
    throw new Error(`动作 ${action.action} 的 effect_pipeline 非数组`);
  }

  const validator = getInputValidator(def);
  const parsed = validator.safeParse(action.payload);
  if (!parsed.success) {
    throw { code: 'BAD_PAYLOAD', issues: parsed.error.issues };
  }
  const call: CompiledActionCall = { ...action, payload: parsed.data };

  // 逐条执行（纯函数，不就地修改）
  let state = game_state;
  const ctx: InterpreterCtx = { compiled: compiled_spec, state, call, context };

  // evaluate precondition; if false, throw a structured error
  if (!eval_condition(def.require_ast, ctx)) {
    throw { code: 'REQUIRE_FAILED', action: action.action, message: `requirement not met for action ${action.action}` };
  }

  for (const op of pipeline) {
    const exec = EXECUTORS[op.op as EffectOp['op']];
    if (!exec) throw new Error(`不支持的 op: ${(op as any).op}`);
    ctx.state = state;                 // 保持最新
    state = exec(op as any, ctx);
  }

  // 主动作管线执行完毕后，运行对应触发器
  state = run_triggers({
    compiled_spec,
    game_state: state,
    trigger_key: `after:${call.action}`,
    call,
    context,
  });

  // 不变量
  const v = validate_state(state);
  if (v.errors.length) {
    throw new Error(`state invariants violated: ${JSON.stringify(v.errors)}`);
  }

  return { next_state: state, action_hash: def.action_hash };
}
