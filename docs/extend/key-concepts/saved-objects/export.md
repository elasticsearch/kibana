---
navigation_title: Export and import
---

# Importing and exporting Saved Objects

Kibana provides built‑in mechanisms to **export and import Saved Objects** as NDJSON documents. These mechanisms enable users and developers to move content between Kibana instances, promote content across environments (for example, development to production), and automate setup or backup of Kibana configuration.

Saved Objects can be imported and exported in two primary ways:

- Using the **Saved Objects management UI** in Kibana
- Using the **Saved Objects import and export HTTP APIs**

Both approaches rely on the same Saved Objects service and share the same data format, limits, and compatibility guarantees.

:::::{important}
When integrating with saved objects via the Saved Objects import/export APIs or the deprecated Saved Objects HTTP CRUD APIs, preserve `coreMigrationVersion` and `typeMigrationVersion` when persisting raw saved object documents outside of Kibana (for example, in JSON/NDJSON files). These fields are required to retain forwards compatibility across Kibana versions as saved object types evolve.
:::::

## What is exported

An export produces an **NDJSON file** where each line represents a single Saved Object document. Depending on the export options, the output can include:

- One or more explicitly selected Saved Objects
- All Saved Objects of one or more types
- The complete **reference graph** of the exported objects

Saved Object types can declare references to other objects. When exporting, Kibana can automatically include these referenced objects to ensure the exported content remains functional when imported elsewhere. For example, exporting a dashboard also exports its associated visualizations, data views, and other dependencies.

## Import behavior

When importing Saved Objects:

- Multiple objects can be imported in a single operation.
- Saved Object migrations are applied automatically to ensure compatibility with the current Kibana version.
- Objects with matching IDs are overwritten by default.
- Configurable limits apply to:
  - The maximum number of objects per import
  - The maximum size of the import payload

If conflicts or missing references are detected, the import process surfaces detailed errors. When using the HTTP APIs, these errors can be handled programmatically to resolve conflicts or retry the import.

## Version compatibility

Saved Object import and export is **forward‑compatible but not backward‑compatible**:

- Objects can be imported into the same Kibana version.
- Objects can be imported into newer minor versions on the same major version.
- Objects can be imported into the next major version.
- Objects cannot be imported into older Kibana versions.

This ensures that Saved Object migrations always run in a supported direction and prevents importing objects into Kibana versions that do not recognize newer schemas.

## Saved Objects management UI

The Saved Objects management page in Stack Management provides a user interface for:

- Exporting selected Saved Objects or entire object types
- Importing NDJSON files
- Viewing relationships between Saved Objects
- Copying Saved Objects between spaces

The UI is built on top of the same import and export APIs and is primarily intended for interactive administrative workflows.

## Import and export HTTP APIs

Kibana exposes HTTP APIs for importing and exporting Saved Objects. These APIs are commonly used to:

- Automate Kibana setup in CI/CD pipelines
- Promote content across environments
- Back up and restore Kibana configuration
- Integrate Saved Objects workflows into external tools

The APIs support exporting by object type or explicit object selection, importing NDJSON payloads, and resolving conflicts. They are designed to remain stable and to avoid breaking changes where possible.

## Choosing the right approach

- Use **import and export** when you need a portable representation of Kibana content or want to move content across deployments.
- Use **Elasticsearch snapshots** for full‑cluster backups, including system indices beyond Saved Objects.
- Use **copy to spaces** to move Saved Objects within the same Kibana instance.
