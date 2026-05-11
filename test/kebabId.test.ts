import { describe, expect, it } from 'vitest';
import { KebabId } from '../schemas/_id.js';

describe('KebabId', () => {
  it('accepts a simple kebab id', () => {
    expect(KebabId.parse('foo-bar')).toBe('foo-bar');
  });

  it('accepts dot-namespaced kebab ids', () => {
    expect(KebabId.parse('lane.test-writer.forbidden-app-files')).toBe(
      'lane.test-writer.forbidden-app-files',
    );
  });

  it('accepts ids that start with a single letter', () => {
    expect(KebabId.parse('a')).toBe('a');
  });

  it('rejects the empty string', () => {
    expect(() => KebabId.parse('')).toThrow();
  });

  it('rejects ids starting with a digit', () => {
    expect(() => KebabId.parse('1foo')).toThrow();
  });

  it('rejects ids with uppercase letters', () => {
    expect(() => KebabId.parse('Foo')).toThrow();
  });

  it('rejects ids with underscores', () => {
    expect(() => KebabId.parse('foo_bar')).toThrow();
  });

  it('rejects ids with consecutive dots', () => {
    expect(() => KebabId.parse('foo..bar')).toThrow();
  });

  it('rejects ids ending with a dot', () => {
    expect(() => KebabId.parse('foo.')).toThrow();
  });

  it('rejects ids starting with a dot', () => {
    expect(() => KebabId.parse('.foo')).toThrow();
  });
});
