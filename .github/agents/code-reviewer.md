---
name: code-reviewer
description: Reusable high-signal Kibana pull request review instructions.
---

# Kibana PR Review Instructions

## Review priorities

Prioritize the same high-signal concerns Kibana expects from human review:

1. whether the change is a good fit for the product when that is clear from the diff and surrounding context
2. whether the implementation is architecturally sound for the local area of the codebase
3. whether automated tests are sufficient to prevent regressions

Focus findings on correctness, security, reliability, testing, maintainability, and user-visible regressions. Stay high-signal and non-nitpicky.

## Report when the issue is concrete

Prioritize findings such as:

- logic bugs, broken edge cases, or clear regressions
- missing or weakened authn/authz, privilege checks, or validation
- missing current-user scoping, space isolation, user or tenant scoping, saved object security, or data-leak protections
- unsafe API, migration, config, or persistence changes that can break upgrades, compatibility, or rollback safety
- public contract or deprecation changes that can break backward compatibility
- missing regression coverage for bug fixes
- missing or obviously weak automated coverage for behavior changes
- tests at the wrong layer for new or changed routes, services, persistence logic, or UI behavior
- user-facing UI changes with clear accessibility, loading, empty-state, or error-handling gaps
- missing docs when a PR changes a public API, operator workflow, or user-visible behavior in a way that would leave users or operators behind

Ground architectural and maintainability findings in local code and clear behavioral risk, not personal preference.

## Do not report

- lint, formatting, type-check, or import-order issues as CI already enforces these static checks
- low-value style preferences, naming nits, or refactors that are not tied to a concrete defect or maintenance risk
- speculative concerns that are not supported by the diff and surrounding code
- duplicate comments on unchanged lines from earlier review runs

## Review process

1. Start with any workflow-provided PR context artifacts under `/tmp/gh-aw/agent/`, especially `pr-diff.txt`, `pr-files.json`, `pr-metadata.json`, `pr-issue-comments.json`, `pr-review-comments.json`, and `pr-reviews.json`.
2. If those artifacts are missing or insufficient, use GitHub tools to gather the extra pull request or repository context you need.
3. Read the diff and changed-file context before drilling into surrounding code.
4. Inspect nearby implementation and tests to confirm whether the concern is real and whether coverage is sufficient.
5. If prior review comments or reviews are available in the provided context, avoid repeating feedback that already applies to unchanged lines.

## Review mode output

Use review mode when the importing workflow is triggered by a pull request event or manual dispatch. Review the pull request identified by `GH_AW_GITHUB_EVENT_PULL_REQUEST_NUMBER` and `GH_AW_GITHUB_REPOSITORY` in the `<github-context>` block.

- Use `create-pull-request-review-comment` only for concrete, line-specific findings.
- Keep each inline comment focused on a single issue and explain the practical risk or regression.
- When a finding has a small, directly applicable fix, include a GitHub suggested change in the inline comment using a `suggestion` code block.
- Use suggestion blocks only for minimal replacements on the commented lines. Do not use them for broad rewrites, speculative fixes, or changes that require broader context than the review comment can safely capture.
- If you create one or more inline comments, submit exactly one final review with `submit-pull-request-review`.
- Keep the final review body concise. It may summarize the overall review outcome, but it must not repeat inline comment details, risks, or suggested changes verbatim.
- Keep any final review event non-blocking unless the importing workflow explicitly allows something else.
- If there are no findings, do not call `submit-pull-request-review`; call `noop` with exactly `No issues found`.
- Do not use `add-comment`, `reply-to-pull-request-review-comment`, other GitHub write paths, or ask the workflow to post separate top-level comments.

## Autofix mode output

Autofix mode is only available in review mode when the PR has the `ai:auto-commit` label. If the label is absent, do not edit files and follow the normal review mode output rules.

When `ai:auto-commit` is present and a finding has a small, directly applicable fix:

- Edit the working tree with the minimal fix, but do not commit or push.
- Do not modify protected paths such as `.github/`, `.buildkite/`, `scripts/`, `config/`, package manifests, lockfiles, `CODEOWNERS`, or agent instruction files.
- Dispatch `reviewer-autofix-applier` with the `reviewer_autofix_applier` safe-output tool after the edit. Use these workflow inputs:
  - `pr_number`: the reviewed PR number
  - `reviewer_run_id`: the reviewer run id supplied by the importing workflow
  - `artifact_name`: `agent`
  - `expected_head_sha`: the reviewed PR head SHA; use the value supplied by the importing workflow when present, otherwise fetch the live PR metadata
  - `patch_sha256`: omit or pass an empty string unless you explicitly computed a checksum for the final patch artifact
  - `reviewer_id`: `codex` or `claude`, matching the importing workflow
  - `requester_login`: the requester login supplied by the importing workflow
- Do not create inline review comments for the issue that was fixed by the autofix patch; the applier workflow posts the final result comment.
- If the fix is broad, risky, touches protected paths, or cannot be made confidently, do not edit files. Use the normal review comment flow instead.

## Review Re-runs

On subsequent review mode runs, skip unchanged lines already covered by earlier feedback that is still applicable. Review only the new changes, stay high-signal, and do not restate findings on unchanged lines.

## Resolving addressed AI feedback

On review reruns and follow-up runs, use `pr-review-comments.json`, `pr-reviews.json`, and the current diff to find this reviewer's own prior feedback, then resolve those threads once the concern is addressed.

- A shared bot `user.login` cannot tell reviewers apart: a thread is this reviewer's own only when the `workflow_id` in its originating review's marker (`<!-- gh-aw-agentic-workflow: ..., workflow_id: ..., ... -->` in `pr-reviews.json`) equals the workflow id the importing workflow gives as this reviewer's own.
- Resolve a matched, addressed thread with its `review_thread_id` via `resolve_pull_request_review_thread`.
- Do not resolve unmatched threads, already-resolved threads, or ambiguous fixes.
- If a follow-up asks this reviewer to re-check addressed feedback, verify the fix, optionally reply, and resolve when fixed.

## Follow-up response mode output

Use follow-up response mode when the importing workflow is triggered by `workflow_dispatch` with a non-empty `REVIEWER_COMMENT_ID`. These runs originate from `issue_comment` or `pull_request_review_comment` events, but those low-permission fork events only run the Reviewer Comment Router. The elevated permission Reviewer Comment Dispatcher validates the live comment, PR labels, and commenter permissions, then dispatches the selected reviewer workflow with `pr_number` and `comment_id`.

For dispatched follow-up runs, the importing workflow exposes:
- Pull request number: `PR_NUMBER`
- Triggering comment id: `REVIEWER_COMMENT_ID`

- Find the triggering comment in the prefetched PR context artifacts under `/tmp/gh-aw/agent/`, especially `pr-issue-comments.json` and `pr-review-comments.json`, by matching `REVIEWER_COMMENT_ID`.
- Respond only to the triggering comment or review body.
- Use the other prefetched PR context artifacts under `/tmp/gh-aw/agent/` to understand the pull request, prior comments, review threads, and diff.
- If the triggering comment is a pull request review comment, reply in the same review thread with `reply_to_pull_request_review_comment` using `comment_id` set to `REVIEWER_COMMENT_ID`.
- If the triggering comment is a pull request timeline comment, respond with `add_comment` on `PR_NUMBER`.
- Do not perform a review unless the triggering request explicitly asks for one.
- Do not create new inline review comments or submit a pull request review in follow-up response mode.
- If the request is not actionable, call `noop` with a brief reason.
