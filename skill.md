# React Probe Skill (Playwright/CDP Debug Injection)

## 1) 用途与能力概览

`dist/probe.scale.js` 是一个浏览器端可注入 Probe，专门给 Playwright、Chrome CDP（含 MCP debug 场景）在调试 React 应用时使用。

注入后会暴露：

```js
globalThis.ReactProbe = {
  getDomTree,
  getReactTree,
  getReactRenderedHtml,
  getReactStateAndHooks,
  screenshotByXPath,
};
```

能力：

- DOM 树读取（结构优先，预算内输出，可知省略）
- React Fiber 树读取（优先走 `__REACT_DEVTOOLS_GLOBAL_HOOK__`，否则 DOM 私有字段回退）
- React 节点渲染 HTML 获取（`reactPath` 定位）
- React state/hooks 提取（支持 transform）
- XPath 截图计划生成（不直接截图，不返回 base64）

说明：

- `reactPath` 是 Probe 定义的 React 组件树路径（例如 `/Root[0]/App[0]/Settings[0]`），不是 W3C HTML XPath 语法。
- `htmlXPath`（`screenshotByXPath`）才是标准 `document.evaluate` XPath。

---

## 2) Build

```bash
bun install && bun run lint && bun run test && bun run build
```

构建产物：

- `dist/probe.scale.js`

---

## 3) 注入方式

### 3.1 Playwright 注入示例

```ts
import { readFileSync } from "node:fs";

const script = readFileSync("dist/probe.scale.js", "utf8");

await page.addInitScript({ content: script });
await page.goto("http://localhost:3000");

const domTree = await page.evaluate(() => globalThis.ReactProbe.getDomTree());
console.log(domTree);
```

也可在页面加载后：

```ts
await page.evaluate(script);
```

### 3.2 Chrome CDP Runtime.evaluate 示例

```ts
const script = fs.readFileSync("dist/probe.scale.js", "utf8");

await cdp.send("Runtime.evaluate", {
  expression: script,
});

const result = await cdp.send("Runtime.evaluate", {
  expression: "globalThis.ReactProbe.getReactTree()",
  returnByValue: true,
});
```

---

## 4) 函数调用示例

### 4.1 `getDomTree(findCallback?) => string`

输入：

- 可选 `findCallback(domIR)`，返回 `DomNode` 或 `DomNode[]`

输出：

- 树状文本（预算收敛后）

示例：

```js
const out = globalThis.ReactProbe.getDomTree((dom) => {
  const body = dom.byXPath.get("/html[1]/body[1]");
  return body?.children ?? [];
});
```

### 4.2 `getReactTree(findCallback?) => string`

输入：

- 可选 `findCallback(reactIR)`，返回 `ReactNode` 或 `ReactNode[]`
- `reactIR` 内置查询辅助：
  - `reactIR.query(criteria) => ReactNode[]`（默认多结果）
  - `reactIR.findOne(criteria) => ReactNode`（0 或 >1 会 throw）

输出：

- 含 `displayName + reactPath` 的树状文本
- 每行 id 形如 `(@reactPath=/Root[0]/App[0]/Child[1])`

`reactPath` 规则（必须按此写）：

- 根节点以 `/Root[n]` 开始，`n` 是根索引
- 每一段是 `/<displayName>[i]`
- `displayName` 是该 fiber 的可展示名（函数组件名、类名、或 host tag）
- `i` 是同级同名节点的 0-based 序号
- 路径必须完整且唯一，不能用 `//`、`*`、属性谓词等标准 XPath 语法

示例：

- `/Root[0]/App[0]`
- `/Root[0]/App[0]/Dashboard[0]/section[0]/ul[0]/Row2[37]`

示例：

```js
const out = globalThis.ReactProbe.getReactTree((react) => react.roots);
```

```js
const single = globalThis.ReactProbe.getReactTree((react) =>
  react.findOne({
    displayName: "Settings",
  })
);
```

