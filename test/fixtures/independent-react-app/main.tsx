import React, {
  createContext,
  forwardRef,
  memo,
  useContext,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch
} from "react";
import { createRoot } from "react-dom/client";

type View = "dashboard" | "settings";

type CounterAction = { type: "inc" } | { type: "dec" };

type RowProps = {
  itemId: string;
  index: number;
};

type InputMirrorProps = {
  seed: string;
};

type NavProps = {
  count: number;
  dispatch: Dispatch<CounterAction>;
  setView: (view: View) => void;
};

type DashboardProps = {
  items: string[];
};

const ThemeContext = createContext<string>("light");

function counterReducer(state: number, action: CounterAction): number {
  if (action.type === "inc") {
    return state + 1;
  }
  if (action.type === "dec") {
    return state - 1;
  }
  return state;
}

const Row = memo(function Row(props: RowProps): React.ReactElement {
  const [expanded] = useState<boolean>(props.index % 2 === 0);
  const detail = useMemo(() => `${props.itemId}:${expanded ? "open" : "closed"}`, [props.itemId, expanded]);

  return React.createElement(
    "li",
    {
      "data-testid": "leaf",
      "data-item-id": props.itemId,
      "data-expanded": expanded ? "1" : "0"
    },
    React.createElement("span", null, detail)
  );
});

const InputMirror = forwardRef<HTMLInputElement, InputMirrorProps>(function InputMirror(
  props: InputMirrorProps,
  ref
): React.ReactElement {
  const value = useMemo(() => `${props.seed}-input`, [props.seed]);
  return React.createElement("input", {
    ref,
    "data-testid": "mirror-input",
    defaultValue: value
  });
});

function Nav(props: NavProps): React.ReactElement {
  return React.createElement(
    "header",
    { "data-testid": "top-nav", "data-count": String(props.count) },
    React.createElement(
      "button",
      {
        "data-testid": "nav-dashboard",
        onClick: () => props.setView("dashboard")
      },
      "Dashboard"
    ),
    React.createElement(
      "button",
      {
        "data-testid": "nav-settings",
        onClick: () => props.setView("settings")
      },
      "Settings"
    ),
    React.createElement(
      "button",
      {
        "data-testid": "count-inc",
        onClick: () => props.dispatch({ type: "inc" })
      },
      "+"
    ),
    React.createElement(
      "button",
      {
        "data-testid": "count-dec",
        onClick: () => props.dispatch({ type: "dec" })
      },
      "-"
    )
  );
}

function Dashboard(props: DashboardProps): React.ReactElement {
  const theme = useContext(ThemeContext);
  const visibleRows = useMemo(() => props.items.slice(0, 240), [props.items]);

  return React.createElement(
    "section",
    { "data-testid": "dashboard", "data-theme": theme },
    React.createElement(
      "ul",
      { "data-testid": "leaf-list" },
      visibleRows.map((itemId, index) => React.createElement(Row, { key: itemId, itemId, index }))
    )
  );
}

function Settings(): React.ReactElement {
  const [name] = useState<string>("settings");
  const [note] = useState<string>("N".repeat(260));
  const computed = useMemo(() => `${name}:${note.length}`, [name, note]);

  return React.createElement(
    "section",
    {
      "data-testid": "settings",
      "data-note-size": String(note.length)
    },
    React.createElement("p", { "data-testid": "settings-name" }, computed),
    React.createElement("p", { "data-testid": "settings-note" }, note)
  );
}

function App(): React.ReactElement {
  const [view, setView] = useState<View>("dashboard");
  const [count, dispatch] = useReducer(counterReducer, 2);
  const seedRef = useRef<string>("seed-42");

  const items = useMemo(
    () => Array.from({ length: 260 }, (_unused, index) => `${seedRef.current}-item-${index}`),
    []
  );

  const content = view === "dashboard" ? React.createElement(Dashboard, { items }) : React.createElement(Settings);

  return React.createElement(
    ThemeContext.Provider,
    { value: view === "dashboard" ? "midnight" : "daylight" },
    React.createElement(
      "main",
      {
        "data-testid": "independent-root",
        "data-view": view,
        "data-seed": seedRef.current
      },
      React.createElement(Nav, { count, dispatch, setView }),
      React.createElement("h1", { "data-testid": "title" }, "Independent React App"),
      content,
      React.createElement(InputMirror, { seed: seedRef.current })
    )
  );
}

const mountNode = document.getElementById("app");
if (mountNode === null) {
  throw new Error("Missing #app mount node");
}

const root = createRoot(mountNode);
root.render(React.createElement(App));

(globalThis as typeof globalThis & { __INDEPENDENT_APP_READY__?: boolean }).__INDEPENDENT_APP_READY__ = true;
