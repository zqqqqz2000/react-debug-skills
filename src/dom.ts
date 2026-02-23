import {
  BUDGET,
  assertNodeOrNodes,
  recordBudgetRunStatsFromFlags,
  recordBudgetRunStatsFromOutput,
  renderWithBudget
} from "./budget";
import { safeStringify } from "./safeStringify";
import type { DomIR, DomNode, MatchOptions, NodeKV, RectItem, RectPlan, ScreenshotPlan } from "./types";

function toLowerTagName(element: Element): string {
  return element.tagName.toLowerCase();
}

export function getElementXPath(element: Element): string {
  const segments: string[] = [];
  let current: Element | null = element;

  while (current !== null) {
    const tagName = toLowerTagName(current);
    let index = 1;
    let sibling = current.previousElementSibling;
    while (sibling !== null) {
      if (toLowerTagName(sibling) === tagName) {
        index += 1;
      }
      sibling = sibling.previousElementSibling;
    }
    segments.push(`${tagName}[${index}]`);
    current = current.parentElement;
  }

  return `/${segments.reverse().join("/")}`;
}

function getTextNodeXPath(node: Text): string {
  const parent = node.parentElement;
  if (parent === null) {
    return "(/text()[1])";
  }

  let index = 1;
  let sibling: ChildNode | null = parent.firstChild;
  while (sibling !== null) {
    if (sibling.nodeType === Node.TEXT_NODE) {
      if (sibling === node) {
        break;
      }
      index += 1;
    }
    sibling = sibling.nextSibling;
  }

  return `${getElementXPath(parent)}/text()[${index}]`;
}

export function getNodeXPath(node: Node): string {
  if (node instanceof Element) {
    return getElementXPath(node);
  }
  if (node instanceof Text) {
    return getTextNodeXPath(node);
  }
  const parent = node.parentNode;
  if (parent instanceof Element) {
    return `${getElementXPath(parent)}/node()`;
  }
  return "(/node())";
}

export function getDataAttrs(element: Element): Record<string, string> | undefined {
  const dataAttrs: Record<string, string> = {};
  for (const attr of Array.from(element.attributes)) {
    if (attr.name.startsWith("data-")) {
      dataAttrs[attr.name] = attr.value;
    }
  }
  const keys = Object.keys(dataAttrs);
  if (keys.length === 0) {
    return undefined;
  }
  return dataAttrs;
}

function getAttrKv(element: Element): NodeKV[] | undefined {
  const kv: NodeKV[] = [];
  for (const attr of Array.from(element.attributes)) {
    if (!attr.name.startsWith("data-")) {
      kv.push({ k: attr.name, v: attr.value });
    }
  }
  if (kv.length === 0) {
    return undefined;
  }
  return kv;
}

function getDirectText(element: Element): string | undefined {
  let text = "";
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? "";
    }
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  return trimmed;
}

function buildDomNode(
  element: Element,
  counter: { value: number },
  byXPath: Map<string, DomNode>
): DomNode {
  const xpath = getElementXPath(element);
  const domNode: DomNode = {
    id: `(@${xpath})`,
    label: toLowerTagName(element),
    tagName: toLowerTagName(element),
    xpath,
    nodeRef: `node-${counter.value}`,
    element
  };

  counter.value += 1;

  const dataAttrs = getDataAttrs(element);
  if (dataAttrs !== undefined) {
    domNode.dataAttrs = dataAttrs;
  }

  const kv = getAttrKv(element);
  if (kv !== undefined) {
    domNode.kv = kv;
  }

  const directText = getDirectText(element);
  if (directText !== undefined) {
    domNode.text = directText;
  }

  const children = Array.from(element.children).map((child) => buildDomNode(child, counter, byXPath));
  if (children.length > 0) {
    domNode.children = children;
  }

  byXPath.set(xpath, domNode);
  return domNode;
}

export function createDomIR(): DomIR {
  const rootElement = document.documentElement ?? document.body;
  if (rootElement === null) {
    throw new Error("Document root element not found");
  }

  const byXPath = new Map<string, DomNode>();
  const root = buildDomNode(rootElement, { value: 1 }, byXPath);

  return {
    root,
    roots: [root],
    byXPath
  };
}

