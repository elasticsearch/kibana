# Test plan: installing prebuilt rules <!-- omit from toc -->

**Status**: `in progress`, matches [Milestone 3](https://github.com/elastic/kibana/issues/174168).

> [!TIP]
> If you're new to prebuilt rules, get started [here](./prebuilt_rules.md) and check an overview of the features of prebuilt rules in [this section](./prebuilt_rules_common_info.md#features).

## Summary <!-- omit from toc -->

This is a test plan for the workflows of:

- installing single prebuilt rules one-by-one
- installing multiple prebuilt rules in bulk
- finding prebuilt rules by filtering, sorting and paginating
- user can only see the rules they are allowed to see
- user can only install rules if they have correct permissions

on the Rule Installation page.

## Table of contents <!-- omit from toc -->

<!--
Please use the "Markdown All in One" VS Code extension to keep the TOC in sync with the text:
https://marketplace.visualstudio.com/items?itemName=yzhang.markdown-all-in-one
-->

- [Useful information](#useful-information)
  - [Epics](#epics)
  - [Tickets](#tickets)
  - [Terminology](#terminology)
- [Requirements](#requirements)
  - [Assumptions](#assumptions)
  - [Technical requirements](#technical-requirements)
  - [Product requirements](#product-requirements)
- [Scenarios](#scenarios)
  - [Rule installation notifications on the Rule Management page](#rule-installation-notifications-on-the-rule-management-page)
    - [**Scenario: User is NOT notified when no prebuilt rules are installed and there are no prebuilt rules assets**](#scenario-user-is-not-notified-when-no-prebuilt-rules-are-installed-and-there-are-no-prebuilt-rules-assets)
    - [**Scenario: User is NOT notified when all prebuilt rules are installed and up to date**](#scenario-user-is-not-notified-when-all-prebuilt-rules-are-installed-and-up-to-date)
    - [**Scenario: User is notified when no prebuilt rules are installed and there are rules available to install**](#scenario-user-is-notified-when-no-prebuilt-rules-are-installed-and-there-are-rules-available-to-install)
    - [**Scenario: User is notified when some prebuilt rules can be installed**](#scenario-user-is-notified-when-some-prebuilt-rules-can-be-installed)
    - [**Scenario: User is notified when both rules to install and upgrade are available**](#scenario-user-is-notified-when-both-rules-to-install-and-upgrade-are-available)
    - [**Scenario: User is notified after a prebuilt rule gets deleted**](#scenario-user-is-notified-after-a-prebuilt-rule-gets-deleted)
  - [Rule Installation table: Rule visibility](#rule-installation-table-rule-visibility)
    - [**Scenario: Already installed rules are not shown in the table**](#scenario-already-installed-rules-are-not-shown-in-the-table)
    - [**Scenario: Only latest versions of each prebuilt rule are shown in the table**](#scenario-only-latest-versions-of-each-prebuilt-rule-are-shown-in-the-table)
  - [Rule Installation table: Loading and navigation](#rule-installation-table-loading-and-navigation)
    - [**Scenario: User opening the Rule Installation page sees a loading skeleton until the package installation is completed**](#scenario-user-opening-the-rule-installation-page-sees-a-loading-skeleton-until-the-package-installation-is-completed)
    - [**Scenario: User can navigate from the Rule Installation page to the Rule Management page via breadcrumbs**](#scenario-user-can-navigate-from-the-rule-installation-page-to-the-rule-management-page-via-breadcrumbs)
  - [Rule Installation table: Pagination](#rule-installation-table-pagination)
    - [**Scenario: User can paginate over prebuilt rules on Rule Installation page**](#scenario-user-can-paginate-over-prebuilt-rules-on-rule-installation-page)
    - [**Scenario: Last page shows correct number of rules**](#scenario-last-page-shows-correct-number-of-rules)
  - [Rule Installation table: Sorting](#rule-installation-table-sorting)
    - [**Scenario: User can sort prebuilt rules on Rule Installation page**](#scenario-user-can-sort-prebuilt-rules-on-rule-installation-page)
    - [**Scenario: Navigating to the next page maintains the sorting order**](#scenario-navigating-to-the-next-page-maintains-the-sorting-order)
    - [**Scenario: Changing sorting resets pagination to the first page**](#scenario-changing-sorting-resets-pagination-to-the-first-page)
    - [**Scenario: User can sort filtered prebuilt rules**](#scenario-user-can-sort-filtered-prebuilt-rules)
  - [Rule Installation table: Filtering](#rule-installation-table-filtering)
    - [**Scenario: User can filter prebuilt rules by rule name on the Rule Installation page**](#scenario-user-can-filter-prebuilt-rules-by-rule-name-on-the-rule-installation-page)
    - [**Scenario: User can see a list of available tags on the Rule Installation page**](#scenario-user-can-see-a-list-of-available-tags-on-the-rule-installation-page)
    - [**Scenario: User can filter prebuilt rules by a single tag on the Rule Installation page**](#scenario-user-can-filter-prebuilt-rules-by-a-single-tag-on-the-rule-installation-page)
    - [**Scenario: User can filter prebuilt rules by tags with special characters on the Rule Installation page**](#scenario-user-can-filter-prebuilt-rules-by-tags-with-special-characters-on-the-rule-installation-page)
    - [**Scenario: User can filter prebuilt rules by multiple tags using AND logic on the Rule Installation page**](#scenario-user-can-filter-prebuilt-rules-by-multiple-tags-using-and-logic-on-the-rule-installation-page)
    - [**Scenario: User can filter prebuilt rules by name and tags at the same time**](#scenario-user-can-filter-prebuilt-rules-by-name-and-tags-at-the-same-time)
    - [**Scenario: Empty state is shown when filters match no rules**](#scenario-empty-state-is-shown-when-filters-match-no-rules)
    - [**Scenario: Removing filters resets prebuilt rules table pagination**](#scenario-removing-filters-resets-prebuilt-rules-table-pagination)
  - [Rule installation workflow: base cases](#rule-installation-workflow-base-cases)
    - [**Scenario: User can install prebuilt rules one by one**](#scenario-user-can-install-prebuilt-rules-one-by-one)
    - [**Scenario: User can install multiple prebuilt rules selected on the page**](#scenario-user-can-install-multiple-prebuilt-rules-selected-on-the-page)
    - [**Scenario: User can install all available prebuilt rules at once**](#scenario-user-can-install-all-available-prebuilt-rules-at-once)
    - [**Scenario: Empty screen is shown when all prebuilt rules are installed**](#scenario-empty-screen-is-shown-when-all-prebuilt-rules-are-installed)
    - [**Scenario: User can preview rules available for installation**](#scenario-user-can-preview-rules-available-for-installation)
    - [**Scenario: User can install a rule using the rule preview**](#scenario-user-can-install-a-rule-using-the-rule-preview)
    - [**Scenario: User can see correct rule information in preview before installing**](#scenario-user-can-see-correct-rule-information-in-preview-before-installing)
    - [**Scenario: Optional tabs and sections without content should be hidden in preview before installing**](#scenario-optional-tabs-and-sections-without-content-should-be-hidden-in-preview-before-installing)
  - [Rule installation via the Prebuilt rules API](#rule-installation-via-the-prebuilt-rules-api)
    - [**Scenario: API can install all prebuilt rules**](#scenario-api-can-install-all-prebuilt-rules)
    - [**Scenario: API can install prebuilt rules that are not yet installed**](#scenario-api-can-install-prebuilt-rules-that-are-not-yet-installed)
    - [**Scenario: API does not install prebuilt rules if they are up to date**](#scenario-api-does-not-install-prebuilt-rules-if-they-are-up-to-date)
  - [Error handling](#error-handling)
    - [**Scenario: Error is handled when any installation operation on prebuilt rules fails**](#scenario-error-is-handled-when-any-installation-operation-on-prebuilt-rules-fails)
    - [**Scenario: Installation review API endpoint rejects invalid `page` and `per_page` parameters**](#scenario-installation-review-api-endpoint-rejects-invalid-page-and-per_page-parameters)
    - [**Scenario: Installation review API endpoint returns an empty response when `page` and `per_page` parameters select rules out of bounds**](#scenario-installation-review-api-endpoint-returns-an-empty-response-when-page-and-per_page-parameters-select-rules-out-of-bounds)
  - [Authorization / RBAC](#authorization--rbac)
    - [**Scenario: User with read privileges on Security Solution cannot install prebuilt rules**](#scenario-user-with-read-privileges-on-security-solution-cannot-install-prebuilt-rules)
    - [**Scenario: ML rules are not shown in prebuilt rules installation table when user is not an ML admin**](#scenario-ml-rules-are-not-shown-in-prebuilt-rules-installation-table-when-user-is-not-an-ml-admin)
  - [Licensing](#licensing)
    - [**Scenario: ML rules are not shown in prebuilt rules installation table when license is insufficient**](#scenario-ml-rules-are-not-shown-in-prebuilt-rules-installation-table-when-license-is-insufficient)

## Useful information

### Epics

- [Granular faceted filters for detection rules](https://github.com/elastic/security-team/issues/5624)

### Tickets

- [Users can Customize Prebuilt Detection Rules](https://github.com/elastic/security-team/issues/1974) (internal)
- [Users can Customize Prebuilt Detection Rules: Milestone 2](https://github.com/elastic/kibana/issues/174167)
- [Users can Customize Prebuilt Detection Rules: Milestone 3](https://github.com/elastic/kibana/issues/174168)
- [Reduce response sizes of prebuilt rules _review API endpoints](https://github.com/elastic/kibana/issues/210544)
- [Add pagination to the installation/_review endpoint](https://github.com/elastic/kibana/issues/241656)

### Terminology

- [Common terminology](./prebuilt_rules_common_info.md#common-terminology).
- **CTA to install prebuilt rules**: a link button with a counter on the Rule Management page.
- **CTA to upgrade prebuilt rules**: a tab with a counter on the Rule Management page.

## Requirements

### Assumptions

Assumptions about test environments and scenarios outlined in this test plan.

- [Common assumptions](./prebuilt_rules_common_info.md#common-assumptions).

### Technical requirements

Non-functional requirements for the functionality outlined in this test plan.

- [Common technical requirements](./prebuilt_rules_common_info.md#common-technical-requirements).

### Product requirements

Functional requirements for the functionality outlined in this test plan.

- [Common product requirements](./prebuilt_rules_common_info.md#common-product-requirements).

User stories for the main rule installation features:

- User can install single prebuilt rules one-by-one from the Rule Installation page.
- User can install multiple prebuilt rules in bulk from the Rule Installation page.
- User can install all available prebuilt rules in bulk from the Rule Installation page.
- User can preview properties of a prebuilt rule before installing it.

User stories for licensing and RBAC:

- User can install prebuilt rules on the `Basic` license and higher.

Previewing properties of a prebuilt rule before installing it:

- If user chooses to preview a prebuilt rule to be installed, we currently show this preview in a flyout.
- In the prebuilt rule preview a tab that doesn't have any sections should not be displayed and a section that doesn't have any properties also should not be displayed.

## Scenarios

### Rule installation notifications on the Rule Management page

#### **Scenario: User is NOT notified when no prebuilt rules are installed and there are no prebuilt rules assets**

**Automation**: 1 e2e test with mock rules + 1 integration test with mock rules for the /status endpoint.

```Gherkin
Given no prebuilt rule assets exist in Kibana
And no prebuilt rules are installed
When user opens the Rule Management page
Then user should NOT see a CTA to install prebuilt rules
And user should NOT see a number of rules available to install
And user should NOT see a CTA to upgrade prebuilt rules
And user should NOT see a number of rules available to upgrade
And user should NOT see the Prebuilt Rules Upgrades page
```

#### **Scenario: User is NOT notified when all prebuilt rules are installed and up to date**

**Automation**: 1 e2e test with mock rules + 1 integration test with mock rules for the /status endpoint.

```Gherkin
Given the latest prebuilt rule assets exist in Kibana
And all the latest prebuilt rules from those rule assets are installed
When user opens the Rule Management page
Then user should NOT see a CTA to install prebuilt rules
And user should NOT see a number of rules available to install
And user should NOT see a CTA to upgrade prebuilt rules
And user should NOT see a number of rules available to upgrade
And user should NOT see the Prebuilt Rules Upgrades page
```

#### **Scenario: User is notified when no prebuilt rules are installed and there are rules available to install**

**Automation**: 1 e2e test with mock rules + 1 integration test with mock rules for the /status endpoint.

```Gherkin
Given X prebuilt rule assets exist in Kibana
And no prebuilt rules are installed
And there are X prebuilt rules available to install
When user opens the Rule Management page
Then user should see a CTA to install prebuilt rules
And user should see a number of rules available to install (X)
And user should NOT see a CTA to upgrade prebuilt rules
And user should NOT see a number of rules available to upgrade
And user should NOT see the Prebuilt Rules Upgrades page
```

#### **Scenario: User is notified when some prebuilt rules can be installed**

**Automation**: 1 e2e test with mock rules + 1 integration test with mock rules for the /status endpoint.

```Gherkin
Given Y prebuilt rule assets exist in Kibana
And X (where X < Y) prebuilt rules are installed
And there are Y more prebuilt rules available to install
And for all X installed rules there are no new versions available
When user opens the Rule Management page
Then user should see a CTA to install prebuilt rules
And user should see the number of rules available to install (Y)
And user should NOT see a CTA to upgrade prebuilt rules
And user should NOT see a number of rules available to upgrade
And user should NOT see the Prebuilt Rules Upgrades page
```

#### **Scenario: User is notified when both rules to install and upgrade are available**

**Automation**: 1 e2e test with mock rules + 1 integration test with mock rules for the /status endpoint.

```Gherkin
Given Y prebuilt rule assets exist in Kibana
And X (where X < Y) prebuilt rules are installed
And Z (where Z < X)  installed rules have matching prebuilt rule assets with higher version available
And for Z of the installed rules there are new versions available
When user opens the Rule Management page
Then user should see a CTA to install prebuilt rules
And user should see the number of rules available to install (Y)
And user should see a CTA to upgrade prebuilt rules
And user should see the number of rules available to upgrade (Z)
```

#### **Scenario: User is notified after a prebuilt rule gets deleted**

**Automation**: 1 e2e test with mock rules + 1 integration test with mock rules for the /status endpoint.

```Gherkin
Given X prebuilt rules are installed in Kibana
And there are no more prebuilt rules available to install
When user opens the Rule Management page
And user deletes Y prebuilt rules
Then user should see a CTA to install prebuilt rules
And user should see <Y> rules available to install
```

### Rule Installation table: Rule visibility

#### **Scenario: Already installed rules are not shown in the table**

**Automation**: 1 API integration test with mock rules.

```Gherkin
Given there is at least one prebuilt rule installed in Kibana
And there's a prebuilt rule asset with the same rule_id
When user opens the Rule Installation page
Then the table should not show the already installed rule
```

#### **Scenario: Only latest versions of each prebuilt rule are shown in the table**

**Automation**: 1 API integration test with mock rules.

```Gherkin
Given there are multiple prebuilt rule assets with the same rule_id in Kibana
And a rule with such rule_id is NOT installed
When user opens the Rule Installation page
Then the table should show an entry only for the latest version of prebuilt rule asset
```

### Rule Installation table: Loading and navigation

#### **Scenario: User opening the Rule Installation page sees a loading skeleton until the package installation is completed**

**Automation**: 1 UI unit test.

```Gherkin
Given prebuilt rules package is not installed
When user opens the Rule Installation page
Then user should see a loading skeleton until the package installation is completed
```

#### **Scenario: User can navigate from the Rule Installation page to the Rule Management page via breadcrumbs**

**Automation**: 1 e2e test.

```Gherkin
Given user is on the Rule Installation page
When user navigates to the Rule Management page via breadcrumbs
Then the Rule Management page should be displayed
```

### Rule Installation table: Pagination

#### **Scenario: User can paginate over prebuilt rules on Rule Installation page**

**Automation**: 1 e2e test with mock rules.

```Gherkin
Given multiple prebuilt rules available for installation
When user opens the Rule Installation page
Then prebuilt rules available for installation should be shown
When user picks the desired number of <rows_per_page>
Then the <rows_per_page> of the available prebuilt rules should be shown on the page
When user navigates to the next page
Then the next page of the available prebuilt rules should be shown
And user-selected number of <rows_per_page> should still apply to the page
```

**Examples:**

`<rows_per_page>` = 5 | 10 | 20 | 50 | 100

#### **Scenario: Last page shows correct number of rules**

**Automation**: 1 API integration test with mock rules.

```Gherkin
Given that number of prebuilt rules available for installation is not a multiple of <rows_per_page>
When user navigates to the last page
Then the number of rules shown on the page should be less than <rows_per_page>
```

**Examples:**

`<rows_per_page>` = 5 | 10 | 20 | 50 | 100

### Rule Installation table: Sorting

#### **Scenario: User can sort prebuilt rules on Rule Installation page**

**Automation**: 1 e2e test with mock rules (single field) + 1 API integration test with mock rules (to test each particular field)

```Gherkin
Given multiple prebuilt rules available for installation
When user opens the Rule Installation page
Then the available prebuilt rules should be shown
And the rules shouldn't be sorted by any field
When user clicks on a header of an unsorted <field_name> column
Then the available prebuilt rules should be sorted by <field_name> in the ASC <order_type>
When user clicks on a header of an ASC sorted <field_name> column
Then the available prebuilt rules should be sorted by <field_name> in the DESC <order_type>
When user clicks on a header of a DESC sorted <field_name> column
Then the available prebuilt rules should be unsorted by <field_name>
```

**Examples:**

| `<field_name>`  | `<order_type>`                                            |
| --------------- | --------------------------------------------------------- |
| name            | alphabetical case-insensitive (ASC: A -> Z, DESC: Z -> A) |
| risk score      | numeric (ASC: 0 -> 100, DESC: 100 -> 0)                   |
| severity        | semantic (ASC: Low -> Critical, DESC: Critical -> Low)    |

#### **Scenario: Navigating to the next page maintains the sorting order**

**Automation**: 1 API integration test with mock rules.

```Gherkin
Given multiple prebuilt rules available for installation
When user opens the Rule Installation page
And sorts the rules by <field_name>
And navigates to the next page
Then the available prebuilt rules should still be sorted by <field_name>
```

**Examples:**

`<field_name>` = name | risk_score | severity

#### **Scenario: Changing sorting resets pagination to the first page**

**Automation**: 1 e2e test with mock rules.

```Gherkin
Given multiple prebuilt rules available for installation
And there's more than one page of available prebuilt rules
When user opens the Rule Installation page
And navigates to a non-first page
And changes the sorting order for <field_name>
Then the first page of available prebuilt rules should be shown
And the available prebuilt rules should be sorted by <field_name>
```

**Examples:**

`<field_name>` = name | risk_score | severity

#### **Scenario: User can sort filtered prebuilt rules**

**Automation**: 1 API integration test with mock rules.

```Gherkin
Given multiple prebuilt rules available for installation
And at least one rule has a <tag> tag
When user opens the Prebuilt Rules installation page
And filters the available prebuilt rules by a <tag>
And sorts the filtered rules by <field_name>
Then only available rules that have a <tag> tag should be shown
And the shown rules should be sorted by <field_name>
```

**Examples:**

`<field_name>` = name | risk_score | severity
`<tag>` = any tag from the list of available tags

### Rule Installation table: Filtering

#### **Scenario: User can filter prebuilt rules by rule name on the Rule Installation page**

**Automation**: 1 API integration test with mock rules.

```Gherkin
Given multiple prebuilt rules available for installation
When user opens the Rule Installation page
Then the available prebuilt rules should be shown
When user enters <text> in the search field
Then only available prebuilt rules that contain <text> in any part of their name should be shown
And this matching should be case-insensitive
```

#### **Scenario: User can see a list of available tags on the Rule Installation page**

**Automation**: 1 API integration test with mock rules.

```Gherkin
Given multiple prebuilt rules available for installation
When user opens the Rule Installation page
Then there should a UI element that shows a list tags
And this list should contain all the tags from prebuilt rules available for installation
And this list should be sorted alphabetically
```

#### **Scenario: User can filter prebuilt rules by a single tag on the Rule Installation page**

**Automation**: 1 API integration test with mock rules.

```Gherkin
Given multiple prebuilt rules available for installation
And at least one rule has a <tag> tag
When user opens the Rule Installation page
And filters the available prebuilt rules by a <tag>
Then only the available prebuilt rules having this tag should be shown
```

**Examples:**

`<tag>` = any tag from the list of available tags

#### **Scenario: User can filter prebuilt rules by tags with special characters on the Rule Installation page**

**Automation**: 1 API integration test with mock rules.

```Gherkin
Given multiple prebuilt rules available for installation
And at least one rule has a <tag_with_special_chars> tag
When user opens the Rule Installation page
And filters the available prebuilt rules by <tag_with_special_chars>
Then only the available prebuilt rules having this tag should be shown
```

**Examples:**

`<tag_with_special_chars>` = tag containing Elasticsearch Query DSL reserved characters (+ - = && || > < ! ( ) { } [ ] ^ " ~ * ? : \ /)
More info in query DSL reserved characters: https://www.elastic.co/docs/reference/query-languages/query-dsl/query-dsl-query-string-query#_reserved_characters

#### **Scenario: User can filter prebuilt rules by multiple tags using AND logic on the Rule Installation page**

**Automation**: 1 API integration test with mock rules.

```Gherkin
Given multiple prebuilt rules available for installation
And at least one rule has both <tag1> and <tag2> tags
When user opens the Rule Installation page
And filters the available prebuilt rules by <tag1> and <tag2> tags
Then only available prebuilt rules having both <tag1> and <tag2> tags should be shown
```

**Examples:**

`<tag1>`, `<tag2>` = any two tags from the list of available tags

#### **Scenario: User can filter prebuilt rules by name and tags at the same time**

**Automation**: 1 API integration test with mock rules.

```Gherkin
Given multiple prebuilt rules available for installation
And at least one rule has a <tag> tag and contains <text> in its name
When user opens the Rule Installation page
And filters the available prebuilt rules by a <tag>
And enters <text> in the search field
Then only available prebuilt rules having <tag> tag and containing <text> in their name should be shown
```

**Examples:**

`<tag>` = any tag from the list of available tags

#### **Scenario: Empty state is shown when filters match no rules**

**Automation**: 1 e2e test with mock rules.

```Gherkin
Given multiple prebuilt rules available for installation
When user opens the Rule Installation page
And applies a filter that matches no rules
Then no rules should be shown in the table
And user should see a "no rules match your filters" message
```

#### **Scenario: Removing filters resets prebuilt rules table pagination**

**Automation**: 1 e2e test with mock rules.

```Gherkin
Given multiple prebuilt rules available for installation
When user opens the Rule Installation page
Then the available prebuilt rules should be shown
When user sets a non-default number of rows per page
And filters the available prebuilt rules by any tag
And sorts the results by any field (for example, severity)
And goes to the next page
And then removes the tag filter
Then the first page of unfiltered available prebuilt rules should be shown
And the results should remain sorted by user-selected field
And the total number of pages should be the same as before applying the filter
And the number of rows per page should not reset to the default value
```


### Rule installation workflow: base cases

#### **Scenario: User can install prebuilt rules one by one**

**Automation**: 1 e2e test with mock rules + integration tests with mock rules that would test /status and /installation/\* endpoints in integration.

```Gherkin
Given X prebuilt rule assets exist in Kibana
And no prebuilt rules are installed
When user opens the Add Rules page
Then prebuilt rules available for installation should be displayed in the table
When user installs one individual rule without previewing it
Then success message should be displayed after installation
And the installed rule should be removed from the table
When user navigates back to the Rule Management page
Then user should see a CTA to install prebuilt rules
And user should see the number of rules available to install decreased by 1
```

#### **Scenario: User can install multiple prebuilt rules selected on the page**

**Automation**: 1 e2e test with mock rules + integration tests with mock rules that would test /status and /installation/\* endpoints in integration.

```Gherkin
Given X prebuilt rule assets exist in Kibana
And no prebuilt rules are installed
When user opens the Add Rules page
Then prebuilt rules available for installation should be displayed in the table
When user selects <Y> rules
Then user should see a CTA to install <Y> number of rules
When user clicks the CTA
Then success message should be displayed after installation
And all the installed rules should be removed from the table
When user navigates back to the Rule Management page
Then user should see a CTA to install prebuilt rules
And user should see the number of rules available to install decreased by <Y> number of installed rules

Examples:
  | Y                               |
  | a few rules on the page, e.g. 2 |
  | all rules on the page, e.g. 12  |
```

#### **Scenario: User can install all available prebuilt rules at once**

**Automation**: 1 e2e test with mock rules + integration tests with mock rules that would test /status and /installation/\* endpoints in integration.

```Gherkin
Given X prebuilt rule assets exist in Kibana
And no prebuilt rules are installed
When user opens the Add Rules page
Then prebuilt rules available for installation should be displayed in the table
When user installs all rules
Then success message should be displayed after installation
And all the rules should be removed from the table
And user should see a message indicating that all available rules have been installed
And user should see a CTA that leads to the Rule Management page
When user clicks on the CTA
Then user should be navigated back to Rule Management page
And user should NOT see a CTA to install prebuilt rules
And user should NOT see a number of rules available to install
```

#### **Scenario: Empty screen is shown when all prebuilt rules are installed**

**Automation**: 1 e2e test with mock rules + 1 integration test.

```Gherkin
Given all the available prebuilt rules are installed in Kibana
When user opens the Add Rules page
Then user should see a message indicating that all available rules have been installed
And user should see a CTA that leads to the Rule Management page
```

#### **Scenario: User can preview rules available for installation**

**Automation**: 1 e2e test

```Gherkin
Given 2 prebuilt rule assets exist in Kibana
And no prebuilt rules are installed
When user opens the Add Rules page
Then all rules available for installation should be displayed in the table
When user opens the rule preview for the 1st rule
Then the preview should open
When user closes the preview
Then it should disappear
```

#### **Scenario: User can install a rule using the rule preview**

**Automation**: 1 e2e test

```Gherkin
Given 2 prebuilt rule assets exist in Kibana
And no prebuilt rules are installed
When user opens the Add Rules page
Then all rules available for installation should be displayed in the table
When user opens the rule preview for the rule
Then the preview should open
When user installs the rule using a CTA in the rule preview
Then the rule should be installed
And a success message should be displayed after installation
And the rule should be removed from the Add Rules table
When user navigates back to the Rule Management page
Then user should see a CTA to install prebuilt rules
And user should see the number of rules available to install as initial number minus 1
```

#### **Scenario: User can see correct rule information in preview before installing**

**Automation**: 1 e2e test

```Gherkin
Given X prebuilt rule assets exist in Kibana
And no prebuilt rules are installed
When user opens the Add Rules page
Then all X rules available for installation should be displayed in the table
When user opens a rule preview for any rule
Then the preview should appear
And all properties of a rule should be displayed in the correct tab and section of the preview (see examples of rule properties above)
```

#### **Scenario: Optional tabs and sections without content should be hidden in preview before installing**

**Automation**: 1 e2e test

```Gherkin
Given 1 prebuilt rule assets exist in Kibana
And no prebuilt rules are installed
And this rule has neither Setup guide nor Investigation guide
When user opens the Add Rules page
Then all rules available for installation should be displayed in the table
When user opens the rule preview for this rule
Then the preview should open
And the Setup Guide section should NOT be displayed in the Overview tab
And the Investigation Guide tab should NOT be displayed
```

### Rule installation via the Prebuilt rules API

There's a legacy prebuilt rules API and a new one. Both should be tested against two types of the package: with and without historical rule versions.

#### **Scenario: API can install all prebuilt rules**

**Automation**: 8 integration tests with mock rules: 4 examples below \* 2 (we split checking API response and installed rules into two different tests).

```Gherkin
Given the package <package_type> is installed
And the package contains N rules
When user installs all rules via install <api>
Then the endpoint should return success response (HTTP 200 code) with <install_response>
And N rule objects should be created
And each rule object should have correct id and version

Examples:
  | package_type             | api    | install_response         |
  | with historical versions | legacy | installed: N, updated: 0 |
  | w/o historical versions  | legacy | installed: N, updated: 0 |
  | with historical versions | new    | total: N, succeeded: N   |
  | w/o historical versions  | new    | total: N, succeeded: N   |
```

Notes:

- Legacy API:
  - install: `PUT /api/detection_engine/rules/prepackaged`
- New API:
  - install: `POST /internal/detection_engine/prebuilt_rules/installation/_perform`

#### **Scenario: API can install prebuilt rules that are not yet installed**

**Automation**: 4 integration tests with mock rules.

```Gherkin
Given the package <package_type> is installed
And the package contains N rules
When user installs all rules via install <api>
And deletes one of the installed rules
And gets prebuilt rules status via status <api>
Then the endpoint should return successful response (HTTP 200 code) with <status_response>
When user installs all rules via install <api> again
Then the endpoint should return successful response (HTTP 200 code) with <install_response>

Examples:
  | package_type             | api    | status_response  | install_response         |
  | with historical versions | legacy | not_installed: 1 | installed: 1, updated: 0 |
  | w/o historical versions  | legacy | not_installed: 1 | installed: 1, updated: 0 |
  | with historical versions | new    | to_install: 1    | total: 1, succeeded: 1   |
  | w/o historical versions  | new    | to_install: 1    | total: 1, succeeded: 1   |
```

Notes:

- Legacy API:
  - install: `PUT /api/detection_engine/rules/prepackaged`
  - status: `GET /api/detection_engine/rules/prepackaged/_status`
- New API:
  - install: `POST /internal/detection_engine/prebuilt_rules/installation/_perform`
  - status: `GET /internal/detection_engine/prebuilt_rules/status`

#### **Scenario: API does not install prebuilt rules if they are up to date**

**Automation**: 4 integration tests with mock rules.

```Gherkin
Given the package <package_type> is installed
And the package contains N rules
When user installs all rules via install <api>
And user gets prebuilt rules status via status <api>
Then the endpoint should return successful response (HTTP 200 code) with <status_response>
When user calls install <api>
Then the endpoint should return successful response (HTTP 200 code) with <install_response>
When user calls upgrade <api>
Then the endpoint should return successful response (HTTP 200 code) with <upgrade_response>

Examples:
  | package_type             | api    | status_response                  | install_response         | upgrade_response         |
  | with historical versions | legacy | not_installed: 0, not_updated: 0 | installed: 0, updated: 0 | installed: 0, updated: 0 |
  | w/o historical versions  | legacy | not_installed: 0, not_updated: 0 | installed: 0, updated: 0 | installed: 0, updated: 0 |
  | with historical versions | new    | to_install: 0, to_upgrade: 0     | total: 0, succeeded: 0   | total: 0, succeeded: 0   |
  | w/o historical versions  | new    | to_install: 0, to_upgrade: 0     | total: 0, succeeded: 0   | total: 0, succeeded: 0   |
```

Notes:

- Legacy API:
  - install: `PUT /api/detection_engine/rules/prepackaged`
  - upgrade: `PUT /api/detection_engine/rules/prepackaged`
  - status: `GET /api/detection_engine/rules/prepackaged/_status`
- New API:
  - install: `POST /internal/detection_engine/prebuilt_rules/installation/_perform`
  - upgrade: `POST /internal/detection_engine/prebuilt_rules/upgrade/_perform`
  - status: `GET /internal/detection_engine/prebuilt_rules/status`

### Error handling

#### **Scenario: Error is handled when any installation operation on prebuilt rules fails**

**Automation**: e2e test with mock rules

```Gherkin
When user is <operation> prebuilt rules
And this operation fails
Then user should see an error message

Examples:
  | operation             |
  | installing all        |
  | installing selected   |
  | installing individual |
```

#### **Scenario: Installation review API endpoint rejects invalid `page` and `per_page` parameters**

**Automation**: 2 integration tests with mock rules - one per each parameter.

```Gherkin
Given a prebuilt rule asset exists in Kibana
When user calls the review installation endpoint with invalid value for <field>
Then the endpoint should return a 400 error with the correct error message

Examples:
| field    | invalid value                                   |
| page     | empty string, 0, -1                             |
| per_page | empty string, 0, -1, 10001 (max value is 10000) |
```


#### **Scenario: Installation review API endpoint returns an empty response when `page` and `per_page` parameters select rules out of bounds**

**Automation**: 1 integration test with mock rules.

```Gherkin
Given <num_prebuilt_rule_assets> non-installed prebuilt rule assets exist in Kibana  
When user calls the review installation endpoint with <page> and <per_page> parameters  
And <page> * <per_page> is greater than <num_prebuilt_rule_assets>  
Then the endpoint should return an empty list
```


### Authorization / RBAC

#### **Scenario: User with read privileges on Security Solution cannot install prebuilt rules**

**Automation**: 1 e2e test with mock rules + 3 integration tests with mock rules for the status and installation endpoints.

```Gherkin
Given user with "Security: read" privileges on Security Solution
And prebuilt rule assets exist in Kibana
And no prebuilt rules are installed
When user opens the Add Rules page
Then user should see prebuilt rules available to install
But user should not be able to install them
```

#### **Scenario: ML rules are not shown in prebuilt rules installation table when user is not an ML admin**

**Automation**: 1 API integration test with mock rules.

```Gherkin
Given a Kibana instance running under a license that DOES support machine learning
And a prebuilt rule asset with of a machine learning rule exists in Kibana
And current user does NOT have a `machine_learning_admin` role (or its equivalent ES and Kibana privileges)
And a prebuilt rule asset with of a machine learning rule exists in Kibana
And this rule is not installed
When user opens the Rule Installation page
Then user should NOT see this ML rule in the table
```

### Licensing

#### **Scenario: ML rules are not shown in prebuilt rules installation table when license is insufficient**

**Automation**: 1 API integration test with mock rules.

```Gherkin
Given a Kibana instance running under a license that does NOT support machine learning
And a prebuilt rule asset with of a machine learning rule exists in Kibana
And this rule is not installed
When user opens the Rule Installation page
Then user should NOT see this ML rule in the table
```