import type { BudgetInfo, BudgetLastRunStats, NodeKV, OmittedReason, ProbeNode } from "./types";
import { safeStringify } from "./safeStringify";

type ProbeBudgetOverride = Partial<{
  MAX_CHARS: number;
  VALUE_MAX_CHARS: number;
  MAX_NODES: number;
  MAX_SCREENSHOTS: number;
  CLIP_MAX_WIDTH: number;
  CLIP_MAX_HEIGHT: number;
  MAX_DEPTH: number;
}>;

declare global {
  // Optional host-side override before injection.
  var __REACT_PROBE_BUDGET__: ProbeBudgetOverride | undefined;
}

const MAX_CHARS = 6000;
const VALUE_MAX_CHARS = 200;
const MAX_NODES = 200;
const MAX_SCREENSHOTS = 5;
const CLIP_MAX_WIDTH = 800;
const CLIP_MAX_HEIGHT = 800;
const MAX_DEPTH = 12;

function pickBudgetNumber(candidate: unknown, fallback: number): number {
  if (typeof candidate !== "number") {
    return fallback;
  }
  if (!Number.isFinite(candidate)) {
    return fallback;
  }
  if (candidate <= 0) {
    return fallback;
  }
  return Math.floor(candidate);
}

function readBudgetOverride(): ProbeBudgetOverride {
  const candidate = globalThis.__REACT_PROBE_BUDGET__;
  if (typeof candidate !== "object" || candidate === null) {
    return {};
  }
  return candidate;
}

const budgetOverride = readBudgetOverride();
const BUDGET_SOURCE = Object.keys(budgetOverride).length > 0 ? "override" : "default";
const BUDGET_EFFECTIVE_AT = new Date().toISOString();

let lastRunStats: BudgetLastRunStats | null = null;

export const BUDGET = {
  MAX_CHARS: pickBudgetNumber(budgetOverride.MAX_CHARS, MAX_CHARS),
  VALUE_MAX_CHARS: pickBudgetNumber(budgetOverride.VALUE_MAX_CHARS, VALUE_MAX_CHARS),
  MAX_NODES: pickBudgetNumber(budgetOverride.MAX_NODES, MAX_NODES),
  MAX_SCREENSHOTS: pickBudgetNumber(budgetOverride.MAX_SCREENSHOTS, MAX_SCREENSHOTS),
  CLIP_MAX_WIDTH: pickBudgetNumber(budgetOverride.CLIP_MAX_WIDTH, CLIP_MAX_WIDTH),
  CLIP_MAX_HEIGHT: pickBudgetNumber(budgetOverride.CLIP_MAX_HEIGHT, CLIP_MAX_HEIGHT),
  MAX_DEPTH: pickBudgetNumber(budgetOverride.MAX_DEPTH, MAX_DEPTH)
} as const;

function updateLastRunStats(stats: BudgetLastRunStats): void {
  lastRunStats = stats;
}

export function recordBudgetRunStatsFromOutput(api: string, output: string): void {
  updateLastRunStats({
    api,
    charCount: len(output),
    truncated: output.includes("TRUNCATED"),
    omitted: output.includes("OMITTED_"),
    timestamp: new Date().toISOString()
  });
}

export function recordBudgetRunStatsFromFlags(
  api: string,
  flags: { charCount: number; truncated: boolean; omitted: boolean }
): void {
  updateLastRunStats({
    api,
    charCount: flags.charCount,
    truncated: flags.truncated,
    omitted: flags.omitted,
    timestamp: new Date().toISOString()
  });
}

export function getBudgetInfo(): BudgetInfo {
  return {
    budget: {
      MAX_CHARS: BUDGET.MAX_CHARS,
      VALUE_MAX_CHARS: BUDGET.VALUE_MAX_CHARS,
      MAX_NODES: BUDGET.MAX_NODES,
      MAX_SCREENSHOTS: BUDGET.MAX_SCREENSHOTS,
      CLIP_MAX_WIDTH: BUDGET.CLIP_MAX_WIDTH,
      CLIP_MAX_HEIGHT: BUDGET.CLIP_MAX_HEIGHT,
      MAX_DEPTH: BUDGET.MAX_DEPTH
    },
    source: BUDGET_SOURCE,
    effectiveAt: BUDGET_EFFECTIVE_AT,
    lastRunStats
  };
}

