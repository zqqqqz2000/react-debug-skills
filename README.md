# React Probe Scale

[English](#english) | [中文](#zh)

<a id="english"></a>
## English

This project gives code agents with Playwright / Chrome CDP / MCP access a focused React debugging surface to inspect:

- component `state`
- component `props`
- React virtual tree (Fiber view)
- rendered output (HTML)
- DOM structure and XPath screenshot plans

After `dist/probe.scale.js` runs in the page context, use `globalThis.ReactProbe`.

### API Surface

- `getDomTree(findCallback?) => string`
- `getReactTree(findCallback?) => string`
- `getReactRenderedHtml(reactPath) => string`
- `getReactStateAndHooks(reactPath, transform?) => string`
- `screenshotByXPath(htmlXPath) => ScreenshotPlan`

### Build and Verify

```bash
bun install
bun run lint
bun run test
bun run build
```

Output artifact: `dist/probe.scale.js`

### Skill Installation

Installable skill in this repo: `skills/react-probe/SKILL.md`

Local install:

```bash
SKILL_HOME="${CODEX_HOME:-$HOME/.codex}/skills/react-probe"
mkdir -p "$SKILL_HOME"
cp -R skills/react-probe/* "$SKILL_HOME/"
```

Install from GitHub by repo/path:

```bash
python3 "${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-installer/scripts/install-skill-from-github.py" \
  --repo <owner>/<repo> \
  --path skills/react-probe
```

Restart Codex after installation.

### Recommended Flow

1. Use `getReactTree((react) => react.query(criteria))` to locate candidate components.
2. Extract `(@reactPath=...)` from output lines.
3. Call `getReactStateAndHooks(reactPath)` for state/hooks inspection.
4. Call `getReactRenderedHtml(reactPath)` for rendered output.

`reactPath` is Probe-defined (not W3C XPath). Examples:

- `/Root[0]/App[0]`
- `/Root[0]/App[0]/Dashboard[0]/section[0]/ul[0]/Row2[37]`

### Budget and Fallback

Internal fixed budgets (not exposed as runtime function parameters):

- `MAX_CHARS = 6000`
- `VALUE_MAX_CHARS = 200`
- `MAX_NODES = 200`
- `MAX_SCREENSHOTS = 5`
- `CLIP_MAX_WIDTH = 800`
- `CLIP_MAX_HEIGHT = 800`

All outputs are converged to budget and explicitly marked when reduced:

- `…(TRUNCATED,len=...)`
- `…(OMITTED_SUBTREE, reason=..., omittedChildren=...)`
- `…(OMITTED_MATCHES, omitted=...)`
- `…(TRUNCATED_LINE)` / `…(TRUNCATED_OUTPUT)`

<a id="zh"></a>
## 中文

给带有 Playwright / Chrome CDP / MCP 能力的 Code Agent 提供一组 React 调试能力，用于定位和读取：

- 组件 `state`
- 组件 `props`
- React 虚拟树（Fiber 视图）
- 组件对应的渲染结果（HTML）
- DOM 结构与 XPath 截图计划

运行 `dist/probe.scale.js` 后，页面上下文可使用 `globalThis.ReactProbe`。

### 能力列表

- `getDomTree(findCallback?) => string`
- `getReactTree(findCallback?) => string`
- `getReactRenderedHtml(reactPath) => string`
- `getReactStateAndHooks(reactPath, transform?) => string`
- `screenshotByXPath(htmlXPath) => ScreenshotPlan`

### 构建与验证

```bash
bun install
bun run lint
bun run test
bun run build
```

输出文件：`dist/probe.scale.js`

### Skill 安装

本仓库内置可安装 Skill：`skills/react-probe/SKILL.md`

本地安装：

```bash
SKILL_HOME="${CODEX_HOME:-$HOME/.codex}/skills/react-probe"
mkdir -p "$SKILL_HOME"
cp -R skills/react-probe/* "$SKILL_HOME/"
```

从 GitHub 按 repo/path 安装：

```bash
python3 "${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-installer/scripts/install-skill-from-github.py" \
  --repo <owner>/<repo> \
  --path skills/react-probe
```

安装后重启 Codex。

### 使用流程（推荐）

1. 用 `getReactTree((react) => react.query(criteria))` 找候选组件
2. 从输出中提取 `(@reactPath=...)`
3. 用 `getReactStateAndHooks(reactPath)` 读状态与 hooks
4. 用 `getReactRenderedHtml(reactPath)` 读对应渲染结果

`reactPath` 是 Probe 定义的 React 路径（不是 W3C XPath），示例：

- `/Root[0]/App[0]`
- `/Root[0]/App[0]/Dashboard[0]/section[0]/ul[0]/Row2[37]`

### 预算与降级

内部固定预算（不走函数参数）：

- `MAX_CHARS = 6000`
- `VALUE_MAX_CHARS = 200`
- `MAX_NODES = 200`
- `MAX_SCREENSHOTS = 5`
- `CLIP_MAX_WIDTH = 800`
- `CLIP_MAX_HEIGHT = 800`

所有输出最终都会收敛到预算范围，并显式标记省略/截断：

- `…(TRUNCATED,len=...)`
- `…(OMITTED_SUBTREE, reason=..., omittedChildren=...)`
- `…(OMITTED_MATCHES, omitted=...)`
- `…(TRUNCATED_LINE)` / `…(TRUNCATED_OUTPUT)`
