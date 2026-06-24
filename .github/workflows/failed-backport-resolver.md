---
name: Failed Backport Resolver
description: Resolve failed automatic backports by cherry-picking the merged PR into active version branches and creating backport PRs.
on:
  issue_comment:
    types: [created]
  workflow_dispatch:
    inputs:
      pr_number:
        description: Pull request number with failed backports
        required: true
        type: string
  bots:
    - kibanamachine
resources:
  - prefetch-pr-context.yml

if: >-
  !github.event.repository.fork &&
  (
    github.event_name == 'workflow_dispatch' ||
    (
      github.event_name == 'issue_comment' &&
      github.event.issue.pull_request &&
      github.event.comment.user.login == 'kibanamachine' &&
      (
        contains(github.event.comment.body, 'Some backports could not be created') ||
        contains(github.event.comment.body, 'All backports failed')
      )
    )
  )

concurrency:
  group: >-
    ${{
      (
        github.event_name == 'workflow_dispatch' ||
        (
          github.event_name == 'issue_comment' &&
          github.event.issue.pull_request &&
          github.event.comment.user.login == 'kibanamachine' &&
          (
            contains(github.event.comment.body, 'Some backports could not be created') ||
            contains(github.event.comment.body, 'All backports failed')
          )
        )
      ) &&
      format('failed-backport-resolver-{0}', github.event.issue.number || github.event.inputs.pr_number) ||
      format('failed-backport-resolver-{0}', github.run_id)
    }}
  cancel-in-progress: false

permissions:
  contents: read
  issues: read
  pull-requests: read

env:
  PR_NUMBER: &pr_number ${{ github.event.issue.number || github.event.inputs.pr_number }}
  PR_CONTEXT_ARTIFACT_NAME: &pr_context_artifact_name prefetched-pr-context-${{ github.event.issue.number || github.event.inputs.pr_number }}

runs-on: kibana
timeout-minutes: 120

engine:
  id: claude
  version: "2.1.165"
  model: opus
  max-turns: 120
  env:
    ANTHROPIC_API_KEY: ${{ secrets.LITELLM_API_KEY }}
    ANTHROPIC_BASE_URL: https://elastic.litellm-prod.ai
    ENABLE_PROMPT_CACHING_1H: "1"
    ANTHROPIC_DEFAULT_OPUS_MODEL: llm-gateway/claude-opus-4-8[1m]
    ANTHROPIC_DEFAULT_HAIKU_MODEL: llm-gateway/claude-haiku-4-5
    ANTHROPIC_DEFAULT_SONNET_MODEL: llm-gateway/claude-sonnet-4-6
    CLAUDE_CODE_EFFORT_LEVEL: high
    CLAUDE_CODE_SUBAGENT_MODEL: opus[1m]

tools:
  github:
    toolsets: [default, search]
    min-integrity: none
  bash: true

network:
  allowed:
    - defaults
    - github
    - registry.npmjs.org
    - registry.yarnpkg.com
    - kibana-bazel-remote-h5qd3jkxkq-uc.a.run.app
    - elastic.litellm-prod.ai

sandbox:
  agent: awf

safe-outputs:
  activation-comments: true
  footer: true
  report-failure-as-issue: false
  add-comment:
    max: 2
    target: *pr_number
    discussions: false
  create-pull-request:
    max: 8
    labels: [backport]
    draft: false
    auto-close-issue: false
    allowed-base-branches:
      - "8.19"
      - "9.*"
    fallback-as-issue: false
    protected-files: allowed
  assign-to-user:
    max: 8
    target: "*"

strict: false
jobs:
  prefetch_pr_context:
    permissions:
      contents: read
      issues: read
      pull-requests: read
    uses: ./.github/workflows/prefetch-pr-context.yml
    with:
      pr_number: *pr_number
      repo: ${{ github.repository }}
      artifact_name: *pr_context_artifact_name
steps:
  - name: Download prefetched PR context
    uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1
    with:
      name: ${{ env.PR_CONTEXT_ARTIFACT_NAME }}
      path: /tmp/gh-aw/agent
  - name: Fetch backport refs
    run: |
      set -euo pipefail

      source_sha="$(jq -r '.mergeCommit.oid // empty' /tmp/gh-aw/agent/pr-metadata.json)"
      if [ -z "${source_sha}" ]; then
        echo "No mergeCommit.oid found for PR ${PR_NUMBER} in prefetched metadata" >&2
        exit 1
      fi
      git fetch --no-tags --depth=2 origin "${source_sha}"

      jq -r '.versions[].branch' versions.json | while read -r branch; do
        git fetch --no-tags --depth=1 origin "+refs/heads/${branch}:refs/remotes/origin/${branch}"
      done
---

# Failed Backport Resolver