type RenderMode = {
  showText: boolean;
  showKv: boolean;
  kvKeysOnly: boolean;
  minimal: boolean;
};

type Stage0Result = {
  roots: ProbeNode[];
  omittedMatches: number;
};

type ClipResult = {
  node: ProbeNode;
  used: number;
};

type TreeSnapshot = {
  roots: ProbeNode[];
  omittedMatches: number;
  markers: string[];
  preview?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) {
    return false;
  }
  const entries = Object.entries(value);
  for (const [, entryValue] of entries) {
    if (typeof entryValue !== "string") {
      return false;
    }
  }
  return true;
}

function isNodeKvList(value: unknown): value is NodeKV[] {
  if (!Array.isArray(value)) {
    return false;
  }
  for (const item of value) {
    if (!isRecord(item)) {
      return false;
    }
    if (typeof item.k !== "string") {
      return false;
    }
    if ("v" in item && typeof item.v !== "string" && item.v !== undefined) {
      return false;
    }
  }
  return true;
}

export function isProbeNode(value: unknown): value is ProbeNode {
  if (!isRecord(value)) {
    return false;
  }
  if (typeof value.id !== "string") {
    return false;
  }
  if (typeof value.label !== "string") {
    return false;
  }
  if ("text" in value && typeof value.text !== "string" && value.text !== undefined) {
    return false;
  }
  if ("dataAttrs" in value && !isStringRecord(value.dataAttrs)) {
    return false;
  }
  if ("kv" in value && !isNodeKvList(value.kv)) {
    return false;
  }
  if ("children" in value && !Array.isArray(value.children)) {
    return false;
  }
  return true;
}

export function assertNodeOrNodes(value: unknown): asserts value is ProbeNode | ProbeNode[] {
  if (isProbeNode(value)) {
    return;
  }
  if (Array.isArray(value) && value.every((entry) => isProbeNode(entry))) {
    return;
  }
  throw new Error("Callback must return ProbeNode or ProbeNode[]");
}

export function len(s: string): number {
  return s.length;
}

export function clipValue(s: string): string {
  if (len(s) <= BUDGET.VALUE_MAX_CHARS) {
    return s;
  }
  return `${s.slice(0, BUDGET.VALUE_MAX_CHARS)}…(TRUNCATED,len=${len(s)})`;
}

export function fits(s: string): boolean {
  return len(s) <= BUDGET.MAX_CHARS;
}

function cloneNodeShallow(node: ProbeNode): ProbeNode {
  const cloned: ProbeNode = {
    id: node.id,
    label: node.label
  };

  if (node.dataAttrs !== undefined) {
    cloned.dataAttrs = { ...node.dataAttrs };
  }
  if (node.kv !== undefined) {
    cloned.kv = node.kv.map((item) => {
      if (item.v === undefined) {
        return { k: item.k };
      }
      return { k: item.k, v: item.v };
    });
  }
  if (node.text !== undefined) {
    cloned.text = node.text;
  }
  if (node.otherAttrs !== undefined) {
    cloned.otherAttrs = { ...node.otherAttrs };
  }
  if (node.ariaAttrs !== undefined) {
    cloned.ariaAttrs = { ...node.ariaAttrs };
  }
  if (node.omittedSubtree !== undefined) {
    cloned.omittedSubtree = {
      reason: node.omittedSubtree.reason,
      omittedChildren: node.omittedSubtree.omittedChildren
    };
  }

  return cloned;
}

function deepCloneNode(node: ProbeNode): ProbeNode {
  const cloned = cloneNodeShallow(node);
  if (node.children !== undefined) {
    cloned.children = node.children.map((child) => deepCloneNode(child));
  }
  return cloned;
}

function createOmittedSubtreeNode(reason: OmittedReason, omittedChildren: number): ProbeNode {
  return {
    id: `(@omitted:${reason}:${omittedChildren})`,
    label: `…(OMITTED_SUBTREE, reason=${reason}, omittedChildren=${omittedChildren})`,
    omittedSubtree: {
      reason,
      omittedChildren
    }
  };
}

