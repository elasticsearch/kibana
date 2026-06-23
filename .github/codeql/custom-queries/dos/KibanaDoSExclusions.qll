/**
 * Shared predicates for excluding non-request-payload schema usages from
 * Kibana DoS queries (unbounded strings, unbounded arrays, etc.).
 *
 * CONSERVATIVE POLICY: Only exclude file paths that NEVER contain HTTP request
 * payload schemas. When in doubt, keep the finding — a false positive is far
 * less costly than missing a real vulnerability.
 *
 * For one-off false positives in mixed-purpose files, use inline suppression:
 *   // codeql[js/kibana/unbounded-string-in-schema] reason
 *   // codeql[js/kibana/unbounded-array-in-schema] reason
 *
 * If a new file category consistently produces false positives, add a path
 * pattern here rather than scattering per-line suppressions.
 */

import javascript

/**
 * Holds when `e` resides in a file whose schemas are known to never validate
 * HTTP request payloads. These fall into structural/data-at-rest categories:
 * plugin configuration, saved-object attributes, UI settings, content
 * management layer schemas, sample-data registration, AI/LLM output schemas,
 * and tooling config.
 */
predicate shouldExcludeFileFromDoSRules(Expr e) {
  exists(string path | path = e.getFile().getRelativePath() |
    // Plugin configuration (kibana.yml settings)
    e.getFile().getBaseName() = "config.ts"
    or
    // Plugin server entry points (re-exports only)
    (e.getFile().getBaseName() = "index.ts" and
     path.regexpMatch(".*/plugins/[^/]+(/[^/]+)?/server/index\\.ts"))
    or
    // Fleet saved-object schemas and migrations
    path.regexpMatch(".*/plugins/shared/fleet/server/saved_objects/.*")
    or
    // Security evals evaluators (offline analysis logic, not HTTP routes)
    path.regexpMatch(".*/kbn-evals-suite-security-esql-generation-regression/src/evaluators/.*")
    or
    // Saved-object attribute schemas (versioned shapes, never route payloads)
    path.regexpMatch(".*/saved_objects/schemas/.*")
    or
    // Saved-object model-version migration schemas
    path.regexpMatch(".*/saved_objects/model_versions/.*")
    or
    // Saved-object type sub-schemas (e.g. cases/server/saved_object_types/*/schemas/*)
    path.regexpMatch(".*/saved_object_types/.*/schemas/.*")
    or
    // Endpoint saved-object attribute mappings (data-at-rest, not HTTP input)
    path.regexpMatch(".*/endpoint/lib/.*/saved_objects/mappings\\.ts")
    or
    // Osquery saved-query saved-object schemas (data-at-rest, not HTTP input)
    path.regexpMatch(".*/osquery/server/lib/saved_query/schemas\\.ts")
    or
    // Endpoint metadata Task Manager task-state schema (internal task state, not HTTP input)
    path.regexpMatch(".*/endpoint/lib/metadata/task_state\\.ts")
    or
    // Dashboard saved-object attribute schemas
    path.regexpMatch(".*/dashboard_saved_object/schema/.*")
    or
    // Content-management layer schemas (maps, lens, links CM CRUD)
    path.regexpMatch(".*/content_management/schema/.*")
    or
    // UI-settings definitions (Advanced Settings value schemas)
    e.getFile().getBaseName() = "ui_settings.ts"
    or
    path.regexpMatch(".*/ui_settings/.*")
    or
    // Sample-data registration schema (internal registration, not HTTP input)
    path.regexpMatch(".*/sample_data/lib/sample_dataset_schema\\.ts")
    or
    // Connector-schema type-only files (no route handlers)
    path.regexpMatch(".*/kbn-connector-schemas/.*/types/.*")
    or
    // LLM/AI structured-output schemas
    path.regexpMatch(".*/compaction_schema\\.ts")
    or
    // Agent-builder tool parameter schemas (AI tool arguments, not HTTP routes)
    path.regexpMatch(".*/agent_builder/tools/.*")
    or
    // Agent-builder skill-nested tool parameter schemas (AI tool arguments, not HTTP routes)
    path.regexpMatch(".*/agent_builder/skills/.*/tools/.*")
    or
    // Benchmark tooling config schemas
    path.regexpMatch(".*/kbn-bench/.*")
    or
    // Scout test-environment config schemas
    path.regexpMatch(".*/kbn-scout/.*/schema/.*")
  )
}
