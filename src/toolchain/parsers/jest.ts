import { parseVitest } from './vitest.js';
import type { Parser } from './types.js';

/**
 * Jest's `--json` output shape is the same as Vitest's — they both
 * descend from the original Jest reporter. Reusing the parser keeps
 * behavior aligned. Findings are tagged differently (jest:test-failed
 * vs vitest:test-failed) only by convention; for runtime purposes the
 * two are interchangeable.
 */
export const parseJest: Parser = (result) => {
  const parsed = parseVitest(result);
  return {
    ...(parsed.count === undefined ? {} : { count: parsed.count }),
    findings: parsed.findings.map((f) => ({
      ...f,
      ruleId: f.ruleId.replace(/^vitest:/, 'jest:'),
      message: f.message.replace(/^Vitest /, 'Jest '),
    })),
  };
};
