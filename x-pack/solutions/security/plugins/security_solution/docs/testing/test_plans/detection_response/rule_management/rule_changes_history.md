# Test plan: detection rule changes history <!-- omit from toc -->

<!-- Convey the plan's current status. -->

**Status**: `in progress`. Matches [9.5 milestone](https://github.com/elastic/security-team/issues/12367).

## Summary <!-- omit from toc -->

This is a test plan for the **Detection rule changes history** feature: capturing a snapshot of a detection rule upon every rule change with full context (who, when, what action) and exposing it through a dedicated Rule Changes History page (backed by a dedicated API). On top of that it includes scenarios for restoring the rule's state to the desired previous value.

Out of scope: diffing against the current revision, diffing two arbitrary revisions, filtering, and surfacing history write failures in the UI.

## Table of contents <!-- omit from toc -->

<!--
Please use the "Markdown All in One" VS Code extension to keep the TOC in sync with the text:
https://marketplace.visualstudio.com/items?itemName=yzhang.markdown-all-in-one
-->

- [Useful information](#useful-information)
  - [Tickets](#tickets)
  - [Terminology](#terminology)
  - [Terminology — diff specifics](#terminology--diff-specifics)
- [Requirements](#requirements)
  - [Assumptions](#assumptions)
  - [Technical requirements](#technical-requirements)
  - [Product requirements](#product-requirements)
- [Scenarios](#scenarios)
  - [Capture rule change](#capture-rule-change)
    - [**Scenario: Capture a rule change**](#scenario-capture-a-rule-change)
    - [**Scenario: Capture bulk action changes**](#scenario-capture-bulk-action-changes)
    - [**Scenario: Capture change author**](#scenario-capture-change-author)
  - [Capture rule change for pre-changes history rules](#capture-rule-change-for-pre-changes-history-rules)
    - [**Scenario: Capture a pre-changes history rule change**](#scenario-capture-a-pre-changes-history-rule-change)
    - [**Scenario: Capture bulk action changes**](#scenario-capture-bulk-action-changes-1)
  - [View the rule change history](#view-the-rule-change-history)
    - [**Scenario: Opening the Rule Changes History page from the Rule Details page**](#scenario-opening-the-rule-changes-history-page-from-the-rule-details-page)
    - [**Scenario: Listing the newest change items first**](#scenario-listing-the-newest-change-items-first)
    - [**Scenario: Auto-selecting the newest change item**](#scenario-auto-selecting-the-newest-change-item)
    - [**Scenario: Showing details for a selected change item**](#scenario-showing-details-for-a-selected-change-item)
    - [**Scenario: Showing a diff against the previous revision**](#scenario-showing-a-diff-against-the-previous-revision)
    - [**Scenario: Loading more change items on scroll**](#scenario-loading-more-change-items-on-scroll)
    - [**Scenario: Explaining when history tracking started**](#scenario-explaining-when-history-tracking-started)
  - [Restore a rule revision](#restore-a-rule-revision)
    - [**Scenario: Restore a rule to a selected historical revision**](#scenario-restore-a-rule-to-a-selected-historical-revision)
    - [**Scenario: Restore applies across rule types**](#scenario-restore-applies-across-rule-types)
    - [**Scenario: Restore a rule revision via the API**](#scenario-restore-a-rule-revision-via-the-api)
    - [**Scenario: Restoring the current revision**](#scenario-restoring-the-current-revision)
    - [**Scenario: Capturing the restore trigger source**](#scenario-capturing-the-restore-trigger-source)
    - [**Scenario: Restoring a non-existent rule**](#scenario-restoring-a-non-existent-rule)
    - [**Scenario: Restoring to a non-existent revision**](#scenario-restoring-to-a-non-existent-revision)
  - [Error handling](#error-handling)
    - [**Scenario: Requesting history for a non-existent rule**](#scenario-requesting-history-for-a-non-existent-rule)
    - [**Scenario: Rejecting invalid pagination parameters**](#scenario-rejecting-invalid-pagination-parameters)
    - [**Scenario: Showing an error state when history fails to load**](#scenario-showing-an-error-state-when-history-fails-to-load)
  - [Edge cases](#edge-cases)
    - [**Scenario: Rule with no captured history**](#scenario-rule-with-no-captured-history)
    - [**Scenario: Creation item has no previous values**](#scenario-creation-item-has-no-previous-values)
    - [**Scenario: Change item with no field changes**](#scenario-change-item-with-no-field-changes)
    - [**Scenario: Runtime-only fields are excluded from the diff**](#scenario-runtime-only-fields-are-excluded-from-the-diff)
    - [**Scenario: Change item produced by a system-driven action has no user**](#scenario-change-item-produced-by-a-system-driven-action-has-no-user)
    - [**Scenario: Showing a callout for actions without a previous snapshot**](#scenario-showing-a-callout-for-actions-without-a-previous-snapshot)
    - [**Scenario: A single change touches many fields**](#scenario-a-single-change-touches-many-fields)
    - [**Scenario: Secret rule fields are not exposed in snapshots**](#scenario-secret-rule-fields-are-not-exposed-in-snapshots)
  - [Authorization / RBAC](#authorization--rbac)
    - [**Scenario: User with read privileges can view rule history**](#scenario-user-with-read-privileges-can-view-rule-history)
    - [**Scenario: User without rule read privileges cannot view rule history**](#scenario-user-without-rule-read-privileges-cannot-view-rule-history)
    - [**Scenario: User without write privileges cannot restore a revision**](#scenario-user-without-write-privileges-cannot-restore-a-revision)

## Useful information

### Tickets

- [Detection rule changes history and comparison of revisions](https://github.com/elastic/security-team/issues/12367) (internal epic)
- [Restore a historical rule revision](https://github.com/elastic/security-team/issues/12432) (internal epic)
- [Detection changes history](https://github.com/elastic/security-team/issues/12431) (internal parent initiative)
- [Telemetry](https://github.com/elastic/security-team/issues/15307) (internal)
- [UI documentation request](https://github.com/elastic/docs-content/issues/4886)

### Terminology

- **Change item** (or **history item**): a single captured change to a rule, containing the timestamp, user, action, full rule snapshot.
- **Action**: the human-readable operation that produced a change item. Known values: `rule_create`, `rule_update` (alerting framework), `rule_install`, `rule_upgrade`, `rule_duplicate`, `rule_import`, `rule_revert`, `rule_restore` (Security Solution).
- **Pre-changes history rule**: a rule that existed before change tracking was enabled and therefore has no captured history yet. Its first captured change item is the first change recorded after tracking started; there is no preceding `rule_create` item and no captured prior revision to diff against.
- **`revision`**: a rule field incremented on every change to the rule's parameters.
- **`version`**: the prebuilt-rule version field (for custom rules, the user-managed version).
- **Snapshot**: the full state of the rule (an Alerting Framework's `RuleDomain`) captured at the moment a change item was captured. API layer transforms it to `RuleResponse`.
- **`old_values`**: a sparse object holding only the fields whose values differ between a change item's snapshot and the immediately preceding revision's snapshot, computed as an [RFC 7396 JSON Merge Patch](https://datatracker.ietf.org/doc/html/rfc7396). `null` for creation events.
- **`tracking_started_at`**: the ISO-8601 timestamp of the earliest captured change event for a rule. Absent when the rule has no history items.
- **Change tracking instrumentation**: the alerting framework capability that produces the underlying changes captured by this feature.
- **Restore (rollback)**: applying a historical rule's snapshot as the current state. Captured as a new change item with action `rule_restore`; it creates a new revision and preserves existing history.

### Terminology — diff specifics

- **Rule runtime fields**: fields excluded from the user-facing diff because they change as a side effect rather than as a user-meaningful edit: `rule_source`, `revision`, `updated_at`, `updated_by`, `created_at`, `created_by`, `execution_summary`, `meta`.

## Requirements

### Assumptions

Assumptions about test environments and scenarios outlined in this test plan.

- User is authenticated and authorized for rule changes history until it's specified otherwise.
- A package with prebuilt rules is installed, and rule assets are created where relevant.
- The user has navigated to the Rule Changes History page, where relevant.

### Technical requirements

Non-functional requirements for the functionality outlined in this test plan.

- The history API is **internal** and versioned (`version: '1'`).
- Rule change tracking functionality is built on top of Alerting Framework.
- Pagination is bounded: `per_page` between 1 and 100 (default 20); `page` is 1-based (default 1).
- Snapshots must not decrypt or expose secret rule fields (e.g. api keys).

### Product requirements

Functional requirements for the functionality outlined in this test plan.

User stories:

- As a detection engineer, I can see the previous rule versions and revisions, who made the changes, when they were made, and what was changed.
- As a detection engineer, I can compare (see a diff between) a rule revision in the history and its immediately preceding revision.

Success criteria — a user can:

- View rule changes history on a dedicated Rule Changes History page, reached from a menu item on the Rule Details page.
- See change items ordered by date-time descending (newest first).
- Paginate / load more change items when there is more than one page.
- For each change item, see: when it happened, who made it, what action occurred, what fields changed, the corresponding `revision` and `version`, a full snapshot of the revision, and a diff against the previous revision.
- See a clear message explaining when history tracking started, so missing earlier data is not confusing.

## Scenarios

### Capture rule change

#### **Scenario: Capture a rule change**

**Automation**: 1 integration test + 1 e2e test per case.

```Gherkin
When a user performs <change action>
And opens the Rule Changes History page for the affected rule
Then a new change item with action "<action value>" should be captured as the newest item
And it should record the user and date-time of the change
And it should expose the resulting rule snapshot with its revision and version
And it should show the changed fields and their diff against the previous revision
```

**Cases:**

| `<change action>`                       | `<action value>` |
| --------------------------------------- | ---------------- |
| Create a custom rule                    | `rule_create`    |
| Edit one or more of a rule's fields     | `rule_update`    |
| Install a prebuilt rule                 | `rule_install`   |
| Upgrade a prebuilt rule                 | `rule_upgrade`   |
| Duplicate a rule                        | `rule_duplicate` |
| Import a rule                           | `rule_import`    |
| Revert a prebuilt rule's customizations | `rule_revert`    |

#### **Scenario: Capture bulk action changes**

**Automation**: 1 integration test.

```Gherkin
Given several rules exist
When a user performs a bulk edit on those rules
Then each affected rule should receive its own new change item
And each item should describe the change applied to that rule
And the items should include metadata describing the bulk operation
```

#### **Scenario: Capture change author**

**Automation**: 1 integration test.

```Gherkin
Given a user "userA" is authenticated
When userA updates a rule
And opens the Rule Changes History page for that rule
Then the newest change item should attribute the change to userA's login
And user.id should be present when the auth realm provides a profile id
```

### Capture rule change for pre-changes history rules

These scenarios cover update/edit actions performed on **pre-changes history rules** — rules that existed before change tracking was enabled and therefore have no captured history yet. For these rules the captured change item is the first item in their history: there is no preceding `rule_create` (or `rule_install`) item, and there is no captured prior revision to diff against.

#### **Scenario: Capture a pre-changes history rule change**

**Automation**: 1 integration test + 1 e2e test per case.

```Gherkin
Given a pre-changes history rule with no captured change items
When a user performs <change action>
And opens the Rule Changes History page for the affected rule
Then a change item with action "<action value>" should be captured as the first captured item
And no preceding "rule_create" or "rule_install" item should be present
And the page should indicate that no prior revision is available to diff against
```

**Cases:**

| `<change action>`                           | `<action value>` |
| ------------------------------------------- | ---------------- |
| Edit one or more of the rule's fields       | `rule_update`    |
| Upgrade the prebuilt rule                   | `rule_upgrade`   |
| Duplicate the rule                          | `rule_duplicate` |
| Import a rule file that overwrites the rule | `rule_import`    |
| Revert the prebuilt rule's customizations   | `rule_revert`    |

#### **Scenario: Capture bulk action changes**

**Automation**: 1 integration test.

```Gherkin
Given several pre-changes history rules with no captured change items
When a user performs a bulk edit on those rules
Then each affected rule should receive its first captured change item
And each item should describe the change applied to that rule
And the items should include metadata describing the bulk operation
```

### View the rule change history

#### **Scenario: Opening the Rule Changes History page from the Rule Details page**

**Automation**: 1 e2e test.

```Gherkin
Given a rule with captured change history
When a user opens the rule's Rule Details page
Then a "History" menu item should be displayed
When the user clicks the "History" menu item
Then the Rule Changes History page should be rendered for that rule
```

#### **Scenario: Listing the newest change items first**

**Automation**: 1 integration test + 1 e2e test.

```Gherkin
Given a rule has been changed multiple times at distinct timestamps
When a user opens the Rule Changes History page
Then the change items should be listed ordered by date-time descending
And the first item should correspond to the most recent change
And each row should show the date-time, user, action badge, and changed field names
```

#### **Scenario: Auto-selecting the newest change item**

**Automation**: 1 e2e test.

```Gherkin
Given a rule with multiple captured change items
When a user opens the Rule Changes History page
Then the first (newest) change item should be auto-selected
And its details and diff should be rendered without any further interaction
Then a user open a rule edit page
And changes any fields
And saves the rule
And a user navigated to "Rule Changes History" page for the rule
Then the first (newest) change item corresponding to the latest rule edit should be auto-selected
And its details and diff should be rendered without any further interaction
```

#### **Scenario: Showing details for a selected change item**

**Automation**: 1 e2e test.

```Gherkin
Given a rule with multiple captured change items
When a user selects a change item in the timeline
Then the view should show that item's full rule snapshot
And it should show the item's revision and version values
And the selected item should be visually marked as active
```

#### **Scenario: Showing a diff against the previous revision**

**Automation**: 1 integration test + 1 e2e test.

```Gherkin
Given a rule whose "name" and "severity" fields were changed in a captured revision
When a user selects the change item corresponding to that revision
Then the diff should show "name" and "severity" changing from their previous values to the new values
And only fields that actually changed should appear in the diff
And the previous values should equal the values from the immediately preceding revision
```

#### **Scenario: Loading more change items on scroll**

**Automation**: 1 integration test + 1 e2e test.

```Gherkin
Given a rule with more change items than fit on a single page (e.g. 25 items, 20 per page)
When a user opens the Rule Changes History page
Then the first page of items should be shown
When the user scrolls to the bottom of the timeline
Then the next page should be fetched and appended
And there should be no duplicate or skipped items across pages
And scrolling should continue until all items are loaded
```

#### **Scenario: Explaining when history tracking started**

**Automation**: 1 integration test + 1 e2e test.

```Gherkin
Given a rule with captured change history
When a user opens the Rule Changes History page and scrolls to the end of the timeline
Then a footer message should explain when history tracking started for this rule
And it should clarify that changes before that date are not available
And the date should equal the earliest captured change event (tracking_started_at)
```

### Restore a rule revision

This section covers the **Rule Restore** feature ([epic](https://github.com/elastic/security-team/issues/12432)): restoring a rule to any of its historical revisions, building on the changes history foundation. Restoring applies a historical revision's snapshot as the rule's current state. It is captured as a new change item and creates a new revision — it never erases existing history. Restore works for custom rules, customized prebuilt rules, and prebuilt rules, and is available programmatically via API for use from the UI (human), chat (LLM), and autonomous agents.

#### **Scenario: Restore a rule to a selected historical revision**

**Automation**: 1 integration test + 1 e2e test.

```Gherkin
Given a rule with multiple captured revisions in its history
When a user restores the rule to an earlier revision
Then the rule's current configuration should match that revision's snapshot
And the rule's revision should be incremented (a new revision is created)
And the existing history should be preserved (no items removed)
And a new change item with action "rule_restore" should be captured as the newest item
And the change item should reference the revision that was restored
```

#### **Scenario: Restore applies across rule types**

**Automation**: 1 integration test per case.

```Gherkin
Given a <rule type> with an earlier captured revision
When a user restores it to that revision
Then the restore should succeed
And the rule's current configuration should match the restored revision's snapshot
```

**Cases:**

| `<rule type>`            |
| ------------------------ |
| Custom rule              |
| Customized prebuilt rule |
| Prebuilt rule            |

#### **Scenario: Restore a rule revision via the API**

**Automation**: 1 integration test.

```Gherkin
Given a rule with an earlier captured revision
When an API consumer requests a restore of that rule to the specified revision
Then the API should return a successful response with the updated rule
And subsequent reads of the rule should return the restored configuration
```

#### **Scenario: Restoring the current revision**

**Automation**: 1 integration test.

```Gherkin
Given a rule whose current state equals its most recent revision
When a user restores the rule to that same revision
Then the request should be handled gracefully without corrupting the rule
And the rule's current configuration should remain unchanged
```

#### **Scenario: Capturing the restore trigger source**

**Automation**: 1 telemetry test per case.

```Gherkin
Given a rule with an earlier captured revision
When the rule is restored from <trigger>
Then usage telemetry should record the restore differentiated by trigger source
And differentiated by rule kind (custom, customized prebuilt, prebuilt)
```

**Cases:**

| `<trigger>`                |
| -------------------------- |
| The UI (human)             |
| Chat (LLM)                 |
| The API (autonomous agent) |

#### **Scenario: Restoring a non-existent rule**

**Automation**: 1 integration test.

```Gherkin
When a user requests a restore for a ruleId that does not exist
Then the API should return a 404 Not Found response
```

#### **Scenario: Restoring to a non-existent revision**

**Automation**: 1 integration test.

```Gherkin
Given a rule exists
When a user requests a restore to a revision that is not present in the rule's history
Then the API should return a 404 Not Found response
And the rule should remain unchanged
```

### Error handling

#### **Scenario: Requesting history for a non-existent rule**

**Automation**: 1 integration test.

```Gherkin
When a user requests the history for a ruleId that does not exist
Then the API should return a 404 Not Found response
```

#### **Scenario: Rejecting invalid pagination parameters**

**Automation**: integration tests, one per invalid input.

```Gherkin
Given a rule exists
When a user requests its history with <invalid_param>
Then the API should return a 400 Bad Request response
```

**Examples:**

`<invalid_param>` is

- `page=0` (below minimum)
- `per_page=0` (below minimum)
- `per_page=101` (above maximum)
- `page` or `per_page` set to a non-integer value

#### **Scenario: Showing an error state when history fails to load**

**Automation**: 1 e2e test.

```Gherkin
Given the history request returns an error
When a user opens the Rule Changes History page
Then an error notification should be shown to the user
And the view should not display a partial or stale timeline as if it were complete
```

### Edge cases

#### **Scenario: Rule with no captured history**

**Automation**: 1 integration test + 1 e2e test.

```Gherkin
Given a rule that has no captured change items
When a user requests its history
Then the response should contain an empty items array, total 0, and no tracking_started_at
When the user opens the Rule Changes History page for that rule
Then an empty state should be displayed instead of a timeline
```

#### **Scenario: Creation item has no previous values**

**Automation**: 1 integration test.

```Gherkin
Given a newly created custom rule
When a user requests its history
Then the "rule_create" item's old_values should be null
And the UI should not attempt to render a diff for it
```

#### **Scenario: Change item with no field changes**

**Automation**: 1 integration test.

```Gherkin
Given a rule was "saved" without changing any field values
When a user requests its history
Then the corresponding change item's old_values should be an empty object
```

#### **Scenario: Runtime-only fields are excluded from the diff**

**Automation**: 1 e2e test.

```Gherkin
Given a change item whose only differences are rule's runtime fields
  (updated_at, updated_by, created_at, created_by, rule_source, execution_summary, meta)
When a user selects that change item
Then the diff should not display those runtime fields as user-facing changes
```

#### **Scenario: Change item produced by a system-driven action has no user**

**Automation**: 1 integration test.

```Gherkin
Given a change item captured for a system-driven action (no authenticated user)
When a user requests the rule's history
Then the change item's user should be null
And the response should still be valid
And the UI should render the item without a user attribution
```

#### **Scenario: Showing a callout for actions without a previous snapshot**

**Automation**: 1 e2e test.

```Gherkin
Given a change item whose action lacks a meaningful previous snapshot to diff against
  (e.g. an import or revert captured without a prior revision)
When a user selects that change item
Then a warning callout should explain that no prior state is available for comparison
```

#### **Scenario: A single change touches many fields**

**Automation**: 1 e2e test.

```Gherkin
Given a change item that modified more fields than the inline changed-fields limit
  (e.g. a bulk edit or prebuilt rule upgrade)
When a user views that item in the timeline
Then the first few changed-field badges should be shown inline
And the remainder should be collapsed into a trailing "+N" overflow badge
And the row height should remain stable
```

#### **Scenario: Secret rule fields are not exposed in snapshots**

**Automation**: 1 integration test.

```Gherkin
Given a rule with actions that reference connectors holding secrets
When a user requests the rule's history
Then the rule snapshots in the change items should not contain decrypted secret values
```

### Authorization / RBAC

#### **Scenario: User with read privileges can view rule history**

**Automation**: 1 integration test.

```Gherkin
Given a user with rules read privileges
When the user requests a rule's history
Then the API should return a successful response with the change history
```

#### **Scenario: User without rule read privileges cannot view rule history**

**Automation**: 1 integration test.

```Gherkin
Given a user without rules read privileges
When the user requests a rule's history
Then the API should return a 403 Forbidden response
```

#### **Scenario: User without write privileges cannot restore a revision**

**Automation**: 1 integration test.

```Gherkin
Given a user without rules write privileges
When the user requests a restore of a rule to an earlier revision
Then the API should return a 403 Forbidden response
And the rule should remain unchanged
```
