import type { CompiledSpecType } from '../schema';
import type { ValidationIssue } from './issue.type';

/** ---------------------------
 *  编译阶段（输入 / 诊断 / 输出）
 * ---------------------------*/

/** 编译入口参数 */
export interface CompileInput {
  /** 设计师的 DSL 源对象（已解析为 JS 对象；可能来自 JSON/YAML）。 */
  dsl: unknown;
  /** 编译选项（可选）。实现可选择性支持。 */
  options?: {
    /**
     * 是否对产物进行规范化（canonicalize）。
     * 若编译器实现该选项，通常会影响 spec_id（稳定哈希）的计算。
     * 建议默认开启；这里不强制。
     */
    canonicalize?: boolean;
    /**
     * 严格模式：若为 true，编译器可将本会作为 warnings 的问题升级为错误。
     * 典型用途：CI 门禁更严格时使用。
     */
    strict?: boolean;
  };
}

/** 编译输出（含成功/失败两种分支） */
export interface CompileOutput {
  /** 是否编译成功（成功时 errors 为空；warnings 可能非空）。 */
  ok: boolean;
  /** 成功时给出编译产物；失败为 null。 */
  compiled_spec: CompiledSpecType | null;
  /**
   * 产物稳定哈希（sha256:...）。
   * 成功时等于 compiled_spec.spec_id；失败为 null。
   */
  spec_id: string | null;
  /** 致命错误列表（失败原因）。 */
  errors: ValidationIssue[];
  /** 非致命告警列表（建议修复/潜在风险）。 */
  warnings: ValidationIssue[];
  /** 编译耗时（毫秒），用于指标与调优。 */
  time_ms: number;
}