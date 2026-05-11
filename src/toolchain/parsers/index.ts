import type { Constitution } from '../../schemas.js';
import { parseEslint } from './eslint.js';
import { parseJest } from './jest.js';
import { parseNodeTest } from './node-test.js';
import { parseTsc } from './tsc.js';
import { parseVitest } from './vitest.js';
import { parseV8 } from './v8.js';
import type { Parser } from './types.js';

export type LintParserName = 'eslint' | 'biome' | 'oxlint' | 'custom';
export type TypecheckParserName = 'tsc' | 'custom';
export type TestParserName = 'vitest' | 'jest' | 'node-test' | 'custom';
export type CoverageParserName = 'v8' | 'istanbul' | 'custom';

export type ToolName = 'lint' | 'typecheck' | 'test' | 'coverage';

/**
 * istanbul / nyc / v8 / c8 all emit the same `coverage-summary.json`
 * shape, so a single parser handles every coverage tool. `parseIstanbul`
 * is the public alias for users who reach for it by name.
 */
export const parseIstanbul: Parser = parseV8;

/**
 * Resolve a parser by tool + parser name. Falls back to the default-per-tool
 * parser when no explicit parser hint is given in toolchain config.
 */
export function resolveParser(
  tool: ToolName,
  config: Constitution['toolchain'],
): Parser | undefined {
  const parsers = config?.parsers;
  switch (tool) {
    case 'lint': {
      const hint = parsers?.lint ?? 'eslint';
      if (hint === 'eslint') return parseEslint;
      // biome and oxlint not yet supported; treat as no-op until shipped.
      return undefined;
    }
    case 'typecheck': {
      const hint = parsers?.typecheck ?? 'tsc';
      if (hint === 'tsc') return parseTsc;
      return undefined;
    }
    case 'test': {
      const hint = parsers?.test ?? 'vitest';
      if (hint === 'vitest') return parseVitest;
      if (hint === 'jest') return parseJest;
      if (hint === 'node-test') return parseNodeTest;
      return undefined;
    }
    case 'coverage': {
      const hint = parsers?.coverage ?? 'v8';
      if (hint === 'v8') return parseV8;
      if (hint === 'istanbul') return parseIstanbul;
      return undefined;
    }
  }
}

export type { Parser, ParsedToolchainResult } from './types.js';

export { parseEslint } from './eslint.js';
export { parseJest } from './jest.js';
export { parseNodeTest } from './node-test.js';
export { parseTsc } from './tsc.js';
export { parseVitest } from './vitest.js';
export { parseV8 } from './v8.js';
