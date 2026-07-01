# @kbn/workflows-library

Shared types, Zod schemas, and YAML parsing for the **Workflow Template Library** —
the in-product catalog of curated workflow templates fetched from the Elastic-hosted
CDN and exposed by the `workflows_management` plugin at `/internal/workflows/library/*`.

This package is **browser-safe** and has a single public entry point. It can be
imported from any Kibana plugin (server or browser) without taking a runtime
dependency on `workflows_management`.

## Contents

- `src/types/` — TypeScript interfaces for the catalog (`Template`,
  `TemplatesCatalog`, `KibanaVersionsManifest`, `TemplateBody`) and
  the install form (`InstallFormField`, `InstallFormSchema`).
- `src/schemas/` — Zod schemas mirroring the types, used both at runtime (server
  validates catalogs fetched from the CDN) and in CI (the `elastic/workflows`
  catalog generator validates authored YAML against the same schemas).
- `src/yaml/parse_template.ts` — `parseTemplateYaml(raw)`: js-yaml load +
  Zod-validated `template-metadata` block + the rest of the workflow body
  preserved untouched.

UI components, React hooks, and the HTTP client land in this package in a later
sub-task, after the server-side API is in place.

## Related

- The global uiSetting key `WORKFLOWS_LIBRARY_ENABLED_SETTING_ID` lives in
  `@kbn/workflows/common/constants` alongside the rest of the workflows uiSetting
  ids; consumers import it from there.
