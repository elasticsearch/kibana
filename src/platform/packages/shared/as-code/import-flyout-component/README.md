# @kbn/as-code-import-flyout-component

Shared UI component for importing as-code state from a JSON file.

Dashboard is the first consumer. Discover (and other as-code apps) can reuse
`ImportJsonFlyoutContent` by supplying `exportApplication`, a Core `services` slice
(`application.getUrlForApp`, `notifications.toasts.addDanger`), and their own
`sanitizeImportJson` / `createFromJson` callbacks — the same adapter pattern as
`@kbn/as-code-export-flyout-component`.