```js
const many = globalThis.ReactProbe.getReactTree((react) =>
  react.query({
    dataAttrEquals: { "data-testid": "leaf" },
  })
);
```

`criteria` 可用字段：

- `displayName?: string`
- `label?: string`
- `reactPath?: string`
- `reactPathPrefix?: string`
- `dataAttrEquals?: Record<string,string>`
- `propEquals?: Record<string, string | number | boolean | null>`
- `textIncludes?: string`

推荐调用链（LLM 调试）：

1. `Query`：`react.query(criteria)` 先找候选（默认 `Node[]`）
2. `Node`：需要唯一时改用 `react.findOne(criteria)`（找不到/不唯一直接抛错）
3. `reactPath`：从节点行里的 `(@reactPath=...)` 取出路径
4. 读取：把该 `reactPath` 传给 `getReactStateAndHooks` / `getReactRenderedHtml`

预算保护说明：

- `react.query(...)` 本身返回完整匹配列表给 callback（不截断）
- 只有当 callback 最终把 `Node`/`Node[]` 返回给 `getReactTree` 时，才进入 Stage 0→4 收敛
- 因此 `query` 多结果默认安全，只要最终输出经过 `getReactTree`

### 4.3 `getReactRenderedHtml(reactPath) => string`

输入：

- `reactPath`（完整唯一 React 虚拟树路径）

输出：

- 对应 host DOM 的 `outerHTML`（预算收敛后）

示例：

```js
const html = globalThis.ReactProbe.getReactRenderedHtml("/Root[0]/App[0]");
```

### 4.4 `getReactStateAndHooks(reactPath, transform?) => string`

输入：

- `reactPath`
- 可选 `transform(full)`，`full` 是完整未截断 state/hooks

输出：

- transform 结果（或 full）经 `safeStringify + 预算收敛` 的字符串

示例：

```js
const out = globalThis.ReactProbe.getReactStateAndHooks("/Root[0]/App[0]", (full) => ({
  onlyHooks: full.hooks,
}));
```

### 4.5 `screenshotByXPath(htmlXPath) => ScreenshotPlan`

输入：

- HTML XPath

输出：

- 截图计划（匹配数、裁剪信息、是否被裁剪）

示例：

```js
const plan = globalThis.ReactProbe.screenshotByXPath("//button[@data-testid='submit']");
```

---

## 5) screenshotByXPath 的宿主执行方式（伪代码）

Probe 只返回截图计划，不执行真实截图。宿主（Playwright/CDP）按 `plan.items[].clip` 截图：

```ts
const plan = await page.evaluate(() =>
  globalThis.ReactProbe.screenshotByXPath("//section[@data-testid='counter']")
);

for (const item of plan.items) {
  await page.screenshot({
    path: `shot-${sanitize(item.xpath)}.png`,
    clip: item.clip,
  });
}
```

---

## 6) 预算与截断规则

预算是 Probe 内部 `const`，不在函数签名中暴露：

- `MAX_CHARS = 6000`
- `VALUE_MAX_CHARS = 200`
- `MAX_NODES = 200`
- `MAX_SCREENSHOTS = 5`
- `CLIP_MAX_WIDTH = 800`
- `CLIP_MAX_HEIGHT = 800`

关键点：

- callback 输入永远是完整 IR，不截断
- callback 输出一定会被强制预算收敛（Stage 0 → Stage 4）
- 所有省略/截断都会显式标记：
  - `…(TRUNCATED,len=...)`
  - `…(OMITTED_SUBTREE, reason=..., omittedChildren=...)`
  - `…(OMITTED_MATCHES, omitted=...)`
  - `…(TRUNCATED_LINE)` / `…(TRUNCATED_OUTPUT)`

可选宿主覆盖：

- 注入前可通过 `globalThis.__REACT_PROBE_BUDGET__` 覆盖预算
- 覆盖入口不在函数签名内，调用时不可传参控制
