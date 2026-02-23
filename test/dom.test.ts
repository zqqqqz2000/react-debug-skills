import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { BUDGET } from "../src/budget";
import { getDomTree, screenshotByXPath } from "../src/dom";
import { installDom, uninstallDom } from "./helpers";

function createRect(width: number, height: number, left = 0, top = 0): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({})
  } as DOMRect;
}

describe("dom probe", () => {
  let dom = installDom("<!doctype html><html><body></body></html>");

  beforeEach(() => {
    dom = installDom(
      '<!doctype html><html><body><main data-testid="root"><button data-role="cta" class="btn">Click</button></main></body></html>'
    );
  });

  afterEach(() => {
    uninstallDom(dom);
  });

  test("renders dom tree with stable line format", () => {
    const out = getDomTree();
    expect(out).toContain("- html (@/html[1])");
    expect(out).toContain('[data-testid="root"]');
    expect(out).toContain("(@/html[1]/body[1]/main[1]/button[1])");
  });

  test("callback result still goes through stage 0..4", () => {
    const many = Array.from({ length: BUDGET.MAX_NODES + 15 }, (_, index) => `<div data-i="${index}"></div>`).join("");
    uninstallDom(dom);
    dom = installDom(`<!doctype html><html><body>${many}</body></html>`);

    const out = getDomTree((ir) => {
      const body = ir.byXPath.get("/html[1]/body[1]");
      if (body === undefined || body.children === undefined) {
        throw new Error("body not found");
      }
      return body.children;
    });

    expect(out).toContain("…(OMITTED_MATCHES, omitted=15)");
    expect(out.length).toBeLessThanOrEqual(BUDGET.MAX_CHARS);
  });

  test("throws when callback does not return Node/Node[]", () => {
    expect(() =>
      getDomTree(() => {
        return { invalid: true } as unknown as never;
      })
    ).toThrow();
  });

  test("screenshotByXPath returns clipped screenshot plans", () => {
    const first = document.createElement("div");
    const second = document.createElement("div");
    first.id = "a";
    second.id = "b";
    document.body.appendChild(first);
    document.body.appendChild(second);

    Object.defineProperty(first, "getBoundingClientRect", {
      value: () => createRect(1200, 900, 10, 20)
    });
    Object.defineProperty(second, "getBoundingClientRect", {
      value: () => createRect(100, 50, 5, 6)
    });

    const plan = screenshotByXPath("//div");

    expect(plan.matched).toBe(2);
    expect(plan.returned).toBe(2);
    expect(plan.items[0]?.clipped).toBe(true);
    expect(plan.items[0]?.clip.width).toBe(BUDGET.CLIP_MAX_WIDTH);
    expect(plan.items[0]?.clip.height).toBe(BUDGET.CLIP_MAX_HEIGHT);
  });
});
