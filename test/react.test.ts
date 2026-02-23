import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { BUDGET, getBudgetInfo } from "../src/budget";
import {
  createReactIR,
  findNearestFiberForDomNode,
  getRectByReactPath,
  getReactRenderedHtml,
  getReactStateAndHooks,
  getReactStateAndHooksJson,
  getReactTree,
  getReactTreeJson,
  mapDomNodeToDisplayFiber
} from "../src/react";
import type { FiberNodeLike } from "../src/types";
import { installDom, uninstallDom } from "./helpers";

function createMockTreeWithHook(hostElement: Element): { rootFiber: FiberNodeLike; appFiber: FiberNodeLike } {
  function App(): null {
    return null;
  }

  const rootFiber: FiberNodeLike = { tag: 3 };
  const appFiber: FiberNodeLike = {
    tag: 0,
    type: App,
    memoizedProps: { mode: "demo" },
    return: rootFiber
  };
  const hostFiber: FiberNodeLike = {
    tag: 5,
    type: "div",
    stateNode: hostElement,
    memoizedProps: { id: "mock" },
    return: appFiber
  };
  const textNode = document.createTextNode("hello");
  hostElement.appendChild(textNode);
  const textFiber: FiberNodeLike = {
    tag: 6,
    stateNode: textNode,
    return: hostFiber
  };

  rootFiber.child = appFiber;
  appFiber.child = hostFiber;
  hostFiber.child = textFiber;

  return { rootFiber, appFiber };
}

