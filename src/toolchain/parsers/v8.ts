import { parseTrailingJson } from './_json-start.js';
import type { Finding } from '../../schemas.js';
import type { Parser, ParsedToolchainResult } from './types.js';
import type { RunResult } from '../run.js';

interface CoverageMetric {
  pct?: number;
  total?: number;
  covered?: number;
}

interface CoverageEntry {
  lines?: CoverageMetric;
  statements?: CoverageMetric;
  functions?: CoverageMetric;
  branches?: CoverageMetric;
}

type CoverageSummary = Record<string, CoverageEntry>;

const COVERAGE_THRESHOLD = 90;

function checkMetric(name: keyof CoverageEntry, entry: CoverageEntry | undefined): Finding[] {
  if (!entry) return [];
  const metric = entry[name];
  if (metric?.pct === undefined) return [];
  if (metric.pct >= COVERAGE_THRESHOLD) return [];
  return [
    {
      ruleId: `coverage:${name}-below-threshold`,
      severity: 'HIGH',
      category: 'toolchain',
      evidence: `${name} coverage ${metric.pct.toFixed(2)}% < ${String(COVERAGE_THRESHOLD)}%`,
      message: `Coverage for ${name} (${metric.pct.toFixed(2)}%) does not meet the ${String(COVERAGE_THRESHOLD)}% threshold.`,
      source: {
        kind: 'toolchain',
        tool: 'coverage',
        nativeRuleId: `${name}-below-threshold`,
      },
    },
  ];
}

/**
 * v8 / c8 / istanbul / nyc all emit `coverage-summary.json` in the same
 * shape — they descend from the original istanbul format. One parser
 * covers them all. `parseIstanbul` is a re-exported alias in the public API.
 */
export const parseV8: Parser = (result: RunResult): ParsedToolchainResult => {
  const summary = parseTrailingJson(result.stdout) as CoverageSummary | undefined;
  if (!summary) return { findings: [], count: 0 };
  const total = summary.total;
  const findings: Finding[] = [
    ...checkMetric('lines', total),
    ...checkMetric('statements', total),
    ...checkMetric('functions', total),
    ...checkMetric('branches', total),
  ];
  return { findings, count: findings.length };
};
