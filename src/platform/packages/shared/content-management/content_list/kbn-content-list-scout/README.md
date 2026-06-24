# @kbn/content-list-scout

Scout (Playwright) test helpers for the `@kbn/content-list` UI framework.

Exposes a `ListingTable` page object that resolves a listing page rendered by *either* the legacy `TableListView` (`@kbn/content-management-table-list-view`) or `@kbn/content-list`, so cross-plugin suites that drive a listing they don't own keep working across a `TableListView` -> Content List migration.

This lives outside `@kbn/scout` on purpose: `@kbn/scout` is on the Scout selective-testing critical path, so it must not depend on `@kbn/content-list-common`. Suites that need the Content-List-aware listing helpers import them from here instead. See [#272996](https://github.com/elastic/kibana/pull/272996).
