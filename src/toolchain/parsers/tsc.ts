import type { Finding, Severity } from '../../schemas.js';
import type { Parser, ParsedToolchainResult } from './types.js';
import type { RunResult } from '../run.js';

/**
 * Matches `path/to/file.ts(line,col): error TSxxxx: message` and the
 * `warning` variant. Anchored to start-of-line so multi-line messages don't
 * confuse it.
 */
const TSC_LINE =
  /^(?<file>[^()]+)\((?<line>\d+),(?<col>\d+)\): (?<kind>error|warning) (?<code>TS\d+): (?<message>.+)$/;

/**
 * Recognizes pnpm's recursive-run output prefix: each line is prefixed
 * with `<package-dir> <script-name>: `, where `<package-dir>` is the
 * workspace path relative to the monorepo root (e.g. `packages/foo`,
 * `apps/web`) and `<script-name>` is the npm script being run
 * (typically `typecheck`, but adopters name them anything).
 *
 * Requiring a `/` in the directory eliminates false matches against
 * arbitrary `word:` patterns inside error messages — workspace dirs
 * are always relative paths, error-line prefixes from tsc itself never
 * have a leading directory followed by ` word: `.
 */
const PNPM_RECURSIVE_PREFIX = /^(?<dir>[\w./@-]*\/[\w./@-]*)\s+[\w:-]+:\s+(?<rest>.+)$/;

function severityFor(kind: string): Severity {
  return kind === 'error' ? 'CRITICAL' : 'MED';
}

interface StrippedLine {
  workspace?: string;
  content: string;
}

function stripPnpmPrefix(line: string): StrippedLine {
  const match = PNPM_RECURSIVE_PREFIX.exec(line);
  if (match?.groups?.dir !== undefined && match.groups.rest !== undefined) {
    return { workspace: match.groups.dir, content: match.groups.rest };
  }
  return { content: line };
}

function parseLines(stdout: string, stderr: string): Finding[] {
  const findings: Finding[] = [];
  const text = `${stdout}\n${stderr}`;
  for (const raw of text.split('\n')) {
    const { workspace, content } = stripPnpmPrefix(raw.trim());
    const match = TSC_LINE.exec(content);
    if (!match?.groups) continue;
    const { file, line, col, kind, code, message } = match.groups;
    if (
      file === undefined ||
      line === undefined ||
      col === undefined ||
      kind === undefined ||
      code === undefined ||
      message === undefined
    )
      continue;
    // When pnpm -r runs typecheck across workspaces, each package's tsc
    // reports paths relative to that package's root. Prepend the
    // workspace dir so the finding's `location.file` resolves correctly
    // from the monorepo root.
    const resolvedFile = workspace === undefined ? file : `${workspace}/${file}`;
    findings.push({
      ruleId: `tsc:${code}`,
      severity: severityFor(kind),
      category: 'toolchain',
      location: {
        file: resolvedFile,
        line: Number.parseInt(line, 10),
        column: Number.parseInt(col, 10),
      },
      evidence: message,
      message: `TypeScript ${code}: ${message}`,
      source: { kind: 'toolchain', tool: 'typecheck', nativeRuleId: code },
    });
  }
  return findings;
}

export const parseTsc: Parser = (result: RunResult): ParsedToolchainResult => {
  const findings = parseLines(result.stdout, result.stderr);
  // Non-zero exit with zero parseable error lines means tsc failed in a
  // way this parser can't measure (config error like TS5083 without a
  // file(line,col) prefix, wrapper noise, not actually tsc). Omit count
  // so the gate falls back to the exit code; a clean exit legitimately
  // means zero errors.
  if (findings.length === 0 && result.exitCode !== 0) return { findings };
  return { findings, count: findings.length };
};
