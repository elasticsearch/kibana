# Test plan: diff algorithms for upgrading prebuilt rules <!-- omit from toc -->

**Status**: `in progress`, matches [Milestone 3](https://github.com/elastic/kibana/issues/174168).

> [!TIP]
> If you're new to prebuilt rules, get started [here](./prebuilt_rules.md) and check an overview of the features of prebuilt rules in [this section](./prebuilt_rules_common_info.md#features).

## Summary <!-- omit from toc -->

This is a test plan for the diff algorithms used in the workflows of upgrading prebuilt rules and specifically in the `upgrade/_review` endpoint.

These algorithms determine what fields get returned when a user makes an API request to review changes as a part of the rule upgrade process and determine what version of those fields should be displayed by the UI.

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
  - [Rule field doesn't have an update and has no custom value - `AAA`](#rule-field-doesnt-have-an-update-and-has-no-custom-value---aaa)
    - [**Scenario: `AAA` - Rule field is any type**](#scenario-aaa---rule-field-is-any-type)
  - [Rule field doesn't have an update but has a custom value - `ABA`](#rule-field-doesnt-have-an-update-but-has-a-custom-value---aba)
    - [**Scenario: `ABA` - Rule field is any type except rule `type`**](#scenario-aba---rule-field-is-any-type-except-rule-type)
    - [**Scenario: `ABA` - Rule field is rule `type`**](#scenario-aba---rule-field-is-rule-type)
  - [Rule field has an update and doesn't have a custom value - `AAB`](#rule-field-has-an-update-and-doesnt-have-a-custom-value---aab)
    - [**Scenario: `AAB` - Rule field is any type except rule `type`**](#scenario-aab---rule-field-is-any-type-except-rule-type)
    - [**Scenario: `AAB` - Rule field is rule `type`**](#scenario-aab---rule-field-is-rule-type)
  - [Rule field has an update and a custom value that are the same - `ABB`](#rule-field-has-an-update-and-a-custom-value-that-are-the-same---abb)
    - [**Scenario: `ABB` - Rule field is any type except rule `type`**](#scenario-abb---rule-field-is-any-type-except-rule-type)
    - [**Scenario: `ABB` - Rule field is rule `type`**](#scenario-abb---rule-field-is-rule-type)
  - [Rule field has an update and a custom value that are NOT the same - `ABC`](#rule-field-has-an-update-and-a-custom-value-that-are-not-the-same---abc)
    - [**Scenario: `ABC` - Rule field is rule `type`**](#scenario-abc---rule-field-is-rule-type)
    - [**Scenario: `ABC` - Rule field is a number or single line string**](#scenario-abc---rule-field-is-a-number-or-single-line-string)
    - [**Scenario: `ABC` - Rule field is a mergeable multi line string**](#scenario-abc---rule-field-is-a-mergeable-multi-line-string)
    - [**Scenario: `ABC` - Rule field is a non-mergeable multi line string**](#scenario-abc---rule-field-is-a-non-mergeable-multi-line-string)
    - [**Scenario: `ABC` - Rule field is an array of scalar values**](#scenario-abc---rule-field-is-an-array-of-scalar-values)
    - [**Scenario: `ABC` - Rule field is a solvable `data_source` object**](#scenario-abc---rule-field-is-a-solvable-data_source-object)
    - [**Scenario: `ABC` - Rule field is a non-solvable `data_source` object**](#scenario-abc---rule-field-is-a-non-solvable-data_source-object)
    - [**Scenario: `ABC` - Rule field is a `kql_query`, `eql_query`, or `esql_query` object**](#scenario-abc---rule-field-is-a-kql_query-eql_query-or-esql_query-object)
  - [Rule field has an update and a custom value that are the same and the rule base version doesn't exist - `-AA`](#rule-field-has-an-update-and-a-custom-value-that-are-the-same-and-the-rule-base-version-doesnt-exist----aa)
    - [**Scenario: `-AA` - Rule field is any type**](#scenario--aa---rule-field-is-any-type)
  - [Rule field has an update and a custom value that are NOT the same and the rule base version doesn't exist - `-AB`](#rule-field-has-an-update-and-a-custom-value-that-are-not-the-same-and-the-rule-base-version-doesnt-exist----ab)
    - [**Scenario: `-AB` - Rule field is a number, single line string, multi line string, `data_source` object, `kql_query` object, `eql_query` object, or `esql_query` object**](#scenario--ab---rule-field-is-a-number-single-line-string-multi-line-string-data_source-object-kql_query-object-eql_query-object-or-esql_query-object)
    - [**Scenario: `-AB` - Rule field is an array of scalar values**](#scenario--ab---rule-field-is-an-array-of-scalar-values)
    - [**Scenario: `-AB` - Rule field is a solvable `data_source` object**](#scenario--ab---rule-field-is-a-solvable-data_source-object)
    - [**Scenario: `-AB` - Rule field is a non-solvable `data_source` object**](#scenario--ab---rule-field-is-a-non-solvable-data_source-object)
    - [**Scenario: `-AB` - Rule field is rule `type`**](#scenario--ab---rule-field-is-rule-type)

## Useful information

### Tickets

- [Users can Customize Prebuilt Detection Rules](https://github.com/elastic/security-team/issues/1974) (internal)
- [Users can Customize Prebuilt Detection Rules: Milestone 3](https://github.com/elastic/kibana/issues/174168)
- [Implement number diff algorithm](https://github.com/elastic/kibana/issues/180160)
- [Implement single-line string diff algorithm](https://github.com/elastic/kibana/issues/180158)
- [Implement multi-line string diff algorithm](https://github.com/elastic/kibana/issues/180159)
- [Implement array of scalar values diff algorithm](https://github.com/elastic/kibana/issues/180162)
- [Implement data source fields diff algorithm](https://github.com/elastic/kibana/issues/187659)
- [Implement query fields diff algorithms](https://github.com/elastic/kibana/issues/187658)
- [Implement `concurrent_searches` and `items_per_search` fields diff algorithms](https://github.com/elastic/kibana/issues/188061)
- [Implement rule type diff algorithm](https://github.com/elastic/kibana/issues/190482)
- [Tests for prebuilt rule customization workflow](https://github.com/elastic/kibana/issues/202068)
- [Tests for prebuilt rule upgrade workflow](https://github.com/elastic/kibana/issues/202078)

### Terminology

- [Common terminology](./prebuilt_rules_common_info.md#common-terminology).
- **Grouped fields**
  - `data_source`: an object that contains a `type` field with a value of `data_view_id` or `index_patterns` and another field that's either `data_view_id` of type string OR `index_patterns` of type string array
  - `kql_query`: an object that contains a `type` field with a value of `inline_query` or `saved_query` and other fields based on whichever type is defined. If it's `inline_query`, the object contains a `query` string field, a `language` field that's either `kuery` or `lucene`, and a `filters` field which is an array of kibana filters. If the type field is `saved_query`, the object only contains a `saved_query_id` string field.
  - `eql_query`: an object that contains a `query` string field, a `language` field that always has the value: `eql`, and a `filters` field that contains an array of kibana filters.
  - `esql_query`: an object that contains a `query` string field and a `language` field that always has the value: `esql`.

## Requirements

### Assumptions

Assumptions about test environments and scenarios outlined in this test plan.

- [Common assumptions](./prebuilt_rules_common_info.md#common-assumptions).
- All scenarios will contain at least 1 prebuilt rule installed in Kibana.
- A new version will be available for rule(s).

### Technical requirements

Non-functional requirements for the functionality outlined in this test plan.

- [Common technical requirements](./prebuilt_rules_common_info.md#common-technical-requirements).

### Product requirements

Functional requirements for the functionality outlined in this test plan.

- [Common product requirements](./prebuilt_rules_common_info.md#common-product-requirements).

## Scenarios

### Rule field doesn't have an update and has no custom value - `AAA`

#### **Scenario: `AAA` - Rule field is any type**

**Automation**: 11 integration tests with mock rules + a set of unit tests for each algorithm

```Gherkin
Given <field_name> field is not customized by the user (current version == base version)
And <field_name> field is not updated by Elastic in this upgrade (target version == base version)
Then for <field_name> field the diff algorithm should output the current version as the merged one without a conflict
And <field_name> field should not be returned from the `upgrade/_review` API endpoint
And <field_name> field should not be shown in the upgrade preview UI

Examples:
| algorithm          | field_name  | base_version                                                                         | current_version                                                                      | target_version                                                                       | merged_version                                                                       |
| rule type          | type        | "query"                                                                              | "query"                                                                              | "query"                                                                              | "query"                                                                              |
| single line string | name        | "A"                                                                                  | "A"                                                                                  | "A"                                                                                  | "A"                                                                                  |
| multi line string  | description | "My description.\nThis is a second line."                                            | "My description.\nThis is a second line."                                            | "My description.\nThis is a second line."                                            | "My description.\nThis is a second line."                                            |
| number             | risk_score  | 1                                                                                    | 1                                                                                    | 1                                                                                    | 1                                                                                    |
| array of scalars   | tags        | ["one", "two", "three"]                                                              | ["one", "three", "two"]                                                              | ["three", "one", "two"]                                                              | ["one", "three", "two"]                                                              |
| data_source        | data_source | {type: "index_patterns", "index_patterns": ["one", "two", "three"]}                  | {type: "index_patterns", "index_patterns": ["one", "two", "three"]}                  | {type: "index_patterns", "index_patterns": ["one", "two", "three"]}                  | {type: "index_patterns", "index_patterns": ["one", "two", "three"]}                  |
| data_source        | data_source | {type: "data_view", "data_view_id": "A"}                                             | {type: "data_view", "data_view_id": "A"}                                             | {type: "data_view", "data_view_id": "A"}                                             | {type: "data_view", "data_view_id": "A"}                                             |
| kql_query          | kql_query   | {type: "inline_query", query: "query string = true", language: "kuery", filters: []} | {type: "inline_query", query: "query string = true", language: "kuery", filters: []} | {type: "inline_query", query: "query string = true", language: "kuery", filters: []} | {type: "inline_query", query: "query string = true", language: "kuery", filters: []} |
| kql_query          | kql_query   | {type: "saved_query", saved_query_id: 'saved-query-id'}                              | {type: "saved_query", saved_query_id: 'saved-query-id'}                              | {type: "saved_query", saved_query_id: 'saved-query-id'}                              | {type: "saved_query", saved_query_id: 'saved-query-id'}                              |
| eql_query          | eql_query   | {query: "query where true", language: "eql", filters: []}                            | {query: "query where true", language: "eql", filters: []}                            | {query: "query where true", language: "eql", filters: []}                            | {query: "query where true", language: "eql", filters: []}                            |
| esql_query         | esql_query  | {query: "FROM query WHERE true", language: "esql"}                                   | {query: "FROM query WHERE true", language: "esql"}                                   | {query: "FROM query WHERE true", language: "esql"}                                   | {query: "FROM query WHERE true", language: "esql"}                                   |
```

### Rule field doesn't have an update but has a custom value - `ABA`

#### **Scenario: `ABA` - Rule field is any type except rule `type`**

**Automation**: 10 integration tests with mock rules + a set of unit tests for each algorithm

```Gherkin
Given <field_name> field is customized by the user (current version != base version)
And <field_name> field is not updated by Elastic in this upgrade (target version == base version)
Then for <field_name> field the diff algorithm should output the current version as the merged one without a conflict
And <field_name> field should be returned from the `upgrade/_review` API endpoint
And <field_name> field should be shown in the upgrade preview UI

Examples:
| algorithm          | field_name  | base_version                                                                         | current_version                                                                       | target_version                                                                       | merged_version                                                                        |
| single line string | name        | "A"                                                                                  | "B"                                                                                   | "A"                                                                                  | "B"                                                                                   |
| multi line string  | description | "My description.\nThis is a second line."                                            | "My GREAT description.\nThis is a second line."                                       | "My description.\nThis is a second line."                                            | "My GREAT description.\nThis is a second line."                                       |
| number             | risk_score  | 1                                                                                    | 2                                                                                     | 1                                                                                    | 2                                                                                     |
| array of scalars   | tags        | ["one", "two", "three"]                                                              | ["one", "two", "four"]                                                                | ["one", "two", "three"]                                                              | ["one", "two", "four"]                                                                |
| data_source        | data_source | {type: "index_patterns", "index_patterns": ["one", "two", "three"]}                  | {type: "data_view", "data_view_id": "A"}                                              | {type: "index_patterns", "index_patterns": ["one", "two", "three"]}                  | {type: "data_view", "data_view_id": "A"}                                              |
| data_source        | data_source | {type: "data_view", "data_view_id": "A"}                                             | {type: "index_patterns", "index_patterns": ["one", "two", "three"]}                   | {type: "data_view", "data_view_id": "A"}                                             | {type: "index_patterns", "index_patterns": ["one", "two", "three"]}                   |
| kql_query          | kql_query   | {type: "inline_query", query: "query string = true", language: "kuery", filters: []} | {type: "inline_query", query: "query string = false", language: "kuery", filters: []} | {type: "inline_query", query: "query string = true", language: "kuery", filters: []} | {type: "inline_query", query: "query string = false", language: "kuery", filters: []} |
| kql_query          | kql_query   | {type: "saved_query", saved_query_id: 'saved-query-id'}                              | {type: "saved_query", saved_query_id: 'new-saved-query-id'}                           | {type: "saved_query", saved_query_id: 'saved-query-id'}                              | {type: "saved_query", saved_query_id: 'new-saved-query-id'}                           |
| eql_query          | eql_query   | {query: "query where true", language: "eql", filters: []}                            | {query: "query where false", language: "eql", filters: []}                            | {query: "query where true", language: "eql", filters: []}                            | {query: "query where false", language: "eql", filters: []}                            |
| esql_query         | esql_query  | {query: "FROM query WHERE true", language: "esql"}                                   | {query: "FROM query WHERE false", language: "esql"}                                   | {query: "FROM query WHERE true", language: "esql"}                                   | {query: "FROM query WHERE false", language: "esql"}                                   |
```

#### **Scenario: `ABA` - Rule field is rule `type`**

**Automation**: 1 integration test with mock rules + a set of unit tests for each algorithm

```Gherkin
Given <field_name> field is customized by the user (current version != base version)
And <field_name> field is not updated by Elastic in this upgrade (target version == base version)
Then for <field_name> field the diff algorithm should output the target version as the merged one with a non-solvable conflict
And <field_name> field should be returned from the `upgrade/_review` API endpoint
And <field_name> field should be shown in the upgrade preview UI

Examples:
| algorithm | field_name | base_version | current_version | target_version | merged_version |
| rule type | type       | "query"      | "saved_query"   | "query"        | "query"        |
```

Notes: `type` field can only be changed between `query` and `saved_query` rule types in the UI and API via normal conventions, but the logic for others is still covered

### Rule field has an update and doesn't have a custom value - `AAB`

#### **Scenario: `AAB` - Rule field is any type except rule `type`**

**Automation**: 10 integration tests with mock rules + a set of unit tests for each algorithm

```Gherkin
Given <field_name> field is not customized by the user (current version == base version)
And <field_name> field is updated by Elastic in this upgrade (target version != base version)
Then for <field_name> field the diff algorithm should output the target version as the merged one without a conflict
And <field_name> field should be returned from the `upgrade/_review` API endpoint
And <field_name> field should be shown in the upgrade preview UI

Examples:
| algorithm          | field_name  | base_version                                                                         | current_version                                                                      | target_version                                                                       | merged_version                                                                       |
| single line string | name        | "A"                                                                                  | "A"                                                                                  | "B"                                                                                  | "B"                                                                                  |
| multi line string  | description | "My description.\nThis is a second line."                                            | "My description.\nThis is a second line."                                            | "My GREAT description.\nThis is a second line."                                      | "My GREAT description.\nThis is a second line."                                      |
| number             | risk_score  | 1                                                                                    | 1                                                                                    | 2                                                                                    | 2                                                                                    |
| array of scalars   | tags        | ["one", "two", "three"]                                                              | ["one", "two", "three"]                                                              | ["one", "two", "four"]                                                               | ["one", "two", "four"]                                                               |
| data_source        | data_source | {type: "index_patterns", "index_patterns": ["one", "two", "three"]}                  | {type: "index_patterns", "index_patterns": ["one", "two", "three"]}                  | {type: "data_view", "data_view_id": "A"}                                             | {type: "data_view", "data_view_id": "A"}                                             |
| data_source        | data_source | {type: "data_view", "data_view_id": "A"}                                             | {type: "data_view", "data_view_id": "A"}                                             | {type: "index_patterns", "index_patterns": ["one", "two", "three"]}                  | {type: "index_patterns", "index_patterns": ["one", "two", "three"]}                  |
| kql_query          | kql_query   | {type: "inline_query", query: "query string = true", language: "kuery", filters: []} | {type: "inline_query", query: "query string = true", language: "kuery", filters: []} | {type: "saved_query", saved_query_id: 'saved-query-id'}                              | {type: "saved_query", saved_query_id: 'saved-query-id'}                              |
| kql_query          | kql_query   | {type: "saved_query", saved_query_id: 'saved-query-id'}                              | {type: "saved_query", saved_query_id: 'saved-query-id'}                              | {type: "inline_query", query: "query string = true", language: "kuery", filters: []} | {type: "inline_query", query: "query string = true", language: "kuery", filters: []} |
| eql_query          | eql_query   | {query: "query where true", language: "eql", filters: []}                            | {query: "query where true", language: "eql", filters: []}                            | {query: "query where true", language: "eql", filters: [{ field: 'some query' }]}     | {query: "query where true", language: "eql", filters: [{ field: 'some query' }]}     |
| esql_query         | esql_query  | {query: "FROM query WHERE true", language: "esql"}                                   | {query: "FROM query WHERE true", language: "esql"}                                   | {query: "FROM query WHERE false", language: "esql"}                                  | {query: "FROM query WHERE false", language: "esql"}                                  |
```

#### **Scenario: `AAB` - Rule field is rule `type`**

**Automation**: 1 integration test with mock rules + a set of unit tests for each algorithm

```Gherkin
Given <field_name> field is not customized by the user (current version == base version)
And <field_name> field is updated by Elastic in this upgrade (target version != base version)
Then for <field_name> field the diff algorithm should output the target version as the merged one with a  non-solvable conflict
And <field_name> field should be returned from the `upgrade/_review` API endpoint
And <field_name> field should be shown in the upgrade preview UI

Examples:
| algorithm | field_name | base_version | current_version | target_version | merged_version |
| rule type | type       | "query"      | "query"         | "saved_query"  | "saved_query"  |
```

Notes: `type` field can only be changed between `query` and `saved_query` rule types in the UI and API via normal conventions, but the logic for others is still covered

### Rule field has an update and a custom value that are the same - `ABB`

#### **Scenario: `ABB` - Rule field is any type except rule `type`**

**Automation**: 10 integration tests with mock rules + a set of unit tests for each algorithm

```Gherkin
Given <field_name> field is customized by the user (current version != base version)
And <field_name> field is updated by Elastic in this upgrade (target version != base version)
And customized <field_name> field is the same as the Elastic update in this upgrade (current version == target version)
Then for <field_name> field the diff algorithm should output the current version as the merged one without a conflict
And <field_name> field should be returned from the `upgrade/_review` API endpoint
And <field_name> field should be shown in the upgrade preview UI

Examples:
| algorithm          | field_name  | base_version                                                                         | current_version                                                                       | target_version                                                                        | merged_version                                                                        |
| single line string | name        | "A"                                                                                  | "B"                                                                                   | "B"                                                                                   | "B"                                                                                   |
| multi line string  | description | "My description.\nThis is a second line."                                            | "My GREAT description.\nThis is a second line."                                       | "My GREAT description.\nThis is a second line."                                       | "My GREAT description.\nThis is a second line."                                       |
| number             | risk_score  | 1                                                                                    | 2                                                                                     | 2                                                                                     | 2                                                                                     |
| array of scalars   | tags        | ["one", "two", "three"]                                                              | ["one", "two", "four"]                                                                | ["one", "two", "four"]                                                                | ["one", "two", "four"]                                                                |
| data_source        | data_source | {type: "index_patterns", "index_patterns": ["one", "two", "three"]}                  | {type: "data_view", "data_view_id": "A"}                                              | {type: "data_view", "data_view_id": "A"}                                              | {type: "data_view", "data_view_id": "A"}                                              |
| data_source        | data_source | {type: "data_view", "data_view_id": "A"}                                             | {type: "index_patterns", "index_patterns": ["one", "two", "three"]}                   | {type: "index_patterns", "index_patterns": ["one", "two", "three"]}                   | {type: "index_patterns", "index_patterns": ["one", "two", "three"]}                   |
| kql_query          | kql_query   | {type: "inline_query", query: "query string = true", language: "kuery", filters: []} | {type: "inline_query", query: "query string = true", language: "lucene", filters: []} | {type: "inline_query", query: "query string = true", language: "lucene", filters: []} | {type: "inline_query", query: "query string = true", language: "lucene", filters: []} |
| kql_query          | kql_query   | {type: "saved_query", saved_query_id: 'saved-query-id'}                              | {type: "saved_query", saved_query_id: 'new-saved-query-id'}                           | {type: "saved_query", saved_query_id: 'new-saved-query-id'}                           | {type: "saved_query", saved_query_id: 'new-saved-query-id'}                           |
| eql_query          | eql_query   | {query: "query where true", language: "eql", filters: []}                            | {query: "query where false", language: "eql", filters: []}                            | {query: "query where false", language: "eql", filters: []}                            | {query: "query where false", language: "eql", filters: []}                            |
| esql_query         | esql_query  | {query: "FROM query WHERE true", language: "esql"}                                   | {query: "FROM query WHERE false", language: "esql"}                                   | {query: "FROM query WHERE false", language: "esql"}                                   | {query: "FROM query WHERE false", language: "esql"}                                   |
```

#### **Scenario: `ABB` - Rule field is rule `type`**

**Automation**: 1 integration test with mock rules + a set of unit tests for each algorithm

```Gherkin
Given <field_name> field is customized by the user (current version != base version)
And <field_name> field is updated by Elastic in this upgrade (target version != base version)
And customized <field_name> field is the same as the Elastic update in this upgrade (current version == target version)
Then for <field_name> field the diff algorithm should output the target version as the merged one with a non-solvable conflict
And <field_name> field should be returned from the `upgrade/_review` API endpoint
And <field_name> field should be shown in the upgrade preview UI

Examples:
| algorithm | field_name | base_version | current_version | target_version | merged_version |
| rule type | type       | "query"      | "saved_query"   | "saved_query"  | "saved_query"  |
```

Notes: `type` field can only be changed between `query` and `saved_query` rule types in the UI and API via normal conventions, but the logic for others is still covered

### Rule field has an update and a custom value that are NOT the same - `ABC`

#### **Scenario: `ABC` - Rule field is rule `type`**

**Automation**: 1 integration test with mock rules + a set of unit tests for the algorithms

```Gherkin
Given <field_name> field is customized by the user (current version != base version)
And <field_name> field is updated by Elastic in this upgrade (target version != base version)
And customized <field_name> field is different than the Elastic update in this upgrade (current version != target version)
Then for <field_name> field the diff algorithm should output the target version as the merged one with a non-solvable conflict
And <field_name> field should be returned from the `upgrade/_review` API endpoint
And <field_name> field should be shown in the upgrade preview UI

Examples:
| algorithm | field_name | base_version | current_version | target_version | merged_version |
| rule type | type       | "query"      | "saved_query"   | "threshold"    | "threshold"    |
```

Notes: `type` field can only be changed between `query` and `saved_query` rule types in the UI and API via normal conventions, but the logic for others is still covered. This test case scenario cannot currently be reached.

#### **Scenario: `ABC` - Rule field is a number or single line string**

**Automation**: 2 integration tests with mock rules + a set of unit tests for the algorithms

```Gherkin
Given <field_name> field is customized by the user (current version != base version)
And <field_name> field is updated by Elastic in this upgrade (target version != base version)
And customized <field_name> field is different than the Elastic update in this upgrade (current version != target version)
Then for <field_name> field the diff algorithm should output the current version as the merged one with a non-solvable conflict
And <field_name> field should be returned from the `upgrade/_review` API endpoint
And <field_name> field should be shown in the upgrade preview UI

Examples:
| algorithm          | field_name | base_version | current_version | target_version  | merged_version |
| single line string | name       | "A"          | "B"             | "C"             | "B"            |
| number             | risk_score | 1            | 2               | 3               | 2              |
```

#### **Scenario: `ABC` - Rule field is a mergeable multi line string**

**Automation**: 2 integration tests with mock rules + a set of unit tests for the algorithms

```Gherkin
Given <field_name> field is customized by the user (current version != base version)
And <field_name> field is updated by Elastic in this upgrade (target version != base version)
And customized <field_name> field is different than the Elastic update in this upgrade (current version != target version)
And the 3-way diff of <field_name> fields are determined to be mergeable
Then for <field_name> field the diff algorithm should output a merged version as the merged one with a solvable conflict
And <field_name> field should be returned from the `upgrade/_review` API endpoint
And <field_name> field should be shown in the upgrade preview UI

Examples:
| algorithm         | field_name  | base_version                              | current_version                                 | target_version                                        | merged_version                                              |
| multi line string | description | "My description.\nThis is a second line." | "My GREAT description.\nThis is a second line." | "My description.\nThis is a second line, now longer." | "My GREAT description.\nThis is a second line, now longer." |
```

#### **Scenario: `ABC` - Rule field is a non-mergeable multi line string**

**Automation**: 2 integration tests with mock rules + a set of unit tests for the algorithms

```Gherkin
Given <field_name> field is customized by the user (current version != base version)
And <field_name> field is updated by Elastic in this upgrade (target version != base version)
And customized <field_name> field is different than the Elastic update in this upgrade (current version != target version)
And the 3-way diff of <field_name> fields are determined to be unmergeable
Then for <field_name> field the diff algorithm should output the current version as the merged one with a non-solvable conflict
And <field_name> field should be returned from the `upgrade/_review` API endpoint
And <field_name> field should be shown in the upgrade preview UI

Examples:
| algorithm         | field_name  | base_version                              | current_version                                 | target_version                                 | merged_version                                 |
| multi line string | description | "My description.\nThis is a second line." | "My GREAT description.\nThis is a third line."  | "My EXCELLENT description.\nThis is a fourth." | "My GREAT description.\nThis is a third line." |
```

#### **Scenario: `ABC` - Rule field is an array of scalar values**

**Automation**: 5 integration tests with mock rules + a set of unit tests for the algorithm

```Gherkin
Given <field_name> field is customized by the user (current version != base version)
And <field_name> field is updated by Elastic in this upgrade (target version != base version)
And customized <field_name> field is different than the Elastic update in this upgrade (current version != target version)
Then for <field_name> field the diff algorithm should output a custom merged version with a solvable conflict
And arrays should be deduplicated before comparison
And arrays should be compared sensitive of case
And arrays should be compared agnostic of order
And <field_name> field should be returned from the `upgrade/_review` API endpoint
And <field_name> field should be shown in the upgrade preview UI

Examples:
| algorithm        | field_name | base_version                          | current_version         | target_version                   | merged_version                   |
| array of scalars | tags       | ["one", "two", "three"]               | ["one", "two", "four"]  | ["one", "two", "five"]           | ["one", "two", "four", "five"]   |
| array of scalars | tags       | ["one", "two", "three"]               | ["two", "one"]          | ["one", "four"]                  | ["one", "four"]                  |
| array of scalars | tags       | ["one", "two", "three"]               | []                      | ["one", "two", "five"]           | ["five"]                         |
| array of scalars | tags       | ["one", "two", "two"]                 | ["two", "one", "three"] | ["three", "three", "one"]        | ["one", "three"]                 |
| array of scalars | index      | ["logs-*", "endgame-*", "endpoint-*"] | ["Logs-*", "endgame-*"] | ["logs-*", "endgame-*", "new-*"] | ["Logs-*", "endgame-*", "new-*"] |
| array of scalars | index      | ["logs-*"]                            | ["logs-*", "Logs-*"]    | ["logs-*", "new-*"]              | ["logs-*", "Logs-*", "new-*"]    |
```

#### **Scenario: `ABC` - Rule field is a solvable `data_source` object**

**Automation**: 2 integration tests with mock rules + a set of unit tests for the algorithm

```Gherkin
Given data_source field is customized by the user (current version != base version)
And data_source field is updated by Elastic in this upgrade (target version != base version)
And customized data_source field is different than the Elastic update in this upgrade (current version != target version)
And both current version and target version are of type "index_patterns" in data_source
Then for data_source field the diff algorithm should output a custom merged version with a solvable conflict
And arrays should be deduplicated before comparison
And arrays should be compared sensitive of case
And arrays should be compared agnostic of order
And data_source field should be returned from the `upgrade/_review` API endpoint
And data_source field should be shown in the upgrade preview UI

Examples:
| algorithm    | base_version                                                        | current_version                                                            | target_version                                                     | merged_version                                                              |
| data_source  | {type: "index_patterns", "index_patterns": ["one", "two", "three"]} | {type: "index_patterns", "index_patterns": ["two", "one", "four"]}         | {type: "index_patterns", "index_patterns": ["one", "two", "five"]} | {type: "index_patterns", "index_patterns": ["one", "two", "four", "five"]}  |
| data_source  | {type: "data_view", "data_view_id": "A"}                            | {type: "index_patterns", "index_patterns": ["one", "one", "two", "three"]} | {type: "index_patterns", "index_patterns": ["one", "two", "five"]} | {type: "index_patterns", "index_patterns": ["one", "two", "three", "five"]} |
```

#### **Scenario: `ABC` - Rule field is a non-solvable `data_source` object**

**Automation**: 6 integration tests with mock rules + a set of unit tests for the algorithm

```Gherkin
Given data_source field is customized by the user (current version != base version)
And data_source field is updated by Elastic in this upgrade (target version != base version)
And customized data_source field is different than the Elastic update in this upgrade (current version != target version)
Then for data_source field the diff algorithm should output the current version as the merged version with a non-solvable conflict
And data_source field should be returned from the `upgrade/_review` API endpoint
And data_source field should be shown in the upgrade preview UI

Examples:
| algorithm    | base_version                                                        | current_version                                                     | target_version                                                      | merged_version                                                      |
| data_source  | {type: "data_view", "data_view_id": "A"}                            | {type: "data_view", "data_view_id": "B"}                            | {type: "data_view", "data_view_id": "C"}                            | {type: "data_view", "data_view_id": "B"}                            |
| data_source  | {type: "index_patterns", "index_patterns": ["one", "two", "three"]} | {type: "data_view", "data_view_id": "A"}                            | {type: "data_view", "data_view_id": "B"}                            | {type: "data_view", "data_view_id": "A"}                            |
| data_source  | {type: "data_view", "data_view_id": "A"}                            | {type: "index_patterns", "index_patterns": ["one", "two", "three"]} | {type: "data_view", "data_view_id": "B"}                            | {type: "index_patterns", "index_patterns": ["one", "two", "three"]} |
| data_source  | {type: "data_view", "data_view_id": "A"}                            | {type: "data_view", "data_view_id": "B"}                            | {type: "index_patterns", "index_patterns": ["one", "two", "three"]} | {type: "data_view", "data_view_id": "B"}                            |
| data_source  | {type: "index_patterns", "index_patterns": ["one", "two", "three"]} | {type: "index_patterns", "index_patterns": ["one", "two", "four"]}  | {type: "data_view", "data_view_id": "C"}                            | {type: "index_patterns", "index_patterns": ["one", "two", "four"]}  |
| data_source  | {type: "index_patterns", "index_patterns": ["one", "two", "three"]} | {type: "data_view", "data_view_id": "A"}                            | {type: "index_patterns", "index_patterns": ["one", "two", "five"]}  | {type: "data_view", "data_view_id": "A"}                            |
```

#### **Scenario: `ABC` - Rule field is a `kql_query`, `eql_query`, or `esql_query` object**

**Automation**: 4 integration tests with mock rules + a set of unit tests for the algorithms

```Gherkin
Given <field_name> field is customized by the user (current version != base version)
And <field_name> field is updated by Elastic in this upgrade (target version != base version)
And customized <field_name> field is different than the Elastic update in this upgrade (current version != target version)
Then for <field_name> field the diff algorithm should output the current version as the merged one with a non-solvable conflict
And <field_name> field should be returned from the `upgrade/_review` API endpoint
And <field_name> field should be shown in the upgrade preview UI

Examples:
| algorithm  | field_name  | base_version                                                                         | current_version                                                                      | target_version                                                                        | merged_version                                                                       |
| kql_query  | kql_query   | {type: "inline_query", query: "query string = true", language: "kuery", filters: []} | {type: "saved_query", saved_query_id: 'saved-query-id'}                              | {type: "inline_query", query: "query string = false", language: "kuery", filters: []} | {type: "saved_query", saved_query_id: 'saved-query-id'}                              |
| kql_query  | kql_query   | {type: "saved_query", saved_query_id: 'saved-query-id'}                              | {type: "inline_query", query: "query string = true", language: "kuery", filters: []} | {type: "saved_query", saved_query_id: 'new-saved-query-id'}                           | {type: "inline_query", query: "query string = true", language: "kuery", filters: []} |
| eql_query  | eql_query   | {query: "query where true", language: "eql", filters: []}                            | {query: "query where true", language: "eql", filters: [{ field: 'some query' }]}     | {query: "query where false", language: "eql", filters: []}                            | {query: "query where true", language: "eql", filters: [{ field: 'some query' }]}     |
| esql_query | esql_query  | {query: "FROM query WHERE true", language: "esql"}                                   | {query: "FROM query WHERE false", language: "esql"}                                  | {query: "FROM different query WHERE true", language: "esql"}                          | {query: "FROM query WHERE false", language: "esql"}                                  |
```

### Rule field has an update and a custom value that are the same and the rule base version doesn't exist - `-AA`

#### **Scenario: `-AA` - Rule field is any type**

**Automation**: 11 integration tests with mock rules + a set of unit tests for each algorithm

```Gherkin
Given at least 1 installed prebuilt rule has a new version available
And the base version of the rule cannot be determined
And customized <field_name> field is the same as the Elastic update in this upgrade (current version == target version)
Then for <field_name> field the diff algorithm should output the current version as the merged one without a conflict
And <field_name> field should not be returned from the `upgrade/_review` API endpoint
And <field_name> field should not be shown in the upgrade preview UI

Examples:
| algorithm          | field_name  | base_version | current_version                                                                      | target_version                                                                       | merged_version                                                                       |
| rule type          | type        | N/A          | "query"                                                                              | "query"                                                                              | "query"                                                                              |
| single line string | name        | N/A          | "A"                                                                                  | "A"                                                                                  | "A"                                                                                  |
| multi line string  | description | N/A          | "My description.\nThis is a second line."                                            | "My description.\nThis is a second line."                                            | "My description.\nThis is a second line."                                            |
| number             | risk_score  | N/A          | 1                                                                                    | 1                                                                                    | 1                                                                                    |
| array of scalars   | tags        | N/A          | ["one", "three", "two"]                                                              | ["three", "one", "two"]                                                              | ["one", "three", "two"]                                                              |
| data_source        | data_source | N/A          | {type: "index_patterns", "index_patterns": ["one", "two", "three"]}                  | {type: "index_patterns", "index_patterns": ["one", "two", "three"]}                  | {type: "index_patterns", "index_patterns": ["one", "two", "three"]}                  |
| data_source        | data_source | N/A          | {type: "data_view", "data_view_id": "A"}                                             | {type: "data_view", "data_view_id": "A"}                                             | {type: "data_view", "data_view_id": "A"}                                             |
| kql_query          | kql_query   | N/A          | {type: "inline_query", query: "query string = true", language: "kuery", filters: []} | {type: "inline_query", query: "query string = true", language: "kuery", filters: []} | {type: "inline_query", query: "query string = true", language: "kuery", filters: []} |
| kql_query          | kql_query   | N/A          | {type: "saved_query", saved_query_id: 'saved-query-id'}                              | {type: "saved_query", saved_query_id: 'saved-query-id'}                              | {type: "saved_query", saved_query_id: 'saved-query-id'}                              |
| eql_query          | eql_query   | N/A          | {query: "query where true", language: "eql", filters: []}                            | {query: "query where true", language: "eql", filters: []}                            | {query: "query where true", language: "eql", filters: []}                            |
| esql_query         | esql_query  | N/A          | {query: "FROM query WHERE true", language: "esql"}                                   | {query: "FROM query WHERE true", language: "esql"}                                   | {query: "FROM query WHERE true", language: "esql"}                                   |
```

### Rule field has an update and a custom value that are NOT the same and the rule base version doesn't exist - `-AB`

#### **Scenario: `-AB` - Rule field is a number, single line string, multi line string, `data_source` object, `kql_query` object, `eql_query` object, or `esql_query` object**

**Automation**: 8 integration tests with mock rules + a set of unit tests for the algorithms

```Gherkin
Given at least 1 installed prebuilt rule has a new version available
And the base version of the rule cannot be determined
And customized <field_name> field is different than the Elastic update in this upgrade (current version != target version)
Then for <field_name> field the diff algorithm should output the target version as the merged one with a solvable conflict
And <field_name> field should be returned from the `upgrade/_review` API endpoint
And <field_name> field should be shown in the upgrade preview UI

Examples:
| algorithm          | field_name  | base_version | current_version                                                                      | target_version                                                                        | merged_version                                                                        |
| single line string | name        | N/A          | "B"                                                                                  | "C"                                                                                   | "C"                                                                                   |
| multi line string  | description | N/A          | "My description.\nThis is a second line."                                            | "My GREAT description.\nThis is a second line."                                       | "My GREAT description.\nThis is a second line."                                       |
| number             | risk_score  | N/A          | 2                                                                                    | 3                                                                                     | 3                                                                                     |
| data_source        | data_source | N/A          | {type: "data_view", "data_view_id": "A"}                                             | {type: "data_view", "data_view_id": "B"}                                              | {type: "data_view", "data_view_id": "B"}                                              |
| kql_query          | kql_query   | N/A          | {type: "inline_query", query: "query string = true", language: "kuery", filters: []} | {type: "inline_query", query: "query string = false", language: "kuery", filters: []} | {type: "inline_query", query: "query string = false", language: "kuery", filters: []} |
| kql_query          | kql_query   | N/A          | {type: "saved_query", saved_query_id: 'saved-query-id'}                              | {type: "saved_query", saved_query_id: 'new-saved-query-id'}                           | {type: "saved_query", saved_query_id: 'new-saved-query-id'}                           |
| eql_query          | eql_query   | N/A          | {query: "query where true", language: "eql", filters: []}                            | {query: "query where false", language: "eql", filters: []}                            | {query: "query where false", language: "eql", filters: []}                            |
| esql_query         | esql_query  | N/A          | {query: "FROM query WHERE true", language: "esql"}                                   | {query: "FROM query WHERE false", language: "esql"}                                   | {query: "FROM query WHERE false", language: "esql"}                                   |
```

#### **Scenario: `-AB` - Rule field is an array of scalar values**

**Automation**: 1 integration test with mock rules + a set of unit tests for the algorithm

```Gherkin
Given at least 1 installed prebuilt rule has a new version available
And the base version of the rule cannot be determined
And customized <field_name> field is different than the Elastic update in this upgrade (current version != target version)
Then for <field_name> field the diff algorithm should output a custom merged version with a solvable conflict
And arrays should be deduplicated before comparison
And arrays should be compared sensitive of case
And arrays should be compared agnostic of order
And <field_name> field should be returned from the `upgrade/_review` API endpoint
And <field_name> field should be shown in the upgrade preview UI


Examples:
| algorithm        | field_name | base_version | current_version        | target_version         | merged_version                 |
| array of scalars | tags       | N/A          | ["one", "two", "four"] | ["one", "two", "five"] | ["one", "two", "four", "five"] |
```

#### **Scenario: `-AB` - Rule field is a solvable `data_source` object**

**Automation**: 1 integration test with mock rules + a set of unit tests for the algorithm

```Gherkin
Given at least 1 installed prebuilt rule has a new version available
And the base version of the rule cannot be determined
And customized data_source field is different than the Elastic update in this upgrade (current version != target version)
And current version and target version are both array fields in data_source
Then for data_source field the diff algorithm should output a custom merged version with a solvable conflict
And arrays should be deduplicated before comparison
And arrays should be compared sensitive of case
And arrays should be compared agnostic of order
And data_source field should be returned from the `upgrade/_review` API endpoint
And data_source field should be shown in the upgrade preview UI

Examples:
| algorithm    | base_version | current_version                                                     | target_version                                                     | merged_version                                                              |
| data_source  | N/A          | {type: "index_patterns", "index_patterns": ["one", "two", "three"]} | {type: "index_patterns", "index_patterns": ["one", "two", "four"]} | {type: "index_patterns", "index_patterns": ["one", "two", "three", "four"]} |

```

#### **Scenario: `-AB` - Rule field is a non-solvable `data_source` object**

**Automation**: 1 integration test with mock rules + a set of unit tests for the algorithm

```Gherkin
Given at least 1 installed prebuilt rule has a new version available
And the base version of the rule cannot be determined
And customized data_source field is different than the Elastic update in this upgrade (current version != target version)
And current version and target version are not both array fields in data_source
Then for data_source field the diff algorithm should output the target version as the merged version with a solvable conflict
And data_source field should be returned from the `upgrade/_review` API endpoint
And data_source field should be shown in the upgrade preview UI

Examples:
| algorithm    | base_version | current_version                                                     | target_version                           | merged_version                           |
| data_source  | N/A          | {type: "index_patterns", "index_patterns": ["one", "two", "three"]} | {type: "data_view", "data_view_id": "A"} | {type: "data_view", "data_view_id": "A"} |
```

#### **Scenario: `-AB` - Rule field is rule `type`**

**Automation**: 1 integration test with mock rules + a set of unit tests for the algorithm

```Gherkin
Given at least 1 installed prebuilt rule has a new version available
And the base version of the rule cannot be determined
And customized data_source field is different than the Elastic update in this upgrade (current version != target version)
And current version and target version are not both array fields in data_source
Then for data_source field the diff algorithm should output the target version as the merged version with a non-solvable conflict
And data_source field should be returned from the `upgrade/_review` API endpoint
And data_source field should be shown in the upgrade preview UI

Examples:
| algorithm    | base_version | current_version | target_version | merged_version |
| rule type    | N/A          | "query"         | "saved_query"  | "saved_query"  |
```

Notes: `type` field can only be changed between `query` and `saved_query` rule types in the UI and API via normal conventions, but the logic for others is still covered
