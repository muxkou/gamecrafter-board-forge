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

export interface BaseNode { kind: NodeKind }

export interface ActionNode extends BaseNode {
  kind: NodeKind.Action;
  action: string;
  args?: ExprNode[];
}

export interface RequireNode extends BaseNode {
  kind: NodeKind.Require;
  expr: ExprNode;
}

export interface EffectNode extends BaseNode {
  kind: NodeKind.Effect;
  action: ActionNode;
}

export interface BindNode extends BaseNode {
  kind: NodeKind.Bind;
  name: string;
  expr: ExprNode;
}

export interface QuantifierNode extends BaseNode {
  kind: NodeKind.Quantifier;
  quantifier: "exists" | "forall";
  variable: string;
  expr: ExprNode;
}

export interface BooleanNode extends BaseNode {
  kind: NodeKind.Bool;
  value: boolean;
}

export interface ComparisonNode extends BaseNode {
  kind: NodeKind.Compare;
  op: "==" | "!=" | ">" | ">=" | "<" | "<=";
  left: ExprNode;
  right: ExprNode;
}

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

export function createActionNode(id: string, args: ExprNode[] = []): ActionNode {
  return { kind: NodeKind.Action, action: id, args };
}

export function createRequireNode(expr: ExprNode): RequireNode {
  return { kind: NodeKind.Require, expr };
}

export function createEffectNode(action: ActionNode): EffectNode {
  return { kind: NodeKind.Effect, action };
}

export function createBooleanNode(value: boolean): BooleanNode {
  return { kind: NodeKind.Bool, value };
}

export function createComparisonNode(
  op: ComparisonNode["op"],
  left: ExprNode,
  right: ExprNode,
): ComparisonNode {
  return { kind: NodeKind.Compare, op, left, right };
}

export function createLogicNode(
  op: LogicNode["op"],
  exprs: ExprNode[],
): LogicNode {
  return { kind: NodeKind.Logic, op, exprs };
}

export function createBindNode(name: string, expr: ExprNode): BindNode {
  return { kind: NodeKind.Bind, name, expr };
}

export function createQuantifierNode(
  quantifier: QuantifierNode["quantifier"],
  variable: string,
  expr: ExprNode,
): QuantifierNode {
  return { kind: NodeKind.Quantifier, quantifier, variable, expr };
}

