import {
  BUDGET,
  assertNodeOrNodes,
  clipValue,
  convergeStringBudget,
  fits,
  getBudgetInfo,
  getBudgetedTreeSnapshot,
  recordBudgetRunStatsFromOutput,
  renderWithBudget
} from "./budget";
import { getDataAttrs, getNodeXPath } from "./dom";
import { safeStringify } from "./safeStringify";
import type { FiberNodeLike, NodeKV, ReactIR, ReactNode, ReactQuery, RectItem } from "./types";

type FiberRootLike = {
  current?: FiberNodeLike | null;
};

type DevtoolsHookLike = {
  renderers?: Map<number, unknown> | Record<string, unknown>;
  getFiberRoots?: (rendererId: number) => Set<FiberRootLike>;
};

declare global {
  var __REACT_DEVTOOLS_GLOBAL_HOOK__: DevtoolsHookLike | undefined;
}

const TAG_FUNCTION_COMPONENT = 0;
const TAG_CLASS_COMPONENT = 1;
const TAG_HOST_ROOT = 3;
const TAG_HOST_COMPONENT = 5;
const TAG_HOST_TEXT = 6;
const TAG_FORWARD_REF = 11;
const TAG_MEMO_COMPONENT = 14;
const TAG_SIMPLE_MEMO_COMPONENT = 15;

