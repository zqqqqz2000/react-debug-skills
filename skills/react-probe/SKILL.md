---
name: react-probe
description: "Operate ReactProbe in Playwright/Chrome CDP/MCP debugging sessions for React-focused inspection: component lookup, reactPath navigation, state/hooks extraction, props visibility, and rendered HTML retrieval with bounded output."
---

# React Probe

## Runtime Entry

1. Use the prebuilt `dist/probe.scale.js` from this repository.
2. Load it into the target page via Playwright `addInitScript` or CDP `Runtime.evaluate`.
3. Ensure `globalThis.ReactProbe` exists before calling APIs.

## Public APIs

`globalThis.ReactProbe` exposes exactly five functions:

- `getDomTree(findCallback?) => string`
- `getReactTree(findCallback?) => string`
- `getReactRenderedHtml(reactPath) => string`
- `getReactStateAndHooks(reactPath, transform?) => string`
- `screenshotByXPath(htmlXPath) => ScreenshotPlan`

## React Debug Flow

1. Use `getReactTree((react) => react.query(criteria))` to locate candidates.
2. Extract `(@reactPath=...)` from returned lines.
3. Use `react.findOne(criteria)` when uniqueness is required.
4. Call `getReactStateAndHooks(reactPath)` for state/hooks (and props in returned structure) inspection.
5. Call `getReactRenderedHtml(reactPath)` for rendered output verification.
6. Use `screenshotByXPath(htmlXPath)` only when host-side screenshot clipping is needed.

## `reactPath` Rules

`reactPath` is a Probe-defined React tree path, not W3C XPath.

- Root segment is `/Root[n]`.
- Child segment is `/<DisplayName>[i]`.
- `n` and `i` are 0-based.
- Path must be complete and unique.

Examples:

- `/Root[0]/App[0]`
- `/Root[0]/App[0]/Dashboard[0]/section[0]/ul[0]/Row2[37]`

## Budget and Fallback Guarantees

Internal constants are fixed inside Probe and are not function parameters:

- `MAX_CHARS=6000`
- `VALUE_MAX_CHARS=200`
- `MAX_NODES=200`
- `MAX_SCREENSHOTS=5`
- `CLIP_MAX_WIDTH=800`
- `CLIP_MAX_HEIGHT=800`

Rules:

- Callback input is full IR (never truncated).
- Callback output is always converged by Stage 0..4 fallback.
- Omission and truncation are explicit with markers such as:
  - `…(TRUNCATED,len=...)`
  - `…(OMITTED_SUBTREE, reason=..., omittedChildren=...)`
  - `…(OMITTED_MATCHES, omitted=...)`
  - `…(TRUNCATED_LINE)` / `…(TRUNCATED_OUTPUT)`

Optional host-side override is allowed only before injection via `globalThis.__REACT_PROBE_BUDGET__`.

## Error Handling Policy

Use let-it-crash semantics:

- No dispatcher/invoke wrapper.
- No unified return envelope.
- Invalid callback return or invalid `reactPath` should throw directly.
