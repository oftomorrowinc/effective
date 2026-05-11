import type { Finding } from './schemas.js';

export interface KickBackInput {
  findings: readonly Finding[];
  previousPrompt: string;
  output?: string;
}

export function kickBack(_input: KickBackInput): string {
  throw new Error('kickBack() is not yet implemented (phase 1 stub).');
}
