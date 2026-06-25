# Red-team framework (scaffold)

Minimal scaffold for adversarial testing. Full implementation from [PR #272115](https://github.com/elastic/kibana/pull/272115) lands incrementally.

## Current state

| Component                         | Status                                                                  |
| --------------------------------- | ----------------------------------------------------------------------- |
| `types.ts`                        | Minimal `RedTeamConfig` / `RedTeamReport`                               |
| `orchestrator.ts`                 | Stub `runRedTeam` (returns empty report)                                |
| `node scripts/evals ext red-team` | Wires `ensureEvalStack` + `resolveRunContext`, delegates to `evals run` |

**Not yet implemented:** modules, strategies, judge, guardrails, YAML templates, score ingestion.

## CLI

```bash
node scripts/evals ext red-team --suite agent-builder --dry-run
node scripts/evals ext red-team --suite agent-builder --judge eis-gpt-4.1 --skip-server
node scripts/evals ext red-team --suite agent-builder --modules prompt_injection,jailbreaking --count 5
```

Red-team flags (in addition to the eval orchestration flags from [`evals start`](../../../kbn-evals/CLI.md#start----start-stack-and-run-a-suite), e.g. `--suite`, `--judge`, `--model`, `--profile`, `--grep`, `--repetitions`, `--skip-server`, `--dry-run`):

| Flag                     | Description                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `--modules` / `--module` | Comma-separated module ids: `prompt_injection`, `info_extraction`, `jailbreaking`, `privilege_escalation`, `indirect_injection` |
| `--count`                | Number of attacks to generate per module (positive integer)                                                                     |

Use `--dry-run` to preview the planned `node scripts/evals run` command without starting services.

## Planned layout (future)

```
src/red_team/
  modules/           # Attack categories (prompt_injection, jailbreaking, …)
  strategies/        # Delivery strategies (direct, base64, crescendo, …)
  judge/             # AttackSuccessJudge, refusal_quality
  templates/         # YAML prompt templates (*.yaml)
  guardrails.ts
  severity.ts
  report.ts
```

YAML templates will ship with this package; `template_loader.ts` should resolve paths relative to this directory.
