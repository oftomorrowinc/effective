import { describe, expect, it } from 'vitest';
import { checkLane } from '../src/rules/kinds/lane.js';
import { compilePatterns } from '../src/glob.js';
import type { LaneRule } from '../src/schemas.js';
import type { ChangedFile, VerifyContext } from '../src/source/types.js';

function rule(overrides: Partial<LaneRule> = {}): LaneRule {
  return {
    kind: 'lane',
    id: 'lane.editable-respected',
    category: 'lane',
    defaultSeverity: 'CRITICAL',
    description: 'Lane test',
    flagDeletions: true,
    prompt: { summary: 'Stay in lane.', guidance: 'Only touch files in scope.editable.' },
    ...overrides,
  };
}

function ctx(editable: string[], files: ChangedFile[]): VerifyContext {
  return {
    changedFiles: files,
    editableMatcher: compilePatterns(editable),
    scope: {
      goal: '',
      editable,
      role: 'code-writer',
      expectations: {},
    },
    artifacts: {},
    toolchainResults: {},
    customChecks: {},
    exceptionRegistry: {},
  };
}

function file(path: string, status: ChangedFile['status'] = 'modified', content = ''): ChangedFile {
  return { path, content, status };
}

describe('checkLane', () => {
  it('passes when every file is in the editable lane', () => {
    const findings = checkLane(
      rule(),
      ctx(['app/**', 'lib/**'], [file('app/api.ts'), file('lib/util.ts')]),
    );
    expect(findings).toEqual([]);
  });

  it('flags files outside the lane', () => {
    const findings = checkLane(
      rule(),
      ctx(['app/**'], [file('app/api.ts'), file('test/api.test.ts')]),
    );
    expect(findings.length).toBe(1);
    expect(findings[0]?.location?.file).toBe('test/api.test.ts');
    expect(findings[0]?.severity).toBe('CRITICAL');
  });

  it('respects negated editable globs (lane carve-out)', () => {
    const findings = checkLane(
      rule(),
      ctx(['app/**', '!app/legacy/**'], [file('app/api.ts'), file('app/legacy/old.ts')]),
    );
    expect(findings.length).toBe(1);
    expect(findings[0]?.location?.file).toBe('app/legacy/old.ts');
  });

  it('flags deletions outside the lane when flagDeletions=true', () => {
    const findings = checkLane(
      rule({ flagDeletions: true }),
      ctx(['app/**'], [file('test/old.test.ts', 'deleted')]),
    );
    expect(findings.length).toBe(1);
    expect(findings[0]?.evidence).toMatch(/Deleted/);
  });

  it('ignores deletions outside the lane when flagDeletions=false', () => {
    const findings = checkLane(
      rule({ flagDeletions: false }),
      ctx(['app/**'], [file('test/old.test.ts', 'deleted')]),
    );
    expect(findings).toEqual([]);
  });

  it('exempts paths listed in alwaysAllow', () => {
    const findings = checkLane(
      rule({ alwaysAllow: ['tasks/**'] }),
      ctx(['app/**'], [file('tasks/step-1.md'), file('test/foo.test.ts')]),
    );
    expect(findings.length).toBe(1);
    expect(findings[0]?.location?.file).toBe('test/foo.test.ts');
  });

  it('handles the read-only (empty editable) case clearly', () => {
    const findings = checkLane(rule(), ctx([], [file('any.ts')]));
    expect(findings.length).toBe(1);
    expect(findings[0]?.message).toMatch(/read-only scope/);
  });
});
