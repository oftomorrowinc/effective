import { Constitution as ConstitutionSchema } from './schemas.js';
import type { Constitution } from './schemas.js';

export function defineConfig(input: Constitution): Constitution {
  return ConstitutionSchema.parse(input);
}
