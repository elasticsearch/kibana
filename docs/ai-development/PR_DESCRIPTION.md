## Summary

This PR adds **AI development tools** to the Kibana repo so that Cursor (and other AI coding assistants) can follow Kibana conventions and use guided workflows. It is the first phase of the [kibana-codebase-ai-plugin](https://github.com/elastic/kibana/issues/TBD) initiative, which responds to the CTO’s Feb 2026 all-hands mandate: *"We need to add skills and MD files that teach the LLMs our coding practices and help them understand how to code against our repositories."*

**No runtime or CI behavior changes.** All content lives under `docs/ai-development/` and is installed into `.cursor/` (gitignored) by an optional setup script. Engineers opt in by running the script.

---

## Why

- **Low adoption:** A key blocker to AI tool adoption is that assistants generate code that doesn’t match Kibana’s style, fails CI, or breaks architectural boundaries. This leads engineers to conclude that “AI isn’t ready for complex codebases.”
- **Root cause:** Large repos need **rules**, **skills**, and **context** that teach LLMs the codebase’s conventions, plugin system, testing patterns, and CI workflow. Without that, outputs are inconsistent and hard to review.
- **Goal:** Make Kibana **LLM-friendly** so that the 60% of engineers not yet using AI tools can get to productive, CI-passing contributions quickly (target: same-day setup).

---

## What this PR adds

### 1. **Cursor rules** (`docs/ai-development/rules/`)

Five rule files that Cursor (and similar tools) can load to enforce Kibana conventions:

| Rule | Covers |
|------|--------|
| `kibana-core.mdc` | TypeScript (strict, type-only imports, interfaces), import boundaries, error handling, project structure |
| `kibana-plugin-architecture.mdc` | public/server/common layout, plugin lifecycle (setup/start), dependency injection, cross-plugin contracts |
| `kibana-testing.mdc` | Jest (describe/it, mocks, placement), FTR API tests, FTR functional tests, flakiness and retries |
| `kibana-react-eui.mdc` | Functional components, EUI usage, `data-test-subj`, accessibility, i18n |
| `kibana-ci.mdc` | Type check, eslint, i18n, pre-push checklist, draft PR `/ci` workflow, eslint auto-fix handling |

### 2. **Cursor skills** (`docs/ai-development/skills/`)

Five step-by-step skills with validation so the LLM can verify its own output:

| Skill | Purpose |
|-------|---------|
| **create-kibana-plugin** | Create a new plugin: directory structure, `kibana.jsonc`, lifecycle, basic Jest test |
| **add-http-route** | Add an HTTP route: handler, request/response validation (Zod or config-schema), registration, FTR API test |
| **write-jest-test** | Write a Jest unit test for a module with proper mocks and structure |
| **write-ftr-api-test** | Write an FTR API integration test with service injection and cleanup |
| **prepare-pr** | Run type-check, eslint, i18n, affected tests; suggest commit message; remind about `/ci` on draft PRs |

Each skill includes **validation steps** (e.g. run `node scripts/type_check`, run Jest) so the model checks its work before handing off.

### 3. **Architecture context** (`docs/ai-development/CLAUDE.md`)

A single **CLAUDE.md** that gives LLMs:

- Project overview and common build/test commands
- Plugin system and package boundaries
- “Where does this go?” decision guidance
- Pointers to Cursor setup in the README

It is intended to be copied to the repo root by the setup script so that AI tools see it when the workspace is the Kibana root.

### 4. **Setup and validation** (`docs/ai-development/`)

- **`setup-ai-tools.sh`** — Copies `CLAUDE.md` to the repo root and `rules/` and `skills/` into `.cursor/rules/` and `.cursor/skills/`. Run from repo root: `./docs/ai-development/setup-ai-tools.sh` (or pass another Kibana root). Completes in under a minute.
- **`validate-ai-setup.sh`** — Checks that CLAUDE.md and `.cursor/rules/` and `.cursor/skills/` exist and are readable after setup.
- **`README.md`** — Quick install, manual copy instructions, what’s included, troubleshooting, and how to re-run after updates.

---

## How engineers use it

1. **One-time setup (from repo root):**
   ```bash
   ./docs/ai-development/setup-ai-tools.sh
   ./docs/ai-development/validate-ai-setup.sh
   ```
2. Open the Kibana repo in Cursor (or another tool that respects `.cursor/` and root `CLAUDE.md`).
3. Use the skills (e.g. “create a new plugin”, “add an HTTP route”, “prepare my PR for CI”) and let the rules guide style and structure.

`.cursor/` remains gitignored; only the **source** of the tools lives in `docs/ai-development/`.

---

## Impact

- **Target:** Engineers using Cursor (or similar) on Kibana. No impact on those who don’t run the setup script.
- **Runtime:** None. No new dependencies, no changes to Kibana’s bundle or server.
- **CI:** None. No changes to Buildkite or test configs.
- **Reusability:** This layout (rules + skills + CLAUDE.md + scripts) is intended as a template for other Elastic repos (Elasticsearch, Beats, Fleet, etc.) as part of the broader “AI adoption by Madrid” effort.
- **Metrics (future):** A later phase may add opt-in telemetry and an adoption dashboard; this PR does not include that.

---

## Testing

- Setup and validation scripts were run successfully against a Kibana worktree.
- Rules and skills are written to match current Kibana patterns (plugin layout, FTR, Jest, CI) and can be refined in follow-up PRs based on feedback.

---

## Follow-ups (out of scope for this PR)

- Phase 2: Domain-specific rules (Security, Observability, Search, Saved Objects) and additional skills (saved objects, FTR functional tests, debug-server, CI preflight, interpret-ci-failure, etc.).
- Phase 3: MCP server for semantic code search over the Kibana codebase (Elasticsearch + embeddings).
- Phase 4: Adoption metrics dashboard and repo template framework.
- Phase 5: E2E validation, pilot with teams, Madrid presentation.

---

## Checklist

- [x] No runtime or CI behavior changes
- [x] Content is additive under `docs/ai-development/`
- [x] `.cursor/` remains gitignored; setup script copies from `docs/ai-development/` into `.cursor/`
- [x] README explains install, validate, and troubleshooting
- [x] Scripts are executable and path-agnostic (run from repo root or with explicit Kibana root)
