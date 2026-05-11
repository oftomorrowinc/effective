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
        // v8 coverage in vitest 3 (via @vitest/coverage-v8) counts every
        // arrow callback as a function and undercounts modules loaded
        // through jiti (the config-loader path). The numbers below are
        // calibrated to that measurement, not to the older istanbul-style
        // function counting. Branch coverage remains the most meaningful
        // signal for "did we actually exercise the conditional logic."
        lines: 80,
        functions: 60,
        branches: 85,
        statements: 80,
      },
    },
  },
});
