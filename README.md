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

### Installation (Codex / Claude Code / Cursor)

Installable skill package in this repo: `skills/react-probe/SKILL.md`

#### Codex

Install from GitHub by repo/path:

```bash
python3 "${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-installer/scripts/install-skill-from-github.py" \
  --repo zqqqqz2000/react-debug-skills \
  --path skills/react-probe
```

Local install:

```bash
SKILL_HOME="${CODEX_HOME:-$HOME/.codex}/skills/react-probe"
mkdir -p "$SKILL_HOME"
cp -R skills/react-probe/* "$SKILL_HOME/"
```

Restart Codex after installation.

#### Claude Code

Recommended project-level setup:

```bash
cat > CLAUDE.md <<'EOF_CLAUDE'
Use ./skills/react-probe/SKILL.md as the workflow when tasks require React runtime debugging through Playwright, Chrome CDP, or MCP.
Focus on state/props, virtual tree, rendered HTML, and bounded output behavior.
EOF_CLAUDE
```

Then run Claude Code from this repo directory:

```bash
claude
```

#### Cursor

Option A (simple, recommended): add a root `AGENTS.md`:

```bash
cat > AGENTS.md <<'EOF_AGENTS'
Use ./skills/react-probe/SKILL.md as the workflow when tasks require React runtime debugging through Playwright, Chrome CDP, or MCP.
Focus on state/props, virtual tree, rendered HTML, and bounded output behavior.
EOF_AGENTS
```

Option B (project rules):

```bash
mkdir -p .cursor/rules
cat > .cursor/rules/react-probe.mdc <<'EOF_RULE'
---
description: React runtime debug workflow via React Probe
alwaysApply: false
---
Use ./skills/react-probe/SKILL.md for React runtime debugging tasks.
Prioritize state/props, virtual tree, rendered HTML, and bounded output behavior.
EOF_RULE
```

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

### Skill Behavior for LLM: Flow

This section describes the workflow that the skill instructs LLM agents to follow.

1. Use `getReactTree((react) => react.query(criteria))` to locate candidate components.
2. Extract `(@reactPath=...)` from output lines.
3. Call `getReactStateAndHooks(reactPath)` for state/hooks inspection.
4. Call `getReactRenderedHtml(reactPath)` for rendered output.

`reactPath` is Probe-defined (not W3C XPath). Examples:

- `/Root[0]/App[0]`
- `/Root[0]/App[0]/Dashboard[0]/section[0]/ul[0]/Row2[37]`

### Skill Behavior for LLM: Budget and Fallback Details

This section describes budget and fallback behavior enforced by the skill for LLM-facing output.

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

### 安装方式（Codex / Claude Code / Cursor）

仓库内置可安装 skill：`skills/react-probe/SKILL.md`

#### Codex

从 GitHub 按 repo/path 安装：

```bash
python3 "${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-installer/scripts/install-skill-from-github.py" \
  --repo zqqqqz2000/react-debug-skills \
  --path skills/react-probe
```

本地安装：

```bash
SKILL_HOME="${CODEX_HOME:-$HOME/.codex}/skills/react-probe"
mkdir -p "$SKILL_HOME"
cp -R skills/react-probe/* "$SKILL_HOME/"
```

安装后重启 Codex。

#### Claude Code

推荐在项目根目录创建 `CLAUDE.md`：

```bash
cat > CLAUDE.md <<'EOF_CLAUDE'
在涉及 Playwright、Chrome CDP、MCP 的 React 运行时调试任务中，使用 ./skills/react-probe/SKILL.md 作为工作流程。
重点关注 state/props、虚拟树、渲染 HTML，以及预算内输出行为。
EOF_CLAUDE
```

然后在仓库目录运行：

```bash
claude
```

#### Cursor

方式 A（简单推荐）：在项目根目录创建 `AGENTS.md`：

```bash
cat > AGENTS.md <<'EOF_AGENTS'
在涉及 Playwright、Chrome CDP、MCP 的 React 运行时调试任务中，使用 ./skills/react-probe/SKILL.md 作为工作流程。
重点关注 state/props、虚拟树、渲染 HTML，以及预算内输出行为。
EOF_AGENTS
```

方式 B（Project Rules）：

```bash
mkdir -p .cursor/rules
cat > .cursor/rules/react-probe.mdc <<'EOF_RULE'
---
description: React runtime debug workflow via React Probe
alwaysApply: false
---
使用 ./skills/react-probe/SKILL.md 处理 React 运行时调试任务。
优先关注 state/props、虚拟树、渲染 HTML，以及预算内输出行为。
EOF_RULE
```

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

### Skill 内给 LLM 的行为：使用流程

本节描述 skill 提示 LLM agent 遵循的工作流程。

1. 用 `getReactTree((react) => react.query(criteria))` 找候选组件
2. 从输出中提取 `(@reactPath=...)`
3. 用 `getReactStateAndHooks(reactPath)` 读状态与 hooks
4. 用 `getReactRenderedHtml(reactPath)` 读对应渲染结果

`reactPath` 是 Probe 定义的 React 路径（不是 W3C XPath），示例：

- `/Root[0]/App[0]`
- `/Root[0]/App[0]/Dashboard[0]/section[0]/ul[0]/Row2[37]`

### Skill 内给 LLM 的行为：预算与降级细节

本节描述 skill 对面向 LLM 输出施加的预算与降级行为。

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
