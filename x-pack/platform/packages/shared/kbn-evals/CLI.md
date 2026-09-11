# Evals CLI Reference

The `node scripts/evals` CLI orchestrates LLM evaluation workflows. All commands support `--help` for inline usage.

## Workflow overview

```
start  -->  [iterate: start again]  -->  stop
  |  ^
  |  +-- runs EDOT, Scout, EIS CCM, then Playwright
  |
  +-- auto-inits config + connectors on first run (or use init separately)
  |
logs (tail background service output)
```

`start` is the only command you need. On first run it auto-detects missing config and connectors, prompting you through setup before starting the stack. Use `init` separately only if you want to run setup in isolation (e.g. exporting `KIBANA_TESTING_AI_CONNECTORS` for use across terminals). Pass `--skip-init` to bypass these checks.

EDOT and Scout run as **persistent background daemons**. They survive between `start` runs so you can iterate on eval suites without waiting for ES/Kibana to restart each time.

## Commands

### `init` -- Set up custom config and connectors (optional)

Interactive wizard that creates a custom config file and discovers EIS models or validates existing connectors. Running `init` separately is **optional** -- `start` auto-triggers setup when config or connectors are missing.

Use `init` when you want to create a config file for a bespoke (non-golden-cluster, non-local) setup, or to export `KIBANA_TESTING_AI_CONNECTORS` to your shell.

```bash
node scripts/evals init
```

EIS connector discovery is automatically skipped when a valid cache exists at `~/.elastic/eis-connectors-cache.json` (7-day TTL). To force re-discovery, delete the cache file and run `init` again.

