import { describe, expect, it } from 'vitest';
import { verify } from '../src/verify.js';
import type { InlineSource } from '../src/source/inline.js';
import { changed, scope } from './_helpers.js';

function testFile(content: string, path = 'test/a.test.ts'): InlineSource {
  return { kind: 'inline', changedFiles: [changed(path, content)] };
}

const RULE_ID = 'no-disabled-tests-without-exception';

describe('no-disabled-tests-without-exception (CustomRule)', () => {
  it('flags `.skip` without an exception-id annotation', async () => {
    const result = await verify({
      scope: scope('test-writer'),
      config: { extends: ['recommended'] },
      source: testFile("it.skip('flaky', () => {});"),
    });
    expect(result.findings.some((f) => f.ruleId === RULE_ID)).toBe(true);
  });

  it('flags `.todo`, `xit`, and `xdescribe` without annotations', async () => {
    for (const shape of [
      "it.todo('not yet')",
      "xit('legacy', () => {})",
      "xdescribe('legacy block', () => {})",
      "test.skip('flaky', () => {})",
      "describe.skip('block', () => {})",
    ]) {
      const result = await verify({
        scope: scope('test-writer'),
        config: { extends: ['recommended'] },
        source: testFile(`${shape};`),
      });
      expect(
        result.findings.some((f) => f.ruleId === RULE_ID),
        `should flag: ${shape}`,
      ).toBe(true);
    }
  });

  it('does NOT flag when the same line carries an exception-id annotation', async () => {
    const result = await verify({
      scope: scope('test-writer'),
      config: { extends: ['recommended'] },
      source: testFile(
        "it.skip('flaky', () => {}); // exception-id: tests.flaky-concurrent-writes",
      ),
    });
    expect(result.findings.some((f) => f.ruleId === RULE_ID)).toBe(false);
  });

  it('does NOT flag when the preceding line carries an exception-id annotation', async () => {
    const result = await verify({
      scope: scope('test-writer'),
      config: { extends: ['recommended'] },
      source: testFile(
        '// exception-id: tests.flaky-concurrent-writes\n' + "it.skip('flaky', () => {});\n",
      ),
    });
    expect(result.findings.some((f) => f.ruleId === RULE_ID)).toBe(false);
  });

  it('does NOT flag when the following line carries the annotation', async () => {
    const result = await verify({
      scope: scope('test-writer'),
      config: { extends: ['recommended'] },
      source: testFile(
        "it.skip('flaky', () => {});\n// exception-id: tests.flaky-concurrent-writes",
      ),
    });
    expect(result.findings.some((f) => f.ruleId === RULE_ID)).toBe(false);
  });

  it('only one finding per disable, not one per `.skip` token in the file', async () => {
    const result = await verify({
      scope: scope('test-writer'),
      config: { extends: ['recommended'] },
      source: testFile("it.skip('a', () => {});\nit.skip('b', () => {});\nit.skip('c', () => {});"),
    });
    expect(result.findings.filter((f) => f.ruleId === RULE_ID)).toHaveLength(3);
  });

  it('mixed file: only the unannotated disables are flagged', async () => {
    const result = await verify({
      scope: scope('test-writer'),
      config: { extends: ['recommended'] },
      source: testFile(
        "it('a passes', () => {});\n" +
          '// exception-id: tests.flaky-1\n' +
          "it.skip('annotated', () => {});\n" +
          "it.skip('unannotated', () => {});\n",
      ),
    });
    const findings = result.findings.filter((f) => f.ruleId === RULE_ID);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.evidence).toContain('unannotated');
  });

  it('only scans test files — non-test source with `.skip` is ignored', async () => {
    const result = await verify({
      scope: scope('test-writer'),
      config: { extends: ['recommended'] },
      source: testFile(
        // `.skip` here looks like the test-disable pattern but the file
        // is not a test file by extension.
        'export const x = it.skip;\n',
        'src/lib.ts',
      ),
    });
    expect(result.findings.some((f) => f.ruleId === RULE_ID)).toBe(false);
  });

  it('does not apply to the reviewer role', async () => {
    const result = await verify({
      scope: scope('reviewer', { editable: [] }),
      config: { extends: ['recommended'] },
      source: testFile("it.skip('x', () => {});"),
    });
    expect(result.findings.some((f) => f.ruleId === RULE_ID)).toBe(false);
  });

  it('records line/column location for the finding', async () => {
    const result = await verify({
      scope: scope('test-writer'),
      config: { extends: ['recommended'] },
      source: testFile("describe('a', () => {\n  it.skip('x', () => {});\n});\n"),
    });
    const finding = result.findings.find((f) => f.ruleId === RULE_ID);
    expect(finding?.location?.file).toBe('test/a.test.ts');
    expect(finding?.location?.line).toBe(2);
  });

  it('fails the verdict at CRITICAL', async () => {
    const result = await verify({
      scope: scope('test-writer'),
      config: { extends: ['recommended'] },
      source: testFile("it.skip('flaky', () => {});"),
    });
    expect(result.verdict).toBe('fail');
  });
});