function normalizeRoots(input: ProbeNode | ProbeNode[]): Stage0Result {
  const asArray = Array.isArray(input) ? input.map((node) => deepCloneNode(node)) : [deepCloneNode(input)];

  if (asArray.length <= BUDGET.MAX_NODES) {
    return {
      roots: asArray,
      omittedMatches: 0
    };
  }

  return {
    roots: asArray.slice(0, BUDGET.MAX_NODES),
    omittedMatches: asArray.length - BUDGET.MAX_NODES
  };
}

function stage1ClipNode(node: ProbeNode, nodeBudget: number): ClipResult {
  const cloned = cloneNodeShallow(node);
  const originalChildren = node.children ?? [];
  const children: ProbeNode[] = [];
  let used = 1;
  let capacity = nodeBudget - 1;
  let omittedChildren = 0;

  for (let index = 0; index < originalChildren.length; index += 1) {
    const remainingSiblings = originalChildren.length - index - 1;
    const reserveForPlaceholder = remainingSiblings > 0 ? 1 : 0;

    if (capacity <= reserveForPlaceholder) {
      omittedChildren += 1 + remainingSiblings;
      break;
    }

    const child = originalChildren[index];
    if (child === undefined) {
      continue;
    }
    const childBudget = capacity - reserveForPlaceholder;
    const childResult = stage1ClipNode(child, childBudget);
    children.push(childResult.node);
    used += childResult.used;
    capacity -= childResult.used;
  }

  if (omittedChildren > 0 && capacity > 0) {
    children.push(createOmittedSubtreeNode("maxNodes", omittedChildren));
    used += 1;
  }

  if (children.length > 0) {
    cloned.children = children;
  }

  return { node: cloned, used };
}

function stage1ClipForest(roots: ProbeNode[]): ProbeNode[] {
  const clipped: ProbeNode[] = [];
  let used = 0;

  for (const root of roots) {
    if (used >= BUDGET.MAX_NODES) {
      break;
    }
    const rootBudget = BUDGET.MAX_NODES - used;
    const clippedRoot = stage1ClipNode(root, rootBudget);
    clipped.push(clippedRoot.node);
    used += clippedRoot.used;
  }

  return clipped;
}

function stage2ClipValueOnNode(node: ProbeNode): ProbeNode {
  const cloned = cloneNodeShallow(node);

  if (cloned.dataAttrs !== undefined) {
    const nextDataAttrs: Record<string, string> = {};
    for (const [key, value] of Object.entries(cloned.dataAttrs)) {
      nextDataAttrs[key] = clipValue(value);
    }
    cloned.dataAttrs = nextDataAttrs;
  }

  if (cloned.kv !== undefined) {
    cloned.kv = cloned.kv.map((item) => {
      if (item.v === undefined) {
        return { k: item.k };
      }
      return {
        k: item.k,
        v: clipValue(item.v)
      };
    });
  }

  if (cloned.text !== undefined) {
    cloned.text = clipValue(cloned.text);
  }

  if (node.children !== undefined) {
    cloned.children = node.children.map((child) => stage2ClipValueOnNode(child));
  }

  return cloned;
}

function removeTextOnNode(node: ProbeNode): ProbeNode {
  const cloned = cloneNodeShallow(node);
  delete cloned.text;
  if (node.children !== undefined) {
    cloned.children = node.children.map((child) => removeTextOnNode(child));
  }
  return cloned;
}

function removeKvValuesOnNode(node: ProbeNode): ProbeNode {
  const cloned = cloneNodeShallow(node);
  if (cloned.kv !== undefined) {
    cloned.kv = cloned.kv.map((item) => ({ k: item.k }));
  }
  if (node.children !== undefined) {
    cloned.children = node.children.map((child) => removeKvValuesOnNode(child));
  }
  return cloned;
}

