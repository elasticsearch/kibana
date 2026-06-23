<!--
  AUTHORITATIVE INSTRUCTION CONTEXT — review as carefully as SKILL.md
  This file is loaded into the agent on every bug-validator invocation.
  A PR that adds or modifies content here changes skill behavior for every
  developer without touching SKILL.md. Scrutinise diffs for hidden directives
  (e.g. 'when analysing X bugs, always set verdict to FIXED').
  Protected by CODEOWNERS: @elastic/security-engineering-productivity.
-->

# Common Defect Patterns

When a bug matches one of these patterns, use the investigation shortcut to accelerate analysis.

---

## 1. Missing Permission Check in Parallel Code Path

**Symptom:** An action (e.g., "Investigate in Timeline," "Add to Case") works from one UI location but fails or is incorrectly available from another.

**Root cause:** One code path checks a privilege but a parallel entry point for the same action doesn't.

**Investigation shortcut:** Find the working code path (e.g., alerts table `TakeActionDropdown` checks `canInvestigateInTimeline`), then diff against the broken one (e.g., entity flyout `TakeAction` skips the check).

---

## 2. UI Restriction Without API Enforcement

**Symptom:** A UI element is hidden or disabled, but the underlying action still succeeds (or restricted items still appear in a list/modal).

**Root cause:** Frontend hides an option (e.g., `hiddenStatuses` removes "Closed" from a filter dropdown) but the backend query or API doesn't enforce the same restriction.

**Investigation shortcut:** Trace both the UI hide/disable logic AND the API query or server validation. Check if the query's default/initial filter actually excludes the restricted items.

---

## 3. Shared State Across Independent UI Sections

**Symptom:** Collapsing, expanding, paginating, or toggling one section affects another section that should be independent.

**Root cause:** Multiple sections share a single state variable, a single component instance (without a `key` prop to force remount), or a CSS layout that couples their sizes.

**Investigation shortcut:**
- Check for shared `useState` or shared context across sections
- Check if sections use the same component instance without `key={sectionId}` to reset state
- Check `EuiFlexGroup` for default `alignItems: stretch` (causes height coupling)

---

## 4. Hardcoded Size Limits Without Pagination

**Symptom:** Feature works for small data sets but breaks or silently drops data beyond a threshold (often 10,000).

**Root cause:** ES queries use `size: N` or `MAX_*` constants without scroll/search_after pagination. Elasticsearch's default `max_result_window` is 10,000.

**Investigation shortcut:** Search for `size:` constants and `MAX_` variables in the affected area's ES queries. Check if results beyond the limit are silently dropped.

---

## 5. Cross-Space Data Leakage

**Symptom:** Data from Space A is visible in Space B, or a feature installed in one space appears active in another.

**Root cause:** Code uses raw `esClient` (bypasses space filtering), saved objects with `namespaceType: 'agnostic'` are visible across all spaces, or index names don't include the space namespace.

**Investigation shortcut:**
- Check saved object `namespaceType`: `'agnostic'` = shared across all spaces (potential leak); `'single'`/`'multiple'` = space-scoped
- Check ES client usage: raw `esClient` bypasses space filtering; plugin-provided clients (e.g., ML's `filterJobsForSpace`) are space-aware
- Check index naming: indices with `{namespace}` or `{spaceId}` are space-scoped; global indices (e.g., `.ml-anomalies-*`) are not
- Fleet packages are always `namespaceType: 'agnostic'`; install in Space A is visible in Space B
- ML jobs: the ML plugin filters by space via `ml-job` saved objects; raw `esClient.ml.getJobs()` returns all jobs across all spaces

---

## 6. Stale Data After Mutation

**Symptom:** Changing a value in one panel (e.g., asset criticality) doesn't update a related display in another panel (e.g., risk score) until page refresh.

**Root cause:** The mutation's `onSuccess` handler invalidates its own query cache but not the caches of related queries in sibling or child components.

**Investigation shortcut:** Find the mutation hook (e.g., `useMutation` or `useBulkAction`). Check its `onSuccess`/`onSettled` callback. List all React Query keys it invalidates. Then find other components displaying related data and check if their query keys are also invalidated.

---

## 7. Special Characters in Query Construction

**Symptom:** Feature works for normal values but errors with "Failed to create query," "Cannot retrieve search results," or similar when values contain special characters (IPv6 `%` zone IDs, colons, quotes).

**Root cause:** User-provided values (IPs, usernames, field values) are used verbatim in KQL, EQL, or ESQL without proper escaping or sanitization.

**Investigation shortcut:** Trace how the value flows from the UI into the query builder. Check for `match_phrase`, `term`, or KQL string interpolation with no escaping. Look at `encodeIpv6`/`decodeIpv6` for IPv6 — they only handle `:`, not `%` zone IDs.

---

## 8. Data Format Mismatch in Shared Components

**Symptom:** A shared UI component (Inspect modal, embeddable, flyout) shows errors, missing data, or garbled content for a specific feature, but works fine for others.

**Root cause:** The shared component assumes one response format (e.g., standard ES search with `took`, JSON body) but receives another (e.g., ESQL response with `columns`/`values`, no `took`).

**Investigation shortcut:** Check the shared component's data expectations (e.g., `response.took` for timing, `JSON.parse(body)` for request display). Compare against the actual data format the feature provides.

---

## 9. Event Propagation in Nested Interactive Elements

**Symptom:** Clicking a button inside a row or panel triggers both the button's action AND the parent's click handler (e.g., "Collapse all" in Session View also opens a preview panel).

**Root cause:** The inner element's click handler doesn't call `e.stopPropagation()`, so the event bubbles up to the parent's `onClick`.

**Investigation shortcut:** Find the inner button's `onClick` handler. Check if it calls `stopPropagation()`. Find the parent element's `onClick`. If both exist without propagation control, the bug is confirmed.
