import { compilePatterns } from '../src/glob.js';
import type { Constitution, Rule, Scope } from '../src/schemas.js';
import type { ChangedFile, VerifyContext } from '../src/source/types.js';

export function patternRule(id: string, overrides: Partial<Rule> = {}): Rule {
  return {
    kind: 'pattern',
    id,
    category: 'custom',
    defaultSeverity: 'CRITICAL',
    description: `rule ${id}`,
    pattern: /TODO/,
    forbidden: true,
    inGlob: '**/*',
    prompt: { summary: `summary ${id}`, guidance: `guidance ${id}` },
    ...overrides,
  } as Rule;
}

export function laneRule(): Rule {
  return {
    kind: 'lane',
    id: 'lane.editable-respected',
    category: 'lane',
    defaultSeverity: 'CRITICAL',
    description: 'lane',
    flagDeletions: true,
    prompt: { summary: 'stay in lane', guidance: 'do not touch files outside scope.editable' },
  };
}

export function scope(role: string, overrides: Partial<Scope> = {}): Scope {
  return {
    goal: 'g',
    editable: ['**/*'],
    role,
    ...overrides,
  };
}

export function changed(
  path: string,
  content: string,
  status: ChangedFile['status'] = 'modified',
): ChangedFile {
  return { path, content, status };
}

export function singleRuleConfig(id: string, overrides: Partial<Rule> = {}): Constitution {
  return { rules: [patternRule(id, overrides)] };
}

/** Shared VerifyContext builder used by tests that drive rule-kind checkers directly. */
export function ctx(overrides: Partial<VerifyContext> = {}): VerifyContext {
  return {
    changedFiles: [],
    editableMatcher: compilePatterns(['**/*']),
    scope: { goal: '', editable: ['**/*'], role: 'free-form', expectations: {} },
    artifacts: {},
    toolchainResults: {},
    customChecks: {},
    exceptionRegistry: {},
    ...overrides,
  };
}
