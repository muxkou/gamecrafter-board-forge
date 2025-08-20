import z from 'zod';

/**
 * 编译产物 v0 的结构校验（“目标形状”）。
 * 注意：这里大量使用 any/unknown 作为占位，真正的约束将由 compiler 产出时保证。
 */
export const CompiledSpec = z.object({
  
  /** 编译产物 schema 版本（与 DSL 的 schema_version 不同） */
  compiled_schema_version: z.number(),

  /** 全量产物的稳定哈希（sha256:...），由 canonical JSON 计算得到 */
  spec_id: z.string(),

  /** 来源 DSL 的元信息摘要（详见 CompiledSpecSourceMeta；此处用 any 收容） */
  source_meta: z.any(),

  /** 实体类型索引（按实体类型 ID 做键；结构在 compiler 里规范化） */
  entities_index: z.record(z.string(), z.any()),

  /** 区域索引（按区域 ID 做键；结构在 compiler 里规范化） */
  zones_index: z.record(z.string(), z.any()),

  /**
   * 初始化计划：
   * - plan：初始化指令序列（spawn/shuffle/deal/...）
   * - seed_vars：写入 game_state.vars 的初始变量
   */
  initializers: z.object({
    plan: z.array(z.any()),
    seed_vars: z.record(z.string(), z.any()),
  }),

  /**
   * 阶段状态机：
   * - initial_phase：初始阶段
   * - nodes：阶段 ID 列表
   * - transitions：规范化后的迁移边（from/to/when）
   * - turn_order：轮转规则（如 "clockwise"）
   */
  phase_graph: z.object({
    initial_phase: z.string(),
    nodes: z.array(z.string()),
    transitions: z.array(z.any()),
    turn_order: z.string(),
  }),

  /**
   * 动作索引（按动作 ID 做键）：
   * - input_spec：动作输入规格（已规范化）
   * - require_ast：前置条件的 AST/IR
   * - effect_pipeline：原子效果序列
   * - action_hash：动作级别的语义哈希
   */
  actions_index: z.record(z.string(), z.any()),

  /** 触发器索引：按触发 key 做键，值为规范化后的效果管线列表 */
  triggers_index: z.record(z.string(), z.any()),

  /** 胜负判定链（与 DSL 语义一致，但应是已编译/规范化的表达式） */
  victory: z.object({
    order: z.array(
      z.object({
        when: z.any(),
        result: z.string(),
      })
    ),
  }),

  /** 不变量定义（断言），用于运行期校验（error/warn） */
  invariants: z.array(z.any()),

  /** 读能力/可见性裁剪规则（模板中仅给出最小占位） */
  read_caps: z.record(z.string(), z.any()),

  /**
   * 运行期限额（防滥用）：
   * - max_expr_nodes：表达式节点上限
   * - max_rng_calls_per_reduce：每步 RNG 调用上限
   * - max_for_each_iter：遍历迭代上限
   */
  eval_limits: z.object({
    max_expr_nodes: z.number(),
    max_rng_calls_per_reduce: z.number(),
    max_for_each_iter: z.number(),
  }),
});

/** 安全解析 compiled spec：成功返回 { success:true, data }；失败返回 { success:false, error } */
export function parse_compiled(input: unknown) {
  return CompiledSpec.safeParse(input);
}

export type CompiledSpecType = z.infer<typeof CompiledSpec>;