/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Module cycles are forbidden — they make the architecture unclear.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'Modules with no incoming edges may be dead code.',
      from: {
        orphan: true,
        pathNot: [
          String.raw`(^|/)\.[^/]+\.(js|cjs|mjs|ts)$`,
          String.raw`\.d\.ts$`,
          String.raw`(^|/)tsconfig\.json$`,
          String.raw`(^|/)src/(index|cli)\.ts$`,
          String.raw`(^|/)(eslint|tsup|vitest)\.config\.(js|ts)$`,
          '(^|/)test/.*$',
        ],
      },
      to: {},
    },
    {
      name: 'rules-must-not-import-cli',
      severity: 'error',
      comment: 'Rule engine must not depend on the CLI.',
      from: { path: '^src/rules/' },
      to: { path: '^src/cli' },
    },
    {
      name: 'engine-must-not-import-tests',
      severity: 'error',
      from: { path: '^src/' },
      to: { path: '^test/' },
    },
    {
      name: 'no-dev-deps-in-runtime',
      severity: 'error',
      comment: 'Source code must not import from devDependencies at runtime.',
      from: { path: '^src/', pathNot: String.raw`\.test\.ts$` },
      to: { dependencyTypes: ['npm-dev'] },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      mainFields: ['module', 'main'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