const DISPLAY_COMPONENT_TAGS = new Set<number>([
  TAG_FUNCTION_COMPONENT,
  TAG_CLASS_COMPONENT,
  TAG_FORWARD_REF,
  TAG_MEMO_COMPONENT,
  TAG_SIMPLE_MEMO_COMPONENT
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiberNodeLike(value: unknown): value is FiberNodeLike {
  if (!isRecord(value)) {
    return false;
  }
  return "child" in value || "sibling" in value || "return" in value || "tag" in value;
}

type NamedFn = ((...args: never[]) => unknown) & {
  displayName?: string;
};

function readDisplayNameFromType(typeValue: unknown): string | null {
  if (typeof typeValue === "string") {
    return typeValue;
  }

  if (typeof typeValue === "function") {
    const namedFunction = typeValue as NamedFn;
    if (typeof namedFunction.displayName === "string" && namedFunction.displayName.length > 0) {
      return namedFunction.displayName;
    }
    if (namedFunction.name.length > 0) {
      return namedFunction.name;
    }
    return "AnonymousFn";
  }

  if (isRecord(typeValue)) {
    if (typeof typeValue.displayName === "string" && typeValue.displayName.length > 0) {
      return typeValue.displayName;
    }
    if (typeof typeValue.name === "string" && typeValue.name.length > 0) {
      return typeValue.name;
    }
    if ("render" in typeValue) {
      const renderName = readDisplayNameFromType(typeValue.render);
      if (renderName !== null) {
        return renderName;
      }
    }
    if ("type" in typeValue) {
      const nestedTypeName = readDisplayNameFromType(typeValue.type);
      if (nestedTypeName !== null) {
        return nestedTypeName;
      }
    }
  }

  return null;
}

function getFiberDisplayName(fiber: FiberNodeLike): string {
  if (fiber.tag === TAG_HOST_ROOT) {
    return "Root";
  }
  if (fiber.tag === TAG_HOST_TEXT) {
    return "#text";
  }
  if (fiber.tag === TAG_HOST_COMPONENT) {
    const hostName = readDisplayNameFromType(fiber.type);
    return hostName ?? "host";
  }

  const fromType = readDisplayNameFromType(fiber.type);
  if (fromType !== null) {
    return fromType;
  }

  const fromElementType = readDisplayNameFromType(fiber.elementType);
  if (fromElementType !== null) {
    return fromElementType;
  }

  if (typeof fiber.tag === "number") {
    return `Tag${fiber.tag}`;
  }

  return "UnknownComponent";
}

function getRendererIds(renderers: Map<number, unknown> | Record<string, unknown> | undefined): number[] {
  if (renderers instanceof Map) {
    return Array.from(renderers.keys());
  }

  if (isRecord(renderers)) {
    const ids: number[] = [];
    for (const key of Object.keys(renderers)) {
      const parsed = Number(key);
      if (Number.isInteger(parsed)) {
        ids.push(parsed);
      }
    }
    return ids;
  }

  return [];
}

function getRootsFromDevtoolsHook(): FiberNodeLike[] {
  const hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (!isRecord(hook)) {
    return [];
  }
  if (typeof hook.getFiberRoots !== "function") {
    return [];
  }

  const rendererIds = getRendererIds(hook.renderers);
  const roots: FiberNodeLike[] = [];
  const seen = new Set<FiberNodeLike>();

  for (const rendererId of rendererIds) {
    const rootSet = hook.getFiberRoots(rendererId);
    if (!(rootSet instanceof Set)) {
      continue;
    }

    for (const root of rootSet.values()) {
      if (!isRecord(root)) {
        continue;
      }
      if (!("current" in root)) {
        continue;
      }
      const current = root.current;
      if (!isFiberNodeLike(current)) {
        continue;
      }
      if (seen.has(current)) {
        continue;
      }
      seen.add(current);
      roots.push(current);
    }
  }

  return roots;
}

function getOwnFieldNames(node: Node): string[] {
  return Object.getOwnPropertyNames(node as object);
}

function readFiberFromNode(node: Node): FiberNodeLike | null {
  const nodeRecord = node as unknown as Record<string, unknown>;
  const fieldNames = getOwnFieldNames(node);

  for (const key of fieldNames) {
    if (key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$")) {
      const value = nodeRecord[key];
      if (isFiberNodeLike(value)) {
        return value;
      }
    }

    if (key.startsWith("__reactContainer$")) {
      const container = nodeRecord[key];
      if (isRecord(container) && "current" in container && isFiberNodeLike(container.current)) {
        return container.current;
      }
    }
  }

  return null;
}

function hasReactOwnedMarker(node: Node): boolean {
  const fieldNames = getOwnFieldNames(node);
  for (const key of fieldNames) {
    if (key.startsWith("__reactFiber$") || key.startsWith("__reactProps$") || key.startsWith("__reactContainer$")) {
      return true;
    }
  }
  return false;
}

export function findNearestFiberForDomNode(node: Node | null): FiberNodeLike | null {
  let current: Node | null = node;
  while (current !== null) {
    const fiber = readFiberFromNode(current);
    if (fiber !== null) {
      return fiber;
    }
    current = current.parentNode;
  }
  return null;
}

function findNearestDisplayFiberFromHostFiber(hostFiber: FiberNodeLike): FiberNodeLike {
  let cursor: FiberNodeLike | null | undefined = hostFiber;
  while (cursor !== null && cursor !== undefined) {
    if (typeof cursor.tag === "number" && DISPLAY_COMPONENT_TAGS.has(cursor.tag)) {
      return cursor;
    }
    cursor = cursor.return;
  }
  return hostFiber;
}

export function mapDomNodeToDisplayFiber(node: Node): FiberNodeLike | null {
  const hostFiber = findNearestFiberForDomNode(node);
  if (hostFiber === null) {
    return null;
  }
  return findNearestDisplayFiberFromHostFiber(hostFiber);
}

function ascendToRootFiber(fiber: FiberNodeLike): FiberNodeLike {
  let current: FiberNodeLike = fiber;
  while (current.return !== null && current.return !== undefined) {
    current = current.return;
  }
  return current;
}

function getRootsFromDomPrivateFields(): FiberNodeLike[] {
  const roots: FiberNodeLike[] = [];
  const seen = new Set<FiberNodeLike>();
  const nodesToScan: Node[] = [];

  if (document.documentElement !== null) {
    nodesToScan.push(document.documentElement);
  }
  for (const element of Array.from(document.querySelectorAll("*"))) {
    nodesToScan.push(element);
  }

  for (const node of nodesToScan) {
    const nearestFiber = hasReactOwnedMarker(node) ? findNearestFiberForDomNode(node) : readFiberFromNode(node);
    if (nearestFiber === null) {
      continue;
    }

    const rootFiber = ascendToRootFiber(nearestFiber);
    if (seen.has(rootFiber)) {
      continue;
    }
    seen.add(rootFiber);
    roots.push(rootFiber);
  }

  return roots;
}

function collectSiblingFibers(firstChild: FiberNodeLike | null | undefined): FiberNodeLike[] {
  const siblings: FiberNodeLike[] = [];
  let cursor: FiberNodeLike | null | undefined = firstChild;
  const seen = new Set<FiberNodeLike>();

  while (cursor !== null && cursor !== undefined && !seen.has(cursor)) {
    siblings.push(cursor);
    seen.add(cursor);
    cursor = cursor.sibling;
  }

  return siblings;
}

function getStateNodeAsDom(node: unknown): Node | null {
  if (node instanceof Element || node instanceof Text) {
    return node;
  }
  return null;
}

function collectHostDomNodesFromFiber(fiber: FiberNodeLike, limit: number): Node[] {
  const out: Node[] = [];
  const stack: FiberNodeLike[] = [fiber];
  const visited = new Set<FiberNodeLike>();

  while (stack.length > 0 && out.length < limit) {
    const current = stack.pop();
    if (current === undefined || visited.has(current)) {
      continue;
    }
    visited.add(current);

    if (current.tag === TAG_HOST_COMPONENT || current.tag === TAG_HOST_TEXT) {
      const domNode = getStateNodeAsDom(current.stateNode);
      if (domNode !== null) {
        out.push(domNode);
      }
    }

    const children = collectSiblingFibers(current.child);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child !== undefined) {
        stack.push(child);
      }
    }
  }

  return out;
}

function stringifyShallowValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "undefined") {
    return "undefined";
  }
  if (typeof value === "function") {
    return `[Function:${value.name || "anonymous"}]`;
  }
  if (Array.isArray(value)) {
    return `[Array(${value.length})]`;
  }
  if (isRecord(value)) {
    const ctor = value.constructor;
    const ctorName = typeof ctor?.name === "string" ? ctor.name : "Object";
    return `[Object:${ctorName}]`;
  }
  return String(value);
}

function propsToKv(props: unknown): NodeKV[] | undefined {
  if (!isRecord(props)) {
    return undefined;
  }
  const keys = Object.keys(props).sort();
  if (keys.length === 0) {
    return undefined;
  }
  const kv: NodeKV[] = [];
  for (const key of keys) {
    kv.push({
      k: key,
      v: stringifyShallowValue(props[key])
    });
  }
  return kv;
}

function flattenReactNodes(roots: ReactNode[]): ReactNode[] {
  const out: ReactNode[] = [];
  const stack: ReactNode[] = [];

  for (let index = roots.length - 1; index >= 0; index -= 1) {
    const root = roots[index];
    if (root !== undefined) {
      stack.push(root);
    }
  }

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) {
      continue;
    }
    out.push(current);

    const children = current.children ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child !== undefined) {
        stack.push(child);
      }
    }
  }

  return out;
}

function matchesQuery(node: ReactNode, criteria: ReactQuery): boolean {
  if (criteria.displayName !== undefined && node.displayName !== criteria.displayName) {
    return false;
  }
  if (criteria.label !== undefined && node.label !== criteria.label) {
    return false;
  }
  if (criteria.reactPath !== undefined && node.reactPath !== criteria.reactPath) {
    return false;
  }
  if (criteria.reactPathPrefix !== undefined && !node.reactPath.startsWith(criteria.reactPathPrefix)) {
    return false;
  }
  if (criteria.textIncludes !== undefined) {
    const text = node.text ?? "";
    if (!text.includes(criteria.textIncludes)) {
      return false;
    }
  }

  if (criteria.dataAttrEquals !== undefined) {
    const attrs = node.dataAttrs ?? {};
    const pairs = Object.entries(criteria.dataAttrEquals);
    for (const [key, expected] of pairs) {
      if (attrs[key] !== expected) {
        return false;
      }
    }
  }

  if (criteria.propEquals !== undefined) {
    const props = node.fiber.memoizedProps;
    if (!isRecord(props)) {
      return false;
    }
    const pairs = Object.entries(criteria.propEquals);
    for (const [key, expected] of pairs) {
      if (props[key] !== expected) {
        return false;
      }
    }
  }

  return true;
}

