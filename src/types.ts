export type NodeKV = {
  k: string;
  v?: string;
};

export type OmittedReason = "maxNodes" | "depth";

export type OmittedSubtree = {
  reason: OmittedReason;
  omittedChildren: number;
};

export type ProbeNode = {
  id: string;
  label: string;
  dataAttrs?: Record<string, string>;
  kv?: NodeKV[];
  text?: string;
  children?: ProbeNode[];
  otherAttrs?: Record<string, string>;
  ariaAttrs?: Record<string, string>;
  omittedSubtree?: OmittedSubtree;
};

export type DomNode = {
  id: string;
  label: string;
  dataAttrs?: Record<string, string>;
  kv?: NodeKV[];
  text?: string;
  children?: DomNode[];
  tagName: string;
  xpath: string;
  nodeRef: string;
  element: Element;
};

export type DomIR = {
  root: DomNode;
  roots: DomNode[];
  byXPath: Map<string, DomNode>;
};

export type FiberNodeLike = {
  tag?: number;
  key?: string | number | null;
  type?: unknown;
  elementType?: unknown;
  return?: FiberNodeLike | null;
  child?: FiberNodeLike | null;
  sibling?: FiberNodeLike | null;
  stateNode?: unknown;
  memoizedProps?: unknown;
  memoizedState?: unknown;
  alternate?: FiberNodeLike | null;
  index?: number;
};

export type ReactNode = {
  id: string;
  label: string;
  dataAttrs?: Record<string, string>;
  kv?: NodeKV[];
  text?: string;
  children?: ReactNode[];
  displayName: string;
  reactPath: string;
  fiber: FiberNodeLike;
  domXPaths: string[];
};

export type ReactQuery = {
  displayName?: string;
  label?: string;
  reactPath?: string;
  reactPathPrefix?: string;
  dataAttrEquals?: Record<string, string>;
  propEquals?: Record<string, string | number | boolean | null>;
  textIncludes?: string;
};

export type ReactIR = {
  roots: ReactNode[];
  byPath: Map<string, ReactNode>;
  fiberByPath: Map<string, FiberNodeLike>;
  query: (criteria: ReactQuery) => ReactNode[];
  findOne: (criteria: ReactQuery) => ReactNode;
};

export type ScreenshotPlan = {
  matched: number;
  returned: number;
  omitted: number;
  maxScreenshots: number;
  clipMaxWidth: number;
  clipMaxHeight: number;
  items: Array<{
    xpath: string;
    clip: { x: number; y: number; width: number; height: number };
    clipped: boolean;
  }>;
};
