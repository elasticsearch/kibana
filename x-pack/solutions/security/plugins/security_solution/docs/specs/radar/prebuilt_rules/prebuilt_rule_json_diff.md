# Test plan: upgrading prebuilt rules one-by-one with preview <!-- omit from toc -->

**Status**: `in progress`, matches [Milestone 3](https://github.com/elastic/kibana/issues/174168).

> [!TIP]
> If you're new to prebuilt rules, get started [here](./prebuilt_rules.md) and check an overview of the features of prebuilt rules in [this section](./prebuilt_rules_common_info.md#features).

## Summary <!-- omit from toc -->

This is a test plan for license agnostic all/per-field rule upgrade JSON diff view.

## Table of contents <!-- omit from toc -->

<!--
Please use the "Markdown All in One" VS Code extension to keep the TOC in sync with the text:
https://marketplace.visualstudio.com/items?itemName=yzhang.markdown-all-in-one
-->

[Useful information](#useful-information)

- [Useful information](#useful-information)
  - [Tickets](#tickets)
  - [Terminology](#terminology)
- [Requirements](#requirements)
  - [Assumptions](#assumptions)
  - [Technical requirements](#technical-requirements)
  - [Product requirements](#product-requirements)
- [Scenarios](#scenarios)
  - [Rule upgrade workflow: viewing rule changes in per-field diff view](#rule-upgrade-workflow-viewing-rule-changes-in-per-field-diff-view)
    - [**Scenario: User can see changes in a side-by-side per-field diff view**](#scenario-user-can-see-changes-in-a-side-by-side-per-field-diff-view)
    - [**Scenario: User can see changes when updated rule is a different rule type**](#scenario-user-can-see-changes-when-updated-rule-is-a-different-rule-type)
    - [**Scenario: Field groupings should be rendered together in the same accordion panel**](#scenario-field-groupings-should-be-rendered-together-in-the-same-accordion-panel)
    - [**Scenario: Undefined values are displayed with empty diffs**](#scenario-undefined-values-are-displayed-with-empty-diffs)
    - [**Scenario: Field diff components have the same grouping and order as in rule details overview**](#scenario-field-diff-components-have-the-same-grouping-and-order-as-in-rule-details-overview)
  - [Rule upgrade workflow: viewing rule changes in JSON diff view](#rule-upgrade-workflow-viewing-rule-changes-in-json-diff-view)
    - [**Scenario: User can see precisely how property values would change after upgrade**](#scenario-user-can-see-precisely-how-property-values-would-change-after-upgrade)
    - [**Scenario: Rule actions and exception lists SHOULDN'T be shown as modified**](#scenario-rule-actions-and-exception-lists-shouldnt-be-shown-as-modified)
    - [**Scenario: Dynamic properties should not be included in preview**](#scenario-dynamic-properties-should-not-be-included-in-preview)
    - [**Scenario: Technical properties should not be included in preview**](#scenario-technical-properties-should-not-be-included-in-preview)
    - [**Scenario: Properties with semantically equal values should not be shown as modified**](#scenario-properties-with-semantically-equal-values-should-not-be-shown-as-modified)
    - [**Scenario: Unchanged sections of a rule should be hidden by default**](#scenario-unchanged-sections-of-a-rule-should-be-hidden-by-default)
    - [**Scenario: Properties should be sorted alphabetically**](#scenario-properties-should-be-sorted-alphabetically)

## Useful information

### Tickets

- [Users can Customize Prebuilt Detection Rules](https://github.com/elastic/security-team/issues/1974) (internal)
- [Users can Customize Prebuilt Detection Rules: Milestone 3](https://github.com/elastic/kibana/issues/174168)
- [Tests for prebuilt rule upgrade workflow](https://github.com/elastic/kibana/issues/202078)

### Terminology

- [Common terminology](./prebuilt_rules_common_info.md#common-terminology).

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

## Scenarios

> These scenarios are applicable to rule type change upgrade and low-license tier.

### Rule upgrade workflow: viewing rule changes in per-field diff view

#### **Scenario: User can see changes in a side-by-side per-field diff view**

**Automation**: 1 e2e test

```Gherkin
Given a prebuilt rule with an upgrade
When user opens the upgrade preview
Then the per-field upgrade preview should open
And rule changes should be displayed in a two-column diff view with each field in its own accordion component
And all field diff accordions should be open by default
And correct rule version numbers should be displayed in their respective columns
When the user selects another rule without closing the preview
Then the preview should display the changes for the newly selected rule
```

#### **Scenario: User can see changes when updated rule is a different rule type**

**Automation**: 1 e2e test

```Gherkin
Given a prebuilt rule with an upgrade
When user opens the upgrade preview
Then the rule type changes should be displayed in grouped field diffs with corresponding query fields
# When tooltip enhancement is added, this step needs to be added to the corresponding test scenario
And a tooltip is displayed with information about changing rule types
```

#### **Scenario: Field groupings should be rendered together in the same accordion panel**

**Automation**: 1 UI integration test

```Gherkin
Given a prebuilt rule with an upgrade
When user opens the upgrade preview
The <field> diff accordion panel should display its grouped rule properties
And each property should have its name displayed inside the panel above its value
```

**Examples:**

- `<field>`
  - `data_source`
  - `kql_query`
  - `eql_query`
  - `esql_query`
  - `threat_query`
  - `rule_schedule`
  - `rule_name_override`
  - `timestamp_override`
  - `timeline_template`
  - `building_block`
  - `threshold`

#### **Scenario: Undefined values are displayed with empty diffs**

**Automation**: 1 UI integration test

```Gherkin
Given a prebuilt rule with an upgrade
When user opens the upgrade preview
Then the preview should open
And the old/new field should render an empty panel
```

#### **Scenario: Field diff components have the same grouping and order as in rule details overview**

**Automation**: 1 UI integration test

```Gherkin
Given a prebuilt rule with an upgrade
When user opens the upgrade preview
Then the multiple field diff accordions should be sorted in the same order as on the rule details overview tab
And the field diff accordions should be grouped inside its corresponding <section> accordion
And any <section> accordion that doesn't have fields inside it shouldn't be displayed
```

**Examples:**

- `<section>`
  - About
  - Definition
  - Schedule
  - Setup Guide

### Rule upgrade workflow: viewing rule changes in JSON diff view

> This section is license agnostic. JSON view is displayed at a separate tab.

#### **Scenario: User can see precisely how property values would change after upgrade**

**Automation**: 1 UI integration test

```Gherkin
Given a prebuilt rule with an upgrade
And the upgrade preview for this prebuilt rule is shown
Then each line of <column> that was <change_type> should have <bg_color> background
And marked with <line_badge> badge
And each changed word in <column> should be highlighted with <accent_color>
```

**Examples:**

| change_type | column         | bg_color         | accent_color         | line_badge |
| ----------- | -------------- | ---------------- | -------------------- | ---------- |
| updated     | Current rule   | removed_bg_color | removed_accent_color | -          |
| updated     | Elastic update | added_bg_color   | added_accent_color   | +          |
| removed     | Current rule   | removed_bg_color | none                 | -          |
| removed     | Elastic update | none             | none                 | none       |
| added       | Current rule   | none             | none                 | none       |
| added       | Elastic update | added_bg_color   | none                 | +          |

#### **Scenario: Rule actions and exception lists SHOULDN'T be shown as modified**

**Automation**: 1 UI integration test

```Gherkin
Given a prebuilt rule with an upgrade not including any actions nor exception lists
And user adds actions and an exception list for this rule
When user opens Prebuilt Rule Upgrade Flyout for this rule
Then the JSON diff shouldn't show any modifications to rule's actions or exception list
```

#### **Scenario: Dynamic properties should not be included in preview**

**Automation**: 1 e2e test

```Gherkin
Given a prebuilt rule with an upgrade
And this prebuilt rule has executed at least once
When user opens the upgrade preview
Then the JSON diff shouldn't show any <property> properties on both sides
```

**Examples:**

`<property>` = `property` | `execution_summary` | `enabled`

#### **Scenario: Technical properties should not be included in preview**

**Automation**: 1 UI integration test

```Gherkin
Given a prebuilt rule with an upgrade
When user opens the upgrade preview
Then the JSON diff shouldn't show any <technical_property> properties on both sides
```

**Examples:**

`<technical_property>` = `revision` | `updated_at` | `updated_by` | `created_at` | `created_by`

#### **Scenario: Properties with semantically equal values should not be shown as modified**

**Automation**: 1 UI integration test

```Gherkin
Given a prebuilt rule with an upgrade
And the upgrade has properties with different, but semantically equal values
When user opens the upgrade preview
Then the JSON diff shouldn't show any changes to properties with semantically equal values
```

**Examples:**

- Duration:

  - 1h
  - 60m
  - 3600s

- Empty value:
  - no value
  - ''
  - []
  - undefined
  - null

#### **Scenario: Unchanged sections of a rule should be hidden by default**

**Automation**: 1 UI integration test

```Gherkin
Given a prebuilt rule with an upgrade
When user opens the upgrade preview
Then only the sections of the diff that have changes should be visible
And unchanged sections should be hidden behind a button with a number of unchanged lines
When user clicks on the hidden section button
Then the section should expand and show the unchanged properties
```

#### **Scenario: Properties should be sorted alphabetically**

**Automation**: 1 UI integration test

```Gherkin
Given a prebuilt rule with an upgrade
When user opens the upgrade preview
Then visible properties should be sorted alphabetically
When user expands all hidden sections
Then all properties of the rule should be sorted alphabetically
```
