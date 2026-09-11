# Test plan: exporting rules <!-- omit from toc -->

**Status**: `in progress`.

## Summary <!-- omit from toc -->

This a draft test plan containing exporting custom rules test scenarios moved from prebuilt rules export test plan.

## Table of contents <!-- omit from toc -->

<!--
Please use the "Markdown All in One" VS Code extension to keep the TOC in sync with the text:
https://marketplace.visualstudio.com/items?itemName=yzhang.markdown-all-in-one
-->

- [Useful information](#useful-information)
  - [Assumptions](#assumptions)
- [Scenarios](#scenarios)
  - [Core Functionality](#core-functionality)
    - [**Scenario: Exporting custom rule individually from rule details page**](#scenario-exporting-custom-rule-individually-from-rule-details-page)
    - [**Scenario: Exporting custom rule individually from rules management table**](#scenario-exporting-custom-rule-individually-from-rules-management-table)
    - [**Scenario: Exporting custom rules in bulk**](#scenario-exporting-custom-rules-in-bulk)

## Useful information

### Assumptions

- Rules export works for any rule type

TBD

## Scenarios

### Core Functionality

#### **Scenario: Exporting custom rule individually from rule details page**

**Automation**: 1 cypress test.

```Gherkin
Given a custom rule
When the user exports the rule from the rule's detail page
Then the rule should be exported as an NDJSON file
And the exported rule should have "immutable" field with a value of false
And the exported rule should have "rule_source" field with "type" field set to "internal"
And the exported rule's parameters should match to the source rule
```

#### **Scenario: Exporting custom rule individually from rules management table**

**Automation**: 1 cypress test.

```Gherkin
Given a custom rule
When the user exports the rule from the rules management page
Then the rule should be exported as an NDJSON file
And the exported rule should have "immutable" field with a value of false
And the exported rule should have "rule_source" field with "type" field set to "internal"
And the exported rule's parameters should match to the source rule
```

#### **Scenario: Exporting custom rules in bulk**

**Automation**: 1 cypress test.

```Gherkin
Given multiple custom rules
When the user exports multiple rules in bulk from the rules management page
Then the selected rules should be exported as an NDJSON file
And each exported rule should have "immutable" field with a value of false
And each exported rule should have "rule_source" field with "type" field set to "internal"
And each exported rule's parameters should match to the source rule
```
