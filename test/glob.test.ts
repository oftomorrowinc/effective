import { describe, expect, it } from 'vitest';
import { compilePatterns } from '../src/glob.js';

describe('compilePatterns', () => {
  it('matches a single glob include', () => {
    const m = compilePatterns(['app/**']);
    expect(m('app/api/handler.ts')).toBe(true);
    expect(m('lib/util.ts')).toBe(false);
  });

  it('matches across multiple includes', () => {
    const m = compilePatterns(['app/**', 'lib/**']);
    expect(m('app/api/handler.ts')).toBe(true);
    expect(m('lib/rate-limit.ts')).toBe(true);
    expect(m('test/handler.test.ts')).toBe(false);
  });

  it('excludes negated paths even when included', () => {
    const m = compilePatterns(['app/**', '!app/legacy/**']);
    expect(m('app/api/handler.ts')).toBe(true);
    expect(m('app/legacy/old.ts')).toBe(false);
  });

  it('returns false when no patterns are provided', () => {
    const m = compilePatterns([]);
    expect(m('anything.ts')).toBe(false);
  });

  it('returns false when only negations are provided', () => {
    const m = compilePatterns(['!everywhere/**']);
    expect(m('anywhere.ts')).toBe(false);
  });

  it('normalizes backslashes to forward slashes', () => {
    const m = compilePatterns(['app/**']);
    expect(m(String.raw`app\api\handler.ts`)).toBe(true);
  });

  it('strips leading slashes before matching', () => {
    const m = compilePatterns(['app/**']);
    expect(m('/app/api/handler.ts')).toBe(true);
  });

  it('ignores empty and whitespace-only patterns', () => {
    const m = compilePatterns(['', '   ', 'app/**']);
    expect(m('app/x.ts')).toBe(true);
    expect(m('other/x.ts')).toBe(false);
  });

  it('respects negation order independence (negations always win)', () => {
    const a = compilePatterns(['!app/legacy/**', 'app/**']);
    const b = compilePatterns(['app/**', '!app/legacy/**']);
    expect(a('app/legacy/old.ts')).toBe(false);
    expect(b('app/legacy/old.ts')).toBe(false);
    expect(a('app/new.ts')).toBe(true);
    expect(b('app/new.ts')).toBe(true);
  });

  it('matches dotfiles with `dot: true` semantics', () => {
    const m = compilePatterns(['**/*']);
    expect(m('.eslintrc')).toBe(true);
    expect(m('src/.env')).toBe(true);
  });

  it('matches exact filenames', () => {
    const m = compilePatterns(['package.json']);
    expect(m('package.json')).toBe(true);
    expect(m('src/package.json')).toBe(false);
  });
});
