import path from 'node:path';
import { loadConfig, loadConfigFromPath } from '../config/load.js';
import { verify } from '../verify.js';
import type { VerifyInput, VerifySource } from '../verify.js';
import { computeVerdict, summarizeFindings } from '../verdict.js';
import { renderResult } from './reporters.js';
import type { ReporterName } from './reporters.js';
import type { ParsedArgs } from './args.js';
import type { Finding, Rule, Scope } from '../schemas.js';

export interface VerifyCliResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

const VALID_REPORTERS: ReadonlySet<ReporterName> = new Set<ReporterName>(['pretty', 'json']);

function reporterOf(args: ParsedArgs): ReporterName {
  const raw = args.options.reporter ?? 'pretty';
  if (VALID_REPORTERS.has(raw as ReporterName)) return raw as ReporterName;
  throw new Error(`Unknown --reporter "${raw}". Valid values: pretty, json.`);
}

function sourceOf(args: ParsedArgs, repo: string): VerifySource {
  if (args.flags.has('staged')) {
    return { kind: 'staged', repo };
  }
  const against = args.options.against;
  const work = args.options.work ?? 'HEAD';
  const baseline = args.options.baseline ?? against;
  if (baseline === undefined) {
    throw new Error(
      '`verify` needs a baseline ref. Use --baseline <ref> or --against <ref>, or --staged for index-based verification.',
    );
  }
  return { kind: 'git', repo, work, baseline };
}

/**
 * Default scope used when the config doesn't define one. Free-form means
 * the constitution applies in full with no role-specific expectations.
 */
const DEFAULT_SCOPE: Scope = {
  goal: 'CLI invocation of verify()',
  editable: ['**/*'],
  role: 'free-form',
};

function keepWorktreeOf(args: ParsedArgs): VerifyInput['keepWorktree'] {
  // Three exclusive surface forms:
  //   --keep-worktree            => 'always' (keep regardless of verdict)
  //   --keep-worktree=on-pass    => 'on-pass' (keep when failing; this is also the default)
  //   --keep-worktree=always     => 'always'
  //   --keep-worktree=never      => 'never' (always remove)
  //   --no-keep-worktree         => 'never'
  if (args.flags.has('no-keep-worktree')) return 'never';
  const explicit = args.options['keep-worktree'];
  if (explicit !== undefined) {
    if (explicit !== 'on-pass' && explicit !== 'always' && explicit !== 'never') {
      throw new Error(
        `Unknown --keep-worktree value "${explicit}". Valid values: on-pass, always, never.`,
      );
    }
    return explicit;
  }
  if (args.flags.has('keep-worktree')) return 'always';
  return undefined; // let verify() apply its default ('on-pass')
}

/**
 * Rule ids wired to the built-in protected-paths check. Identified by
 * `checkRef` rather than the conventional `protected-paths-respected`
 * id so a renamed (or duplicated) rule in an adopter config still
 * counts as a governance finding under `--governance-pr`.
 */
function protectedPathRuleIds(rules: ReadonlyMap<string, Rule>): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const rule of rules.values()) {
    if (rule.kind === 'custom' && rule.checkRef === 'protectedPathsRespected') ids.add(rule.id);
  }
  return ids;
}

export async function runVerifyCommand(args: ParsedArgs, cwd: string): Promise<VerifyCliResult> {
  const configFlag = args.options.config;
  const loaded =
    configFlag === undefined
      ? await loadConfig(cwd)
      : await loadConfigFromPath(path.resolve(cwd, configFlag));
  const reporter = reporterOf(args);
  const source = sourceOf(args, cwd);
  const keepWorktree = keepWorktreeOf(args);
  const skipInstall = args.flags.has('skip-install');
  let result = await verify({
    scope: DEFAULT_SCOPE,
    config: loaded.config,
    source,
    ...(loaded.config.exceptions === undefined ? {} : { exceptions: loaded.config.exceptions }),
    ...(keepWorktree === undefined ? {} : { keepWorktree }),
    ...(skipInstall ? { skipInstall: true } : {}),
  });
  // --governance-pr: the elevation surface for INTENTIONAL constitutional
  // changes (version bumps, rule additions, workflow edits). Protected-path
  // findings are moved out of the gating set — the verdict and exit code
  // are recomputed from everything else — but they are NOT silenced: the
  // reporter prints them in a dedicated governance section (and the JSON
  // reporter carries them under `governanceFindings`) so the elevation
  // stays auditable. Every other finding gates exactly as before; a real
  // bug in the same diff still fails the run.
  let governance: readonly Finding[] | undefined;
  if (args.flags.has('governance-pr')) {
    const ids = protectedPathRuleIds(loaded.resolved.rules);
    governance = result.findings.filter((f) => ids.has(f.ruleId));
    if (governance.length > 0) {
      const gating = result.findings.filter((f) => !ids.has(f.ruleId));
      result = {
        ...result,
        verdict: computeVerdict(gating),
        findings: gating,
        summary: summarizeFindings(gating),
      };
    }
  }
  return {
    stdout: `${renderResult(result, reporter, governance)}\n`,
    stderr: '',
    exitCode: result.verdict === 'fail' ? 1 : 0,
  };
}
