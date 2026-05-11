import type { Constitution, Scope, VerifyResult } from './schemas.js';

export type VerifySource =
  | { kind: 'inline'; changedFiles: readonly { path: string; content: string }[] }
  | { kind: 'git'; repo: string; work: string; baseline: string }
  | { kind: 'staged'; repo: string };

export interface VerifyInput {
  scope: Scope;
  config: Constitution;
  source: VerifySource;
}

export function verify(_input: VerifyInput): Promise<VerifyResult> {
  throw new Error('verify() is not yet implemented (phase 1 stub).');
}
