import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/cli/args.js';

describe('parseArgs', () => {
  it('returns nothing for an empty argv', () => {
    const r = parseArgs([]);
    expect(r.subcommand).toBeUndefined();
    expect(r.options).toEqual({});
    expect([...r.flags]).toEqual([]);
    expect(r.positional).toEqual([]);
  });

  it('captures the first non-flag token as the subcommand', () => {
    expect(parseArgs(['verify']).subcommand).toBe('verify');
    expect(parseArgs(['init', '--force']).subcommand).toBe('init');
  });

  it('parses --key value as an option', () => {
    const r = parseArgs(['verify', '--work', 'feature', '--baseline', 'main']);
    expect(r.options).toEqual({ work: 'feature', baseline: 'main' });
  });

  it('parses --key=value as an option', () => {
    const r = parseArgs(['verify', '--reporter=json']);
    expect(r.options).toEqual({ reporter: 'json' });
  });

  it('treats lone --flag (no value, or followed by another flag) as a bare flag', () => {
    const r = parseArgs(['verify', '--staged', '--reporter', 'json']);
    expect(r.flags.has('staged')).toBe(true);
    expect(r.options).toEqual({ reporter: 'json' });
  });

  it('expands short forms via shortFlagName', () => {
    const r = parseArgs(['-v']);
    expect(r.flags.has('version')).toBe(true);
  });

  it('treats --help and --version as bare flags even when followed by a value', () => {
    const r = parseArgs(['-h', 'verify']);
    expect(r.flags.has('help')).toBe(true);
    expect(r.subcommand).toBe('verify');
  });

  it('keeps tokens after `--` as positional regardless of dashes', () => {
    const r = parseArgs(['verify', '--', '--not-a-flag', 'something']);
    expect(r.positional).toEqual(['--not-a-flag', 'something']);
  });

  it('collects extra non-flag tokens after the subcommand as positional', () => {
    const r = parseArgs(['rules', 'pattern.no-todo']);
    expect(r.subcommand).toBe('rules');
    expect(r.positional).toEqual(['pattern.no-todo']);
  });

  it('handles short alias for work/baseline/config/reporter', () => {
    const r = parseArgs(['verify', '-w', 'feature', '-b', 'main', '-r', 'pretty', '-c', 'cfg.ts']);
    expect(r.options).toEqual({
      work: 'feature',
      baseline: 'main',
      reporter: 'pretty',
      config: 'cfg.ts',
    });
  });

  it('groups short flags like `-sv` as a bare-flag set', () => {
    const r = parseArgs(['-sv']);
    expect(r.flags.has('staged')).toBe(true);
    expect(r.flags.has('version')).toBe(true);
  });
});
