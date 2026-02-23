import { existsSync, statSync } from "node:fs";
import path from "node:path";

export type BundlePathSource = "env" | "skill_dir" | "cwd";

export type BundleResolveResult = {
  bundlePath: string;
  source: BundlePathSource;
  checkedPaths: string[];
};

type BundleResolveOptions = {
  env?: Record<string, string | undefined>;
  cwd?: string;
  skillDir?: string;
};

function resolveCodexHome(env: Record<string, string | undefined>): string {
  const codexHome = env.CODEX_HOME;
  if (typeof codexHome === "string" && codexHome.length > 0) {
    return codexHome;
  }
  const home = env.HOME;
  if (typeof home === "string" && home.length > 0) {
    return path.join(home, ".codex");
  }
  return path.join(".", ".codex");
}

function resolveSkillDir(options: BundleResolveOptions, env: Record<string, string | undefined>): string {
  if (typeof options.skillDir === "string" && options.skillDir.length > 0) {
    return options.skillDir;
  }
  const fromEnv = env.REACT_PROBE_SKILL_DIR;
  if (typeof fromEnv === "string" && fromEnv.length > 0) {
    return fromEnv;
  }
  return path.join(resolveCodexHome(env), "skills", "react-probe");
}

function isReadableFile(filePath: string): boolean {
  if (!existsSync(filePath)) {
    return false;
  }
  const stats = statSync(filePath);
  if (!stats.isFile()) {
    return false;
  }
  return (stats.mode & 0o444) !== 0;
}

function formatChecked(paths: string[]): string {
  return JSON.stringify(paths);
}

export function resolveReactProbeBundlePath(options: BundleResolveOptions = {}): BundleResolveResult {
  const env =
    options.env ??
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ??
    {};
  const cwd = options.cwd ?? ".";
  const skillDir = resolveSkillDir(options, env);

  const envPath = env.REACT_PROBE_BUNDLE;
  const candidates: Array<{ source: BundlePathSource; filePath: string }> = [];

  if (typeof envPath === "string" && envPath.length > 0) {
    candidates.push({ source: "env", filePath: envPath });
  }

  candidates.push({ source: "skill_dir", filePath: path.join(skillDir, "dist", "probe.scale.js") });
  candidates.push({ source: "cwd", filePath: path.join(cwd, "dist", "probe.scale.js") });

  const checkedPaths: string[] = [];

  for (const candidate of candidates) {
    checkedPaths.push(candidate.filePath);
    if (!existsSync(candidate.filePath)) {
      continue;
    }
    if (!isReadableFile(candidate.filePath)) {
      throw new Error(`E_BUNDLE_UNREADABLE path=${candidate.filePath} checked=${formatChecked(checkedPaths)}`);
    }

    return {
      bundlePath: candidate.filePath,
      source: candidate.source,
      checkedPaths
    };
  }

  throw new Error(`E_BUNDLE_NOT_FOUND checked=${formatChecked(checkedPaths)}`);
}

export type CdpTargetDescriptor = {
  id: string;
  type: string;
  url: string;
  title: string;
  openerId?: string;
};

export type CdpTargetSelectionPolicy = {
  allowUrlPatterns?: RegExp[];
  allowTitlePatterns?: RegExp[];
  blockUrlPatterns?: RegExp[];
  blockTitlePatterns?: RegExp[];
};

export type CdpTargetSelectionResult = {
  selected: CdpTargetDescriptor;
  candidates: CdpTargetDescriptor[];
  considered: CdpTargetDescriptor[];
};

function matchesAnyPattern(value: string, patterns: RegExp[] | undefined): boolean {
  if (patterns === undefined || patterns.length === 0) {
    return false;
  }
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    if (pattern.test(value)) {
      return true;
    }
  }
  return false;
}

function hasAllowRule(policy: CdpTargetSelectionPolicy): boolean {
  return (policy.allowUrlPatterns?.length ?? 0) > 0 || (policy.allowTitlePatterns?.length ?? 0) > 0;
}

function passAllowRules(target: CdpTargetDescriptor, policy: CdpTargetSelectionPolicy): boolean {
  if (!hasAllowRule(policy)) {
    return true;
  }
  return (
    matchesAnyPattern(target.url, policy.allowUrlPatterns) ||
    matchesAnyPattern(target.title, policy.allowTitlePatterns)
  );
}

function passBlockRules(target: CdpTargetDescriptor, policy: CdpTargetSelectionPolicy): boolean {
  if (matchesAnyPattern(target.url, policy.blockUrlPatterns)) {
    return false;
  }
  if (matchesAnyPattern(target.title, policy.blockTitlePatterns)) {
    return false;
  }
  return true;
}

function formatTargets(targets: CdpTargetDescriptor[]): string {
  const rows = targets.map((target, index) => ({
    index,
    id: target.id,
    type: target.type,
    url: target.url,
    title: target.title,
    openerId: target.openerId ?? null
  }));
  return JSON.stringify(rows);
}

export function selectCdpPageTarget(
  targets: CdpTargetDescriptor[],
  policy: CdpTargetSelectionPolicy = {}
): CdpTargetSelectionResult {
  const pageTargets = targets.filter((target) => target.type === "page");
  const allowFiltered = pageTargets.filter((target) => passAllowRules(target, policy));
  const candidates = allowFiltered.filter((target) => passBlockRules(target, policy));

  if (candidates.length === 1) {
    const selected = candidates[0];
    if (selected === undefined) {
      throw new Error("Unexpected empty selected target");
    }
    return {
      selected,
      candidates,
      considered: pageTargets
    };
  }

  if (candidates.length === 0) {
    throw new Error(
      `E_TARGET_NOT_FOUND considered=${formatTargets(pageTargets)} candidates=${formatTargets(candidates)}`
    );
  }

  throw new Error(`E_TARGET_AMBIGUOUS candidates=${formatTargets(candidates)}`);
}