function removeKvOnNode(node: ProbeNode): ProbeNode {
  const cloned = cloneNodeShallow(node);
  delete cloned.kv;
  if (node.children !== undefined) {
    cloned.children = node.children.map((child) => removeKvOnNode(child));
  }
  return cloned;
}

function removeOtherAndAriaOnNode(node: ProbeNode): ProbeNode {
  const cloned = cloneNodeShallow(node);
  delete cloned.otherAttrs;
  delete cloned.ariaAttrs;
  if (node.children !== undefined) {
    cloned.children = node.children.map((child) => removeOtherAndAriaOnNode(child));
  }
  return cloned;
}

function foldDepthOnNode(node: ProbeNode, depth: number, depthCap: number): ProbeNode {
  const cloned = cloneNodeShallow(node);
  const originalChildren = node.children ?? [];

  if (originalChildren.length === 0) {
    return cloned;
  }

  if (depth >= depthCap) {
    cloned.children = [createOmittedSubtreeNode("depth", originalChildren.length)];
    return cloned;
  }

  cloned.children = originalChildren.map((child) => foldDepthOnNode(child, depth + 1, depthCap));
  return cloned;
}

function keepMinimalNode(node: ProbeNode): ProbeNode {
  const cloned: ProbeNode = {
    id: node.id,
    label: node.label
  };
  if (node.dataAttrs !== undefined) {
    cloned.dataAttrs = { ...node.dataAttrs };
  }
  if (node.children !== undefined) {
    cloned.children = node.children.map((child) => keepMinimalNode(child));
  }
  if (node.omittedSubtree !== undefined) {
    cloned.omittedSubtree = {
      reason: node.omittedSubtree.reason,
      omittedChildren: node.omittedSubtree.omittedChildren
    };
  }
  return cloned;
}

function formatDataAttrs(dataAttrs: Record<string, string> | undefined): string {
  if (dataAttrs === undefined) {
    return "";
  }
  const keys = Object.keys(dataAttrs).sort();
  if (keys.length === 0) {
    return "";
  }
  const parts: string[] = [];
  for (const key of keys) {
    parts.push(`${key}=${JSON.stringify(dataAttrs[key])}`);
  }
  return `[${parts.join(" ")}]`;
}

function formatKv(kv: NodeKV[] | undefined, kvKeysOnly: boolean): string {
  if (kv === undefined || kv.length === 0) {
    return "";
  }
  const parts = kv.map((item) => {
    if (kvKeysOnly || item.v === undefined) {
      return item.k;
    }
    return `${item.k}=${JSON.stringify(item.v)}`;
  });
  return `{${parts.join(", ")}}`;
}

function renderNodeLines(node: ProbeNode, depth: number, mode: RenderMode, lines: string[]): void {
  const indent = "  ".repeat(depth);

  if (node.omittedSubtree !== undefined) {
    lines.push(
      `${indent}- …(OMITTED_SUBTREE, reason=${node.omittedSubtree.reason}, omittedChildren=${node.omittedSubtree.omittedChildren})`
    );
    return;
  }

  const dataAttrs = formatDataAttrs(node.dataAttrs);
  const kv = mode.showKv ? formatKv(node.kv, mode.kvKeysOnly) : "";
  const textPart = mode.showText && node.text !== undefined ? `text=${JSON.stringify(node.text)}` : "";

  const lineParts: string[] = [`${indent}-`, node.label];
  if (dataAttrs !== "") {
    lineParts.push(dataAttrs);
  }
  lineParts.push(node.id);

  if (!mode.minimal && kv !== "") {
    lineParts.push(kv);
  }
  if (!mode.minimal && textPart !== "") {
    lineParts.push(textPart);
  }

  lines.push(lineParts.join(" "));

  const children = node.children ?? [];
  for (const child of children) {
    renderNodeLines(child, depth + 1, mode, lines);
  }
}

function renderForest(roots: ProbeNode[], mode: RenderMode, omittedMatches: number): string {
  const lines: string[] = [];
  for (const root of roots) {
    renderNodeLines(root, 0, mode, lines);
  }
  if (omittedMatches > 0) {
    lines.push(`…(OMITTED_MATCHES, omitted=${omittedMatches})`);
  }
  return lines.join("\n");
}