function queryReactNodes(roots: ReactNode[], criteria: ReactQuery): ReactNode[] {
  const nodes = flattenReactNodes(roots);
  return nodes.filter((node) => matchesQuery(node, criteria));
}

function findOneReactNode(roots: ReactNode[], criteria: ReactQuery): ReactNode {
  const matches = queryReactNodes(roots, criteria);
  if (matches.length === 1) {
    const node = matches[0];
    if (node === undefined) {
      throw new Error("Unexpected empty node");
    }
    return node;
  }
  if (matches.length === 0) {
    throw new Error("React query did not match any node");
  }
  throw new Error(`React query is ambiguous: matched=${matches.length}`);
}

type BuildContext = {
  byPath: Map<string, ReactNode>;
  fiberByPath: Map<string, FiberNodeLike>;
  visited: Set<FiberNodeLike>;
};

function buildReactNodeFromFiber(fiber: FiberNodeLike, reactPath: string, context: BuildContext): ReactNode {
  if (context.visited.has(fiber)) {
    const cycleNode: ReactNode = {
      id: `(@reactPath=${reactPath})`,
      label: "CycleRef",
      displayName: "CycleRef",
      reactPath,
      fiber,
      domXPaths: []
    };
    context.byPath.set(reactPath, cycleNode);
    context.fiberByPath.set(reactPath, fiber);
    return cycleNode;
  }

  context.visited.add(fiber);

  const label = getFiberDisplayName(fiber);
  const hostNodes = collectHostDomNodesFromFiber(fiber, BUDGET.MAX_NODES);
  const domXPaths = hostNodes.map((node) => getNodeXPath(node));

  const node: ReactNode = {
    id: `(@reactPath=${reactPath})`,
    label,
    displayName: label,
    reactPath,
    fiber,
    domXPaths
  };

  const firstElement = hostNodes.find((entry) => entry instanceof Element);
  if (firstElement instanceof Element) {
    const dataAttrs = getDataAttrs(firstElement);
    if (dataAttrs !== undefined) {
      node.dataAttrs = dataAttrs;
    }
  }

  const kv = propsToKv(fiber.memoizedProps);
  if (kv !== undefined) {
    node.kv = kv;
  }

  if (fiber.tag === TAG_HOST_TEXT) {
    const stateNode = getStateNodeAsDom(fiber.stateNode);
    const text = stateNode instanceof Text ? stateNode.textContent ?? "" : "";
    if (text.length > 0) {
      node.text = text;
    }
  }

  const children = collectSiblingFibers(fiber.child);
  if (children.length > 0) {
    const indexByLabel = new Map<string, number>();
    const childNodes: ReactNode[] = [];

    for (const childFiber of children) {
      const childLabel = getFiberDisplayName(childFiber);
      const currentIndex = indexByLabel.get(childLabel) ?? 0;
      indexByLabel.set(childLabel, currentIndex + 1);
      const childPath = `${reactPath}/${childLabel}[${currentIndex}]`;
      childNodes.push(buildReactNodeFromFiber(childFiber, childPath, context));
    }

    node.children = childNodes;
  }

  context.byPath.set(reactPath, node);
  context.fiberByPath.set(reactPath, fiber);

  return node;
}

export function createReactIR(): ReactIR {
  const rootFibersFromHook = getRootsFromDevtoolsHook();
  const rootFibers = rootFibersFromHook.length > 0 ? rootFibersFromHook : getRootsFromDomPrivateFields();

  const byPath = new Map<string, ReactNode>();
  const fiberByPath = new Map<string, FiberNodeLike>();
  const visited = new Set<FiberNodeLike>();
  const roots: ReactNode[] = [];

  for (let rootIndex = 0; rootIndex < rootFibers.length; rootIndex += 1) {
    const rootFiber = rootFibers[rootIndex];
    if (rootFiber === undefined) {
      continue;
    }
    const rootPath = `/Root[${rootIndex}]`;
    roots.push(
      buildReactNodeFromFiber(rootFiber, rootPath, {
        byPath,
        fiberByPath,
        visited
      })
    );
  }

  return {
    roots,
    byPath,
    fiberByPath,
    query: (criteria: ReactQuery) => queryReactNodes(roots, criteria),
    findOne: (criteria: ReactQuery) => findOneReactNode(roots, criteria)
  };
}