export function getDomTree(findCallback?: (dom: DomIR) => DomNode | DomNode[]): string {
  const domIR = createDomIR();
  const selected = findCallback === undefined ? domIR.root : findCallback(domIR);
  assertNodeOrNodes(selected);
  const output = renderWithBudget(selected);
  recordBudgetRunStatsFromOutput("getDomTree", output);
  return output;
}

function toNonNegativeFinite(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  return value;
}

function resolveMatchStrategy(options: MatchOptions | undefined): "deepest" | "first" | "all" {
  const value = options?.matchStrategy;
  if (value === "deepest" || value === "first" || value === "all") {
    return value;
  }
  return "all";
}

function resolveLimit(limit: number | undefined, fallback: number, cap: number): number {
  if (limit === undefined) {
    return Math.min(fallback, cap);
  }
  if (!Number.isFinite(limit)) {
    return Math.min(fallback, cap);
  }
  if (limit <= 0) {
    return Math.min(fallback, cap);
  }
  return Math.min(Math.floor(limit), cap);
}

function collectElementsByXPath(htmlXPath: string): Element[] {
  const xpathResult = document.evaluate(
    htmlXPath,
    document,
    null,
    XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
    null
  );

  const matches: Element[] = [];
  for (let index = 0; index < xpathResult.snapshotLength; index += 1) {
    const item = xpathResult.snapshotItem(index);
    if (item instanceof Element) {
      matches.push(item);
    }
  }
  return matches;
}

function collectElementsByText(text: string): Element[] {
  const needle = text.trim();
  if (needle.length === 0) {
    return [];
  }
  const out: Element[] = [];
  for (const element of Array.from(document.querySelectorAll("*"))) {
    const content = element.textContent ?? "";
    if (content.includes(needle)) {
      out.push(element);
    }
  }
  return out;
}

function filterDeepestElements(elements: Element[]): Element[] {
  if (elements.length <= 1) {
    return elements;
  }
  const kept: Element[] = [];
  for (const candidate of elements) {
    let isAncestor = false;
    for (const other of elements) {
      if (candidate !== other && candidate.contains(other)) {
        isAncestor = true;
        break;
      }
    }
    if (!isAncestor) {
      kept.push(candidate);
    }
  }
  return kept;
}

function applyMatchStrategy(elements: Element[], options: MatchOptions | undefined): Element[] {
  const strategy = resolveMatchStrategy(options);
  const excludeAncestors = options?.excludeAncestors === true;

  let selected = elements;
  if (strategy === "deepest" || excludeAncestors) {
    selected = filterDeepestElements(selected);
  }

  if (strategy === "first") {
    const first = selected[0];
    if (first === undefined) {
      return [];
    }
    return [first];
  }

  return selected;
}

function getRawRect(element: Element): { x: number; y: number; width: number; height: number } {
  const rect = element.getBoundingClientRect();
  return {
    x: toNonNegativeFinite(rect.left + window.scrollX),
    y: toNonNegativeFinite(rect.top + window.scrollY),
    width: toNonNegativeFinite(rect.width),
    height: toNonNegativeFinite(rect.height)
  };
}

function getClippedRect(rawRect: { x: number; y: number; width: number; height: number }): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return {
    x: rawRect.x,
    y: rawRect.y,
    width: Math.min(rawRect.width, BUDGET.CLIP_MAX_WIDTH),
    height: Math.min(rawRect.height, BUDGET.CLIP_MAX_HEIGHT)
  };
}

function getVisibility(element: Element): "visible" | "hidden" {
  const style = window.getComputedStyle(element);
  const opacityValue = Number.parseFloat(style.opacity);
  const hasOpacity = style.opacity.trim().length > 0 && Number.isFinite(opacityValue);
  if (style.display === "none" || style.visibility === "hidden" || (hasOpacity && opacityValue === 0)) {
    return "hidden";
  }
  return "visible";
}

