import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import React from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";

import { getBudgetInfo } from "../src/budget";
import { getDomTree, getRectsByText, getRectsByXPath, screenshotByXPath } from "../src/dom";
import {
  createReactIR,
  getRectByReactPath,
  getReactRenderedHtml,
  getReactStateAndHooks,
  getReactStateAndHooksJson,
  getReactTree,
  getReactTreeJson
} from "../src/react";
import type { ReactNode } from "../src/types";
import { installDom, uninstallDom } from "./helpers";

function findReactNodeByName(nodes: ReactNode[], displayName: string): ReactNode | undefined {
  for (const node of nodes) {
    if (node.displayName === displayName) {
      return node;
    }
    const children = node.children ?? [];
    const nested = findReactNodeByName(children, displayName);
    if (nested !== undefined) {
      return nested;
    }
  }
  return undefined;
}

describe("react e2e", () => {
  let dom = installDom("<!doctype html><html><body></body></html>");
  let root: Root | null = null;

  beforeEach(() => {
    dom = installDom("<!doctype html><html><body><div id=\"mount\"></div></body></html>");
    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = undefined;
  });

  afterEach(() => {
    if (root !== null) {
      root.unmount();
      root = null;
    }
    uninstallDom(dom);
  });

  test("react render -> probe input/output", () => {
    const mount = document.getElementById("mount");
    if (mount === null) {
      throw new Error("mount not found");
    }

    function Counter(): React.ReactElement {
      const [count] = React.useState(3);
      const title = React.useMemo(() => `count:${count}`, [count]);
      return React.createElement("section", { "data-testid": "counter" }, title);
    }

    root = createRoot(mount);
    flushSync(() => {
      root?.render(React.createElement(Counter));
    });

    const reactTree = getReactTree();
    expect(reactTree).toContain("Counter");

    const ir = createReactIR();
    const counterNode = findReactNodeByName(ir.roots, "Counter");
    if (counterNode === undefined) {
      throw new Error("Counter node not found in ReactIR");
    }

    const renderedHtml = getReactRenderedHtml(counterNode.reactPath);
    expect(renderedHtml).toContain("<section");
    expect(renderedHtml).toContain("count:3");

    const stateAndHooks = getReactStateAndHooks(counterNode.reactPath, (full) => full);
    expect(stateAndHooks).toContain('"hooks"');

    const domTree = getDomTree((domIR) => {
      const body = domIR.byXPath.get("/html[1]/body[1]");
      if (body === undefined || body.children === undefined) {
        throw new Error("body children missing");
      }
      return body.children;
    });
    expect(domTree).toContain("section");

    const screenshotPlan = screenshotByXPath("//section[@data-testid='counter']");
    expect(screenshotPlan.matched).toBe(1);
    expect(screenshotPlan.returned).toBe(1);

    const rectsByXPath = getRectsByXPath("//section[@data-testid='counter']", { matchStrategy: "first" });
    expect(rectsByXPath.returned).toBe(1);

    const rectsByText = getRectsByText("count:3", { matchStrategy: "first" });
    expect(rectsByText.returned).toBe(1);

    const rectByPath = getRectByReactPath(counterNode.reactPath);
    expect(rectByPath).not.toBeNull();

    const treeJson = getReactTreeJson((react) => react.query({ displayName: "Counter" }));
    const treeParsed = JSON.parse(treeJson) as { meta: { nodeCount: number } };
    expect(treeParsed.meta.nodeCount).toBeGreaterThan(0);

    const stateJson = getReactStateAndHooksJson(counterNode.reactPath, (full) => full);
    const stateParsed = JSON.parse(stateJson) as { meta: { charCount: number } };
    expect(stateParsed.meta.charCount).toBeGreaterThan(0);

    const budgetInfo = getBudgetInfo();
    expect(budgetInfo.lastRunStats).not.toBeNull();
  });
});
