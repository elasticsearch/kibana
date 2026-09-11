---
name: AlertZero Eval Coverage Reviewer
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
      comment_type:
        description: Triggering comment event type for dispatched follow-up runs
        required: false
        type: string
resources:
  - prefetch-pr-context.yml
imports:
  - .github/agents/alertzero-reviewer.md
  - .github/workflows/shared/app-dex-agents-otel.md
engine:
  id: claude
  version: '2.1.111'
  model: opus
  max-turns: 120
  env:
    ANTHROPIC_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
    ANTHROPIC_BASE_URL: https://openrouter.ai/api
    ANTHROPIC_DEFAULT_OPUS_MODEL: anthropic/claude-opus-4.7[1m]
    ANTHROPIC_DEFAULT_HAIKU_MODEL: anthropic/claude-haiku-4.5
    ANTHROPIC_DEFAULT_SONNET_MODEL: anthropic/claude-sonnet-4.6
    CLAUDE_CODE_SUBAGENT_MODEL: opus[1m]
# Activation rules:
# - Manual runs always activate.
# - reviewer:skip-ai and reviewer:libra suppress PR event activations.
# - Reviewer label events activate, including labels added while creating a PR.
# - Synchronize/reopened PR events activate when the reviewer label is already present.
# - Synchronize events for merge commits are ignored; only code pushes activate a new review.
# - Comment follow-up runs are dispatched by Reviewer Comment Dispatcher after fork-safe validation.
if: >-
  !github.event.repository.fork &&
  (
    github.event_name == 'workflow_dispatch' ||
    (
      github.event.sender.type != 'Bot' &&
      !contains(github.event.pull_request.labels.*.name, 'reviewer:skip-ai') &&
      !contains(github.event.pull_request.labels.*.name, 'reviewer:libra') &&
      github.event_name == 'pull_request_target' &&
      (
        (
          github.event.action == 'labeled' &&
          github.event.label.name == 'reviewer:alertzero'
        ) ||
        (
          github.event.action != 'labeled' &&
          contains(github.event.pull_request.labels.*.name, 'reviewer:alertzero')
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
        github.event.label.name != 'reviewer:alertzero' &&
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
  REVIEWER_COMMENT_TYPE: ${{ github.event.inputs.comment_type }}
tools:
  bash: true
  github:
    toolsets: [default]
    min-integrity: none
network:
  allowed:
    - defaults
    - github
    - openrouter.ai
    - elastic.co
jobs:
  check_reviewable_commit:
    permissions:
      contents: read
    uses: ./.github/workflows/check-reviewable-commit.yml

  prefetch_pr_context:
    needs: check_reviewable_commit
    if: needs.check_reviewable_commit.outputs.should_review == 'true'
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
  noop:
    report-as-issue: false
  create-pull-request-review-comment:
    max: 10
    target: ${{ env.PR_NUMBER }}
  submit-pull-request-review:
    max: 5
    target: ${{ env.PR_NUMBER }}
    allowed-events: [COMMENT]
    footer: none
  add-comment:
    max: 5
    target: ${{ env.PR_NUMBER }}
    discussions: false
    footer: false
  reply-to-pull-request-review-comment:
    max: 10
    target: ${{ env.PR_NUMBER }}
    footer: false
  resolve-pull-request-review-thread:
    max: 10
    github-token: ${{ secrets.KIBANAMACHINE_TOKEN }}
---

# AlertZero Eval Coverage Reviewer

Using the imported reviewer instructions:

- Run in review mode for `pull_request_target` and manual `workflow_dispatch` events without a comment id.
- Run in follow-up response mode when `workflow_dispatch` includes a comment id and event type from the Reviewer Comment Dispatcher.
- This reviewer's own gh-aw workflow id is `reviewer-alertzero`. Use it as "this reviewer's own workflow id" when matching review threads to resolve.

This reviewer is **opt-in**: it activates only on the `reviewer:alertzero` label or a manual dispatch. It is advisory and never blocks a merge.

For dispatched follow-up runs, use this context:
- PR number: `${{ github.event.inputs.pr_number }}`
- Comment id: `${{ github.event.inputs.comment_id }}`
- Comment event type: `${{ github.event.inputs.comment_type }}`
