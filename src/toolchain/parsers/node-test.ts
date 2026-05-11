import type { Finding } from '../../schemas.js';
import type { Parser, ParsedToolchainResult } from './types.js';
import type { RunResult } from '../run.js';

interface TapTest {
  ok: boolean;
  name: string;
  file?: string;
  diagnostic?: string;
}

const NOT_OK_LINE = /^not ok\s+\d+\s+-\s+(?<name>.+)$/;
const FILE_DIAG = /^\s*file:\s*'?(?<file>.+?)'?\s*$/;
const ERROR_LINE = /^\s*(?:error:|message:|failureType:)\s*(?<err>.+)$/;

/**
 * Parse Node's TAP test output (`node --test --test-reporter=tap`). The
 * parser is intentionally permissive — a slightly malformed line shouldn't
 * cost the whole report. Failures are recognized by `not ok` lines and
 * any subsequent YAML-ish diagnostic block until the next `ok|not ok`.
 */
function parseTapBlocks(text: string): TapTest[] {
  const lines = text.split('\n');
  const tests: TapTest[] = [];
  let current: TapTest | undefined;
  for (const raw of lines) {
    const line = raw;
    const notOk = NOT_OK_LINE.exec(line.trim());
    if (notOk?.groups?.name !== undefined) {
      if (current) tests.push(current);
      current = { ok: false, name: notOk.groups.name };
      continue;
    }
    if (line.trim().startsWith('ok ')) {
      if (current) {
        tests.push(current);
        current = undefined;
      }
      continue;
    }
    if (current) {
      const fileMatch = FILE_DIAG.exec(line);
      if (fileMatch?.groups?.file !== undefined) {
        current.file = fileMatch.groups.file;
        continue;
      }
      const errMatch = ERROR_LINE.exec(line);
      if (errMatch?.groups?.err !== undefined) {
        current.diagnostic = current.diagnostic
          ? `${current.diagnostic}\n${errMatch.groups.err}`
          : errMatch.groups.err;
      }
    }
  }
  if (current) tests.push(current);
  return tests.filter((t) => !t.ok);
}

export const parseNodeTest: Parser = (result: RunResult): ParsedToolchainResult => {
  const tests = parseTapBlocks(result.stdout);
  const findings: Finding[] = tests.map((t) => ({
    ruleId: 'node-test:test-failed',
    severity: 'CRITICAL',
    category: 'toolchain',
    ...(t.file === undefined ? {} : { location: { file: t.file } }),
    evidence: t.diagnostic ?? '(no diagnostic message captured)',
    message: `node:test failed: \`${t.name}\``,
    source: { kind: 'toolchain', tool: 'test', nativeRuleId: 'test-failed' },
  }));
  return { findings, count: findings.length };
};
