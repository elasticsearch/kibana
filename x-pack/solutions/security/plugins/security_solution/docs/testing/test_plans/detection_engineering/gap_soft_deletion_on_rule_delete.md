# Test plan: gap soft-deletion on rule delete <!-- omit from toc -->

**Status**: `in progress`.

## Summary <!-- omit from toc -->

This is a test plan for gap soft-deletion during rule deletion, covering both bulk delete
(`POST /api/detection_engine/rules/_bulk_action` with `action: delete`) and single-rule delete.

When a rule is deleted, its gap event-log documents are marked as soft-deleted
(`kibana.alert.rule.gap.deleted: true`). This is done with a single, blocking Elasticsearch
`_update_by_query`. The alerting `softDeleteGapsByQuery` helper builds the gap query and calls the
event log client's generic `IEventLogClient.softDeleteByQuery`, which owns the event log index name.
This replaces an older per-gap `search_after` loop that issued ~42,000 requests to delete 10,000 rules.
Gap soft-deletion runs **after** saved-object deletion and only for the rules that were actually
deleted, so gaps are never lost when a rule deletion fails.

## Table of contents <!-- omit from toc -->

- [Useful information](#useful-information)
  - [Tickets](#tickets)
  - [Terminology](#terminology)
- [Requirements](#requirements)
  - [Assumptions](#assumptions)
  - [Technical requirements](#technical-requirements)
- [Scenarios](#scenarios)
  - [Core functionality](#core-functionality)
    - [**Scenario: Gaps are soft-deleted after bulk rule delete**](#scenario-gaps-are-soft-deleted-after-bulk-rule-delete)
    - [**Scenario: Gaps are soft-deleted after single rule delete**](#scenario-gaps-are-soft-deleted-after-single-rule-delete)
    - [**Scenario: Only successfully deleted rules have their gaps soft-deleted**](#scenario-only-successfully-deleted-rules-have-their-gaps-soft-deleted)
    - [**Scenario: Already soft-deleted gaps are left untouched**](#scenario-already-soft-deleted-gaps-are-left-untouched)
    - [**Scenario: Large rule sets are chunked**](#scenario-large-rule-sets-are-chunked)
  - [Ordering correctness](#ordering-correctness)
    - [**Scenario: Gaps are soft-deleted after saved-object deletion**](#scenario-gaps-are-soft-deleted-after-saved-object-deletion)
    - [**Scenario: Gaps are preserved when saved-object deletion fails**](#scenario-gaps-are-preserved-when-saved-object-deletion-fails)
  - [Error handling](#error-handling)
    - [**Scenario: Gap soft-deletion failure does not block rule deletion**](#scenario-gap-soft-deletion-failure-does-not-block-rule-deletion)
    - [**Scenario: Version conflicts are tolerated and logged**](#scenario-version-conflicts-are-tolerated-and-logged)

## Useful information

### Tickets

- [Optimize bulk rule deletion](https://github.com/elastic/kibana/issues/257234)
- [Optimize gap soft-delete with `update_by_query`](https://github.com/elastic/kibana/issues/264901)
- [Improve gap soft-delete performance](https://github.com/elastic/security-team/issues/16759) (internal)

### Terminology

- **Gap**: an event-log document (`event.action: gap`, `event.provider: alerting`) recording a time
  range where a rule did not execute. Stored in the event log data stream (`.kibana-event-log-ds`).
- **Gap soft-deletion**: setting `kibana.alert.rule.gap.deleted: true` on gap documents rather than
  physically deleting them.
- **`softDeleteGapsByQuery`**: the alerting helper (`lib/rule_gaps/soft_delete_gaps_by_query.ts`) that
  builds the gap query, chunks rule IDs at 10,000, and calls `IEventLogClient.softDeleteByQuery` once
  per chunk.
- **`softDeleteByQuery`**: the generic `IEventLogClient` method that sets one boolean field to `true`
  on every document matching a query, with a single blocking `_update_by_query` against the event log
  data stream. It owns the index name.

## Requirements

### Assumptions

- Scenarios execute with a user that has full rule CRUD privileges.
- Rules are created via the Detection Engine API.
- Gap documents exist in the event log data stream for the rules under test.

### Technical requirements

- Gap soft-deletion runs **after** saved-object deletion, in both bulk and single delete.
- Only the rules confirmed deleted by the saved-objects layer have their gaps soft-deleted.
- Gap soft-deletion uses a single blocking `_update_by_query` per 10,000-rule-ID chunk, built by the
  alerting `softDeleteGapsByQuery` helper and run via the generic `IEventLogClient.softDeleteByQuery`.
  The event log data-stream name is owned by the event log plugin.
- The query uses `conflicts: 'proceed'`; `failures`/`version_conflicts` in the response are logged.
- Gap soft-deletion failures are logged and swallowed — they never block rule deletion or cause an
  HTTP 500.
- Gap soft-deletion does not depend on the alerts-as-data service being enabled.

## Scenarios

### Core functionality

#### **Scenario: Gaps are soft-deleted after bulk rule delete**

**Automation**: 2 unit tests + 2 integration tests (single rule and multiple rules).

```Gherkin
Given several rules exist, each with gap documents in the event log data stream
When the user bulk-deletes the rules
Then the API returns 200 with the rules in the response
And softDeleteGapsByQuery is called with the deleted rule IDs
And every gap document for those rules has kibana.alert.rule.gap.deleted set to true
```

#### **Scenario: Gaps are soft-deleted after single rule delete**

**Automation**: 1 unit test + 1 integration test.

```Gherkin
Given a rule exists with gap documents
When the user deletes the rule
Then softDeleteGapsByQuery is called with the deleted rule's ID
And the rule's gap documents have kibana.alert.rule.gap.deleted set to true
```

#### **Scenario: Only successfully deleted rules have their gaps soft-deleted**

**Automation**: 1 unit test.

```Gherkin
Given 3 rules exist with gap documents
And saved-object deletion succeeds for rule 1 and rule 3 but fails for rule 2
When the user bulk-deletes all 3 rules
Then softDeleteGapsByQuery is called with [rule 1, rule 3] only
```

> The unit test asserts the rule IDs passed to `softDeleteGapsByQuery`; that rule 2's gap
> documents are consequently untouched follows from the query scope rather than being
> asserted directly. No integration test currently inspects rule 2's documents.

#### **Scenario: Already soft-deleted gaps are left untouched**

**Automation**: 1 unit test + 1 integration test.

```Gherkin
Given a rule has gap documents, some of which already have deleted set to true
When the user deletes the rule
Then the update_by_query excludes already-deleted gaps via its must_not clause
And only the non-deleted gaps are updated
```

#### **Scenario: Large rule sets are chunked**

**Automation**: 1 unit test.

```Gherkin
Given 15,000 rule IDs are being deleted
When softDeleteGapsByQuery runs
Then it issues 2 softDeleteByQuery calls, of 10,000 and 5,000 rule IDs
```

### Ordering correctness

#### **Scenario: Gaps are soft-deleted after saved-object deletion**

**Automation**: 2 unit tests (bulk and single delete).

```Gherkin
Given a rule exists with gap documents
When the user deletes the rule
Then the saved-object deletion happens before softDeleteGapsByQuery is called
```

#### **Scenario: Gaps are preserved when saved-object deletion fails**

**Automation**: 2 unit tests (bulk and single delete).

```Gherkin
Given rules exist with gap documents
And saved-object deletion fails
When the user deletes the rules
Then softDeleteGapsByQuery is never called
```

> Both unit tests assert that `softDeleteGapsByQuery` is not called; because the helper is
> the only writer of the `deleted` flag on this path, the gap documents are necessarily left
> active. That outcome is not asserted against real documents — no integration test forces a
> saved-object deletion failure and then counts active gaps.

### Error handling

#### **Scenario: Gap soft-deletion failure does not block rule deletion**

**Automation**: 4 unit tests (bulk and single delete, for each of the two failure sources).

```Gherkin
Given rules exist with gap documents
And obtaining the event log client fails
When the user deletes the rules
Then the API returns 200 with the rules deleted
And the failure is logged
And softDeleteGapsByQuery is never called
```

> `softDeleteGapsByQuery` swallows its own per-chunk errors and never rejects — a behaviour
> pinned by its own unit test — so a failing `getEventLogClient()` is the only way the
> callers' `try/catch` is reached in production. Two further unit tests drive the helper
> itself to reject in order to pin the callers' suppression behaviour directly.

#### **Scenario: Version conflicts are tolerated and logged**

**Automation**: 1 unit test.

```Gherkin
Given gap documents are being modified concurrently while a rule is deleted
When softDeleteGapsByQuery runs
Then the update_by_query uses conflicts: 'proceed'
And version_conflicts and failures reported in the response are logged
And rule deletion still succeeds
```

#### **Scenario: A malformed gap document does not fail the batch**

**Automation**: 1 integration test + 3 unit tests (script generation, including the flat-field case).

```Gherkin
Given a rule has 5 well-formed gap documents
And it also has gap documents missing the kibana.alert.rule.gap object
When the user deletes the rule
Then all 5 well-formed gap documents are soft-deleted
And the malformed documents are left untouched rather than failing the update_by_query
```

#### **Scenario: The soft-delete field name is validated before use**

**Automation**: 6 unit tests.

```Gherkin
Given a caller passes a field that is not a dot-delimited path of [a-zA-Z0-9_] segments
When softDeleteByQuery is called
Then it throws before issuing any request to Elasticsearch
```

> The field is interpolated into Painless source, so the guard exists to make script
> injection through this platform contract impossible.
