import { CompiledSpecType } from '../schema';
import {
  StepInput,
  StepOutput,
  EngineError,
  Event,
  GameState,
  InitialStateInput,
  InitialStateOutput,
  ReduceContext,
} from '../types';
import { canonical_stringify, hash_sha256 } from '../utils/canonical.util';
import { mulberry32 } from '../utils/rng.util';
import { end_turn, move_top } from './actions';
import { validate_state } from './validate';
import { step_compiled } from './step_compiled';

/**
 * initial_state()
 * ----------------
 * 用途：根据 compiled_spec + seats + seed 构造**首个游戏状态**，并返回初始化事件与状态哈希。
 * 设计原则：
 *  - 纯函数：不做 IO；只由入参决定出参。
 *  - 确定性：所有随机只来自 seed（mulberry32），所有哈希用 canonical_stringify 保证稳定序列化。
 *  - 占位实现：zones/entities 等具体初始化留待后续通过 compiled_spec.initializers.plan 重放。
 */
export async function initial_state(input: InitialStateInput): Promise<InitialStateOutput> {
  // 逻辑时间/创建时间（秒级）。注意：meta.created_at 不参与 spec_id，也不参与 state_hash。
  const now = Math.floor(Date.now() / 1000);

  // 席位列表与 RNG 初始化（mulberry32 的状态使用 uint32 规范化）
  const seats = input.seats;
  const rng = mulberry32(input.seed >>> 0);

  const zones_index = input.compiled_spec.zones_index as CompiledSpecType['zones_index'];

  // owner_key 规则：public → "_"；per_seat → 每个 seat_id
  const owner_keys_for = (scope: 'public' | 'per_seat') => (scope === 'public' ? ['_'] : seats);

  // 给不同 kind 先建一个空实例（后续 grid/hexgrid/track 再细化）
  const empty_instance_for = (kind: string) => {
    switch (kind) {
      case 'list':
      case 'stack':
      case 'queue':
      case 'set':
        return { kind, items: [] as string[] };
      case 'grid':
      case 'hexgrid':
      case 'track':
      default:
        // 先占位
        return { kind, cells: [] as string[][] };
    }
  };

  // 为了状态哈希稳定，按 zone_id 升序初始化
  const zones_runtime = Object.fromEntries(
    Object.keys(zones_index)
      .sort()
      .map((zone_id) => {
        const z = zones_index[zone_id];
        const instances = Object.fromEntries(
          owner_keys_for(z.scope).map((owner) => [owner, empty_instance_for(z.kind)]),
        );
        return [
          zone_id,
          {
            kind: z.kind,
            scope: z.scope,
            of: z.of,
            capacity: z.capacity,
            instances, // { "_": {...} } 或 { "s1": {...}, "s2": {...} }
          },
        ];
      }),
  );

  // 最小可用的 GameState 骨架
  const game_state: GameState = {
    // 从编译产物取初始阶段
    phase: input.compiled_spec.phase_graph.initial_phase,
    // 回合号（占位：默认 1；若需要从 seed_vars 中读取可后续调整）
    turn: 1,
    // 席位与当前行动席位（默认 seats[0]；无席位则为 null）
    seats,
    active_seat: seats[0] ?? null,

    // 全局变量：先合并 compiled_spec.initializers.seed_vars，再用 overrides.vars 覆盖
    vars: {
      ...input.compiled_spec.initializers.seed_vars,
      ...(input.overrides?.vars ?? {}),
    },

    // 分席位变量：为每个 seat 建立对象，并套用 overrides.per_seat[seat] 覆盖
    per_seat: Object.fromEntries(
      seats.map((s) => [s, { ...(input.overrides?.per_seat?.[s] ?? {}) }]),
    ),

    // 实体/区域：模板占位（下一步会根据 zones_index 等执行真正初始化）
    entities: {},
    zones: zones_runtime,

    // RNG 当前内部状态（字符串化以便 JSON 序列化）
    rng_state: String(rng.state >>> 0),

    // 元信息：包含 schema 版本、创建时间与最后动作序号
    meta: { schema_version: 1, created_at: now, last_seq: 0 },
  };

  // 初始化事件（占位一条 "setup"），方便回放/审计
  const init_events = [{ seq: 0, by: 'system', id: 'setup', payload: {}, ts_logical: 0 }];

  const v = validate_state(game_state);
  if (v.errors.length) {
    // 初始化就坏了：直接抛（让 CLI 以退出码 3 终止），或者换成你喜欢的错误返回机制
    throw new Error(`INVARIANT_FAILED_AT_INIT: ${JSON.stringify(v.errors)}`);
  }

  // 计算初始状态哈希：用于一致性校验与回放锚点
  // 在哈希计算前移除 meta.created_at，以保持与时间无关的确定性
  const game_state_for_hash = {
    ...game_state,
    meta: { ...game_state.meta, created_at: undefined },
  };
  const state_hash = hash_sha256(canonical_stringify(game_state_for_hash));

  return { game_state, init_events, state_hash };
}

