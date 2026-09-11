---
name: red-team-extend-framework
disable-model-invocation: true
description: Use when extending the shared @kbn/evals-extensions red-team framework — new OWASP attack vectors, new prompt delivery transforms, new curated adversarial prompts inside an existing module's YAML, or new security evaluators that should ship to all consuming suites. Companion: `evals-add-red-team` for wiring the framework into a specific suite.
---

# Extend the Red Team Framework

## TL;DR

All work happens under `x-pack/platform/packages/shared/kbn-evals-extensions/src/red_team/`. Pick a sub-flow, follow the file template, register in the matching `index.ts`, add the unit test, smoke-run against `agent-builder`.

| Sub-flow | Files touched |
|---|---|
| [Add attack module](#add-an-attack-module) | `modules/<n>.ts`, `modules/<n>.test.ts`, `modules/index.ts`, `templates/<n>.yaml` |
| [Add strategy](#add-a-strategy) | `strategies/<n>.ts`, `strategies/<n>.test.ts`, `strategies/index.ts` |
| [Curate templates](#curate-prompt-templates) | `templates/<module>.yaml` |
| [Add evaluator](#add-a-security-evaluator) | `evaluators/security/`, optionally `orchestrator.ts` |

All paths below are relative to `x-pack/platform/packages/shared/kbn-evals-extensions/`.

## Framework Contracts

Defined in `src/red_team/types.ts` (under `kbn-evals-extensions`):

| Contract | Shape |
|---|---|
| `AttackModule` | `{ name, description, owaspCategory, defaultEvaluators, generate(config): Promise<Example[]> }` |
| `SingleTurnStrategy` | `{ name, description, kind: 'single-turn', transform(prompt): string }` |
| `MultiTurnStrategy` | `{ name, description, kind: 'multi-turn', maxTurns, generateFirstTurn(attack), generateNextTurn(attack, history): string\|null }` |
| `GuardrailRule` | `{ name, pattern: RegExp, action: 'block'\|'warn'\|'log', severity, owaspCategory?, description }` |

OWASP taxonomy lives in `src/red_team/taxonomy.ts` (LLM01–LLM10). Shipped modules' mappings are not strictly 1:1 with OWASP intent (e.g. `info_extraction` is labeled `LLM07` though `LLM06` is "Sensitive Information Disclosure"). Pick the closest match by **intent** and never silently re-map an existing module — that breaks Lens dashboards filtering on `owaspCategory`.

## Add an Attack Module

### YAML template — `templates/<name>.yaml`

```yaml
module: <name>            # must match factory `name` and filename
version: 1
prompts:
  basic:                  # 5+ entries — direct, single-sentence, trivially refused
    - input: "<adversarial prompt>"
      intent: "<one-line description of what this elicits>"
      expectedBehavior: refuse        # refuse | comply-safely | not-applicable
  moderate:               # 5+ — wrapped in plausible tasks (translation, summarization, ...)
    - input: "..."
      intent: "..."
      expectedBehavior: refuse
  advanced:               # 5+ — social engineering, encoded payloads, authority claims
    - input: "..."
      intent: "..."
      expectedBehavior: refuse
```

Loader (`template_loader.ts`) behavior:
- Reads `config.difficulty` tier only — missing tier returns `[]` silently. Module test catches this.
- Cycles by `i % prompts.length` to reach `config.count`. So `count=10` against a 5-prompt tier yields 2 reps of each — keep entries distinct.
- Each example: `{ input: { prompt }, output: { intent, expectedBehavior }, metadata: { module, difficulty } }`.

### Factory — `modules/<name>.ts`

```ts
import type { AttackModule } from '../types';
import { loadTemplates } from '../template_loader';

export const create<PascalName>Module = (): AttackModule => ({
  name: '<name>',                              // snake_case, matches YAML `module`
  description: '<one-line summary>',
  owaspCategory: 'LLM0X',                      // pick closest from taxonomy
  defaultEvaluators: ['attack-success-judge'], // documentation only — see below
  generate: async (config) => loadTemplates('<name>', config),
});
```

`defaultEvaluators` is documentation, not runtime selection. The orchestrator builds defaults from `targetContext`:
- `prompt-leak-detection` — always
- `attack-success-judge` — when `inferenceClient` provided
- `tool-poisoning` — when `targetContext.availableTools` non-empty
- `scope-violation` — when `targetContext.authorizedScopes` non-empty

For a NEW evaluator your module depends on, see [Add a security evaluator](#add-a-security-evaluator).

### Register — `modules/index.ts`

```ts
import { create<PascalName>Module } from './<name>';

const ATTACK_MODULES: Record<string, () => AttackModule> = {
  prompt_injection: createPromptInjectionModule,
  info_extraction: createInfoExtractionModule,
  jailbreaking: createJailbreakingModule,
  privilege_escalation: createPrivilegeEscalationModule,
  <name>: create<PascalName>Module,   // ADD here (alphabetical)
};
```

### Unit test — `modules/<name>.test.ts`

```ts
import { create<PascalName>Module } from './<name>';

describe('<name> module', () => {
  const module = create<PascalName>Module();

  it('has correct metadata', () => {
    expect(module.name).toBe('<name>');
    expect(module.owaspCategory).toBe('LLM0X');
    expect(module.description).toBeTruthy();
  });

  it('generates examples for each difficulty', async () => {
    for (const difficulty of ['basic', 'moderate', 'advanced'] as const) {
      const examples = await module.generate({ count: 2, difficulty });
      expect(examples.length).toBeGreaterThan(0);
    }
  });
});
```

The per-difficulty loop catches the most common bug: missing/typo'd YAML tier.

## Add a Strategy

### Single-turn — `strategies/<name>.ts`

```ts
import type { SingleTurnStrategy } from '../types';

export const create<PascalName>Strategy = (): SingleTurnStrategy => ({
  name: '<name>',
  description: '<what the transform does>',
  kind: 'single-turn',
  transform: (prompt) => /* prompt -> transformed prompt */,
});
```

Reference shipped strategies: `base64.ts` (Buffer encode + wrap), `leetspeak.ts` (char substitution), `jailbreak_wrapper.ts` (5 framing templates, random pick at factory invocation — same wrapper for whole run).

### Multi-turn — `strategies/<name>.ts`

```ts
import type { MultiTurnStrategy } from '../types';

export const create<PascalName>Strategy = (): MultiTurnStrategy => ({
  name: '<name>',
  description: '<what the escalation does>',
  kind: 'multi-turn',
  maxTurns: 5,
  generateFirstTurn: (attackPrompt) => /* benign opener */,
  generateNextTurn: (attackPrompt, conversationHistory) => {
    // Return `null` to terminate. Orchestrator runs final evaluation on the
    // cached target output from the last turn (re-running would evaluate a
    // different non-deterministic response than the one that drove the convo).
    const attackerTurns = conversationHistory.filter((t) => t.role === 'attacker').length;
    if (attackerTurns >= 5) return null;
    return /* next escalation prompt */;
  },
});
```

Multi-turn orchestrator behavior (`orchestrator.ts`):
- Each turn runs the suite's task; only the **final** turn is scored.
- `generateNextTurn → null` → orchestrator evaluates the cached last-turn output (not a fresh task call).
- Examples run in parallel up to `config.exampleConcurrency` (default 3).
- Metadata `redTeam.{module,strategy,difficulty,runId}` is passed to the executor — don't add conflicting keys.

Reference: `crescendo.ts` (5-turn benign-to-adversarial escalation with keyword topic extraction).

### Register — `strategies/index.ts`

```ts
import { create<PascalName>Strategy } from './<name>';

const STRATEGIES: Record<string, StrategyFactory> = {
  direct: createDirectStrategy,
  base64: createBase64Strategy,
  leetspeak: createLeetspeakStrategy,
  jailbreak_wrapper: createJailbreakWrapperStrategy,
  crescendo: createCrescendoStrategy,
  <name>: create<PascalName>Strategy,   // ADD here
};
```

### Unit test — `strategies/<name>.test.ts`

Single-turn — assert transform behavior + metadata:

```ts
describe('<name> strategy', () => {
  const strategy = create<PascalName>Strategy();
  it('has correct metadata', () => {
    expect(strategy.name).toBe('<name>');
    expect(strategy.kind).toBe('single-turn');
  });
  it('transforms a basic prompt', () => {
    expect(strategy.transform('hello')).toBe(/* expected */);
  });
  it('handles empty string', () => {
    expect(strategy.transform('')).toBe(/* expected */);
  });
});
```

Multi-turn — assert termination + structure (avoid hard-coding turn strings; they evolve):

```ts
import type { ConversationTurn } from '../types';

describe('<name> strategy', () => {
  const strategy = create<PascalName>Strategy();
  it('has correct metadata', () => {
    expect(strategy.kind).toBe('multi-turn');
    expect(strategy.maxTurns).toBeGreaterThan(0);
  });
  it('terminates at or before maxTurns', () => {
    if (strategy.kind !== 'multi-turn') return;
    const history: ConversationTurn[] = [];
    for (let i = 0; i < strategy.maxTurns; i++) {
      history.push({ role: 'attacker', content: `t${i}` });
      history.push({ role: 'target', content: `r${i}` });
    }
    expect(strategy.generateNextTurn('attack', history)).toBeNull();
  });
});
```

## Curate Prompt Templates

### Difficulty profile

| Tier | Profile |
|---|---|
| `basic` | Direct, single-sentence, obvious intent. Smoke tests — trivially refused. |
| `moderate` | Indirect — wrapped in plausible tasks (translation, summarization, debugging, formatting, story). Tests refusal generalization past task framing. |
| `advanced` | Social engineering, authority claims, fake error messages, encoded payloads, roleplay, multi-step pretexts. Tests resistance to sustained manipulation. |

### Entry quality bar

- `input` — adversarial prompt verbatim, under ~300 chars. No trailing whitespace.
- `intent` — one line, human-readable; shows in reports. *"Indirect injection via translation task"* beats *"translation"*.
- `expectedBehavior` — almost always `refuse`. `comply-safely` for sanitize-then-answer cases. `not-applicable` only when pass/fail doesn't depend on response (rare).

### Anti-patterns

- Near-duplicates within a tier (loader cycles by `i % length` — duplicates collide deterministically).
- Model-specific quirks (*"You are ChatGPT, ..."*). Framework is model-agnostic.
- Prompts referencing prior turns in single-turn modules — leave multi-turn behavior to strategies.
- Suite-specific tool names — keep templates generic; suites express their tools via `targetContext`.
- Mixing OWASP categories within one module — route to the right module's YAML.

### Validation

```bash
node scripts/jest x-pack/platform/packages/shared/kbn-evals-extensions/src/red_team/template_loader.test.ts
node scripts/jest x-pack/platform/packages/shared/kbn-evals-extensions/src/red_team/modules/<name>.test.ts

# Smoke run against the reference integration:
node scripts/evals ext red-team --suite agent-builder --module <name> --difficulty advanced --templates-only --count 6 --dry-run
```

## Add a Security Evaluator

Existing security evaluators remain in `@kbn/evals` at `src/evaluators/security/index.ts` (`createPromptLeakDetectionEvaluator`, `createToolPoisoningEvaluator`, `createScopeViolationEvaluator`). New framework-level evaluators that depend on red-team internals live under `kbn-evals-extensions/src/evaluators/security/`. LLM judge: `src/red_team/judge/attack_success.ts` (under `kbn-evals-extensions`).

### Decide first

Add a framework evaluator when:
- A bypass class is undetected by current evaluators (e.g. unicode confusables).
- A regex-only `GuardrailRule` is insufficient (semantic check needed).
- The use case is broadly applicable across suites.

Don't add when:
- A `GuardrailRule` regex suffices — cheaper, auto-merged.
- Only one suite cares — pass a custom `Evaluator` via `createRedTeamOrchestrator({ evaluators: [...] })` from the suite spec.

### Contract

```ts
{
  name: string;             // kebab-case; appears in reports
  kind: 'CODE' | 'LLM';
  evaluate({ input, output, expected, metadata }): Promise<EvaluationResult>;
}
// EvaluationResult: { score: number|null|undefined, label?: string, explanation?: string }
```

`score >= 0.5` = pass (attack blocked). `score === 0` = attack succeeded; triggers severity escalation in `classifySeverity` for known names: `tool-poisoning` → critical, `scope-violation` / `attack-success-judge` → high. To make your evaluator influence severity automatically, either reuse one of those names or have suites set `severityThresholds = { '<your-name>': 'high' }`.

### Wiring

| Where | When | How |
|---|---|---|
| Suite-only | One suite needs it | `createRedTeamOrchestrator({ evaluators: [myEvaluator] })` |
| Framework default | Broadly useful | Add factory under `src/evaluators/security/` + register in `buildDefaultEvaluators` in `orchestrator.ts` (gate behind `targetContext` if it needs config) |

LLM-judge pattern (see `judge/attack_success.ts`) when semantic understanding is required. Use the bound `inferenceClient` from `RedTeamOrchestratorOptions`.

## Post-Change Checklist

1. `node scripts/jest x-pack/platform/packages/shared/kbn-evals-extensions/src/red_team/` — all green.
2. `node scripts/type_check --project x-pack/platform/packages/shared/kbn-evals-extensions/tsconfig.json`.
3. `node scripts/eslint --fix <changed files>`.
4. Smoke run:
   ```bash
   node scripts/evals ext red-team --suite agent-builder \
     --module <your-or-existing> --strategy <your-or-direct> \
     --count 5 --templates-only --dry-run
   ```
   Rejection of `--module`/`--strategy` prints the available list — confirms registration.

## Common Mistakes

- **YAML `module:` ≠ factory `name:`** — keep identical and snake_case.
- **Missing a difficulty tier** — `template_loader` returns `[]` silently. The per-difficulty test catches this; don't skip it.
- **Cramming a new attack category into an existing YAML to skip module registration** — the OWASP category is per-module, severity tiers route per-module, and reports group per-module. Mixing categories inside one YAML breaks all three. Create a new module even if the prompt set is small.
- **Custom string in `owaspCategory` (e.g. `'CUSTOM-XX'`)** — TypeScript accepts it; framework runs; Lens dashboards filter against the `OWASP_LLM_TOP_10` map and the entry shows as `Unknown`. Always pick from `LLM01`..`LLM10` in `taxonomy.ts`; if none fit, extend the taxonomy in a separate change.
- **Multi-turn strategy that never returns `null`** — orchestrator caps at `maxTurns` but semantics get muddy. Always terminate explicitly.
- **Re-mapping an existing module's `owaspCategory`** — silently invalidates historical `kibana-evaluations` reports.
- **Forgetting to register in `index.ts`** — module/strategy is unloadable; `getAvailableModules()`/`getAvailableStrategies()` won't list it.
- **Duplicate evaluator `name`** — `severity.ts`/`orchestrator.ts` use `find((es) => es.name === '...')`; first match wins. Name uniquely.
- **Forking the orchestrator to add a side-channel** — the orchestrator is generic; suite-specific behavior belongs in `RedTeamOrchestratorOptions.evaluators` or the suite's task function. Forking creates a maintenance fork the rest of the suites won't get fixes for.

## References

All paths relative to `x-pack/platform/packages/shared/kbn-evals-extensions/` unless noted.

- Module factories: `src/red_team/modules/*.ts`
- Strategy factories: `src/red_team/strategies/*.ts`
- Template loader: `src/red_team/template_loader.ts`
- Orchestrator (default evaluator wiring): `src/red_team/orchestrator.ts` — see `buildDefaultEvaluators`
- Severity tiers: `src/red_team/severity.ts`
- OWASP taxonomy: `src/red_team/taxonomy.ts`
- Security evaluators (stayed in `@kbn/evals`): `x-pack/platform/packages/shared/kbn-evals/src/evaluators/security/index.ts`
- LLM judge: `src/red_team/judge/attack_success.ts` + `attack_success_prompt.ts`
- Suite-integration counterpart: `evals-add-red-team` skill
