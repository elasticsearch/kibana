---
mapped_pages:
  - https://www.elastic.co/guide/en/kibana/current/development.html
---

# Contribute to Kibana [development]

[{{kib}}](https://www.elastic.co/what-is/kibana) is a pluggable platform for searching, visualizing, and analyzing data in Elasticsearch. Most of the UI you see in {{kib}} is built inside a plugin, and the platform is designed to be extended — both by plugins in the repository and by plugins developed outside it.

This documentation is organized into five sections. Pick the one that matches what you need.

- **[Getting started](./getting-started/index.md)** — set up a local environment, run {{kib}}, and build your first "Hello World" plugin.
- **[Key concepts](./key-concepts/index.md)** — the mental models and architecture you need to build on the platform: plugins vs. packages vs. core, the lifecycle, saved objects, security, performance, embeddables, and more.
- **[Tutorials](./tutorials/index.md)** — task-focused, hands-on walkthroughs for common plugin development tasks (registering routes, configuring your plugin, accessing data, adding logging, and so on).
- **[Testing](./testing/index.md)** — the testing pyramid for {{kib}} plugins: Jest unit/integration, Scout (Playwright) for UI and API, and legacy FTR.
- **[Contributing](./contributing/index.md)** — how to work inside the {{kib}} repository: standards, pull requests, CI, linting, debugging, and build.

## Where to start

- **New to {{kib}} development?** Start with [Getting started](./getting-started/index.md), then the [Hello World plugin](./getting-started/hello-world.md).
- **Building on the platform from outside the repo?** See the [external plugin development guide](./tutorials/external-plugin-development.md) after you've set up an environment.
- **Landing on a specific task?** Jump directly to [Tutorials](./tutorials/index.md) and find it by category.

## Reference

- [Plugin list](./plugin-list.md) — inventory of built-in plugins with short descriptions.
- [Dependency versions](./dependencies-versions.md) — version matrix for {{kib}}'s runtime dependencies.
