(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __moduleCache = /* @__PURE__ */ new WeakMap;
  var __toCommonJS = (from) => {
    var entry = __moduleCache.get(from), desc;
    if (entry)
      return entry;
    entry = __defProp({}, "__esModule", { value: true });
    if (from && typeof from === "object" || typeof from === "function")
      __getOwnPropNames(from).map((key) => !__hasOwnProp.call(entry, key) && __defProp(entry, key, {
        get: () => from[key],
        enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
      }));
    __moduleCache.set(from, entry);
    return entry;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, {
        get: all[name],
        enumerable: true,
        configurable: true,
        set: (newValue) => all[name] = () => newValue
      });
  };

  // src/index.ts
  var exports_src = {};
  __export(exports_src, {
    screenshotByXPath: () => screenshotByXPath,
    getReactTree: () => getReactTree,
    getReactStateAndHooks: () => getReactStateAndHooks,
    getReactRenderedHtml: () => getReactRenderedHtml,
    getDomTree: () => getDomTree
  });

  // src/safeStringify.ts
  function isRecord(value) {
    return typeof value === "object" && value !== null;
  }
  function toSerializable(value, path, seen) {
    const valueType = typeof value;
    if (valueType === "string") {
      return value;
    }
    if (valueType === "number") {
      const n = value;
      if (Number.isFinite(n)) {
        return n;
      }
      return `[NonFiniteNumber:${String(n)}]`;
    }
    if (valueType === "boolean") {
      return value;
    }
    if (valueType === "undefined") {
      return "[Undefined]";
    }
    if (valueType === "bigint") {
      return `[BigInt:${String(value)}]`;
    }
    if (valueType === "symbol") {
      return `[Symbol:${String(value)}]`;
    }
    if (valueType === "function") {
      const fn = value;
      return `[Function:${fn.name || "anonymous"}]`;
    }
    if (value === null) {
      return null;
    }
    if (!isRecord(value)) {
      return `[Unserializable:${Object.prototype.toString.call(value)}]`;
    }
    if (seen.has(value)) {
      return `[Circular->${seen.get(value)}]`;
    }
    seen.set(value, path);
    if (Array.isArray(value)) {
      const arr = [];
      for (let index = 0;index < value.length; index += 1) {
        arr.push(toSerializable(value[index], `${path}[${index}]`, seen));
      }
      return arr;
    }
    if (value instanceof Date) {
      return `[Date:${value.toISOString()}]`;
    }
    if (value instanceof RegExp) {
      return `[RegExp:${String(value)}]`;
    }
    if (value instanceof Set) {
      const items = [];
      let index = 0;
      for (const entry of value.values()) {
        items.push(toSerializable(entry, `${path}.set[${index}]`, seen));
        index += 1;
      }
      return items;
    }
    if (value instanceof Map) {
      const mapOutput = {};
      let index = 0;
      for (const [mapKey, mapValue] of value.entries()) {
        const keyString = typeof mapKey === "string" ? mapKey : `[Key:${String(mapKey)}]`;
        mapOutput[keyString] = toSerializable(mapValue, `${path}.map[${index}]`, seen);
        index += 1;
      }
      return mapOutput;
    }
    const output = {};
    const keys = Object.keys(value).sort();
    for (const key of keys) {
      output[key] = toSerializable(value[key], `${path}.${key}`, seen);
    }
    return output;
  }
  function safeStringify(value) {
    const serializable = toSerializable(value, "$", new WeakMap);
    return JSON.stringify(serializable, null, 2);
  }

  // src/budget.ts
  var MAX_CHARS = 6000;
  var VALUE_MAX_CHARS = 200;
  var MAX_NODES = 200;
  var MAX_SCREENSHOTS = 5;
  var CLIP_MAX_WIDTH = 800;
  var CLIP_MAX_HEIGHT = 800;
  var MAX_DEPTH = 12;
  function pickBudgetNumber(candidate, fallback) {
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
  function readBudgetOverride() {
    const candidate = globalThis.__REACT_PROBE_BUDGET__;
    if (typeof candidate !== "object" || candidate === null) {
      return {};
    }
    return candidate;
  }
  var budgetOverride = readBudgetOverride();
  var BUDGET = {
    MAX_CHARS: pickBudgetNumber(budgetOverride.MAX_CHARS, MAX_CHARS),
    VALUE_MAX_CHARS: pickBudgetNumber(budgetOverride.VALUE_MAX_CHARS, VALUE_MAX_CHARS),
    MAX_NODES: pickBudgetNumber(budgetOverride.MAX_NODES, MAX_NODES),
    MAX_SCREENSHOTS: pickBudgetNumber(budgetOverride.MAX_SCREENSHOTS, MAX_SCREENSHOTS),
    CLIP_MAX_WIDTH: pickBudgetNumber(budgetOverride.CLIP_MAX_WIDTH, CLIP_MAX_WIDTH),
    CLIP_MAX_HEIGHT: pickBudgetNumber(budgetOverride.CLIP_MAX_HEIGHT, CLIP_MAX_HEIGHT),
    MAX_DEPTH: pickBudgetNumber(budgetOverride.MAX_DEPTH, MAX_DEPTH)
  };
  function isRecord2(value) {
    return typeof value === "object" && value !== null;
  }
  function isStringRecord(value) {
    if (!isRecord2(value)) {
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
  function isNodeKvList(value) {
    if (!Array.isArray(value)) {
      return false;
    }
    for (const item of value) {
      if (!isRecord2(item)) {
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
  function isProbeNode(value) {
    if (!isRecord2(value)) {
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
  function assertNodeOrNodes(value) {
    if (isProbeNode(value)) {
      return;
    }
    if (Array.isArray(value) && value.every((entry) => isProbeNode(entry))) {
      return;
    }
    throw new Error("Callback must return ProbeNode or ProbeNode[]");
  }
  function len(s) {
    return s.length;
  }
  function clipValue(s) {
    if (len(s) <= BUDGET.VALUE_MAX_CHARS) {
      return s;
    }
    return `${s.slice(0, BUDGET.VALUE_MAX_CHARS)}…(TRUNCATED,len=${len(s)})`;
  }
  function fits(s) {
    return len(s) <= BUDGET.MAX_CHARS;
  }
  function cloneNodeShallow(node) {
    const cloned = {
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
  function deepCloneNode(node) {
    const cloned = cloneNodeShallow(node);
    if (node.children !== undefined) {
      cloned.children = node.children.map((child) => deepCloneNode(child));
    }
    return cloned;
  }
  function createOmittedSubtreeNode(reason, omittedChildren) {
    return {
      id: `(@omitted:${reason}:${omittedChildren})`,
      label: `…(OMITTED_SUBTREE, reason=${reason}, omittedChildren=${omittedChildren})`,
      omittedSubtree: {
        reason,
        omittedChildren
      }
    };
  }
  function normalizeRoots(input) {
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
  function stage1ClipNode(node, nodeBudget) {
    const cloned = cloneNodeShallow(node);
    const originalChildren = node.children ?? [];
    const children = [];
    let used = 1;
    let capacity = nodeBudget - 1;
    let omittedChildren = 0;
    for (let index = 0;index < originalChildren.length; index += 1) {
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
  function stage1ClipForest(roots) {
    const clipped = [];
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
  function stage2ClipValueOnNode(node) {
    const cloned = cloneNodeShallow(node);
    if (cloned.dataAttrs !== undefined) {
      const nextDataAttrs = {};
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
  function removeTextOnNode(node) {
    const cloned = cloneNodeShallow(node);
    delete cloned.text;
    if (node.children !== undefined) {
      cloned.children = node.children.map((child) => removeTextOnNode(child));
    }
    return cloned;
  }
  function removeKvValuesOnNode(node) {
    const cloned = cloneNodeShallow(node);
    if (cloned.kv !== undefined) {
      cloned.kv = cloned.kv.map((item) => ({ k: item.k }));
    }
    if (node.children !== undefined) {
      cloned.children = node.children.map((child) => removeKvValuesOnNode(child));
    }
    return cloned;
  }
  function removeKvOnNode(node) {
    const cloned = cloneNodeShallow(node);
    delete cloned.kv;
    if (node.children !== undefined) {
      cloned.children = node.children.map((child) => removeKvOnNode(child));
    }
    return cloned;
  }
  function removeOtherAndAriaOnNode(node) {
    const cloned = cloneNodeShallow(node);
    delete cloned.otherAttrs;
    delete cloned.ariaAttrs;
    if (node.children !== undefined) {
      cloned.children = node.children.map((child) => removeOtherAndAriaOnNode(child));
    }
    return cloned;
  }
  function foldDepthOnNode(node, depth, depthCap) {
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
  function keepMinimalNode(node) {
    const cloned = {
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
  function formatDataAttrs(dataAttrs) {
    if (dataAttrs === undefined) {
      return "";
    }
    const keys = Object.keys(dataAttrs).sort();
    if (keys.length === 0) {
      return "";
    }
    const parts = [];
    for (const key of keys) {
      parts.push(`${key}=${JSON.stringify(dataAttrs[key])}`);
    }
    return `[${parts.join(" ")}]`;
  }
  function formatKv(kv, kvKeysOnly) {
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
  function renderNodeLines(node, depth, mode, lines) {
    const indent = "  ".repeat(depth);
    if (node.omittedSubtree !== undefined) {
      lines.push(`${indent}- …(OMITTED_SUBTREE, reason=${node.omittedSubtree.reason}, omittedChildren=${node.omittedSubtree.omittedChildren})`);
      return;
    }
    const dataAttrs = formatDataAttrs(node.dataAttrs);
    const kv = mode.showKv ? formatKv(node.kv, mode.kvKeysOnly) : "";
    const textPart = mode.showText && node.text !== undefined ? `text=${JSON.stringify(node.text)}` : "";
    const lineParts = [`${indent}-`, node.label];
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
  function renderForest(roots, mode, omittedMatches) {
    const lines = [];
    for (const root of roots) {
      renderNodeLines(root, 0, mode, lines);
    }
    if (omittedMatches > 0) {
      lines.push(`…(OMITTED_MATCHES, omitted=${omittedMatches})`);
    }
    return lines.join(`
`);
  }
  function hardClipLines(output) {
    const limit = Math.max(0, BUDGET.MAX_CHARS - 30);
    const clippedLines = output.split(`
`).map((line) => {
      if (line.length <= limit) {
        return line;
      }
      return `${line.slice(0, limit)}…(TRUNCATED_LINE)`;
    });
    return clippedLines.join(`
`);
  }
  function hardClipOutput(output) {
    const lineClipped = hardClipLines(output);
    if (fits(lineClipped)) {
      return lineClipped;
    }
    const limit = Math.max(0, BUDGET.MAX_CHARS - 30);
    return `${lineClipped.slice(0, limit)}…(TRUNCATED_OUTPUT)`;
  }
  function trimRenderedLines(output) {
    const lines = output.split(`
`);
    for (let keep = lines.length - 1;keep >= 1; keep -= 1) {
      const omitted = lines.length - keep;
      const candidate = `${lines.slice(0, keep).join(`
`)}
…(OMITTED_LINES, omitted=${omitted})`;
      if (fits(candidate)) {
        return candidate;
      }
    }
    return output;
  }
  function convergeStringBudget(input) {
    const lineClippedByValue = input.split(`
`).map((line) => clipValue(line)).join(`
`);
    if (fits(lineClippedByValue)) {
      return lineClippedByValue;
    }
    return hardClipOutput(lineClippedByValue);
  }
  function renderWithBudget(input) {
    const stage0 = normalizeRoots(input);
    const stage1 = stage1ClipForest(stage0.roots);
    let current = stage1.map((node) => stage2ClipValueOnNode(node));
    const fullMode = {
      showText: true,
      showKv: true,
      kvKeysOnly: false,
      minimal: false
    };
    const noTextMode = {
      showText: false,
      showKv: true,
      kvKeysOnly: false,
      minimal: false
    };
    const keysOnlyMode = {
      showText: false,
      showKv: true,
      kvKeysOnly: true,
      minimal: false
    };
    const noKvMode = {
      showText: false,
      showKv: false,
      kvKeysOnly: true,
      minimal: false
    };
    const minimalMode = {
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
    for (let depthCap = BUDGET.MAX_DEPTH;depthCap >= 1; depthCap -= 1) {
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

  // src/dom.ts
  function toLowerTagName(element) {
    return element.tagName.toLowerCase();
  }
  function getElementXPath(element) {
    const segments = [];
    let current = element;
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
  function getTextNodeXPath(node) {
    const parent = node.parentElement;
    if (parent === null) {
      return "(/text()[1])";
    }
    let index = 1;
    let sibling = parent.firstChild;
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
  function getNodeXPath(node) {
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
  function getDataAttrs(element) {
    const dataAttrs = {};
    for (const attr of Array.from(element.attributes)) {
      if (attr.name.startsWith("data-")) {
        dataAttrs[attr.name] = attr.value;
      }
    }
    const keys = Object.keys(dataAttrs);
    if (keys.length === 0) {
      return;
    }
    return dataAttrs;
  }
  function getAttrKv(element) {
    const kv = [];
    for (const attr of Array.from(element.attributes)) {
      if (!attr.name.startsWith("data-")) {
        kv.push({ k: attr.name, v: attr.value });
      }
    }
    if (kv.length === 0) {
      return;
    }
    return kv;
  }
  function getDirectText(element) {
    let text = "";
    for (const node of Array.from(element.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent ?? "";
      }
    }
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return;
    }
    return trimmed;
  }
  function buildDomNode(element, counter, byXPath) {
    const xpath = getElementXPath(element);
    const domNode = {
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
  function createDomIR() {
    const rootElement = document.documentElement ?? document.body;
    if (rootElement === null) {
      throw new Error("Document root element not found");
    }
    const byXPath = new Map;
    const root = buildDomNode(rootElement, { value: 1 }, byXPath);
    return {
      root,
      roots: [root],
      byXPath
    };
  }
  function getDomTree(findCallback) {
    const domIR = createDomIR();
    const selected = findCallback === undefined ? domIR.root : findCallback(domIR);
    assertNodeOrNodes(selected);
    return renderWithBudget(selected);
  }
  function toNonNegativeFinite(value) {
    if (!Number.isFinite(value)) {
      return 0;
    }
    if (value < 0) {
      return 0;
    }
    return value;
  }
  function screenshotByXPath(htmlXPath) {
    const xpathResult = document.evaluate(htmlXPath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    const matches = [];
    for (let index = 0;index < xpathResult.snapshotLength; index += 1) {
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

  // src/react.ts
  var TAG_FUNCTION_COMPONENT = 0;
  var TAG_CLASS_COMPONENT = 1;
  var TAG_HOST_ROOT = 3;
  var TAG_HOST_COMPONENT = 5;
  var TAG_HOST_TEXT = 6;
  var TAG_FORWARD_REF = 11;
  var TAG_MEMO_COMPONENT = 14;
  var TAG_SIMPLE_MEMO_COMPONENT = 15;
  var DISPLAY_COMPONENT_TAGS = new Set([
    TAG_FUNCTION_COMPONENT,
    TAG_CLASS_COMPONENT,
    TAG_FORWARD_REF,
    TAG_MEMO_COMPONENT,
    TAG_SIMPLE_MEMO_COMPONENT
  ]);
  function isRecord3(value) {
    return typeof value === "object" && value !== null;
  }
  function isFiberNodeLike(value) {
    if (!isRecord3(value)) {
      return false;
    }
    return "child" in value || "sibling" in value || "return" in value || "tag" in value;
  }
  function readDisplayNameFromType(typeValue) {
    if (typeof typeValue === "string") {
      return typeValue;
    }
    if (typeof typeValue === "function") {
      const namedFunction = typeValue;
      if (typeof namedFunction.displayName === "string" && namedFunction.displayName.length > 0) {
        return namedFunction.displayName;
      }
      if (namedFunction.name.length > 0) {
        return namedFunction.name;
      }
      return "AnonymousFn";
    }
    if (isRecord3(typeValue)) {
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
  function getFiberDisplayName(fiber) {
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
  function getRendererIds(renderers) {
    if (renderers instanceof Map) {
      return Array.from(renderers.keys());
    }
    if (isRecord3(renderers)) {
      const ids = [];
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
  function getRootsFromDevtoolsHook() {
    const hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!isRecord3(hook)) {
      return [];
    }
    if (typeof hook.getFiberRoots !== "function") {
      return [];
    }
    const rendererIds = getRendererIds(hook.renderers);
    const roots = [];
    const seen = new Set;
    for (const rendererId of rendererIds) {
      const rootSet = hook.getFiberRoots(rendererId);
      if (!(rootSet instanceof Set)) {
        continue;
      }
      for (const root of rootSet.values()) {
        if (!isRecord3(root)) {
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
  function getOwnFieldNames(node) {
    return Object.getOwnPropertyNames(node);
  }
  function readFiberFromNode(node) {
    const nodeRecord = node;
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
        if (isRecord3(container) && "current" in container && isFiberNodeLike(container.current)) {
          return container.current;
        }
      }
    }
    return null;
  }
  function hasReactOwnedMarker(node) {
    const fieldNames = getOwnFieldNames(node);
    for (const key of fieldNames) {
      if (key.startsWith("__reactFiber$") || key.startsWith("__reactProps$") || key.startsWith("__reactContainer$")) {
        return true;
      }
    }
    return false;
  }
  function findNearestFiberForDomNode(node) {
    let current = node;
    while (current !== null) {
      const fiber = readFiberFromNode(current);
      if (fiber !== null) {
        return fiber;
      }
      current = current.parentNode;
    }
    return null;
  }
  function ascendToRootFiber(fiber) {
    let current = fiber;
    while (current.return !== null && current.return !== undefined) {
      current = current.return;
    }
    return current;
  }
  function getRootsFromDomPrivateFields() {
    const roots = [];
    const seen = new Set;
    const nodesToScan = [];
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
  function collectSiblingFibers(firstChild) {
    const siblings = [];
    let cursor = firstChild;
    const seen = new Set;
    while (cursor !== null && cursor !== undefined && !seen.has(cursor)) {
      siblings.push(cursor);
      seen.add(cursor);
      cursor = cursor.sibling;
    }
    return siblings;
  }
  function getStateNodeAsDom(node) {
    if (node instanceof Element || node instanceof Text) {
      return node;
    }
    return null;
  }
  function collectHostDomNodesFromFiber(fiber, limit) {
    const out = [];
    const stack = [fiber];
    const visited = new Set;
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
      for (let index = children.length - 1;index >= 0; index -= 1) {
        const child = children[index];
        if (child !== undefined) {
          stack.push(child);
        }
      }
    }
    return out;
  }
  function stringifyShallowValue(value) {
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
    if (isRecord3(value)) {
      const ctor = value.constructor;
      const ctorName = typeof ctor?.name === "string" ? ctor.name : "Object";
      return `[Object:${ctorName}]`;
    }
    return String(value);
  }
  function propsToKv(props) {
    if (!isRecord3(props)) {
      return;
    }
    const keys = Object.keys(props).sort();
    if (keys.length === 0) {
      return;
    }
    const kv = [];
    for (const key of keys) {
      kv.push({
        k: key,
        v: stringifyShallowValue(props[key])
      });
    }
    return kv;
  }
  function flattenReactNodes(roots) {
    const out = [];
    const stack = [];
    for (let index = roots.length - 1;index >= 0; index -= 1) {
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
      for (let index = children.length - 1;index >= 0; index -= 1) {
        const child = children[index];
        if (child !== undefined) {
          stack.push(child);
        }
      }
    }
    return out;
  }
  function matchesQuery(node, criteria) {
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
      if (!isRecord3(props)) {
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
  function queryReactNodes(roots, criteria) {
    const nodes = flattenReactNodes(roots);
    return nodes.filter((node) => matchesQuery(node, criteria));
  }
  function findOneReactNode(roots, criteria) {
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
  function buildReactNodeFromFiber(fiber, reactPath, context) {
    if (context.visited.has(fiber)) {
      const cycleNode = {
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
    const domXPaths = hostNodes.map((node2) => getNodeXPath(node2));
    const node = {
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
      const indexByLabel = new Map;
      const childNodes = [];
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
  function createReactIR() {
    const rootFibersFromHook = getRootsFromDevtoolsHook();
    const rootFibers = rootFibersFromHook.length > 0 ? rootFibersFromHook : getRootsFromDomPrivateFields();
    const byPath = new Map;
    const fiberByPath = new Map;
    const visited = new Set;
    const roots = [];
    for (let rootIndex = 0;rootIndex < rootFibers.length; rootIndex += 1) {
      const rootFiber = rootFibers[rootIndex];
      if (rootFiber === undefined) {
        continue;
      }
      const rootPath = `/Root[${rootIndex}]`;
      roots.push(buildReactNodeFromFiber(rootFiber, rootPath, {
        byPath,
        fiberByPath,
        visited
      }));
    }
    return {
      roots,
      byPath,
      fiberByPath,
      query: (criteria) => queryReactNodes(roots, criteria),
      findOne: (criteria) => findOneReactNode(roots, criteria)
    };
  }
  function getReactTree(findCallback) {
    const reactIR = createReactIR();
    const selected = findCallback === undefined ? reactIR.roots : findCallback(reactIR);
    assertNodeOrNodes(selected);
    return renderWithBudget(selected);
  }
  function readDomFragment(node) {
    if (node instanceof Element) {
      return node.outerHTML;
    }
    if (node instanceof Text) {
      return node.textContent ?? "";
    }
    return "";
  }
  function findFiberByPath(reactPath) {
    const reactIR = createReactIR();
    const fiber = reactIR.fiberByPath.get(reactPath);
    if (fiber === undefined) {
      throw new Error(`React fiber not found for path: ${reactPath}`);
    }
    return fiber;
  }
  function getReactRenderedHtml(reactPath) {
    const fiber = findFiberByPath(reactPath);
    const hostNodes = collectHostDomNodesFromFiber(fiber, BUDGET.MAX_NODES * 4);
    if (hostNodes.length === 0) {
      return "";
    }
    let omitted = 0;
    let selectedNodes = hostNodes;
    if (hostNodes.length > BUDGET.MAX_NODES) {
      omitted = hostNodes.length - BUDGET.MAX_NODES;
      selectedNodes = hostNodes.slice(0, BUDGET.MAX_NODES);
    }
    const htmlParts = selectedNodes.map((node) => clipValue(readDomFragment(node)));
    let output = htmlParts.join(`
`);
    if (omitted > 0) {
      output = `${output}
…(OMITTED_MATCHES, omitted=${omitted})`;
    }
    return convergeStringBudget(output);
  }
  function collectHooksFromMemoizedState(memoizedState) {
    const hooks = [];
    let cursor = memoizedState;
    const seen = new Set;
    let index = 0;
    while (isRecord3(cursor)) {
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
  function hasHooks(tag) {
    if (tag === undefined) {
      return false;
    }
    return tag === TAG_FUNCTION_COMPONENT || tag === TAG_FORWARD_REF || tag === TAG_MEMO_COMPONENT || tag === TAG_SIMPLE_MEMO_COMPONENT;
  }
  function extractStateAndHooks(fiber, reactPath) {
    const output = {
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
  function getReactStateAndHooks(reactPath, transform) {
    const fiber = findFiberByPath(reactPath);
    const full = extractStateAndHooks(fiber, reactPath);
    const transformed = transform === undefined ? full : transform(full);
    const serialized = safeStringify(transformed);
    return convergeStringBudget(serialized);
  }

  // src/index.ts
  var ReactProbe = {
    getDomTree,
    getReactTree,
    getReactRenderedHtml,
    getReactStateAndHooks,
    screenshotByXPath
  };
  globalThis.ReactProbe = ReactProbe;
})();
