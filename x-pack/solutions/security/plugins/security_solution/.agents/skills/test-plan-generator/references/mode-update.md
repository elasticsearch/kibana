# Update / Regenerate Workflow

Follow these steps when the user asks to `update` or `regenerate` a test plan and a published comment exists (body starting with `<!-- test-plan-generated -->`).

If no published comment exists, skip all steps here and run Steps 1–3 from SKILL.md as a full draft fallback.

---

1. **Fetch the published comment** and store its `updatedAt` as `PLAN_PUBLISHED_AT`.
   ```
   gh issue view <number> --repo <owner>/<repo> --json comments
   ```
   From the returned comments array, find the one whose body starts with `<!-- test-plan-generated -->` and store its `updatedAt` field.

   **Also parse the published body** and build a map keyed by *scenario title within feature area* called `PUBLISHED_EXECUTION_STATE`:
   - For each `#### Scenario:` heading, capture the scenario title from the heading and the contents of the ```` ```gherkin … ``` ```` block that belongs to that scenario. Per the canonical *Scenario format* in [`output-formats.md`](output-formats.md#scenario-format), the gherkin fence is **not** adjacent to the heading — `**Priority:**` (and `**Source:**` under `detailed`) and `**Automation coverage**:` fields appear between them. Skip past those fields when locating the gherkin block; the scenario boundary ends at the next `#### Scenario:` heading or at the end of the enclosing feature-area collapsible.
   - For each scenario, capture the verbatim state of its canonical `Execution:` block if present (the three checkbox lines and any preceding `_Scenario updated on …_` callout). Recognise the canonical shape only — non-canonical blocks or scenarios without one are flagged as **no published state** (the published plan was generated before the Execution block was introduced, or the comment was edited externally to drop the block).

   This map is consumed by the *Execution block preservation* sub-step in step 6.

   **Resolve `VERBOSITY_LEVEL` for this run.** In two ordered sub-steps:

   1. **Parse `PUBLISHED_VERBOSITY_LEVEL` unconditionally** — always search the published body for a line matching `<!-- verbosity: (lean|standard|detailed) -->` and capture the value into `PUBLISHED_VERBOSITY_LEVEL`. If no such line exists (plan predates this feature), leave `PUBLISHED_VERBOSITY_LEVEL` as `none` and append the entry `Vmig` to `SKILL_RULE_MIGRATIONS` (see Step 5) with the one-line description *"published plan missing `<!-- verbosity: … -->` marker; defaulted to `standard`."*. This sub-step always runs — the value is consumed by Step 7's level-change announcement regardless of which branch chose `VERBOSITY_LEVEL`.

   2. **Select `VERBOSITY_LEVEL`** — precedence:
      - **User override** — if the current invocation contains a level keyword per the grammar in [`output-formats.md` § Verbosity levels](output-formats.md#verbosity-levels) (`update a lean test plan …`, `regenerate detailed test plan …`, etc.), use it. This is `INVOCATION_VERBOSITY_KEYWORD` from [`../SKILL.md` § Modes of operation](../SKILL.md#modes-of-operation).
      - **Published marker** — otherwise, use `PUBLISHED_VERBOSITY_LEVEL` when it is not `none`.
      - **Fallback** — otherwise (no override and `PUBLISHED_VERBOSITY_LEVEL` is `none`), use `standard`. The `Vmig` entry appended in sub-step 1 already records the migration; do not append it a second time here.

   If `VERBOSITY_LEVEL` differs from `PUBLISHED_VERBOSITY_LEVEL` (including the `none` case), treat the level change as an identified change (Step 5) — the whole plan will be re-rendered at the new level. Non-negotiable invariants (scenario count, priorities, ⚠️ entries) remain identical; only prose density and per-scenario metadata differ (see [`output-formats.md` § Verbosity levels](output-formats.md#verbosity-levels)).

2. **Re-fetch all non-PR GitHub sources** — the issue, sub-issues, comments, and the parent issue (if any). Use the exact `gh` commands for each source type defined in [`gathering-context.md`](gathering-context.md) (*GitHub fetches*, *Parent issue*, *Sub-issues*, *Acceptance criterion extraction and origin tagging*). The *one level up only* and *background context only* constraints from the [Parent issue](gathering-context.md#parent-issue) section still apply.

   **Re-apply URL categorization** to all re-fetched content (issue body, comments, sub-issues, parent). For each URL not already present in the published plan: categorize per the [URL categorization](gathering-context.md#url-categorization) table and fetch via the matching section (Images, Figma, Google Docs, Linked GitHub issues). New images, Figma nodes, or Google Docs added since publication must be analyzed before continuing — silently skipping them is the most common update-mode regression.

   Re-build the **flat acceptance criteria list** (with `issue` / `pr` / `both` origin tags per AC) and the **consolidated AC list** from the re-fetched content, as described in the [*Acceptance criterion extraction and origin tagging*](gathering-context.md#acceptance-criterion-extraction-and-origin-tagging) section of `gathering-context.md` and Step 2 of SKILL.md. The list must include the **target issue** in addition to every sub-issue, parent, and linked issue — not only sub-issues.

   **Re-run Step 1.5 — Issue Clarity Assessment (first half)** on the refreshed corpus, even if no descriptions appear to have changed. The published assessment may be stale; re-scoring the per-issue and combined scores against the current text is the only way to confirm. Follow [`issue-clarity-assessment.md`](issue-clarity-assessment.md) end-to-end up to and including the stop-and-ask gate. If combined readability is now **1**, apply the gate before continuing — do not silently override a previously higher published score.

3. **Check PR activity.** Find all PR numbers linked to the issue — look in the issue body, the issue comments, and the published test plan. For each, fetch only the update timestamp:
   ```
   gh pr view <number> --repo <owner>/<repo> --json number,title,updatedAt
   ```
   Compare each PR's `updatedAt` against `PLAN_PUBLISHED_AT`. Build two lists: **re-read** (newer than `PLAN_PUBLISHED_AT`) and **skip** (same or older). If the user said "including PRs", mark all PRs as re-read regardless of timestamp.

4. **Re-read updated PRs.** For each PR in the re-read list, fetch the full content — description, review comments, and diff — applying the rules defined in the [*Pull requests and test coverage*](gathering-context.md#pull-requests-and-test-coverage) section of `gathering-context.md` (max 20 files per PR, 500-line file diff cap, the always-skip list including `*.gen.ts` / `*.gen.tsx`, image fetching extended to PR bodies and review comments). Update the test coverage catalog and the PR artifacts inventory. If a re-read PR has no test files, apply the filesystem search described in that same section using [`security-test-directories.md`](security-test-directories.md).

5. **Compare all sources against the published comment and identify:**
   - New acceptance criteria not covered by any existing scenario.
   - Existing scenarios now incorrect due to changes in the issue or PRs.
   - Sections referencing outdated information (wrong URLs, feature flag names, milestones).
   - Known Limitations that have been resolved or new ones that have emerged.
   - New test files that should be reflected in automation coverage lines.
   - New PR artifacts (API routes, service methods, saved object types, schemas, UI components, feature flags) introduced by re-read PRs that are not covered by any existing scenario.
   - **Sub-issues previously listed in the *Pending work* collapsible block that have now been implemented** — see the special handling in Step 6.
   - **A changed Issue Clarity Assessment** — per-issue scores, combined readability, or *critical gaps* notes differ from the assessment block in the published comment. A score change alone is enough reason to save a refreshed draft so the published assessment is not stale.
   - **Legacy scenarios with no canonical Execution block** — when `PUBLISHED_EXECUTION_STATE` (built in step 1) flags one or more scenarios as *no published state*, the plan must be re-saved to inject the empty blocks so devs can record execution status going forward. The injection is handled by *Execution block preservation* in Step 6, and the migration count is announced via `legacy_migrations` in Step 7. This trigger fires even when the underlying issue/PR content is unchanged — without it, a published plan could remain permanently without checkboxes.
   - **Verbosity level changed** — when `VERBOSITY_LEVEL` (resolved in Step 1) differs from `PUBLISHED_VERBOSITY_LEVEL`, the whole plan is re-rendered at the new level and re-saved. Announced via Step 7's level-change line.
   - **Published plan violates the current draft coherence review** — run every check in [`draft-coherence-review.md`](draft-coherence-review.md) (S1–S8 source-fidelity and D1–D9 whole-document) against the **published plan** as if it were the assembled draft. Any `⚠️` or `❌` produced is a **skill-rule compliance gap** and forces saving a refreshed draft, even when the content sources are unchanged. This is the generic escape hatch that fires whenever a skill rule is introduced or tightened after the plan was published — for example the *Always-evaluated coverage* rule (upgrade / CRUD / dependency scenarios), dynamic upgrade source versions resolved from `versions.json`, or any future rule added to `draft-coherence-review.md`. It exists so new skill rules automatically propagate to previously published plans without needing a dedicated trigger per rule. Store the failing check IDs and a one-line description of each in a `SKILL_RULE_MIGRATIONS` list — the fixes are applied in Step 6's special handling, the list is emitted via `SKILL_RULE_MIGRATIONS` in Step 7. `Vmig` (published plan missing `<!-- verbosity: … -->` marker; see Step 1) is one such migration and is appended to this list at Step 1 time; the remedy is to emit the marker at draft-save (naturally handled in Step 6).

   **If this comparison produces an empty change list** (no new ACs, no incorrect scenarios, no outdated sections, no new/resolved limitations, no new test files or PR artifacts, no implemented Pending sub-issues, no change to the Issue Clarity Assessment, no scenarios in `PUBLISHED_EXECUTION_STATE` flagged as *no published state*, no verbosity level change, **and** no failing checks in `SKILL_RULE_MIGRATIONS`): skip Steps 6 and 7, do not save a draft, and tell the user *"The existing test plan for issue #&lt;number&gt; appears to be up to date — no draft saved."* Then jump directly to Step 8 and output the Sources Summary so the user can see what was checked.

6. **Apply only the identified changes.** Do not rewrite accurate sections — **with one exception: when `VERBOSITY_LEVEL != PUBLISHED_VERBOSITY_LEVEL`, every prose section whose shape depends on the level (`Overview`, `Feature Background`, `Assumptions`) and every per-scenario metadata line whose shape depends on the level (`Automation coverage`, `**Source:**` under `detailed`) must be re-rendered at the new level, even if the underlying sources are unchanged. See *Render sections at `VERBOSITY_LEVEL`* below.**

   **Special handling: implemented Pending sub-issues** (per the *Pending work pattern* in [`document-structure.md`](document-structure.md)):
   - Remove the `(Pending #N)` prefix from each AC item and from the matching scenario title.
   - Move each affected scenario from the *Pending work* collapsible block into its proper feature area section, placed in priority order (P0 → P1 → P2).
   - Decrease the *Pending work* row in the Test Coverage Summary by the number of migrated scenarios, and increase the affected feature area rows accordingly. Reclassify the migrated scenarios in the `Automated` / `Manual only` columns based on whether matching tests exist in the catalog.
   - If the *Pending work* row would reach `0`, remove the row, the collapsible block, and the related `⚠️` entry in Known Limitations.

   If new scenarios must be written, follow the [Writing scenarios](../SKILL.md#writing-scenarios) procedures from Step 3 of SKILL.md.

   **Special handling: skill-rule migrations.** If `SKILL_RULE_MIGRATIONS` (from Step 5) is non-empty, treat each failing check as an identified change and apply its remedy on the updated draft. The remedy for every check ID is documented in the *What to verify* / *Common failure* columns of the two tables in [`draft-coherence-review.md`](draft-coherence-review.md) — read the row for the failing check ID and fix the draft accordingly. Examples: `S6a` missing upgrade coverage → add the Upgrade scenarios template from [`optional-scenarios.md`](optional-scenarios.md#upgrade-scenarios), or add an *Out of scope* bullet with a one-clause reason; `S6b` stale hardcoded upgrade versions → resolve fresh values via the placeholder rules in [`optional-scenarios.md`](optional-scenarios.md#upgrade-scenarios) and replace them. Do **not** rewrite sections that are not flagged — the migration is scoped to the failing checks only. **Exception:** `Vmig` (the synthetic marker migration appended in Step 1 for plans missing `<!-- verbosity: … -->`) has no row in `draft-coherence-review.md`; its remedy is automatic — the *Compute the token usage marker, then save the updated draft* sub-step below always prepends the verbosity marker at draft-save time, and its announcement is folded into Step 7's level-change line.

   **Execution block preservation.** Each emitted scenario must carry the canonical `Execution:` block (defined in [`output-formats.md`](output-formats.md#scenario-format)). Apply the **preserve-on-match** strategy when populating it, using the `PUBLISHED_EXECUTION_STATE` map from step 1:

   | Scenario state in updated draft | Match in `PUBLISHED_EXECUTION_STATE` | Behavior |
   |---|---|---|
   | Title + Gherkin unchanged | Canonical block present | Carry over the three checkbox lines verbatim. Preserve any existing `_Scenario updated on …_` callout. |
   | Title + Gherkin unchanged | No published state (legacy plan or non-canonical block) | Initialize an empty `Execution` block with all three boxes unchecked. **No callout.** Increment a `legacy_migrations` counter for the post-save announcement in step 7. |
   | Title preserved, Gherkin substantively changed | Any | Reset all three checkboxes to unchecked **and** insert the callout `_Scenario updated on YYYY-MM-DD, please re-execute_` immediately above the three checkboxes. |
   | Scenario new (no title match) | n/a | Empty `Execution` block, all unchecked, no callout. |
   | Scenario removed (matched scenario dropped from updated draft) | n/a | Drop. The execution history lives in GitHub's comment edit log. |

   **Matching rule.** Match by scenario title within feature area — already required to be unique by [`common-mistakes.md`](common-mistakes.md) § *Redundant scenarios*. If a title-match is found but the feature area changed, treat as **changed** (row 3) rather than new — the scenario was relocated, not re-authored.

   **"Substantively changed" definition.** A Gherkin block is substantively changed when one or more of: a step was added or removed; a `Given`/`When`/`Then`/`And` keyword changed; or a step's natural-language text changed in a way that alters the assertion. Pure whitespace, capitalisation, or punctuation changes do not count — leave the checkboxes alone.

   **Date format.** Use `YYYY-MM-DD` for the callout — same format as the document footer.

   **Self-review applies to the full updated document, not just the changes.** Run the Gherkin self-review and the three mechanical sum-checks from [`output-formats.md`](output-formats.md) against the entire updated draft, re-review [`common-mistakes.md`](common-mistakes.md), and re-run the [draft coherence review](draft-coherence-review.md) end-to-end against the full updated document. Updates frequently introduce internal contradictions — a *Scope* bullet kept from the previous version that no longer matches the refreshed scenarios, a *Known Limitations* `⚠️` whose source is now accessible, or a Pending-work block that was not fully migrated. Verify Test Coverage Summary totals column-wise and row-wise explicitly.

   **Re-run Step 3.5 — Issue Clarity Assessment (second half)** on the updated draft. The per-issue scores and combined readability **from the Step 1.5 re-run performed within step 2 above** are reused as-is (step 2 itself is the re-fetch; it does not produce scores — the scores come from the Step 1.5 re-run it invokes). The Coverage Ratio must be recomputed because the scenario count and per-scenario origins may have changed. Assemble the refreshed assessment block per [`output-formats.md`](output-formats.md#issue-clarity-assessment-section) and replace the existing assessment section in the draft — do not append a second one.

   **Render sections at `VERBOSITY_LEVEL`.** All prose sections (`Overview`, `Feature Background`, `Assumptions`) and per-scenario metadata (`Automation coverage` line, `Source` line under `detailed`) must be emitted at the level resolved in Step 1. When `VERBOSITY_LEVEL != PUBLISHED_VERBOSITY_LEVEL`, every section that changes shape at the new level is re-rendered — even if its underlying content sources are unchanged. Non-negotiable invariants (scenario count, priorities, ⚠️ entries, *Out of scope* reasons) remain identical to the published plan except where the change list in Step 5 forced them to move. See [`output-formats.md` § Verbosity levels](output-formats.md#verbosity-levels).

   **Compute the token usage marker, then save the updated draft.** Invoke the token usage script:

   ```bash
   python3 x-pack/solutions/security/plugins/security_solution/.agents/scripts/session-token-usage.py
   ```

   If the script exits 0, capture its output — space-separated `input=… output=… cache_create=… cache_read=… total=…` — as `TOKEN_LINE`. If it exits non-zero, leave `TOKEN_LINE` unset and skip the tokens marker. Then save to `x-pack/solutions/security/plugins/security_solution/.agents/tmp/test-plan-#<issue_number>.md`, overwriting any existing draft at that path. This save is unconditional — it applies whether the changes involved new scenarios, edits to existing scenarios, Pending-work migrations, an assessment refresh, a verbosity-level change, or only metadata updates. Prepend the top markers in this order:
   1. `<!-- verbosity: <VERBOSITY_LEVEL> -->` — **always emitted**, using the value resolved in Step 1.
   2. `<!-- tokens: input=X output=Y cache_create=W cache_read=Z total=T -->` — **only if `TOKEN_LINE` was captured**, directly below the verbosity marker.

   Overwriting the draft file naturally replaces any prior verbosity/tokens markers — both always reflect the run that produced the current comment. The publish step will PATCH the existing GitHub comment with this file's contents. Skip the Sources Summary sub-step inside [Saving the draft](../SKILL.md#saving-the-draft) — the update-mode version with PR re-read info is emitted in step 8 below. See [`output-formats.md` § Verbosity levels](output-formats.md#verbosity-levels) and [`output-formats.md` § Token usage marker](output-formats.md#token-usage-marker) for the marker specs and the fallback rules.

7. Replace Step 3's generic *"Draft saved…"* message: tell the user exactly what changed and what was left unchanged. If any Issue Clarity Assessment scores or Coverage Ratio changed, explicitly call that out — e.g. *"Combined readability moved from 3/5 to 4/5 after #16938 was rewritten with numbered ACs; Coverage Ratio rose from 62% to 78%."*

   **If `VERBOSITY_LEVEL != PUBLISHED_VERBOSITY_LEVEL`** (the user requested a different level than the one persisted in the published comment, or the published plan had no marker), announce the change on its own line — substitute `none` for `PUBLISHED_VERBOSITY_LEVEL` when the published marker was absent:

   > *Verbosity level changed from `<PUBLISHED_VERBOSITY_LEVEL | none>` to `<VERBOSITY_LEVEL>` — the whole plan was re-rendered at the new level. Scenario count, priorities, and ⚠️ entries are unchanged (see [`output-formats.md` § Verbosity levels](output-formats.md#verbosity-levels) non-negotiable constraint).*

   When `Vmig` is present in `SKILL_RULE_MIGRATIONS` (the published plan had no `<!-- verbosity: … -->` marker), fold this line into the `SKILL_RULE_MIGRATIONS` announcement below rather than emitting both — `Vmig`'s own message already conveys that the marker was absent and is now populated.

   **If `legacy_migrations` > 0** (one or more scenarios had no canonical `Execution` block in the published comment — applies to plans published before the Execution block was introduced, or to comments edited externally to drop the block), explicitly tell the user how many: *"Migrated N legacy scenarios — added empty Execution blocks; please re-execute and mark Pass/Fail/Blocked when done."* Do not bury this in the generic message; it is the only signal devs get that the next checkbox click starts fresh state, not appended to prior runs.

   **If `SKILL_RULE_MIGRATIONS` is non-empty** (the published plan violated one or more current skill rules — see the *Published plan violates the current draft coherence review* trigger in Step 5), announce them explicitly grouped by check ID. Example: *"Migrated 2 sections to current skill rules — one under S6a: added missing Upgrade coverage (feature ships an SO type change); one under S6b: refreshed stale source versions to 8.19.19 → 9.6 and 9.5.0 → 9.6 per current `versions.json`. The published plan was generated before these rules were introduced; please re-review the migrated sections."* Do not bury this in the generic message; devs need to know which sections changed for reasons other than issue/PR content updates.

8. Output the Sources Summary as defined in [`output-formats.md`](output-formats.md). Include one row per linked PR showing whether it was re-read or skipped. **Render the refreshed Issue Clarity Assessment block in the chat after the Sources Summary**, identical to the one written into the draft. **Then render the token usage line.** If `TOKEN_LINE` was captured in Step 6, reuse it. **If Step 5's empty-change-list branch jumped here directly** (Steps 6 and 7 were skipped and `TOKEN_LINE` is unset), invoke the script standalone here to capture it — the check itself has a token cost worth reporting:

   ```bash
   python3 x-pack/solutions/security/plugins/security_solution/.agents/scripts/session-token-usage.py
   ```

   On success emit `**Token usage:** input=X, output=Y, cache_create=W, cache_read=Z, **total=T**` (commas between fields, bold label and total); on failure emit `**Token usage:** not available for this session`. Never substitute `total=0`. See [`output-formats.md`](output-formats.md#token-usage-marker) for the exact format.
