import { recommended } from './recommended.js';

import type { Constitution } from '../schemas.js';

export const presets: { readonly recommended: Constitution } = {
  recommended,
};

export { builtInChecks, exceptionsMustCiteJustification } from './checks.js';
