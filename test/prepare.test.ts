import { describe, expect, it } from 'vitest';
import { prepare } from '../src/prepare.js';
import { patternRule } from './_helpers.js';
import type { Constitution, Scope } from '../src/schemas.js';

describe('prepare', () => {
  const baseConfig: Constitution = {
    rules: [patternRule('no-todo'), patternRule('no-foo')],
  };

  it('includes goal, original prompt, role, editable, expectations, rules, time-commitment statement', () => {
    const scope: Scope = {
      goal: 'Add a rate limiter to /api/signals',
      editable: ['app/api/signals/**'],
      role: 'code-writer',
    };
    const out = prepare({ scope, config: baseConfig, original: 'Please add the rate limiter.' });
    expect(out).toContain('Add a rate limiter to /api/signals');
    expect(out).toContain('Please add the rate limiter.');
    expect(out).toContain('Role: `code-writer`');
    expect(out).toContain('app/api/signals/**');
    expect(out).toContain('allTestsPass');
    expect(out).toContain('no-todo');
    expect(out).toContain('no-foo');
    expect(out).toContain('CRITICAL');
    expect(out).toContain('Honest failure with a diagnostic');
  });

  it('reports an empty editable lane clearly', () => {
    const scope: Scope = { goal: 'review changes', editable: [], role: 'reviewer' };
    const out = prepare({ scope, config: baseConfig, original: 'Review what we have.' });
    expect(out).toContain('read-only scope');
  });

  it('selects only related rules when scope.relatedRules is set', () => {
    const scope: Scope = {
      goal: 'focused task',
      editable: ['**/*'],
      role: 'free-form',
      relatedRules: ['no-todo'],
    };
    const out = prepare({ scope, config: baseConfig, original: 'focus on TODOs' });
    expect(out).toContain('no-todo');
    expect(out).not.toContain('no-foo');
  });

  it('surfaces examples when a rule supplies them', () => {
    const config: Constitution = {
      rules: [
        patternRule('demo', {
          prompt: {
            summary: 's',
            guidance: 'g',
            examples: { bad: 'oldThing.warn()', good: 'logger.warn()' },
          },
        }),
      ],
    };
    const scope: Scope = { goal: 'g', editable: ['**/*'], role: 'free-form' };
    const out = prepare({ scope, config, original: 'noop' });
    expect(out).toContain('Avoid:');
    expect(out).toContain('oldThing.warn()');
    expect(out).toContain('Prefer:');
    expect(out).toContain('logger.warn()');
  });

  it('surfaces a deliverable line when scope.deliverable is set', () => {
    const scope: Scope = {
      goal: 'g',
      editable: ['**/*'],
      role: 'free-form',
      deliverable: 'Rate limiter active and tested',
    };
    const out = prepare({ scope, config: baseConfig, original: 'do it' });
    expect(out).toContain('**Deliverable:** Rate limiter active and tested');
  });

  it('surfaces a spec reference when scope.spec is set', () => {
    const scope: Scope = {
      goal: 'g',
      editable: ['test/**'],
      role: 'test-writer',
      spec: 'docs/spec.md',
    };
    const out = prepare({ scope, config: baseConfig, original: 'write tests' });
    expect(out).toContain('Spec reference: `docs/spec.md`');
  });

  it('handles an empty rule set gracefully', () => {
    const out = prepare({
      scope: { goal: 'g', editable: ['**/*'], role: 'free-form' },
      config: { rules: [patternRule('placeholder')], disable: { placeholder: 'demo' } },
      original: 'demo',
    });
    expect(out).toContain('constitution is empty');
  });
});
