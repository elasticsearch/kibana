# Test plan: Super Timeline <!-- omit from toc -->

**Status**: `in progress — PR 3 of 5`

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

---

## PR 2 — Opener hook and read-only modal gating

### What this introduces

- `useOpenSuperTimeline(savedObjectIds)` — fetches N timelines in parallel via `resolveTimeline`,
  builds the super model via `buildSuperTimelineModel`, dispatches it into the active timeline
  slot. Shows a warning toast naming any EQL/ESQL timelines whose queries were skipped. Enforces
  the 10-timeline cap with a toast.
- **Modal header**: when `isSuperTimeline`, hides Save / Attach to Case / Add to Favorites and
  shows a "Super Timeline — read-only" badge.
- **Tabs**: ESQL and EQL tabs are hidden when `isSuperTimeline` is true.
- **Overwrite guard**: before dispatching, checks whether the active timeline has unsaved changes
  (`changed: true`) and prompts before overwriting.

### Why

The hook owns the full open lifecycle (fetch → build → dispatch) so all future entry points
(PRs 4 and 5) just pass `savedObjectIds`. Header and tab gating is centralised here so every
entry point gets read-only semantics automatically.

### How to verify

No browser entry point in this PR. Run the unit tests:

```bash
node scripts/jest x-pack/solutions/security/plugins/security_solution/public/timelines/components/super_timeline/use_open_super_timeline.test.ts
```

---

## PR 3 — Multi-source notes aggregation

### What this introduces

- `makeSelectNotesBySavedObjectIds(ids: string[])` selector in the notes Redux store — filters
  the flat note pool by any of the source timeline IDs.
- **Notes tab**: when `isSuperTimeline`, dispatches `fetchNotesBySavedObjectIds(superTimelineSourceIds)`
  on mount and renders notes read-only (no add-note input, no SaveTimelineCallout).

### Why

Notes live in a flat Redux pool keyed by `noteId`. A single-id selector already existed;
extending it to multiple IDs is a filter over the same pool — no note objects are copied or
cloned, so duplication is structurally impossible.

### How to verify

No browser entry point in this PR. Run the unit tests:

```bash
node scripts/jest x-pack/solutions/security/plugins/security_solution/public/notes/store/notes.slice.test.ts
```
