# Feature spec & test plan: my awesome feature <!-- omit from toc -->

<!--
=============================================================================
HOW TO USE THIS TEMPLATE (delete this whole block once the spec is filled in)
=============================================================================

Think of this document as a SPEC first and a TEST PLAN second — the test plan
(the scenarios) is a core component of the spec, not the whole thing.

Written before the code, it is the source of truth for the feature:
- It captures the assumptions, requirements, and expected behavior of the feature.
- The scenarios below define what "done" and "correct" mean, and double as the
  plan we validate the feature against.
- It is a foundational artifact: reviewers use it to confirm the work matches
  intent, and it can be used to guide implementation — including feeding AI
  agents/skills that build the code and the tests.

When to write one:
- Any new feature.
- Rewrites / significant reworks of an existing feature.

Write it early — the earlier the better. Use it to understand scope and surface
missing requirements before the implementation starts. Lifecycle:
  1. Ticket assigned.
  2. Author writes this spec/test plan and opens a PR for it.
  3. Spec PR is reviewed and merged — this aligns everyone on scope and catches
     missing requirements early.
  4. Implementation PR is opened; the reviewer confirms the work aligns with
     this spec.
  5. Both the author and the reviewer pull down the implementation PR and do
     exploratory testing before it merges.

Call out anything that can't be covered by automated testing (see the
"Manual and out-of-scope testing" section) so it isn't silently missed.
Testing that typically lives outside these scenarios: performance testing and
exploratory testing.

Helpful agent skills: exploratory testing, test plan writing, and manual testing
for bug fixes.
-->

<!-- Convey the plan's current status, e.g. are you expecting to finalize it in your PR, or later. -->
**Status**: `in progress`. <!-- `in progress` | `done` -->

## Summary <!-- omit from toc -->

<!-- Elaborate on what the Awesome Feature is about and what this spec covers. -->
This is the spec and test plan for ...

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
  - [Section 1](#section-1)
    - [**Scenario: Title of scenario 1.1**](#scenario-title-of-scenario-11)
    - [**Scenario: Title of scenario 1.2**](#scenario-title-of-scenario-12)
  - [Section 2](#section-2)
    - [**Scenario: Title of scenario 2.1**](#scenario-title-of-scenario-21)
- [Manual and out-of-scope testing](#manual-and-out-of-scope-testing)

## Useful information

### Tickets

<!-- Add links to any related tickets. -->

- [Awesome Feature's epic](https://github.com/elastic/security-team/issues/9999)
- [Add tests for the new awesome feature](https://github.com/elastic/kibana/issues/999999)
- [Document the new awesome feature](https://github.com/elastic/security-docs/issues/9999)

### Terminology

<!--
  Explain special terminology around the feature.
  This would allow you to write more concise scenarios, which would improve readability.
-->

- **Term 1**: explanation.
- **Term 2**: explanation.

## Requirements

<!--
  This is the "spec" part of the document. Capture what the feature is and how it
  should behave clearly enough that someone (a person or an AI agent) could build
  and validate it from this section alone. Be explicit about the assumptions and
  requirements the scenarios below rely on.
-->

### Assumptions

<!--
  State the assumptions the feature and its scenarios are built on, even if they
  are not explicitly restated in each step. Being explicit here makes the scope
  reviewable and gives implementers the context they need to build it correctly.
  For example, you could describe:
  - license assumptions: all scenarios are executed under the Basic license, unless indicated otherwise
  - RBAC assumptions: user has the required privileges to normally access the feature
  - data setup: user has certain saved objects, source events, alerts, etc in the system
  - environment: deployment type (self-managed / serverless / ESS), scale, versions
-->

Assumptions the feature and the scenarios in this document are built on.

- Assumption 1.
- Assumption 2.

### Technical requirements

<!--
  Describe any non-function requirements for the feature, if you have any. These could be about:
  - existence or lack of any data in Elasticsearch
  - scale: size of data (number or size of objects), number of Elasticsearch or Kibana nodes, etc
  - performance
  - resilience and error handling
  - observability: APM instrumentation, console logging, event log, correlation ids
  - testing
-->

Non-functional requirements for the functionality outlined in this test plan.

- Requirement 1.
- Requirement 2.

### Product requirements

<!--
  Describe any function requirements for the feature. This may include:
  - user stories
  - acceptance criteria
  - any other relevant details and comments about the UX or UI
-->

Functional requirements for the functionality outlined in this test plan.

User stories:

- User can do X.
- User can do Y.

## Scenarios

<!--
  Add scenarios for the feature. Split them into meaningful sections (groups) of related scenarios.
  The goal of having sections is to make it easier to navigate the test plan:
  - there shouldn't be too many sections with few scenarios in each -- it would be hard to see
    the whole picture of how the feature works
  - there shouldn't bee too few sections with a lot of scenarios in each

  For example, here's some typical sections you might want to add:
  - "Core functionality". Happy paths, base use cases, etc. Split it into several sections if
    there's too many scenarios for it.
  - "Error handling"
  - "Authorization / RBAC"
  - "Kibana upgrade"
-->

### Section 1

#### **Scenario: Title of scenario 1.1**

<!-- Describe how are you planning to automate this scenario -->
**Automation**: X e2e tests + Y integration tests + unit tests.

<!-- Use Gherkin syntax to describe the scenario https://cucumber.io/docs/gherkin/ -->
```Gherkin
Given ...
When ...
Then ...
```

<!-- Consider adding any other useful notes and clarifications for the scenario -->

#### **Scenario: Title of scenario 1.2**

**Automation**: X e2e tests + Y integration tests + unit tests.

```Gherkin
Given ...
When ...
Then ...
```

### Section 2

#### **Scenario: Title of scenario 2.1**

**Automation**: X e2e tests + Y integration tests + unit tests.

```Gherkin
Given ...
When ...
Then ...
```

## Manual and out-of-scope testing

<!--
  Call out anything the scenarios above can't (or won't) cover with automated
  tests, so it isn't silently missed. Expectation: both the PR author and the
  reviewer pull down the implementation PR and do exploratory testing before it
  merges. Typical entries:
  - behavior that can only be validated manually / through exploratory testing
  - performance testing
  - anything explicitly out of scope for this spec (with a short reason)
-->

- Cannot be automated: ... (how it will be verified manually).
- Performance testing: ...
- Out of scope: ... (reason).
