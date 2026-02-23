import { getDomTree, screenshotByXPath } from "./dom";
import { getReactRenderedHtml, getReactStateAndHooks, getReactTree } from "./react";

const ReactProbe = {
  getDomTree,
  getReactTree,
  getReactRenderedHtml,
  getReactStateAndHooks,
  screenshotByXPath
};

(globalThis as typeof globalThis & { ReactProbe: typeof ReactProbe }).ReactProbe = ReactProbe;

export {
  getDomTree,
  getReactTree,
  getReactRenderedHtml,
  getReactStateAndHooks,
  screenshotByXPath
};