type BudgetTreeSnapshot = {
  roots: ReactNode[];
  omittedMatches: number;
  markers: string[];
  preview?: string;
};

function countNodeTree(nodes: Array<{ children?: unknown }>): number {
  let count = 0;
  const stack: Array<{ children?: unknown }> = [];
  for (const node of nodes) {
    stack.push(node);
  }

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) {
      continue;
    }
    count += 1;
    if (Array.isArray(current.children)) {
      for (const child of current.children) {
        if (isRecord(child)) {
          stack.push(child);
        }
      }
    }
  }
  return count;
}

function countJsonEntries(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value !== "object") {
    return 1;
  }
  if (Array.isArray(value)) {
    let count = 1;
    for (const item of value) {
      count += countJsonEntries(item);
    }
    return count;
  }
  let count = 1;
  for (const item of Object.values(value)) {
    count += countJsonEntries(item);
  }
  return count;
}

function serializeJsonEnvelope(data: unknown, meta: Record<string, unknown>): string {
  const first = safeStringify({
    data,
    meta: {
      ...meta,
      charCount: 0
    }
  });
  const parsed = JSON.parse(first) as { data: unknown; meta: Record<string, unknown> };
  const withCharCount = {
    data: parsed.data,
    meta: {
      ...parsed.meta,
      charCount: first.length
    }
  };
  return safeStringify(withCharCount);
}

function toTruncatedFlag(markers: string[], preview: string | undefined): boolean {
  if (preview !== undefined) {
    return true;
  }
  return markers.some((marker) => marker.includes("STAGE") || marker.includes("HARD_CLIP"));
}

function toOmittedFlag(markers: string[], omittedMatches: number): boolean {
  if (omittedMatches > 0) {
    return true;
  }
  if (markers.some((marker) => marker.includes("OMITTED"))) {
    return true;
  }
  return markers.some((marker) => marker.includes("STAGE3") || marker.includes("STAGE4"));
}

export function getReactTree(findCallback?: (react: ReactIR) => ReactNode | ReactNode[]): string {
  const reactIR = createReactIR();
  const selected = findCallback === undefined ? reactIR.roots : findCallback(reactIR);
  assertNodeOrNodes(selected);
  const output = renderWithBudget(selected);
  recordBudgetRunStatsFromOutput("getReactTree", output);
  return output;
}

export function getReactTreeJson(findCallback?: (react: ReactIR) => ReactNode | ReactNode[]): string {
  const reactIR = createReactIR();
  const selected = findCallback === undefined ? reactIR.roots : findCallback(reactIR);
  assertNodeOrNodes(selected);

  const snapshot = JSON.parse(getBudgetedTreeSnapshot(selected)) as BudgetTreeSnapshot;
  const nodeCount = countNodeTree(snapshot.roots);
  const budget = getBudgetInfo();

  const fullMeta = {
    truncated: toTruncatedFlag(snapshot.markers, snapshot.preview),
    omitted: toOmittedFlag(snapshot.markers, snapshot.omittedMatches),
    omittedMatches: snapshot.omittedMatches,
    nodeCount,
    markers: snapshot.markers,
    budget
  };

  const payloadCandidates: Array<{ data: unknown; meta: Record<string, unknown> }> = [
    {
      data: snapshot.roots,
      meta: fullMeta
    },
    {
      data: snapshot.roots,
      meta: {
        truncated: fullMeta.truncated,
        omitted: fullMeta.omitted,
        omittedMatches: snapshot.omittedMatches,
        nodeCount,
        budget
      }
    },
    {
      data: snapshot.roots.slice(0, 1),
      meta: {
        truncated: true,
        omitted: true,
        omittedMatches: snapshot.omittedMatches,
        nodeCount: countNodeTree(snapshot.roots.slice(0, 1)),
        budget
      }
    },
    {
      data: {
        preview: clipValue(snapshot.preview ?? renderWithBudget(selected))
      },
      meta: {
        truncated: true,
        omitted: true,
        omittedMatches: snapshot.omittedMatches,
        nodeCount: 1,
        budget
      }
    }
  ];

  for (const candidate of payloadCandidates) {
    const serialized = serializeJsonEnvelope(candidate.data, candidate.meta);
    if (fits(serialized)) {
      recordBudgetRunStatsFromOutput("getReactTreeJson", serialized);
      return serialized;
    }
  }

  const emergency = serializeJsonEnvelope(
    { preview: clipValue(renderWithBudget(selected)) },
    {
      truncated: true,
      omitted: true,
      omittedMatches: snapshot.omittedMatches,
      nodeCount: 1,
      budget
    }
  );
  recordBudgetRunStatsFromOutput("getReactTreeJson", emergency);
  return emergency;
}

