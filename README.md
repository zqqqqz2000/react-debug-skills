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

## 2. Skill 安装与使用

标准 Skill 目录已提供：`skills/react-probe/SKILL.md`

### 2.1 本地安装到 Codex

```bash
SKILL_HOME="${CODEX_HOME:-$HOME/.codex}/skills/react-probe"
mkdir -p "$SKILL_HOME"
cp -R skills/react-probe/* "$SKILL_HOME/"
```

安装后重启 Codex 生效。

### 2.2 从 GitHub 仓库安装（repo/path）

```bash
python3 "${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-installer/scripts/install-skill-from-github.py" \
  --repo <owner>/<repo> \
  --path skills/react-probe
```

安装后重启 Codex 生效。

### 2.3 Skill 的作用

`react-probe` skill 用于指导 Codex 在调试任务里：

- 构建并注入 `dist/probe.scale.js`
- 用 `getReactTree` 定位组件并提取 `reactPath`
- 用 `getReactStateAndHooks` / `getReactRenderedHtml` 读取组件行为
- 在有限上下文下依赖 Stage 0..4 降级策略稳定输出

## 3. 安装依赖与构建 Probe

```bash
bun install
bun run lint
bun run test
bun run build
```

构建输出：`dist/probe.scale.js`

## 4. 注入方式

### 4.1 Playwright

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

### 4.2 Chrome CDP

```ts
const script = fs.readFileSync("dist/probe.scale.js", "utf8");

await cdp.send("Runtime.evaluate", { expression: script });

const result = await cdp.send("Runtime.evaluate", {
  expression: "globalThis.ReactProbe.getReactTree()",
  returnByValue: true,
});
```

## 5. `reactPath` 规则（重点）

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

## 8. Skill 市场分发说明

截至 **2026-02-23**，当前本地链路没有“从这个仓库一键发布官方 Codex 市场”的直接按钮。

可行路径：

1. 仓库分发：按 `skills/react-probe` 目录发布到 GitHub，供他人通过 repo/path 安装。
2. 官方收录：向 `openai/skills` 的 `.curated` 或 `.experimental` 提 PR，等待审核。
