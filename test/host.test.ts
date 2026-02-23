import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveReactProbeBundlePath, selectCdpPageTarget, type CdpTargetDescriptor } from "../src/host";

function createBundleFile(filePath: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, "globalThis.ReactProbe = {};", "utf8");
}

describe("host utilities", () => {
  let tmpDir = "";

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "react-probe-host-"));
  });

  afterEach(() => {
    if (tmpDir.length > 0) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("resolveReactProbeBundlePath picks REACT_PROBE_BUNDLE first", () => {
    const envBundle = path.join(tmpDir, "env", "probe.scale.js");
    const skillBundle = path.join(tmpDir, "skill", "dist", "probe.scale.js");
    const cwdBundle = path.join(tmpDir, "cwd", "dist", "probe.scale.js");

    createBundleFile(envBundle);
    createBundleFile(skillBundle);
    createBundleFile(cwdBundle);

    const result = resolveReactProbeBundlePath({
      env: {
        REACT_PROBE_BUNDLE: envBundle,
        HOME: tmpDir
      },
      skillDir: path.join(tmpDir, "skill"),
      cwd: path.join(tmpDir, "cwd")
    });

    expect(result.bundlePath).toBe(envBundle);
    expect(result.source).toBe("env");
    expect(result.checkedPaths[0]).toBe(envBundle);
  });

  test("resolveReactProbeBundlePath falls back to skill_dir then cwd", () => {
    const skillBundle = path.join(tmpDir, "skill", "dist", "probe.scale.js");
    const cwdBundle = path.join(tmpDir, "cwd", "dist", "probe.scale.js");

    createBundleFile(skillBundle);
    createBundleFile(cwdBundle);

    const fromSkill = resolveReactProbeBundlePath({
      env: {
        HOME: tmpDir
      },
      skillDir: path.join(tmpDir, "skill"),
      cwd: path.join(tmpDir, "cwd")
    });
    expect(fromSkill.bundlePath).toBe(skillBundle);
    expect(fromSkill.source).toBe("skill_dir");

    rmSync(skillBundle, { force: true });
    const fromCwd = resolveReactProbeBundlePath({
      env: {
        HOME: tmpDir
      },
      skillDir: path.join(tmpDir, "skill"),
      cwd: path.join(tmpDir, "cwd")
    });

    expect(fromCwd.bundlePath).toBe(cwdBundle);
    expect(fromCwd.source).toBe("cwd");
  });

  test("resolveReactProbeBundlePath throws E_BUNDLE_NOT_FOUND with checked paths", () => {
    expect(() =>
      resolveReactProbeBundlePath({
        env: {
          HOME: tmpDir
        },
        skillDir: path.join(tmpDir, "skill"),
        cwd: path.join(tmpDir, "cwd")
      })
    ).toThrow("E_BUNDLE_NOT_FOUND");
  });

  test("resolveReactProbeBundlePath throws E_BUNDLE_UNREADABLE when mode has no read bit", () => {
    const unreadable = path.join(tmpDir, "skill", "dist", "probe.scale.js");
    createBundleFile(unreadable);
    chmodSync(unreadable, 0o000);

    expect(() =>
      resolveReactProbeBundlePath({
        env: {
          HOME: tmpDir
        },
        skillDir: path.join(tmpDir, "skill"),
        cwd: path.join(tmpDir, "cwd")
      })
    ).toThrow("E_BUNDLE_UNREADABLE");
  });

  test("selectCdpPageTarget selects exactly one page candidate", () => {
    const targets: CdpTargetDescriptor[] = [
      { id: "t1", type: "page", url: "https://third-party.example", title: "OAuth" },
      { id: "t2", type: "page", url: "http://localhost:3000/home", title: "Main" },
      { id: "w1", type: "worker", url: "blob://x", title: "worker" }
    ];

    const result = selectCdpPageTarget(targets, {
      allowUrlPatterns: [/localhost/],
      blockTitlePatterns: [/OAuth/]
    });

    expect(result.selected.id).toBe("t2");
    expect(result.candidates.length).toBe(1);
  });

  test("selectCdpPageTarget throws E_TARGET_AMBIGUOUS on multiple candidates", () => {
    const targets: CdpTargetDescriptor[] = [
      { id: "t1", type: "page", url: "http://localhost:3000/a", title: "A" },
      { id: "t2", type: "page", url: "http://localhost:3000/b", title: "B" }
    ];

    expect(() =>
      selectCdpPageTarget(targets, {
        allowUrlPatterns: [/localhost/]
      })
    ).toThrow("E_TARGET_AMBIGUOUS");
  });

  test("selectCdpPageTarget throws E_TARGET_NOT_FOUND when filtered to zero", () => {
    const targets: CdpTargetDescriptor[] = [
      { id: "t1", type: "page", url: "https://example.com", title: "Main" },
      { id: "w1", type: "worker", url: "blob://x", title: "worker" }
    ];

    expect(() =>
      selectCdpPageTarget(targets, {
        allowUrlPatterns: [/localhost/]
      })
    ).toThrow("E_TARGET_NOT_FOUND");
  });
});
