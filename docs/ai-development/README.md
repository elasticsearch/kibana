# Kibana AI tools (Cursor rules + skills)

This directory contains Cursor rules, skills, and a root `CLAUDE.md` for the Kibana repo. Run the setup script to install them into your checkout so AI assistants follow Kibana conventions and can use the provided skills.

## Quick install (recommended)

From the **Kibana repo root**:

```bash
./docs/ai-development/setup-ai-tools.sh
```

This installs into the current repo. To install into a different Kibana root (e.g. another worktree):

```bash
./docs/ai-development/setup-ai-tools.sh /path/to/kibana
```

Then verify:

```bash
./docs/ai-development/validate-ai-setup.sh
```

Install completes in under a minute (copy only; no network).

## Manual setup

1. From the repo root, copy:
   - `docs/ai-development/CLAUDE.md` → Kibana repo **root** (same level as `package.json`).
   - `docs/ai-development/rules/` → `<kibana_root>/.cursor/rules/` (create `.cursor` if it doesn’t exist).
   - `docs/ai-development/skills/` → `<kibana_root>/.cursor/skills/`.

2. Verify with `./docs/ai-development/validate-ai-setup.sh` or open the repo in Cursor and confirm rules/skills are available.

Note: Kibana gitignores `.cursor/`. The install copies from this tracked directory into `.cursor/` so your local AI setup stays out of version control.

## What’s included

- **CLAUDE.md** — Project overview, build/test commands, architecture summary, “where does this go?” guidance.
- **Rules** (`rules/*.mdc`) — TypeScript, plugin architecture, testing, React/EUI, CI and draft PR workflow, saved objects.
- **Skills** (`skills/*/SKILL.md`) — Step-by-step guides with validation:
  - create-kibana-plugin — scaffold new plugin
  - add-http-route — HTTP route with validation and FTR API test
  - create-saved-object — saved object type, modelVersions, CRUD
  - write-jest-test — Jest unit test
  - write-ftr-api-test — FTR API integration test
  - write-ftr-functional-test — FTR functional (UI) test with page objects
  - prepare-pr — type-check, lint, i18n, tests, commit message
  - ci-preflight — run same checks CI runs locally
  - interpret-ci-failure — parse CI logs and suggest fix
  - debug-server — debug server errors from stack trace

## Optional: Semantic code search

For semantic search over the Kibana codebase (e.g. “find where session tokens are validated”), use the official [elastic/semantic-code-search-mcp-server](https://github.com/elastic/semantic-code-search-mcp-server). Index this repo with the [semantic-code-search-indexer](https://github.com/elastic/semantic-code-search-indexer), then run the MCP server (stdio or Docker) and add it to your Cursor MCP config. Tools include `semantic_code_search`, `symbol_analysis`, `read_file_from_chunks`, and the StartInvestigation prompt.

## Troubleshooting

### Cursor doesn’t show the rules or skills

- Ensure you ran the setup script (or manual copy) and opened the **Kibana repo root** as the workspace. Reload the window (Command Palette → “Developer: Reload Window”) after installing.

### validate-ai-setup.sh reports MISSING

- Run from repo root: `./docs/ai-development/validate-ai-setup.sh` or pass the Kibana root as the first argument.

### Setup script fails with “does not look like a Kibana root”

- The path must be the repo root that contains `package.json`. When run with no arguments from repo root, the script uses the repo root automatically.

### After setup, CI still fails

- Use the **prepare-pr** skill (or run manually): type check, eslint, i18n, and affected tests. On **draft** PRs, comment **`/ci`** on the PR to trigger the pipeline.

## Updating

Re-run the setup script after pulling changes to `docs/ai-development/`:

```bash
./docs/ai-development/setup-ai-tools.sh
```

Existing files in `.cursor/rules/` and `.cursor/skills/` are overwritten. Back up custom rules or skills first if needed.
