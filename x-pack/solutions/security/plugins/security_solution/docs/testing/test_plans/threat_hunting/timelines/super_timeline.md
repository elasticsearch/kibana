# Test plan: Super Timeline <!-- omit from toc -->

**Status**: `in progress — PR 1 of 5`

## Summary <!-- omit from toc -->

Super Timeline lets an incident lead aggregate multiple Timeline investigations into a single
transient, read-only view. Pinned events from all selected timelines are merged; notes are shown
read-only (never duplicated); KQL/filter queries are OR'd into one combined filter pill with
per-timeline labels. ESQL and EQL timelines still contribute their pins and notes — only their
query is skipped.

The view is **transient** — never saved. Opened from two entry points (added in PRs 4–5):
1. Timelines list page → bulk-select timelines → "View Super Timeline"
2. Cases → Attachments tab → select timeline rows → "View Super Timeline"

## References <!-- omit from toc -->

- [Epic: elastic/security-team#14357](https://github.com/elastic/security-team/issues/14357)
- [Enhancement request: elastic/enhancements#25590](https://github.com/elastic/enhancements/issues/25590)
- Contractual deadline: January 2027 (BASF)

## Requirements <!-- omit from toc -->

- Opening Super Timeline must not create any new saved objects (`siem-timeline`, `siem-note`,
  `siem-pinned-event`).
- A note shared across source timelines must appear exactly once (no duplication).
- Closing and reopening the timeline modal must not restore the Super Timeline (transient).
- Capped at 10 source timelines.

---

## PR 1 — Mode flag and aggregation utility

### What this introduces

- `isSuperTimeline?: boolean` and `superTimelineSourceIds?: string[]` on `TimelineModel` —
  runtime-only, never persisted to the saved object.
- `selectIsSuperTimeline` selector.
- `buildSuperTimelineModel(timelines, { dataView, browserFields, esQueryConfig })` — pure
  client-side utility that merges N timelines into one:
  - **Pinned events**: union of all `pinnedEventIds` records (deduped by Record key).
  - **Notes**: reference union — `noteIds` and `eventIdToNoteIds` merged without copying note
    objects.
  - **Date range**: earliest start → latest end across all source timelines.
  - **Columns**: union in first-seen order, falling back to `defaultColumns`.
  - **Queries**: one OR `CombinedFilter` built from each timeline's `combineQueries` result.
    EQL/ESQL-only timelines contribute no sub-filter and are listed in `skippedQueryTimelines`.

### Why

The aggregation logic is isolated as a pure utility so it can be fully unit-tested before any UI
is wired up. Runtime-only flags (`isSuperTimeline`, `superTimelineSourceIds`) avoid saved-object
schema changes — precedent: `savedSearch`, `changed`, `show` are also runtime-only on
`TimelineModel`.

### How to verify

No browser UI in this PR. Run the unit tests:

```bash
node scripts/jest x-pack/solutions/security/plugins/security_solution/public/timelines/components/super_timeline/build_super_timeline_model.test.ts
```