Resolve failed automatic backports for the pull request identified by the injected `GH_AW_GITHUB_EVENT_ISSUE_NUMBER` value for PR comments, or `GH_AW_GITHUB_EVENT_PULL_REQUEST_NUMBER` when present. Use the injected `GH_AW_GITHUB_REPOSITORY` and `GH_AW_GITHUB_RUN_ID` values to construct the workflow run URL as `https://github.com/<GH_AW_GITHUB_REPOSITORY>/actions/runs/<GH_AW_GITHUB_RUN_ID>`.

## Parent Workflow

1. Read `/tmp/gh-aw/agent/pr-metadata.json` and `/tmp/gh-aw/agent/pr-issue-comments.json`. Use those prefetched files as the source of truth for PR metadata and comments, and capture `author.login` from `pr-metadata.json` as the source PR author login. Also read `crossReferencedPulls` from `pr-metadata.json`; it contains compact metadata for pull requests that GitHub cross-referenced from the source PR timeline.
2. From `pr-issue-comments.json`, use the latest `kibanamachine` comment whose body contains `Some backports could not be created` or `All backports failed`.
3. Parse that comment for target branches that failed. A failed branch is any branch row whose result says `Backport failed because of merge conflicts`, or an equivalent failure row under the matching failure heading.
4. Read `versions.json` and build the active branch allowlist from `versions[].branch`. Drop any parsed failed branch that is not in that allowlist, and mention the skipped branch in the final comment.
5. Read `.backportrc.json` for non-branch PR conventions only. Ignore branch lists in `.backportrc.json`; active branches come from `versions.json`.
6. Before starting a target branch, inspect only source PR-local data for an existing backport: `pr-metadata.json`, `crossReferencedPulls`, `pr-issue-comments.json`, and any PRs directly linked from those comments or the source PR body. Treat an open PR as existing only when it has the `backport` label and targets the same branch. Do not perform broad repository PR searches.
7. If every remaining failed branch already has an existing open backport PR, call `add_comment` exactly once with the final comment table, use status `existing` for those branches, and do not launch branch workers.
8. Create the shared parent directory for worker worktrees by running `mkdir -p /tmp/gh-aw-worktrees`.
9. For each remaining target branch, launch one parallel task with the `backport-branch-worker` sub-agent defined in `.claude/agents/backport-branch-worker.md`. Pass only the source PR number, source PR title, source PR URL, source PR author login, source branch, source merge commit SHA, target branch, repository from `GH_AW_GITHUB_REPOSITORY`, and the workflow run URL built from `GH_AW_GITHUB_REPOSITORY` and `GH_AW_GITHUB_RUN_ID`.
   - Do not rewrite or expand the worker instructions when launching the task. Do not add branch naming, PR body, safe-output tool, git push, draft PR, fallback, retry, test, or validation instructions beyond the input values listed above.
   - Branch workers are the only tasks that may call `create_pull_request`, and only for a branch whose worker result is `created`.
   - The parent workflow must never call `create_pull_request` for a branch, including to retry, repair, or replace a worker output.
10. Wait for every branch task to finish. Do not stop after the first failure.
11. Treat each branch worker's returned structured result as the source of truth for that branch. Do not reinterpret, rewrite, or replace the worker's `status`, `summary`, `conflicted_files`, or `pr_title` except for the explicit validation notes below.
   - A `created` result requires that branch worker call `create_pull_request` exactly once with a `temporary_id` and `assign_to_user` exactly once using that same temporary reference.
   - A `needs manual backport` or `failed` result must not have a `create_pull_request` call for that branch. If a branch worker reports either status after requesting a PR, keep the worker's returned status and append a concise contract-violation note to the final comment result.
   - If a branch worker returns `created` without a matching `assign_to_user` call, keep the branch status as `created` and append `Assignment request missing.` to the final comment result.
12. Post exactly one final `add_comment` following the exact template below after all branch tasks finish. Include a compact table with `Branch`, `Status`, and `Result`. Use statuses: `created`, `existing`, `skipped`, `needs manual backport`, or `failed`. The status for each worker branch must match the validated status from step 11. Do not fabricate PR URLs; gh-aw safe outputs will attach related created PRs to the comment after processing.
   - Keep every `Result` cell to one concise sentence that is under 80 characters.
   - For conflicts or manual-backport cases, summarize the blocker category. Do not include long conflict explanations, implementation analysis, or full file lists in the table.
   - For created PR requests, use a short phrase such as `Created backport PR.` If assignment was missing, append `Author assignment request missing.`
   - Do not add diagnostic paragraphs after the table; workflow logs and the agent summary contain detailed run information.

## Final Comment Template

Use this shape for the final source PR comment:

```markdown
## Backport resolution attempt complete

| Branch | Status | Result |
| --- | --- | --- |
| 8.19 | created | Created backport PR. |
| 9.4 | needs manual backport | Structural OAS conflicts need manual resolution; see workflow logs. |

These backports were prepared by an agent. Please review the generated PRs carefully before merging.

```

