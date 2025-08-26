import { CompiledSpecType, DSLType, issue, parse_dsl } from '../schema';
import type { ValidationIssue, CompileInput, CompileOutput } from '../types';
import { canonical_stringify, hash_sha256 } from '../utils/canonical.util';
import { normalize_effect_pipeline } from './effects';
import { normalize_initializer_plan } from './initializers';

export async function compile(input: CompileInput): Promise<CompileOutput> {
  // 记时
  const t0 = Date.now();
  // zod safe parse 获取 dsl 校验结果
  const result = parse_dsl(input.dsl);
  // 错误列表
  const errors: ValidationIssue[] = [];
  // 警告列表
  const warnings: ValidationIssue[] = [];

  // 如果解析失败，返回错误
  if (!result.success) {
    // 把 Zod 的 issues 转成 ValidationIssue[]
    for (const e of result.error.issues) {
      errors.push(issue('SCHEMA_ERROR', '/' + (e.path ?? []).join('/'), e.message));
    }
    return { 
      ok: false, 
      compiled_spec: null, 
      spec_id: null, 
      errors, 
      warnings, 
      time_ms: Date.now() - t0 
    };
  }

  const dsl: DSLType = result.data as DSLType;

  // 先准备 zones_index（供 effect/initializer 校验使用）
  const zones_index = Object.fromEntries(
    dsl.zones.map(z => [
      z.id,
      {
        kind: z.kind,
        scope: z.scope,
        of: z.of,
        visibility: z.visibility,
        capacity: z.capacity
      }
    ])
  );
  const entities_index = Object.fromEntries(
    dsl.entities.map(e => [e.id, { props: e.props ?? {}, type: e.type, id: e.id }])
  );

  // 构建 actions_index（规范化 effect_pipeline + action_hash）
  // 初始化结果对象，类型就是编译产物里的 actions_index 结构
  const actions_index: CompiledSpecType['actions_index'] = {};
  // 遍历 DSL 中的动作定义（容错：DSL 可能没有 actions 字段）
  for (const a of dsl.actions ?? []) {
    // 小工具：把 normalize_effect_pipeline 抛出的 issue，映射到具体的 action 路径上
    const add_issue = (code: string, path: string, message: string) => {
      // normalize_effect_pipeline 可能用 '/actions/*/xxx' 这样的占位路径
      // 这里把 '*' 替换成具体的 action id，并推入 errors
      errors.push(
        issue(code, `/actions/${a.id}${path.replace('/actions/*', '')}`, message)
      );
    };

    // 规范化 effect：把任意形状的 effect 描述编成统一的 effect_pipeline（原子 op 序列）
    // 传入 zones_index 是为了做语义校验（目标 zone 是否存在/允许的实体类型等）
    const pipeline = normalize_effect_pipeline(
      a.effect ?? [],          // 没写 effect 就当空管线
      zones_index,
      entities_index,
      add_issue
    );

    if (!pipeline) {
      // 规范化失败，errors 已经通过 add_issue 记录；这个 action 被跳过
      continue;
    }

    // 为规范化后的管线生成稳定哈希：先 canonical_stringify（字段顺序固定、无多余空白），再 sha256
    const action_hash = hash_sha256(canonical_stringify(pipeline));

    // 枚举元数据：从 input_spec.enum 或 effect 中引用 payload.xxx 的 from_zone 推导
    const enum_meta: Record<string, { zone?: string; owner?: string; values?: unknown[] }> = {};
    if (a.input && (a as any).input?.properties) {
      for (const [key, prop] of Object.entries((a as any).input.properties as Record<string, any>)) {
        if (Array.isArray(prop.enum)) {
          enum_meta[key] = { values: [...prop.enum] };
          continue;
        }
        // 从 effect 中寻找 "payload.key" 的引用，并提取 from_zone/from_owner
        for (const step of a.effect ?? []) {
          const s: any = step;
          const candidates = Object.values(s) as any[];
          const hit = candidates.some(v => v && typeof v === 'object' && v.var === `payload.${key}`);
          if (hit && typeof s.from_zone === 'string') {
            enum_meta[key] = { zone: s.from_zone, owner: typeof s.from_owner === 'string' ? s.from_owner : undefined };
            break;
          }
        }
      }
    }

    // 写入编译结果：输入 schema、require 的 AST（这里默认恒真）、规范化后的管线和 hash
    actions_index[a.id] = {
      input_spec: a.input ?? {},              // 没写 input 就给空对象
      require_ast: a.require ?? { const: true }, // 没写 require 就默认恒真
      effect_pipeline: pipeline,
      action_hash,
      ...(Object.keys(enum_meta).length ? { input_enum: enum_meta } : {})
    };
  }

  // 初始变量与计划
  const seed_vars = { turn: 1, ...(dsl.state?.vars ?? {}) };
  const seed_per_seat = dsl.state?.per_seat?.defaults ?? {};
  
  const plan = normalize_initializer_plan(
    dsl.setup ?? [],
    zones_index,
    entities_index,
    (code, path, msg) => errors.push(issue(code, path, msg))
  );

  // 编译产物
  /**
   *  - 考虑到运行时的高频查询希望做到 O(1), 所以 数组 -> 索引， 记录为 Record
   *  - 使用 canonical_stringify 做深度排序+去 null/undefined，保证“同结构同哈希”。
   *  - 不要把非确定性东西放进 compiled_spec（时间戳、随机数、unordered 容器）；否则 spec_id 会抖。
   */
  const compiled: CompiledSpecType = {
    compiled_schema_version: 1,
    spec_id: "sha256:pending",
    source_meta: { 
      dsl_schema_version: dsl.schema_version, 
      engine_compat: dsl.engine_compat, 
      id: dsl.id, 
      name: dsl.name, 
      seats: dsl.metadata.seats 
    },
    entities_index,
    zones_index,
    initializers: {
      plan,
      seed_vars,
      seed_per_seat,
    },
    phase_graph: {
      initial_phase: dsl.phases[0]?.id ?? "setup",
      nodes: dsl.phases.map(p => p.id),
      transitions: dsl.phases.flatMap(p =>
        (p.transitions ?? []).map(tr => ({ from: p.id, to: tr.to, when: tr.when }))
      ),
      turn_order: "clockwise",
    },
    actions_index,
    triggers_index: {},
    victory: { order: dsl.victory.order.map(o => ({ when: o.when, result: o.result })) },
    invariants: [],
    read_caps: Object.fromEntries(dsl.zones.map(z => [z.id, { visibility: z.visibility }])),
    eval_limits: { max_expr_nodes: 64, max_rng_calls_per_reduce: 8, max_for_each_iter: 100 }
  };


  // 让 spec_id 为 undefined, 避免哈希抖动 -> canonical_stringify 会剔除 undefined 数据
  const spec_id = hash_sha256(canonical_stringify({ ...compiled, spec_id: undefined }));
  compiled.spec_id = spec_id;

  // 返回结果
  return { ok: errors.length === 0, compiled_spec: compiled, spec_id, errors, warnings, time_ms: Date.now() - t0 };
  
};