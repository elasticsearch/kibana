---
navigation_title: "Principles"
description: "Follow our development principles to help keep our code base stable, maintainable and scalable."
---

# Developer principles

Over time, the {{kib}} project has been shaped by certain principles. Like {{kib}} itself, some of these principles were formed by intention while others were the result of evolution and circumstance, but today all are important for the continued success and maintainability of {{kib}}.

This document is inspired by and at times reflects points already covered in the [Elasticsearch Development Constitution](https://github.com/elastic/engineering/blob/master/development_constitution.md). When this happens it is either to reframe a principle from the development constitution in terms that are more clearly relevant to {{kib}} or to emphasize principles that are underrepresented in the {{kib}} project today.

While the Elasticsearch Development Constitution is written with Elasticsearch in mind, its principles are broadly relevant throughout Elastic's engineering culture and especially for the {{kib}} project. For that reason, {{kib}} developers should read and internalize that document as well.

## Don't compromise on quality

{{kib}} is a mission-critical piece of software. When we ship a bug that causes instability, regression, or vulnerability, the issue will significantly impact production deployments for our users, and we will not be able to rollback the deployment to fix it. Even if an issue is severe enough to warrant an emergency patch, it will continue to hurt users in production until we release a fix and users upgrade to it.

It's natural for a developer to want to get an important change merged into the product so it can be released, and it's good for our users to have access to frequent improvements in our releases, but we must not sacrifice the quality of our changes in order to meet these pressures.

Build small features of high quality, and then enhance those features with additional high quality improvements over multiple iterations. Never merge code that is not release-ready.

## Build secure software by default

{{kib}} is deployed in mission-critical environments that store sensitive data and sit inside trusted network perimeters. A security vulnerability in {{kib}} puts our users' data, infrastructure, and trust at risk — and unlike most functional bugs, a security regression can be exploited before we have a chance to release a fix.

Security is not a feature to be added later; it is a property of the code we write every day. Every PR author and reviewer shares responsibility for preventing classes of vulnerabilities like XSS, CSRF, RCE, Prototype Pollution, SSRF, Reverse Tabnabbing, and information disclosure. Framework defaults (React's escaping, EUI's link sanitization, the platform CSP, hapi's error redaction) do a lot of heavy lifting, but they are only safe when we use them correctly.

When in doubt, choose the more conservative option and ask the Kibana security team. See [Security](./security.md) for concrete guidance on each class of vulnerability.

## Build accessible software by default

{{kib}} makes a [public commitment](../../../reference/kibana-accessibility-statement.md) to creating an accessible product for people with disabilities. Accessibility is not a polish task at the end of a feature — inaccessible components block real users from doing their jobs, and retrofitting accessibility onto a shipped feature is almost always harder than building it in from the start.

Use EUI components wherever possible; they embody our accessibility playbook. Treat accessibility-related ESLint warnings as blockers, not warnings. Add `axe-core` assertions to new or modified UI. See [Accessibility](./accessibility.md) for concrete tooling, test patterns, and the pre-commit checklist.

## Do the right thing even when it's the hard thing

To ensure {{kib}} remains reliable and relevant in the long term, we will occasionally need to make big changes to existing infrastructure and features where incremental progress is impractical. It takes a lot of hard work and time to get these changes right, and they may break behaviors that developers and end-users have come to rely on, but we must not be afraid to do them if they put the project in a better place.

For changes like this, it's important to clearly define goals, establish scope, gain consensus, and communicate the changes effectively and transparently.

The amount of work associated with a change should give us pause to reflect, but we should not shy away from making big changes to the product when they're the correct solution.

## Automate tests through CI

{{kib}} is far too large a project for us to reliably find breakages through manual QA efforts. It would take years of developer time to manually test all of the features of {{kib}} in a single version, and even with a team of QA engineers and hundreds of thousands of lines of automated tests, it still takes months of cumulative developer time to manually QA the releases we have.

It's imperative for the future success and stability of the project as well as for team velocity that all changes have extensive automated testing that give us confidence that ongoing churn on the codebase does not break existing functionality. We must achieve this level of testing without increasing the manual QA burden.

Additionally, since all merged code should be release-ready, it's imperative that automated testing be run through our CI, preferably as blocking status checks on pull requests.

A feature that requires manual QA to ensure it continues to work is worse than not having that feature at all.

See [Testing Kibana plugins](../../testing/index.md) for the testing pyramid we follow, along with guides for writing unit, integration, and end-to-end tests.

## Organize by domain

The {{kib}} codebase should be organized roughly into software domains, which is to say that modules are defined based on their role within the product rather than by the technical type of code that comprise them. The goal is to help developers find code quickly by placing services in intuitive locations. In practice the two highest technical levels we use to express domains are that of core and plugins, but even within these modules we seek to organize the code by more specific domains.

Within core itself we express domains as services such as HTTP, config, elasticsearch, etc. These things are essential elements to constructing most useful features of {{kib}}, which is why they belong to the "core" domain.

Each plugin is one top-level domain of the {{kib}} project, and will generally be constructed by many sub-domains within. In this way, plugins are modeled in the same spirit as core itself.

Be cautious when adding new domains as doing so inherently expands the scope of the parent domain, which in the case of core or plugin boundaries means the scope of {{kib}} itself.

Code should be organized by domain up until you've reached a level of granularity in a module where it is no longer practical.

## Prefer one way to do things

When building APIs, whether they be programmatic or through HTTP, there are usually multitudes of use cases, and since it's natural as API authors to want to provide a convenient experience for consumers, this often results in a variety of different APIs that achieve similar results. Unfortunately, each API we create causes a burden in maintenance, testing, tooling, and documentation, and this burden is almost always greater than the work needed to use an alternative API.

In order to achieve our goals of creating a consistent product experience as well as an efficient-to-maintain project, we should aim to leverage existing features, APIs, and standards rather than reinventing the wheel. Unless it's part of a broader effort to change the way {{kib}} does something, it's best to leverage existing APIs and prefer existing conventions where possible.

Before building something new, check the [building blocks](../../key-concepts/ui/building-blocks.md) and our [API documentation](../../key-concepts/platform-architecture/api-documentation.md) for existing services.

## Prioritize consistent code within {{kib}}

{{kib}} was around before most of its dependencies existed, and we expect {{kib}} to be around after most of its current dependencies are no longer useful, relevant, or appropriate for the project. We must ensure long term sustainability by building {{kib}} independently of the popular patterns, tools, and idioms of the day.

As with any codebase that evolves organically over time, {{kib}} has a fair share of inconsistency in style, patterns, and conventions, but we aim to reverse this trend in favor of a more consistent codebase. To accomplish this, we must write new code in the spirit of conventions established by existing code, or we must seek consensus for introducing new styles, patterns, and conventions to {{kib}}.

We can leverage the cumulative knowledge of the broader developer community to iteratively improve the quality of our software, but the fundamental building blocks of {{kib}} are designed to support {{kib}}'s needs as a project rather than the conveniences of popular tools and developer community sentiment.

Whenever possible, automated tools should be used to aid in consistency (e.g. linting, prettier).

We use ESLint rules where possible, but also review the [styleguide](https://github.com/elastic/kibana/blob/main/STYLEGUIDE.mdx) for recommendations that can't be linted. Per-plugin ESLint overrides are discouraged — inconsistent enforcement erodes the benefit of shared rules.

## TypeScript over JavaScript

JavaScript is no longer the language of choice for {{kib}}, and any JavaScript that gets transpiled in the project is considered technical debt. Our goal is near-complete replacement of JavaScript with TypeScript throughout the repo.

Static typing gives us more reliable mechanisms to do changes across the project, whether it be upgrading systemic dependencies, making changes to the file structure, or refactoring important modules that have many downstream dependencies. Static analysis allows for more robust tooling to help identify inter-module dependencies, security vulnerabilities, and orphaned code.

Having one definitively preferred language helps developers navigate the broader project and work more freely across teams.

## Be wary of dependencies

The {{kib}} project is not just the code we commit to the repo but rather the combined total of all of the source code from our own repo and all of the external dependencies we rely on. When a user encounters a deficiency in {{kib}}, it matters not whether the root cause is in code we've written or external code we depend on. Additionally, relying on a dependency is a considerable expense in terms of cognitive burden, maintenance overhead, and risk.

Except for highly specialized functionality, dependencies often do more harm in the long term than their short term benefits justify. Always be critical of new external dependencies being added to the project, and frequently re-evaluate the use of existing dependencies.

When the use of an external dependency is necessary, ensure there is sufficient integration testing in {{kib}} to ensure it continues to operate the way we'd expect when we change the consuming code in {{kib}} or upgrade the dependency code.

Except in specific cases where widespread consensus was gained and clear ownership is established, third party dependencies should not be exposed directly as features of {{kib}}, whether it be through the UI, HTTP API, or programmatic interfaces.

See the [third-party dependencies guide](../codebase/managing-third-party-dependencies.md) for more information.

## Don't share code prematurely

There are many modules throughout {{kib}}'s codebase where we have generic utilities that seem appropriate for use elsewhere in the codebase, but doing so is creating another public interface which has a cost in terms of maintenance, testing, documentation, and complexity that increases with each usage. Over the long term, shared utilities tend to accumulate additional complexity in order to be flexible enough for the various use cases of its consumers, particularly when they are shared across domain/plugin boundaries.

Just because some code can be reused does not mean that it should be reused. Duplicating code has drawbacks, but the complexity scales linearly, which is easier for us to manage across so many teams in a project this size.

When we have many duplicate implementations of the same code across different modules, then we can more effectively evaluate how similar the functions are in practice to determine whether creating a new public interface for the sake of code sharing is appropriate.

For similar reasons, don't export [public APIs](../../key-concepts/platform-architecture/plugins-packages-and-the-platform.md#public-plugin-api) without reason. Keep your plugin's public surface area as small as possible — every exported item becomes something you must maintain and consider for backward compatibility.

## Don't abstract prematurely

Overuse of abstractions makes it harder to build a mental model about {{kib}}, and we've already encountered scenarios in {{kib}}'s history where so many abstractions were in place it was difficult to maintain them in practice, and no one person understood how all the pieces worked together.

At the same time, abstractions are necessary in a project like {{kib}}. We must be cautious about introducing new abstractions and ensure there is sufficient testing and documentation in place when we do create them.

Every situation is different, but in general it's better to have abstractions emerge when multiple different implementations of the same service exist rather than in anticipation of that possibility in the future. It's much easier to introduce a new abstraction when we need it than it is to remove an unnecessary abstraction when we don't. For the same reason, it's important that we only write code that we intend to use instead of code that we think might be useful in the future.

Just because something can be abstracted does not mean that it should be abstracted.

## Error cases are features

When two or more modules interact with one another, and especially when two or more independent systems (i.e. integrations) interface with one another, a possible outcome is an error case. We must build {{kib}} in such a way that errors behave consistently in documented ways that are verified through automated testing, which means these errors are features of {{kib}}.

In some scenarios the error cases are already codified by the module or service being consumed, and we simply need to handle those cases explicitly from the consuming side (e.g. HTTP response codes). In other cases, an error might occur as the result of an exception being thrown, in which case the consuming code should have a defined way to handle uncaught exceptions with the least impact to unrelated functionality as possible (e.g. render a generic error message in place of this component, return with a 500 error, etc).

Other than in exceptionally rare cases, errors should never be swallowed, and error messages should usually be descriptive and actionable.

## Document for others

The primary consumers of the code we write, the APIs that we create, and the features we ship are people other than ourselves, which means the people using our tools do not share the cumulative domain knowledge and expertise that crafted them. As authors of these tools, we must share our knowledge in the form of documentation.

Features that we anticipate end users, admins, and plugin developers consuming should be documented through our official docs, but module-level READMEs and code comments are also appropriate.

Documentation is critical part of developing features and code, so an undocumented feature is an incomplete feature.

## Cross-cutting concerns

Several topics deserve their own detailed reference alongside these principles:

- [Security](./security.md) — classes of vulnerabilities to prevent (XSS, CSRF, RCE, SSRF, etc.) and the defenses already baked into {{kib}}'s frameworks.
- [Accessibility](./accessibility.md) — tooling (`axe-core`, `@elastic/eslint-plugin-eui`), test patterns, and the pre-commit ready check.
- [Internationalization](./internationalization.md) — how translation works and how to make your strings translatable.
- [Performance](./performance.md) — the scale axes ({{kib}} features should handle: fields, cardinality, time range, bandwidth).

For HTTP API design see [Guidelines for HTTP API design in Kibana](../api-design/guidelines-for-http-api-design-in-kibana.md). For workflow (PR process, feature development) start with [How we use GitHub](../workflow/how-we-use-github.md). For codebase-level guidance see [Repository structure](../codebase/repository-structure.md), [Logging](../codebase/logging.md), [Saved objects and migrations](../codebase/saved-objects-and-migrations.md), [Runtime constraints](../codebase/runtime-constraints.md), and [Package design](../codebase/package-design.md).

## Signing the contributor license agreement

Sign the [Contributor License Agreement](http://www.elastic.co/contributor-agreement/). This grants us the right to distribute your code without restriction, ensuring its origin and continued availability to users. You only need to sign the CLA once.

### Note on contributing code written with the assistance of AI

While any development process is welcome, your PR remains entirely your contribution. By opening a PR, you confirm thorough review, testing, and confidence in your proposed changes.