function readDomFragment(node: Node): string {
  if (node instanceof Element) {
    return node.outerHTML;
  }
  if (node instanceof Text) {
    return node.textContent ?? "";
  }
  return "";
}

function findFiberByPath(reactPath: string): FiberNodeLike {
  const reactIR = createReactIR();
  const fiber = reactIR.fiberByPath.get(reactPath);
  if (fiber === undefined) {
    throw new Error(`React fiber not found for path: ${reactPath}`);
  }
  return fiber;
}

export function getReactRenderedHtml(reactPath: string): string {
  const fiber = findFiberByPath(reactPath);
  const hostNodes = collectHostDomNodesFromFiber(fiber, BUDGET.MAX_NODES * 4);
  if (hostNodes.length === 0) {
    recordBudgetRunStatsFromOutput("getReactRenderedHtml", "");
    return "";
  }

  let omitted = 0;
  let selectedNodes = hostNodes;
  if (hostNodes.length > BUDGET.MAX_NODES) {
    omitted = hostNodes.length - BUDGET.MAX_NODES;
    selectedNodes = hostNodes.slice(0, BUDGET.MAX_NODES);
  }

  const htmlParts = selectedNodes.map((node) => clipValue(readDomFragment(node)));
  let output = htmlParts.join("\n");

  if (omitted > 0) {
    output = `${output}\n…(OMITTED_MATCHES, omitted=${omitted})`;
  }

  const converged = convergeStringBudget(output);
  recordBudgetRunStatsFromOutput("getReactRenderedHtml", converged);
  return converged;
}

function collectHooksFromMemoizedState(memoizedState: unknown): Array<Record<string, unknown>> {
  const hooks: Array<Record<string, unknown>> = [];
  let cursor: unknown = memoizedState;
  const seen = new Set<object>();
  let index = 0;

  while (isRecord(cursor)) {
    if (seen.has(cursor)) {
      hooks.push({ index, circular: true });
      break;
    }
    seen.add(cursor);

    hooks.push({
      index,
      memoizedState: cursor.memoizedState,
      baseState: cursor.baseState,
      queue: cursor.queue,
      baseQueue: cursor.baseQueue
    });

    cursor = cursor.next;
    index += 1;
  }

  return hooks;
}

function hasHooks(tag: number | undefined): boolean {
  if (tag === undefined) {
    return false;
  }
  return (
    tag === TAG_FUNCTION_COMPONENT ||
    tag === TAG_FORWARD_REF ||
    tag === TAG_MEMO_COMPONENT ||
    tag === TAG_SIMPLE_MEMO_COMPONENT
  );
}

function extractStateAndHooks(fiber: FiberNodeLike, reactPath: string): Record<string, unknown> {
  const output: Record<string, unknown> = {
    reactPath,
    displayName: getFiberDisplayName(fiber),
    tag: fiber.tag ?? null,
    key: fiber.key ?? null,
    props: fiber.memoizedProps,
    state: fiber.memoizedState
  };

  if (hasHooks(fiber.tag)) {
    output.hooks = collectHooksFromMemoizedState(fiber.memoizedState);
  } else {
    output.hooks = [];
  }

  return output;
}

