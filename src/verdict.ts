import type { Finding, Verdict } from './schemas.js';

/**
 * Pure verdict computation.
 *
 * Rules:
 *   - Any CRITICAL finding → 'fail'
 *   - Otherwise, any LLM-review finding → 'needs-review'
 *   - Otherwise → 'pass'
 *
 * The two-step structure encodes the design intent: deterministic rules and
 * toolchain findings are objective and fail the verdict at CRITICAL; LLM
 * review findings are advisory and surface as a needs-review verdict that
 * the user can choose to act on without blocking the build.
 */
export function computeVerdict(findings: readonly Finding[]): Verdict {
  let hasReview = false;
  for (const finding of findings) {
    if (finding.severity === 'CRITICAL') return 'fail';
    if (finding.source.kind === 'llm-review') hasReview = true;
  }
  return hasReview ? 'needs-review' : 'pass';
}

export interface FindingSummary {
  critical: number;
  high: number;
  med: number;
  low: number;
  total: number;
}

/**
 * Aggregate findings by severity for ergonomic dashboard rendering. The
 * totals correspond 1:1 with the VerifyResult.summary schema in schemas/finding.
 */
export function summarizeFindings(findings: readonly Finding[]): FindingSummary {
  const summary: FindingSummary = { critical: 0, high: 0, med: 0, low: 0, total: 0 };
  for (const finding of findings) {
    summary.total += 1;
    switch (finding.severity) {
      case 'CRITICAL': {
        summary.critical += 1;
        break;
      }
      case 'HIGH': {
        summary.high += 1;
        break;
      }
      case 'MED': {
        summary.med += 1;
        break;
      }
      case 'LOW': {
        summary.low += 1;
        break;
      }
    }
  }
  return summary;
}