Discovered EIS models and generated OpenRouter entries are emitted as **inference endpoint definitions** (`actionTypeId: .inference`), not stack connectors: EIS ids bind to endpoints provisioned by EIS/CCM, and OpenRouter endpoints are created on demand during the run. Legacy `.gen-ai` definitions are no longer treated as LLM definitions and silently fall back to a deprecated stack connector, see [Connector definitions and inference endpoints](./README.md#connector-definitions-and-inference-endpoints).

#### `init config` -- Create a custom config file

Creates a config file (`config.json` or `config.<profile>.json`) by prompting for custom URLs and API keys. Use this for bespoke setups only -- golden cluster and local are handled directly by the `start` command's `--profile` flag.

```bash
node scripts/evals init config                       # writes config.json
node scripts/evals init config --profile mysetup     # writes config.mysetup.json
```

### `start` -- Start stack and run a suite

The main command. Starts EDOT + Scout as background daemons, enables EIS CCM if needed, and runs a Playwright eval suite.

When no `--profile` is specified and stdin is a TTY, `start` prompts you to choose an infrastructure target:

```
? How do you want to run evals and export results and traces?
  > Local (localhost ES/Kibana)
    Golden cluster (uses Vault -- no config file needed)
    Custom (create a config file with your own URLs)
```

```bash
node scripts/evals start
node scripts/evals start --profile dev-vault --suite agent-builder
node scripts/evals start --profile local --suite agent-builder
node scripts/evals start --profile mysetup --suite agent-builder
node scripts/evals start --skip-init --suite agent-builder
```

#### Profile resolution

| `--profile` value               | Behavior                                                                                      |
| ------------------------------- | --------------------------------------------------------------------------------------------- |
| `dev-vault` or `golden-cluster` | Read config from Vault at runtime (no file needed). Requires `vault login --method oidc`.     |
| `local`                         | Use `config.local.json` (written automatically with hardcoded localhost defaults if missing). |
| `<name>`                        | Use `config.<name>.json`. If missing + TTY, runs the custom config wizard for that profile.   |
| _(omitted)_                     | Interactive prompt: local / golden-cluster / custom. Required in non-interactive mode.        |

| Flag                             | Alias     | Description                                                                     |
| -------------------------------- | --------- | ------------------------------------------------------------------------------- |
| `--suite <id>`                   |           | Suite to run (interactive prompt if omitted)                                    |
| `--config <path>`                |           | Playwright config path (alternative to `--suite`)                               |
| `--project <id>`                 | `--model` | Connector/model to evaluate (comma-separated for multiple)                      |
| `--evaluation-connector-id <id>` | `--judge` | Connector used for LLM-as-a-judge evaluators                                    |
| `--profile <name>`               |           | Profile for config resolution (see table above)                                 |
| `--datasets-profile <name>`      |           | Override dataset settings (sets `EVAL_KBN_URL`/`EVAL_KBN_API_KEY`)              |
| `--export-profile <name>`        |           | Override export settings (sets `TRACING_ES_URL`, `TRACING_EXPORTERS`)           |
| `--grep <pattern>`               |           | Filter tests by name (passed to Playwright `--grep`)                            |
| `--repetitions <n>`              |           | Number of times to repeat each example                                          |
| `--space-ids <ids>`              |           | Comma-separated spaces to assign datasets and scores to (see [Spaces](#spaces)) |
| `--skip-server`                  |           | Skip EDOT/Scout/EIS startup (use existing services)                             |
| `--skip-init`                    |           | Skip automatic config and connector setup                                       |
| `--dry-run`                      |           | Print configuration and exit without running                                    |

Traces are exported by EDOT to the export cluster (controlled by `--export-profile` / `TRACING_ES_URL`), and `TRACING_ES_URL` is set so trace-based evaluators query the right cluster.

#### Spaces

Without `--space-ids`, a run writes its datasets and scores to the default space, as it always has. With it, the run works from the first space listed (requests go to `/s/<space>`), and assigns what it writes to all of them:

```bash
node scripts/evals run --suite streams --space-ids marketing
node scripts/evals run --suite streams --space-ids marketing,sales
```

- **Order matters.** A dataset's id is derived from the space the run works in, so `marketing,sales` and `sales,marketing` produce two different datasets. Keep the order stable for a given run, or its results will land next to a second copy of the dataset rather than the first.
- **Privileges.** The API key needs the `manage_evals` privilege in every space listed, and each space has to exist: an unknown id fails the run rather than creating something unreachable.
- **Existing datasets keep the spaces they have.** A run only assigns spaces to datasets it creates, so a CI run can't move one that other spaces are reading.
- **`compare` takes the same flag.** Scores are only readable from the spaces they were ingested into, so comparing a space-targeted run needs `node scripts/evals compare … --space-ids marketing` (or `EVAL_SPACE_IDS`).

#### Example: golden datasets + local export

Use `--profile dev-vault` for datasets and `--export-profile local` to export results locally:

```bash
node scripts/evals init config                   # default profile (golden cluster pre-selected)
node scripts/evals init config --profile local   # local profile (local target pre-selected)
```

Run:

```bash
node scripts/evals start --suite attack-discovery --export-profile local
node scripts/evals start --suite attack-discovery --datasets-profile dev-vault --export-profile local
```

### `stop` -- Stop background services

```bash
node scripts/evals stop
node scripts/evals stop --service scout
node scripts/evals stop --service edot
```

| Flag               | Description                                     |
| ------------------ | ----------------------------------------------- |
| `--service <name>` | Stop only `edot` or `scout` (default: stop all) |

### `logs` -- Tail service logs

```bash
node scripts/evals logs
node scripts/evals logs --service scout
node scripts/evals logs --service edot --from-start
```

| Flag               | Description                                                        |
| ------------------ | ------------------------------------------------------------------ |
| `--service <name>` | Tail only `edot` or `scout` (default: both)                        |
| `--from-start`     | Show logs from the beginning (default: tail from current position) |

### `scout` -- Start Scout standalone

Convenience wrapper around `node scripts/scout.js start-server` with evals defaults (`--arch stateful --domain classic --serverConfigSet evals_tracing`). Extra flags are forwarded to Scout.

```bash
node scripts/evals scout
```

Use this when you want to manage Scout separately from the `start` workflow.

### `run` -- Run a suite (no service management)

Runs a Playwright eval suite without managing EDOT/Scout. Use this when you already have services running (via `start`, `scout`, or manually).

```bash
node scripts/evals run --suite agent-builder --judge bedrock-claude
node scripts/evals run --suite agent-builder --grep "product documentation"
node scripts/evals run --suite streams --dry-run
```

| Flag                              | Alias     | Description                                                                     |
| --------------------------------- | --------- | ------------------------------------------------------------------------------- |
| `--suite <id>`                    |           | Suite to run (interactive prompt if omitted)                                    |
| `--config <path>`                 |           | Playwright config path (alternative to `--suite`)                               |
| `--project <id>`                  | `--model` | Connector/model to evaluate                                                     |
| `--evaluation-connector-id <id>`  | `--judge` | Connector for LLM-as-a-judge evaluators                                         |
| `--grep <pattern>`                |           | Filter tests by name (passed to Playwright `--grep`)                            |
| `--repetitions <n>`               |           | Repeat each example N times                                                     |
| `--space-ids <ids>`               |           | Comma-separated spaces to assign datasets and scores to (see [Spaces](#spaces)) |
| `--profile <name>`                |           | Load both dataset + export settings from `config.<name>.json`                   |
| `--datasets-profile <name>`       |           | Load dataset settings from `config.<name>.json`                                 |
| `--export-profile <name>`         |           | Load export settings from `config.<name>.json`                                  |
| `--trace-es-url <url>`            |           | Elasticsearch URL for trace queries                                             |
| `--trace-es-api-key <key>`        |           | API key for trace ES                                                            |
| `--evaluations-kbn-url <url>`     |           | Kibana URL for score ingestion and dataset operations                           |
| `--evaluations-kbn-api-key <key>` |           | API key for the target Kibana                                                   |
| `--dry-run`                       |           | Print the Playwright command and exit                                           |

### `list` -- List available suites

```bash
node scripts/evals list
node scripts/evals list --refresh
node scripts/evals list --json
```

| Flag        | Description                        |
| ----------- | ---------------------------------- |
| `--refresh` | Re-scan the repo for suite configs |
| `--json`    | Output as JSON                     |

### `doctor` -- Check prerequisites

```bash
node scripts/evals doctor
node scripts/evals doctor --fix
```

| Flag    | Description                         |
| ------- | ----------------------------------- |
| `--fix` | Attempt to auto-fix detected issues |

### `compare` -- Compare eval runs

```bash
node scripts/evals compare <run-id-a> <run-id-b>
```

### `env` -- List environment variables

```bash
node scripts/evals env
```

### `ci-map` -- Output CI label mapping

```bash
node scripts/evals ci-map
node scripts/evals ci-map --json
```

| Flag     | Description    |
| -------- | -------------- |
| `--json` | Output as JSON |

## Tips

**Fast iteration:** Use `--grep` to run a single test within a large suite:

```bash
node scripts/evals start --suite agent-builder --grep "product documentation" --model eis-gpt-4.1
```

**Reuse services:** After the first `start`, EDOT and Scout stay alive. Subsequent `start` runs detect them and skip to step 3 (EIS CCM) or step 4 (Playwright). This cuts iteration time significantly.

**Multiple models:** Pass comma-separated model IDs to `--model`:

```bash
node scripts/evals start --suite agent-builder --model eis-gpt-4.1,eis-claude-4-sonnet
```

**View traces locally:** EDOT exports traces to the cluster configured by your profile's tracing settings. Open your local Kibana at `http://localhost:5601` to view APM traces and LLM spans.
