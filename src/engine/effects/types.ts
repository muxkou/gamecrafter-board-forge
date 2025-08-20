import type { GameState, ReduceContext } from '../../types';
import type { CompiledSpecType } from '../../schema';

export type CompiledActionCall = {
  action: string;
  by?: string;
  payload?: Record<string, unknown>;
};

export type InterpreterCtx = {
  compiled: CompiledSpecType;
  state: GameState;
  call: CompiledActionCall;
  context?: ReduceContext;
};

export type EffectExecutor<T> = (op: T, ctx: InterpreterCtx) => GameState;


357721