function hardClipLines(output: string): string {
  const limit = Math.max(0, BUDGET.MAX_CHARS - 30);
  const clippedLines = output.split("\n").map((line) => {
    if (line.length <= limit) {
      return line;
    }
    return `${line.slice(0, limit)}…(TRUNCATED_LINE)`;
  });
  return clippedLines.join("\n");
}

function hardClipOutput(output: string): string {
  const lineClipped = hardClipLines(output);
  if (fits(lineClipped)) {
    return lineClipped;
  }
  const limit = Math.max(0, BUDGET.MAX_CHARS - 30);
  return `${lineClipped.slice(0, limit)}…(TRUNCATED_OUTPUT)`;
}

function trimRenderedLines(output: string): string {
  const lines = output.split("\n");
  for (let keep = lines.length - 1; keep >= 1; keep -= 1) {
    const omitted = lines.length - keep;
    const candidate = `${lines.slice(0, keep).join("\n")}\n…(OMITTED_LINES, omitted=${omitted})`;
    if (fits(candidate)) {
      return candidate;
    }
  }
  return output;
}

export function convergeStringBudget(input: string): string {
  const lineClippedByValue = input
    .split("\n")
    .map((line) => clipValue(line))
    .join("\n");

  if (fits(lineClippedByValue)) {
    return lineClippedByValue;
  }

  return hardClipOutput(lineClippedByValue);
}

export function renderWithBudget(input: ProbeNode | ProbeNode[]): string {
  const stage0 = normalizeRoots(input);
  const stage1 = stage1ClipForest(stage0.roots);
  let current = stage1.map((node) => stage2ClipValueOnNode(node));

  const fullMode: RenderMode = {
    showText: true,
    showKv: true,
    kvKeysOnly: false,
    minimal: false
  };
  const noTextMode: RenderMode = {
    showText: false,
    showKv: true,
    kvKeysOnly: false,
    minimal: false
  };
  const keysOnlyMode: RenderMode = {
    showText: false,
    showKv: true,
    kvKeysOnly: true,
    minimal: false
  };
  const noKvMode: RenderMode = {
    showText: false,
    showKv: false,
    kvKeysOnly: true,
    minimal: false
  };
  const minimalMode: RenderMode = {
    showText: false,
    showKv: false,
    kvKeysOnly: true,
    minimal: true
  };

  let rendered = renderForest(current, fullMode, stage0.omittedMatches);
  if (fits(rendered)) {
    return rendered;
  }

  current = current.map((node) => removeTextOnNode(node));
  rendered = renderForest(current, noTextMode, stage0.omittedMatches);
  if (fits(rendered)) {
    return rendered;
  }

  current = current.map((node) => removeKvValuesOnNode(node));
  rendered = renderForest(current, keysOnlyMode, stage0.omittedMatches);
  if (fits(rendered)) {
    return rendered;
  }

  current = current.map((node) => removeKvOnNode(node));
  rendered = renderForest(current, noKvMode, stage0.omittedMatches);
  if (fits(rendered)) {
    return rendered;
  }

  current = current.map((node) => removeOtherAndAriaOnNode(node));
  rendered = renderForest(current, noKvMode, stage0.omittedMatches);
  if (fits(rendered)) {
    return rendered;
  }

  for (let depthCap = BUDGET.MAX_DEPTH; depthCap >= 1; depthCap -= 1) {
    current = current.map((node) => foldDepthOnNode(node, 0, depthCap));
    rendered = renderForest(current, noKvMode, stage0.omittedMatches);
    if (fits(rendered)) {
      return rendered;
    }
  }

  const firstRoot = current[0];
  if (firstRoot !== undefined) {
    current = [keepMinimalNode(firstRoot)];
  }
  rendered = renderForest(current, minimalMode, stage0.omittedMatches);
  if (fits(rendered)) {
    return rendered;
  }

  const trimmedLines = trimRenderedLines(rendered);
  if (fits(trimmedLines)) {
    return trimmedLines;
  }

  return hardClipOutput(trimmedLines);
}

function serializeTreeSnapshot(snapshot: TreeSnapshot): string {
  return safeStringify(snapshot);
}

