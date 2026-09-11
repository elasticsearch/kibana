# @kbn/evals-extensions

Experimental and advanced extensions for `@kbn/evals`.

This package is the home for evals capabilities that are experimental or too specialized to live in the core `@kbn/evals` framework. Mature features can later graduate into `@kbn/evals`.

## What lives here

- **Custom CLI commands** under the `ext` namespace, run via `node scripts/evals ext <command>`.

## Architecture

This package depends on `@kbn/evals`, never the other way around:

- `kbn-evals-extensions` CAN import from `kbn-evals`
- `kbn-evals` MUST NOT import from `kbn-evals-extensions`
- Evaluation suites can use both packages independently

## Usage

### CLI

```bash
node scripts/evals ext --help

node scripts/evals ext [command] [...args]
```

### Matrix configs

| Config | Shape | Use |
|---|---|---|
| `config/security_matrix.json` | 32 columns | Full board: persona + attack-discovery slices + migrations |
| `config/security_matrix_persona.json` | 21 columns | Persona columns only — the column set the published persona matrix uses |

`security_matrix_persona.json` is `security_matrix.json` restricted to the column
ids in the persona suite's `persona_matrix.production.config.json`. Its scores are
identical to the full board's; only `overall` differs, because it averages over 21
columns instead of 32. Boards built from the two configs are therefore **not**
comparable on `overall`.

### Regenerating a board from golden

```bash
source ~/.elastic/golden-cluster-env.sh

# 1. Aggregate scores (applies the scoring policy, emits a .policy.json stamp)
OUT_JSON=/tmp/aggregated.json node --require ./src/setup_node_env \
  x-pack/platform/packages/shared/kbn-evals-extensions/scripts/extract_golden_aggregate.ts

# 2. Build the trace cache — the renderer refuses to publish a board without it
python3 scripts/orca_vm/build_trace_cache.py --out /tmp/trace_cache.json

# 3. Render
AGGREGATED_JSON=/tmp/aggregated.json \
TRACES_JSON=/tmp/trace_cache.json \
MATRIX_CONFIG=x-pack/platform/packages/shared/kbn-evals-extensions/config/security_matrix_persona.json \
OUT_DIR=target/persona_board \
  node --require ./src/setup_node_env \
  x-pack/platform/packages/shared/kbn-evals-extensions/scripts/render_from_golden.ts
```

The renderer refuses to emit a board when the extract cannot satisfy the config —
too few cells resolve, `examplePrefixes` columns with no `prefix:` keys, a scoring
policy the extract did not apply, or missing traces. Each refusal names the cause
and its override (`ALLOW_UNENFORCED_SCORING=1`, `ALLOW_NO_TRACES=1`); a scores-only
board publishes numbers with no transcript behind them, so override deliberately.

Pin a single grader with `JUDGE_MODEL_ID=<id>` on the extract step. Note that
golden is mixed-judge: pinning drops every cell graded by anyone else, and the
published provenance reports the real mix rather than asserting one judge.

### In an evaluation suite

Suites opt in to extension features by importing them from `@kbn/evals-extensions` explicitly, alongside `@kbn/evals` core:

```typescript
import { evaluate } from '@kbn/evals';
import { createSomeEvaluator } from '@kbn/evals-extensions';

evaluate('my suite', async ({ executorClient }) => {
  await executorClient.runExperiment({ datasets: [dataset], task }, [
    // mix core and extension evaluators
    createSomeEvaluator(),
  ]);
});
```
