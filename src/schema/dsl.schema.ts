import { z } from 'zod';

/**
 * DSL v0 的结构校验（不做复杂领域检查）。
 */

/**
 * 坐席 metadata
 */
const DSL_Metadata_Seats = z.object({
  /** 最小席位数（>=1） */
  min: z.number().min(1, '最小席位数不能小于 1'),
  /** 最大席位数（>=min） */
  max: z.number().min(1, '最小席位数不能小于 1'),
  /** 默认席位数（min ≤ default ≤ max） */
  default: z.number(),
})
.refine((data) => data.max >= data.min, {
  message: '最大席位数不能小于最小席位数',
  path: ['max'],
})
.refine((data) => data.default >= data.min && data.default <= data.max, {
  message: '默认席位数必须在 [min, max] 范围内',
  path: ['default'],
});

/**
 * 实体类型定义 （只描述结构，不含实例数据）
 */
const DSL_Entity = z.object({
  /** 实体类型 ID（唯一） */
  id: z.string(),
  /** 实体类型 */
  type: z.string().optional(),
  /** 属性字典（此处放宽为 any；后续 compiler 可细化类型系统） */
  props: z.record(z.string(), z.any()),
});

/**
 * 区域（zone）定义列表：牌库、手牌、场面等
 */
const DSL_Zone = z.object({
  /** 区域 ID（唯一） */
  id: z.string(),

  /**
   * 区域的行为语义：
   * - stack: 栈/牌堆（一般 LIFO 先进先出）
   * - queue: 队列（FIFO 后进先出）
   * - list: 有序列表（可插入/移除）
   * - set: 集合（无序、不重复）
   * - grid/hexgrid: 网格/六边形网格
   * - track: 轨道/路径
   */
  kind: z.enum(['stack', 'queue', 'list', 'set', 'grid', 'hexgrid', 'track']),

  /**
   * 作用域：
   * - public: 全局共享一份
   * - per_seat: 每个席位各有一份
   */
  scope: z.enum(['public', 'per_seat']),

  /** 该区域允许容纳的实体类型（必须与 entities[].id 对齐） */
  of: z.array(z.string()).optional(),
  of_types: z.array(z.string()).optional(),

  /**
   * 可见性：
   * - owner: 仅拥有者（per_seat 时）可见
   * - all: 所有人可见
   * - none: 对任何席位都不可见（通常用于隐藏信息池/黑盒）
   * - custom: 自定义（需要在 read_caps/规则里进一步指明）
   */
  visibility: z.enum(['owner', 'all', 'none', 'custom']),

  /** 容量上限（可选，省略表示无限制或由规则另行约束） */
  capacity: z.number().optional(),
})
.superRefine((zone, ctx) => {
  // visibility = owner 仅对 per_seat 有意义
  if (zone.visibility === 'owner' && zone.scope !== 'per_seat') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'visibility=owner requires scope=per_seat (visibility = owner 仅对 per_seat 有意义)',
      path: ['scope'], // 也可标到 ['visibility']
    });
  }
});

/**
 * 初始状态相关的声明（可选）：
 * - vars：全局变量的默认值
 * - per_seat.defaults：每席位变量的默认值
 * 真正的“初始化动作序列”会被编译进 compiled_spec.initializers.plan
 */
const DSL_State = z
.object({
  vars: z.record(z.string(), z.any()).optional(),
  per_seat: z
    .object({
      defaults: z.record(z.string(), z.any()).optional(),
    })
    .optional(),
});

/**
 * 阶段机定义：
 * - id：阶段 ID
 * - on_enter：进入阶段时的效果（占位，最终编译为 plan/trigger）
 * - allowed_actions：此阶段允许的动作 ID 集合
 * - transitions：可迁移的边（目标 to + 条件 when）
 */
const DSL_Phases = z.array(
  z.object({
    id: z.string(),
    on_enter: z.any().optional(),
    allowed_actions: z.array(z.string()).optional(),
    transitions: z
      .array(
        z.object({
          to: z.string(),
          when: z.any(), // 目前放宽为 any；compiler 会把它规范化为表达式 IR
        })
      )
      .optional(),
  })
);


/**
 * 表达式 AST（用于 require/when）：
 * - 常量：{ const: any }
 * - 变量：{ var: string }，可指向 state / payload 等（见 eval_expr）
 * - 操作：{ op: string, args?: Expr[] }
 * 同时容忍原生标量与数组，保持向后兼容。
 */
