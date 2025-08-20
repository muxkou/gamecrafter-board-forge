/** ---------------------------
 *  单步推进（输入 / 上下文 / 输出）
 * ---------------------------*/

import { Action, EngineError, GameState, Event } from "./game.type";
import type { CompiledSpecType } from "../schema";

/** 单步推进输入 */
export interface StepInput {
  /** 当前完整游戏状态（必须来自上一步的输出）。 */
  game_state: GameState;
  /**
   * 本次要执行的动作。
   * 约束：seq 必须严格递增；by 必须等于 active_seat（或 "system"）。
   */
  action: Action;
  /** 可选：执行上下文（限额、遥测等）。 */
  context?: ReduceContext;
  /**
   * 可选：若提供 compiled_spec，则 step 将通过解释器（step_compiled）执行
   * actions_index 的 effect_pipeline，而不依赖硬编码动作分发。
   */
  compiled_spec?: CompiledSpecType;
}

/**
 * 运行期限额（防滥用与 DoS 防护）。
 *
 * 默认值来自 compiled_spec.eval_limits，调用者可通过 context.eval_limits 覆写。
 */
export interface EvalLimits {
  /** 表达式求值节点上限（越界报 EVAL_LIMIT_EXCEEDED）。 */
  max_expr_nodes?: number;
  /** 每次 reduce 内 RNG 调用次数上限。 */
  max_rng_calls_per_reduce?: number;
  /** for_each 等遍历的迭代上限。 */
  max_for_each_iter?: number;
  /** 单步执行超时（毫秒）。 */
  step_timeout_ms?: number;
}

/** 执行上下文（非规则的一部分，属于引擎运行策略） */
export interface ReduceContext {
  /** 执行期限额（用于防滥用与 DoS 防护）。 */
  eval_limits?: EvalLimits;
  /**
   * 若为 true，引擎可回传额外遥测（例如命中分支、管线耗时等）。
   * 仅用于调试/分析；不应影响语义结果。
   */
  telemetry?: boolean;
}

/** 单步推进输出 */
export interface StepOutput {
  /** 是否执行成功（成功则必须给出 next_state 与 event）。 */
  ok: boolean;
  /** 成功时：下一状态（纯函数式地返回；原状态不应被就地修改）。 */
  next_state?: GameState;
  /** 成功时：与本步对应的事件（用于日志/回放/审计）。 */
  event?: Event;
  /** 失败时：结构化引擎错误（如 ILLEGAL_ACTION / UNKNOWN_ACTION 等）。 */
  error?: EngineError;
  /**
   * 成功时：next_state 的哈希（sha256:...）。
   * 失败时可为空（实现也可选择回传当前 state 的哈希，非必需）。
   */
  state_hash?: string;
}