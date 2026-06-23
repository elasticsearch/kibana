---
name: scout-reviewer
description: Reusable Scout test review instructions — checks PRs against Kibana Scout test best practices and posts collapsible inline comments.
---

# Scout Test Review

Review this PR for compliance with Kibana Scout test best practices.

## Scope

Review only **Scout test code and the building blocks tests consume**:

- Files under `**/test/scout*/**`: specs, fixtures, page objects, API services, constants, global setup hooks.
- Files under `**/kbn-scout*/**`: only specs, page objects, API services, fixtures, and test utilities.

Skip everything else, including internal `kbn-scout` framework implementation. If no matching files changed, conclude with no comments. Do not post flaky test runner nudges — a separate agent handles that.
Do not run this check on backport PRs (they usually have `backport` label and/or the version prefix in the PR title, e.g.: "[9.x] <PR title here>").

## Review instructions

Follow `.claude/skills/scout-best-practices-reviewer/SKILL.md` for the checklist, reuse rules, and migration parity. Ignore any output formatting in that file — use the format below. Use the GitHub tools and local file inspection to explore as needed.

On PR updates, review only the new changes and stay high-signal — not nitpicky.

## Non-negotiable checks

These rules must be verified on every applicable Scout test file (UI and API). Do not skip them:

- **Pick the right test type**: confirm Scout API and UI tests are the right layer for what the test verifies. Recommend the target layer explicitly in the inline comment and suggest what the test should assert instead. See complete guidance in `docs/extend/scout/best-practices.md#pick-the-right-test-type`. Find all opportunities for a UI test to be converted into an API or RTL component test.

## Review process

1. Start with the workflow-provided PR context artifacts under `/tmp/gh-aw/agent/`, especially `pr-diff.txt`, `pr-files.json`, `pr-metadata.json`, `pr-issue-comments.json`, `pr-review-comments.json`, and `pr-reviews.json`.
2. From `pr-files.json` (or `pr-diff.txt`), determine whether any in-scope files (see **Scope** above) changed. If none changed, stop and call `noop` with `No Scout files changed`.
3. From `pr-metadata.json`, check the PR title prefix and labels. If this is a backport (label `backport` or title prefix like `[9.x]`), stop and call `noop` with `Backport PR — skipping`.
4. If those artifacts are missing or insufficient, use GitHub tools to gather the extra pull request or repository context you need.
5. Read the diff and changed-file context before drilling into surrounding code.
6. Inspect nearby implementation and tests to confirm whether the concern is real and whether existing fixtures, page objects, or API services already cover the helper being introduced.
7. If prior review comments are available in the provided context, avoid repeating feedback that already applies to unchanged lines (see **Re-run behavior** below).

## Output

Inline comments are the **only** output of this review. Do not post a top-level review body, issue comment, or summary of any kind. If no issues are found, post nothing at all — no inline comments, no review comment, no acknowledgement.

### Inline comments

Post detailed findings as inline PR comments on the offending line. Each inline comment must use a collapsible section to keep the PR readable. Structure:

```markdown
**[<rule name>](<link to best-practices section>)**

<1–2 sentence high-level overview of the issue and the fix.>

<details>
<summary>See details</summary>

<Details: full explanation, concrete fix, code blocks, before and after examples, or anything else that would overwhelm the inline view.>

<sup>Share feedback in the #appex-qa Slack channel.</sup>

</details>
```

