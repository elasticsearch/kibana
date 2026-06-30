---
navigation_title: Contributing
---

# Contributing [contributing]

How to work inside the {{kib}} repository: the development principles we hold, the day-to-day GitHub workflow, the layout of the codebase, the rules for HTTP API design, and how the build and CI pipeline work.

## Principles

How we think about quality, security, accessibility, performance, and i18n when writing code. Start here if you're new to the project.

- [Developer principles](./principles/developer-principles.md)
- [Security](./principles/security.md)
- [Accessibility](./principles/accessibility.md)
- [Internationalization](./principles/internationalization.md)
- [Performance](./principles/performance.md)
- [Standards and guidelines](./principles/standards-and-guidelines.md)

## Workflow

How we use GitHub, submit and review pull requests, file issues, and plan feature work.

- [How we use GitHub](./workflow/how-we-use-github.md)
- [Submitting a pull request](./workflow/development-pull-request.md)
- [Pull request review guidelines](./workflow/pr-review.md)
- [Effective issue reporting](./workflow/kibana-issue-reporting.md)
- [Feature development](./workflow/feature-development.md)

## Codebase

Repository layout, TypeScript project references, linting, internal documentation, dependency management, and platform-wide concerns like logging and saved objects.

- [Repository structure](./codebase/repository-structure.md)
- [TypeScript project references](./codebase/typescript-project-references.md)
- [Kibana linting](./codebase/kibana-linting.md)
- [Documentation](./codebase/documentation.md)
- [Managing third-party dependencies](./codebase/managing-third-party-dependencies.md)
- [Upgrading Node.js](./codebase/upgrading-nodejs.md)
- [Logging](./codebase/logging.md)
- [Saved objects and migrations](./codebase/saved-objects-and-migrations.md)
- [Runtime constraints](./codebase/runtime-constraints.md)
- [Package design](./codebase/package-design.md)

## API design

Conventions for designing HTTP APIs in {{kib}}, including Terraform-friendly patterns.

- [Guidelines for HTTP API design in Kibana](./api-design/guidelines-for-http-api-design-in-kibana.md)
- [Guidelines for Terraform-friendly HTTP APIs](./api-design/guidelines-for-terraform-friendly-http-apis.md)

## CI and build

How {{kib}}'s Buildkite CI works, how to build a distributable, and how to debug failures (including FIPS-mode test failures).

- [CI](./ci-and-build/ci.md)
- [Building a Kibana distributable](./ci-and-build/building-a-kibana-distributable.md)
- [Debugging in development](./ci-and-build/debugging-in-development.md)
- [Debugging FIPS test failures](./ci-and-build/debugging-fips-test-failures.md)
