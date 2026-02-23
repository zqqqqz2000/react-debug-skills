import { describe, expect, test } from "bun:test";

import { safeStringify } from "../src/safeStringify";

describe("safeStringify", () => {
  test("handles circular references with explicit placeholder", () => {
    const value: Record<string, unknown> = {
      name: "probe"
    };
    value.self = value;

    const out = safeStringify(value);
    expect(out).toContain("[Circular->$]");
    expect(out).toContain('"name": "probe"');
  });

  test("serializes map/set/bigint without throwing", () => {
    const data = {
      map: new Map<string, unknown>([["a", 1]]),
      set: new Set<number>([1, 2]),
      bigint: 10n
    };

    const out = safeStringify(data);
    expect(out).toContain('"map"');
    expect(out).toContain('"set"');
    expect(out).toContain("[BigInt:10]");
  });
});
