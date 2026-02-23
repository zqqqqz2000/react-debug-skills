import { getBudgetInfo } from "./budget";
import { getDomTree, getRectsByText, getRectsByXPath, screenshotByXPath } from "./dom";
import {
  getRectByReactPath,
  getReactRenderedHtml,
  getReactStateAndHooks,
  getReactStateAndHooksJson,
  getReactTree,
  getReactTreeJson
} from "./react";

const ReactProbe = {
  getDomTree,
  getReactTree,
  getReactTreeJson,
  getReactRenderedHtml,
  getReactStateAndHooks,
  getReactStateAndHooksJson,
  screenshotByXPath,
  getRectsByXPath,
  getRectsByText,
  getRectByReactPath,
  getBudgetInfo
};

(globalThis as typeof globalThis & { ReactProbe: typeof ReactProbe }).ReactProbe = ReactProbe;

export {
  getDomTree,
  getReactTree,
  getReactTreeJson,
  getReactRenderedHtml,
  getReactStateAndHooks,
  getReactStateAndHooksJson,
  screenshotByXPath,
  getRectsByXPath,
  getRectsByText,
  getRectByReactPath,
  getBudgetInfo
};
