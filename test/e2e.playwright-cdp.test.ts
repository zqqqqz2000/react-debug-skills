import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync } from "node:fs";

import { chromium, type Browser, type CDPSession, type Page } from "playwright";
import { resolveReactProbeBundlePath, selectCdpPageTarget } from "../src/host";

const PROJECT_ROOT = "/Users/jpx/Documents/react-master";
const TMP_DIR = `${PROJECT_ROOT}/.tmp-e2e`;
const INDEPENDENT_APP_ENTRY = `${PROJECT_ROOT}/test/fixtures/independent-react-app/main.tsx`;
const INDEPENDENT_APP_BUNDLE = `${TMP_DIR}/independent-react-app.bundle.js`;

const BUDGET_MAX_CHARS = 6000;

type RuntimeEvaluateResult = {
  result?: {
    type?: string;
    value?: unknown;
    description?: string;
  };
  exceptionDetails?: {
    text?: string;
  };
};

type ProbeNodeForTest = {
  id: string;
  label: string;
  displayName?: string;
  reactPath?: string;
  dataAttrs?: Record<string, string>;
  children?: ProbeNodeForTest[];
};

type ReactQueryForTest = {
  displayName?: string;
  label?: string;
  reactPath?: string;
  reactPathPrefix?: string;
  dataAttrEquals?: Record<string, string>;
  propEquals?: Record<string, string | number | boolean | null>;
  textIncludes?: string;
};

type ReactIRForTest = {
  roots: ProbeNodeForTest[];
  query: (criteria: ReactQueryForTest) => ProbeNodeForTest[];
  findOne: (criteria: ReactQueryForTest) => ProbeNodeForTest;
};

type ScreenshotPlanForTest = {
  matched: number;
  resolved: number;
  returned: number;
  omitted: number;
  matchStrategy: "deepest" | "first" | "all";
  maxScreenshots: number;
  items: Array<{
    xpath: string;
    resolvedXPath: string;
    matchIndex: number;
    rawRect: { x: number; y: number; width: number; height: number };
    clippedRect: { x: number; y: number; width: number; height: number };
    devicePixelRatio: number;
    clip: { x: number; y: number; width: number; height: number };
    clipped: boolean;
  }>;
};

type RectPlanForTest = {
  matched: number;
  resolved: number;
  returned: number;
  omitted: number;
  matchStrategy: "deepest" | "first" | "all";
  items: Array<{
    xpath: string;
    resolvedXPath: string;
    matchIndex: number;
    rawRect: { x: number; y: number; width: number; height: number };
    visibility: "visible" | "hidden";
    inViewport: boolean;
    devicePixelRatio: number;
  }>;
};

type BudgetInfoForTest = {
  budget: {
    MAX_CHARS: number;
    VALUE_MAX_CHARS: number;
    MAX_NODES: number;
    MAX_SCREENSHOTS: number;
    CLIP_MAX_WIDTH: number;
    CLIP_MAX_HEIGHT: number;
    MAX_DEPTH: number;
  };
  source: "default" | "override";
  effectiveAt: string;
  lastRunStats: {
    api: string;
    charCount: number;
    truncated: boolean;
    omitted: boolean;
    timestamp: string;
  } | null;
};

type ProbeApiForTest = {
  getDomTree: (findCallback?: (dom: unknown) => ProbeNodeForTest | ProbeNodeForTest[]) => string;
  getReactTree: (findCallback?: (react: ReactIRForTest) => ProbeNodeForTest | ProbeNodeForTest[]) => string;
  getReactTreeJson: (findCallback?: (react: ReactIRForTest) => ProbeNodeForTest | ProbeNodeForTest[]) => string;
  getReactRenderedHtml: (reactPath: string) => string;
  getReactStateAndHooks: (reactPath: string, transform?: (full: unknown) => unknown) => string;
  getReactStateAndHooksJson: (reactPath: string, transform?: (full: unknown) => unknown) => string;
  screenshotByXPath: (
    htmlXPath: string,
    options?: { matchStrategy?: "deepest" | "first" | "all"; excludeAncestors?: boolean; limit?: number }
  ) => ScreenshotPlanForTest;
  getRectsByXPath: (
    htmlXPath: string,
    options?: { matchStrategy?: "deepest" | "first" | "all"; excludeAncestors?: boolean; limit?: number }
  ) => RectPlanForTest;
  getRectsByText: (
    text: string,
    options?: { matchStrategy?: "deepest" | "first" | "all"; excludeAncestors?: boolean; limit?: number }
  ) => RectPlanForTest;
  getRectByReactPath: (reactPath: string) => RectPlanForTest["items"][number] | null;
  getBudgetInfo: () => BudgetInfoForTest;
};

