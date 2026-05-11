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
