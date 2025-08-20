/** ---------------------------
 *  初始化 / 运行期（输入 / 输出）
 * ---------------------------*/

import type { CompiledSpecType } from "../schema";
import type { GameState, Event } from "./game.type";

/** 初始化入口参数（开一盘） */
export interface InitialStateInput {
  /** 编译产物（必须与当前引擎兼容）。 */
  compiled_spec: CompiledSpecType;
  /**
   * 本局参与的席位 ID 列表。
   * 长度必须满足 compiled_spec.source_meta.seats 的范围约束。
   */
  seats: string[];
  /**
   * 随机种子（uint32 语义；实现可用 >>> 0 规整）。
   * 所有初始化中涉及随机（如洗牌）必须只来源于此。
   */
  seed: number;
  /** 可选：对初始变量的覆盖。 */
  overrides?: {
      /**
       * 全局变量覆盖（合入 game_state.vars）。
       * 常用于参数化初始血量、回合数等。
       */
      vars?: Record<string, unknown>;
      /**
       * 分席位变量覆盖（合入 game_state.per_seat[seat]）。
       * 常用于给不同席位设定不对称初始资源。
       */
      per_seat?: Record<string, Record<string, unknown>>;
  };
}

/** 初始化输出（用于创建新对局或模拟起点） */
export interface InitialStateOutput {
  /** 初始游戏状态（纯 JSON；后续计算从这里开始）。 */
  game_state: GameState;
  /**
   * 初始化事件（通常包含 "setup" 等系统事件；可选）。
   * 主要用于审计/回放一致性。
   */
  init_events: Event[];
  /**
   * 初始状态哈希（sha256:...），以 canonical JSON 计算。
   * 用于一致性校验与回放起点定位。
   */
  state_hash: string;
}