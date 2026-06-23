# @kbn/data-visualizer-server-schemas

Server-side schemas for Data Visualizer APIs and embeddables.

This package is a `shared-server` package. Server code may import its schema values and schema-derived types. Common and browser code may only consume its exported types via `import type { ... } from '@kbn/data-visualizer-server-schemas/...';`.

Any browser-safe runtime values should live in a `shared-common` package.
