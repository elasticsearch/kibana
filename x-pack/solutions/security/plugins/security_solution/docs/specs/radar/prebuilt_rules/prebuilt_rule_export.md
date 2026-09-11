# Test plan: exporting prebuilt rules <!-- omit from toc -->

**Status**: `implemented`, matches [Milestone 3](https://github.com/elastic/kibana/issues/174168).

> [!TIP]
> If you're new to prebuilt rules, get started [here](./prebuilt_rules.md) and check an overview of the features of prebuilt rules in [this section](./prebuilt_rules_common_info.md#features).

## Summary <!-- omit from toc -->

This is a test plan for the workflows of:

- exporting a single prebuilt rule from the Rule Details page
- exporting a single prebuilt rule from the Rule Management page
- exporting multiple prebuilt rules in bulk from the Rule Management page
- exporting a mixture of prebuilt and custom rules from the Rule Management page

where each prebuilt rule:

- can be an original (non-customized) prebuilt rule from Elastic, or
- can be a prebuilt rule customized by the user.

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
  - [Licensing](#licensing)
- [Scenarios](#scenarios)
  - [Core Functionality](#core-functionality)
    - [**Scenario: Exporting a prebuilt rule from rule details page**](#scenario-exporting-a-prebuilt-rule-from-rule-details-page)
    - [**Scenario: Exporting a prebuilt rule from rules management table**](#scenario-exporting-a-prebuilt-rule-from-rules-management-table)
    - [**Scenario: Exporting multiple prebuilt rules in bulk**](#scenario-exporting-multiple-prebuilt-rules-in-bulk)
    - [**Scenario: Exporting a mix of prebuilt and custom rules in bulk**](#scenario-exporting-a-mix-of-prebuilt-and-custom-rules-in-bulk)
    - [**Scenario: Importing a mix of just bulk exported prebuilt and custom rules**](#scenario-importing-a-mix-of-just-bulk-exported-prebuilt-and-custom-rules)
  - [Error Handling](#error-handling)
    - [**Scenario: Exporting beyond the export limit**](#scenario-exporting-beyond-the-export-limit)

## Useful information

### Tickets

- [Users can Customize Prebuilt Detection Rules](https://github.com/elastic/security-team/issues/1974) (internal)
- [Users can Customize Prebuilt Detection Rules: Milestone 3](https://github.com/elastic/kibana/issues/174168)
- [Allow exporting prebuilt rules at the API level](https://github.com/elastic/kibana/issues/180167)
- [Support exporting prebuilt rules from the Rule Management page](https://github.com/elastic/kibana/issues/180173)
- [Support exporting prebuilt rules from the Rule Details page](https://github.com/elastic/kibana/issues/180176)
- [Tests for prebuilt rule import/export workflow](https://github.com/elastic/kibana/issues/202079)

### Terminology

- [Common terminology](./prebuilt_rules_common_info.md#common-terminology).

## Requirements

### Assumptions

Assumptions about test environments and scenarios outlined in this test plan.

- [Common assumptions](./prebuilt_rules_common_info.md#common-assumptions).
- Prebuilt rules export works for any rule type

### Technical requirements

Non-functional requirements for the functionality outlined in this test plan.

- [Common technical requirements](./prebuilt_rules_common_info.md#common-technical-requirements).

### Product requirements

Functional requirements for the functionality outlined in this test plan.

- [Common product requirements](./prebuilt_rules_common_info.md#common-product-requirements).

User stories:

- User can export a single prebuilt rule from the Rule Details page.
- User can export multiple prebuilt rules one-by-one from the Rule Management page.
- User can export multiple prebuilt rules in bulk from the Rule Management page via bulk actions.
- User can export prebuilt non-customized rules.
- User can export prebuilt customized rules.
- User can export any combination of prebuilt non-customized, prebuilt customized, and custom rules.

### Licensing

Prebuilt rules export test scenarios are expected to work under low-tier licenses where Prebuilt Rules Customization isn't allowed.

## Scenarios

### Core Functionality

#### **Scenario: Exporting a prebuilt rule from rule details page**

**Automation**: 2 cypress tests.

```Gherkin
Given a <customized_state> prebuilt rule
When user exports the rule from the rule's detail page
Then the rule should be exported as an NDJSON file
And it should include an "immutable" field having true value
And "rule_source.type" should be "external"
And "rule_source.is_customized" should be <is_customized>
And the exported payload should match the rule's parameters
```

**Examples:**

| `<customized_state>` | `<is_customized>` |
| -------------------- | ----------------- |
| customized           | true              |
| non-customized       | false             |

#### **Scenario: Exporting a prebuilt rule from rules management table**

**Automation**: 2 cypress tests.

```Gherkin
Given a <customized_state> prebuilt rule
When user export the rule via rule management table row actions
Then the rule should be exported as an NDJSON file
And it should include an "immutable" field having true value
And "rule_source.type" should be "external"
And "rule_source.is_customized" should be <is_customized>
And the exported payload should match the rule's parameters
```

**Examples:**

| `<customized_state>` | `<is_customized>` |
| -------------------- | ----------------- |
| customized           | true              |
| non-customized       | false             |

#### **Scenario: Exporting multiple prebuilt rules in bulk**

**Automation**: 2 cypress tests.

```Gherkin
Given multiple <customized_state> prebuilt rules
When user selects some prebuilt rules in the rule management table
And bulk exports them
Then the selected rules should be exported as an NDJSON file
And each exported rule should include an "immutable" field having true value
And each exported rule should have "rule_source.type" equal to "external"
And each exported rule should have "rule_source.is_customized" equal to <is_customized>
And each exported rule should match the corresponding rule's parameters
```

**Examples:**

| `<customized_state>` | `<is_customized>` |
| -------------------- | ----------------- |
| customized           | true              |
| non-customized       | false             |

#### **Scenario: Exporting a mix of prebuilt and custom rules in bulk**

**Automation**: 1 cypress test.

```Gherkin
Given a mix of customized prebuilt, non-customized prebuilt and custom rules
When user selects some rules of each type in the rule management table
And bulk exports them
Then the selected rules should be exported as an NDJSON file
And the exported prebuilt rules should include an "immutable" field having true value
And the exported prebuilt rules "rule_source.type" should be "external"
And the exported non-customized prebuilt rules "rule_source.is_customized" should be false
And the exported customized prebuilt rules "rule_source.is_customized" should be true
And the exported custom rules should include an "immutable" field having false value
And the exported custom rules "rule_source.type" should be "internal"
```

#### **Scenario: Importing a mix of just bulk exported prebuilt and custom rules**

**Automation**: 1 integration test and 1 cypress test.

```Gherkin
Given a mix of customized prebuilt, non-customized prebuilt and custom rules
When user selects some rules of each type in the rule management table
And bulk exports them
Then the selected rules should be exported as an NDJSON file
When user removes the rules and imports just exported NDJSON file
Then the rules should be created
And the created rules should be correctly identified as prebuilt or custom
And the created rules' is_customized field should be correctly calculated
And the created rules' parameters should match the import payload
```

### Error Handling

#### **Scenario: Exporting beyond the export limit**

**Automation**: 2 integration tests and 1 cypress test.

```Gherkin
Given prebuilt and custom rules
And the number of rules is greater than the export limit (defaults to 10_000)
Then the request should be rejected as a bad request
```
