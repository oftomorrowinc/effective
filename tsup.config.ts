import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      schemas: 'src/schemas.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    splitting: false,
    target: 'node20',
    platform: 'node',
  },
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    outExtension: () => ({ js: '.mjs' }),
    dts: false,
    sourcemap: true,
    clean: false,
    target: 'node20',
    platform: 'node',
    banner: { js: '#!/usr/bin/env node' },
  },
]);
