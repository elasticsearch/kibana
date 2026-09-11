# Test plan: upgrading prebuilt rules one-by-one with preview <!-- omit from toc -->

**Status**: `in progress`, matches [Milestone 3](https://github.com/elastic/kibana/issues/174168).

> [!TIP]
> If you're new to prebuilt rules, get started [here](./prebuilt_rules.md) and check an overview of the features of prebuilt rules in [this section](./prebuilt_rules_common_info.md#features).

## Summary <!-- omit from toc -->

This is a test plan for the workflow of:

- upgrading single prebuilt rules one-by-one

from the Rule Upgrade table with previewing incoming updates from Elastic and user customizations in the Rule Upgrade flyout.

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
  - [Rule upgrade workflow: rule previews](#rule-upgrade-workflow-rule-previews)
    - [**Scenario: User can preview prebuilt rules having upgrades**](#scenario-user-can-preview-prebuilt-rules-having-upgrades)
    - [**Scenario: User can see correct rule information in the preview before upgrading**](#scenario-user-can-see-correct-rule-information-in-the-preview-before-upgrading)
    - [**Scenario: Tabs and sections without content should be hidden in the preview before upgrading**](#scenario-tabs-and-sections-without-content-should-be-hidden-in-the-preview-before-upgrading)
  - [Rule upgrade field preview](#rule-upgrade-field-preview)
    - [**Scenario: Preview non-customized field that has an upgrade (AAB)**](#scenario-preview-non-customized-field-that-has-an-upgrade-aab)
    - [**Scenario: Preview customized field that doesn't have an upgrade (ABA)**](#scenario-preview-customized-field-that-doesnt-have-an-upgrade-aba)
    - [**Scenario: Preview customized field that has a matching upgrade (ABB)**](#scenario-preview-customized-field-that-has-a-matching-upgrade-abb)
    - [**Scenario: Preview customized field that has an upgrade resulting in a solvable conflict (ABC, conflict solvable by diff algo)**](#scenario-preview-customized-field-that-has-an-upgrade-resulting-in-a-solvable-conflict-abc-conflict-solvable-by-diff-algo)
    - [**Scenario: Preview customized field that has an upgrade resulting in a non-solvable conflict (ABC, conflict non-solvable by diff algo)**](#scenario-preview-customized-field-that-has-an-upgrade-resulting-in-a-non-solvable-conflict-abc-conflict-non-solvable-by-diff-algo)
  - [Rule upgrade field preview Diff View options](#rule-upgrade-field-preview-diff-view-options)
    - [**Scenario: Preview customized field that doesn't have an upgrade (AAB diff case)**](#scenario-preview-customized-field-that-doesnt-have-an-upgrade-aab-diff-case)
    - [**Scenario: Preview non-customized field that has an upgrade (ABA diff case)**](#scenario-preview-non-customized-field-that-has-an-upgrade-aba-diff-case)
    - [**Scenario: Preview customized field diff that has a matching upgrade (ABB diff case)**](#scenario-preview-customized-field-diff-that-has-a-matching-upgrade-abb-diff-case)
    - [**Scenario: Preview customized field diff that has an upgrade with a solvable conflict (ABC diff case, conflict solvable by diff algo)**](#scenario-preview-customized-field-diff-that-has-an-upgrade-with-a-solvable-conflict-abc-diff-case-conflict-solvable-by-diff-algo)
    - [**Scenario: Preview customized field diff that has an upgrade with a non-solvable conflict (ABC diff case, conflict non-solvable by diff algo)**](#scenario-preview-customized-field-diff-that-has-an-upgrade-with-a-non-solvable-conflict-abc-diff-case-conflict-non-solvable-by-diff-algo)
  - [Field editing](#field-editing)
    - [**Scenario: Validation blocks saving field form when value is invalid**](#scenario-validation-blocks-saving-field-form-when-value-is-invalid)
    - [**Scenario: Saving unchanged field form value doesn't add up or remove anything to the field diff in Diff View**](#scenario-saving-unchanged-field-form-value-doesnt-add-up-or-remove-anything-to-the-field-diff-in-diff-view)
  - [Rule upgrade button](#rule-upgrade-button)
    - [**Scenario: Rule upgrade button is disabled when num of conflicts \>= 1**](#scenario-rule-upgrade-button-is-disabled-when-num-of-conflicts--1)
    - [**Scenario: Rule upgrade button is disabled when num fields in edit mode \>= 1**](#scenario-rule-upgrade-button-is-disabled-when-num-fields-in-edit-mode--1)
    - [**Scenario: Rule upgrade button is disabled when num of conflicts \>= 1 and num fields in edit mode \>= 1**](#scenario-rule-upgrade-button-is-disabled-when-num-of-conflicts--1-and-num-fields-in-edit-mode--1)
  - [Rule upgrade after field preview](#rule-upgrade-after-field-preview)
    - [**Scenario: Non-customized rule upgrade after preview (AAB diff case)**](#scenario-non-customized-rule-upgrade-after-preview-aab-diff-case)
    - [**Scenario: Non-customized rule upgrade after preview and customizing field values (AAB diff case)**](#scenario-non-customized-rule-upgrade-after-preview-and-customizing-field-values-aab-diff-case)
    - [**Scenario: Customized rule upgrade after preview customized fields that don't have upgrades (ABA diff case)**](#scenario-customized-rule-upgrade-after-preview-customized-fields-that-dont-have-upgrades-aba-diff-case)
    - [**Scenario: Customized rule upgrade after preview customized fields that don't have upgrades and changing that field values (ABA diff case)**](#scenario-customized-rule-upgrade-after-preview-customized-fields-that-dont-have-upgrades-and-changing-that-field-values-aba-diff-case)
    - [**Scenario: Customized rule upgrade after preview and accepting solvable conflicts (ABC diff case, conflict solvable by diff algo)**](#scenario-customized-rule-upgrade-after-preview-and-accepting-solvable-conflicts-abc-diff-case-conflict-solvable-by-diff-algo)
    - [**Scenario: Customized rule upgrade after preview and accepting edited solvable conflicts (ABC diff case, conflict solvable by diff algo)**](#scenario-customized-rule-upgrade-after-preview-and-accepting-edited-solvable-conflicts-abc-diff-case-conflict-solvable-by-diff-algo)
    - [**Scenario: Customized rule upgrade after preview non-solvable conflicts and accepting suggested field value (ABC diff case, non-solvable by diff algo)**](#scenario-customized-rule-upgrade-after-preview-non-solvable-conflicts-and-accepting-suggested-field-value-abc-diff-case-non-solvable-by-diff-algo)
    - [**Scenario: Customized rule upgrade after preview non-solvable conflicts and accepting edited field value (ABC diff case, non-solvable by diff algo)**](#scenario-customized-rule-upgrade-after-preview-non-solvable-conflicts-and-accepting-edited-field-value-abc-diff-case-non-solvable-by-diff-algo)
    - [**Scenario: Customized rule upgrade after preview solvable conflicts and accepting suggested field value (-AB diff case)**](#scenario-customized-rule-upgrade-after-preview-solvable-conflicts-and-accepting-suggested-field-value--ab-diff-case)
    - [**Scenario: Customized rule upgrade after preview solvable conflicts and accepting edited field value (-AB diff case)**](#scenario-customized-rule-upgrade-after-preview-solvable-conflicts-and-accepting-edited-field-value--ab-diff-case)
  - [Rule type upgrade](#rule-type-upgrade)
    - [**Scenario: Non-customized rule upgrade to a different rule type after preview**](#scenario-non-customized-rule-upgrade-to-a-different-rule-type-after-preview)
    - [**Scenario: Customized rule upgrade to a different rule type after preview**](#scenario-customized-rule-upgrade-to-a-different-rule-type-after-preview)
  - [Concurrency control](#concurrency-control)
    - [**Scenario: User gets notified after someone edited the prebuilt rule being previewed**](#scenario-user-gets-notified-after-someone-edited-the-prebuilt-rule-being-previewed)
    - [**Scenario: User gets notified after a prebuilt new rule version is released**](#scenario-user-gets-notified-after-a-prebuilt-new-rule-version-is-released)
  - [Licensing](#licensing)
    - [**Scenario: User can NOT modify field values in upgrade preview when license is insufficient**](#scenario-user-can-not-modify-field-values-in-upgrade-preview-when-license-is-insufficient)
    - [**Scenario: User is warned about losing their customizations in upgrade preview when license is insufficient**](#scenario-user-is-warned-about-losing-their-customizations-in-upgrade-preview-when-license-is-insufficient)
    - [**Scenario: Prebuilt rule always gets upgraded to the target version when license is insufficient**](#scenario-prebuilt-rule-always-gets-upgraded-to-the-target-version-when-license-is-insufficient)

## Useful information

### Tickets

- [Users can Customize Prebuilt Detection Rules](https://github.com/elastic/security-team/issues/1974) (internal)
- [Users can Customize Prebuilt Detection Rules: Milestone 3](https://github.com/elastic/kibana/issues/174168)
- [Relax the rules of handling missing base versions of prebuilt rules](https://github.com/elastic/kibana/issues/210358)
- [Tests for prebuilt rule upgrade workflow](https://github.com/elastic/kibana/issues/202078)

### Terminology

- [Common terminology](./prebuilt_rules_common_info.md#common-terminology).
- **CTA to upgrade the prebuilt rule**: the button to upgrade the prebuilt rule currently shown in the Rule Upgrade flyout.
- **customizable rule fields**: fields of prebuilt rules that are modifiable by user and are taken into account when calculating `is_customized`. Full list can be found in [Common information about prebuilt rules](./prebuilt_rules_common_info.md#customizable-rule-fields).

## Requirements

### Assumptions

Assumptions about test environments and scenarios outlined in this test plan.

- [Common assumptions](./prebuilt_rules_common_info.md#common-assumptions).
- A prebuilt rule is shown in the Rule Upgrade table when there's a newer version of this rule in the currently installed package with prebuilt rules.
- It's expected the Prebuilt Rules upgrade workflow works seamlessly even if some or all prebuilt rules may have their **base versions** missing.

### Technical requirements

Non-functional requirements for the functionality outlined in this test plan.

- [Common technical requirements](./prebuilt_rules_common_info.md#common-technical-requirements).

### Product requirements

Functional requirements for the functionality outlined in this test plan.

- [Common product requirements](./prebuilt_rules_common_info.md#common-product-requirements).

User stories:

- User can upgrade a single prebuilt rule to its latest version from the Rule Upgrade table with previewing incoming updates from Elastic and user customizations in the Rule Upgrade flyout. See below user stories that describe this workflow in more detail.
- User can upgrade single prebuilt rules one-by-one via the Rule Upgrade flyout.

User stories for upgrading a rule via the Rule Upgrade flyout:

- User can preview what updates they would receive from Elastic in the latest rule version, per each rule field that has an update from Elastic.
- User can preview their customizations, and which of them will be retained in the rule or overwritten by updates from Elastic, per each rule field that was customized.
- User can compare their customizations with updates from Elastic and see if there are any conflicts between them, per each rule field.
- User can manually resolve conflicts between their customizations and updates from Elastic, per each rule field.
- User can edit the final field values before submitting the update.

User stories for edge cases:

- User can upgrade a rule if its type has been changed by Elastic in the latest version, but can only accept the incoming changes. User customizations, if the rule has any, will be lost on upgrade. We force the user to preview such changes, meaning that users can only do this via the Rule Upgrade flyout, quick upgrade right from the table is not supported.

What should be inside the Rule Upgrade flyout:

- The Rule Upgrade flyout should contain a few tabs:
  - The "Updates" tab.
  - The "Overview" tab.
  - The "Investigation guide" tab.
- On the "Updates" tab:
  - We show the updates from Elastic and the user-customized fields.
  - We show only those fields that are [customizable](./prebuilt_rules_common_info.md#customizable-rule-fields).
  - We don't show technical fields and those that are [not customizable](./prebuilt_rules_common_info.md#non-customizable-rule-fields). They are handled by the upgrade workflow automatically under the hood.
  - We don't show some non-technical fields (rule parameters) as they are also handled by the upgrade workflow automatically under the hood. For example, the `enabled` or `exception_list` fields stay unchanged after upgrade (we retain their values from the current rule version).

## Scenarios

### Rule upgrade workflow: rule previews

#### **Scenario: User can preview prebuilt rules having upgrades**

**Automation**: 1 e2e test.

```Gherkin
Given a prebuilt rule with an upgrade
When user opens the rule preview for the prebuilt rule
Then the preview should open
When user closes the preview
Then it should disappear
```

#### **Scenario: User can see correct rule information in the preview before upgrading**

**Automation**: 1 e2e test

```Gherkin
Given a prebuilt rule with an upgrade
When user opens a rule preview for the prebuilt rule
Then the "Updates" tab should be active
When user selects the "Overview" tab
Then all properties of the new version of a rule should be displayed in the correct tab and section of the preview
```

#### **Scenario: Tabs and sections without content should be hidden in the preview before upgrading**

**Automation**: 1 e2e test

```Gherkin
Given a prebuilt rule is installed
And this rule upgrade doesn't have Setup and Investigation guides
When user opens a rule preview for the prebuilt rule
Then the Setup Guide section should NOT be displayed in the Overview tab
And the Investigation Guide tab should NOT be displayed
```

### Rule upgrade field preview

#### **Scenario: Preview non-customized field that has an upgrade (AAB)**

**Automation**: Jest functional test for each \<field\>.

```Gherkin
Given a prebuilt rule with an upgrade
And this prebuilt rule's <field> is non-customized
And the <field> has an upgrade
When user opens the Rule Update Flyout
Then user should see <field> has no conflicts
And <field> is shown collapsed
When user expands <field>
Then user should see <field> Diff View
And user should see <field> Readonly View

Examples:
<field> = all customizable fields
```

#### **Scenario: Preview customized field that doesn't have an upgrade (ABA)**

**Automation**: Jest functional test for each \<field\>.

```Gherkin
Given a prebuilt rule with an upgrade
And this prebuilt rule's <field> is customized
And the <field> has no upgrades
When user opens the Rule Update Flyout
Then user should see <field> has a customized value
And <field> has no conflicts
And <field> is shown collapsed
When user expands <field>
Then user should see <field> Diff View
And user should see <field> Readonly View
```

**Examples:**

`<field>` = all customizable fields

#### **Scenario: Preview customized field that has a matching upgrade (ABB)**

**Automation**: Jest functional test for each \<field\>.

```Gherkin
Given a prebuilt rule with an upgrade
And this prebuilt rule's <field> is customized
And the <field> has an upgrade matching customization
When user opens the Rule Update Flyout
Then user should see <field> has matching upgrade
And <field> has no conflicts
And <field> is shown collapsed
When user expands <field>
Then user should see <field> Diff View
And user should see <field> Readonly View
```

**Examples:**

`<field>` = all customizable fields

#### **Scenario: Preview customized field that has an upgrade resulting in a solvable conflict (ABC, conflict solvable by diff algo)**

**Automation**: Jest functional test for each \<field\>.

```Gherkin
Given a prebuilt rule with an upgrade
And this prebuilt rule's <field> is customized
And the <field> has an upgrade resulting in a solvable conflict
When user opens the Rule Update Flyout
Then user should see <field> has a customized value
And <field> has a conflict
And <field> is shown expanded
And <field> Diff View is shown
And <field> Readonly View is shown
And <field> Readonly View displays a merged value
When user switches to edit form
Then user should see <field> edit form
And <field> edit form has merged value
```

**Examples:**

`<field>` whose diff algo supports values merging:

- `data_source`
- `tags`
- `description`
- `references`
- `note`
- `setup`
- `threat_index`
- `new_terms_fields`

#### **Scenario: Preview customized field that has an upgrade resulting in a non-solvable conflict (ABC, conflict non-solvable by diff algo)**

**Automation**: Jest functional test for each \<field\>.

```Gherkin
Given a prebuilt rule with an upgrade
And this prebuilt rule's <field> is customized
And the <field> has an upgrade resulting in a non-solvable conflict
When user opens the Rule Update Flyout
Then user should see <field> has a customized value
And <field> has a conflict
And <field> is shown expanded
And <field> Diff View is shown
And <field> edit form is shown
And <field> edit form displays current rule version field value
When user saves and accepts the form
Then user should see <field> Readonly mode
And <field> Readonly mode displays the current rule version field value
```

**Examples:**

`<field>` = all customizable fields besides always mergeable fields (`tags`, `references`, `threat_index`, `new_terms_fields`)

### Rule upgrade field preview Diff View options

#### **Scenario: Preview customized field that doesn't have an upgrade (AAB diff case)**

**Automation**: 1 Jest integration test.

```Gherkin
Given a prebuilt rule with an upgrade
And this prebuilt rule's <field> is customized
And the <field> doesn't have an upgrade
When user opens the Rule Update Flyout
Then user should see <field> Diff View
And it shows a diff between original and current <field> values
When user edits and saves the <field> form
Then user should see a diff between original and edited <field> values
```

**Examples:**

`<field>` = all customizable fields

#### **Scenario: Preview non-customized field that has an upgrade (ABA diff case)**

**Automation**: 1 Jest integration test.

```Gherkin
Given a prebuilt rule with an upgrade
And this prebuilt rule's <field> is customized
And the <field> has no upgrades
When user opens the Rule Update Flyout
Then user should see <field> Diff View
And it shows a diff between original and upgraded <field> values
When user edits and saves the <field> form
Then user should see a diff between original and edited <field> values
And user should have an ability to see <diff option>
```

**Examples:**

`<field>` = all customizable fields

`<diff option>`

- Elastic update, a diff between original and upgrade field values

#### **Scenario: Preview customized field diff that has a matching upgrade (ABB diff case)**

**Automation**: 1 Jest integration test.

```Gherkin
Given a prebuilt rule with an upgrade
And this prebuilt rule's <field> is customized
And the <field> has a matching upgrade
When user opens the Rule Update Flyout
Then user should see <field> Diff View
And it shows a diff between original and customized <field> values
And user should have an ability to see a <diff option>
When user edits and saves the <field> form
Then user should see a diff between original and edited <field> values
And user should have an ability to see a <diff option>
```

**Examples:**

`<field>` = all customizable fields

`<diff option>`

- Elastic update, a diff between original and upgrade field values

#### **Scenario: Preview customized field diff that has an upgrade with a solvable conflict (ABC diff case, conflict solvable by diff algo)**

**Automation**: 1 Jest integration test.

```Gherkin
Given a prebuilt rule with an upgrade
And this prebuilt rule's <field> is customized
And the <field> has an upgrade resulting in a solvable conflict
When user opens the Rule Update Flyout
Then user should see <field> Diff View
And it shows a diff between original and merged (customization + upgrade) <field> values
And user should have an ability to see a <diff option>
When user edits and saves the <field> form
Then user should see a diff between original and edited <field> values
And user should have an ability to see a <diff option>
```

**Examples:**

`<field>` = all customizable fields

`<diff option>`

- Elastic update, a diff between original and upgrade field values
- Original field customization, a diff between original and customized field values

#### **Scenario: Preview customized field diff that has an upgrade with a non-solvable conflict (ABC diff case, conflict non-solvable by diff algo)**

**Automation**: 1 Jest integration test.

```Gherkin
Given a prebuilt rule with an upgrade
And this prebuilt rule's <field> is customized
And the <field> has an upgrade resulting in a non-solvable conflict
When user opens the Rule Update Flyout
Then user should see <field> Diff View
And it shows a diff between original and customized <field> values
And user should have an ability to see a <diff option A>
When user edits and saves the <field> form
Then user should see a diff between original and edited <field> values
And user should have an ability to see a <diff option B>
```

**Examples:**

`<field>` = all customizable fields

`<diff option A>`

- Elastic upgrade, a diff between original and upgrade field values

`<diff option B\>`

- Elastic upgrade, a diff between original and upgrade field values
- Original customization, a diff between original and customized field values

### Field editing

#### **Scenario: Validation blocks saving field form when value is invalid**

**Automation**: 1 Jest integration test per \<field\> + \<diff case\> variation.

```Gherkin
Given a prebuilt rule with an upgrade
And this prebuilt rule's <field> corresponds to a <diff case>
And the <field> appears in the Rule Update Flyout
When user edits <field>'s in a <field> form
And enters an invalid value
Then Save button should be disabled
And user should not be able to save the <field> form until a valid value is entered
```

**Examples:**

- `<field>` = all customizable fields

- `<diff case>`
  - `AAB` = a customized field that has doesn't have an upgrade
  - `ABA` = a non-customized field that has an upgrade
  - `ABB` = a customized field diff that has a matching upgrade
  - `ABC solvable` = customized field diff that has an upgrade with a solvable conflict
  - `ABC non-solvable` = customized field diff that has an upgrade with a non-solvable conflict

#### **Scenario: Saving unchanged field form value doesn't add up or remove anything to the field diff in Diff View**

**Automation**: 1 Jest integration test per \<field\> + \<diff case\> variation.

```Gherkin
Given a prebuilt rule with an upgrade
And this prebuilt rule's <field> corresponds to a <diff case>
And <field> appears in the Rule Update Flyout
When user opens a <field> form
And saves the form without changes
Then <field> Diff View should not have any new lines added up or removed
```

**Examples:**

- `<field>` = all customizable fields

- `<diff case>`
  - `AAB` = a customized field that has doesn't have an upgrade
  - `ABA` = a non-customized field that has an upgrade
  - `ABB` = a customized field diff that has a matching upgrade
  - `ABC solvable` = customized field diff that has an upgrade with a solvable conflict
  - `ABC non-solvable` = customized field diff that has an upgrade with a non-solvable conflict

### Rule upgrade button

#### **Scenario: Rule upgrade button is disabled when num of conflicts >= 1**

**Automation**: 1 Cypress test.

```Gherkin
Given a prebuilt rule with an upgrade resulting to conflicts
When user opens the upgrade preview
Then user should see INACTIVE CTA to upgrade the prebuilt rule
When user hover on the INACTIVE CTA
Then explanation tooltip appears
When user resolves all conflicts
Then the INACTIVE CTA becomes ACTIVE
```

#### **Scenario: Rule upgrade button is disabled when num fields in edit mode >= 1**

**Automation**: 1 Cypress test.

```Gherkin
Given a prebuilt rule with an upgrade without conflicts
When user opens the upgrade preview
Then user should see ACTIVE CTA to upgrade the prebuilt rule
When user switch one or more fields to edit mode
Then user should see INACTIVE CTA
When user hover on the INACTIVE CTA
Then explanation tooltip appears
When user switches every field to readonly mode
Then the INACTIVE CTA becomes ACTIVE
```

#### **Scenario: Rule upgrade button is disabled when num of conflicts >= 1 and num fields in edit mode >= 1**

**Automation**: 1 Cypress test.

```Gherkin
Given a prebuilt rule with an upgrade resulting to conflicts
And this rule is customized
When user opens the upgrade preview
Then user should see INACTIVE CTA to upgrade the prebuilt rule
When user resolves all conflicts
Then the INACTIVE CTA becomes ACTIVE
When user switches one or more fields to edit mode
Then user should see INACTIVE CTA
```

### Rule upgrade after field preview

#### **Scenario: Non-customized rule upgrade after preview (AAB diff case)**

**Automation**: Jest integration test per `<field>` and 1 bulk Cypress test.

```Gherkin
Given a non-customized prebuilt rule
And this rule's <field> has an upgrade
When user opens the Rule Update Flyout
Then user should see a CTA to upgrade the prebuilt rule
And user should see <field> has no conflicts
When user clicks on CTA
Then success message should be displayed after upgrade
And upgraded prebuilt rule should be removed from the table
When user opens rule details page for that prebuilt rule
Then user should see <field> has an upgraded value
```

**Examples:**

`<field>` = all customizable fields

#### **Scenario: Non-customized rule upgrade after preview and customizing field values (AAB diff case)**

**Automation**: Jest integration test per `<field>` and 1 bulk Cypress test.

```Gherkin
Given a non-customized prebuilt rule
And this rule's <field> has an upgrade
When user opens the Rule Update Flyout
Then user should see a CTA to upgrade the prebuilt rule
And user should see <field> has no conflicts
When user edits <field> form to something different but valid and saves the form
Then user should see <field> has a new value
When user clicks on CTA
Then success message should be displayed after upgrade
And upgraded prebuilt rule should be removed from the table
When user opens rule details page for that prebuilt rule
Then user should see <field> has a new value
```

**Examples:**

`<field>` = all customizable fields

#### **Scenario: Customized rule upgrade after preview customized fields that don't have upgrades (ABA diff case)**

**Automation**: Jest integration test per `<field>` and 1 bulk Cypress test.

```Gherkin
Given a prebuilt rule is installed
And this rule's <fieldA> is customized
And this rule's <fieldB> has an upgrade (<fieldB> != <fieldA>)
When user opens the Rule Update Flyout
Then user should see a CTA to upgrade the prebuilt rule
And user should see <fieldA> has a customized value and there are no conflicts
When user clicks on CTA
Then success message should be displayed after upgrade
And upgraded prebuilt rule should be removed from the table
When user opens rule details page for that prebuilt rule
Then user should see <fieldA> has preserved the customized value
```

**Examples:**

`<field>` = all customizable fields

#### **Scenario: Customized rule upgrade after preview customized fields that don't have upgrades and changing that field values (ABA diff case)**

**Automation**: Jest integration test per `<field>` and 1 bulk Cypress test.

```Gherkin
Given a prebuilt rule is installed
And this rule's <fieldA> is customized
And this rule's <fieldB> has an upgrade (<fieldB> != <fieldA>)
When user opens the Rule Update Flyout
Then user should see a CTA to upgrade the prebuilt rule
And user should see <fieldA> has a customized value and there are no conflicts
When user edits <fieldA> form to something different but valid and saves the form
Then user should see <fieldA> has a new value
When user clicks on CTA
Then success message should be displayed after upgrade
And upgraded prebuilt rule should be removed from the table
When user opens rule details page for that prebuilt rule
Then user should see <fieldA> has a new value
```

**Examples:**

`<field>` = all customizable fields

#### **Scenario: Customized rule upgrade after preview and accepting solvable conflicts (ABC diff case, conflict solvable by diff algo)**

**Automation**: Jest integration test per `<field>` and 1 bulk Cypress test.

```Gherkin
Given a prebuilt rule is installed
And this rule's <field> is customized
And the <field> has an upgrade resulting in a solvable conflict
When user opens the Rule Update Flyout
Then user should see INACTIVE CTA to upgrade the prebuilt rule
And user should see <field> has a conflict
When user accepts the suggested merged upgrade value for <field>
Then user should see an ACTIVE CTA to upgrade the prebuilt rule
When user clicks on CTA
Then success message should be displayed after upgrade
And upgraded prebuilt rule should be removed from the table
When user opens rule details page for that prebuilt rule
Then user should see <field> has an upgraded value user accepted
```

**Examples:**

`<field>` is one of

- `data_source`
- `tags`
- `description`
- `references`
- `note`
- `setup`
- `threat_index`
- `new_terms_fields`

#### **Scenario: Customized rule upgrade after preview and accepting edited solvable conflicts (ABC diff case, conflict solvable by diff algo)**

**Automation**: Jest integration test per `<field>` and 1 bulk Cypress test.

```Gherkin
Given a prebuilt rule is installed
And this rule's <field> is customized
And the <field> has an upgrade resulting in a solvable conflict
When user opens the Rule Update Flyout
Then user should see INACTIVE CTA to upgrade the prebuilt rule
And user should see <field> has a conflict
And <field> readonly view with merged value is shown
When user switches <field> to "edit mode"
Then user should see <field> edit form
And <field> edit form has a merged value
When user edits the suggested upgrade value and saves the form
Then user should see an ACTIVE CTA to upgrade the prebuilt rule
When user clicks on CTA
Then success message should be displayed after upgrade
And upgraded prebuilt rule should be removed from the table
When user opens rule details page for that prebuilt rule
Then user should see <field> has an upgraded value user entered and saved in the form
```

**Examples:**

`<field>` is one of

- `data_source`
- `tags`
- `description`
- `references`
- `note`
- `setup`
- `threat_index`
- `new_terms_fields`

#### **Scenario: Customized rule upgrade after preview non-solvable conflicts and accepting suggested field value (ABC diff case, non-solvable by diff algo)**

**Automation**: Jest integration test per \<field\> and 1 bulk Cypress test.

```Gherkin
Given a prebuilt rule is installed
And this rule's <field> is customized
And the <field> has an upgrade resulting to a non-solvable conflict
When user opens the Rule Update Flyout
Then user should see INACTIVE CTA to upgrade the prebuilt rule
And <field> has a conflict
And <field> edit form is shown
And <field> edit form inputs have current customized value
When user saves the form without changes
Then user should see an ACTIVE CTA to upgrade the prebuilt rule
When user clicks on CTA
Then success message should be displayed after upgrade
And upgraded prebuilt rule should be removed from the table
When user opens rule details page for that prebuilt rule
Then user should see <field> has an upgraded value accepted by user
```

**Examples:**

`<field>` = all customizable fields

#### **Scenario: Customized rule upgrade after preview non-solvable conflicts and accepting edited field value (ABC diff case, non-solvable by diff algo)**

**Automation**: Jest integration test per `<field>` and 1 bulk Cypress test.

```Gherkin
Given a prebuilt rule is installed
And this prebuilt rule's <field> is customized
And it has an upgrade resulting to a non-solvable conflict
When user opens the Rule Update Flyout
Then user should see INACTIVE CTA to upgrade the prebuilt rule
And <field> has a conflict
And <field> edit form is shown
And <field> edit form inputs have current customized value
When user edits <field> form and saves it
Then user should see an ACTIVE CTA to upgrade the prebuilt rule
When user clicks on CTA
Then success message should be displayed after upgrade
And upgraded prebuilt rule should be removed from the table
When user opens rule details page for that prebuilt rule
Then user should see <field> has an upgraded value user entered and saved in the form
```

#### **Scenario: Customized rule upgrade after preview solvable conflicts and accepting suggested field value (-AB diff case)**

**Automation**: Jest integration test per \<field\> and 1 bulk Cypress test.

```Gherkin
Given a prebuilt rule is installed
And this rule's <field> is customized
And the <field> has an upgrade resulting to a non-solvable conflict
When user opens the Rule Update Flyout
Then user should see INACTIVE CTA to upgrade the prebuilt rule
And <field> has a conflict
And <field> edit form is shown
And <field> edit form inputs have current customized value
When user saves the form without changes
Then user should see an ACTIVE CTA to upgrade the prebuilt rule
When user clicks on CTA
Then success message should be displayed after upgrade
And upgraded prebuilt rule should be removed from the table
When user opens rule details page for that prebuilt rule
Then user should see <field> has an upgraded value accepted by user
```

**Examples:**

`<field>` = all customizable fields

#### **Scenario: Customized rule upgrade after preview solvable conflicts and accepting edited field value (-AB diff case)**

**Automation**: Jest integration test per `<field>` and 1 bulk Cypress test.

```Gherkin
Given a prebuilt rule is installed
And this prebuilt rule's <field> is customized
And it has an upgrade resulting to a non-solvable conflict
When user opens the Rule Update Flyout
Then user should see INACTIVE CTA to upgrade the prebuilt rule
And <field> has a conflict
And <field> edit form is shown
And <field> edit form inputs have current customized value
When user edits <field> form and saves it
Then user should see an ACTIVE CTA to upgrade the prebuilt rule
When user clicks on CTA
Then success message should be displayed after upgrade
And upgraded prebuilt rule should be removed from the table
When user opens rule details page for that prebuilt rule
Then user should see <field> has an upgraded value user entered and saved in the form
```

**Examples:**

`<field>` = all customizable fields besides always mergeable fields (`tags`, `references`, `threat_index`, `new_terms_fields`)

### Rule type upgrade

#### **Scenario: Non-customized rule upgrade to a different rule type after preview**

**Automation**: 1 Cypress test.

```Gherkin
Given a non-customized prebuilt rule with an upgrade
When user opens the Rule Update Flyout
Then user should see a CTA to upgrade the prebuilt rule
And a warning message saying rule upgrade changes its type
When user clicks on CTA
Then success message should be displayed after upgrade
And upgraded prebuilt rule should be removed from the table
When user opens rule details page for that prebuilt rule
Then user should see <field> has changed its type
And has upgraded field values
```

#### **Scenario: Customized rule upgrade to a different rule type after preview**

**Automation**: 1 Cypress test.

```Gherkin
Given a customized prebuilt rule with an upgrade
When user opens the Rule Update Flyout
Then user should see a CTA to upgrade the prebuilt rule
And a warning message saying rule upgrade changes its type
And user is gonna lose all customizations
When user clicks on CTA
Then success message should be displayed after upgrade
And upgraded prebuilt rule should be removed from the table
When user opens rule details page for that prebuilt rule
Then user should see <field> has changed its type
And has upgraded field values
```

### Concurrency control

> It wasn't possible to test the Concurrency control with Cypress clock mocking. Testing without mocks would require
> waiting for 5 minutes significantly increasing tests duration. We should revisit this after we obtain better e2e
> testing tooling.

#### **Scenario: User gets notified after someone edited the prebuilt rule being previewed**

**Automation**: 1 Cypress test.

```Gherkin
Given a prebuilt rule with an upgrade
And <userA> opened Rule Update Preview
And saved custom field values via field forms
When <userB> edits the same rule providing changed field values
Then <userA> should see a notification that rule has been edited
And saved custom field values got discarded
```

#### **Scenario: User gets notified after a prebuilt new rule version is released**

**Automation**: 1 Cypress test.

```Gherkin
Given a prebuilt rule with an upgrade
And user opened Rule Update Preview
And saved custom field values via field forms
When a new version of the same rule gets available
Then user should see a notification that a new rule version was detected
And saved custom field values got discarded
```

### Licensing

#### **Scenario: User can NOT modify field values in upgrade preview when license is insufficient**

**Automation**: 1 e2e test with a mock rule.

```Gherkin
Given a Kibana instance running under an insufficient license
And a prebuilt rule with an upgrade
When user opens an upgrade preview for this rule
Then user should see a preview of rule field updates
And there should NOT be a possibility to edit any field values
```

#### **Scenario: User is warned about losing their customizations in upgrade preview when license is insufficient**

**Automation**: 1 e2e test with a mock rule.

```Gherkin
Given a Kibana instance running under an insufficient license
And a customized prebuilt rule with an upgrade
And the base version exists for this rule
When user opens an upgrade preview for this rule
Then user should see a warning that their customizations will be lost on upgrade
```

#### **Scenario: Prebuilt rule always gets upgraded to the target version when license is insufficient**

**Automation**: 1 e2e test with a mock rule.

```Gherkin
Given a Kibana instance running under an insufficient license
And a prebuilt rule with an upgrade
And a base version exists for this rule
And this rule is <customization_state>
When user opens an upgrade preview for this rule and clicks on CTA
Then success message should be displayed after upgrade
And the upgraded prebuilt rule should be removed from the table
And all customizable rule fields should be equal to the target version
```

**Examples:**

`<customization_state>` = `customized` | `not customized`
