# @kbn/core-deferred-init-common

Zero-dependency leaf package holding `DeferredInitializationError` and its `isDeferredInitializationError`
type guard. It is thrown by `@kbn/core-plugins-server-internal` when a lazy plugin's wrapped `start()`
contract function is called before deferred initialization has succeeded, caught centrally by
`@kbn/core-http-router-server-internal` (which converts it to a `503` + `Retry-After` response), and
re-exported through `@kbn/core-plugins-server` → `@kbn/core/server` for consumer plugins.

It lives in its own leaf package (rather than `@kbn/core-plugins-server`) to avoid a dependency cycle:
`@kbn/core-plugins-server` depends on `@kbn/core-elasticsearch-server-internal`, which depends on
`@kbn/core-http-server-internal`, which depends on `@kbn/core-http-router-server-internal` — so the
router package cannot depend on `@kbn/core-plugins-server` directly.
