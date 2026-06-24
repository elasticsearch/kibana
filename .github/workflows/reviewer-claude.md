---
name: Claude Reviewer
on:
  pull_request_target:
    types: [opened, synchronize, reopened]
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
engine:
  id: claude
  version: "2.1.165"
  model: opus
  max-turns: 120
  env:
    ANTHROPIC_API_KEY: ${{ secrets.LITELLM_API_KEY }}
    ANTHROPIC_BASE_URL: https://elastic.litellm-prod.ai
    ENABLE_PROMPT_CACHING_1H: "1"
    # Route Claude Code's 1M Opus alias through LiteLLM.
    ANTHROPIC_DEFAULT_OPUS_MODEL: llm-gateway/claude-opus-4-8[1m]
    ANTHROPIC_DEFAULT_HAIKU_MODEL: llm-gateway/claude-haiku-4-5
    ANTHROPIC_DEFAULT_SONNET_MODEL: llm-gateway/claude-sonnet-4-6
    CLAUDE_CODE_EFFORT_LEVEL: high
    CLAUDE_CODE_SUBAGENT_MODEL: opus[1m]
# Activation rules:
# - Manual runs always activate.
# - Opened/synchronize/reopened PR events activate unless reviewer:skip-ai is present.
# - Comment follow-up runs are dispatched by Reviewer Comment Dispatcher after fork-safe validation.
if: >-
  !github.event.repository.fork &&
  (
    github.event_name == 'workflow_dispatch' ||
    (
      github.event.sender.type != 'Bot' &&
      !contains(github.event.pull_request.labels.*.name, 'reviewer:skip-ai') &&
      github.event_name == 'pull_request_target'
    )
  )
concurrency:
  # Keep one review lane per PR/comment.
  group: >-
    gh-aw-${{ github.workflow }}-${{ github.event.pull_request.number || github.event.inputs.pr_number || github.run_id }}-${{ github.event.inputs.comment_id || 'pr-review' }}
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
    - elastic.litellm-prod.ai
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
---

# Claude PR Reviewer

Using the imported reviewer instructions:
- Run in review mode for `pull_request_target` and manual `workflow_dispatch` events without a comment id.
- Run in follow-up response mode when `workflow_dispatch` includes a comment id from the Reviewer Comment Dispatcher.
- This reviewer's own gh-aw workflow id is `reviewer-claude`. Use it as "this reviewer's own workflow id" when matching review threads to resolve.