function decodeOutput(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function runBuildCommand(command: string[], label: string): void {
  const proc = Bun.spawnSync({
    cmd: command,
    cwd: PROJECT_ROOT,
    stdout: "pipe",
    stderr: "pipe"
  });

  if (proc.exitCode !== 0) {
    throw new Error(
      `${label} failed with code ${proc.exitCode}\nstdout:\n${decodeOutput(proc.stdout)}\nstderr:\n${decodeOutput(proc.stderr)}`
    );
  }
}

function buildProbeScript(): string {
  runBuildCommand(["bun", "run", "build"], "probe build");
  const resolved = resolveReactProbeBundlePath({
    env: {
      HOME: Bun.env.HOME,
      CODEX_HOME: Bun.env.CODEX_HOME
    },
    skillDir: PROJECT_ROOT,
    cwd: PROJECT_ROOT
  });
  return readFileSync(resolved.bundlePath, "utf8");
}

function buildIndependentReactAppScript(): string {
  mkdirSync(TMP_DIR, { recursive: true });
  runBuildCommand(
    [
      "bun",
      "build",
      INDEPENDENT_APP_ENTRY,
      "--target",
      "browser",
      "--format",
      "iife",
      "--outfile",
      INDEPENDENT_APP_BUNDLE
    ],
    "independent react app build"
  );
  return readFileSync(INDEPENDENT_APP_BUNDLE, "utf8");
}

function unwrapRuntimeValue(result: RuntimeEvaluateResult): unknown {
  if (result.exceptionDetails !== undefined) {
    throw new Error(`Runtime.evaluate exception: ${result.exceptionDetails.text ?? "unknown"}`);
  }
  return result.result?.value;
}

async function newPageWithIndependentApp(
  browser: Browser,
  probeScript: string,
  appScript: string,
  mode: "initScript" | "evaluate"
): Promise<Page> {
  const page = await browser.newPage();
  if (mode === "initScript") {
    await page.addInitScript({ content: probeScript });
  }

  await page.goto(`data:text/html,${encodeURIComponent('<!doctype html><html><body><div id="app"></div></body></html>')}`);

  if (mode === "evaluate") {
    await page.evaluate(probeScript);
  }

  await page.evaluate(appScript);
  await page.waitForSelector('[data-testid="independent-root"]');
  await page.waitForSelector('[data-testid="leaf"]');

  return page;
}

async function cdpEvaluate(session: CDPSession, expression: string): Promise<unknown> {
  const result = (await session.send("Runtime.evaluate", {
    expression,
    returnByValue: true
  })) as RuntimeEvaluateResult;

  return unwrapRuntimeValue(result);
}

describe("playwright/cdp e2e", () => {
  const EXPECTED_CASES = 14;
  let browser: Browser;
  let probeScript = "";
  let independentReactAppScript = "";
  let startedCases = 0;

  beforeAll(async () => {
    probeScript = buildProbeScript();
    independentReactAppScript = buildIndependentReactAppScript();
    browser = await chromium.launch({ channel: "chrome", headless: true });
  });

  beforeEach(() => {
    startedCases += 1;
  });

  afterAll(async () => {
    await browser.close();
    expect(startedCases).toBe(EXPECTED_CASES);
  });

  test("playwright addInitScript + independent React app + core probe APIs", async () => {
    const page = await newPageWithIndependentApp(browser, probeScript, independentReactAppScript, "initScript");

    const tree = await page.evaluate(() => {
      const probe = (globalThis as typeof globalThis & { ReactProbe: ProbeApiForTest }).ReactProbe;
      return probe.getReactTree();
    });

    expect(tree).toContain("App");
    expect(tree).toContain("Dashboard");
    expect(tree).toContain("OMITTED_SUBTREE");

    const domTree = await page.evaluate(() => {
      const probe = (globalThis as typeof globalThis & { ReactProbe: ProbeApiForTest }).ReactProbe;
      return probe.getDomTree();
    });
    expect(domTree).toContain('data-testid="independent-root"');

    const screenshotPlan = await page.evaluate(() => {
      const probe = (globalThis as typeof globalThis & { ReactProbe: ProbeApiForTest }).ReactProbe;
      return probe.screenshotByXPath("//li[@data-testid='leaf']");
    });

    expect(screenshotPlan.matched).toBeGreaterThan(10);
    expect(screenshotPlan.returned).toBe(5);
    expect(screenshotPlan.omitted).toBeGreaterThan(0);

    await page.close();
  });

  test("playwright route switch + reactPath lookup + html/state extraction", async () => {
    const page = await newPageWithIndependentApp(browser, probeScript, independentReactAppScript, "initScript");

    await page.click('[data-testid="nav-settings"]');
    await page.waitForSelector('[data-testid="settings"]');

    const settingsPath = await page.evaluate(() => {
      const probe = (globalThis as typeof globalThis & { ReactProbe: ProbeApiForTest }).ReactProbe;
      const selected = probe.getReactTree((react) => react.findOne({ displayName: "Settings" }));
      const match = selected.match(/\(@reactPath=([^)]+)\)/);
      if (match === null || match[1] === undefined) {
        throw new Error("Settings reactPath missing");
      }
      return match[1];
    });

    const html = await page.evaluate((path) => {
      const probe = (globalThis as typeof globalThis & { ReactProbe: ProbeApiForTest }).ReactProbe;
      return probe.getReactRenderedHtml(path);
    }, settingsPath);
    expect(html).toContain('data-testid="settings"');

    const extractedState = await page.evaluate((path) => {
      const probe = (globalThis as typeof globalThis & { ReactProbe: ProbeApiForTest }).ReactProbe;
      return probe.getReactStateAndHooks(path, (full) => {
        const record = full as {
          displayName?: string;
          hooks?: Array<{ memoizedState?: unknown }>;
        };
        const hooks = Array.isArray(record.hooks) ? record.hooks : [];
        const first = hooks[0]?.memoizedState;
        const second = hooks[1]?.memoizedState;
        const secondLen = typeof second === "string" ? second.length : -1;

        return {
          displayName: record.displayName,
          first,
          secondLen
        };
      });
    }, settingsPath);

    expect(extractedState).toContain('"displayName": "Settings"');
    expect(extractedState).toContain('"first": "settings"');
    expect(extractedState).toContain('"secondLen": 260');

    const stateAndHooks = await page.evaluate((path) => {
      const probe = (globalThis as typeof globalThis & { ReactProbe: ProbeApiForTest }).ReactProbe;
      return probe.getReactStateAndHooks(path, (full) => ({
        full,
        veryLong: "X".repeat(9000)
      }));
    }, settingsPath);

    expect(stateAndHooks.length).toBeLessThanOrEqual(BUDGET_MAX_CHARS);
    expect(stateAndHooks).toContain("TRUNCATED");

    await page.close();
  });

  test("playwright reflects latest state after interactions via reactPath", async () => {
    const page = await newPageWithIndependentApp(browser, probeScript, independentReactAppScript, "initScript");

    const appPath = await page.evaluate(() => {
      const probe = (globalThis as typeof globalThis & { ReactProbe: ProbeApiForTest }).ReactProbe;
      const selected = probe.getReactTree((react) => react.findOne({ displayName: "App" }));

      const match = selected.match(/\(@reactPath=([^)]+)\)/);
      if (match === null || match[1] === undefined) {
        throw new Error("App reactPath missing");
      }
      return match[1];
    });

    const readState = async (): Promise<string> =>
      page.evaluate((path) => {
        const probe = (globalThis as typeof globalThis & { ReactProbe: ProbeApiForTest }).ReactProbe;
        return probe.getReactStateAndHooks(path, (full) => {
          const record = full as { hooks?: Array<{ memoizedState?: unknown }> };
          const hooks = Array.isArray(record.hooks) ? record.hooks : [];
          const states = hooks.map((item) => item?.memoizedState);
          const count = states.find((value) => typeof value === "number");
          return { count };
        });
      }, appPath);

    const before = await readState();
    expect(before).toContain('"count": 2');

    await page.click('[data-testid="count-inc"]');
    await page.click('[data-testid="count-inc"]');
    await page.click('[data-testid="nav-settings"]');
    await page.waitForSelector('[data-testid="settings"]');

    const after = await readState();
    expect(after).toContain('"count": 4');

    await page.close();
  });

  test("playwright can pinpoint a repeated component and validate props/state/html", async () => {
    const page = await newPageWithIndependentApp(browser, probeScript, independentReactAppScript, "initScript");

    const rowPath = await page.evaluate(() => {
      const probe = (globalThis as typeof globalThis & { ReactProbe: ProbeApiForTest }).ReactProbe;
      const selected = probe.getReactTree((react) =>
        react.findOne({
          displayName: "Row2",
          dataAttrEquals: {
            "data-item-id": "seed-42-item-37"
          }
        })
      );

      const match = selected.match(/\(@reactPath=([^)]+)\)/);
      if (match === null || match[1] === undefined) {
        throw new Error("Row reactPath missing");
      }
      return match[1];
    });

    const rowState = await page.evaluate((path) => {
      const probe = (globalThis as typeof globalThis & { ReactProbe: ProbeApiForTest }).ReactProbe;
      return probe.getReactStateAndHooks(path, (full) => {
        const record = full as {
          displayName?: string;
          props?: { itemId?: string; index?: number };
          hooks?: Array<{ memoizedState?: unknown }>;
        };
        const hookState = Array.isArray(record.hooks) ? record.hooks[0]?.memoizedState : undefined;

        return {
          displayName: record.displayName,
          itemId: record.props?.itemId,
          index: record.props?.index,
          hookState
        };
      });
    }, rowPath);

    expect(rowState).toContain('"displayName"');
    expect(rowState).toContain('"itemId": "seed-42-item-37"');
    expect(rowState).toContain('"index": 37');
    expect(rowState).toContain('"hookState": false');

    const rowHtml = await page.evaluate((path) => {
      const probe = (globalThis as typeof globalThis & { ReactProbe: ProbeApiForTest }).ReactProbe;
      return probe.getReactRenderedHtml(path);
    }, rowPath);
    expect(rowHtml).toContain('data-item-id="seed-42-item-37"');
    expect(rowHtml).toContain("seed-42-item-37:closed");
    expect(rowHtml).not.toContain('data-item-id="seed-42-item-38"');

    await page.click('[data-testid="nav-settings"]');
    await page.waitForSelector('[data-testid="settings"]');

    await expect(
      page.evaluate((path) => {
        const probe = (globalThis as typeof globalThis & { ReactProbe: ProbeApiForTest }).ReactProbe;
        return probe.getReactStateAndHooks(path);
      }, rowPath)
    ).rejects.toThrow();

    await page.close();
  });

  test("playwright query returns many matches but final output is bounded", async () => {
    const page = await newPageWithIndependentApp(browser, probeScript, independentReactAppScript, "initScript");

    const reactMany = await page.evaluate(() => {
      const probe = (globalThis as typeof globalThis & { ReactProbe: ProbeApiForTest }).ReactProbe;
      return probe.getReactTree((react) => react.query({ dataAttrEquals: { "data-testid": "leaf" } }));
    });
    expect(reactMany).toContain("OMITTED_MATCHES");
    expect(reactMany.length).toBeLessThanOrEqual(BUDGET_MAX_CHARS);

    const domMany = await page.evaluate(() => {
      const probe = (globalThis as typeof globalThis & { ReactProbe: ProbeApiForTest }).ReactProbe;
      return probe.getDomTree((dom) => {
        const record = dom as {
          byXPath: Map<string, ProbeNodeForTest & { dataAttrs?: Record<string, string> }>;
        };
        const matches: ProbeNodeForTest[] = [];
        for (const node of record.byXPath.values()) {
          if (node.dataAttrs?.["data-testid"] === "leaf") {
            matches.push(node);
          }
        }
        return matches;
      });
    });
    expect(domMany).toContain("OMITTED_MATCHES");
    expect(domMany.length).toBeLessThanOrEqual(BUDGET_MAX_CHARS);

    await page.close();
  });

  test("playwright findOne throws on ambiguous query", async () => {
    const page = await newPageWithIndependentApp(browser, probeScript, independentReactAppScript, "initScript");

    await expect(
      page.evaluate(() => {
        const probe = (globalThis as typeof globalThis & { ReactProbe: ProbeApiForTest }).ReactProbe;
        return probe.getReactTree((react) => react.findOne({ dataAttrEquals: { "data-testid": "leaf" } }));
      })
    ).rejects.toThrow();

    await page.close();
  });

  test("playwright screenshotByXPath clips oversized target", async () => {
    const page = await newPageWithIndependentApp(browser, probeScript, independentReactAppScript, "initScript");

    const plan = await page.evaluate(() => {
      const huge = document.createElement("div");
      huge.setAttribute("data-testid", "oversized-target");
      huge.style.position = "fixed";
      huge.style.left = "0";
      huge.style.top = "0";
      huge.style.width = "1600px";
      huge.style.height = "1200px";
      huge.style.background = "red";
      document.body.appendChild(huge);

      const probe = (globalThis as typeof globalThis & { ReactProbe: ProbeApiForTest }).ReactProbe;
      return probe.screenshotByXPath("//div[@data-testid='oversized-target']");
    });

    expect(plan.matched).toBe(1);
    expect(plan.returned).toBe(1);
    expect(plan.omitted).toBe(0);
    expect(plan.items[0]?.clipped).toBe(true);
    expect(plan.items[0]?.clip.width).toBe(800);
    expect(plan.items[0]?.clip.height).toBe(800);

    await page.close();
  });

  test("playwright supports tree/state JSON APIs with meta", async () => {
    const page = await newPageWithIndependentApp(browser, probeScript, independentReactAppScript, "initScript");

    const treeJson = await page.evaluate(() => {
      const probe = (globalThis as typeof globalThis & { ReactProbe: ProbeApiForTest }).ReactProbe;
      return probe.getReactTreeJson((react) => react.query({ displayName: "App" }));
    });
    const treeParsed = JSON.parse(treeJson) as {
      data: Array<{ reactPath?: string }>;
      meta: { truncated: boolean; omitted: boolean; nodeCount: number; charCount: number };
    };
    expect(Array.isArray(treeParsed.data)).toBe(true);
    expect(treeParsed.meta.nodeCount).toBeGreaterThan(0);
    expect(treeParsed.meta.charCount).toBeGreaterThan(0);

    const appPath = await page.evaluate(() => {
      const probe = (globalThis as typeof globalThis & { ReactProbe: ProbeApiForTest }).ReactProbe;
      const selected = probe.getReactTree((react) => react.findOne({ displayName: "App" }));
      const match = selected.match(/\(@reactPath=([^)]+)\)/);
      if (match === null || match[1] === undefined) {
        throw new Error("App reactPath missing");
      }
      return match[1];
    });

    const stateJson = await page.evaluate((path) => {
      const probe = (globalThis as typeof globalThis & { ReactProbe: ProbeApiForTest }).ReactProbe;
      return probe.getReactStateAndHooksJson(path, (full) => ({
        displayName: (full as { displayName?: string }).displayName
      }));
    }, appPath);
    const stateParsed = JSON.parse(stateJson) as {
      data: { displayName?: string };
      meta: { charCount: number };
    };
    expect(stateParsed.data.displayName).toBe("App");
    expect(stateParsed.meta.charCount).toBeGreaterThan(0);

    await page.close();
  });

  test("playwright supports coordinate APIs and strategy-based screenshot planning", async () => {
    const page = await newPageWithIndependentApp(browser, probeScript, independentReactAppScript, "initScript");

    const strategyPlan = await page.evaluate(() => {
      const wrap = document.createElement("section");
      wrap.setAttribute("data-testid", "nest-wrap");
      const inner = document.createElement("div");
      inner.setAttribute("data-testid", "nest-inner");
      const leaf = document.createElement("span");
      leaf.setAttribute("data-testid", "nest-leaf");
      leaf.textContent = "LEAF_TEXT";
      inner.appendChild(leaf);
      wrap.appendChild(inner);
      document.body.appendChild(wrap);

      const probe = (globalThis as typeof globalThis & { ReactProbe: ProbeApiForTest }).ReactProbe;
      return probe.screenshotByXPath(
        "//*[@data-testid='nest-wrap' or @data-testid='nest-inner' or @data-testid='nest-leaf']",
        { matchStrategy: "deepest", limit: 5 }
      );
    });

    expect(strategyPlan.matched).toBe(3);
    expect(strategyPlan.resolved).toBe(1);
    expect(strategyPlan.returned).toBe(1);
    expect(strategyPlan.items[0]?.resolvedXPath).toContain("span");
    expect(strategyPlan.items[0]?.rawRect.width).toBeGreaterThanOrEqual(0);
    expect(strategyPlan.items[0]?.devicePixelRatio).toBeGreaterThan(0);

    const textRects = await page.evaluate(() => {
      const probe = (globalThis as typeof globalThis & { ReactProbe: ProbeApiForTest }).ReactProbe;
      return probe.getRectsByText("LEAF_TEXT", { matchStrategy: "first" });
    });
    expect(textRects.returned).toBe(1);
    expect(textRects.items[0]?.inViewport).toBe(true);

    await page.close();
  });

  test("playwright budget info exposes last run stats", async () => {
    const page = await newPageWithIndependentApp(browser, probeScript, independentReactAppScript, "initScript");

    const info = await page.evaluate(() => {
      const probe = (globalThis as typeof globalThis & { ReactProbe: ProbeApiForTest }).ReactProbe;
      probe.getReactTree();
      return probe.getBudgetInfo();
    });

    expect(info.budget.MAX_CHARS).toBe(BUDGET_MAX_CHARS);
    expect(info.source === "default" || info.source === "override").toBe(true);
    expect(info.lastRunStats?.api).toBe("getReactTree");
    expect((info.lastRunStats?.charCount ?? 0) > 0).toBe(true);

    await page.close();
  });

  test("playwright e2e covers Stage0..Stage4 fallback markers via callback outputs", async () => {
    const page = await newPageWithIndependentApp(browser, probeScript, independentReactAppScript, "initScript");

    const outputs = await page.evaluate(() => {
      const probe = (globalThis as typeof globalThis & { ReactProbe: ProbeApiForTest }).ReactProbe;

      const stage0 = probe.getReactTree(() =>
        Array.from({ length: 205 }, (_unused, index) => ({
          id: `(@reactPath=/SyntheticRoot[${index}])`,
          label: `SyntheticRoot${index}`,
          displayName: `SyntheticRoot${index}`,
          reactPath: `/SyntheticRoot[${index}]`
        }))
      );

      const stage1 = probe.getReactTree(() => ({
        id: "(@r0)",
        label: "W",
        displayName: "W",
        reactPath: "/W",
        children: Array.from({ length: 210 }, (_unused, index) => ({
          id: `(@c${index})`,
          label: `C${index}`,
          displayName: `C${index}`,
          reactPath: `/W/C${index}`
        }))
      }));

      const stage2 = probe.getReactTree(() => ({
        id: "(@reactPath=/Truncate[0])",
        label: "TruncateRoot",
        displayName: "TruncateRoot",
        reactPath: "/Truncate[0]",
        dataAttrs: { "data-big": "D".repeat(500) },
        kv: [{ k: "payload", v: "P".repeat(500) }],
        text: "T".repeat(500)
      }));

      const stage31 = probe.getReactTree(() => ({
        id: "(@reactPath=/Stage31[0])",
        label: "Stage31",
        displayName: "Stage31",
        reactPath: "/Stage31[0]",
        children: Array.from({ length: 90 }, (_unused, index) => ({
          id: `(@reactPath=/Stage31[0]/Node[${index}])`,
          label: `Node${index}`,
          displayName: `Node${index}`,
          reactPath: `/Stage31[0]/Node[${index}]`,
          kv: [{ k: "k", v: "v" }],
          text: "t".repeat(200)
        }))
      }));

      const stage32 = probe.getReactTree(() => ({
        id: "(@reactPath=/Stage32[0])",
        label: "Stage32",
        displayName: "Stage32",
        reactPath: "/Stage32[0]",
        children: Array.from({ length: 120 }, (_unused, index) => ({
          id: `(@reactPath=/Stage32[0]/Node[${index}])`,
          label: `Node${index}`,
          displayName: `Node${index}`,
          reactPath: `/Stage32[0]/Node[${index}]`,
          kv: [{ k: "k", v: "x".repeat(200) }]
        }))
      }));

      const stage33 = probe.getReactTree(() => ({
        id: "(@reactPath=/Stage33[0])",
        label: "Stage33",
        displayName: "Stage33",
        reactPath: "/Stage33[0]",
        children: Array.from({ length: 70 }, (_unused, index) => ({
          id: `(@reactPath=/Stage33[0]/Node[${index}])`,
          label: `Node${index}`,
          displayName: `Node${index}`,
          reactPath: `/Stage33[0]/Node[${index}]`,
          kv: [{ k: `${"veryLongKey".repeat(20)}${index}`, v: "v" }]
        }))
      }));

      let deepNode: ProbeNodeForTest = {
        id: "(@reactPath=/Deep/0)",
        label: `deep-${"x".repeat(70)}`,
        displayName: "Deep",
        reactPath: "/Deep/0"
      };
      for (let depth = 1; depth <= 170; depth += 1) {
        deepNode = {
          id: `(@reactPath=/Deep/${depth})`,
          label: `deep-${depth}-${"y".repeat(70)}`,
          displayName: `Deep${depth}`,
          reactPath: `/Deep/${depth}`,
          children: [deepNode]
        };
      }
      const stage35 = probe.getReactTree(() => deepNode);

      const stage4 = probe.getReactTree(() => ({
        id: `(@reactPath=/${"ID".repeat(4000)})`,
        label: `Label-${"L".repeat(10000)}`,
        displayName: "HardClip",
        reactPath: "/HardClip"
      }));

      return {
        stage0,
        stage1,
        stage2,
        stage31,
        stage32,
        stage33,
        stage35,
        stage4
      };
    });

    expect(outputs.stage0).toContain("OMITTED_MATCHES");
    expect(outputs.stage1).toContain("reason=maxNodes");
    expect(outputs.stage2).toContain("TRUNCATED,len=");

    expect(outputs.stage31).not.toContain("text=");
    expect(outputs.stage31).toContain('{k="v"}');

    expect(outputs.stage32).toContain("{k}");
    expect(outputs.stage32).not.toContain('k="');

    expect(outputs.stage33).not.toContain("{");
    expect(outputs.stage35).toContain("reason=depth");

    expect(outputs.stage4.length).toBeLessThanOrEqual(BUDGET_MAX_CHARS);
    expect(outputs.stage4.includes("TRUNCATED_LINE") || outputs.stage4.includes("TRUNCATED_OUTPUT")).toBe(true);

    for (const value of Object.values(outputs)) {
      expect(value.length).toBeLessThanOrEqual(BUDGET_MAX_CHARS);
    }

    await page.close();
  });

  test("playwright e2e keeps let-it-crash behavior for invalid callback output", async () => {
    const page = await newPageWithIndependentApp(browser, probeScript, independentReactAppScript, "initScript");

    await expect(
      page.evaluate(() => {
        const probe = (globalThis as typeof globalThis & { ReactProbe: ProbeApiForTest }).ReactProbe;
        return probe.getReactTree(() => ({ invalid: true } as unknown as ProbeNodeForTest));
      })
    ).rejects.toThrow();

    await page.close();
  });

  test("cdp Runtime.evaluate + independent React app + callback/fallback flow", async () => {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html><body><div id="app"></div></body></html>');

    const session = await page.context().newCDPSession(page);
    await session.send("Runtime.enable");

    await cdpEvaluate(session, probeScript);
    await cdpEvaluate(session, independentReactAppScript);

    await page.waitForSelector('[data-testid="leaf"]');

    const contextPages = page.context().pages();
    const descriptors = await Promise.all(
      contextPages.map(async (item, index) => ({
        id: String(index),
        type: "page",
        url: item.url(),
        title: await item.title()
      }))
    );
    const selection = selectCdpPageTarget(descriptors, {
      allowUrlPatterns: [/about:blank|data:text|localhost|127\\.0\\.0\\.1/]
    });
    const selectedIndex = Number(selection.selected.id);
    const selectedPage = contextPages[selectedIndex];
    if (selectedPage === undefined) {
      throw new Error("selected cdp page missing");
    }
    expect(selectedPage.url()).toBe(page.url());

    const tree = await cdpEvaluate(session, "globalThis.ReactProbe.getReactTree()");
    expect(typeof tree).toBe("string");
    expect(String(tree)).toContain("App");
    expect(String(tree)).toContain("Dashboard");

    const leafSelection = await cdpEvaluate(
      session,
      `(() => globalThis.ReactProbe.getReactTree((react) =>
        react.query({ dataAttrEquals: { "data-testid": "leaf" } })
      ))()`
    );
    expect(typeof leafSelection).toBe("string");
    expect(String(leafSelection)).toContain("OMITTED_MATCHES");
    expect(String(leafSelection).length).toBeLessThanOrEqual(BUDGET_MAX_CHARS);

    await cdpEvaluate(
      session,
      `(() => {
        const button = document.querySelector('[data-testid="nav-settings"]');
        if (!(button instanceof HTMLButtonElement)) {
          throw new Error("settings button missing");
        }
        button.click();
        return true;
      })()`
    );

    await page.waitForSelector('[data-testid="settings"]');

    const settingsPathValue = await cdpEvaluate(
      session,
      `(() => {
        const selected = globalThis.ReactProbe.getReactTree((react) =>
          react.findOne({ displayName: "Settings" })
        );
        const match = selected.match(/\\(@reactPath=([^)]+)\\)/);
        if (!match || !match[1]) {
          throw new Error("Settings reactPath missing");
        }
        return match[1];
      })()`
    );
    expect(typeof settingsPathValue).toBe("string");
    const settingsPath = String(settingsPathValue);

    const settingsHtml = await cdpEvaluate(
      session,
      `globalThis.ReactProbe.getReactRenderedHtml(${JSON.stringify(settingsPath)})`
    );
    expect(typeof settingsHtml).toBe("string");
    expect(String(settingsHtml)).toContain('data-testid="settings"');

    const extractedState = await cdpEvaluate(
      session,
      `globalThis.ReactProbe.getReactStateAndHooks(${JSON.stringify(
        settingsPath
      )}, (full) => {
        const hooks = Array.isArray(full?.hooks) ? full.hooks : [];
        const first = hooks[0]?.memoizedState;
        const second = hooks[1]?.memoizedState;
        return {
          displayName: full?.displayName,
          first,
          secondLen: typeof second === "string" ? second.length : -1
        };
      })`
    );
    expect(typeof extractedState).toBe("string");
    expect(String(extractedState)).toContain('"displayName": "Settings"');
    expect(String(extractedState)).toContain('"first": "settings"');
    expect(String(extractedState)).toContain('"secondLen": 260');

    const screenshotPlan = await cdpEvaluate(
      session,
      `globalThis.ReactProbe.screenshotByXPath("//section[@data-testid='settings']")`
    );
    const typedPlan = screenshotPlan as ScreenshotPlanForTest;
    expect(typedPlan.matched).toBe(1);
    expect(typedPlan.returned).toBe(1);
    expect(typedPlan.maxScreenshots).toBe(5);
    expect(typedPlan.items[0]?.rawRect.width).toBeGreaterThanOrEqual(0);

    const treeJson = await cdpEvaluate(
      session,
      `globalThis.ReactProbe.getReactTreeJson((react) => react.query({ displayName: "App" }))`
    );
    const typedTreeJson = JSON.parse(String(treeJson)) as {
      data: unknown[];
      meta: { nodeCount: number; charCount: number };
    };
    expect(Array.isArray(typedTreeJson.data)).toBe(true);
    expect(typedTreeJson.meta.nodeCount).toBeGreaterThan(0);
    expect(typedTreeJson.meta.charCount).toBeGreaterThan(0);

    const rectsByText = await cdpEvaluate(
      session,
      `globalThis.ReactProbe.getRectsByXPath("//section[@data-testid='settings']", { matchStrategy: "first" })`
    );
    const typedRects = rectsByText as RectPlanForTest;
    expect(typedRects.returned).toBe(1);
    expect(typeof typedRects.items[0]?.inViewport).toBe("boolean");

    const budgetInfo = await cdpEvaluate(session, `globalThis.ReactProbe.getBudgetInfo()`);
    const typedBudget = budgetInfo as BudgetInfoForTest;
    expect(typedBudget.budget.MAX_CHARS).toBe(BUDGET_MAX_CHARS);
    expect(typedBudget.lastRunStats).not.toBeNull();

    await page.close();
  });

  test("cdp findOne throws on ambiguous query", async () => {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html><body><div id="app"></div></body></html>');

    const session = await page.context().newCDPSession(page);
    await session.send("Runtime.enable");

    await cdpEvaluate(session, probeScript);
    await cdpEvaluate(session, independentReactAppScript);
    await page.waitForSelector('[data-testid="leaf"]');

    await expect(
      cdpEvaluate(
        session,
        `globalThis.ReactProbe.getReactTree((react) =>
          react.findOne({ dataAttrEquals: { "data-testid": "leaf" } })
        )`
      )
    ).rejects.toThrow();

    await page.close();
  });
});
