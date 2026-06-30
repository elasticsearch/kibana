---
navigation_title: "Test coverage checklist"
description: "Scenarios every feature should be tested against: browsers, upgrades, environment configurations, HA, and more."
---

# Test coverage checklist

Every PR submitted should be accompanied by tests. This page lists the scenarios your feature should be exercised against. For *how* to write the tests, see the [testing guide](./index.md).

## Browser coverage

Refer to the list of browsers and OS {{kib}} supports: https://www.elastic.co/support/matrix

Does the feature work efficiently on the below listed browsers:

- Chrome
- Firefox
- Safari

## Upgrade scenarios

- Migration scenarios — does the feature affect old indices, saved objects?
- Has the feature been tested with {{kib}} aliases?
- Read/write privileges of the indices before and after the upgrade?

## Test coverage levels

- Does the feature have sufficient unit test coverage?
- Does the feature have sufficient functional UI test coverage?
- Does the feature have sufficient REST API test coverage?
- Does the feature have sufficient integration test coverage?

## Environment configurations

- {{kib}} should be fully [cross cluster search](https://www.elastic.co/guide/en/elasticsearch/reference/master/modules-cross-cluster-search.html) compatible (aside from admin UIs which only work on the local cluster).
- How does your plugin behave when optional dependencies are disabled? Ensure all required dependencies are listed in your `kibana.jsonc` dependency list.
- How does your app behave under anonymous access, with security disabled, or with users having restricted privileges?
- Make sure to test your PR in a cloud environment. Read about the [ci:deploy cloud](../contributing/ci-and-build/ci.md#labels) label which makes this very easy.
- Does the feature work correctly with a custom {{kib}} index alias (`kibana.index` in `kibana.yml`)?
- Does the feature work when multiple {{kib}} instances are running?
  - Pointing to the same index
  - Pointing to different indexes — make sure the {{kib}} index is not hardcoded, avoid storing state in {{kib}} server memory, emulate a high-availability deployment, and anticipate timing issues from shared resource access. Custom {{kib}} indices require specific security setup (custom roles).
- Does the feature work when {{kib}} is running behind a reverse proxy or load balancer without sticky sessions?
- Does the feature work when a proxy or load balancer is running between Elasticsearch and {{kib}}?
