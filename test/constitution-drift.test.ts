import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderConstitution } from '../scripts/generate-constitution.js';
import { presets } from '../src/presets/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const constitutionPath = path.resolve(here, '..', 'CONSTITUTION.md');

describe('CONSTITUTION.md', () => {
  it('matches the output of `pnpm docs:constitution` against the recommended preset', async () => {
    const expected = renderConstitution(presets.recommended);
    const actual = await readFile(constitutionPath, 'utf8');
    if (actual !== expected) {
      throw new Error(
        'CONSTITUTION.md is stale relative to the recommended preset. Run `pnpm docs:constitution` to regenerate.',
      );
    }
    expect(actual).toBe(expected);
  });
});