const DSL_Expr: z.ZodTypeAny = z.lazy(() =>
  z.union([
    z.object({ const: z.any() }).strict(),
    z.object({ var: z.string() }).strict(),
    z.object({ op: z.string(), args: z.array(DSL_Expr).optional() }).strict(),
    z.string(),
    z.number(),
    z.boolean(),
    z.array(DSL_Expr),
  ])
);

/**
 * 最小 JSON Schema（仅覆盖运行期转换所需的关键字段）：
 * - type: object/string/number/integer/boolean/array
 * - properties/required/additionalProperties（当 type=object）
 * - items（当 type=array）
 * 允许透传其他字段（passthrough），由上层编译进一步校验/忽略。
 */
const DSL_Input_JSONSchema = z
  .object({
    type: z.enum(['object', 'string', 'number', 'integer', 'boolean', 'array']).optional(),
    properties: z.record(z.string(), z.any()).optional(),
    required: z.array(z.string()).optional(),
    additionalProperties: z.boolean().optional(),
    items: z.any().optional(),
  })
  .passthrough();

/**
 * effect 节点的基础形状：
 * - 必须包含 op 字段；具体参数在编译阶段做语义校验（normalize_effect_pipeline）。
 * 如需在 DSL 层面强约束 op 枚举，可将 op 改为 z.enum([...])；此处保持可扩展性。
 */
const DSL_EffectNode = z.object({ op: z.string() }).passthrough();

/**
 * 动作定义：
 * - id：动作 ID
 * - input：输入规格/提示（参数 schema），现阶段为 any
 * - require：前置条件表达式（any，编译为 AST/IR）
 * - effect：效果管线（any，编译为规范化的原子 op 序列）
 */
const DSL_Action = z
  .object({
    id: z.string().min(1, 'action id 不能为空'),
    input: DSL_Input_JSONSchema.optional(),
    require: DSL_Expr.optional(),
    effect: z.array(DSL_EffectNode).optional(),
    auto_enum: z.boolean().optional(),
  })
  .strict();


/**
 * 胜负判定优先链（从上至下求值，命中即终局）：
 * - when：条件表达式（any，编译为 AST/IR）
 * - result：结果（如 "win:seat_a" / "tie" 等，由规则约定）
 */
const DSL_Victory = z.object({
  order: z.array(
    z.object({
      when: z.any(),
      result: z.string(),
    })
  ),
});

/**
 * DSL Base
 */
export const DSL_Base = z.object({
  /** DSL 自身的 schema 版本（不是编译产物版本） */
  schema_version: z.number(),

  /** 引擎兼容范围（语义类似 semver range，例如 '>=1.0.0 <2'） */
  engine_compat: z.string(),

  /** 规则 ID */
  id: z.string(),

  /** 规则的名称（展示用；当前模板中会进入 spec_id 哈希） */
  name: z.string(),

  /** 额外元信息：作者（可选）与席位范围 */
  metadata: z.object({
    author: z.string().optional(),
    seats: DSL_Metadata_Seats
  }),

  /** 实体类型定义列表（只描述结构，不含实例数据） */
  entities: z.array(
    DSL_Entity
  ),

  /** 区域（zone）定义列表：牌库、手牌、场面等 */
  zones: z.array(DSL_Zone),

  /** 初始状态相关的声明 (可选） */
  state: DSL_State.optional(),

  /** 早期/扩展用的 setup 字段（占位，允许任何形状；最终应编译成 plan） */
  setup: z.array(z.any()).optional(),

  /** 阶段机定义： */
  phases: DSL_Phases,

  /** 动作定义： */
  actions: z.array(DSL_Action),

  /** 触发器定义（占位；具体命名空间/形状由 DSL 约定，编译期规范化） */
  triggers: z.any().optional(),

  /** 胜负判定优先链（从上至下求值，命中即终局）： */
  victory: DSL_Victory,
});

export type DSLType = z.infer<typeof DSL_Base>;

// 显式标注 superRefine 入参为'输出类型”（可选，但能抓歧义）
export const DSL = DSL_Base.superRefine((dsl: z.output<typeof DSL_Base>, ctx) => {
  // ✅ 用 dsl（值）而不是 DSL/DSLBase（schema）
  const entity_ids = new Set(dsl.entities.map((e) => e.id));

  dsl.zones.forEach((zone, zi) => {
    if (zone.of) {
      zone.of.forEach((eid: string, oi: number) => {
        if (!entity_ids.has(eid)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `区域 '${zone.id}' 引用了不存在的实体类型 '${eid}'`,
            path: ['zones', zi, 'of', oi],
          });
        }
      });
    }
  });
});

/** 安全解析 DSL：成功返回 { success:true, data }；失败返回 { success:false, error } */
export function parse_dsl(input: unknown) {
  return DSL.safeParse(input);
}