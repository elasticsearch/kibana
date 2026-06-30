# unifiedSearch

Contains all the components of Kibana's unified search experience. Specifically:
 - UI components for rendering unified search bar;
 - Current state of the search (`data view`, `applied filters, …);
 - Saved queries management.

## As-code filters support

`SearchBar` and `StatefulSearchBar` support an opt-in `asCodeFilterMode` where `filters` may be passed as `AsCodeFilter[]` and `onFiltersUpdated` emits `AsCodeFilter[]`.

For `StatefulSearchBar`, `asCodeFilterMode` requires an explicit `onFiltersUpdated` and is not compatible with `useDefaultBehaviors={true}`.

---

## Development

See the [kibana contributing guide](https://github.com/elastic/kibana/blob/main/CONTRIBUTING.md) for instructions setting up your development environment.
