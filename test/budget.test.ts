import { describe, expect, test } from "bun:test";

import { BUDGET, renderWithBudget } from "../src/budget";
import type { ProbeNode } from "../src/types";

function createLeaf(id: number, key = "k", value = "v"): ProbeNode {
  return {
    id: `(@/n${id})`,
    label: "li",
    kv: [{ k: key, v: value }]
  };
}

describe("budget render engine", () => {
  test("clips long values with explicit marker", () => {
    const input: ProbeNode = {
      id: "(@/root)",
      label: "div",
      kv: [{ k: "title", v: "x".repeat(BUDGET.VALUE_MAX_CHARS + 32) }]
    };

    const out = renderWithBudget(input);
    expect(out).toContain(`…(TRUNCATED,len=${BUDGET.VALUE_MAX_CHARS + 32})`);
  });

  test("omits subtree with maxNodes marker", () => {
    const input: ProbeNode = {
      id: "(@/root)",
      label: "ul",
      children: Array.from({ length: BUDGET.MAX_NODES + 40 }, (_, index) => createLeaf(index))
    };

    const out = renderWithBudget(input);
    expect(out).toContain("…(OMITTED_SUBTREE, reason=maxNodes");
    expect(out.length).toBeLessThanOrEqual(BUDGET.MAX_CHARS);
  });

  test("marks omitted matches for oversized root list", () => {
    const roots: ProbeNode[] = Array.from({ length: BUDGET.MAX_NODES + 7 }, (_, index) => ({
      id: `(@/r${index})`,
      label: "row"
    }));

    const out = renderWithBudget(roots);
    expect(out).toContain("…(OMITTED_MATCHES, omitted=7)");
    expect(out.length).toBeLessThanOrEqual(BUDGET.MAX_CHARS);
  });

  test("stage 3.1 removes text first when that is enough", () => {
    const input: ProbeNode = {
      id: "(@/root)",
      label: "ul",
      children: Array.from({ length: 90 }, (_, index) => ({
        id: `(@/item${index})`,
        label: "li",
        kv: [{ k: "k", v: "v" }],
        text: "t".repeat(BUDGET.VALUE_MAX_CHARS)
      }))
    };

    const out = renderWithBudget(input);
    expect(out).not.toContain("text=");
    expect(out).toContain('{k="v"}');
  });

  test("stage 3.2 removes kv values and keeps keys", () => {
    const input: ProbeNode = {
      id: "(@/root)",
      label: "ul",
      children: Array.from({ length: 120 }, (_, index) => ({
        id: `(@/item${index})`,
        label: "li",
        kv: [{ k: "k", v: "x".repeat(BUDGET.VALUE_MAX_CHARS) }]
      }))
    };

    const out = renderWithBudget(input);
    expect(out).toContain("{k}");
    expect(out).not.toContain('k="');
  });

  test("stage 3.3 removes kv entirely when keys are still too large", () => {
    const giantKey = "veryLongKey".repeat(20);
    const input: ProbeNode = {
      id: "(@/root)",
      label: "ul",
      children: Array.from({ length: 70 }, (_, index) => ({
        id: `(@/item${index})`,
        label: "li",
        kv: [{ k: `${giantKey}${index}`, v: "v" }]
      }))
    };

    const out = renderWithBudget(input);
    expect(out).not.toContain("{");
    expect(out.length).toBeLessThanOrEqual(BUDGET.MAX_CHARS);
  });

  test("stage 3.5 depth fold emits depth marker", () => {
    let node: ProbeNode = {
      id: "(@/deep-0)",
      label: `deep-${"x".repeat(70)}`
    };

    for (let depth = 1; depth <= 170; depth += 1) {
      node = {
        id: `(@/deep-${depth})`,
        label: `deep-${depth}-${"y".repeat(70)}`,
        children: [node]
      };
    }

    const out = renderWithBudget(node);
    expect(out).toContain("reason=depth");
    expect(out.length).toBeLessThanOrEqual(BUDGET.MAX_CHARS);
  });
});
