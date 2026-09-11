# Test plan: importing prebuilt rules <!-- omit from toc -->

**Status**: `implemented`, matches [Milestone 3](https://github.com/elastic/kibana/issues/174168).

> [!TIP]
> If you're new to prebuilt rules, get started [here](./prebuilt_rules.md) and check an overview of the features of prebuilt rules in [this section](./prebuilt_rules_common_info.md#features).

## Summary <!-- omit from toc -->

This is a test plan for the workflows of:

- importing prebuilt non-customized rules
- importing prebuilt customized rules
- importing any mixture of prebuilt and custom rules

from the Rule Management page.

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
  - [Importing a single non-customized prebuilt rule](#importing-a-single-non-customized-prebuilt-rule)
    - [**Scenario: Importing a non-customized prebuilt rule without overwriting**](#scenario-importing-a-non-customized-prebuilt-rule-without-overwriting)
    - [**Scenario: Importing a non-customized rule on top of an installed non-customized rule**](#scenario-importing-a-non-customized-rule-on-top-of-an-installed-non-customized-rule)
    - [**Scenario: Importing a non-customized rule on top of an installed customized rule**](#scenario-importing-a-non-customized-rule-on-top-of-an-installed-customized-rule)
  - [Importing a single customized prebuilt rule](#importing-a-single-customized-prebuilt-rule)
    - [**Scenario: Importing a customized rule without overwriting**](#scenario-importing-a-customized-rule-without-overwriting)
    - [**Scenario: Importing a customized rule on top of an installed non-customized rule**](#scenario-importing-a-customized-rule-on-top-of-an-installed-non-customized-rule)
    - [**Scenario: Importing a customized rule on top of an installed customized rule**](#scenario-importing-a-customized-rule-on-top-of-an-installed-customized-rule)
  - [Importing a single custom rule](#importing-a-single-custom-rule)
    - [**Scenario: Importing a new custom rule**](#scenario-importing-a-new-custom-rule)
    - [**Scenario: Importing a custom rule on top of an existing custom rule**](#scenario-importing-a-custom-rule-on-top-of-an-existing-custom-rule)
  - [Importing multiple rules in bulk](#importing-multiple-rules-in-bulk)
    - [**Scenario: Importing a mixture of new prebuilt and custom rules**](#scenario-importing-a-mixture-of-new-prebuilt-and-custom-rules)
    - [**Scenario: Importing a mixture of prebuilt and custom rules on top of existing rules**](#scenario-importing-a-mixture-of-prebuilt-and-custom-rules-on-top-of-existing-rules)
  - [Importing prebuilt rules when the package is not installed](#importing-prebuilt-rules-when-the-package-is-not-installed)
    - [**Scenario: Importing new prebuilt rules when the package is not installed**](#scenario-importing-new-prebuilt-rules-when-the-package-is-not-installed)
    - [**Scenario: Importing prebuilt rules on top of existing rules when the package is not installed**](#scenario-importing-prebuilt-rules-on-top-of-existing-rules-when-the-package-is-not-installed)
  - [Converting between prebuilt and custom rules](#converting-between-prebuilt-and-custom-rules)
    - [**Scenario: Converting a custom rule to a customized prebuilt rule on import**](#scenario-converting-a-custom-rule-to-a-customized-prebuilt-rule-on-import)
    - [**Scenario: Converting a custom rule to a non-customized prebuilt rule on import**](#scenario-converting-a-custom-rule-to-a-non-customized-prebuilt-rule-on-import)
    - [**Scenario: Converting a prebuilt rule to a custom rule on import**](#scenario-converting-a-prebuilt-rule-to-a-custom-rule-on-import)
    - [**Scenario: Making an imported custom rule upgradeable to a prebuilt rule**](#scenario-making-an-imported-custom-rule-upgradeable-to-a-prebuilt-rule)
  - [Handling historical base versions](#handling-historical-base-versions)
    - [**Scenario: Importing an old rule when it's not installed**](#scenario-importing-an-old-rule-when-its-not-installed)
    - [**Scenario: Importing an old rule on top of an installed rule of the same version**](#scenario-importing-an-old-rule-on-top-of-an-installed-rule-of-the-same-version)
    - [**Scenario: Importing an older rule on top of an installed rule of a newer version**](#scenario-importing-an-older-rule-on-top-of-an-installed-rule-of-a-newer-version)
    - [**Scenario: Importing an newer rule on top of an installed rule of an older version**](#scenario-importing-an-newer-rule-on-top-of-an-installed-rule-of-an-older-version)
  - [Handling missing base versions](#handling-missing-base-versions)
    - [**Scenario: Importing a prebuilt rule with a missing base version when it's not installed**](#scenario-importing-a-prebuilt-rule-with-a-missing-base-version-when-its-not-installed)
    - [**Scenario: Importing a prebuilt rule with a missing base version when it's already installed but not equal to the import payload**](#scenario-importing-a-prebuilt-rule-with-a-missing-base-version-when-its-already-installed-but-not-equal-to-the-import-payload)
    - [**Scenario: Importing a prebuilt rule with a missing base version when it's already installed, is not customized, and is equal to the import payload**](#scenario-importing-a-prebuilt-rule-with-a-missing-base-version-when-its-already-installed-is-not-customized-and-is-equal-to-the-import-payload)
    - [**Scenario: Importing a prebuilt rule with a missing base version when it's already installed, is customized, and is equal to the import payload**](#scenario-importing-a-prebuilt-rule-with-a-missing-base-version-when-its-already-installed-is-customized-and-is-equal-to-the-import-payload)
  - [Handling missing fields in the import request payload](#handling-missing-fields-in-the-import-request-payload)
    - [**Scenario: Importing a prebuilt rule without a `rule_id` field**](#scenario-importing-a-prebuilt-rule-without-a-rule_id-field)
    - [**Scenario: Importing a prebuilt rule with a matching `rule_id` but missing a `version` field**](#scenario-importing-a-prebuilt-rule-with-a-matching-rule_id-but-missing-a-version-field)
    - [**Scenario: Importing a new custom rule missing a `version` field**](#scenario-importing-a-new-custom-rule-missing-a-version-field)
    - [**Scenario: Importing an existing custom rule missing a `version` field**](#scenario-importing-an-existing-custom-rule-missing-a-version-field)
  - [Licensing](#licensing)
    - [**Scenario: Importing a mixture of new prebuilt and custom rules under insufficient license**](#scenario-importing-a-mixture-of-new-prebuilt-and-custom-rules-under-insufficient-license)
    - [**Scenario: Importing a mixture of prebuilt and custom rules on top of existing rules under insufficient license**](#scenario-importing-a-mixture-of-prebuilt-and-custom-rules-on-top-of-existing-rules-under-insufficient-license)

## Useful information

### Tickets

- [Users can Customize Prebuilt Detection Rules](https://github.com/elastic/security-team/issues/1974) (internal)
- [Users can Customize Prebuilt Detection Rules: Milestone 3](https://github.com/elastic/kibana/issues/174168)
- [Allow importing prebuilt rules at the API level](https://github.com/elastic/kibana/issues/180168)
- [Benchmark performance of importing a large number of prebuilt rules](https://github.com/elastic/kibana/issues/195632)
- [Relax the rules of handling missing base versions of prebuilt rules](https://github.com/elastic/kibana/issues/210358)
- [Tests for prebuilt rule import/export workflow](https://github.com/elastic/kibana/issues/202079)

### Terminology

- [Common terminology](./prebuilt_rules_common_info.md#common-terminology).
- **This rule is not installed**: a prebuilt rule with the same `rule_id` hasn't been installed yet and doesn't exist as an alerting rule saved object.
- **This rule is already installed**: a prebuilt rule with the same `rule_id` has been already installed and exists as an alerting rule saved object.
- **This rule is not created yet**: a custom rule with the same `rule_id` hasn't been created yet and doesn't exist as an alerting rule saved object.
- **This rule is already created**: a custom rule with the same `rule_id` has been already created and exists as an alerting rule saved object.
- **This rule has a base version in the installed package**: package with prebuilt rules has been installed, and the rule's `rule_id` and `version` fields match one of the rule assets from this package.
- **This rule has a base version in the latest package**: the rule's `rule_id` and `version` fields match one of the rule assets from the latest version of the package with prebuilt rules. It is likely assumed or stated explicitly that the latest package hasn't been installed yet.
- **Rule should be updated**: the saved object of the rule should be updated by the Alerting Framework; in practice this means, for example, updating the `updated_at` and `updated_by` fields, which can be checked in tests.

## Requirements

### Assumptions

Assumptions about test environments and scenarios outlined in this test plan.

Unless explicitly indicated otherwise:

- [Common assumptions](./prebuilt_rules_common_info.md#common-assumptions).
- Package with prebuilt rules is already installed, and rule assets from it are stored in Elasticsearch.
- The `overwrite` import request parameter is set to `true`.

### Technical requirements

Non-functional requirements for the functionality outlined in this test plan.

- [Common technical requirements](./prebuilt_rules_common_info.md#common-technical-requirements).

### Product requirements

Functional requirements for the functionality outlined in this test plan.

- [Common product requirements](./prebuilt_rules_common_info.md#common-product-requirements).

User stories:

- User can import a single prebuilt rule on the Rule Management page.
- User can import multiple prebuilt rules on the Rule Management page.
- User can import prebuilt non-customized rules.
- User can import prebuilt customized rules.
- User can import any combination of prebuilt non-customized, prebuilt customized, and custom rules.

## Scenarios

### Importing a single non-customized prebuilt rule

#### **Scenario: Importing a non-customized prebuilt rule without overwriting**

**Automation**: 1 API integration test.

```Gherkin
Given the import payload contains a prebuilt rule
And this rule has a base version in the installed package
And this rule is equal to its base version
And this rule is not installed
When the user imports the rule
Then the rule should be created
And the created rule should be prebuilt
And the created rule should be marked as non-customized
And the created rule's parameters should match the import payload
```

#### **Scenario: Importing a non-customized rule on top of an installed non-customized rule**

**Automation**: 1 API integration test.

```Gherkin
Given the import payload contains a prebuilt rule
And this rule has a base version in the installed package
And this rule is equal to its base version
And this rule is already installed and is not customized
When the user imports the rule
Then the rule should be updated
And the updated rule should be prebuilt
And the updated rule should be marked as non-customized
And the updated rule's parameters should match the import payload
```

#### **Scenario: Importing a non-customized rule on top of an installed customized rule**

**Automation**: 1 API integration test.

```Gherkin
Given the import payload contains a prebuilt rule
And this rule has a base version in the installed package
And this rule is equal to its base version
And this rule is already installed and is customized
When the user imports the rule
Then the rule should be updated
And the updated rule should be prebuilt
And the updated rule should be marked as non-customized
And the updated rule's parameters should match the import payload
```

### Importing a single customized prebuilt rule

#### **Scenario: Importing a customized rule without overwriting**

**Automation**: 1 API integration test.

```Gherkin
Given the import payload contains a prebuilt rule
And this rule has a base version in the installed package
And this rule is different from its base version
And this rule is not installed
When the user imports the rule
Then the rule should be created
And the created rule should be prebuilt
And the created rule should be marked as customized
And the created rule's parameters should match the import payload
```

#### **Scenario: Importing a customized rule on top of an installed non-customized rule**

**Automation**: 1 API integration test.

```Gherkin
Given the import payload contains a prebuilt rule
And this rule has a base version in the installed package
And this rule is different from its base version
And this rule is already installed and is not customized
When the user imports the rule
Then the rule should be updated
And the updated rule should be prebuilt
And the updated rule should be marked as customized
And the updated rule's parameters should match the import payload
```

#### **Scenario: Importing a customized rule on top of an installed customized rule**

**Automation**: 1 API integration test.

```Gherkin
Given the import payload contains a prebuilt rule
And this rule has a base version in the installed package
And this rule is different from its base version
And this rule is already installed and is customized
When the user imports the rule
Then the rule should be updated
And the updated rule should be prebuilt
And the updated rule should be marked as customized
And the updated rule's parameters should match the import payload
```

### Importing a single custom rule

#### **Scenario: Importing a new custom rule**

**Automation**: 1 API integration test.

```Gherkin
Given the import payload contains a custom rule
And its rule_id does NOT match any rule assets from the installed package
And this rule is not created yet
When the user imports the rule
Then the rule should be created
And the created rule should be custom
And the created rule's parameters should match the import payload
```

#### **Scenario: Importing a custom rule on top of an existing custom rule**

**Automation**: 1 API integration test.

```Gherkin
Given the import payload contains a custom rule
And its rule_id does NOT match any rule assets from the installed package
And this rule is already created
When the user imports the rule
Then the rule should be updated
And the updated rule should be custom
And the updated rule's parameters should match the import payload
```

### Importing multiple rules in bulk

#### **Scenario: Importing a mixture of new prebuilt and custom rules**

This scenario is a "smoke test" for all the user stories from the [Product requirements](#product-requirements) section.

**Automation**: 1 API integration test, 1 e2e test.

```Gherkin
Given the import payload contains non-customized prebuilt, customized prebuilt, and custom rules
And the prebuilt rules have a base version in the installed package
And the custom rules' rule_id does NOT match any rule assets from the installed package
And the rules are not installed or created yet
When the user imports these rules
Then the rules should be created
And the created rules should be correctly identified as prebuilt or custom
And the created rules' is_customized field should be correctly calculated
And the created rules' customized_fields field should be correctly calculated
And the created rules' parameters should match the import payload
```

#### **Scenario: Importing a mixture of prebuilt and custom rules on top of existing rules**

This scenario is a "smoke test" for all the user stories from the [Product requirements](#product-requirements) section.

**Automation**: 1 API integration test, 1 e2e test.

```Gherkin
Given the import payload contains non-customized prebuilt, customized prebuilt, and custom rules
And the prebuilt rules have a base version in the installed package
And the custom rules' rule_id does NOT match any rule assets from the installed package
And the rules are already installed or created
When the user imports these rules
Then the rules should be updated
And the updated rules should be correctly identified as prebuilt or custom
And the updated rules' is_customized field should be correctly calculated
And the created rules' customized_fields field should be correctly calculated
And the updated rules' parameters should match the import payload
```

### Importing prebuilt rules when the package is not installed

#### **Scenario: Importing new prebuilt rules when the package is not installed**

**Automation**: 1 API integration test.

```Gherkin
Given the import payload contains two prebuilt rules (non-customized + customized)
And these rules have a base version in the latest package
And these rules are not installed yet
And the package is not installed yet
When the user imports the rules
Then the latest package should be installed automatically
And the rules should be created
And the created rules should be prebuilt
And the created rules should be correctly marked as non-customized or customized
And the created rules' parameters should match the import payload
```

#### **Scenario: Importing prebuilt rules on top of existing rules when the package is not installed**

**Automation**: 1 API integration test.

```Gherkin
Given the import payload contains two prebuilt rules (non-customized + customized)
And these rules have a base version in the latest package
And these rules are already installed
And the package has been deleted
When the user imports the rules
Then the latest package should be installed automatically
And the rules should be updated
And the updated rules should be prebuilt
And the updated rules should be correctly marked as non-customized or customized
And the updated rules' parameters should match the import payload
```

### Converting between prebuilt and custom rules

#### **Scenario: Converting a custom rule to a customized prebuilt rule on import**

This is an edge case that can happen when the user manually edits an ndjson file and:

- By mistake, sets `rule_id` and `version` fields of a custom rule to the values of an existing prebuilt rule asset.

**Automation**: 1 API integration test.

```Gherkin
Given the import payload contains a custom rule
And this rule has a base version in the installed package
And this rule is different from its base version
And this rule is not installed
When the user imports the rule
Then the rule should be created
And the created rule should be prebuilt
And the created rule should be marked as customized
And the created rule's parameters should match the import payload
```

#### **Scenario: Converting a custom rule to a non-customized prebuilt rule on import**

This is an edge case that can happen when the user manually edits an ndjson file and:

- By mistake, makes a legit prebuilt rule in it custom by updating the `immutable` and `rule_source` fields.

**Automation**: 1 API integration test.

```Gherkin
Given the import payload contains a custom rule
And this rule has a base version in the installed package
And this rule is equal to its base version
And this rule is not installed
When the user imports the rule
Then the rule should be created
And the created rule should be prebuilt
And the created rule should be marked as non-customized
And the created rule's parameters should match the import payload
```

#### **Scenario: Converting a prebuilt rule to a custom rule on import**

This is an edge case that can happen when the user manually edits an ndjson file and:

- By mistake, makes a legit custom rule in it prebuilt by updating the `immutable` and `rule_source` fields.

**Automation**: 1 API integration test.

```Gherkin
Given the import payload contains a prebuilt rule
And its rule_id does NOT match any rule assets from the installed package
And this rule is not installed
When the user imports the rule
Then the rule should be created
And the created rule should be custom
And the created rule's parameters should match the import payload
```

#### **Scenario: Making an imported custom rule upgradeable to a prebuilt rule**

This is an edge case that can happen when Elastic ships a new prebuilt rule with a `rule_id` accidentally matching the `rule_id` of a user's custom rule.

**Automation**: 1 API integration test.

```Gherkin
Given the import payload contains a custom rule
And its rule_id does NOT match any rule assets from the installed package
And this rule is not installed
When the user imports the rule
Then the rule should be created
And the created rule should be custom
When a new version of the package gets installed
And a new prebuilt rule asset is added in it with the same rule_id and a higher version
Then the rule should be upgradeable to the asset's version as if it were a prebuilt rule
When the user upgrades this rule to the TARGET version
Then the rule should be upgraded to the asset's version
And the upgraded rule should be prebuilt
And the upgraded rule should be marked as non-customized
And the upgraded rule's parameters should match the asset
```

### Handling historical base versions

Importing prebuilt rules which version matches one of the older, historical rule assets from the installed package.

#### **Scenario: Importing an old rule when it's not installed**

**Automation**: 1 API integration test that tests 2 different rules at the same time, one rule per each example.

```Gherkin
Given the import payload contains a prebuilt rule
And this rule has a base version in the installed package which is NOT the latest one
And this rule has newer versions in the installed package
And this rule <is_equal> to its base version
And this rule is not installed
When the user imports the rule
Then the rule should be created
And the created rule should be prebuilt
And the created rule should be marked as <created_customized>
And the created rule's version should match the import payload
And the created rule's parameters should match the import payload
And the created rule should be available for upgrade to its latest version

Examples:
  | is_equal     | created_customized |
  | is equal     | non-customized     |
  | is NOT equal | customized         |
```

#### **Scenario: Importing an old rule on top of an installed rule of the same version**

**Automation**: 1 API integration test that tests 4 different rules at the same time, one rule per each example.

```Gherkin
Given the import payload contains a prebuilt rule
And this rule has a base version in the installed package which is NOT the latest one
And this rule has newer versions in the installed package
And this rule <is_equal> to its base version
And this rule is already installed and is <installed_customized>
And the installed rule's version is equal to the imported rule's version
When the user imports the rule
Then the rule should be updated
And the updated rule should be prebuilt
And the updated rule should be marked as <updated_customized>
And the updated rule's version should stay unchanged
And the updated rule's parameters should match the import payload
And the updated rule should be available for upgrade to its latest version

Examples:
  | is_equal     | installed_customized | updated_customized |
  | is equal     | non-customized       | non-customized     |
  | is equal     | customized           | non-customized     |
  | is NOT equal | non-customized       | customized         |
  | is NOT equal | customized           | customized         |
```

#### **Scenario: Importing an older rule on top of an installed rule of a newer version**

**Automation**: 1 API integration test that tests 4 different rules at the same time, one rule per each example.

```Gherkin
Given the import payload contains a prebuilt rule
And this rule has a base version in the installed package which is NOT the latest one
And this rule has newer versions in the installed package
And this rule <is_equal> to its base version
And this rule is already installed and is <installed_customized>
And the imported rule's version is less than the installed rule's version
When the user imports the rule
Then the rule should be updated
And the updated rule should be prebuilt
And the updated rule should be marked as <updated_customized>
And the updated rule's version should match the import payload
And the updated rule's parameters should match the import payload
And the updated rule should be available for upgrade to its latest version

Examples:
  | is_equal     | installed_customized | updated_customized |
  | is equal     | non-customized       | non-customized     |
  | is equal     | customized           | non-customized     |
  | is NOT equal | non-customized       | customized         |
  | is NOT equal | customized           | customized         |
```

#### **Scenario: Importing an newer rule on top of an installed rule of an older version**

**Automation**: 1 API integration test that tests 4 different rules at the same time, one rule per each example.

```Gherkin
Given the import payload contains a prebuilt rule
And this rule has a base version in the installed package which is NOT the latest one
And this rule has newer versions in the installed package
And this rule <is_equal> to its base version
And this rule is already installed and is <installed_customized>
And the imported rule's version is greater than the installed rule's version
When the user imports the rule
Then the rule should be updated
And the updated rule should be prebuilt
And the updated rule should be marked as <updated_customized>
And the updated rule's version should match the import payload
And the updated rule's parameters should match the import payload
And the updated rule should be available for upgrade to its latest version

Examples:
  | is_equal     | installed_customized | updated_customized |
  | is equal     | non-customized       | non-customized     |
  | is equal     | customized           | non-customized     |
  | is NOT equal | non-customized       | customized         |
  | is NOT equal | customized           | customized         |
```

### Handling missing base versions

NOTE: These are not edge cases but rather normal cases. In many package upgrade scenarios, hundreds of prebuilt rules (out of ~1300 of them at the time of writing) won't have a base version.

**When the base version** of a prebuilt rule that is being imported **is missing** among the `security-rule` asset saved objects, and the user imports this rule, the following scenarios apply.

#### **Scenario: Importing a prebuilt rule with a missing base version when it's not installed**

If this rule is not installed, it should be created with `is_customized` field set to `false`.

**Automation**: 1 API integration test.

```Gherkin
Given the import payload contains a prebuilt rule
And its rule_id matches one or more rule assets from the installed package
And its version does NOT match any of those rule assets
And this rule is not installed yet
When the user imports the rule
Then the rule should be created
And the created rule should be prebuilt
And the created rule should be marked as non-customized
And the created rule's version should match the import payload
And the created rule's parameters should match the import payload
```

#### **Scenario: Importing a prebuilt rule with a missing base version when it's already installed but not equal to the import payload**

If this rule is already installed, it should be updated. Its `is_customized` field should be set to `true` if the rule from the import payload is not equal to the installed rule.

**Automation**: 1 API integration test.

```Gherkin
Given the import payload contains a prebuilt rule
And its rule_id matches one or more rule assets from the installed package
And its version does NOT match any of those rule assets
And this rule is already installed and marked as <customization_state>
And the installed rule is NOT equal to the import payload
When the user imports the rule
Then the rule should be updated
And the updated rule should be prebuilt
And the updated rule should be marked as customized
And the updated rule's version should match the import payload
And the updated rule's parameters should match the import payload
```

**Examples:**

`<customization_state>` = `customized` | `non-customized`

#### **Scenario: Importing a prebuilt rule with a missing base version when it's already installed, is not customized, and is equal to the import payload**

If this rule is already installed, it should be updated. Its `is_customized` field should stay unchanged (`false` or `true`) if the rule from the import payload is equal to the installed rule.

**Automation**: 1 API integration test.

```Gherkin
Given the import payload contains a customized prebuilt rule
And its rule_id matches one or more rule assets from the installed package
And its version does NOT match any of those rule assets
And this rule is already installed and marked as non-customized
And the installed rule is equal to the import payload
When the user imports the rule
Then the rule should be updated
And the updated rule should be prebuilt
And the updated rule should be marked as non-customized
And the updated rule's version should stay unchanged
And the updated rule's parameters should stay unchanged
```

#### **Scenario: Importing a prebuilt rule with a missing base version when it's already installed, is customized, and is equal to the import payload**

If this rule is already installed, it should be updated. Its `is_customized` field should stay unchanged (`false` or `true`) if the rule from the import payload is equal to the installed rule.

**Automation**: 1 API integration test.

```Gherkin
Given the import payload contains a non-customized prebuilt rule
And its rule_id matches one or more rule assets from the installed package
And its version does NOT match any of those rule assets
And this rule is already installed and marked as customized
And the installed rule is equal to the import payload
When the user imports the rule
Then the rule should be updated
And the updated rule should be prebuilt
And the updated rule should be marked as customized
And the updated rule's version should stay unchanged
And the updated rule's parameters should stay unchanged
```

### Handling missing fields in the import request payload

#### **Scenario: Importing a prebuilt rule without a `rule_id` field**

**Automation**: 1 API integration test.

```Gherkin
Given the import payload contains a prebuilt rule without a rule_id field
When the user imports the rule
Then the import should be rejected with a message "rule_id field is required"
```

#### **Scenario: Importing a prebuilt rule with a matching `rule_id` but missing a `version` field**

**Automation**: 1 API integration test.

```Gherkin
Given the import payload contains a prebuilt rule without a version field
And its rule_id matches one or more rule assets from the installed package
When the user imports the rule
Then the import should be rejected with a message "version field is required"
```

#### **Scenario: Importing a new custom rule missing a `version` field**

**Automation**: 1 API integration test.

```Gherkin
Given the import payload contains a custom rule without a version field
And its rule_id does NOT match any rule assets from the installed package
And this rule is not created yet
When the user imports the rule
Then the rule should be created
And the created rule should be custom
And the created rule's "version" field should be set to 1
```

#### **Scenario: Importing an existing custom rule missing a `version` field**

**Automation**: 1 API integration test.

```Gherkin
Given the import payload contains a custom rule without a version field
And its rule_id does NOT match any rule assets from the installed package
And this rule is already created and has "version > 1"
When the user imports the rule
Then the rule should be updated
And the updated rule should be custom
And the updated rule's "version" field should stay unchanged
```

### Licensing

#### **Scenario: Importing a mixture of new prebuilt and custom rules under insufficient license**

**Automation**: 1 API integration test, 1 e2e test.

```Gherkin
Given a Kibana instance running under an insufficient license
And an import payload contains a mix of non-customized prebuilt, customized prebuilt, and custom rules
And the prebuilt rules have a base version in the installed package
And the custom rules' rule_id does NOT match any rule assets from the installed package
And the rules are not installed or created yet
When the user imports these rules
Then the rules should be created
And the created rules should be correctly identified as prebuilt or custom
And the created rules' parameters should match the import payload
```

#### **Scenario: Importing a mixture of prebuilt and custom rules on top of existing rules under insufficient license**

**Automation**: 1 API integration test, 1 e2e test.

```Gherkin
Given a Kibana instance running under an insufficient license
And an import payload contains non-customized prebuilt, customized prebuilt, and custom rules
And the prebuilt rules have a base version in the installed package
And the custom rules' rule_id does NOT match any rule assets from the installed package
And the rules are already installed or created
When the user imports these rules
Then the rules should be updated
And the updated rules should be correctly identified as prebuilt or custom
And the updated rules' parameters should match the import payload
```
