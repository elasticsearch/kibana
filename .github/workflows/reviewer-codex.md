---
name: Codex Reviewer
on:
  pull_request_target:
    types: [synchronize, reopened, labeled]
  workflow_dispatch:
    inputs:
      pr_number:
        description: Pull request number to review
        required: true
        type: string
      comment_id:
        description: Triggering comment id for dispatched follow-up runs
        required: false
        type: string
  bots:
    - github-actions[bot]
    - kibanamachine
resources:
  - prefetch-pr-context.yml
imports:
  - .github/agents/code-reviewer.md
timeout-minutes: 20
engine:  
  id: codex
  model: gpt-5.5
  args:
    - -c
    - model_context_window=1050000
    - -c
    - model_reasoning_summary=auto
  env:
    CODEX_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
    OPENAI_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
    OPENAI_BASE_URL: https://openrouter.ai/api/v1
# Activation rules:
# - Manual runs always activate.
# - Reviewer label events activate, including labels added while creating a PR.
# - Synchronize/reopened PR events activate when the reviewer label is already present.
# - Comment follow-up runs are dispatched by Reviewer Comment Dispatcher after fork-safe validation.
if: >-
  !github.event.repository.fork &&
  (
    github.event_name == 'workflow_dispatch' ||
    (
      github.event.sender.type != 'Bot' &&
      !contains(github.event.pull_request.labels.*.name, 'reviewer:skip-ai') &&
      github.event_name == 'pull_request_target' &&
      (
        (
          github.event.action == 'labeled' &&
          github.event.label.name == 'reviewer:codex'
        ) ||
        (
          github.event.action != 'labeled' &&
          contains(github.event.pull_request.labels.*.name, 'reviewer:codex')
        )
      )
    )
  )
concurrency:
  # Keep one review lane per PR/comment. Unrelated label events get their own group suffix so they can skip without canceling an in-flight review.
  group: >-
    gh-aw-${{ github.workflow }}-${{ github.event.pull_request.number || github.event.inputs.pr_number || github.run_id }}-${{
      github.event.inputs.comment_id ||
      (
        github.event.action == 'labeled' &&
        github.event.label.name != 'reviewer:codex' &&
        github.event.label.name != 'reviewer:skip-ai' &&
        github.event.label.name
      ) ||
      'pr-review'
    }}
  cancel-in-progress: true
  job-discriminator: ${{ github.event.pull_request.number || github.event.inputs.pr_number || github.run_id }}
permissions:
  contents: read
  issues: read
  pull-requests: read
env:
  PR_NUMBER: &pr_number ${{ github.event.pull_request.number || github.event.inputs.pr_number }}
  PR_CONTEXT_ARTIFACT_NAME: &pr_context_artifact_name prefetched-pr-context-${{ github.event.pull_request.number || github.event.inputs.pr_number }}
  REVIEWER_COMMENT_ID: ${{ github.event.inputs.comment_id }}
tools:
  github:
    toolsets: [default]
    min-integrity: none
network:
  allowed:
    - defaults
    - github
    - chatgpt.com
    - openrouter.ai
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
safe-outputs:
  footer: true
  report-failure-as-issue: false
  noop:
    report-as-issue: false
  dispatch-workflow:
    workflows:
      - reviewer-autofix-applier
    max: 1
  create-pull-request-review-comment:
    max: 10
    target: ${{ env.PR_NUMBER }}
  submit-pull-request-review:
    max: 1
    target: ${{ env.PR_NUMBER }}
    allowed-events: [COMMENT]
    footer: if-body
  add-comment:
    max: 1
    target: ${{ env.PR_NUMBER }}
    discussions: false
  reply-to-pull-request-review-comment:
    max: 10
    target: ${{ env.PR_NUMBER }}
  resolve-pull-request-review-thread:
    max: 10
# Codex engine does not expose workflow env vars like PR_NUMBER and REVIEWER_COMMENT_ID to shell tools through -c `include_only [...]`, so render this follow-up context directly in the prompt.
---

# Codex PR Reviewer

Using the imported reviewer instructions:
- Run in review mode for `pull_request_target` and manual `workflow_dispatch` events without a comment id.
- Run in follow-up response mode when `workflow_dispatch` includes a comment id from the Reviewer Comment Dispatcher.
- This reviewer's own gh-aw workflow id is `reviewer-codex`. Use it as "this reviewer's own workflow id" when matching review threads to resolve.

For dispatched follow-up runs, use this context:
- PR number: `${{ github.event.inputs.pr_number }}`
- Comment id: `${{ github.event.inputs.comment_id }}`

For reviewer autofix dispatches, use this context:
- Reviewer run id: `${{ github.run_id }}`
- Requester login: `${{ github.actor }}`
- PR head SHA from event, when available: `${{ github.event.pull_request.head.sha }}`
