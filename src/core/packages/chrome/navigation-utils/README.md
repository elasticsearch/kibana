# @kbn/core-chrome-browser-navigation-utils

Lightweight utilities for resolving icons on Chrome project navigation nodes.

This package has zero runtime dependencies so that it can be dynamically imported by the
navigation plugin without pulling `@kbn/core-chrome-browser` into the page-load bundle.

## Exports

- `getNavigationNodeIcon(node)` — resolves the EUI icon type for a navigation node
- `NAVIGATION_NODE_ICON_FALLBACK` — fallback icon string used when no icon is found
- `AppDeepLinkIdToIcon` — mapping of deep-link IDs to EUI icon names
