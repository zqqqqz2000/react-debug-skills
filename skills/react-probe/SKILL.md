---
name: react-probe
description: "Operate ReactProbe in Playwright/Chrome CDP/MCP debugging sessions, including Electron renderer contexts, for React-focused inspection: component lookup, reactPath navigation, state/hooks extraction, props visibility, rendered HTML retrieval, and bounded output handling."
---

# React Probe

## Scope

Use this skill for React runtime debugging in browser pages and Electron renderer pages.
Focus on: component lookup, `reactPath` navigation, state/hooks/props reading, rendered HTML verification, and bounded output.

## Bundle Resolution Policy

Resolve `probe.scale.js` with a fixed search order:

1. `REACT_PROBE_BUNDLE`
2. `<skill_dir>/dist/probe.scale.js`
3. `<cwd>/dist/probe.scale.js`

Startup checks before execution:

1. Build the ordered candidate list.
2. For each candidate, check existence and readability.
3. Load the first valid file.

Standard failure codes:

- `E_BUNDLE_NOT_FOUND`: no candidate file exists.
- `E_BUNDLE_UNREADABLE`: candidate exists but cannot be read.

Error message requirements:

- Include all checked paths in order.
- Include the selected path on success.

Example shape:

```text
E_BUNDLE_NOT_FOUND checked=[/a/probe.scale.js,/b/probe.scale.js,/c/probe.scale.js]
```

## CDP Target Selection Policy

Use a fixed target-selection flow for CDP/Electron:

1. List all current targets/pages.
2. Start with `type=page` candidates.
3. Apply URL/title allow rules (project/business match first).
4. Apply URL/title block rules (third-party auth/payment/help pages excluded from default set).
5. If candidate count is `1`, auto-select.
6. If candidate count is `>1`, print candidate list and require explicit selection.

Candidate list output should include at least:

- index
- URL
- title
- opener relation when available

## Electron CDP Debug

Use CDP to debug Electron renderer. Standard flow: start Electron with `--remote-debugging-port`, connect via `chromium.connectOverCDP()`, select the correct `page` target, load `REACT_PROBE_BUNDLE` (`probe.scale.js`), then run click/state-read/cropped-screenshot operations.

```bash
# 1) Start Electron (example)
REACT_PROBE_BUNDLE=/absolute/path/to/probe.scale.js \
  electron . --remote-debugging-port=9333
```

```js
// 2) Connect via CDP and run debug flow (example)
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

function resolveProbeBundle() {
  const checked = [];
  const skillDir = process.env.REACT_PROBE_SKILL_DIR || process.cwd();
  const candidates = [
    process.env.REACT_PROBE_BUNDLE,
    path.join(skillDir, "dist/probe.scale.js"),
    path.join(process.cwd(), "dist/probe.scale.js"),
  ].filter(Boolean);

  for (const p of candidates) {
    checked.push(p);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      fs.accessSync(p, fs.constants.R_OK);
      return { bundlePath: p, checked };
    }
  }

  throw new Error(`E_BUNDLE_NOT_FOUND checked=${JSON.stringify(checked)}`);
}

(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9333");
  const context = browser.contexts()[0];

  // Select renderer target: prefer business page
  const pages = context.pages();
  const candidates = pages.filter((p) => /localhost|index\.html/.test(p.url()));
  const page = candidates.length === 1 ? candidates[0] : (candidates[0] || pages[0]);

  const { bundlePath } = resolveProbeBundle();
  const bundleCode = fs.readFileSync(bundlePath, "utf8");
  await page.evaluate(bundleCode);

  const hasProbe = await page.evaluate(() => Boolean(globalThis.ReactProbe));
  if (!hasProbe) throw new Error("ReactProbe injection failed");

  // Click operation (example)
  await page.locator("a", { hasText: "Ref 1" }).first().click();

  // React debug read (example)
  const tree = await page.evaluate(() =>
    globalThis.ReactProbe.getReactTree((react) =>
      react.query({ displayName: "App" })
    )
  );
  console.log(tree);

  // Capture element region only, not full page (example)
  const box = await page.locator("text=TOOLS").first().boundingBox();
  if (box) {
    await page.screenshot({
      path: "/tmp/tools-crop.png",
      clip: { x: box.x, y: box.y, width: box.width, height: box.height },
    });
  }

  await browser.close();
})();
```

## Public APIs

`globalThis.ReactProbe` exposes these functions:

- `getDomTree(findCallback?) => string`
- `getReactTree(findCallback?) => string`
- `getReactRenderedHtml(reactPath) => string`
- `getReactStateAndHooks(reactPath, transform?) => string`
- `screenshotByXPath(htmlXPath) => ScreenshotPlan`

## Component Location Strategy (Production)

Treat `displayName` as high-confidence in dev, lower-confidence in production builds.
Use this fallback order for production lookup:

