# Test plan: upgrading prebuilt rules one-by-one or in bulk without preview <!-- omit from toc -->

**Status**: `in progress`, matches [Milestone 3](https://github.com/elastic/kibana/issues/174168).

> [!TIP]
> If you're new to prebuilt rules, get started [here](./prebuilt_rules.md) and check an overview of the features of prebuilt rules in [this section](./prebuilt_rules_common_info.md#features).

## Summary <!-- omit from toc -->

This is a test plan for the workflows of:

- upgrading single prebuilt rules one-by-one
- upgrading multiple prebuilt rules in bulk

from the Rule Upgrade table without previewing incoming updates from Elastic and user customizations in the Rule Upgrade flyout.

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
  - [Rule upgrade workflow: individual upgrades from Prebuilt Rules Upgrades page](#rule-upgrade-workflow-individual-upgrades-from-prebuilt-rules-upgrades-page)
    - [**Scenario: User can upgrade a single conflict-free prebuilt rule from Rules Update table**](#scenario-user-can-upgrade-a-single-conflict-free-prebuilt-rule-from-rules-update-table)
    - [**Scenario: User CAN'T upgrade a single prebuilt rule with upgrade conflicts from Rules Update table**](#scenario-user-cant-upgrade-a-single-prebuilt-rule-with-upgrade-conflicts-from-rules-update-table)
  - [Rule upgrade workflow: bulk upgrade from Prebuilt Rules Upgrades page](#rule-upgrade-workflow-bulk-upgrade-from-prebuilt-rules-upgrades-page)
    - [**Scenario: User can bulk upgrade conflict-free prebuilt rules**](#scenario-user-can-bulk-upgrade-conflict-free-prebuilt-rules)
    - [**Scenario: User can bulk upgrade prebuilt rules with auto-resolved upgrade conflicts**](#scenario-user-can-bulk-upgrade-prebuilt-rules-with-auto-resolved-upgrade-conflicts)
    - [**Scenario: User CAN'T bulk upgrade prebuilt rules with unresolved upgrade conflicts**](#scenario-user-cant-bulk-upgrade-prebuilt-rules-with-unresolved-upgrade-conflicts)
    - [**Scenario: User can bulk upgrade a mix of prebuilt rules with and without upgrade conflicts**](#scenario-user-can-bulk-upgrade-a-mix-of-prebuilt-rules-with-and-without-upgrade-conflicts)
  - [Rule upgrade workflow: upgrading rules with rule type changes](#rule-upgrade-workflow-upgrading-rules-with-rule-type-changes)
    - [**Scenario: User CAN'T upgrade rules with rule type change from Prebuilt Rules Upgrades page**](#scenario-user-cant-upgrade-rules-with-rule-type-change-from-prebuilt-rules-upgrades-page)
    - [**Scenario: User CAN'T bulk upgrade prebuilt rules with rule type change**](#scenario-user-cant-bulk-upgrade-prebuilt-rules-with-rule-type-change)
  - [Rule upgrade workflow: filtering, sorting, pagination](#rule-upgrade-workflow-filtering-sorting-pagination)
    - [**Scenario: User can search prebuilt rules by rule name, index pattern or MITRE ATT\&CK™ tactic or technique on Prebuilt Rules Upgrades page**](#scenario-user-can-search-prebuilt-rules-by-rule-name-index-pattern-or-mitre-attck-tactic-or-technique-on-prebuilt-rules-upgrades-page)
    - [**Scenario: User can filter prebuilt rules by customized/non-customized state on Prebuilt Rules Upgrades page**](#scenario-user-can-filter-prebuilt-rules-by-customizednon-customized-state-on-prebuilt-rules-upgrades-page)
    - [**Scenario: User can filter prebuilt rules by tags on Prebuilt Rules Upgrades page**](#scenario-user-can-filter-prebuilt-rules-by-tags-on-prebuilt-rules-upgrades-page)
    - [**Scenario: User can sort prebuilt rules on Prebuilt Rules Upgrades page**](#scenario-user-can-sort-prebuilt-rules-on-prebuilt-rules-upgrades-page)
    - [**Scenario: User can paginate over prebuilt rules on Prebuilt Rules Upgrades page**](#scenario-user-can-paginate-over-prebuilt-rules-on-prebuilt-rules-upgrades-page)
  - [Rule upgrade workflow: Edge cases](#rule-upgrade-workflow-edge-cases)
    - [**Scenario: Rule bound data is preserved after upgrading a rule to a newer version**](#scenario-rule-bound-data-is-preserved-after-upgrading-a-rule-to-a-newer-version)
  - [Error handling](#error-handling)
    - [**Scenario: Error is handled when any upgrade operation on prebuilt rules fails**](#scenario-error-is-handled-when-any-upgrade-operation-on-prebuilt-rules-fails)
  - [Authorization / RBAC](#authorization--rbac)
    - [**Scenario: User with read privileges on Security Solution cannot upgrade prebuilt rules**](#scenario-user-with-read-privileges-on-security-solution-cannot-upgrade-prebuilt-rules)
  - [Licensing](#licensing)
    - [**Scenario: Prebuilt rule always gets upgraded to the target version when license is insufficient**](#scenario-prebuilt-rule-always-gets-upgraded-to-the-target-version-when-license-is-insufficient)
    - [**Scenario: Multiple selected prebuilt rules are upgraded to target versions when license is insufficient**](#scenario-multiple-selected-prebuilt-rules-are-upgraded-to-target-versions-when-license-is-insufficient)
    - [**Scenario: User CAN'T see whether a prebuilt rule has conflicts in upgrade table when license is insufficient**](#scenario-user-cant-see-whether-a-prebuilt-rule-has-conflicts-in-upgrade-table-when-license-is-insufficient)
    - [**Scenario: User ISN'T forced to review a prebuilt rule with upgrade conflicts to upgrade it when license is insufficient**](#scenario-user-isnt-forced-to-review-a-prebuilt-rule-with-upgrade-conflicts-to-upgrade-it-when-license-is-insufficient)
  - [Licensing: API endpoints](#licensing-api-endpoints)
    - [**Scenario: User can upgrade prebuilt rules to the TARGET version on insufficient license**](#scenario-user-can-upgrade-prebuilt-rules-to-the-target-version-on-insufficient-license)
    - [**Scenario: User CAN'T upgrade prebuilt rules to any version other than TARGET via API on insufficient license**](#scenario-user-cant-upgrade-prebuilt-rules-to-any-version-other-than-target-via-api-on-insufficient-license)
    - [**Scenario: User CAN'T specify field's resolved value via API on insufficient license**](#scenario-user-cant-specify-fields-resolved-value-via-api-on-insufficient-license)
  - [Legacy: Rule upgrade via the Prebuilt rules API](#legacy-rule-upgrade-via-the-prebuilt-rules-api)
    - [**Scenario: API can upgrade prebuilt rules that are outdated**](#scenario-api-can-upgrade-prebuilt-rules-that-are-outdated)
    - [**Scenario: API does not upgrade prebuilt rules if they are up to date**](#scenario-api-does-not-upgrade-prebuilt-rules-if-they-are-up-to-date)

## Useful information

### Tickets

- [Users can Customize Prebuilt Detection Rules](https://github.com/elastic/security-team/issues/1974) (internal)
- [Users can Customize Prebuilt Detection Rules: Milestone 3](https://github.com/elastic/kibana/issues/174168)
- [Relax the rules of handling missing base versions of prebuilt rules](https://github.com/elastic/kibana/issues/210358)
- [Tests for prebuilt rule upgrade workflow](https://github.com/elastic/kibana/issues/202078)

### Terminology

- [Common terminology](./prebuilt_rules_common_info.md#common-terminology).
- **Upgrade conflict**: this is a situation when a prebuilt rule can't be 100% safely upgraded due to customizations made to the rule specific edge cases defined by the diffable algorithms.
- **CTA to install prebuilt rules**: a link button with a counter on the Rule Management page.
- **CTA to upgrade prebuilt rules**: a tab with a counter on the Rule Management page.

## Requirements

### Assumptions

Assumptions about test environments and scenarios outlined in this test plan.

Unless explicitly indicated otherwise:

- [Common assumptions](./prebuilt_rules_common_info.md#common-assumptions).
- Package with prebuilt rules is already installed, and rule assets from it are stored in Elasticsearch.
- It's expected the Prebuilt Rules upgrade workflow works seamlessly even if some or all prebuilt rules may have their **base versions** missing.
- \<Upgrade Prebuilt Rules CTA\> combines two bulk upgrade options

  | \<Upgrade Prebuilt Rules CTA\>             | comment                                                                                  |
  | ------------------------------------------ | ---------------------------------------------------------------------------------------- |
  | CTA to upgrade all prebuilt rules          | -                                                                                        |
  | CTA to upgrade the selected prebuilt rules | user must select multiple prebuilt rules in Prebuilt Rules Upgrades page to see this CTA |

### Technical requirements

Non-functional requirements for the functionality outlined in this test plan.

- [Common technical requirements](./prebuilt_rules_common_info.md#common-technical-requirements).

### Product requirements

Functional requirements for the functionality outlined in this test plan.

- [Common product requirements](./prebuilt_rules_common_info.md#common-product-requirements).

User stories for upgrading single prebuilt rules one-by-one:

- User can upgrade a single prebuilt rule to its latest version without previewing the incoming updates:
  - if the rule doesn't have any conflicts with its latest version.
- User can't upgrade a single prebuilt rule to its latest version without previewing the incoming updates:
  - if the rule has any solvable conflicts with its latest version;
  - if the rule has any non-solvable conflicts with its latest version;
  - if the rule's type has been changed in the latest version by Elastic (this is considered a non-solvable conflict);
  - in these situations user is required to upgrade the rule with preview.

User stories for upgrading multiple prebuilt rules in bulk:

- User can bulk upgrade multiple prebuilt rules to their latest versions without previewing the incoming updates, but only those:
  - that don't have any conflicts with their latest versions;
  - that have some solvable conflicts but don't have any non-solvable conflicts with their latest versions.
- User can't bulk upgrade multiple prebuilt rules to their latest versions without previewing the incoming updates:
  - if these rules have any non-solvable conflicts with their latest versions;
  - if these rules don't have any non-solvable conflicts, but have some solvable conflicts and the user doesn't confirm their intention to upgrade such rules;
  - if these rules' types have been changed in their latest versions by Elastic (this is considered a non-solvable conflict);
  - in these situations user is required to upgrade each rule one-by-one with preview.
- User can bulk upgrade prebuilt rules with solvable conflicts only if the user confirms their intention to upgrade such rules.
- User can "bulk upgrade" a single prebuilt rule via the bulk actions. In this case, the "user stories for upgrading multiple prebuilt rules in bulk" apply instead of the "user stories for upgrading single prebuilt rules one-by-one".

User stories, misc:

- In general, user can upgrade a prebuilt rule without preview regardless of the fact if the rule is customized or not. The ability to do so depends on the fact if this customization conflicts with the latest version or not, and if yes, is this conflict solvable or non-solvable.

## Scenarios

### Rule upgrade workflow: individual upgrades from Prebuilt Rules Upgrades page

#### **Scenario: User can upgrade a single conflict-free prebuilt rule from Rules Update table**

**Automation**: 1 e2e test with mock rules + integration tests with mock rules that would test /status and /upgrade/\* endpoints in integration.

```Gherkin
Given a prebuilt rule with a conflict-free upgrade
When user is on the Prebuilt Rules Upgrades page
Then the rule should be shown in the table
When user upgrades the rule without previewing it
Then a success message should be shown after the upgrade
And the upgraded prebuilt rule should be removed from the table
And user should see the number of rules available to upgrade decreased by 1
```

#### **Scenario: User CAN'T upgrade a single prebuilt rule with upgrade conflicts from Rules Update table**

**Automation**: 1 e2e test with mock rules

```Gherkin
Given a prebuilt rule with a conflicting upgrade
When user is on the Prebuilt Rules Upgrades page
Then the rule should be shown in the table
And it's visible the rule has upgrade conflicts
And "Review" button is shown in the rule's row
When user hovers on the button
Then an explanation text should appear
When user click the button
Then Prebuilt Rule Upgrade Flyout should be shown
```

### Rule upgrade workflow: bulk upgrade from Prebuilt Rules Upgrades page

#### **Scenario: User can bulk upgrade conflict-free prebuilt rules**

**Automation**: 1 e2e test with mock rules + integration tests with mock rules that would test /status and /upgrade/\* endpoints in integration.

```Gherkin
Given multiple prebuilt rules with conflict-free upgrades
When user opens the Prebuilt Rules Upgrades page
Then the prebuilt rules having upgrades should be shown in the table
And user should see a <Upgrade Prebuilt Rules CTA>
When user clicks the <Upgrade Prebuilt Rules CTA>
Then success message should be shown after the upgrade
And all the rules should be removed from the table
And user should NOT see any prebuilt rules having upgrades
```

#### **Scenario: User can bulk upgrade prebuilt rules with auto-resolved upgrade conflicts**

**Automation**: 1 e2e test with mock rules

```Gherkin
Given multiple prebuilt rules with upgrades having auto-resolved conflicts
When user opens the Prebuilt Rules Upgrades page
Then user should see a <Upgrade Prebuilt Rules CTA>
When user clicks the <Upgrade Prebuilt Rules CTA>
Then user should see a warning modal with several CTAs
When users clicks the CTA to proceed with rules upgrade
Then a success message should be shown after the upgrade
And all the upgraded prebuilt rules should be removed from the table
And user should see the number of rules available to upgrade decreased by the number of upgraded rules
```

#### **Scenario: User CAN'T bulk upgrade prebuilt rules with unresolved upgrade conflicts**

**Automation**: 1 e2e test with mock rules

```Gherkin
Given multiple prebuilt rules with upgrades having unresolved conflicts
When user opens the Prebuilt Rules Upgrades page
Then user should see a <Upgrade Prebuilt Rules CTA>
When user clicks the <Upgrade Prebuilt Rules CTA>
Then user should see a warning modal saying the upgrade isn't possible
```

#### **Scenario: User can bulk upgrade a mix of prebuilt rules with and without upgrade conflicts**

**Automation**: 1 e2e test with mock rules

```Gherkin
Given multiple prebuilt rules with upgrades
And some of these rules have auto-resolved upgrade conflicts
And some of these rules have unresolved upgrade conflicts
When user opens the Prebuilt Rules Upgrades page
Then user should see a <Upgrade Prebuilt Rules CTA>
When user clicks the <Upgrade Prebuilt Rules CTA>
Then user should see a warning modal with several CTAs
When users clicks the CTA to proceed with conflict-free and auto-resolved upgrade conflicts rules upgrade
Then a success message should be shown after the upgrade
And all the upgraded prebuilt rules should be removed from the table
And user should see the number of rules available to upgrade decreased by the number of upgraded rules
```

### Rule upgrade workflow: upgrading rules with rule type changes

#### **Scenario: User CAN'T upgrade rules with rule type change from Prebuilt Rules Upgrades page**

**Automation**: 1 e2e test with mock rules

```Gherkin
Given a prebuilt rule with an update that changes its rule type
When user opens the Prebuilt Rules Upgrades page
Then this rule should be displayed in the table
And "Review" button is shown in the rule's row
When user hovers on the button
Then an explanation text should appear
When user click the button
Then Prebuilt Rule Upgrade Flyout should be shown
```

#### **Scenario: User CAN'T bulk upgrade prebuilt rules with rule type change**

**Automation**: 1 e2e test with mock rules

```Gherkin
Given multiple prebuilt rules with upgrades that change their rule type*
When user opens the Prebuilt Rules Upgrades page
Then user should see a <Upgrade Prebuilt Rules CTA>
When user clicks the <Upgrade Prebuilt Rules CTA>
Then user should see a warning modal saying the upgrade isn't possible

* Changing rule type is an unresolved conflict according to the diffable algorithms
```

### Rule upgrade workflow: filtering, sorting, pagination

#### **Scenario: User can search prebuilt rules by rule name, index pattern or MITRE ATT&CK™ tactic or technique on Prebuilt Rules Upgrades page**

**Automation**: 1 e2e test with mock rules

```Gherkin
Given multiple prebuilt rules with upgrades
When user opens the Prebuilt Rules Upgrades page
Then the prebuilt rules having an upgrade should be shown
When user enters <text> in the search field
Then only the prebuilt rules having an upgrade and matching the <text> should be shown
```

**Examples:**

- `<text>`
  - rule name or its part
  - index pattern
  - MITRE ATT&CK™ tactic or technique

#### **Scenario: User can filter prebuilt rules by customized/non-customized state on Prebuilt Rules Upgrades page**

**Automation**: 1 e2e test with mock rules

```Gherkin
Given multiple prebuilt rules with upgrades
And some if these rules are customized
When user opens the Prebuilt Rules Upgrades page
Then the prebuilt rules having an upgrade should be shown
When user filters prebuilt rules by <customization state>
Then only the prebuilt rules having an upgrade and matching the <customization state> should be shown
```

**Examples:**

`<customization state>` = `customized` | `non-customized`

#### **Scenario: User can filter prebuilt rules by tags on Prebuilt Rules Upgrades page**

**Automation**: 1 e2e test with mock rules

```Gherkin
Given multiple prebuilt rules with upgrades
When user opens the Prebuilt Rules Upgrades page
Then the prebuilt rules having an upgrade should be shown
When user filters prebuilt rules by one or more tags
Then only the prebuilt rules having an upgrade and having these tags should be shown
```

#### **Scenario: User can sort prebuilt rules on Prebuilt Rules Upgrades page**

**Automation**: 1 e2e test with mock rules

```Gherkin
Given multiple prebuilt rules with upgrades
When user opens the Prebuilt Rules Upgrades page
Then the prebuilt rules having an upgrade should be shown
When user clicks on <field> header by picking the sorting direction
Then the prebuilt rules having an upgrade should be sorted by <field> in the expected order
```

**Examples:**

- `<field>`
  - rule name
  - risk score
  - severity

#### **Scenario: User can paginate over prebuilt rules on Prebuilt Rules Upgrades page**

**Automation**: 1 e2e test with mock rules

```Gherkin
Given multiple prebuilt rules with upgrades
When user opens the Prebuilt Rules Upgrades page
Then the prebuilt rules having an upgrade should be shown
When user picks the desired number of <rows_per_page>
Then the <rows_per_page> of the prebuilt rules having an upgrade should be shown on the page
When user navigates to the next pages
Then the next page of the prebuilt rules having an upgrade should be shown
```

**Examples:**

`<rows_per_page>` = 5 | 10 | 20 | 50 | 100

### Rule upgrade workflow: Edge cases

#### **Scenario: Rule bound data is preserved after upgrading a rule to a newer version**

**Automation**: 1 unit test per case, 1 integration test

```Gherkin
Given a prebuilt rule with an upgrade
When user upgrades the rule
Then the rule bound data should be preserved
```

**Examples:**

generated alerts, exception lists (rule exception list, shared exception list, endpoint exception list), actions, enabled state, execution results and execution events.

### Error handling

#### **Scenario: Error is handled when any upgrade operation on prebuilt rules fails**

**Automation**: e2e test with mock rules

```Gherkin
When user performs an <upgrade operation> on prebuilt rules having an upgrade
And this operation fails
Then user should see an error message
```

**Examples:**

`<upgrade operation>` = upgrade all | upgrade selected | upgrade individual

### Authorization / RBAC

#### **Scenario: User with read privileges on Security Solution cannot upgrade prebuilt rules**

**Automation**: 1 e2e test with mock rules + 3 integration tests with mock rules for the status and upgrade endpoints.

```Gherkin
Given user with "Security: read" privileges on Security Solution
And multiple prebuilt rules with upgrades
When user opens the Prebuilt Rules Upgrades page
Then the prebuilt rules having upgrades should be shown in the table
But user should not be able to upgrade them
```

### Licensing

> This section covers the insufficient license case where users don't have prebuilt rules customization feature available.

#### **Scenario: Prebuilt rule always gets upgraded to the target version when license is insufficient**

**Automation**: 1 e2e test with a mock rule.

```Gherkin
Given a Kibana instance running under an insufficient license
And a prebuilt rule with an upgrade
When user opens the Prebuilt Rules Upgrades page
And clicks on CTA to upgrade the prebuilt rule
Then success message should be displayed after upgrade
And the upgraded prebuilt rule should be removed from the table
And all customizable rule fields should be equal to the target version
```

**Examples:**

The scenario is applicable to customized and non-customized prebuilt rules. Customized rules lose any customizations after the upgrade.

#### **Scenario: Multiple selected prebuilt rules are upgraded to target versions when license is insufficient**

**Automation**: 1 e2e test with a mock rule.

```Gherkin
Given a Kibana instance running under an insufficient license
And multiple prebuilt rules with conflict-free upgrades
When user opens the Prebuilt Rules Upgrades page
Then the prebuilt rules having upgrades should be shown in the table
And user should see a <Upgrade Prebuilt Rules CTA>
When user clicks the <Upgrade Prebuilt Rules CTA>
Then success message should be shown after the upgrade
And the upgraded prebuilt rules should upgrade to the corresponding target versions
```

**Examples:**

The scenario is applicable to customized and non-customized prebuilt rules. Customized rules lose any customizations after the upgrade.

#### **Scenario: User CAN'T see whether a prebuilt rule has conflicts in upgrade table when license is insufficient**

**Automation**: 1 e2e test with 2 mock rules.

```Gherkin
Given a Kibana instance running under an insufficient license
And a prebuilt rule with an upgrade
And this rule has an upgrade conflict (as it detected by the diffable algorithms)
When user opens the Prebuilt Rules Upgrades page
Then user should NOT see any information about conflicts in the upgrade table
```

#### **Scenario: User ISN'T forced to review a prebuilt rule with upgrade conflicts to upgrade it when license is insufficient**

**Automation**: 1 e2e test with 2 mock rules.

```Gherkin
Given a Kibana instance running under an insufficient license
And a prebuilt rule with an upgrade
And this rule has an upgrade conflict (as it detected by the diffable algorithms)
When user opens the Prebuilt Rules Upgrades page
Then user should see a CTA to upgrade the prebuilt rule
When user clicks the CTA
Then the prebuilt rule upgrades successfully
```

### Licensing: API endpoints

#### **Scenario: User can upgrade prebuilt rules to the TARGET version on insufficient license**

**Automation**: 1 integration test.

```Gherkin
Given a Kibana instance running under an insufficient license
And a prebuilt rule with an upgrade
When user makes an API request to upgrade the prebuilt rule to the TARGET version
Then the API should return a HTTP 200 status code
And the prebuilt rule is upgraded to the corresponding target versions
```

#### **Scenario: User CAN'T upgrade prebuilt rules to any version other than TARGET via API on insufficient license**

**Automation**: an API integration test for each pick_version parameter value.

```Gherkin
Given a Kibana instance running under an insufficient license
And a prebuilt rule with an upgrade
When user makes an API request to upgrade the prebuilt rule to the <pick_version> version
Then the API should return a HTTP 400 status code
And the response should contain an error message that user can only upgrade to the TARGET version
```

**Examples:**

`<pick_version>` = `BASE` | `CURRENT` | `MERGED`

#### **Scenario: User CAN'T specify field's resolved value via API on insufficient license**

**Automation**: 1 API integration test.

```Gherkin
Given a Kibana instance running under an insufficient license
And a prebuilt rule with an upgrade
When user makes an API request to upgrade the prebuilt rule and specifies resolved values for fields
Then the endpoint should return a HTTP 400 status code
And the response should contain an error message that field customization is not allowed under current license
```

### Legacy: Rule upgrade via the Prebuilt rules API

> There's a legacy prebuilt rules API and a new one. Both should be tested against two types of the package: with and without historical rule versions.

#### **Scenario: API can upgrade prebuilt rules that are outdated**

**Automation**: 4 integration tests with mock rules.

```Gherkin
Given the package <package_type> is installed
And the package contains N rules
When user installs all rules via install <api>
And new X+1 version of a rule asset <assets_update>
And user gets prebuilt rules status via status <api>
Then the endpoint should return 200 with <status_response>
When user upgrades all rules via upgrade <api>
Then the endpoint should return 200 with <upgrade_response>

Examples:
  | package_type             | api    | assets_update | status_response | upgrade_response         |
  | with historical versions | legacy | gets added    | not_updated: 1  | installed: 0, updated: 1 |
  | w/o historical versions  | legacy | replaces X    | not_updated: 1  | installed: 0, updated: 1 |
  | with historical versions | new    | gets added    | to_upgrade: 1   | total: 1, succeeded: 1   |
  | w/o historical versions  | new    | replaces X    | to_upgrade: 1   | total: 1, succeeded: 1   |
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

#### **Scenario: API does not upgrade prebuilt rules if they are up to date**

**Automation**: 4 integration tests with mock rules.

```Gherkin
Given the package <package_type> is installed
And the package contains N rules
When user installs all rules via install <api>
And user gets prebuilt rules status via status <api>
Then the endpoint should return 200 with <status_response>
When user calls install <api>
Then the endpoint should return 200 with <install_response>
When user calls upgrade <api>
Then the endpoint should return 200 with <upgrade_response>

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