describe("react probe", () => {
  let dom = installDom("<!doctype html><html><body></body></html>");

  beforeEach(() => {
    dom = installDom("<!doctype html><html><body><div id=\"app\"></div></body></html>");
  });

  afterEach(() => {
    uninstallDom(dom);
  });

  test("builds ReactIR from devtools global hook", () => {
    const hostElement = document.createElement("div");
    hostElement.setAttribute("data-testid", "mock");
    document.body.appendChild(hostElement);

    const { rootFiber } = createMockTreeWithHook(hostElement);

    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      renderers: new Map<number, unknown>([[1, {}]]),
      getFiberRoots: () => new Set([{ current: rootFiber }])
    };

    const tree = getReactTree();
    expect(tree).toContain("App");
    expect(tree).toContain("(@reactPath=/Root[0]/App[0])");

    const reactIR = createReactIR();
    expect(reactIR.roots.length).toBe(1);
    expect(reactIR.fiberByPath.has("/Root[0]/App[0]")).toBe(true);

    const byDisplayName = reactIR.query({ displayName: "App" });
    expect(byDisplayName.length).toBe(1);
    expect(byDisplayName[0]?.reactPath).toBe("/Root[0]/App[0]");

    const byProps = reactIR.query({ propEquals: { mode: "demo" } });
    expect(byProps.length).toBe(1);
    expect(byProps[0]?.displayName).toBe("App");

    const byDataAttr = reactIR.query({ dataAttrEquals: { "data-testid": "mock" } });
    expect(byDataAttr.length).toBeGreaterThanOrEqual(1);

    const one = reactIR.findOne({ displayName: "App" });
    expect(one.reactPath).toBe("/Root[0]/App[0]");
    expect(() => reactIR.findOne({ displayName: "NotExists" })).toThrow();
    expect(() => reactIR.findOne({})).toThrow();
  });

  test("falls back to dom private __reactFiber$ mapping", () => {
    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = undefined;

    function Demo(): null {
      return null;
    }

    const host = document.createElement("section");
    const child = document.createElement("span");
    host.appendChild(child);
    document.body.appendChild(host);

    const rootFiber: FiberNodeLike = { tag: 3 };
    const demoFiber: FiberNodeLike = { tag: 0, type: Demo, return: rootFiber };
    const hostFiber: FiberNodeLike = { tag: 5, type: "section", stateNode: host, return: demoFiber };

    rootFiber.child = demoFiber;
    demoFiber.child = hostFiber;

    (host as unknown as Record<string, unknown>).__reactFiber$abc = hostFiber;
    (child as unknown as Record<string, unknown>).__reactProps$abc = { title: "demo" };

    const nearest = findNearestFiberForDomNode(child);
    const display = mapDomNodeToDisplayFiber(child);

    expect(nearest).toBe(hostFiber);
    expect(display).toBe(demoFiber);

    const tree = getReactTree();
    expect(tree).toContain("Demo");
  });

  test("getReactRenderedHtml maps component fiber to host dom and enforces budget", () => {
    const hostElement = document.createElement("div");
    hostElement.setAttribute("data-big", "x".repeat(BUDGET.VALUE_MAX_CHARS + 50));
    document.body.appendChild(hostElement);

    const { rootFiber } = createMockTreeWithHook(hostElement);

    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      renderers: new Map<number, unknown>([[1, {}]]),
      getFiberRoots: () => new Set([{ current: rootFiber }])
    };

    const html = getReactRenderedHtml("/Root[0]/App[0]");
    expect(html).toContain("…(TRUNCATED,len=");
    expect(html.length).toBeLessThanOrEqual(BUDGET.MAX_CHARS);
  });

  test("getReactStateAndHooks gets full transform input then converges output", () => {
    function WithHooks(): null {
      return null;
    }

    const host = document.createElement("div");
    document.body.appendChild(host);

    const huge = "z".repeat(BUDGET.MAX_CHARS + 1000);
    const hookNode: Record<string, unknown> = {
      memoizedState: { value: huge },
      baseState: null,
      queue: null,
      baseQueue: null,
      next: null
    };

    const rootFiber: FiberNodeLike = { tag: 3 };
    const withHooksFiber: FiberNodeLike = {
      tag: 0,
      type: WithHooks,
      return: rootFiber,
      memoizedState: hookNode,
      memoizedProps: { a: 1 }
    };
    const hostFiber: FiberNodeLike = { tag: 5, type: "div", stateNode: host, return: withHooksFiber };
    rootFiber.child = withHooksFiber;
    withHooksFiber.child = hostFiber;

    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      renderers: new Map<number, unknown>([[1, {}]]),
      getFiberRoots: () => new Set([{ current: rootFiber }])
    };

    let transformSawLength = 0;
    const out = getReactStateAndHooks("/Root[0]/WithHooks[0]", (full) => {
      const record = full as Record<string, unknown>;
      const hooks = record.hooks as Array<Record<string, unknown>>;
      const firstHook = hooks[0];
      if (firstHook === undefined) {
        throw new Error("first hook missing");
      }
      const firstMemoizedState = firstHook.memoizedState as Record<string, unknown>;
      const value = firstMemoizedState.value as string;
      transformSawLength = value.length;

      return {
        payload: value
      };
    });

    expect(transformSawLength).toBe(BUDGET.MAX_CHARS + 1000);
    expect(out.length).toBeLessThanOrEqual(BUDGET.MAX_CHARS);
    expect(out).toContain("TRUNCATED");
  });

  test("getReactTree callback output is still forced through budget fallback", () => {
    const hostElement = document.createElement("div");
    document.body.appendChild(hostElement);
    const { rootFiber } = createMockTreeWithHook(hostElement);

    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      renderers: new Map<number, unknown>([[1, {}]]),
      getFiberRoots: () => new Set([{ current: rootFiber }])
    };

    const out = getReactTree(() => ({
      id: "(@reactPath=/Huge[0])",
      label: "Huge",
      displayName: "Huge",
      reactPath: "/Huge[0]",
      fiber: rootFiber,
      domXPaths: [],
      dataAttrs: { "data-big": "x".repeat(BUDGET.VALUE_MAX_CHARS + 500) },
      kv: [{ k: "payload", v: "y".repeat(BUDGET.VALUE_MAX_CHARS + 500) }],
      text: "z".repeat(BUDGET.VALUE_MAX_CHARS + 500),
      children: Array.from({ length: BUDGET.MAX_NODES + 20 }, (_unused, index) => ({
        id: `(@reactPath=/Huge[0]/Child[${index}])`,
        label: `Child${index}`,
        displayName: `Child${index}`,
        reactPath: `/Huge[0]/Child[${index}]`,
        fiber: rootFiber,
        domXPaths: [],
        kv: [{ k: "k", v: "v".repeat(80) }]
      }))
    }));

    expect(out.length).toBeLessThanOrEqual(BUDGET.MAX_CHARS);
    expect(out).toContain("TRUNCATED,len=");
    expect(out.includes("OMITTED_SUBTREE") || out.includes("OMITTED_LINES")).toBe(true);
  });

  test("getReactTreeJson returns structured data and meta within budget", () => {
    const hostElement = document.createElement("div");
    document.body.appendChild(hostElement);
    const { rootFiber } = createMockTreeWithHook(hostElement);

    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      renderers: new Map<number, unknown>([[1, {}]]),
      getFiberRoots: () => new Set([{ current: rootFiber }])
    };

    const json = getReactTreeJson();
    expect(json.length).toBeLessThanOrEqual(BUDGET.MAX_CHARS);

    const parsed = JSON.parse(json) as {
      data: Array<{ reactPath?: string }>;
      meta: { truncated: boolean; omitted: boolean; nodeCount: number; charCount: number };
    };
    expect(Array.isArray(parsed.data)).toBe(true);
    expect(parsed.meta.nodeCount).toBeGreaterThan(0);
    expect(parsed.meta.charCount).toBeGreaterThan(0);
  });

  test("getReactTreeJson falls back to preview payload when data is huge", () => {
    const hostElement = document.createElement("div");
    document.body.appendChild(hostElement);
    const { rootFiber } = createMockTreeWithHook(hostElement);

    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      renderers: new Map<number, unknown>([[1, {}]]),
      getFiberRoots: () => new Set([{ current: rootFiber }])
    };

    const json = getReactTreeJson(() => ({
      id: "(@reactPath=/Huge[0])",
      label: "Huge",
      displayName: "Huge",
      reactPath: "/Huge[0]",
      fiber: rootFiber,
      domXPaths: [],
      children: Array.from({ length: BUDGET.MAX_NODES + 150 }, (_unused, index) => ({
        id: `(@reactPath=/Huge[0]/Node[${index}])`,
        label: `Node-${"x".repeat(80)}-${index}`,
        displayName: `Node-${index}`,
        reactPath: `/Huge[0]/Node[${index}]`,
        fiber: rootFiber,
        domXPaths: [],
        kv: [{ k: "k", v: "v".repeat(200) }]
      }))
    }));

    const parsed = JSON.parse(json) as {
      data: unknown;
      meta: { truncated: boolean; omitted: boolean };
    };
    expect(parsed.meta.truncated).toBe(true);
    expect(parsed.meta.omitted).toBe(true);
    expect(json.length).toBeLessThanOrEqual(BUDGET.MAX_CHARS);
  });

  test("getReactStateAndHooksJson returns structured JSON data", () => {
    function WithHooksJson(): null {
      return null;
    }

    const host = document.createElement("div");
    document.body.appendChild(host);

    const hookNode: Record<string, unknown> = {
      memoizedState: { value: "ok" },
      baseState: null,
      queue: null,
      baseQueue: null,
      next: null
    };
    const rootFiber: FiberNodeLike = { tag: 3 };
    const compFiber: FiberNodeLike = {
      tag: 0,
      type: WithHooksJson,
      return: rootFiber,
      memoizedState: hookNode,
      memoizedProps: { mode: "json" }
    };
    const hostFiber: FiberNodeLike = { tag: 5, type: "div", stateNode: host, return: compFiber };
    rootFiber.child = compFiber;
    compFiber.child = hostFiber;

    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      renderers: new Map<number, unknown>([[1, {}]]),
      getFiberRoots: () => new Set([{ current: rootFiber }])
    };

    const out = getReactStateAndHooksJson("/Root[0]/WithHooksJson[0]", (full) => full);
    const parsed = JSON.parse(out) as {
      data: Record<string, unknown>;
      meta: { truncated: boolean; charCount: number; nodeCount: number };
    };

    expect(parsed.meta.charCount).toBeGreaterThan(0);
    expect(parsed.meta.truncated).toBe(false);
    expect(parsed.meta.nodeCount).toBeGreaterThan(1);
    expect(parsed.data.displayName).toBe("WithHooksJson");
  });

  test("getReactStateAndHooksJson truncates into preview for oversized payload", () => {
    function BigHooks(): null {
      return null;
    }

    const host = document.createElement("div");
    document.body.appendChild(host);
    const rootFiber: FiberNodeLike = { tag: 3 };
    const compFiber: FiberNodeLike = {
      tag: 0,
      type: BigHooks,
      return: rootFiber,
      memoizedProps: { huge: "x".repeat(BUDGET.MAX_CHARS * 2) },
      memoizedState: null
    };
    const hostFiber: FiberNodeLike = { tag: 5, type: "div", stateNode: host, return: compFiber };
    rootFiber.child = compFiber;
    compFiber.child = hostFiber;

    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      renderers: new Map<number, unknown>([[1, {}]]),
      getFiberRoots: () => new Set([{ current: rootFiber }])
    };

    const out = getReactStateAndHooksJson("/Root[0]/BigHooks[0]", () => ({
      huge: "Y".repeat(BUDGET.MAX_CHARS * 3)
    }));
    const parsed = JSON.parse(out) as {
      data: { preview?: string };
      meta: { truncated: boolean; omitted: boolean };
    };
    expect(parsed.meta.truncated).toBe(true);
    expect(parsed.meta.omitted).toBe(true);
    expect(typeof parsed.data.preview).toBe("string");
    expect(out.length).toBeLessThanOrEqual(BUDGET.MAX_CHARS);
  });

  test("getRectByReactPath returns first host element rect metadata", () => {
    const hostElement = document.createElement("div");
    hostElement.style.width = "100px";
    hostElement.style.height = "50px";
    document.body.appendChild(hostElement);
    const { rootFiber } = createMockTreeWithHook(hostElement);

    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      renderers: new Map<number, unknown>([[1, {}]]),
      getFiberRoots: () => new Set([{ current: rootFiber }])
    };

    const rect = getRectByReactPath("/Root[0]/App[0]");
    expect(rect).not.toBeNull();
    expect(rect?.rawRect.width).toBeGreaterThanOrEqual(0);
    expect(rect?.resolvedXPath).toContain("/html[1]");
  });

  test("getRectByReactPath returns null when no host element exists", () => {
    function EmptyHost(): null {
      return null;
    }

    const rootFiber: FiberNodeLike = { tag: 3 };
    const compFiber: FiberNodeLike = {
      tag: 0,
      type: EmptyHost,
      return: rootFiber,
      memoizedState: null,
      memoizedProps: {}
    };
    rootFiber.child = compFiber;

    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      renderers: new Map<number, unknown>([[1, {}]]),
      getFiberRoots: () => new Set([{ current: rootFiber }])
    };

    const rect = getRectByReactPath("/Root[0]/EmptyHost[0]");
    expect(rect).toBeNull();
  });

  test("getBudgetInfo exposes source/effectiveAt and tracks last run stats", () => {
    const before = getBudgetInfo();
    expect(before.budget.MAX_CHARS).toBe(BUDGET.MAX_CHARS);
    expect(before.source === "default" || before.source === "override").toBe(true);
    expect(typeof before.effectiveAt).toBe("string");

    const hostElement = document.createElement("div");
    document.body.appendChild(hostElement);
    const { rootFiber } = createMockTreeWithHook(hostElement);
    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      renderers: new Map<number, unknown>([[1, {}]]),
      getFiberRoots: () => new Set([{ current: rootFiber }])
    };

    getReactTree();
    const after = getBudgetInfo();
    expect(after.lastRunStats).not.toBeNull();
    expect(after.lastRunStats?.api).toBe("getReactTree");
    expect(after.lastRunStats?.charCount).toBeGreaterThan(0);
  });
});
