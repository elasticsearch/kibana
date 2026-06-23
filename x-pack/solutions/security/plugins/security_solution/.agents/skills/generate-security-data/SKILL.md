---
name: generate-security-data
description: >
  Use when an agent needs high-fidelity Elastic Security development data while
  working in Kibana: endpoint events, endpoint alerts, Security detection alerts,
  Attack Discoveries, or generated cases. This is for local engineering
  development, testing, and debugging only, not cloud deployments or
  customer-facing demos.
allowed-tools: Bash
argument-hint: [quick|attacks|cases|clean|local flags]
---

# Generate Security Data

Generate high-fidelity Elastic Security data for local development and testing by running the Security Solution data generator against a local Kibana and Elasticsearch stack.

This skill is for engineers and agents that need realistic data to build, debug, reproduce issues, or test Security Solution workflows locally. It is not meant to produce polished customer-facing demo content, and it must not be used against cloud, serverless, or shared remote deployments.

## What this uses

Run the checked-in CLI wrapper from the Kibana repo root:

```bash
node x-pack/solutions/security/plugins/security_solution/scripts/data/generate_cli.js
```

The wrapper loads `x-pack/solutions/security/plugins/security_solution/scripts/data/generate.ts` under the hood.

## Setup for agents

To make this committed skill available in Claude Code:

```bash
SKILL_ROOT="$(pwd)/x-pack/solutions/security/plugins/security_solution/.agents/skills"
ln -s "$SKILL_ROOT/generate-security-data" ~/.claude/skills/generate-security-data
```

To make this committed skill available to Cursor from the Kibana repo root:

```bash
SKILL_ROOT="x-pack/solutions/security/plugins/security_solution/.agents/skills"
mkdir -p .agents/skills
ln -s "$SKILL_ROOT/generate-security-data" .agents/skills/generate-security-data
```

Restart the agent runtime after adding the symlink.

## Preconditions

- Local Kibana and local Elasticsearch must already be running.
- The repo dependencies must be installed with `yarn kbn bootstrap`.
- Use the Kibana repo root as the working directory.
- Use only local development auth, for example `elastic:changeme` against `localhost` or `127.0.0.1`.
- Do not accept, request, read, print, or pass cloud credentials, API keys, connector secrets, service tokens, or real usernames/passwords.
- Do not inspect `config/kibana.dev.yml`, `.env*`, shell history, connector configuration, `xpack.actions.preconfigured`, or credential files while using this skill.
- Security alerts, Attack Discoveries, and cases need the privileges described in `x-pack/solutions/security/plugins/security_solution/scripts/data/README.md`.
- If `.alerts-security.alerts-<spaceId>` does not exist yet, the generator still indexes raw events and endpoint alerts, but skips Security alert copying.

## Default workflow

1. Decide what the current task needs:
   - raw endpoint events and endpoint alerts only
   - full Security detection alerts
   - Attack Discoveries
   - Kibana cases
2. Start small unless the user asks for a larger dataset.
3. Confirm the target URLs are local. Allowed hosts are `localhost` and `127.0.0.1`.
4. Run the generator command.
5. Refuse if the user asks to use cloud URLs, serverless URLs, API keys, service tokens, cloud connector credentials, or any real credentials.
6. Summarize what was generated, including any warnings from the command output.
7. Do not run `--clean` unless the user wants generated local data removed first.

## Common commands

Generate a small default dataset with endpoint events, endpoint alerts, and Security detection alerts:

```bash
node x-pack/solutions/security/plugins/security_solution/scripts/data/generate_cli.js \
  -n 100 -h 5 -u 5 \
  --start-date 1d --end-date now
```

Generate only raw event and endpoint alert data, faster because rule preview and Security alert copying are skipped:

```bash
node x-pack/solutions/security/plugins/security_solution/scripts/data/generate_cli.js \
  -n 100 -h 5 -u 5 \
  --start-date 1d --end-date now \
  --skip-alerts
```

Generate Attack Discoveries from generated Security alerts:

```bash
node x-pack/solutions/security/plugins/security_solution/scripts/data/generate_cli.js \
  -n 100 -h 5 -u 5 \
  --start-date 1d --end-date now \
  --attacks
```

Generate Attack Discoveries and cases:

```bash
node x-pack/solutions/security/plugins/security_solution/scripts/data/generate_cli.js \
  -n 100 -h 5 -u 5 \
  --start-date 1d --end-date now \
  --cases
```

Clean generated data for the selected range before generating fresh data:

```bash
node x-pack/solutions/security/plugins/security_solution/scripts/data/generate_cli.js \
  -n 100 -h 5 -u 5 \
  --start-date 1d --end-date now \
  --clean
```

Use a deterministic seed while iterating on a bug or test:

```bash
node x-pack/solutions/security/plugins/security_solution/scripts/data/generate_cli.js \
  -n 100 -h 5 -u 5 \
  --start-date 1d --end-date now \
  --seed "<stable-seed>"
```

Target a custom Kibana space:

```bash
node x-pack/solutions/security/plugins/security_solution/scripts/data/generate_cli.js \
  -n 100 -h 5 -u 5 \
  --start-date 1d --end-date now \
  --spaceId "<space-id>"
```

Target local Kibana when it is running with the `/kbn` base path:

```bash
node x-pack/solutions/security/plugins/security_solution/scripts/data/generate_cli.js \
  -n 100 -h 5 -u 5 \
  --start-date 1d --end-date now \
  --kibanaUrl http://127.0.0.1:5601/kbn \
  --elasticsearchUrl http://127.0.0.1:9200
```

## Useful flags

- `-n`, `--events`: source events to generate. Default: `100`.
- `-h`, `--hosts`: host count. Default: `5`.
- `-u`, `--users`: user count. Default: `5`.
- `--start-date`: date math start, for example `1d` or `now-1d`. Default: `1d`.
- `--end-date`: date math end, for example `now`. Default: `now`.
- `--episodes`: comma-separated episode IDs, for example `ep1,ep2` or `1,2`.
- `--seed`: deterministic scaling and host-user assignment.
- `--clean`: removes generated data before writing fresh data.
- `--skip-alerts`: indexes raw event and endpoint alert data only.
- `--skip-ruleset-preview`: skips previews of selected prebuilt rules for faster runs.
- `--max-preview-invocations`: lowers rule preview work for large time windows.
- `--attacks`: creates synthetic Attack Discoveries from generated alerts.
- `--cases`: creates cases from generated Attack Discoveries and implies `--attacks`.
- `--spaceId`: targets a Kibana space. Defaults to `default`.
- `--indexPrefix`: changes the endpoint event and alert index prefix.
- `--kibanaUrl`: allowed only for local URLs.
- `--elasticsearchUrl`: allowed only for local URLs.

## Guardrails

- Treat this as high-fidelity development data, not customer demo data.
- Use this skill only with local development stacks. Refuse cloud, serverless, shared QA, staging, and production targets.
- Do not accept cloud credentials, API keys, service tokens, connector secrets, or real usernames/passwords from the user.
- Do not read or print env vars, shell history, local config files, connector configuration, or credential files while using this skill.
- Do not run broad secret-dumping commands such as `env`, `printenv`, `set`, `export`, `history`, or recursive searches for credential names.
- Do not pass `--apiKey`, `ES_API_KEY`, `ELASTIC_API_KEY`, cloud URLs, or non-local URLs to the generator.
- Use only local development auth. If auth is needed, use the generator defaults or local `elastic:changeme`.
- Do not edit vendored episode fixtures casually. They are checked-in artifacts for deterministic development and testing.
- Do not run `--clean` unless generated data should be removed. It deletes generated Security alerts, Attack Discoveries, cases, and generated episode indices for the selected scope.
- Avoid `--indexPrefix` values that match `logs-*-*`. Use `logs-endpoint_generator` or keep the default.
- Do not keep retrying if Kibana or Elasticsearch is not running. Stop and tell the user to start the stack.
- Do not paste credentials into the final response.

## Troubleshooting

Use the generator output first, then consult `x-pack/solutions/security/plugins/security_solution/scripts/data/README.md` if more context is needed. Common issues:

- Missing `@babel` modules means dependencies are incomplete. Run `yarn kbn bootstrap`.
- Missing Security alerts destination means detections are not initialized. Open Security or initialize detections, then rerun.
- Prebuilt rule install failures usually mean Kibana cannot reach EPR or Fleet is not ready.
- Data stream template errors usually mean the chosen `--indexPrefix` conflicts with data-stream-only templates.