export function getReactStateAndHooks(reactPath: string, transform?: (full: unknown) => unknown): string {
  const fiber = findFiberByPath(reactPath);
  const full = extractStateAndHooks(fiber, reactPath);
  const transformed = transform === undefined ? full : transform(full);
  const serialized = safeStringify(transformed);
  const converged = convergeStringBudget(serialized);
  recordBudgetRunStatsFromOutput("getReactStateAndHooks", converged);
  return converged;
}

export function getReactStateAndHooksJson(reactPath: string, transform?: (full: unknown) => unknown): string {
  const fiber = findFiberByPath(reactPath);
  const full = extractStateAndHooks(fiber, reactPath);
  const transformed = transform === undefined ? full : transform(full);
  const safeDataText = safeStringify(transformed);
  const parsedData = JSON.parse(safeDataText) as unknown;
  const budget = getBudgetInfo();

  const firstCandidate = serializeJsonEnvelope(parsedData, {
    truncated: false,
    omitted: false,
    nodeCount: countJsonEntries(parsedData),
    budget
  });
  if (fits(firstCandidate)) {
    recordBudgetRunStatsFromOutput("getReactStateAndHooksJson", firstCandidate);
    return firstCandidate;
  }

  const clipped = convergeStringBudget(safeDataText);
  const secondCandidate = serializeJsonEnvelope(
    {
      preview: clipValue(clipped)
    },
    {
      truncated: true,
      omitted: true,
      nodeCount: 1,
      budget
    }
  );
  recordBudgetRunStatsFromOutput("getReactStateAndHooksJson", secondCandidate);
  return secondCandidate;
}

function toRectNumber(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  return value;
}

function getElementVisibility(element: Element): "visible" | "hidden" {
  const style = window.getComputedStyle(element);
  const opacityValue = Number.parseFloat(style.opacity);
  const hasOpacity = style.opacity.trim().length > 0 && Number.isFinite(opacityValue);
  if (style.display === "none" || style.visibility === "hidden" || (hasOpacity && opacityValue === 0)) {
    return "hidden";
  }
  return "visible";
}

function getInViewport(rawRect: { x: number; y: number; width: number; height: number }): boolean {
  const viewportLeft = window.scrollX;
  const viewportTop = window.scrollY;
  const viewportRight = viewportLeft + window.innerWidth;
  const viewportBottom = viewportTop + window.innerHeight;
  const right = rawRect.x + rawRect.width;
  const bottom = rawRect.y + rawRect.height;
  return (
    rawRect.width > 0 &&
    rawRect.height > 0 &&
    right > viewportLeft &&
    rawRect.x < viewportRight &&
    bottom > viewportTop &&
    rawRect.y < viewportBottom
  );
}

export function getRectByReactPath(reactPath: string): RectItem | null {
  const fiber = findFiberByPath(reactPath);
  const hostNodes = collectHostDomNodesFromFiber(fiber, BUDGET.MAX_NODES);
  const firstElement = hostNodes.find((entry) => entry instanceof Element);
  if (!(firstElement instanceof Element)) {
    recordBudgetRunStatsFromOutput("getRectByReactPath", "null");
    return null;
  }

  const rect = firstElement.getBoundingClientRect();
  const rawRect = {
    x: toRectNumber(rect.left + window.scrollX),
    y: toRectNumber(rect.top + window.scrollY),
    width: toRectNumber(rect.width),
    height: toRectNumber(rect.height)
  };

  const item: RectItem = {
    xpath: getNodeXPath(firstElement),
    resolvedXPath: getNodeXPath(firstElement),
    matchIndex: 0,
    rawRect,
    visibility: getElementVisibility(firstElement),
    inViewport: getInViewport(rawRect),
    devicePixelRatio: toRectNumber(window.devicePixelRatio || 1)
  };
  recordBudgetRunStatsFromOutput("getRectByReactPath", safeStringify(item));
  return item;
}
