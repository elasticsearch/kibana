# Common information about prebuilt rules <!-- omit from toc -->

**Status**: `in progress`, matches [Milestone 3](https://github.com/elastic/kibana/issues/174168).

> [!TIP]
> If you're new to prebuilt rules, get started [here](./prebuilt_rules.md) and check an overview of the features of prebuilt rules in [this section](#features).

## Table of contents <!-- omit from toc -->

<!--
Please use the "Markdown All in One" VS Code extension to keep the TOC in sync with the text:
https://marketplace.visualstudio.com/items?itemName=yzhang.markdown-all-in-one
-->

- [Tickets](#tickets)
- [Features](#features)
- [Common terminology](#common-terminology)
- [Common assumptions](#common-assumptions)
- [Common technical requirements](#common-technical-requirements)
- [Common product requirements](#common-product-requirements)
  - [Customizable rule fields](#customizable-rule-fields)
  - [Non-customizable rule fields](#non-customizable-rule-fields)

## Tickets

Epics:

- [Users can Customize Prebuilt Detection Rules](https://github.com/elastic/security-team/issues/1974) (internal)
- [Users can Customize Prebuilt Detection Rules: Milestone 2](https://github.com/elastic/kibana/issues/174167)
- [Users can Customize Prebuilt Detection Rules: Milestone 3](https://github.com/elastic/kibana/issues/174168)

Milestone 3:

- Automated testing:
  - [Tests for prebuilt rule customization workflow](https://github.com/elastic/kibana/issues/202068)
  - [Tests for prebuilt rule upgrade workflow](https://github.com/elastic/kibana/issues/202078)
  - [Tests for prebuilt rule import/export workflow](https://github.com/elastic/kibana/issues/202079)
- Manual testing:
  - [Exploratory testing](https://github.com/elastic/kibana/issues/180398)
  - [Acceptance testing](https://github.com/elastic/security-team/issues/11572) (internal)
- Documentation:
  - [Main ticket](https://github.com/elastic/security-docs/issues/5061)
  - [Copy review ticket](https://github.com/elastic/security-docs/issues/6238)

## Features

Historically, users were only able to install all the available prebuilt rules at once, and later upgrade them all at once to their latest versions from Elastic. Also, users were only able to add or edit notification actions for prebuilt rules, but it was impossible to edit and customize any other rule parameters.

With [Milestone 2](https://github.com/elastic/kibana/issues/174167), we introduced the ability to:

- Install prebuilt rules selectively one-by-one or in bulk.
- Before installing a single rule:
  - Preview its properties.
- Upgrade prebuilt rules selectively one-by-one or in bulk to their latest versions from Elastic.
- Before upgrading a single rule:
  - Preview properties of its latest version.
  - Preview a diff between the currently installed version of the rule and its latest version.

With [Milestone 3](https://github.com/elastic/kibana/issues/174168), we're introducing the ability to:

- Edit and customize prebuilt rules (modify almost all rule parameters, besides rule notification actions).
- Export and import prebuilt rules, including customized ones.
- Upgrade prebuilt rules while keeping the user customizations whenever possible.

Please find more information about Milestone 3 features and user stories in the corresponding test plans.

## Common terminology

Terminology related to the package with prebuilt rules:

- **EPR**: [Elastic Package Registry](https://github.com/elastic/package-registry), service that hosts our **Package**.
- **Air-gapped environment**: an environment where Kibana doesn't have access to the internet. In general, EPR is not available in such environments, except the cases when the user runs a custom EPR inside the environment.
- **Package**: the `security_detection_engine` Fleet package that we use for distributing prebuilt detection rules in the form of `security-rule` assets (saved objects).
- **Real package**: the actual latest stable package distributed and pulled from EPR via Fleet.
- **Rule asset**: `security-rule` asset saved objects distributed via the package. There can be one or many assets per each prebuilt rule in the package. Each asset can represent either the latest version of a prebuilt rule, or one of its prior historical versions.
- **Mock rules**: `security-rule` assets that are indexed into the `.kibana_security_solution` index directly from a test during the test setup phase. This allows us to avoid installing the real package in many tests, because this is a heavy, slow and unreliable operation.

Terminology related to the rule's origin:

- **Custom rule**: a rule created by the user themselves.
- **Prebuilt rule**: a rule created by Elastic and shipped via the package.

Terminology related to the various rule versions that can exist in the system:

- **Base version**, also labeled as `base_version`: the "original" version of a prebuilt rule. This is the version of a rule authored by Elastic as it is installed from the package, without customizations to any fields by the user. It is equal to the prebuilt rule asset from the package that corresponds to the `current_version` of this rule. During the installation of a prebuilt rule its asset data is copied over and becomes an installed prebuilt rule.
- **Current version**, also labeled as `current_version`. This is the version of a rule that the user currently has installed. Can be non-customized (in which case it's equal to the `base_version`) or customized by the user (in which case it's different from the `base_version`). You can think of it as a combination of the `base_version` plus all the user customizations applied to its fields on top of that.
- **Target version**, also labeled as `target_version`. This is a newer version of a rule that contains updates from Elastic and that the user is upgrading the rule to. Currently, we allow users to upgrade prebuilt rules only to their lates versions.
- **Merged version**, also labeled as `merged_version`. This is the version of a prebuilt rule that the rule upgrade workflow proposes to the user by default on upgrade. Can incorporate both user customizations and updates from Elastic, where conflicts between them have been auto-resolved by diff algorithms on a per-field basis.
- We can apply the notion of "versions" to rules as a whole or to each rule field separately.
- Base version's `rule.version` always == current version's `rule.version`.
- Current version's `rule.version` always < target version's `rule.version`.

Terminology related to prebuilt rule customization:

- **Customized prebuilt rule**: an installed prebuilt rule that has been changed by the user in the way rule fields semantically differ from the base version. Also referred to as "Modified" in the UI.
  - A customized prebuilt rule has one or more customized fields.
  - For a customized prebuilt rule, `current_version` != `base_version`.
- **Non-customized prebuilt rule**: an installed prebuilt rule that has rule fields values matching the base version.
  - A non-customized prebuilt rule doesn't have any customized fields.
  - For a non-customized prebuilt rule, `current_version` == `base_version`.
- **Customized field**: a prebuilt rule's field which value differs from the value from the originally installed prebuilt rule.
  - For a customized field, `current_version.field` != `base_version.field`.
- **Non-customized field**: a prebuilt rule's field that has the original value from the originally installed prebuilt rule.
  - For a non-customized field, `current_version.field` == `base_version.field`.
- **Customizable rule field**: a rule field that is able to be customized on a prebuilt rule. A comprehensive list can be found [below](#customizable-rule-fields).
- **Non-customizable rule field**: a rule field that is unable to be customized on a prebuilt rule. A comprehensive list can be found [below](#non-customizable-rule-fields).
- **insufficient license**: a license or a product tier that doesn't allow rule customization. In Serverless environments customization is only allowed on Security Essentials product tier. In non-Serverless environments customization is only allowed on Trial and Enterprise licenses.
- **upgrade to target version**: a process of upgrading a prebuilt rule to its latest version from Elastic. After the upgrade, all customizable field values in the rule will match those of the latest version from Elastic.

Terminology related to prebuilt rule upgrade workflow:

- **upgrade conflict**, **conflicting upgrade**: mostly it means the incoming rule upgrade has changes to the customized fields. Depending on the field type it may be possible to **solve** the conflict (a.k.a. **solvable conflict**, **auto-solving conflict**) otherwise the conflict is **non-solvable** (a.k.a. **unresolved conflict**). In any case the conflict means the prebuilt rule upgrade is unsafe and should be reviewed.

Terminology related to the "rule source" object:

- **Rule source**, also known as `ruleSource` and `rule_source`: a rule field that defines the rule's origin. Can be `internal` or `external`. Currently, custom rules have `internal` rule source and prebuilt rules have `external` rule source.
- **`is_customized`**: a field within `ruleSource` that exists when rule source is set to `external`. It is a boolean value based on if the rule has been changed from its base version.

Terminology related to UI and UX:

- **CTA**: "call to action", usually a button, a link, or a callout message with a button, etc, that invites the user to do some action.
- **INACTIVE CTA** - "Call to action" is visible but disabled like a disabled button
- **ACTIVE CTA** - "Call to action" is visible and enabled. And this is the same as just using **CTA** acronym. **ACTIVE**/**INACTIVE** is used to highlight the state in test scenarios asserting **CTA** state based on the system's state.

## Common assumptions

**Assumptions about test environments and scenarios** outlined in all of the test plans related to prebuilt rules.

Unless explicitly indicated otherwise:

- Scenarios in the test plans only apply to prebuilt detection rules. Some scenarios may apply to both prebuilt and custom detection rules, in which case it should be clearly stated.
- EPR is available for fetching the package with prebuilt rules.
- Only the latest **stable** package with prebuilt rules is checked for installation/upgrade. Pre-release packages are ignored.
- User is on the following licenses/tiers:
  - on the `Enterprise` license in a self-hosted or ECH environment;
  - on the `Complete` tier in a Serverless Security environment.
- User has the required [privileges for managing detection rules](https://www.elastic.co/guide/en/security/current/detections-permissions-section.html).

## Common technical requirements

**Non-functional requirements** for the functionality of prebuilt rules. These apply to all of / most of the prebuilt rules workflows and test plans.

- Package installation, rule installation and rule upgrade workflows should work:
  - regardless of the package type: with historical rule versions or without;
  - regardless of the package registry availability: i.e., they should also work in air-gapped environments.
- Rule installation and upgrade workflows should work with packages containing up to 15000 historical rule versions. This is the max number of versions of all rules in the package. This limit is enforced by Fleet.
- Kibana should not crash with Out Of Memory exception during package installation.
- For test purposes, it should be possible to use detection rules package versions lower than the latest.

## Common product requirements

**Functional requirements** for the functionality of prebuilt rules. These apply to all of / most of the prebuilt rules workflows and test plans.

### Customizable rule fields

These are the fields of prebuilt rules that users should be able to customize:

| Rule type        | Field name in UI          | Diffable rule field       |
| ---------------- | ------------------------- | ------------------------- |
| All rule types   | Rule name                 | `name`                    |
| All rule types   | Rule description          | `description`             |
| All rule types   | Tags                      | `tags`                    |
| All rule types   | Default severity          | `severity`                |
| All rule types   | Severity Override         | `severity_mapping`        |
| All rule types   | Default risk score        | `risk_score`              |
| All rule types   | Risk score override       | `risk_score_mapping`      |
| All rule types   | Reference URLs            | `references`              |
| All rule types   | False positive examples   | `false_positives`         |
| All rule types   | MITRE ATT&CK™ threats     | `threat`                  |
| All rule types   | Setup guide               | `setup`                   |
| All rule types   | Investigation guide       | `note`                    |
| All rule types   | Related integrations      | `related_integrations`    |
| All rule types   | Required fields           | `required_fields`         |
| All rule types   | Rule schedule             | `rule_schedule`           |
| All rule types   | Max alerts per run        | `max_signals`             |
| All rule types   | Rule name override        | `rule_name_override`      |
| All rule types   | Timestamp override        | `timestamp_override`      |
| All rule types   | Timeline template         | `timeline_template`       |
| All rule types   | Building block `*`        | `building_block`          |
| All rule types   | Investigation fields      | `investigation_fields`    |
| All rule types   | Data source `**`          | `data_source`             |
| All rule types   | Suppress alerts           | `alert_suppression`       |
| Custom Query     | Custom query              | `kql_query`               |
| Saved Query      | Custom query              | `kql_query`               |
| EQL              | EQL query                 | `eql_query`               |
| ESQL             | ESQL query                | `esql_query`              |
| Threat Match     | Custom query              | `kql_query`               |
| Threat Match     | Indicator index patterns  | `threat_index`            |
| Threat Match     | Indicator index query     | `threat_query`            |
| Threat Match     | Indicator mapping         | `threat_mapping`          |
| Threat Match     | Indicator prefix override | `threat_indicator_path`   |
| Threshold        | Custom query              | `kql_query`               |
| Threshold        | Threshold config          | `threshold`               |
| Machine Learning | Machine Learning job      | `machine_learning_job_id` |
| Machine Learning | Anomaly score threshold   | `anomaly_threshold`       |
| New Terms        | Custom query              | `kql_query`               |
| New Terms        | Fields                    | `new_terms_fields`        |
| New Terms        | History Window Size       | `history_window_start`    |

- `*` Building block field is used to mark alerts as building block alerts.
- `**` Data Source represents index patterns or a data view. Machine Learning rules don't have data_source field.

### Non-customizable rule fields

These are the fields of prebuilt rules that users should not be able to customize:

| Field name   | Diffable rule field |
| ------------ | ------------------- |
| Rule type    | `type`              |
| Rule version | `version`           |
| Rule author  | `author`            |
| Rule license | `license`           |
