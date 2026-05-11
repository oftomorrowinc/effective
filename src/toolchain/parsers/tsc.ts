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

function severityFor(kind: string): Severity {
  return kind === 'error' ? 'CRITICAL' : 'MED';
}

function parseLines(stdout: string, stderr: string): Finding[] {
  const findings: Finding[] = [];
  const text = `${stdout}\n${stderr}`;
  for (const raw of text.split('\n')) {
    const match = TSC_LINE.exec(raw.trim());
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
    findings.push({
      ruleId: `tsc:${code}`,
      severity: severityFor(kind),
      category: 'toolchain',
      location: {
        file,
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
  return { findings, count: findings.length };
};
