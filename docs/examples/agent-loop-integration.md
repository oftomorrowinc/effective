# Integrating `prepare` and `verify` into an agent loop

This is the canonical wiring pattern for a long-running agent runner that
calls `prepare()` at dispatch and `verify()` after each agent step. It
shows where adopter-side plumbing (template loading, variable
interpolation) sits in the pipeline and how the new `PreparedAgent`
bundle keeps the prepare → verify roundtrip honest at the type level.

Reference shape — distilled from Core 2.0's runner integration.

```ts
import { readFile } from 'node:fs/promises';
import { prepare, verify, kickBack } from '@oftomorrow/effective';
import type { Scope, Constitution } from '@oftomorrow/effective';
import config from '../effective.config.js';

/**
 * Adopter-side plumbing — load a role's prompt template from disk,
 * interpolate runtime variables (issue title, prior chat feedback, etc.).
 * This belongs in your runner, NOT in `effective`: every project's
 * prompt templates and variable set look different. The output of this
 * step is the "original" task prompt that you hand to `prepare()`.
 */
async function loadAgentPrompt(
  role: string,
  vars: Record<string, string>,
): Promise<string> {
  const template = await readFile(`prompts/${role}.md`, 'utf8');
  return Object.entries(vars).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, value),
    template,
  );
}

/**
 * One agent step in a workflow. Runs as part of a kickback retry loop:
 * the outer caller will re-invoke this with feedback from the prior
 * verify until verdict is 'pass' or a retry budget is exhausted.
 */
export async function runAgentStep(args: {
  role: string;
  goal: string;
  editable: string[];
  promptVars: Record<string, string>;
  source: Parameters<typeof verify>[0]['source'];
}): Promise<{ verdict: string; findings: unknown[] }> {
  // 1. Adopter-side: load + interpolate the role's prompt template.
  const original = await loadAgentPrompt(args.role, args.promptVars);

  // 2. Wrap with the constitution. Use 'concise' for high-frequency
  //    dispatch — verify + kickBack will surface specifics on retry,
  //    so front-loading every rule's full guidance is double-paying.
  //    Switch to 'full' for new-to-role agents or retrospective dialog.
  const scope: Scope = {
    goal: args.goal,
    editable: args.editable,
    role: args.role,
  };
  const prepared = prepare({
    scope,
    config,
    original,
    mode: 'concise',
  });

  // 3. Dispatch to the model. `prepared.prompt` is the augmented prompt.
  //    (Your call shape varies; this is illustrative.)
  // const modelResponse = await callModel(prepared.prompt);
  //    Apply the diff from the model, run the agent's work, etc.

  // 4. Verify. Spread the bundle so scope + config are the SAME values
  //    that prepare used. The type system enforces this — if the two
  //    APIs were called with mismatched scope/config, that would be
  //    caller-hygiene and easy to miss. With the bundle, it can't drift.
  const result = await verify({
    ...prepared,
    source: args.source,
    // For inline-source per-step gating, skip toolchain rules — they
    // run at PR time via `effective verify --against main` against the
    // committed branch, not at every per-step retry.
    skipCategories: ['toolchain'],
  });

  if (result.verdict === 'fail') {
    // 5. Kickback: rendered next-prompt your runner feeds back to the
    //    agent on retry. kickBack groups findings by rule and re-emits
    //    the FULL guidance for just the rules that fired — adopter
    //    pays the rule-explanation cost only when needed.
    const _nextPrompt = kickBack({
      findings: result.findings,
      previousPrompt: prepared.prompt,
    });
    // Pass _nextPrompt back into the next iteration of runAgentStep.
  }

  return { verdict: result.verdict, findings: result.findings };
}
```

## Why this shape

**Prompt templates live in your runner, not in `effective`.** The package
has no business knowing what your role prompts look like or how you
interpolate them. The `original` field on `PrepareInput` is the seam:
adopter-side plumbing produces it, `effective` consumes it and wraps it.

**The `PreparedAgent` bundle is the load-bearing type for the
roundtrip.** Before it existed, `prepare()` returned a `string` and
`verify()` took `scope`/`config` independently — nothing forced the two
to agree at the type level. The bundle makes the contract honest:
spreading `prepared` into `verify` is the canonical pattern, and the
type system catches drift.

**`mode: 'concise'` matters at scale.** Full mode runs 15–30 KB
depending on the rule set; concise is ~3–5 KB. For a runner doing
hundreds of agent steps per day per workflow, the token bill matters.
The verify + kickBack loop is the safety net — when an agent trips a
rule, kickBack re-emits that one rule's full guidance, so the agent
learns specifics on demand rather than memorizing the catalogue up
front.

**Skip toolchain rules at per-step gates.** For inline-source per-step
verification, `skipCategories: ['toolchain']` keeps the gate fast
(millisecond latency) and avoids running lint/typecheck/tests on
intermediate commits where they're wrong by design (e.g., a test-
writer's commit is supposed to fail `toolchain.tests-pass` because
implementation lands later in the chain). Toolchain rules run for real
at PR time via `effective verify --against main` against the
committed branch.

## What changes for full-mode adoption

If you're using `mode: 'full'` (the default), the loop is structurally
identical — just drop the `mode` field. The bundle, the spread, and the
kickBack flow all stay the same. Use full mode when:

- An agent is new to a role and needs the catalogue up front
- You're in retrospective dialog with an agent, walking through what
  fired and why
- The dispatch is infrequent (a few per day) and the token cost is
  irrelevant
