/** 结构/领域问题统一表示（编译期与静态校验使用） */
export interface ValidationIssue {
  /** 机器可读错误码（如 SCHEMA_ERROR / ACTION_REF_NOT_FOUND / VISIBILITY_SCOPE_MISMATCH）。 */
  code: string;
  /** JSON Pointer 风格或近似路径（如 "/phases/0/transitions/1"）。 */
  path: string;
  /** 人类可读消息（面向设计者/日志）。 */
  message: string;
  /** 可选：修复建议或文档提示。 */
  hint?: string;
}