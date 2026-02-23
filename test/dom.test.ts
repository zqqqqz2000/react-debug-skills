import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { BUDGET } from "../src/budget";
import { getDomTree, getRectsByText, getRectsByXPath, screenshotByXPath } from "../src/dom";
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
    expect(plan.items[0]?.rawRect.width).toBe(1200);
    expect(plan.items[0]?.clippedRect.width).toBe(BUDGET.CLIP_MAX_WIDTH);
    expect(plan.items[0]?.devicePixelRatio).toBeGreaterThan(0);
  });

  test("screenshotByXPath supports deepest and first match strategy", () => {
    uninstallDom(dom);
    dom = installDom(
      "<!doctype html><html><body><section id='outer'><div id='inner'><span id='leaf'>leaf</span></div></section></body></html>"
    );

    const deepestPlan = screenshotByXPath("//*[@id='outer' or @id='inner' or @id='leaf']", {
      matchStrategy: "deepest"
    });
    expect(deepestPlan.matched).toBe(3);
    expect(deepestPlan.resolved).toBe(1);
    expect(deepestPlan.returned).toBe(1);
    expect(deepestPlan.items[0]?.resolvedXPath).toContain("/span[1]");

    const firstPlan = screenshotByXPath("//*[@id='outer' or @id='inner' or @id='leaf']", {
      matchStrategy: "first"
    });
    expect(firstPlan.matched).toBe(3);
    expect(firstPlan.resolved).toBe(1);
    expect(firstPlan.returned).toBe(1);
  });

  test("getRectsByXPath applies excludeAncestors and limit", () => {
    uninstallDom(dom);
    dom = installDom(
      "<!doctype html><html><body><main><section id='a'><div id='b'><span id='c'>x</span></div></section></main></body></html>"
    );

    const rectPlan = getRectsByXPath("//*[@id='a' or @id='b' or @id='c']", {
      excludeAncestors: true,
      limit: 1
    });
    expect(rectPlan.matched).toBe(3);
    expect(rectPlan.resolved).toBe(1);
    expect(rectPlan.returned).toBe(1);
    expect(rectPlan.omitted).toBe(0);
  });

  test("getRectsByText returns visible/inViewport rect items", () => {
    uninstallDom(dom);
    dom = installDom(
      "<!doctype html><html><body><p>alpha needle beta</p><p style='display:none'>needle hidden</p></body></html>"
    );

    const plan = getRectsByText("needle", {
      matchStrategy: "all"
    });
    expect(plan.matched).toBeGreaterThanOrEqual(2);
    expect(plan.returned).toBeGreaterThanOrEqual(1);
    expect(plan.items[0]?.visibility).toBe("visible");
    expect(typeof plan.items[0]?.inViewport).toBe("boolean");
  });
});
