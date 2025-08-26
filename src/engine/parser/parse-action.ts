import { ActionNode, NodeKind } from "../ast";

/**
 * DSL 动作结构
 * - op: 动作标识符（必填）
 * - require: 前置条件（任意可嵌套的对象/数组/字面量）
 * - effect: 子动作列表（数组）
 * - input: 输入参数对象
 * - 其它键：自定义扩展属性
 */
export interface DslAction {
  op: string;
  require?: unknown;
  effect?: DslAction[];
  input?: unknown;
  [key: string]: unknown;
}

/**
 * 递归解析表达式节点：保持输入结构（对象/数组/字面量）不变，
 * 但会递归地对内部元素进行解析与校验（例如 `args` 必须为数组）。
 * @param expr 任意表达式
 * @param path JSON 路径（用于错误提示）
 */
function parse_expr(expr: unknown, path: string): unknown {
  if (expr === null || typeof expr !== "object") return expr;
  if (Array.isArray(expr)) {
    return expr.map((elem, index) => parse_expr(elem, `${path}/${index}`));
  }
  const node: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(expr as Record<string, unknown>)) {
    if (key === "args") {
      if (!Array.isArray(value)) {
        throw new Error(`${path}/args must be an array`);
      }
      node[key] = value.map((elem, index) => parse_expr(elem, `${path}/args/${index}`));
    } else {
      node[key] = parse_expr(value, `${path}/${key}`);
    }
  }
  return node;
}

/**
 * 解析单个 DSL 动作为 AST 的 ActionNode
 * @param dsl DSL 动作对象
 * @param path 当前动作的 JSON 路径（用于定定位错误）
 * @throws {Error} 当结构不合法时抛出（如缺少 op / 类型不匹配等）
 */
export function parse_action(dsl: DslAction, path = ""): ActionNode {
  if (!dsl || typeof dsl !== "object") {
    throw new Error(`action at '${path || "/"}' must be an object`);
  }
  if (typeof dsl.op !== "string" || !dsl.op) {
    throw new Error(`action at '${path || "/"}' missing op`);
  }

  const node: ActionNode = { kind: NodeKind.Action, action: dsl.op };

  if ("input" in dsl) {
    if (dsl.input !== undefined && (typeof dsl.input !== "object" || dsl.input === null)) {
      throw new Error(`${path}/input must be an object`);
    }
    node.input = parse_expr(dsl.input, `${path}/input`);
  }

  if ("require" in dsl) {
    node.require = parse_expr(dsl.require, `${path}/require`);
  }

  if ("effect" in dsl) {
    if (!Array.isArray(dsl.effect)) {
      throw new Error(`${path}/effect must be an array`);
    }
    node.effect = dsl.effect.map((e, i) => parse_action(e as DslAction, `${path}/effect/${i}`));
  }

  const props: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(dsl)) {
    if (key === "op" || key === "require" || key === "effect" || key === "input") continue;
    props[key] = parse_expr(value, `${path}/${key}`);
  }
  if (Object.keys(props).length) node.props = props;

  return node;
}
