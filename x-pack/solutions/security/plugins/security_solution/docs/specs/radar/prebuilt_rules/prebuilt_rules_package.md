# Test plan: prebuilt rules package <!-- omit from toc -->

**Status**: `in progress`, matches [Milestone 3](https://github.com/elastic/kibana/issues/174168).

> [!TIP]
> If you're new to prebuilt rules, get started [here](./prebuilt_rules.md) and check an overview of the features of prebuilt rules in [this section](./prebuilt_rules_common_info.md#features).

## Summary <!-- omit from toc -->

This is a test plan for the workflow of installing and updating the Fleet package with prebuilt rules.

This workflow makes prebuilt rules available for installation and upgrade in the system by the user.

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
  - [Package installation](#package-installation)
    - [**Scenario: Package is installed via Fleet**](#scenario-package-is-installed-via-fleet)
    - [**Scenario: Package is installed via bundled Fleet package in Kibana**](#scenario-package-is-installed-via-bundled-fleet-package-in-kibana)
    - [**Scenario: Large package can be installed on a memory restricted Kibana instance**](#scenario-large-package-can-be-installed-on-a-memory-restricted-kibana-instance)
  - [Scenarios for the real package](#scenarios-for-the-real-package)
    - [**Scenario: User can install prebuilt rules from scratch, then install new rules and upgrade existing rules from the new package**](#scenario-user-can-install-prebuilt-rules-from-scratch-then-install-new-rules-and-upgrade-existing-rules-from-the-new-package)
  - [Kibana upgrade](#kibana-upgrade)
    - [**Scenario: User can use prebuilt rules after upgrading Kibana from version A to B**](#scenario-user-can-use-prebuilt-rules-after-upgrading-kibana-from-version-a-to-b)

## Useful information

### Tickets

- [Users can Customize Prebuilt Detection Rules](https://github.com/elastic/security-team/issues/1974) (internal)
- [Users can Customize Prebuilt Detection Rules: Milestone 2](https://github.com/elastic/kibana/issues/174167)
  - [Ensure full test coverage for existing workflows of installing and upgrading prebuilt rules](https://github.com/elastic/kibana/issues/148176)
  - [Write test plan and add test coverage for the new workflows of installing and upgrading prebuilt rules](https://github.com/elastic/kibana/issues/148192)
- [Users can Customize Prebuilt Detection Rules: Milestone 3](https://github.com/elastic/kibana/issues/174168)

### Terminology

- [Common terminology](./prebuilt_rules_common_info.md#common-terminology), see the terminology related to the package with prebuilt rules.

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

User stories:

- Package can be installed and updated:
  - on any license in self-hosted and ECH environments;
  - on any tier in Serverless Security environments;
  - regardless of user privileges, as long as the user has access to Security Solution.
- User can install prebuilt rules with and without previewing what exactly they would install (rule properties).
- User can upgrade prebuilt rules with and without previewing what updates they would apply (rule properties of target rule versions).

## Scenarios

### Package installation

#### **Scenario: Package is installed via Fleet**

**Automation**: 2 e2e tests that install the real package.

```Gherkin
Given the prebuilt rules package is not installed
When user opens any Security Solution page
Then the package gets installed in the background from EPR
```

#### **Scenario: Package is installed via bundled Fleet package in Kibana**

**Automation**: 2 integration tests.

```Gherkin
Given the package is not installed
And user is in an air-gapped environment
When user opens any Security Solution page
Then the package gets installed in the background from packages bundled into Kibana
```

#### **Scenario: Large package can be installed on a memory restricted Kibana instance**

**Automation**: 1 integration test.

```Gherkin
Given the package is not installed
And the package contains the largest amount of historical rule versions (15000)
And the Kibana instance has a memory heap size of 700 Mb (see note below)
When user opens any Security Solution page
Then the package is installed without Kibana crashing with an Out Of Memory error
```

**Note**: 600 Mb seems to always crash Kibana with an OOM error. 700 Mb runs with no issues in the Flaky test runner with 100 iterations: https://buildkite.com/elastic/kibana-flaky-test-suite-runner/builds/2215.

### Scenarios for the real package

#### **Scenario: User can install prebuilt rules from scratch, then install new rules and upgrade existing rules from the new package**

**Automation**: 1 integration test with real packages.

```Gherkin
Given there are two package versions: A and B where A < B
And the package of A version is installed
When user calls the status endpoint
Then it should return a 200 response with some number of rules to install and 0 rules to upgrade
When user calls the installation/_review endpoint
Then it should return a 200 response matching the response of the status endpoint
When user calls the installation/_perform_ endpoint
Then it should return a 200 response matching the response of the status endpoint
And rules returned in this response should exist as alert saved objects
When user installs version B of the package
Then it should be installed successfully
When user calls the status endpoint
Then it should return a 200 response with some number of new rules to install and some number of rules to upgrade
When user calls the installation/_review endpoint
Then it should return a 200 response matching the response of the status endpoint
When user calls the installation/_perform_ endpoint
Then rules returned in this response should exist as alert saved objects
When user calls the upgrade/_review endpoint
Then it should return a 200 response matching the response of the status endpoint
When user calls the upgrade/_perform_ endpoint
Then rules returned in this response should exist as alert saved objects
```

### Kibana upgrade

#### **Scenario: User can use prebuilt rules after upgrading Kibana from version A to B**

**Automation**: not automated, manual testing required.

```Gherkin
Given user is upgrading Kibana from version <A> to version <B>
And the <A> version Kibana instance has already installed prebuilt rules
When the Kibana upgrade is complete
Then user should be able to install new prebuilt rules
And delete installed prebuilt rules
And upgrade installed prebuilt rules that have newer versions in Kibana version <B>

Examples:
  | A      | B     |
  | 8.7    | 8.9.0 |
  | 7.17.x | 8.9.0 |
```
