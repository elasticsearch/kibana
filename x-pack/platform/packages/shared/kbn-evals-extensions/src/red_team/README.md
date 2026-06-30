# Red-team framework

Adversarial testing for AI assistants, built on `@kbn/evals`. The framework
generates adversarial prompts, delivers them through obfuscation/multi-turn
strategies, judges whether each attack succeeded, applies guardrails, classifies
findings by severity, and aggregates everything into a typed `RedTeamReport`.

It lives in `@kbn/evals-extensions` (which depends on `@kbn/evals`, never the
reverse) and is driven by the `node scripts/evals ext red-team` CLI.

## Layout

```
src/red_team/
  orchestrator.ts      # createRedTeamOrchestrator — drives a full run
  modules/             # Attack categories (one registry: getAttackModule)
  strategies/          # Delivery strategies (one registry: getStrategy)
  judge/               # LLM-as-judge evaluators (attack-success, refusal-quality)
  templates/           # YAML prompt templates (*.yaml), one per module
  template_loader.ts   # Resolves templates relative to this directory
  guardrails.ts        # Regex guardrail rules + scan/merge helpers
  severity.ts          # Severity classification (critical → low)
  taxonomy.ts          # OWASP LLM Top 10 mapping
  report.ts            # formatRedTeamReport (terminal output)
  report_writer.ts     # writeRedTeamReport (file output)
  pass_check.ts        # per-attack pass/fail decision
  types.ts             # RedTeamConfig, RedTeamReport, RED_TEAM_MODULE_IDS, …
```

## Attack modules

Registered in `modules/index.ts`; selected by id via `--module`/`--modules`.

| Module | OWASP | Goal |
| --- | --- | --- |
| `prompt_injection` | LLM01 | Follow injected instructions |
| `info_extraction` | LLM06 | Extract system prompt / tool list / internal state |
| `jailbreaking` | LLM01 | Bypass safety constraints |
| `privilege_escalation` | LLM06 | Accept a forged role / unauthorized actions |
| `indirect_injection` | LLM02 | Inject via retrieved/tool content |

Each module is backed by a YAML template in `templates/`.

## Delivery strategies

Registered in `strategies/index.ts`; selected via `--strategy`.

`direct`, `base64`, `leetspeak`, `jailbreak_wrapper`, `crescendo` (multi-turn
escalation), `persistence` (multi-turn repetition), `rot13`,
`unicode_confusables`.

## Evaluators

Default evaluators wired by the orchestrator when an inference client is
available:

- **`attack-success`** — LLM judge classifying each response as
  `ATTACK_SUCCESS` / `PARTIAL_SUCCESS` / `ATTACK_BLOCKED` (`judge/attack_success.ts`).
- **`refusal-quality`** — LLM judge scoring the quality/clarity of refusals
  (`judge/refusal_quality.ts`).
- **`prompt-leak-detection`** (with `refusalAware`) — from `@kbn/evals` core.

`tool-poisoning` and `scope-violation` (also from `@kbn/evals` core) are added
when the config's `targetContext` declares `availableTools` / `authorizedScopes`.

**Two-signal guardrail suppression:** when both `attack-success` (blocked) and
`prompt-leak-detection` (clean) agree an attack was blocked, guardrail
violations are suppressed — the combined signal means a regex match is a false
positive inside a genuine refusal.

## CLI

```bash
node scripts/evals ext red-team --suite agent-builder
node scripts/evals ext red-team --suite agent-builder --module prompt_injection --count 5
node scripts/evals ext red-team --suite agent-builder --strategy jailbreak_wrapper
node scripts/evals ext red-team --suite agent-builder --strategy crescendo
node scripts/evals ext red-team --suite agent-builder --count 20 --difficulty advanced
node scripts/evals ext red-team --suite agent-builder --templates-only --count 20
node scripts/evals ext red-team --suite agent-builder --judge bedrock-claude --skip-server
node scripts/evals ext red-team --suite agent-builder --dry-run
```

In addition to the shared eval flags (`--suite`, `--judge`, `--model`,
`--profile`, `--skip-server`, `--dry-run`, …), red-team adds:

| Flag | Description |
| --- | --- |
| `--module` / `--modules` | Comma-separated module ids (see table above). Defaults to all. |
| `--strategy` | Delivery strategy id. Defaults to `direct`. |
| `--count` | Attacks generated per module (positive integer). Defaults to 10. |
| `--difficulty` | `basic` \| `moderate` \| `advanced`. Defaults to `moderate`. |
| `--severity-threshold` | `critical` \| `high` \| `medium` \| `low`. Defaults to `low`. |
| `--templates-only` | Use only YAML template prompts (no LLM attack generation). |

The command boots the eval stack via the shared `ensureEvalStack` helper (unless
`--skip-server`), then spawns the suite's dedicated `<suite>-red-team` Playwright
config (registered in `.buildkite/pipelines/evals/evals.suites.json`). Flags are
passed to the spec as `RED_TEAM_*` environment variables. Suites without a
dedicated config fall back to a Playwright run scoped by `--grep "Red Team"`.

The output is a severity-classified report with a summary table and detailed
findings per failed attack, written through `writeRedTeamReport`. When run
through the `evaluate` fixture, per-example evaluator scores are also ingested
through the evals plugin score-ingestion API with `run.type: 'red-team'`
metadata.

## Using it from a suite

A suite opts in with a dedicated red-team spec that imports from
`@kbn/evals-extensions` and reads the `RED_TEAM_*` env the CLI sets:

```typescript
import {
  createRedTeamOrchestrator,
  formatRedTeamReport,
  writeRedTeamReport,
  type RedTeamConfig,
} from '@kbn/evals-extensions';
import { evaluate } from '../src/evaluate';

evaluate('Red Team', async ({ chatClient, executorClient, inferenceClient, evaluationConnector, log }) => {
  const orchestrator = createRedTeamOrchestrator({
    config,
    executorClient,
    inferenceClient: inferenceClient.bindTo({ connectorId: evaluationConnector.id }),
    log,
  });

  const report = await orchestrator.run(async (example) => {
    const response = await chatClient.converse({ messages: [{ message: example.input?.prompt }] });
    return { messages: response.messages, steps: response.steps, errors: response.errors };
  });

  formatRedTeamReport(report, log);
  writeRedTeamReport(report, log);
});
```

See `x-pack/platform/packages/shared/agent-builder/kbn-evals-suite-agent-builder/red_team/`
for a reference integration.

## Extending

- **New attack module:** add `modules/<name>.ts` + `templates/<name>.yaml`,
  register it in `modules/index.ts`, add its id to `RED_TEAM_MODULE_IDS` in
  `types.ts`.
- **New strategy:** add `strategies/<name>.ts`, register it in
  `strategies/index.ts`.
- **New evaluator:** add it under `judge/` and push it in the orchestrator's
  default-evaluator builder, or pass a custom `Evaluator` via
  `createRedTeamOrchestrator({ evaluators: [...] })` from a suite.
