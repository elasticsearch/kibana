---
navigation_title: "Building blocks"
description: "Consider these building blocks when developing your plugin."
---

When building a plugin in Kibana, there are a handful of architectural "building blocks" you can use. Some of these building blocks are "higher-level",
and some are "lower-level". High-level building blocks come
with many built-in capabilities, require less maintenance, and evolve new feature sets over time with little to no
impact on consumers. When developers use high-level building blocks, new features are exposed consistently, across all of Kibana, at the same time.
On the downside, they are not as flexible as our low-level building blocks.

Low-level building blocks
provide greater flexibility, but require more code to stitch them together into a meaningful UX. This results in higher maintenance cost for consumers and greater UI/UX variability
across Kibana.

For example, if an application is using [Index Patterns](./building-blocks.md#index-patterns) and [Search Source](./building-blocks.md#search-source), their application would
automatically support runtime fields. If the app is instead using the lower-level [Search Strategy](./building-blocks.md#search-strategies), additional work would be required.

Armed with this knowledge, you can choose what works best for your use case!

# Application building blocks

## UI components

The following high-level building blocks can be rendered directly into your application UI.

### Query Bar

The Data plugin provides a high-level Query Bar component that comes with support for Lucene, KQL, Saved Queries,
and [Index Patterns](./building-blocks.md#index-patterns). If you would like to expose the ability to search and filter on Elasticsearch data, the Query Bar provided by the Data plugin is your go-to building block.

**Github labels**: `Team:AppServices`, `Feature:QueryBar`

### Dashboard Embeddable

Add a Dashboard Embeddable directly inside your application to provide users with a set of visualizations and graphs that work seamlessly
with the [Query Bar](./building-blocks.md#query-bar). Every feature that is added to a registered [Embeddable](./building-blocks.md#embeddables) (Lens, Maps, Discover sessions and more) will be available automatically, as well as any [UI Actions](./building-blocks.md#ui-actions-and-triggers) that are added to the Embeddable context menu panel (for example, drilldowns, custom panel time ranges, and "share to" features).

The Dashboard Embeddable is one of the highest-level UI components you can add to your application.

**Github labels**: `Team:Presentation`, `Feature:Dashboard`

### Lens Embeddable

Check out the Lens Embeddable if you wish to show users visualizations based on Elasticsearch data without worrying about query building and chart rendering. It's built on top of the [Expression language](./building-blocks.md#expressions), and integrates with [Index Patterns](./building-blocks.md#index-patterns) and [UI Actions](./building-blocks.md#ui-actions-and-triggers). Using the same configuration, it's also possible to link to a prefilled Lens editor, allowing the user to drill deeper and explore their data.

**Github labels**: `Team:Visualizations`, `Feature:Lens`

### Map Embeddable

Check out the Map Embeddable if you wish to embed a map in your application.

**Github labels**: `Team:Geo`

### KibanaPageTemplate

All Kibana pages should use KibanaPageTemplate to setup their pages. It's a thin wrapper around [EuiPageTemplate](https://elastic.github.io/eui/#/layout/page) that makes setting up common types of Kibana pages quicker and easier while also adhering to any Kibana-specific requirements.

Check out [the KibanaPageTemplate tutorial](../../tutorials/kibana-page-template.md) for more implementation guidance.

**Github labels**: `EUI`

## Searching

### Index Patterns

Index Patterns are a high-level, space-aware
abstraction layer that sits above Data Streams and Elasticsearch indices. Index Patterns provide users
the ability to define and customize the data they wish to search and filter on, on a per-space basis.
For example, users can specify a set of indices, and they can customize the field list with runtime fields,
formatting options and custom labels.

Index Patterns are used in many other high-level building blocks so we highly recommend you consider this building block for your search needs.

**Github labels**: `Team:AppServices`, `Feature:Index Patterns`

### Search Source

Search Source is a high-level search service
offered by the Data plugin. It requires
an [Index Pattern](./building-blocks.md#index-patterns), and abstracts away
the raw ES DSL and search endpoint. Internally it uses the ES [Search Strategy](./building-blocks.md#search-strategies)
. Use Search Source if you need to query data from Elasticsearch, and you aren't already using one of
the high-level UI Components that handles this internally.

**Github labels**: `Team:AppServices`, `Feature:Search`

### Search Strategies

Search Strategies are a low-level building block that abstracts away search details, like what REST endpoint is being called. The ES Search Strategy
is a very lightweight abstraction layer that sits just above querying ES with the elasticsearch-js client. Other search stragies are offered for other
languages, like EQL and SQL. These are very low-level building blocks so expect a lot of glue work to make these work with the higher-level abstractions.

**Github labels**: `Team:AppServices`, `Feature:Search`

### Expressions

Expressions are a low-level building block that can be used if you have advanced search needs that requiring piping results into additional functionality, like
joining and manipulating data. Lens and Canvas are built on top of Expressions. Most developers should be able to use [Lens](./building-blocks.md#lens-embeddable) or [Search Source](./building-blocks.md#search-source), rather than need to
access the Expression language directly.{' '}

**Github labels**: `Team:AppServices`, `Feature:ExpressionLanguage`

## Saved Objects

[Saved Objects](../saved-objects.md) should be used if you need to persist
application-level information. If you were building a TODO application, each TODO item would be a `Saved
Object`. Saved objects come pre-wired with support for bulk export/import, security features like space
sharing and space isolation, and tags.

**Github labels**: `Team:Core`, `Feature:Saved Objects`

## Advanced Settings

[Advanced Settings and the uiSettings service](../../tutorials/ui-settings.md) should be used if you need to add application-level configuration options. If you wanted to add a setting for listing a number of items per page in your TODO application, then `pageListing` would be a configuration option.

**Github labels**: `Team:Core`, `Feature:uiSettings`, `Feature:Advanced Settings`

# Integration building blocks

Use the following building blocks to create an inter-connected, cross-application, holistic Kibana experience. These building blocks allow you to expose functionality
that promotes your own application into other applications, as well as help developers of other applications integrate into your app.

## UI Actions and Triggers

Integrate custom actions into other applications by registering UI Actions attached to existing triggers. For example, the Maps
application could register a UI Action called "View in Maps" to appear any time the user clicked a geo field to filter on.

**Github labels**: `Team:AppServices`, `Feature:UIActions`

## Embeddables

[Embeddables](./embeddables.md) help you integrate your application with the Dashboard application. Register your custom UI Widget as an Embeddable and users will
be able to add it as a panel on a Dashboard. With a little extra work, it can also be exposed in Canvas workpads.

**Github labels**: `Team:AppServices`, `Feature:Embeddables`