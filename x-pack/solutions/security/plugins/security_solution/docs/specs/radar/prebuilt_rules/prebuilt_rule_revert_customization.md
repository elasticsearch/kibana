# Test plan: reverting prebuilt rule customizations <!-- omit from toc -->

**Status**: `in progress`, matches [Milestone 3](https://github.com/elastic/kibana/issues/174168).

> [!TIP]
> If you're new to prebuilt rules, get started [here](./prebuilt_rules.md) and check an overview of the features of prebuilt rules in [this section](./prebuilt_rules_common_info.md#features).

## Summary <!-- omit from toc -->

This is a test plan for the workflows of reverting prebuilt rule customizations via the dedicated API.

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
  - [Reverting a rule to stock version](#reverting-a-rule-to-stock-version)
    - [**Scenario: Reverting prebuilt rule customizations**](#scenario-reverting-prebuilt-rule-customizations)
    - [**Scenario: Showing a customizations diff view in the flyout**](#scenario-showing-a-customizations-diff-view-in-the-flyout)
    - [**Scenario: Disabling the "Revert" prebuilt rule button when rule's base version is missing**](#scenario-disabling-the-revert-prebuilt-rule-button-when-rules-base-version-is-missing)
    - [**Scenario: Hiding the "Revert" prebuilt rule button when the prebuilt rule is non-customized**](#scenario-hiding-the-revert-prebuilt-rule-button-when-the-prebuilt-rule-is-non-customized)
    - [**Scenario: Returning an error for prebuilt rules with missing base version**](#scenario-returning-an-error-for-prebuilt-rules-with-missing-base-version)
    - [**Scenario: Making no effect on a non-customized rule**](#scenario-making-no-effect-on-a-non-customized-rule)
    - [**Scenario: Returning an error for custom rules**](#scenario-returning-an-error-for-custom-rules)
    - [**Scenario: Reverting a prebuilt rule doesn't modify customization adjacent fields**](#scenario-reverting-a-prebuilt-rule-doesnt-modify-customization-adjacent-fields)
  - [Reverting a rule to stock version: Concurrency control](#reverting-a-rule-to-stock-version-concurrency-control)
    - [**Scenario: Returning an error when someone changed the prebuilt rule concurrently**](#scenario-returning-an-error-when-someone-changed-the-prebuilt-rule-concurrently)
    - [**Scenario: Returning an error when someone updated the prebuilt rule concurrently**](#scenario-returning-an-error-when-someone-updated-the-prebuilt-rule-concurrently)
    - [**Scenario: Notifying the user when the prebuilt rule's base version has disappeared**](#scenario-notifying-the-user-when-the-prebuilt-rules-base-version-has-disappeared)

## Useful information

### Tickets

- [Users can Customize Prebuilt Detection Rules](https://github.com/elastic/security-team/issues/1974) (internal)
- [Users can Customize Prebuilt Detection Rules: Milestone 3](https://github.com/elastic/kibana/issues/174168)
- [Relax the rules of handling missing base versions of prebuilt rules](https://github.com/elastic/kibana/issues/210358)
- [Tests for prebuilt rule customization workflow](https://github.com/elastic/kibana/issues/202068)

### Terminology

- [Common terminology](./prebuilt_rules_common_info.md#common-terminology).
- **Rule source**, or **`ruleSource`**: a rule field that defines the rule's origin. Can be `internal` or `external`. Currently, custom rules have `internal` rule source and prebuilt rules have `external` rule source.
- **`is_customized`**: a field within `ruleSource` that exists when rule source is set to `external`. It is a boolean value based on if the rule has been changed from its base version.
- **`customized_fields`**: a field within `ruleSource` that exists when rule source is set to `external`. It is an array of objects containing field names that have been changed from their base version counterparts.
- **rule customization**: a change to a customizable field of a prebuilt rule. Full list of customizable rule fields can be found in [Common information about prebuilt rules](./prebuilt_rules_common_info.md#customizable-rule-fields).

## Requirements

### Assumptions

Assumptions about test environments and scenarios outlined in this test plan.

- [Common assumptions](./prebuilt_rules_common_info.md#common-assumptions).
- Package with prebuilt rules is already installed, and rule assets from it are stored in Elasticsearch.

### Technical requirements

Non-functional requirements for the functionality outlined in this test plan.

- [Common technical requirements](./prebuilt_rules_common_info.md#common-technical-requirements).

### Product requirements

Functional requirements for the functionality outlined in this test plan.

- [Common product requirements](./prebuilt_rules_common_info.md#common-product-requirements).

User stories:

- User can edit a single prebuilt rule from the Rule Details page.
- User can edit single prebuilt rules one-by-one from the Rule Management page.
- User can edit multiple prebuilt rules in bulk via bulk actions on the Rule Management page. For example:
  - User can bulk add index patterns to prebuilt rules.
  - User can bulk update rule schedule in prebuilt rules.
- User can customize most of the fields of prebuilt rules:
  - User can edit and customize almost any field of a prebuilt rule, just like it's possible to do with custom rules, via editing it directly or via bulk editing via bulk actions.
  - User can't edit the Author and License fields.
- User can see if the rule is customized on the Rule Details page.
- User can see which rules are customized on the Rule Management page in the Upgrade table.
- User can un-customize a prebuilt rule by editing it and reverting its parameters back to their original values.

## Scenarios

### Reverting a rule to stock version

#### **Scenario: Reverting prebuilt rule customizations**

**Automation**: 1 cypress test and 1 integration test.

```Gherkin
Given a prebuilt rule installed
And that rule is customized
And that rule has an existing base version
When user reverts that rule customizations
Then rule customizations should be reset
And rule data should match the base version
And the rule's `is_customized` value should be false
And the rule's `customized_fields` value should be an empty array
```

#### **Scenario: Showing a customizations diff view in the flyout**

**Automation**: 1 cypress test.

```Gherkin
Given a prebuilt rule installed
And that rule is customized
And that rule has an existing base version
When a user clicks the "Revert" rule's action button on the rule's details page
Then a rule diff flyout should open
And this flyout should display a per field JSON diff view
And this flyout should list all fields that are different between the current and base version
And this flyout should contain a button to revert the rule
```

#### **Scenario: Disabling the "Revert" prebuilt rule button when rule's base version is missing**

**Automation**: 1 cypress test.

```Gherkin
Given a prebuilt rule installed
And that rule is customized
And that rule does not have an existing base version
When user navigates to that rule's details page
And clicks the overflow actions button
Then the "Revert" rule button should be disabled
And have an informational tooltip on hover
```

#### **Scenario: Hiding the "Revert" prebuilt rule button when the prebuilt rule is non-customized**

**Automation**: 1 cypress test.

```Gherkin
Given a prebuilt rule installed
And that rule is non-customized
When user clicks the overflow actions button on the rule's details page
Then the revert rule button should not be displayed as an option
```

#### **Scenario: Returning an error for prebuilt rules with missing base version**

**Automation**: 1 integration test.

```Gherkin
Given a prebuilt rule installed
And that rule is customized
And that rule does not have an existing base version
When user makes a request to revert the rule customizations
Then API should return a 500 HTTP error
And the rule should stay unchanged
```

#### **Scenario: Making no effect on a non-customized rule**

**Automation**: 1 integration test.

```Gherkin
Given a prebuilt rule installed
And that rule is non-customized
And that rule has an existing base version
When user makes a request to revert the rule customizations
Then API should return a successful response
And the rule should stay unchanged
```

#### **Scenario: Returning an error for custom rules**

**Automation**: 1 integration test.

```Gherkin
Given a custom rule
When user makes a request to revert the rule customizations
Then API should return a 500 HTTP error
And the rule should remain the same
```

#### **Scenario: Reverting a prebuilt rule doesn't modify customization adjacent fields**

**Automation**: one integration test per field.

```Gherkin
Given a prebuilt rule installed
And that rule is customized
And that rule has an existing base version
And that rule has a custom <customization_adjacent_field_name> field different from the base version
When user makes a request to revert the rule customizations
Then the rule's `is_customized` value should be false
And the rule's `customized_fields` value should be an empty array
And the <customization_adjacent_field_name> field stay unchanged
```

**Examples:**

`<customization_adjacent_field_name>` = all customization adjacent fields

### Reverting a rule to stock version: Concurrency control

#### **Scenario: Returning an error when someone changed the prebuilt rule concurrently**

**Automation**: 3 integration tests.

```Gherkin
Given a prebuilt rule installed
And that rule is customized
And that rule has an existing base version
And userA has <changed> that prebuilt rule concurrently
When userB makes a request to revert the rule
When a user calls the revert rule API endpoint with an outdated revision field
Then the API should return a 500 HTTP error
And the rule should stay unchanged
```

**Examples:**

`<changed>` is

- customizing the same fields
- customizing the other fields
- reverting the customization via rule edit
- reverting the customization via "Revert" action
- upgrading the rule

#### **Scenario: Returning an error when someone updated the prebuilt rule concurrently**

**Automation**: 1 integration test.

```Gherkin
Given a prebuilt rule installed
And that rule is customized
And that rule has an existing base version
And userA has upgraded that prebuilt rule concurrently
When userB makes a request to revert the rule
Then the API should return a 500 HTTP error
And the rule should stay unchanged
```

#### **Scenario: Notifying the user when the prebuilt rule's base version has disappeared**

**Automation**: 1 integration test.

```Gherkin
Given a prebuilt rule installed
And that rule is customized
And that rule has an existing base version
When user opens a revert rule flyout
And that rule's base version <disappears>
Then a notification regarding missing base version should be shown
And the flyout should be blocked
```

**Examples:**

`<disappears>` is

- base version got removed manually
- a new prebuilt rules package has been installed and it doesn't contain the base rule version
