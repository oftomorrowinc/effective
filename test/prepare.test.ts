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
    const { prompt } = prepare({
      scope,
      config: baseConfig,
      original: 'Please add the rate limiter.',
    });
    expect(prompt).toContain('Add a rate limiter to /api/signals');
    expect(prompt).toContain('Please add the rate limiter.');
    expect(prompt).toContain('Role: `code-writer`');
    expect(prompt).toContain('app/api/signals/**');
    expect(prompt).toContain('allTestsPass');
    expect(prompt).toContain('no-todo');
    expect(prompt).toContain('no-foo');
    expect(prompt).toContain('CRITICAL');
    expect(prompt).toContain('Honest failure with a diagnostic');
  });

  it('reports an empty editable lane clearly', () => {
    const scope: Scope = { goal: 'review changes', editable: [], role: 'reviewer' };
    const { prompt } = prepare({ scope, config: baseConfig, original: 'Review what we have.' });
    expect(prompt).toContain('read-only scope');
  });

  it('selects only related rules when scope.relatedRules is set', () => {
    const scope: Scope = {
      goal: 'focused task',
      editable: ['**/*'],
      role: 'free-form',
      relatedRules: ['no-todo'],
    };
    const { prompt } = prepare({ scope, config: baseConfig, original: 'focus on TODOs' });
    expect(prompt).toContain('no-todo');
    expect(prompt).not.toContain('no-foo');
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
    const { prompt } = prepare({ scope, config, original: 'noop' });
    expect(prompt).toContain('Avoid:');
    expect(prompt).toContain('oldThing.warn()');
    expect(prompt).toContain('Prefer:');
    expect(prompt).toContain('logger.warn()');
  });

  it('surfaces a deliverable line when scope.deliverable is set', () => {
    const scope: Scope = {
      goal: 'g',
      editable: ['**/*'],
      role: 'free-form',
      deliverable: 'Rate limiter active and tested',
    };
    const { prompt } = prepare({ scope, config: baseConfig, original: 'do it' });
    expect(prompt).toContain('**Deliverable:** Rate limiter active and tested');
  });

  it('surfaces a spec reference when scope.spec is set', () => {
    const scope: Scope = {
      goal: 'g',
      editable: ['test/**'],
      role: 'test-writer',
      spec: 'docs/spec.md',
    };
    const { prompt } = prepare({ scope, config: baseConfig, original: 'write tests' });
    expect(prompt).toContain('Spec reference: `docs/spec.md`');
  });

  it('handles an empty rule set gracefully', () => {
    const { prompt } = prepare({
      scope: { goal: 'g', editable: ['**/*'], role: 'free-form' },
      config: { rules: [patternRule('placeholder')], disable: { placeholder: 'demo' } },
      original: 'demo',
    });
    expect(prompt).toContain('constitution is empty');
  });

  it("mode: 'concise' emits rule summaries only — no guidance, no examples, no checklist", () => {
    const config: Constitution = {
      rules: [
        patternRule('demo', {
          prompt: {
            summary: 'one-line gist of the rule',
            guidance: 'Detailed guidance the agent should internalize.',
            examples: { bad: 'oldThing.warn()', good: 'logger.warn()' },
          },
        }),
      ],
    };
    const full = prepare({
      scope: { goal: 'g', editable: ['**/*'], role: 'free-form' },
      config,
      original: 'do it',
      mode: 'full',
    });
    const concise = prepare({
      scope: { goal: 'g', editable: ['**/*'], role: 'free-form' },
      config,
      original: 'do it',
      mode: 'concise',
    });

    // Concise must include the summary + role + editable + verification footer.
    expect(concise.prompt).toContain('one-line gist of the rule');
    expect(concise.prompt).toContain('demo');
    expect(concise.prompt).toContain('Role:');
    expect(concise.prompt).toContain('Editable files');
    expect(concise.prompt).toContain('How verification will run');

    // Concise must NOT include the full guidance, the examples, or the
    // per-rule checklist that full mode emits.
    expect(concise.prompt).not.toContain('Detailed guidance the agent should internalize.');
    expect(concise.prompt).not.toContain('oldThing.warn()');
    expect(concise.prompt).not.toContain('logger.warn()');
    expect(concise.prompt).not.toContain('Avoid:');
    expect(concise.prompt).not.toContain('Prefer:');

    // Sanity: concise output is materially shorter than full.
    expect(concise.prompt.length).toBeLessThan(full.prompt.length);
    expect(concise.mode).toBe('concise');
    expect(full.mode).toBe('full');
  });

  it("default mode is 'full' for backwards compatibility", () => {
    const out = prepare({
      scope: { goal: 'g', editable: ['**/*'], role: 'free-form' },
      config: baseConfig,
      original: 'do it',
    });
    expect(out.mode).toBe('full');
  });

  it('returns scope + config alongside the prompt for spreading into verify()', () => {
    const scope: Scope = { goal: 'g', editable: ['src/**'], role: 'code-writer' };
    const config: Constitution = baseConfig;
    const prepared = prepare({ scope, config, original: 'do it' });
    expect(prepared.scope).toBe(scope);
    expect(prepared.config).toBe(config);
  });
});
