# Red Team Evals — Skill Index

Cross-link doc for the two skills covering the `@kbn/evals-extensions` red-team adversarial testing framework. This directory contains no `SKILL.md`; the skills themselves live in sibling directories.

## Which skill to use

| You are... | Use | Sibling dir |
|---|---|---|
| An **eval suite author** wiring red-team into an existing `kbn-evals-suite-<name>` package | [`evals-add-red-team`](../evals-add-red-team/SKILL.md) | `../evals-add-red-team/` |
| A **framework contributor** adding a new attack module, delivery strategy, prompt template tier, or security evaluator | [`red-team-extend-framework`](../red-team-extend-framework/SKILL.md) | `../red-team-extend-framework/` |

Most adopters need only the first. The second is rarer (single shared framework, many consuming suites).

## How the two skills relate

```
        ┌────────────────────────────────────────────────────────────┐
        │  @kbn/evals-extensions red-team framework                  │
        │  (x-pack/platform/packages/shared/kbn-evals-extensions/src/red_team)  │
        │                                                            │
        │   modules/   strategies/   templates/   judge/   evaluators│
        │       ▲           ▲             ▲          ▲          ▲    │
        └───────┼───────────┼─────────────┼──────────┼──────────┼────┘
                │           │             │          │          │
                └─────── red-team-extend-framework ─────────────┘
                              (contributes here)

        ┌────────────────────────────────────────────────────────────┐
        │  kbn-evals-suite-<name>                                    │
        │  ├── red_team/red_team.spec.ts        ◀── evals-add-red-team
        │  ├── red_team.playwright.config.ts    ◀── evals-add-red-team
        │  └── .buildkite/.../evals.suites.json ◀── evals-add-red-team
        └────────────────────────────────────────────────────────────┘
```

`evals-add-red-team` configures `RedTeamConfig` (modules, strategies, `targetContext`, guardrails, `minPassRate`) and wires the suite's task function. `red-team-extend-framework` ships the new module/strategy/evaluator into the shared package that `evals-add-red-team` then exposes via `RedTeamConfig.modules` / `RedTeamConfig.strategies`.

## Related skills (separate concerns)

- [`evals-create-suite`](../evals-create-suite/SKILL.md) — scaffold the parent eval suite package. Run before `evals-add-red-team` if the suite does not exist yet.
- [`evals-write-spec`](../evals-write-spec/SKILL.md) — author normal (non-adversarial) eval specs. The red-team spec is structurally different and lives in a separate testDir; don't mix.
- `perform-agent-builder-eval` — orchestrates agent-builder eval runs (init stack, run, stop). Useful for local end-to-end execution after wiring red-team.

## Key framework locations

| Concern | Path (from repo root) |
|---|---|
| Orchestrator + default evaluator wiring | `x-pack/platform/packages/shared/kbn-evals-extensions/src/red_team/orchestrator.ts` |
| Types (`RedTeamConfig`, `AttackModule`, `Strategy`, `GuardrailRule`, ...) | `x-pack/platform/packages/shared/kbn-evals-extensions/src/red_team/types.ts` |
| Attack modules + YAML templates | `x-pack/platform/packages/shared/kbn-evals-extensions/src/red_team/modules/` + `templates/` |
| Delivery strategies | `x-pack/platform/packages/shared/kbn-evals-extensions/src/red_team/strategies/` |
| Guardrail engine (regex defaults + merge) | `x-pack/platform/packages/shared/kbn-evals-extensions/src/red_team/guardrails.ts` |
| Severity tiers | `x-pack/platform/packages/shared/kbn-evals-extensions/src/red_team/severity.ts` |
| OWASP LLM Top 10 taxonomy | `x-pack/platform/packages/shared/kbn-evals-extensions/src/red_team/taxonomy.ts` |
| LLM-as-judge | `x-pack/platform/packages/shared/kbn-evals-extensions/src/red_team/judge/attack_success.ts` |
| Security evaluators | `x-pack/platform/packages/shared/kbn-evals/src/evaluators/security/` |
| CLI command | `x-pack/platform/packages/shared/kbn-evals-extensions/src/cli/commands/red_team.ts` |
| CI suite registry | `.buildkite/pipelines/evals/evals.suites.json` |
| Reference integration | `x-pack/platform/packages/shared/agent-builder/kbn-evals-suite-agent-builder/red_team/` |

## CLI quick reference

```bash
# All modules, default strategy, moderate difficulty
node scripts/evals ext red-team --suite <suite> --judge <judge-connector-id>

# Single module / strategy / difficulty
node scripts/evals ext red-team --suite <suite> --module prompt_injection
node scripts/evals ext red-team --suite <suite> --strategy crescendo
node scripts/evals ext red-team --suite <suite> --difficulty advanced --count 20

# Curated prompts only (skip dynamic generation)
node scripts/evals ext red-team --suite <suite> --templates-only

# Print spawn command without executing
node scripts/evals ext red-team --suite <suite> --dry-run
```

Available modules (today): `prompt_injection`, `info_extraction`, `jailbreaking`, `privilege_escalation`.
Available strategies (today): `direct`, `base64`, `leetspeak`, `jailbreak_wrapper`, `crescendo`.
The CLI normalizes hyphens to underscores in `--module` / `--strategy`.

## PR / Issue references

- Framework PR: [elastic/kibana#262062](https://github.com/elastic/kibana/pull/262062) — `feature/red-team-evals-framework`
- Tracking issue: [#257824](https://github.com/elastic/kibana/issues/257824) — Phase 3: Red-teaming and security testing CLI
- Epic: [#257821](https://github.com/elastic/kibana/issues/257821) — Extend @kbn/evals with advanced evaluation capabilities