function isInViewport(rawRect: { x: number; y: number; width: number; height: number }): boolean {
  const viewportLeft = window.scrollX;
  const viewportTop = window.scrollY;
  const viewportRight = viewportLeft + window.innerWidth;
  const viewportBottom = viewportTop + window.innerHeight;
  const rectRight = rawRect.x + rawRect.width;
  const rectBottom = rawRect.y + rawRect.height;
  return rawRect.width > 0 &&
    rawRect.height > 0 &&
    rectRight > viewportLeft &&
    rawRect.x < viewportRight &&
    rectBottom > viewportTop &&
    rawRect.y < viewportBottom;
}

function buildRectItems(elements: Element[]): RectItem[] {
  return elements.map((element, index) => {
    const rawRect = getRawRect(element);
    return {
      xpath: getElementXPath(element),
      resolvedXPath: getElementXPath(element),
      matchIndex: index,
      rawRect,
      visibility: getVisibility(element),
      inViewport: isInViewport(rawRect),
      devicePixelRatio: toNonNegativeFinite(window.devicePixelRatio || 1)
    };
  });
}

function finalizeRectPlan(
  api: string,
  matched: number,
  resolved: number,
  selected: Element[],
  limit: number,
  matchStrategy: "deepest" | "first" | "all"
): RectPlan {
  const returnedElements = selected.slice(0, limit);
  const items = buildRectItems(returnedElements);
  const returned = items.length;
  const omitted = Math.max(0, resolved - returned);
  const plan: RectPlan = {
    matched,
    resolved,
    returned,
    omitted,
    matchStrategy,
    items
  };
  recordBudgetRunStatsFromFlags(api, {
    charCount: safeStringify(plan).length,
    truncated: false,
    omitted: omitted > 0
  });
  return plan;
}

export function getRectsByXPath(htmlXPath: string, options?: MatchOptions): RectPlan {
  const matchedElements = collectElementsByXPath(htmlXPath);
  const selectedElements = applyMatchStrategy(matchedElements, options);
  const limit = resolveLimit(options?.limit, BUDGET.MAX_NODES, BUDGET.MAX_NODES);
  return finalizeRectPlan(
    "getRectsByXPath",
    matchedElements.length,
    selectedElements.length,
    selectedElements,
    limit,
    resolveMatchStrategy(options)
  );
}

export function getRectsByText(text: string, options?: MatchOptions): RectPlan {
  const matchedElements = collectElementsByText(text);
  const selectedElements = applyMatchStrategy(matchedElements, options);
  const limit = resolveLimit(options?.limit, BUDGET.MAX_NODES, BUDGET.MAX_NODES);
  return finalizeRectPlan(
    "getRectsByText",
    matchedElements.length,
    selectedElements.length,
    selectedElements,
    limit,
    resolveMatchStrategy(options)
  );
}

export function screenshotByXPath(htmlXPath: string, options?: MatchOptions): ScreenshotPlan {
  const rectPlan = getRectsByXPath(htmlXPath, {
    ...options,
    limit: resolveLimit(options?.limit, BUDGET.MAX_SCREENSHOTS, BUDGET.MAX_SCREENSHOTS)
  });

  const items = rectPlan.items.map((item) => {
    const clippedRect = getClippedRect(item.rawRect);
    const clipped =
      clippedRect.width < item.rawRect.width || clippedRect.height < item.rawRect.height;
    return {
      xpath: item.xpath,
      resolvedXPath: item.resolvedXPath,
      matchIndex: item.matchIndex,
      rawRect: item.rawRect,
      clippedRect,
      devicePixelRatio: item.devicePixelRatio,
      clip: clippedRect,
      clipped
    };
  });

  const output: ScreenshotPlan = {
    matched: rectPlan.matched,
    resolved: rectPlan.resolved,
    returned: rectPlan.returned,
    omitted: rectPlan.omitted,
    maxScreenshots: BUDGET.MAX_SCREENSHOTS,
    clipMaxWidth: BUDGET.CLIP_MAX_WIDTH,
    clipMaxHeight: BUDGET.CLIP_MAX_HEIGHT,
    matchStrategy: rectPlan.matchStrategy,
    items
  };
  recordBudgetRunStatsFromFlags("screenshotByXPath", {
    charCount: safeStringify(output).length,
    truncated: items.some((item) => item.clipped),
    omitted: output.omitted > 0
  });

  return output;
}
