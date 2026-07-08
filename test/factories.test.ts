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

describe('rule factories — option-arm coverage', () => {
  it('rule.requirePattern with a RegExp defaults severity, glob, and guidance wording', () => {
    const r = rule.requirePattern(/Copyright/);
    expect(r.forbidden).toBe(false);
    expect(r.defaultSeverity).toBe('HIGH');
    expect(r.description).toBe('Required pattern `Copyright`');
    expect(r.prompt.guidance).toBe(
      'Every file matching **/* must contain a match for `Copyright`.',
    );
    expect(r.inGlob).toBe('**/*');
  });

  it('rule.requirePattern with a plain string names the caller-supplied glob in guidance', () => {
    const r = rule.requirePattern('use strict', { in: 'src/**/*.ts' });
    expect(r.description).toBe('Required pattern `use strict`');
    expect(r.prompt.guidance).toBe(
      'Every file matching src/**/*.ts must contain a match for `use strict`.',
    );
    expect(r.inGlob).toBe('src/**/*.ts');
  });

  it('rule.forbidPattern guidance names the caller-supplied glob', () => {
    const r = rule.forbidPattern(/debugger/, { in: 'src/**' });
    expect(r.prompt.guidance).toBe('Do not introduce matches for `debugger` in src/**.');
  });

  it('rule.lane defaults: id, flagDeletions true, no alwaysAllow key', () => {
    const r = rule.lane();
    expect(r.id).toBe('lane.editable-respected');
    expect(r.flagDeletions).toBe(true);
    expect('alwaysAllow' in r).toBe(false);
  });

  it('rule.lane honors flagDeletions: false', () => {
    const r = rule.lane({ flagDeletions: false });
    expect(r.flagDeletions).toBe(false);
  });

  it('rule.spec keeps a caller-supplied id', () => {
    const r = rule.spec({ check: 'assertions-not-narrowed', id: 'spec.no-weakened-asserts' });
    expect(r.id).toBe('spec.no-weakened-asserts');
    expect(r.check).toBe('assertions-not-narrowed');
  });

  it('rule.toolchain with tool=custom and no name throws', () => {
    expect(() => rule.toolchain({ tool: 'custom', failOn: 'non-zero-exit' })).toThrow(
      /require a `name`/,
    );
  });

  it('rule.toolchain with tool=custom and a name derives a dotted id and carries the name', () => {
    const r = rule.toolchain({ tool: 'custom', name: 'coverage-gate', failOn: 'non-zero-exit' });
    expect(r.id).toBe('toolchain.custom.coverage-gate');
    expect(r.name).toBe('coverage-gate');
  });

  it('rule.toolchain keeps a caller-supplied id', () => {
    const r = rule.toolchain({ tool: 'lint', failOn: 'count-non-zero', id: 'toolchain.strict' });
    expect(r.id).toBe('toolchain.strict');
  });

  it('rule.custom falls back to category custom, severity HIGH, and the prompt summary', () => {
    const r = rule.custom({
      id: 'bare-check',
      checkRef: 'bareCheck',
      prompt: { summary: 'the summary', guidance: 'g' },
    });
    expect(r.category).toBe('custom');
    expect(r.defaultSeverity).toBe('HIGH');
    expect(r.description).toBe('the summary');
  });
});
