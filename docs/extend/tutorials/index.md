---
navigation_title: Tutorials
---

# Tutorials [tutorials]

Hands-on, task-focused guides for working with the {{kib}} platform from inside a plugin. If you're new to {{kib}} development, start with [Getting started](../getting-started/index.md) instead.

## Data access

- [Access the Elasticsearch client](./access-the-elasticsearch-client-in-a-plugin.md) — obtain the Elasticsearch client in plugin lifecycle hooks and route handlers
- [Search saved objects](./saved-object-search-method.md) — use the powerful `search` method on `SavedObjectsClientContract`
- [Data views API](./data-views-api.md) — create, query, and manage data views programmatically
- [data.search services](./kibana-data-search-services.md) — run search requests with async search, sessions, and custom strategies

## HTTP APIs

- [Register and access an endpoint](./registering-and-accessing-an-endpoint.md) — add a custom HTTP API and call it from client-side code
- [Versioning HTTP APIs](./versioning-http-apis.md) — create or migrate to versioned HTTP APIs
- [Versioning interfaces](./versioning-interfaces.md) — manage request and response schema versions over time
- [Generate OAS documentation](./generating-oas-for-http-apis.md) — generate OpenAPI Specification docs for your HTTP APIs

## Building UIs

- [Register an application](./registering-an-application.md) — register a top-level application in {{kib}}
- [Page template](./kibana-page-template.md) — create consistent page layouts with `KibanaPageTemplate`
- [Recently viewed](./chrome-recently-viewed.md) — register items in the side navigation's "Recently Viewed" list via `chrome.recentlyAccessed`
- [Expressions service](./kibana-expressions-service.md) — build and execute expression pipelines
- [Lens Config Builder API](./lens-config-builder-api-examples.md) — embed Lens visualizations using the config builder API
- [Add data tutorials](./home-tutorials.md) — register data ingestion tutorials in the {{kib}} home screen

## Configuration

- [Configure your plugin](./configuring-your-plugin.md) — define a config schema and read values at runtime
- [UI settings](./ui-settings.md) — register a new UI setting (aka advanced setting / uiSetting) and read it at runtime

## Platform services

- [Logging](./logging-service.md) — structured logging from the server
- [Reporting integration](./reporting-integration.md) — integrate your plugin with the Reporting plugin
- [Screenshotting service](./screenshotting/kibana-screenshotting-service.md) — generate screenshots programmatically
- [Development telemetry](./development-telemetry.md) — register telemetry events for usage analytics
- [Internationalization (i18n)](./i18n.md) — add translatable strings and use the i18n tooling

## External plugin development

- [Overview](./external-plugin-development.md) — differences when developing plugins outside the {{kib}} repository
- [Plugin tooling](./plugin-tooling.md) — build and package tooling for external plugins
- [Functional tests](./external-plugin-functional-tests.md) — run FTR tests for plugins outside the repo
- [Testing plugins](./testing-kibana-plugin.md) — set up tests for a {{kib}} plugin
