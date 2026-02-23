import { JSDOM } from "jsdom";

type TestGlobal = typeof globalThis & {
  window: Window & typeof globalThis;
  document: Document;
  Node: typeof Node;
  Element: typeof Element;
  HTMLElement: typeof HTMLElement;
  Text: typeof Text;
  XPathResult: typeof XPathResult;
};

export function installDom(html: string): JSDOM {
  const dom = new JSDOM(html, {
    url: "https://example.test/"
  });

  const g = globalThis as TestGlobal;
  g.window = dom.window as unknown as Window & typeof globalThis;
  g.document = dom.window.document;
  g.Node = dom.window.Node;
  g.Element = dom.window.Element;
  g.HTMLElement = dom.window.HTMLElement;
  g.Text = dom.window.Text;
  g.XPathResult = dom.window.XPathResult;

  return dom;
}

export function uninstallDom(dom: JSDOM): void {
  dom.window.close();
  delete (globalThis as unknown as Record<string, unknown>).__REACT_DEVTOOLS_GLOBAL_HOOK__;
}
