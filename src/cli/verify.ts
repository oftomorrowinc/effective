import path from 'node:path';
import { loadConfig, loadConfigFromPath } from '../config/load.js';
import { verify } from '../verify.js';
import type { VerifySource } from '../verify.js';
import { renderResult } from './reporters.js';
import type { ReporterName } from './reporters.js';
import type { ParsedArgs } from './args.js';
import type { Scope } from '../schemas.js';

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

export async function runVerifyCommand(args: ParsedArgs, cwd: string): Promise<VerifyCliResult> {
  const configFlag = args.options.config;
  const loaded =
    configFlag === undefined
      ? await loadConfig(cwd)
      : await loadConfigFromPath(path.resolve(cwd, configFlag));
  const reporter = reporterOf(args);
  const source = sourceOf(args, cwd);
  const result = await verify({
    scope: DEFAULT_SCOPE,
    config: loaded.config,
    source,
  });
  return {
    stdout: `${renderResult(result, reporter)}\n`,
    stderr: '',
    exitCode: result.verdict === 'fail' ? 1 : 0,
  };
}
