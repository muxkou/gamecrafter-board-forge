/**
 * AST 节点类型枚举
 */
export enum NodeKind {
  Action = "action",
  Require = "require",
  Effect = "effect",
  Bind = "bind",
  Quantifier = "quantifier",
  Bool = "bool",
  Compare = "compare",
  Logic = "logic"
}

/**
 * 所有节点的基础结构
 */
export interface BaseNode { kind: NodeKind }

/**
 * 行为节点：表示一个可执行的动作以及其参数
 */
export interface ActionNode extends BaseNode {
  kind: NodeKind.Action;
  /** 动作名称或操作符 */
  action: string;
  /** 输入规范或参数 */
  input?: unknown;
  /** 前置条件表达式 */
  require?: unknown;
  /** 子效果（递归的动作节点） */
  effect?: ActionNode[];
  /** 其他参数（原样保留以便向后兼容） */
  props?: Record<string, unknown>;
}

/**
 * 前置条件节点：要求某个布尔表达式为真
 */
export interface RequireNode extends BaseNode {
  kind: NodeKind.Require;
  expr: ExprNode;
}

/**
 * 效果节点：包装一个动作，表示其作为效果被执行
 */
export interface EffectNode extends BaseNode {
  kind: NodeKind.Effect;
  action: ActionNode;
}

/**
 * 绑定节点：将表达式结果绑定到变量名
 */
export interface BindNode extends BaseNode {
  kind: NodeKind.Bind;
  name: string;
  expr: ExprNode;
}

/**
 * 量词节点：存在/全称 量化一个变量并对表达式求值
 */
export interface QuantifierNode extends BaseNode {
  kind: NodeKind.Quantifier;
  quantifier: "exists" | "forall";
  variable: string;
  expr: ExprNode;
}

/**
 * 布尔字面量节点
 */
export interface BooleanNode extends BaseNode {
  kind: NodeKind.Bool;
  value: boolean;
}

/**
 * 比较表达式节点：左右表达式通过比较运算符进行比较
 */
export interface ComparisonNode extends BaseNode {
  kind: NodeKind.Compare;
  op: "==" | "!=" | ">" | ">=" | "<" | "<=";
  left: ExprNode;
  right: ExprNode;
}

/**
 * 逻辑表达式节点：与/或/非 多个布尔表达式
 */
export interface LogicNode extends BaseNode {
  kind: NodeKind.Logic;
  op: "and" | "or" | "not";
  exprs: ExprNode[];
}

export type ExprNode =
  | BooleanNode
  | ComparisonNode
  | LogicNode
  | QuantifierNode
  | BindNode;

export type ASTNode =
  | ActionNode
  | RequireNode
  | EffectNode
  | ExprNode;

/**
 * 创建行为节点
 * @param id 动作标识
 * @param args 参数表达式列表
 */
export function create_action_node(
  id: string,
  props: Record<string, unknown> = {},
): ActionNode {
  return { kind: NodeKind.Action, action: id, props };
}

/**
 * 创建前置条件节点
 * @param expr 需要为真的布尔表达式
 */
export function create_require_node(expr: ExprNode): RequireNode {
  return { kind: NodeKind.Require, expr };
}

/**
 * 创建效果节点
 * @param action_node 需要作为效果执行的动作
 */
export function create_effect_node(action_node: ActionNode): EffectNode {
  return { kind: NodeKind.Effect, action: action_node };
}

/**
 * 创建布尔字面量节点
 * @param value 布尔值
 */
export function create_boolean_node(value: boolean): BooleanNode {
  return { kind: NodeKind.Bool, value };
}

/**
 * 创建比较表达式节点
 * @param op 比较运算符
 * @param left 左表达式
 * @param right 右表达式
 */
export function create_comparison_node(
  op: ComparisonNode["op"],
  left: ExprNode,
  right: ExprNode,
): ComparisonNode {
  return { kind: NodeKind.Compare, op, left, right };
}

/**
 * 创建逻辑表达式节点
 * @param op 逻辑运算符（and/or/not）
 * @param exprs 表达式列表
 */
export function create_logic_node(
  op: LogicNode["op"],
  exprs: ExprNode[],
): LogicNode {
  return { kind: NodeKind.Logic, op, exprs };
}

/**
 * 创建绑定节点
 * @param name 变量名
 * @param expr 表达式
 */
export function create_bind_node(name: string, expr: ExprNode): BindNode {
  return { kind: NodeKind.Bind, name, expr };
}

/**
 * 创建量词节点
 * @param quantifier 量词类型（exists/forall）
 * @param variable 被量化的变量名
 * @param expr 被量化的表达式
 */
export function create_quantifier_node(
  quantifier: QuantifierNode["quantifier"],
  variable: string,
  expr: ExprNode,
): QuantifierNode {
  return { kind: NodeKind.Quantifier, quantifier, variable, expr };
}

