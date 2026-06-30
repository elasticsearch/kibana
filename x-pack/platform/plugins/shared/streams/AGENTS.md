# Streams Plugin — Agent Context

## Pipeline overview

Significant Events surfaces meaningful occurrences in stream data. The pipeline is split into two halves, each driven by a managed workflow:

**KI Onboarding Workflow** (triggered per stream via `POST /internal/streams/{name}/onboarding/_execute`):

**Feature extraction** → **Query generation** → **Rule backing**

- **Features** are patterns extracted from stream data (log patterns, error clusters, entity types). Stored as Knowledge Indicators of `type: 'feature'` in `.significant_events-knowledge_indicators`.
- **Queries** are ES|QL queries generated from Features by an LLM task. Stored as Knowledge Indicators of `type: 'query'`. Non-STATS queries with `severity_score >= 60` are eligible for automatic Kibana rule creation.

**Orchestrator Workflow** (triggered via `POST /internal/streams/significant_events/discovery/_execute`):

**Detection** → **Discovery** → **Significant Event**

The Orchestrator sequences three child workflows in order:

1. **Detection Workflow** — runs an Elasticsearch `change_point` aggregation over alert firing patterns per backed rule to identify statistically significant changes. Writes **Detection** documents to `.significant_events-detections`.
2. **Discovery Workflow** — an AI investigator agent correlates unhandled Detections into logical incidents. Writes **Discovery** documents (with generated title, summary, root cause) to `.significant_events-discoveries`.
3. **Triage Workflow** — an AI judge agent assesses unreviewed Discoveries, assigns a status (`promoted` / `acknowledged` / `demoted` / `resolved`), and writes the final **Significant Event** to `.significant_events-events`.

Each Detection, Discovery, and Significant Event document carries a `workflow_execution_id` field for traceability back to the run that created it.

Workflow clients live in `server/lib/workflows/`. Workflow YAML definitions live in `@kbn/workflows` (`managed/definitions/sig_events/`), not in this plugin. Schemas for all entities live in `@kbn/streams-schema`. LLM logic lives in `@kbn/streams-ai`.

## Where to put things

| What you are adding | Package | Location |
|---|---|---|
| New domain type, schema, or Zod validator | `kbn-streams-schema` | `src/sig_events/<entity>/`, `src/queries/`, or `src/feature.ts` |
| New API request/response shape | `kbn-streams-schema` | `src/api/significant_events/` |
| New LLM prompt or agent tool | `kbn-streams-ai` | `src/significant_events/`, `src/features/`, or `src/knowledge_indicators/` |
| New managed workflow YAML definition (Detection/Discovery/Triage steps) | `@kbn/workflows` | `managed/definitions/sig_events/` |
| New internal HTTP route | `streams` plugin | `server/routes/internal/sig_events/<entity>/route.ts` |
| New public/versioned HTTP route | `streams` plugin | `server/routes/sig_events/<path>/route.ts` |
| New workflow execution client | `streams` plugin | `server/lib/workflows/` |
| New server-side client or service | `streams` plugin | `server/lib/sig_events/<entity>/` |
| Knowledge Indicator read/write logic | `streams` plugin | `server/lib/streams/ki/knowledge_indicator_client/` |
| Any UI component, hook, or service | `streams_app` plugin | Follow existing structure |
| Evaluations | `kbn-evals-suite-significant-events` | See package README |

**Never:**
- Add domain types directly to `streams` or `streams_app` — they belong in `kbn-streams-schema`.
- Add LLM/inference logic to `streams` — it belongs in `kbn-streams-ai`.
- Add UI components to `streams` — all UI lives in `streams_app`.
- Add managed workflow YAML definitions to `streams` or `kbn-streams-ai` — they belong in `@kbn/workflows`.
- Place new routes under the public path without a deliberate API contract — use `internal/` first.

## Naming conventions

Never abbreviate "significant" in identifiers, file names, or folder names:

| ✅ Correct | ❌ Avoid |
|---|---|
| `significantEvent` | `sigEvent` |
| `SignificantEvent` | `SigEvent` |
| `significant_event_*` | `sig_event_*` |
| `SIGNIFICANT_EVENT_*` | `SIG_EVENT_*` |

## Keeping this file current

Update this file when you make a change that would mislead an agent reading it: cross-package ownership changes, pipeline restructuring, addition or removal of concepts relevant to the pipeline, or naming convention updates. Do not update it for type field additions or directory reorganisations within a package — those are discoverable from the code.
