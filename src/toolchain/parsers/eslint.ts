import { parseTrailingJson } from './_json-start.js';
import type { Finding, Severity } from '../../schemas.js';
import type { Parser, ParsedToolchainResult } from './types.js';
import type { RunResult } from '../run.js';

interface EslintMessage {
  ruleId: string | null;
  severity: 1 | 2;
  message: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  fatal?: boolean;
}

interface EslintFileReport {
  filePath: string;
  messages: EslintMessage[];
  errorCount?: number;
  warningCount?: number;
}

function severityFor(message: EslintMessage): Severity {
  if (message.fatal === true) return 'CRITICAL';
  return message.severity === 2 ? 'HIGH' : 'MED';
}

function ruleId(message: EslintMessage): string {
  return message.ruleId ?? 'eslint.parse-error';
}

function toFinding(filePath: string, message: EslintMessage): Finding {
  const location: Finding['location'] = {
    file: filePath,
    ...(message.line === undefined ? {} : { line: message.line }),
    ...(message.endLine === undefined ? {} : { endLine: message.endLine }),
    ...(message.column === undefined ? {} : { column: message.column }),
  };
  return {
    ruleId: `eslint:${ruleId(message)}`,
    severity: severityFor(message),
    category: 'toolchain',
    location,
    evidence: message.message,
    message: `ESLint \`${ruleId(message)}\`: ${message.message}`,
    source: { kind: 'toolchain', tool: 'lint', nativeRuleId: ruleId(message) },
  };
}

export const parseEslint: Parser = (result: RunResult): ParsedToolchainResult => {
  const parsed = parseTrailingJson(result.stdout);
  // No JSON array in the output means the run wasn't measured (wrong
  // --format, crash before reporting, not actually eslint). Returning
  // count: 0 here would read as "measured clean" to count-based gates;
  // omitting count makes the gate fall back to the exit code.
  if (!Array.isArray(parsed)) return { findings: [] };
  const reports = parsed as EslintFileReport[];
  const findings: Finding[] = [];
  for (const report of reports) {
    if (!Array.isArray(report.messages)) continue;
    for (const message of report.messages) {
      findings.push(toFinding(report.filePath, message));
    }
  }
  return { findings, count: findings.length };
};
