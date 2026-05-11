import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { rule } from '../src/rules/factories.js';

describe('rule factories — full coverage', () => {
  it('rule.spec builds a SpecRule with the right check', () => {
    const r = rule.spec({ check: 'test-names-land-verbatim' });
    expect(r.kind).toBe('spec');
    expect(r.check).toBe('test-names-land-verbatim');
    expect(r.id).toBe('spec.test-names-land-verbatim');
  });

  it('rule.spec generates different guidance per check kind', () => {
    expect(rule.spec({ check: 'assertions-not-narrowed' }).prompt.guidance).toMatch(
      /weaker than the spec/,
    );
    expect(rule.spec({ check: 'no-extra-tests-claiming-spec' }).prompt.guidance).toMatch(
      /must not claim to satisfy/,
    );
  });

  it('rule.schema builds a SchemaRule with the supplied Zod schema', () => {
    const Frontmatter = z.object({ id: z.string() });
    const r = rule.schema({
      id: 'schema.frontmatter',
      appliesTo: 'spec.frontmatter',
      schema: Frontmatter,
      prompt: { summary: 's', guidance: 'g' },
    });
    expect(r.kind).toBe('schema');
    expect(r.appliesTo).toBe('spec.frontmatter');
  });

  it('rule.custom honors caller-supplied category and severity', () => {
    const r = rule.custom({
      id: 'my-check',
      category: 'architecture',
      defaultSeverity: 'MED',
      checkRef: 'myCheck',
      prompt: { summary: 's', guidance: 'g' },
    });
    expect(r.category).toBe('architecture');
    expect(r.defaultSeverity).toBe('MED');
  });

  it('rule.toolchain.tool=lint builds a standard toolchain rule', () => {
    const r = rule.toolchain({ tool: 'lint', failOn: 'count-non-zero' });
    expect(r.kind).toBe('toolchain');
    expect(r.tool).toBe('lint');
    expect(r.failOn).toBe('count-non-zero');
  });

  it('rule.forbidPattern with a plain string falls back to a defaulted id', () => {
    const r = rule.forbidPattern('TODO');
    expect(r.kind).toBe('pattern');
    expect(r.id).toBe('forbid.todo');
  });

  it('rule.forbidPattern keeps a caller-supplied id', () => {
    const r = rule.forbidPattern(/console\.log/, { id: 'no-console' });
    expect(r.id).toBe('no-console');
  });

  it('rule.lane carries caller-supplied alwaysAllow', () => {
    const r = rule.lane({ alwaysAllow: ['tasks/**'] });
    expect(r.alwaysAllow).toEqual(['tasks/**']);
  });

  it('factories with prompt.examples preserve them via withDefaults', () => {
    const r = rule.forbidPattern(/x/, {
      prompt: { examples: { bad: 'oldThing.warn()', good: 'logger.warn()' } },
    });
    expect(r.prompt.examples?.bad).toBe('oldThing.warn()');
    expect(r.prompt.examples?.good).toBe('logger.warn()');
  });

  it('factories pass catalogueEntry + relatedPrinciple defaults through', () => {
    const r = rule.forbidPattern(/x/, {
      catalogueEntry: 'tests-skipped-under-pressure',
      relatedPrinciple: 'mechanical-enforcement-over-instruction',
    });
    expect(r.catalogueEntry).toBe('tests-skipped-under-pressure');
    expect(r.relatedPrinciple).toBe('mechanical-enforcement-over-instruction');
  });

  it('patternId fallback produces a sane id for pattern with no alphanumerics', () => {
    const r = rule.forbidPattern(/!!!/);
    expect(r.id).toBe('forbid.unnamed');
  });
});
