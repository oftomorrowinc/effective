import { parseTrailingJson } from './_json-start.js';
import type { Finding } from '../../schemas.js';
import type { Parser, ParsedToolchainResult } from './types.js';
import type { RunResult } from '../run.js';

interface VitestAssertionResult {
  status: 'passed' | 'failed' | 'skipped' | 'todo' | 'pending';
  fullName?: string;
  title?: string;
  failureMessages?: string[];
}

interface VitestTestResult {
  name?: string;
  status?: 'passed' | 'failed';
  message?: string;
  assertionResults?: VitestAssertionResult[];
}

interface VitestReport {
  numFailedTests?: number;
  numTotalTests?: number;
  testResults?: VitestTestResult[];
}

function joinFailures(messages: readonly string[] | undefined): string {
  if (!messages || messages.length === 0) return '(no failure message captured)';
  return messages.join('\n');
}

export const parseVitest: Parser = (result: RunResult): ParsedToolchainResult => {
  const report = parseTrailingJson(result.stdout) as VitestReport | undefined;
  // No JSON report → the run wasn't measured; omit count so count-based
  // gates fall back to the exit code instead of reading 0 as clean.
  if (!report) return { findings: [] };
  const findings: Finding[] = [];
  for (const testResult of report.testResults ?? []) {
    const filePath = testResult.name ?? '(unknown file)';
    for (const assertion of testResult.assertionResults ?? []) {
      if (assertion.status !== 'failed') continue;
      const title = assertion.fullName ?? assertion.title ?? '(unnamed test)';
      const evidence = joinFailures(assertion.failureMessages);
      findings.push({
        ruleId: 'vitest:test-failed',
        severity: 'CRITICAL',
        category: 'toolchain',
        location: { file: filePath },
        evidence,
        message: `Vitest test failed: \`${title}\``,
        source: { kind: 'toolchain', tool: 'test', nativeRuleId: 'test-failed' },
      });
    }
  }
  return { findings, count: report.numFailedTests ?? findings.length };
};
