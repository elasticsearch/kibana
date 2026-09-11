# Security Automatic Migrations Evaluation Suite

Evaluation suite for the Splunk-to-Kibana dashboard migration AI pipeline.

## Evaluators

| # | Name | Kind | What It Checks |
|---|------|------|----------------|
| E1 | `lookup_join_presence` | CODE | LOOKUP JOIN present when source SPL had lookups |
| E2 | `esql_completeness` | CODE | Generated ES\|QL has no unresolved placeholders |
| E3 | `markdown_error_detection` | CODE | No error/fallback content in panels |
| E4 | `translation_fidelity` | LLM | Content grounded in source + intent preserved |
| E5 | `panel_count_preservation` | CODE | Output panel count matches source |
| E6 | `translation_completeness` | CODE | Fraction of panels with FULL/PARTIAL translation |
| E7 | `index_pattern_validity` | CODE | Selected index patterns match expected |

## Dataset

Datasets use panel-level ground truth. Each example includes:
- **Input:** Splunk dashboard export (XML) + resources (macros/lookups)
- **Expected:** Per-panel ground truth (ES\|QL query, index pattern, translation status)
- **Metadata:** Flags for conditional evaluator logic

See `datasets/dashboards/types.ts` for the full schema.

**Current status:** Placeholder — awaiting expert-curated dashboard pairs.

## Running

```bash
# Prerequisites: run `node scripts/evals init` first if not already set up

# Run against a live Kibana+ES stack
node scripts/evals run --suite security-automatic-migrations

# Or start stack + run
node scripts/evals start --suite security-automatic-migrations
```

### Running against the v2 graph (`ruleMigrationGraphv2`)

The v2 agent graph is enabled via the `evals_rule_migration_v2` server config set. Add
`"serverConfigSet"` to the suite entry in
[`.buildkite/pipelines/evals/evals.suites.json`](../../../../.buildkite/pipelines/evals/evals.suites.json)
**before** starting the run, and revert it afterwards so CI stays on the default (v1) config:

```json
{
  "id": "security-automatic-migrations",
  "configPath": "x-pack/solutions/security/packages/kbn-evals-suite-security-automatic-migrations/playwright.config.ts",
  "serverConfigSet": "evals_rule_migration_v2",
  ...
}
```

Verify the flag was picked up after `evals start` boots Scout:

```bash
grep ruleMigrationGraphv2 target/evals/scout.log
```

It should appear in the Kibana startup args. If absent, the run is on v1 regardless of the config
set edit.

## CI

- **On-demand:** Add label `evals:security-automatic-migrations` to a PR
- **All security suites:** Add label `evals:all`
- **Specific model:** Add label `models:eis/gpt-4.1` alongside the suite label
- **Custom judge:** Add label `models:judge:eis/claude-4.5-sonnet`

## Future Work

- [ ] Expert-curated dataset (5+ Splunk dashboard pairs)
- [ ] Rule migration evaluators (separate initiative, same package)
- [ ] CI weekly scheduled runs
- [ ] Deprecate `DashboardMigrationTaskEvaluator` (LangSmith-coupled placeholder)
