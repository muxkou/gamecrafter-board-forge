import { describe, expect, it } from "vitest";
import { parseAction } from "../parseAction";
import { NodeKind } from "../../ast";

describe("parseAction", () => {
  it("parses nested structures and preserves props", () => {
    const dsl = {
      op: "move_top",
      from_zone: "hand",
      require: { op: "==", args: [1, 1] },
      effect: [{ op: "shuffle", zone: "deck" }],
      input: { type: "number" },
      extra: { foo: 1 },
    };
    const ast = parseAction(dsl);
    expect(ast).toMatchObject({
      kind: NodeKind.Action,
      action: "move_top",
      require: { op: "==", args: [1, 1] },
      input: { type: "number" },
      props: { from_zone: "hand", extra: { foo: 1 } },
      effect: [
        { kind: NodeKind.Action, action: "shuffle", props: { zone: "deck" } },
      ],
    });
  });

  it("throws friendly error on non-array effect", () => {
    const dsl: any = { op: "move_top", effect: {} };
    expect(() => parseAction(dsl)).toThrow(/effect.*array/);
  });

  it("throws friendly error on invalid args", () => {
    const dsl: any = { op: "foo", require: { op: "and", args: 1 } };
    expect(() => parseAction(dsl)).toThrow(/args must be an array/);
  });

  it("retains unknown fields like quantifier", () => {
    const dsl: any = { op: "foo", quantifier: { some: true } };
    const ast = parseAction(dsl);
    expect(ast.props?.quantifier).toEqual({ some: true });
  });
});