/** 构造 EngineError 的小工具（统一结构） */
function err(code: string, message: string, details?: unknown): EngineError {
  return { code, message, details };
}

export async function step(input: StepInput): Promise<StepOutput> {
  const { game_state, action, compiled_spec, context } = input;

  // 校验 1：动作序号必须严格递增 1
  if (action.seq !== game_state.meta.last_seq + 1) {
    return {
      ok: false,
      error: err('DUPLICATE_SEQ', '必须严格递增 1', {
        last_seq: game_state.meta.last_seq,
        got: action.seq,
      }),
    };
  }

  // 校验 2：行动者必须是当前席位（系统动作除外）
  if (action.by !== 'system' && action.by !== game_state.active_seat) {
    return {
      ok: false,
      error: err('ILLEGAL_ACTION', 'not active seat', {
        expected: game_state.active_seat,
        actual: action.by,
      }),
    };
  }

  let next: GameState | EngineError | null = null;

  // 优先：若提供 compiled_spec，走解释器路径
  if (compiled_spec) {
    try {
      const ctx: ReduceContext | undefined =
        compiled_spec.eval_limits || context?.eval_limits
          ? { ...context, eval_limits: { ...compiled_spec.eval_limits, ...context?.eval_limits } }
          : context;
      const { next_state } = step_compiled({
        compiled_spec,
        game_state,
        action: { action: action.id, by: action.by, payload: (action as any).payload ?? {} },
        context: ctx,
      } as any);
      next = { ...next_state, meta: { ...next_state.meta, last_seq: action.seq } };
    } catch (e: any) {
      return { ok: false, error: err('COMPILED_EXEC_ERROR', e?.message ?? String(e)) };
    }
  } else {
    // 兼容路径：硬编码分发
    if (action.id === 'end_turn') {
      next = await end_turn(game_state, action);
    } else if (action.id === 'move_top') {
      next = await move_top(game_state, action, err);
    }
  }

  if (next) {
    if ((next as any).code && (next as any).message) {
      // 判断为 EngineError
      return {
        ok: false,
        error: next as EngineError,
      };
    }

    const ev: Event = {
      seq: action.seq,
      by: action.by,
      id: action.id,
      payload: action.payload,
      ts_logical: action.seq,
    };

    const v = validate_state(next as GameState);
    if (v.errors.length) {
      return {
        ok: false,
        error: err('INVARIANT_FAILED', 'state invariants violated', { errors: v.errors }),
      };
    }

    // 新状态哈希
    const state_hash = hash_sha256(canonical_stringify(next));

    return { ok: true, next_state: next as GameState, event: ev, state_hash };
  }

  // 未实现的动作 → 统一报错
  return {
    ok: false,
    error: err('UNKNOWN_ACTION', `action '${action.id}' not implemented`),
  };
}

export type { Strategy, StrategyContext } from './strategy';
export { first_strategy, random_strategy } from './strategies';
