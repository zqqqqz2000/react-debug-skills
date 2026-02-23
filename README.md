# React Probe Scale

一个可注入浏览器上下文的 React/DOM Probe，面向 Playwright、Chrome CDP（含 MCP 调试链路）排查线上/预发 React 页面。

注入后仅暴露 5 个函数（无 dispatcher、无统一返回结构、let-it-crash）：

```ts
declare function getDomTree(
  findCallback?: (dom: DomIR) => DomNode | DomNode[]
): string;

declare function getReactTree(
  findCallback?: (react: ReactIR) => ReactNode | ReactNode[]
): string;

declare function getReactRenderedHtml(reactPath: string): string;

declare function getReactStateAndHooks(
  reactPath: string,
  transform?: (full: unknown) => unknown
): string;

declare function screenshotByXPath(htmlXPath: string): ScreenshotPlan;
```

## 1. 能力概览

- DOM 树读取与回调筛选（输出始终预算收敛）
- React Fiber 树读取（优先 `__REACT_DEVTOOLS_GLOBAL_HOOK__`，回退 DOM 私有字段）
- 组件渲染结果读取（`reactPath` -> host DOM -> HTML）
- 组件 state/hooks 读取（支持 transform）
- 标准 XPath 截图计划生成（只返回 plan，不返回 base64）

全局挂载：

```js
globalThis.ReactProbe = {
  getDomTree,
  getReactTree,
  getReactRenderedHtml,
  getReactStateAndHooks,
  screenshotByXPath,
};
```

## 2. 安装与构建

```bash
bun install
bun run lint
bun run test
bun run build
```

构建输出：`dist/probe.scale.js`

## 3. 注入方式

### 3.1 Playwright

```ts
import { readFileSync } from "node:fs";

const script = readFileSync("dist/probe.scale.js", "utf8");
await page.addInitScript({ content: script });
await page.goto("https://example.com");

const tree = await page.evaluate(() => globalThis.ReactProbe.getReactTree());
```

也支持页面加载后注入：

```ts
await page.evaluate(script);
```

### 3.2 Chrome CDP

```ts
const script = fs.readFileSync("dist/probe.scale.js", "utf8");

await cdp.send("Runtime.evaluate", { expression: script });

const result = await cdp.send("Runtime.evaluate", {
  expression: "globalThis.ReactProbe.getReactTree()",
  returnByValue: true,
});
```

## 4. `reactPath` 规则（重点）

`getReactRenderedHtml` / `getReactStateAndHooks` 的参数是 `reactPath`，不是 W3C HTML XPath。

- 根路径格式：`/Root[n]`
- 后续段格式：`/<DisplayName>[i]`
- `n`、`i` 均为 0-based
- 必须完整路径、唯一定位

例子：

- `/Root[0]/App[0]`
- `/Root[0]/App[0]/Dashboard[0]/section[0]/ul[0]/Row2[37]`

推荐调用链：

1. `getReactTree((react) => react.query(...))` 先筛选组件
2. 从返回文本中提取 `(@reactPath=...)`
3. 将该 path 传给 `getReactStateAndHooks` / `getReactRenderedHtml`

## 5. Skill 文档怎么用

本仓库包含 `skill.md`，用于说明该 probe 在 LLM 调试链路中的注入与调用规范。

建议阅读顺序：

1. `skill.md`：注入方式、API 行为、预算与截断约束
2. 本 README：工程落地、测试方式、分发方式

典型用途：

- 在 Playwright/CDP 的自动化调试中，把页面状态转成稳定字符串输出给 LLM
- 在上下文预算有限时，通过统一降级策略避免输出撑爆上下文

## 6. 预算与降级（内部 const，不通过函数参数暴露）

默认预算：

- `MAX_CHARS = 6000`
- `VALUE_MAX_CHARS = 200`
- `MAX_NODES = 200`
- `MAX_SCREENSHOTS = 5`
- `CLIP_MAX_WIDTH = 800`
- `CLIP_MAX_HEIGHT = 800`

约束：

- callback 输入始终是完整 IR（不截断）
- callback 输出始终强制预算收敛
- 省略与截断必须可知：
  - `…(TRUNCATED,len=...)`
  - `…(OMITTED_SUBTREE, reason=..., omittedChildren=...)`
  - `…(OMITTED_MATCHES, omitted=...)`
  - `…(TRUNCATED_LINE)` / `…(TRUNCATED_OUTPUT)`

可选宿主覆盖：可在注入前写 `globalThis.__REACT_PROBE_BUDGET__`，但不进入公开函数签名。

## 7. 测试说明

```bash
bun run test
```

测试覆盖：

- budget Stage 0~4 全阶段
- safeStringify 循环引用
- DOM/React 单元测试
- 真实浏览器 E2E（Playwright + Chrome CDP）
  - 独立 React fixture 注入
  - 多组件查询、歧义抛错、state/html 提取
  - callback 输出预算收敛与 fallback 标记
  - screenshot 计划裁剪上限

## 8. 能否发布到 Codex Skill 市场？

截至 **2026-02-23**，从当前本地工具链看，没有“在本仓库一键发布到官方市场”的直接入口；可行路径通常是：

1. 仓库分发：把 skill 结构化后放到 GitHub，供他人通过 skill installer 按 repo/path 安装。
2. 官方收录：向 `openai/skills` 的 `.curated` 或 `.experimental` 提交 PR，等待维护者审核与收录。

如果你要做“可安装 skill”分发，建议下一步把当前 `skill.md` 改成标准目录形态（例如 `skills/react-probe/SKILL.md`），并补最小示例资产，便于 installer 直接安装。
