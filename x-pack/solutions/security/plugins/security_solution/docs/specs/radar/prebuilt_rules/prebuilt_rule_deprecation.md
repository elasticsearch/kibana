# Test plan: Deprecated prebuilt rules <!-- omit from toc -->

**Status**: `in progress`.

> [!TIP]
> If you're new to prebuilt rules, get started [here](./prebuilt_rules.md) and check an overview of the features of prebuilt rules in [this section](./prebuilt_rules_common_info.md#features).

## Summary <!-- omit from toc -->

This is a test plan for the workflows related to deprecated prebuilt rules:

- Default exclusion of deprecated rules from all existing install/upgrade/bootstrap flows
- The deprecation review endpoint
- The deprecated rules count in the status endpoint
- The deprecation callout and modal on the Rule Management page
- The deprecation callout on the Rule Details page
- Delete and duplicate-and-delete actions for deprecated rules

## Table of contents <!-- omit from toc -->

<!--
Please use the "Markdown All in One" VS Code extension to keep the TOC in sync with the text:
https://marketplace.visualstudio.com/items?itemName=yzhang.markdown-all-in-one
-->

- [Useful information](#useful-information)
  - [Tickets](#tickets)
  - [Terminology](#terminology)
- [Requirements](#requirements)
  - [Assumptions](#assumptions)
  - [Technical requirements](#technical-requirements)
  - [Product requirements](#product-requirements)
- [Scenarios](#scenarios)
  - [Default exclusion from existing flows](#default-exclusion-from-existing-flows)
    - [**Scenario: Deprecated rules are excluded from install review**](#scenario-deprecated-rules-are-excluded-from-install-review)
    - [**Scenario: Deprecated rules are excluded from upgrade review**](#scenario-deprecated-rules-are-excluded-from-upgrade-review)
    - [**Scenario: Deprecated rules are excluded from bootstrap**](#scenario-deprecated-rules-are-excluded-from-bootstrap)
  - [Status API: deprecated count](#status-api-deprecated-count)
    - [**Scenario: Status API returns correct count of installed deprecated rules**](#scenario-status-api-returns-correct-count-of-installed-deprecated-rules)
    - [**Scenario: Status API returns zero when no installed rules are deprecated**](#scenario-status-api-returns-zero-when-no-installed-rules-are-deprecated)
    - [**Scenario: Deprecated count decreases when a deprecated rule is deleted**](#scenario-deprecated-count-decreases-when-a-deprecated-rule-is-deleted)
  - [Deprecation review: no filter](#deprecation-review-no-filter)
    - [**Scenario: Review returns all installed deprecated rules when no ids provided**](#scenario-review-returns-all-installed-deprecated-rules-when-no-ids-provided)
    - [**Scenario: Review returns installed rule name, not package name**](#scenario-review-returns-installed-rule-name-not-package-name)
  - [Deprecation review: with ids filter](#deprecation-review-with-ids-filter)
    - [**Scenario: Review filters by installed rule SO ids**](#scenario-review-filters-by-installed-rule-so-ids)
    - [**Scenario: Review returns empty when filtered rule is not deprecated**](#scenario-review-returns-empty-when-filtered-rule-is-not-deprecated)
    - [**Scenario: Review returns 400 when filtered id does not exist**](#scenario-review-returns-400-when-filtered-id-does-not-exist)
  - [Deprecation review: edge cases](#deprecation-review-edge-cases)
    - [**Scenario: Review respects MAX\_DEPRECATED\_RULES\_TO\_RETURN limit**](#scenario-review-respects-max_deprecated_rules_to_return-limit)
    - [**Scenario: Review handles package with no deprecated rules**](#scenario-review-handles-package-with-no-deprecated-rules)
    - [**Scenario: Review excludes custom rules whose rule\_id matches a deprecated asset**](#scenario-review-excludes-custom-rules-whose-rule_id-matches-a-deprecated-asset)
    - [**Scenario: Review excludes a custom rule looked up by SO id whose rule\_id matches a deprecated asset**](#scenario-review-excludes-a-custom-rule-looked-up-by-so-id-whose-rule_id-matches-a-deprecated-asset)
  - [Rule Management page: deprecation callout](#rule-management-page-deprecation-callout)
    - [**Scenario: Callout appears when user has installed deprecated rules**](#scenario-callout-appears-when-user-has-installed-deprecated-rules)
    - [**Scenario: Callout does not appear when no deprecated rules are installed**](#scenario-callout-does-not-appear-when-no-deprecated-rules-are-installed)
    - [**Scenario: Callout can be dismissed and does not reappear on page refresh**](#scenario-callout-can-be-dismissed-and-does-not-reappear-on-page-refresh)
    - [**Scenario: Dismissed callout reappears after 7 days**](#scenario-dismissed-callout-reappears-after-7-days)
  - [Rule Management page: deprecated rules modal](#rule-management-page-deprecated-rules-modal)
    - [**Scenario: Modal lists all deprecated installed rules with links**](#scenario-modal-lists-all-deprecated-installed-rules-with-links)
    - [**Scenario: User can delete all deprecated rules from the modal**](#scenario-user-can-delete-all-deprecated-rules-from-the-modal)
    - [**Scenario: Delete all button is disabled for read-only users**](#scenario-delete-all-button-is-disabled-for-read-only-users)
  - [Rule Details page: deprecation callout](#rule-details-page-deprecation-callout)
    - [**Scenario: Callout appears on deprecated prebuilt rule details page**](#scenario-callout-appears-on-deprecated-prebuilt-rule-details-page)
    - [**Scenario: Callout displays deprecation reason when available**](#scenario-callout-displays-deprecation-reason-when-available)
    - [**Scenario: Callout does not display deprecation reason when absent**](#scenario-callout-does-not-display-deprecation-reason-when-absent)
    - [**Scenario: Callout does not appear on non-deprecated rule details page**](#scenario-callout-does-not-appear-on-non-deprecated-rule-details-page)
    - [**Scenario: Callout does not appear on custom rule details page**](#scenario-callout-does-not-appear-on-custom-rule-details-page)
    - [**Scenario: Action buttons are disabled for read-only users**](#scenario-action-buttons-are-disabled-for-read-only-users)
  - [Rule Details page: delete deprecated rule](#rule-details-page-delete-deprecated-rule)
    - [**Scenario: User can delete a deprecated rule from its details page**](#scenario-user-can-delete-a-deprecated-rule-from-its-details-page)
  - [Rule Details page: duplicate and delete deprecated rule](#rule-details-page-duplicate-and-delete-deprecated-rule)
    - [**Scenario: User can duplicate and delete a deprecated rule**](#scenario-user-can-duplicate-and-delete-a-deprecated-rule)
    - [**Scenario: Original rule is not deleted if duplication fails**](#scenario-original-rule-is-not-deleted-if-duplication-fails)
  - [Confirmation modal behavior](#confirmation-modal-behavior)
    - [**Scenario: User can cancel the bulk delete confirmation modal**](#scenario-user-can-cancel-the-bulk-delete-confirmation-modal)
    - [**Scenario: User can cancel the delete confirmation on the rule details page**](#scenario-user-can-cancel-the-delete-confirmation-on-the-rule-details-page)
  - [Authorization](#authorization)
    - [**Scenario: Deprecation review endpoint requires read privileges**](#scenario-deprecation-review-endpoint-requires-read-privileges)
    - [**Scenario: Read-only users see callouts but cannot perform actions**](#scenario-read-only-users-see-callouts-but-cannot-perform-actions)

## Useful information 

### Tickets

- [Deprecated Prebuilt Rules epic](https://github.com/elastic/security-team/issues/6344)

### Terminology

- [Common terminology](./prebuilt_rules_common_info.md#common-terminology).
- **Deprecated rule asset**: A `security-rule` saved object with `deprecated: true`, installed by Fleet from the detection rules package. Contains only `rule_id`, `version`, `name`, `deprecated`, and optionally `deprecated_reason`.
- **Installed deprecated rule**: A prebuilt detection rule (alerting rule SO) that has a corresponding deprecated rule asset in the package. The user installed the rule before it was deprecated.
- **Deprecation callout**: A warning callout shown on the Rule Management and Rule Details pages when deprecated rules are present.

## Requirements

### Assumptions

- [Common assumptions](./prebuilt_rules_common_info.md#common-assumptions).
- The detection rules Fleet package must contain deprecated rule assets (9.4+ packages).
- To have "installed deprecated rules", the user must have installed a prebuilt rule before it was marked as deprecated in a subsequent package version.

### Technical requirements

- Deprecated rule assets must not exceed `MAX_DEPRECATED_RULES_TO_RETURN` (200) in a single API response.

### Product requirements

User stories:

- User can see how many of their installed rules are deprecated via the status API.
- User can see a warning callout on the Rule Management page when they have deprecated rules installed.
- User can dismiss the callout and it reappears after 7 days.
- User can open a modal listing all their deprecated installed rules with links to each rule's details page.
- User can delete all deprecated rules at once from the modal.
- User can see a warning callout on a specific Rule Details page if that rule is deprecated.
- User can delete a deprecated rule from its details page.
- User can duplicate a deprecated rule as a custom rule and delete the original from its details page.
- User without edit privileges can see the callouts but cannot perform actions.

## Scenarios

### Default exclusion from existing flows

#### **Scenario: Deprecated rules are excluded from install review**

**Automation**: API integration tests + unit tests.

```Gherkin
Given a package contains both active and deprecated rule assets
And the user has not installed any rules
When the user requests the installation review
Then only active (non-deprecated) rules appear as installable
And deprecated rules are not included in the response
```

#### **Scenario: Deprecated rules are excluded from upgrade review**

**Automation**: API integration tests + unit tests.

```Gherkin
Given a package contains a deprecated rule asset for a rule the user has installed
When the user requests the upgrade review
Then the deprecated rule does not appear as upgradeable
```

#### **Scenario: Deprecated rules are excluded from bootstrap**

**Automation**: API integration tests + unit tests.

```Gherkin
Given a package contains deprecated rule assets
When the bootstrap endpoint is called
Then deprecated rules are not included in the bootstrapped rules
```

### Status API: deprecated count

#### **Scenario: Status API returns correct count of installed deprecated rules**

**Automation**: API integration tests.

```Gherkin
Given the package contains N deprecated rule assets
And the user has installed M of those rules (before they were deprecated)
When the user requests the prebuilt rules status
Then num_prebuilt_rules_deprecated equals M (the intersection count)
And num_prebuilt_rules_to_install does not include deprecated rules
And num_prebuilt_rules_to_upgrade does not include deprecated rules
```

#### **Scenario: Status API returns zero when no installed rules are deprecated**

**Automation**: API integration tests.

```Gherkin
Given the package contains deprecated rule assets
And the user has not installed any of those rules
When the user requests the prebuilt rules status
Then num_prebuilt_rules_deprecated equals 0
```

#### **Scenario: Deprecated count decreases when a deprecated rule is deleted**

**Automation**: API integration tests.

```Gherkin
Given the user has M installed deprecated rules
When the user deletes one of the deprecated rules
And the user requests the prebuilt rules status
Then num_prebuilt_rules_deprecated equals M - 1
```

### Deprecation review: no filter

#### **Scenario: Review returns all installed deprecated rules when no ids provided**

**Automation**: API integration tests.

```Gherkin
Given the package contains deprecated rule assets
And the user has installed some of those rules
When the user requests the deprecation review with no filter
Then the response contains only rules that are both deprecated in the package AND installed
And each rule has the installed rule's SO id, rule_id, and name
And deprecated_reason is included when present on the asset
```

#### **Scenario: Review returns installed rule name, not package name**

**Automation**: API integration tests.

```Gherkin
Given the user has installed a prebuilt rule and customized its name
And that rule is now deprecated in the package
When the user requests the deprecation review
Then the response contains the user's customized name, not the original package name
```

### Deprecation review: with ids filter

#### **Scenario: Review filters by installed rule SO ids**

**Automation**: API integration tests.

```Gherkin
Given the user has installed rules A, B, and C
And rules A and B are deprecated in the package
And rule C is not deprecated
When the user requests the deprecation review filtered to only rule A
Then only rule A is returned
```

#### **Scenario: Review returns empty when filtered rule is not deprecated**

**Automation**: API integration tests.

```Gherkin
Given the user has installed rule D which is not deprecated
When the user requests the deprecation review filtered to rule D
Then the response contains an empty rules array
```

#### **Scenario: Review returns 400 when filtered id does not exist**

**Automation**: API integration tests.

```Gherkin
Given a non-existent rule SO id
When the user requests the deprecation review filtered to the non-existent id
Then the endpoint returns a 400 error with message "No rules found for bulk get"
```

### Deprecation review: edge cases

#### **Scenario: Review respects MAX_DEPRECATED_RULES_TO_RETURN limit**

**Automation**: Unit tests.

```Gherkin
Given the package contains more than 200 deprecated rule assets
When the user requests the deprecation review
Then at most 200 deprecated rules are returned
```

#### **Scenario: Review handles package with no deprecated rules**

**Automation**: API integration tests.

```Gherkin
Given the package contains no deprecated rule assets
When the user requests the deprecation review
Then the response contains an empty rules array
```

#### **Scenario: Review excludes custom rules whose rule_id matches a deprecated asset**

**Automation**: API integration tests.

```Gherkin
Given a custom rule is installed with a rule_id
And the package contains a deprecated rule asset with the same rule_id
When the user requests the deprecation review with no filter
Then the response contains an empty rules array
```

#### **Scenario: Review excludes a custom rule looked up by SO id whose rule_id matches a deprecated asset**

**Automation**: API integration tests.

```Gherkin
Given a custom rule is installed with a rule_id
And the package contains a deprecated rule asset with the same rule_id
When the user requests the deprecation review filtered to the custom rule's SO id
Then the response contains an empty rules array
```

### Rule Management page: deprecation callout

#### **Scenario: Callout appears when user has installed deprecated rules**

**Automation**: E2E tests.

```Gherkin
Given the user has installed rules that are deprecated in the current package
When the user navigates to the Rule Management page
Then a warning callout is displayed
And the title shows the count of deprecated rules
And "Delete deprecated rules" and "Review deprecated rules" buttons are shown
```

#### **Scenario: Callout does not appear when no deprecated rules are installed**

**Automation**: E2E tests.

```Gherkin
Given the user has no installed rules that are deprecated
When the user navigates to the Rule Management page
Then no deprecation callout is shown
```

#### **Scenario: Callout can be dismissed and does not reappear on page refresh**

**Automation**: E2E tests.

```Gherkin
Given the deprecation callout is visible
When the user clicks the dismiss (X) button
Then the callout disappears
When the user refreshes the page
Then the callout remains hidden
```

#### **Scenario: Dismissed callout reappears after 7 days**

**Automation**: E2E tests.

```Gherkin
Given the user has dismissed the deprecation callout
When 7 days have passed since dismissal
And the user navigates to the Rule Management page
Then the callout reappears
```

### Rule Management page: deprecated rules modal

#### **Scenario: Modal lists all deprecated installed rules with links**

**Automation**: E2E tests.

```Gherkin
Given the deprecation callout is visible
When the user clicks "Review deprecated rules"
Then a modal opens listing all deprecated installed rules
And each rule name is a link to its Rule Details page
And the modal description includes the count of deprecated rules
When the user clicks a rule name
Then the user is navigated to that rule's details page
```

#### **Scenario: User can delete all deprecated rules from the modal**

**Automation**: E2E tests.

```Gherkin
Given the modal is open with deprecated rules listed
When the user clicks "Delete N deprecated rules"
And confirms deletion
Then all listed deprecated rules are deleted
And the modal closes
And the deprecation callout disappears
And a success toast is shown
```

#### **Scenario: Delete all button is disabled for read-only users**

**Automation**: E2E tests.

```Gherkin
Given the user has read-only privileges (cannot edit rules)
When the modal is open
Then the "Delete N deprecated rules" button is disabled
```

### Rule Details page: deprecation callout

#### **Scenario: Callout appears on deprecated prebuilt rule details page**

**Automation**: E2E tests.

```Gherkin
Given the user navigates to the details page of a deprecated prebuilt rule
Then a warning callout is shown with title "This rule has been deprecated"
And "Delete rule" and "Duplicate and delete" buttons are shown
```

#### **Scenario: Callout displays deprecation reason when available**

**Automation**: E2E tests.

```Gherkin
Given the deprecated rule asset has a deprecated_reason field
When the user navigates to the details page of that deprecated rule
Then the deprecation callout displays the deprecation reason
```

#### **Scenario: Callout does not display deprecation reason when absent**

**Automation**: Unit tests.

```Gherkin
Given the deprecated rule asset does not have a deprecated_reason field
When the user navigates to the details page of that deprecated rule
Then the deprecation callout does not display a deprecation reason section
```

#### **Scenario: Callout does not appear on non-deprecated rule details page**

**Automation**: E2E tests.

```Gherkin
Given the user navigates to a rule details page for a rule that is not deprecated
Then no deprecation callout is shown
```

#### **Scenario: Callout does not appear on custom rule details page**

**Automation**: E2E tests.

```Gherkin
Given the user navigates to a custom (non-prebuilt) rule details page
Then no deprecation callout is shown
And the deprecation review endpoint is not called
```

#### **Scenario: Action buttons are disabled for read-only users**

**Automation**: E2E tests.

```Gherkin
Given the user has read-only privileges
When the deprecation callout is shown on a rule details page
Then the "Delete rule" and "Duplicate and delete" buttons are disabled
```

### Rule Details page: delete deprecated rule

#### **Scenario: User can delete a deprecated rule from its details page**

**Automation**: E2E tests.

```Gherkin
Given the deprecation callout is shown on a rule details page
When the user clicks "Delete rule"
And confirms deletion
Then the rule is deleted
And the user is navigated back to the Rules list page
And a success toast is shown
```

### Rule Details page: duplicate and delete deprecated rule

#### **Scenario: User can duplicate and delete a deprecated rule**

**Automation**: E2E tests.

```Gherkin
Given the deprecation callout is shown on a rule details page
When the user clicks "Duplicate and delete"
Then the rule is duplicated as a custom rule
And the original deprecated rule is deleted
And the user is navigated to the new custom rule's details page
And a success toast is shown for each action
```

#### **Scenario: Original rule is not deleted if duplication fails**

**Automation**: Unit tests.

```Gherkin
Given the user clicks "Duplicate and delete"
And the duplication bulk action fails or returns no created rules
Then the original rule is NOT deleted
And the user remains on the current rule details page
```

### Confirmation modal behavior

#### **Scenario: User can cancel the bulk delete confirmation modal**

**Automation**: Unit tests.

```Gherkin
Given the delete confirmation modal is shown (from callout or modal)
When the user clicks "Cancel"
Then the confirmation modal closes
And no rules are deleted
```

#### **Scenario: User can cancel the delete confirmation on the rule details page**

**Automation**: Unit tests.

```Gherkin
Given the delete confirmation modal is shown on the rule details page
When the user cancels the deletion
Then the modal closes
And the rule is not deleted
And the user remains on the rule details page
```

### Authorization

#### **Scenario: Deprecation review endpoint requires read privileges**

**Automation**: API integration tests.

```Gherkin
Given the user does not have the rules read privilege
When the user requests the deprecation review
Then the endpoint returns 403 Forbidden
```

#### **Scenario: Read-only users see callouts but cannot perform actions**

**Automation**: Unit tests.

```Gherkin
Given the user has read-only privileges
Then the deprecation callouts are visible on both the Rule Management and Rule Details pages
And all action buttons (delete, duplicate and delete, delete all) are disabled
```