function trySerializeTreeSnapshot(snapshot: TreeSnapshot): string | null {
  const serialized = serializeTreeSnapshot(snapshot);
  if (fits(serialized)) {
    return serialized;
  }
  return null;
}

function buildSnapshotPayload(roots: ProbeNode[], omittedMatches: number, markers: string[]): TreeSnapshot {
  return {
    roots,
    omittedMatches,
    markers
  };
}

export function getBudgetedTreeSnapshot(input: ProbeNode | ProbeNode[]): string {
  const stage0 = normalizeRoots(input);
  let current = stage1ClipForest(stage0.roots).map((node) => stage2ClipValueOnNode(node));
  const markers: string[] = [];

  if (stage0.omittedMatches > 0) {
    markers.push(`OMITTED_MATCHES:${stage0.omittedMatches}`);
  }

  let serialized = trySerializeTreeSnapshot(buildSnapshotPayload(current, stage0.omittedMatches, markers));
  if (serialized !== null) {
    return serialized;
  }

  current = current.map((node) => removeTextOnNode(node));
  markers.push("STAGE3.1_REMOVE_TEXT");
  serialized = trySerializeTreeSnapshot(buildSnapshotPayload(current, stage0.omittedMatches, markers));
  if (serialized !== null) {
    return serialized;
  }

  current = current.map((node) => removeKvValuesOnNode(node));
  markers.push("STAGE3.2_REMOVE_KV_VALUE");
  serialized = trySerializeTreeSnapshot(buildSnapshotPayload(current, stage0.omittedMatches, markers));
  if (serialized !== null) {
    return serialized;
  }

  current = current.map((node) => removeKvOnNode(node));
  markers.push("STAGE3.3_REMOVE_KV");
  serialized = trySerializeTreeSnapshot(buildSnapshotPayload(current, stage0.omittedMatches, markers));
  if (serialized !== null) {
    return serialized;
  }

  current = current.map((node) => removeOtherAndAriaOnNode(node));
  markers.push("STAGE3.4_REMOVE_OTHER_ARIA");
  serialized = trySerializeTreeSnapshot(buildSnapshotPayload(current, stage0.omittedMatches, markers));
  if (serialized !== null) {
    return serialized;
  }

  for (let depthCap = BUDGET.MAX_DEPTH; depthCap >= 1; depthCap -= 1) {
    const depthFolded = current.map((node) => foldDepthOnNode(node, 0, depthCap));
    const depthMarkers = [...markers, `STAGE3.5_DEPTH_CAP:${depthCap}`];
    serialized = trySerializeTreeSnapshot(buildSnapshotPayload(depthFolded, stage0.omittedMatches, depthMarkers));
    if (serialized !== null) {
      return serialized;
    }
    current = depthFolded;
  }

  const firstRoot = current[0];
  if (firstRoot !== undefined) {
    current = [keepMinimalNode(firstRoot)];
  }
  markers.push("STAGE3.6_MINIMAL");
  serialized = trySerializeTreeSnapshot(buildSnapshotPayload(current, stage0.omittedMatches, markers));
  if (serialized !== null) {
    return serialized;
  }

  const minimalMode: RenderMode = {
    showText: false,
    showKv: false,
    kvKeysOnly: true,
    minimal: true
  };
  const preview = convergeStringBudget(renderForest(current, minimalMode, stage0.omittedMatches));
  const fallback: TreeSnapshot = {
    roots: [],
    omittedMatches: stage0.omittedMatches,
    markers: [...markers, "STAGE4_HARD_CLIP"],
    preview
  };

  serialized = serializeTreeSnapshot(fallback);
  if (fits(serialized)) {
    return serialized;
  }

  const emergencyFallback: TreeSnapshot = {
    roots: [],
    omittedMatches: stage0.omittedMatches,
    markers: ["STAGE4_HARD_CLIP"],
    preview: clipValue(preview)
  };
  serialized = serializeTreeSnapshot(emergencyFallback);
  if (fits(serialized)) {
    return serialized;
  }

  return convergeStringBudget(serialized);
}