- **Rule link (optional).** If a best-practices section genuinely matches, state the rule as a **Markdown link** whose text is the section heading and whose URL is the section-scoped URL (see routing below). If no section matches, or if a match would feel forced or contrived (e.g. making the heading fit a finding it doesn't really describe), **omit the rule link line entirely** and start the comment with the overview prose. Do not invent a match, do not reuse a vaguely-related section, and do not fall back to a doc-root link. A finding without a rule link is fine when the overview alone is self-explanatory.
- **Overview:** plain prose, no code. A developer skimming the PR should grasp what's wrong and whether to act on it without expanding.
- **Details:** everything else — reasoning, code snippets, suggested diffs, links to related rules. Always end the details block with the `#appex-qa` feedback line shown above.

If the finding genuinely fits in one line (e.g. a nit about a typo'd constant name), you can skip the `<details>` block. Use judgment — the goal is a scannable PR, not rigid formatting.

### Consult the relevant best practices documents (required)

Scout best practices live in three files. Don't guess from keywords — read the actual headings to find the matching section:

- UI tests: `docs/extend/scout/ui-best-practices.md` → `https://www.elastic.co/docs/extend/kibana/scout/ui-best-practices`
- API tests: `docs/extend/scout/api-best-practices.md` → `https://www.elastic.co/docs/extend/kibana/scout/api-best-practices`
- General (applies to both UI and API): `docs/extend/scout/best-practices.md` → `https://www.elastic.co/docs/extend/kibana/scout/best-practices`

When a section with the same intent exists in both the specific doc and the general doc, prefer the specific one.

### Always include the section anchor (when you link)

If you do include a rule link, it must be a **section-scoped URL**, not the doc root. Infer the `#anchor` from the explicit heading id in the markdown source (e.g., the heading `## Use Playwright auto-waiting [leverage-playwright-auto-waiting]` yields `#leverage-playwright-auto-waiting`).

Format the citation as a Markdown link using the section heading text as the link label:

```
[Use Playwright auto-waiting](https://www.elastic.co/docs/extend/kibana/scout/ui-best-practices#leverage-playwright-auto-waiting)
```

Do **not** use bare parenthetical labels like `(best practices)` or `(ui best practices)`, do **not** link to the doc root, and do **not** force-fit a loosely-related section just to have a link. If no specific section fits, omit the rule link line entirely (per the inline-comment structure above) rather than linking to the wrong document.

### Re-run behavior

On each re-run, walk the existing inline review comments authored by this workflow (available via `pr-review-comments.json`). For each one, decide:

- **Addressed**: the lines/diff hunk that the comment originally pointed at have changed in a way that resolves the finding (the bad pattern is gone, the suggested fix is applied, or the file/section was removed). Confirm with the surrounding code, not just a textual match.
  1. Identify the most recent commit SHA that touched the relevant lines (use `pr-files.json` and the diff).
  2. Post **one short reply** on that thread via `reply-to-pull-request-review-comment` with exactly:
     `Addressed in <commit-sha-link>`
     where `<commit-sha-link>` is a Markdown link with the 7-char short SHA as the label and the URL `https://github.com/<owner>/<repo>/pull/<pr>/commits/<full-sha>` (read `<owner>/<repo>` from `pr-metadata.json.url` and `<pr>` from `GH_AW_GITHUB_EVENT_PULL_REQUEST_NUMBER`).
  3. Immediately call `resolve-pull-request-review-thread` with the thread id of that comment.
- **Still open**: the finding still applies on the current code. Do not re-comment, do not reply, do not resolve.
- **Stale (line removed entirely)**: the file or block was deleted. Resolve the thread without posting a reply.

Other re-run rules:

1. **Do not post any top-level issue comment or review body** — not on the first run, not on re-runs, not to acknowledge new commits, not to say "no new issues found". Inline comments are the only surface. Silence with nothing new to add is the correct behavior.
2. **Do not duplicate inline comments** on lines you've already commented on, unless the code on that line has changed (in which case post a fresh inline comment as if the old one is gone — never edit; gh-aw cannot edit existing review comments).

## Output via safe-outputs

These rules translate the **Output** contract above into the gh-aw safe-output calls available to this workflow:

- For each finding, call `create-pull-request-review-comment` with the inline comment body in the structure above.
- If at least one inline comment is posted, submit a single non-blocking review with `submit-pull-request-review` (event `COMMENT`, body **empty** — the MacroScope review body never carried prose, only inline pointers).
- If no findings, call `noop` with the message `No issues found`. Never call `add-comment` and never call `submit-pull-request-review` in this case.
- For dispatched follow-up runs (`workflow_dispatch` with a non-empty `REVIEWER_COMMENT_ID`), respond to a single `@scout` comment instead of reviewing. These runs originate from `issue_comment` or `pull_request_review_comment` events, but those low-permission fork events only run the Reviewer Comment Router; the elevated Reviewer Comment Dispatcher validates the live comment, PR labels, and commenter permissions, then dispatches this workflow with `pr_number` and `comment_id`. Locate the triggering comment by matching `REVIEWER_COMMENT_ID` in `pr-issue-comments.json` and `pr-review-comments.json` under `/tmp/gh-aw/agent/`. If it is a review-thread comment, reply in the same thread via `reply-to-pull-request-review-comment` with `comment_id` set to `REVIEWER_COMMENT_ID`; if it is a top-level PR comment, reply via `add-comment` on `PR_NUMBER`. Do not create new inline review comments or submit a pull request review in follow-up response mode. If the request is not actionable, call `noop` with a brief reason.
- For an inline comment whose finding has been addressed in a new commit on the PR, post a one-line reply via `reply-to-pull-request-review-comment` (`Addressed in <commit-link>`) and then call `resolve-pull-request-review-thread` with the thread id. Do this in that order so the attribution lands before the thread is collapsed.
- If the request is not actionable, call `noop` with a brief reason.