1. props/data attributes (`data-testid`, business ids, flags)
2. ancestor structure (`reactPathPrefix`, stable parent component pattern)
3. text anchors (`textIncludes`)
4. rendered HTML fragments from `getReactRenderedHtml`

## React Debug Flow

1. Run `getReactTree((react) => react.query(criteria))` to collect candidates.
2. Narrow to one node with stronger criteria or `react.findOne(criteria)`.
3. Extract `(@reactPath=...)`.
4. Read state/hooks via `getReactStateAndHooks(reactPath, transform)`.
5. Verify rendered output via `getReactRenderedHtml(reactPath)`.

## `transform` Cookbook

These recipes are business-specific examples that demonstrate writing style and approach only.
Write the actual `transform` input/output based on real props and runtime structure in your target app.

Constraints for `transform` output:

- return JSON-safe small objects/arrays
- aggregate instead of returning full nested trees
- cap traversal depth and list sizes

### Recipe 1: failed-item filter

```js
(path) => globalThis.ReactProbe.getReactStateAndHooks(path, (x) => {
  const rows = (x?.props?.toolStatuses || []).filter(i => i?.status === "failed");
  return {
    failed: rows.length,
    rows: rows.slice(0, 20).map(r => ({ id: r.id, reason: r.reason, code: r.code })),
  };
})
```

### Recipe 2: aggregate by failure reason

```js
(path) => globalThis.ReactProbe.getReactStateAndHooks(path, (x) => {
  const rows = (x?.props?.toolStatuses || []).filter(i => i?.status === "failed");
  const byReason = {};
  for (const r of rows) byReason[r.reason || "UNKNOWN"] = (byReason[r.reason || "UNKNOWN"] || 0) + 1;
  return { failed: rows.length, byReason };
})
```

### Recipe 3: group by message id

```js
(path) => globalThis.ReactProbe.getReactStateAndHooks(path, (x) => {
  const rows = Array.isArray(x?.props?.events) ? x.props.events : [];
  const groups = {};
  for (const r of rows) {
    const id = r?.messageId || "UNKNOWN";
    groups[id] = groups[id] || { count: 0, failed: 0 };
    groups[id].count += 1;
    if (r?.status === "failed") groups[id].failed += 1;
  }
  return {
    messageGroupCount: Object.keys(groups).length,
    groups,
  };
})
```

## Coordinate-First Capture Strategy

Use coordinate-first capture for token-efficient debugging:

1. Use API/tooling to get element rectangles.
2. Capture element/local regions first.
3. Capture full page only when total crop area exceeds full-page area.

Area decision rule:

- if `sum(crop.width * crop.height) <= fullPage.width * fullPage.height`: keep crop captures
- else: take one full-page capture

When using `screenshotByXPath`, treat `items[].clip` as the primary crop plan and keep `items[].xpath` for reproducibility.

## `reactPath` Rules

`reactPath` is a Probe-defined React tree path, not W3C XPath.

- Root segment: `/Root[n]`
- Child segment: `/<DisplayName>[i]`
- `n` and `i` are 0-based
- Path must be complete and unique

Examples:

- `/Root[0]/App[0]`
- `/Root[0]/App[0]/Dashboard[0]/section[0]/ul[0]/Row2[37]`

## Budget and Fallback Signals

Internal constants are fixed inside Probe and not function parameters:

- `MAX_CHARS=6000`
- `VALUE_MAX_CHARS=200`
- `MAX_NODES=200`
- `MAX_SCREENSHOTS=5`
- `CLIP_MAX_WIDTH=800`
- `CLIP_MAX_HEIGHT=800`

Interpret these markers as budget signals:

- `…(TRUNCATED,len=...)`
- `…(OMITTED_SUBTREE, reason=..., omittedChildren=...)`
- `…(OMITTED_MATCHES, omitted=...)`
- `…(TRUNCATED_LINE)` / `…(TRUNCATED_OUTPUT)`

Optional host-side override entry exists before injection: `globalThis.__REACT_PROBE_BUDGET__`.

## Troubleshooting Checklist

1. Probe presence
   - check: `Boolean(globalThis.ReactProbe)`
   - expected: `true`
   - if fail: rerun bundle resolution policy and report checked paths
2. Tree output
   - check: `getReactTree()` returns non-empty text
   - expected: at least one root line
   - if fail: verify target selection and renderer readiness
3. Target correctness
   - check: selected target URL/title matches business page
   - expected: intended page target
   - if fail: rerun target selection flow and select explicitly
4. Locator hit
   - check: query criteria returns expected hit count
   - expected: 1 for final path extraction
   - if fail: apply production fallback strategy
5. Budget impact
   - check: output markers include truncation/omission tags
   - expected: no markers for small outputs, explicit markers for large outputs
   - if fail: simplify transform output and rerun

## Error Handling

Use natural throw behavior from runtime errors and query mismatches for fast diagnosis.
