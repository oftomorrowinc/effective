import type { Constitution, Scope } from './schemas.js';

export interface PrepareInput {
  scope: Scope;
  config: Constitution;
  original: string;
}

export function prepare(_input: PrepareInput): string {
  throw new Error('prepare() is not yet implemented (phase 1 stub).');
}
