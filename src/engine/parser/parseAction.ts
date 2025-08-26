import { ActionNode, NodeKind } from "../ast";

export interface DslAction {
  op: string;
  require?: unknown;
  effect?: DslAction[];
  input?: unknown;
  [key: string]: unknown;
}

function parseExpr(expr: unknown, path: string): unknown {
  if (expr === null || typeof expr !== "object") return expr;
  if (Array.isArray(expr)) {
    return expr.map((e, i) => parseExpr(e, `${path}/${i}`));
  }
  const node: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(expr as Record<string, unknown>)) {
    if (k === "args") {
      if (!Array.isArray(v)) {
        throw new Error(`${path}/args must be an array`);
      }
      node[k] = v.map((e, i) => parseExpr(e, `${path}/args/${i}`));
    } else {
      node[k] = parseExpr(v, `${path}/${k}`);
    }
  }
  return node;
}

export function parseAction(dsl: DslAction, path = ""): ActionNode {
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
    node.input = parseExpr(dsl.input, `${path}/input`);
  }

  if ("require" in dsl) {
    node.require = parseExpr(dsl.require, `${path}/require`);
  }

  if ("effect" in dsl) {
    if (!Array.isArray(dsl.effect)) {
      throw new Error(`${path}/effect must be an array`);
    }
    node.effect = dsl.effect.map((e, i) => parseAction(e as DslAction, `${path}/effect/${i}`));
  }

  const props: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(dsl)) {
    if (k === "op" || k === "require" || k === "effect" || k === "input") continue;
    props[k] = parseExpr(v, `${path}/${k}`);
  }
  if (Object.keys(props).length) node.props = props;

  return node;
}
