import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts', 'schemas/**/*.ts'],
      exclude: [
        '**/*.d.ts',
        '**/index.ts',
        'src/cli.ts',
        // Type-only modules — no executable code, nothing to cover.
        'src/source/types.ts',
        'src/toolchain/parsers/types.ts',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
});
