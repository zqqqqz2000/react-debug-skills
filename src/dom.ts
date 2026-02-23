import { BUDGET, assertNodeOrNodes, renderWithBudget } from "./budget";
import type { DomIR, DomNode, NodeKV, ScreenshotPlan } from "./types";

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
  return renderWithBudget(selected);
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

export function screenshotByXPath(htmlXPath: string): ScreenshotPlan {
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

  const matched = matches.length;
  const returned = Math.min(matched, BUDGET.MAX_SCREENSHOTS);
  const omitted = matched - returned;

  const items = matches.slice(0, returned).map((element) => {
    const rect = element.getBoundingClientRect();
    const width = Math.min(toNonNegativeFinite(rect.width), BUDGET.CLIP_MAX_WIDTH);
    const height = Math.min(toNonNegativeFinite(rect.height), BUDGET.CLIP_MAX_HEIGHT);
    const clipped = rect.width > BUDGET.CLIP_MAX_WIDTH || rect.height > BUDGET.CLIP_MAX_HEIGHT;

    return {
      xpath: getElementXPath(element),
      clip: {
        x: toNonNegativeFinite(rect.left + window.scrollX),
        y: toNonNegativeFinite(rect.top + window.scrollY),
        width,
        height
      },
      clipped
    };
  });

  return {
    matched,
    returned,
    omitted,
    maxScreenshots: BUDGET.MAX_SCREENSHOTS,
    clipMaxWidth: BUDGET.CLIP_MAX_WIDTH,
    clipMaxHeight: BUDGET.CLIP_MAX_HEIGHT,
    items
  };
}
