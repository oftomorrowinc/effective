import { ExceptionRegistry as ExceptionRegistrySchema } from './schemas.js';
import type { ExceptionRegistry } from './schemas.js';

export function defineExceptions(input: ExceptionRegistry): ExceptionRegistry {
  return ExceptionRegistrySchema.parse(input);
}
