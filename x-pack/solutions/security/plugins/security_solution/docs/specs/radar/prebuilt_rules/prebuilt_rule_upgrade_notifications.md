# Test plan: prebuilt rule upgrade notifications <!-- omit from toc -->

**Status**: `in progress`, matches [Milestone 3](https://github.com/elastic/kibana/issues/174168).

> [!TIP]
> If you're new to prebuilt rules, get started [here](./prebuilt_rules.md) and check an overview of the features of prebuilt rules in [this section](./prebuilt_rules_common_info.md#features).

## Summary <!-- omit from toc -->

This is a test plan for the functionality of showing notifications about:

- Rule Management page: some of the currently installed prebuilt rules can be upgraded to new versions.
- Rule Details page: the rule shown on this page can be upgraded to a new version.
- Rule Editing page: the rule shown on this page can be upgraded to a new version.

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
  - [Rule upgrade notifications on the Rule Management page](#rule-upgrade-notifications-on-the-rule-management-page)
    - [**Scenario: User is NOT notified on the Rule Management page when no prebuilt rules are installed**](#scenario-user-is-not-notified-on-the-rule-management-page-when-no-prebuilt-rules-are-installed)
    - [**Scenario: User is NOT notified on the Rule Management page when all installed prebuilt rules are up to date**](#scenario-user-is-not-notified-on-the-rule-management-page-when-all-installed-prebuilt-rules-are-up-to-date)
    - [**Scenario: User is NOT notified on the Rule Management page until the package installation is completed**](#scenario-user-is-not-notified-on-the-rule-management-page-until-the-package-installation-is-completed)
    - [**Scenario: User is notified on the Rule Management page when there are some prebuilt rules to upgrade but there are no more prebuilt rules to install**](#scenario-user-is-notified-on-the-rule-management-page-when-there-are-some-prebuilt-rules-to-upgrade-but-there-are-no-more-prebuilt-rules-to-install)
    - [**Scenario: User is notified on the Rule Management page when there are some prebuilt rules to upgrade and some more prebuilt rules to install**](#scenario-user-is-notified-on-the-rule-management-page-when-there-are-some-prebuilt-rules-to-upgrade-and-some-more-prebuilt-rules-to-install)
    - [**Scenario: User can open the Rule Upgrade table on the Rule Management page**](#scenario-user-can-open-the-rule-upgrade-table-on-the-rule-management-page)
    - [**Scenario: User can dismiss the prebuilt rule upgrade callout on the Rule Management page**](#scenario-user-can-dismiss-the-prebuilt-rule-upgrade-callout-on-the-rule-management-page)
  - [Rule upgrade notifications on the Rule Details page](#rule-upgrade-notifications-on-the-rule-details-page)
    - [**Scenario: User is NOT notified on the Rule Details page when the rule is up to date**](#scenario-user-is-not-notified-on-the-rule-details-page-when-the-rule-is-up-to-date)
    - [**Scenario: User is notified on the Rule Details page when the rule is outdated and can be upgraded to a new version**](#scenario-user-is-notified-on-the-rule-details-page-when-the-rule-is-outdated-and-can-be-upgraded-to-a-new-version)
    - [**Scenario: User can open the Rule Upgrade flyout on the Rule Details page**](#scenario-user-can-open-the-rule-upgrade-flyout-on-the-rule-details-page)
    - [**Scenario: User cannot dismiss the prebuilt rule upgrade callout on the Rule Details page**](#scenario-user-cannot-dismiss-the-prebuilt-rule-upgrade-callout-on-the-rule-details-page)
  - [Rule upgrade notifications on the Rule Editing page](#rule-upgrade-notifications-on-the-rule-editing-page)
    - [**Scenario: User is NOT notified on the Rule Editing page when the rule is up to date**](#scenario-user-is-not-notified-on-the-rule-editing-page-when-the-rule-is-up-to-date)
    - [**Scenario: User is notified on the Rule Editing page when the rule is outdated and can be upgraded to a new version**](#scenario-user-is-notified-on-the-rule-editing-page-when-the-rule-is-outdated-and-can-be-upgraded-to-a-new-version)
    - [**Scenario: User can navigate from the Rule Editing page to the Rule Details page in order to upgrade the rule**](#scenario-user-can-navigate-from-the-rule-editing-page-to-the-rule-details-page-in-order-to-upgrade-the-rule)
    - [**Scenario: User cannot dismiss the prebuilt rule upgrade callout on the Rule Editing page**](#scenario-user-cannot-dismiss-the-prebuilt-rule-upgrade-callout-on-the-rule-editing-page)
  - [Licensing](#licensing)
    - [**Scenario: User is NOT notified on the Rule Editing page when the license is insufficient**](#scenario-user-is-not-notified-on-the-rule-editing-page-when-the-license-is-insufficient)

## Useful information

### Tickets

- [Users can Customize Prebuilt Detection Rules](https://github.com/elastic/security-team/issues/1974) (internal)
- [Users can Customize Prebuilt Detection Rules: Milestone 3](https://github.com/elastic/kibana/issues/174168)
- [Tests for prebuilt rule upgrade workflow](https://github.com/elastic/kibana/issues/202078)

### Terminology

- [Common terminology](./prebuilt_rules_common_info.md#common-terminology).
- **Callout to upgrade prebuilt rules**: a notification callout shown on the Rule Management page that encourages the user to keep prebuilt rules up-to-date and regularly upgrade them to their latest versions.
- **Callout to upgrade the rule**: is either of the two callouts, depending on the context of a given scenario:
  - a notification callout shown on the Rule Details page that encourages the user to upgrade the rule to its latest version;
  - a notification callout shown on the Rule Editing page that encourages the user to upgrade the rule to its latest version before editing it.
- **rule customization**: a change to a customizable field of a prebuilt rule. Full list of customizable rule fields can be found in [Common information about prebuilt rules](./prebuilt_rules_common_info.md#customizable-rule-fields).

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

User stories for the Rule Management page:

- User can see a notification callout on the Rule Management page when some of the currently installed prebuilt rules can be upgraded to new versions. The callout encourages the user to keep prebuilt rules up-to-date and regularly upgrade them to their latest versions.
  - User can dismiss the callout.
- User can see a Rule Updates tab on the Rule Management page when some of the currently installed prebuilt rules can be upgraded to new versions.
  - User can see the total number of rules available for upgrade on this tab.
  - User can click on the tab which opens the Rule Upgrade table.

User stories for the Rule Details page:

- User can see a notification callout on the Rule Details page when the rule shown on this page can be upgraded to a new version. The callout encourages the user to upgrade the rule.
  - User can open a Rule Upgrade flyout to review updates in the latest rule version and perform the upgrade.
  - User can't dismiss the callout.

User stories for the Rule Editing page:

- User can see a notification callout on the Rule Editing page when the rule shown on this page can be upgraded to a new version. The callout encourages the user to upgrade the rule before editing it.
  - User can navigate back to the Rule Details page where they can review updates in the latest rule version and perform the upgrade.
  - User can't dismiss the callout.

## Scenarios

### Rule upgrade notifications on the Rule Management page

#### **Scenario: User is NOT notified on the Rule Management page when no prebuilt rules are installed**

**Automation**: 1 e2e test with mock rules + 1 integration test with mock rules for the /status endpoint.

```Gherkin
Given no prebuilt rules are installed in Kibana
When user opens the Rule Management page
Then user should NOT see a callout to upgrade prebuilt rules
And user should NOT see a Rule Updates tab
And user should NOT see a number of rules available to upgrade
```

#### **Scenario: User is NOT notified on the Rule Management page when all installed prebuilt rules are up to date**

**Automation**: 1 e2e test with mock rules + 1 integration test with mock rules for the /status endpoint.

```Gherkin
Given <X> prebuilt rules are installed in Kibana
And all of them are up to date (no new versions are available)
When user opens the Rule Management page
Then user should NOT see a callout to upgrade prebuilt rules
And user should NOT see a Rule Updates tab
And user should NOT see a number of rules available to upgrade

Examples:
  | X    |
  | 1    |
  | 100  |
  | 1250 |
```

#### **Scenario: User is NOT notified on the Rule Management page until the package installation is completed**

**Automation**: 1 e2e test with mock rules.

```Gherkin
Given <X> prebuilt rules are installed in Kibana
And for <Z> of the installed rules there are new versions available
And prebuilt rules package is not installed
When user opens the Rule Management page
Then user should NOT see a callout to upgrade prebuilt rules
And user should NOT see a Rule Updates tab
And user should NOT see a number of rules available to upgrade
When user waits until the the package installation is completed
Then user should see the callout to upgrade prebuilt rules
And user should see the Rule Updates tab
And user should see the number of rules available to upgrade (<Z>)

Examples:
  | X    | Z    |
  | 1250 | 1    |
  | 1250 | 100  |
  | 1250 | 1250 |
```

#### **Scenario: User is notified on the Rule Management page when there are some prebuilt rules to upgrade but there are no more prebuilt rules to install**

**Automation**: 1 e2e test with mock rules + 1 integration test with mock rules for the /status endpoint.

```Gherkin
Given <X> prebuilt rules are installed in Kibana
And there are no more prebuilt rules available to install
And for <Z> of the installed rules there are new versions available
When user opens the Rule Management page
Then user should see the callout to upgrade prebuilt rules
And user should see the Rule Updates tab
And user should see the number of rules available to upgrade (<Z>)

Examples:
  | X    | Z    |
  | 1250 | 1    |
  | 1250 | 100  |
  | 1250 | 1250 |
```

#### **Scenario: User is notified on the Rule Management page when there are some prebuilt rules to upgrade and some more prebuilt rules to install**

**Automation**: 1 e2e test with mock rules + 1 integration test with mock rules for the /status endpoint.

```Gherkin
Given <X> prebuilt rules are installed in Kibana
And there are <Y> more prebuilt rules available to install
And for <Z> of the installed rules there are new versions available
When user opens the Rule Management page
Then user should see the callout to upgrade prebuilt rules
And user should see the Rule Updates tab
And user should see the number of rules available to upgrade (<Z>)

Examples:
  | X    | Y    | Z    |
  | 1    | 1249 | 1    |
  | 1249 | 1    | 100  |
  | 1249 | 1    | 1249 |
```

#### **Scenario: User can open the Rule Upgrade table on the Rule Management page**

**Automation**: 1 e2e test with mock rules.

```Gherkin
Given some prebuilt rules are installed in Kibana
And for some of the installed rules there are new versions available
When user opens the Rule Management page
Then user should see the Rule Updates tab
When user clicks on the Rule Updates tab
Then the Rule Upgrade table should be displayed
```

#### **Scenario: User can dismiss the prebuilt rule upgrade callout on the Rule Management page**

Currently, we store the callout's state only in the browser memory. This means that a dismissed callout will show up again after the page refresh.

**Automation**: 1 e2e test with mock rules.

```Gherkin
Given some prebuilt rules are installed in Kibana
And for some of the installed rules there are new versions available
When user opens the Rule Management page
Then user should see the callout to upgrade prebuilt rules
When user clicks on the Dismiss button
Then the callout should disappear
When user refreshes the page
Then the callout should appear again
```

### Rule upgrade notifications on the Rule Details page

#### **Scenario: User is NOT notified on the Rule Details page when the rule is up to date**

**Automation**: 1 e2e test with mock rules.

```Gherkin
Given a prebuilt rule is installed in Kibana
And the rule is up to date (no new versions are available for this rule)
When user opens the Rule Details page
Then user should NOT see the callout to upgrade the rule
```

#### **Scenario: User is notified on the Rule Details page when the rule is outdated and can be upgraded to a new version**

**Automation**: 1 e2e test with mock rules.

```Gherkin
Given a prebuilt rule is installed in Kibana
And the rule is outdated (a new version is available for this rule)
When user opens the Rule Details page
Then user should see the callout to upgrade the rule
```

#### **Scenario: User can open the Rule Upgrade flyout on the Rule Details page**

**Automation**: 1 e2e test with mock rules.

```Gherkin
Given a prebuilt rule is installed in Kibana
And the rule is outdated (a new version is available for this rule)
When user opens the Rule Details page
Then user should see the callout to upgrade the rule
When user clicks on the callout's CTA button
Then the Rule Upgrade flyout should be displayed
```

#### **Scenario: User cannot dismiss the prebuilt rule upgrade callout on the Rule Details page**

**Automation**: 1 e2e test.

```Gherkin
Given a prebuilt rule is installed in Kibana
And the rule is outdated (a new version is available for this rule)
When user opens the Rule Details page
Then user should see the callout to upgrade the rule
And user should NOT see any Dismiss buttons in it
And user should NOT be able to dismiss it
```

### Rule upgrade notifications on the Rule Editing page

#### **Scenario: User is NOT notified on the Rule Editing page when the rule is up to date**

**Automation**: 1 e2e test with mock rules.

```Gherkin
Given a prebuilt rule is installed in Kibana
And the rule is up to date (no new versions are available for this rule)
When user opens the Rule Editing page
Then user should NOT see the callout to upgrade the rule
```

#### **Scenario: User is notified on the Rule Editing page when the rule is outdated and can be upgraded to a new version**

**Automation**: 1 e2e test with mock rules.

```Gherkin
Given a prebuilt rule is installed in Kibana
And the rule is outdated (a new version is available for this rule)
When user opens the Rule Editing page
Then user should see the callout to upgrade the rule
```

#### **Scenario: User can navigate from the Rule Editing page to the Rule Details page in order to upgrade the rule**

**Automation**: 1 e2e test with mock rules.

```Gherkin
Given a prebuilt rule is installed in Kibana
And the rule is outdated (a new version is available for this rule)
When user opens the Rule Editing page
Then user should see the callout to upgrade the rule
When user clicks on the callout's CTA button
Then user should be navigated to the Rule Details page
```

#### **Scenario: User cannot dismiss the prebuilt rule upgrade callout on the Rule Editing page**

**Automation**: 1 e2e test.

```Gherkin
Given a prebuilt rule is installed in Kibana
And the rule is outdated (a new version is available for this rule)
When user opens the Rule Editing page
Then user should see the callout to upgrade the rule
And user should NOT see any Dismiss buttons in it
And user should NOT be able to dismiss it
```

### Licensing

#### **Scenario: User is NOT notified on the Rule Editing page when the license is insufficient**

**Automation**: 1 e2e test with a mock rule

```Gherkin
Given a prebuilt rule is installed in Kibana
And the rule is outdated (a new version is available for this rule)
And the license is insufficient for prebuilt rule customization
When user opens the Rule Editing page
Then user should NOT see the callout to upgrade the rule
```
