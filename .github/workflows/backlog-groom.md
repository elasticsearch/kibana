---
name: Backlog Grooming Agent
timeout-minutes: 45
description: >-
  Reacts to issues labeled `backlog-groom`, requests clarification when requirements
  are ambiguous, or implements a fix with a linked pull request.
on:
  issues:
    types: [labeled]
  status-comment: true
if: github.event.label.name == 'backlog-groom'
steps:
  - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0
    with:
      node-version-file: '.nvmrc'
      cache: yarn
  - name: Bootstrap Kibana
    run: yarn kbn bootstrap
permissions:
  contents: read
  issues: read
  pull-requests: read
engine:
  id: claude
  version: "2.1.111"
  model: opus
  max-turns: 120
  env:
    ANTHROPIC_API_KEY: ${{ secrets.LITELLM_API_KEY }}
    ANTHROPIC_BASE_URL: https://elastic.litellm-prod.ai
    ENABLE_PROMPT_CACHING_1H: "1"
    ANTHROPIC_DEFAULT_OPUS_MODEL: llm-gateway/claude-opus-4-7[1m]
    ANTHROPIC_DEFAULT_HAIKU_MODEL: llm-gateway/claude-haiku-4-5
    ANTHROPIC_DEFAULT_SONNET_MODEL: llm-gateway/claude-sonnet-4-6
    CLAUDE_CODE_SUBAGENT_MODEL: opus[1m]
tools:
  github:
    toolsets: [default]
    min-integrity: none
runs-on: kibana
network:
  allowed:
    - defaults
    - github
    - node
    - kibana-bazel-remote-h5qd3jkxkq-uc.a.run.app
    - elastic.litellm-prod.ai
checkout:
  fetch-depth: 0
safe-outputs:
  report-failure-as-issue: false
  staged: true
  create-pull-request:
    max: 1
    draft: true
    base-branch: main
    preserve-branch-name: true
  noop:
    max: 1
    report-as-issue: false
---

# Backlog Grooming Agent

This workflow is triggered after an issue is labeled `backlog-groom`. Process that issue and produce **exactly one** outcome:

- **Ambiguous / needs design** → use `noop`
- **Clear and fixable** → implement, validate, and open one PR with `create-pull-request`

## Phase 0: Load issue context

Use GitHub tools. Read the issue whose number is `GH_AW_GITHUB_EVENT_ISSUE_NUMBER` from `<github-context>`. Extract the reported behavior, expected behavior, acceptance criteria, and code areas to change.

## Phase 1: Ambiguity / design check → `noop`

Use `noop` when **any** of these is true (non-exhaustive; apply judgment):

- Multiple **valid** technical approaches with materially different behavior or maintenance cost, and the issue does not specify which product behavior is intended.
- Requires **API design** (new endpoints, request/response shape, breaking changes) or **public contract** changes without an agreed spec.
- Touches **user-visible behavior** (copy, defaults, UX flows) and the issue does not define acceptance criteria.
- Needs **policy or permission** decisions (security, authz, data retention) not stated in the issue.
- Depends on **information only a human can supply** (account state, cluster config, intended deprecation timeline).

**If ambiguous:** use `noop` (see **noop output** below). List specific questions and exactly what decision is needed to proceed. Tags: `needs-clarification`, plus `api-design` | `ux` | `product` | `security` | `breaking-change` as applicable.

**If clear:** proceed to Phase 2.

## Phase 2: Implementation → `create-pull-request`

1. Read surrounding production code until you can state the **root cause** in one sentence tied to file/line logic—do not guess.
2. Implement the minimal fix on branch `backlog-groom/issue-<issue_number>` (issue number from `<github-context>`).
3. Validate using these exact commands (scope paths to changed packages/plugins):

```bash
node scripts/eslint --fix $(git diff --name-only)
node scripts/type_check --project <path/to/tsconfig.json>
node scripts/jest <path/to/affected.test.ts>
node scripts/check_changes.ts
```

Run **each** that applies after edits. Fix failures before opening a PR. If a check is not applicable (no TS change), skip it and say why in the PR body.

4. Open **exactly one** PR via `create-pull-request` safe output:
   - `head`: `backlog-groom/issue-<issue_number>`
   - `base`: `main`
   - `draft`: `true`
   - include required PR body content from the contract below

## Pull request contract (MUST)

- MUST use branch `backlog-groom/issue-<issue_number>` (base branch `main` and draft mode are enforced by config).
- MUST include `Closes #<issue_number>` in the PR body.
- MUST summarize what changed, why, and how it maps to the issue—no unrelated work.
- MUST reference which validation commands ran and their results (pass/skip + reason).
- MUST use `create-pull-request` safe output (do NOT open the PR by other means).

## noop output (MUST)

Every `noop` MUST include:

- **Why blocked:** one sentence stating why implementation cannot proceed safely.
- **Questions:** explicit decisions needed from maintainers.
- **Tags:** 1–3 short labels from `needs-clarification`, `api-design`, `ux`, `product`, `security`, `breaking-change`.

## Guardrails

Do NOT open more than one PR for the same issue.

Do NOT change the branch naming convention.

Do NOT run deduplication or staleness analysis in this workflow.

Do NOT implement when Phase 1 applies—use `noop` instead.

Do NOT broaden scope beyond the triggering issue.

Do NOT land changes without running the applicable commands in Phase 2.
