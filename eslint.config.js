import { defineConfig } from 'eslint/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import unicorn from 'eslint-plugin-unicorn';
import importPlugin from 'eslint-plugin-import';
import promise from 'eslint-plugin-promise';
import security from 'eslint-plugin-security';
import n from 'eslint-plugin-n';
import prettierConfig from 'eslint-config-prettier';

const tsconfigRootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig([
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**', '.effective/**'] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  unicorn.configs['flat/recommended'],
  promise.configs['flat/recommended'],
  security.configs.recommended,
  n.configs['flat/recommended-module'],
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir,
      },
    },
    plugins: { import: importPlugin },
    rules: {
      'import/no-cycle': ['error', { maxDepth: Infinity }],
      'import/no-self-import': 'error',
      'import/no-useless-path-segments': 'error',
      'n/no-missing-import': 'off',
      'n/no-unpublished-import': 'off',
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/no-null': 'off',
      'unicorn/filename-case': ['error', { cases: { camelCase: true, kebabCase: true } }],
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-magic-numbers': 'off',
      'security/detect-object-injection': 'off',
      // Test fixtures legitimately write to derived paths in tmpdir.
      'security/detect-non-literal-fs-filename': 'off',
    },
  },
  // Engine modules that legitimately access filesystem paths and keyed maps
  // derived from project-trusted configuration (rule ids, scope.spec, tool
  // names, worktree paths). The threat model treats these inputs as trusted
  // code, not untrusted user input — see DESIGN.md on why `effective.config.ts`
  // is part of the trusted base.
  {
    files: [
      'src/worktree.ts',
      'src/source/**/*.ts',
      'src/escape-hatches/**/*.ts',
      'src/toolchain/parsers/**/*.ts',
      'src/rules/kinds/**/*.ts',
    ],
    rules: {
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-object-injection': 'off',
    },
  },
  // The escape-hatch scanner relies on a curated set of pattern regexes that
  // are statically declared in the module. safe-regex's heuristic flags them
  // as nested-quantifier-suspect, but they target a small, fixed alphabet of
  // suppression-comment shapes — no user input feeds the regex bodies.
  {
    files: ['src/escape-hatches/scan.ts'],
    rules: {
      'security/detect-unsafe-regex': 'off',
    },
  },
  {
    files: ['*.config.ts', '*.config.js', 'eslint.config.js'],
    rules: {
      'n/no-extraneous-import': 'off',
      'import/no-default-export': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
  {
    files: ['*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        module: 'readonly',
        require: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
    rules: {
      'n/no-extraneous-import': 'off',
      'import/no-default-export': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  prettierConfig,
]);
