# Context Engine

Server-side plugin for the Context Engine.

## AI Indices API

AI Indices attach a logical name to an existing user index pattern or data
stream. AI Index records are stored in a hidden Kibana system index
(`.contextengine-ai-indices`), separate from the backing data.

| Method   | Path                                                            | Description                          |
| -------- | --------------------------------------------------------------- | ------------------------------------ |
| `PUT`    | `/api/context_engine/ai_index/{id}`                               | Create or update an AI Index         |
| `GET`    | `/api/context_engine/ai_index/{id}`                               | Get an AI Index by id                |
| `GET`    | `/api/context_engine/ai_index`                                    | List AI Indices available to the caller (max 100) |
| `POST`   | `/api/context_engine/ai_index/_query`                             | Run ES\|QL against AI Indices        |
| `GET`    | `/api/context_engine/ai_index/{id}/_describe`                     | Describe an AI Index for querying    |
| `DELETE` | `/api/context_engine/ai_index/{id}`                               | Delete an AI Index                   |
| `PUT`    | `/internal/context_engine/ai_index/{id}/feedback_analysis`        | Update the feedback analysis config  |

Notes:

- The API is gated behind the `contextEngine:enabled` advanced setting
  (disabled by default). All routes return 404 while the setting is off.
- The `contextEngine:feedbackLoopEnabled` (global) advanced setting gates the
  feedback loop (disabled by default): the always-scheduled hourly
  `contextEngine:signalGenerator` background task turns Agent Builder trace
  spans into per-space signals, and no-ops while the setting is off.
- The backing store is set via `dest`, an object of the form
  `{ "type": "data_stream" | "index", "value": "<data stream or index>" }`.
  `dest.value` must match `dest.type`. Every
  expression in `dest.value` must start with `ai-index-ds-` for data streams or
  `ai-index-idx-` for indices (e.g. `ai-index-ds-foo`, `ai-index-idx-foo*`);
  system indices are not allowed.
- `automations` is an array of `{ "type": "workflow", "value": "<name>" }`
  objects. Required, may be empty.
- `sources` is an array whose entries are one of:
  - `{ "type": "esql", "value": "<ES|QL query>" }`, or
  - `{ "type": "connector", "value": "<connector id>" }` — an action-connector
    instance id (from Stack Management → Connectors). See
    [Connector sources](#connector-sources) below.
  Required, may be empty.
- Deleting an AI Index deletes **only** the AI Index entry. Backing indices
  are left untouched and must be removed with the Delete index API if desired.
- `feedback_analysis` configures this index's feedback loop. See
  [Feedback analysis configuration](#feedback-analysis-configuration) below.

## Listing AI Indices

`GET /api/context_engine/ai_index` returns the AI Indices the caller can use
in the current space, not the whole registry. An AI Index is listed when its
backing index is empty (or does not exist yet), or when it holds at least one
document the caller can see in this space. It is not listed when the caller
lacks `read` on the backing index, or when every document in it belongs to
another space.

To decide, Kibana runs two small searches per AI Index as the current user,
in a single `msearch`: one for any document at all, one for any document in
this space. Any error, timeout or failed shard on either search hides the
entry. The searches deliberately do not set `ignore_unavailable`: with it, an
index the caller cannot read would look empty and be listed anyway. The agent
prompt's AI-index catalog uses the same rule.

Two things follow. An AI Index that is not listed can still be fetched,
updated or deleted by id. And a wildcard `dest.value` that matches no index
the caller can read looks the same as an index that does not exist yet
(Elasticsearch returns 404, not 403), so it is listed as empty.

## Querying AI Indices

`POST /api/context_engine/ai_index/_query` runs caller-supplied ES|QL as the
current user. Body: `{ query, params?, limit? }`. Two things are server-owned
and cannot be overridden:

- **Space filter.** Documents are visible when they carry no
  `permissions.kibana.privileges` element (public), or when one is scoped to
  the request's space or to `*`. The space comes from the request URL
  (`/s/{spaceId}/api/...`, default space otherwise), so a caller cannot read
  another space's documents on any path. `contextEngine:enabled` is a per-space
  setting, so the route 404s in any space where it is off.
- **Row limit.** `limit` defaults to 100 and cannot exceed 1000. A trailing
  `LIMIT` in the query is capped to it; otherwise one is appended.

The query is otherwise a pass-through: it decides which indices it reads
(`FROM ai-index-idx-a,ai-index-ds-b` and `FROM ai-index-*` both work) and
Elasticsearch index privileges bound what it can reach. Elasticsearch 4xx
errors (bad ES|QL, missing index privilege) are returned with their status.

## Describing AI Indices

`GET /api/context_engine/ai_index/{id}/_describe` is the step before writing a
query. It returns `{ response: string }`: a free-form text context block meant
to be handed to an agent as-is, not parsed.

```
AI index: sales-knowledge
Curated sales knowledge.
Query with ES|QL against: ai-index-idx-sales-knowledge

Fields
@timestamp: date, searchable, aggregatable
content.semantic: semantic_text, searchable
title: text, searchable
type: keyword, searchable, aggregatable

Semantic fields
content.semantic

Knowledge item types
"document": 41
"detection rule": 3

Tags
"billing": 12

Example queries (adapt field names for non-canonical indices)

Full text search, lexical and semantic fused together (?query)
FROM ai-index-idx-sales-knowledge METADATA _id, _index, _score
| FORK
    ( WHERE MATCH(title, ?query) OR ... | SORT _score DESC | LIMIT 20 )
    ( WHERE MATCH(title.semantic, ?query) OR ... | SORT _score DESC | LIMIT 20 )
| FUSE
...

Filter by knowledge item type and tag (?type, ?tag; tags is multi-valued, so MATCH)
...

Count by type
...
```

- The `Query with ES|QL against` line is `dest.value`, the string to put after
  `FROM`.
- `Fields` lists every mapped field, mapping-defined runtime fields included
  (`path: type`, then `searchable` and/or `aggregatable` when true), one per
  line, sorted by path and capped at 500;
  the heading becomes `Fields (showing 500 of N)` when capped. Types come from
  `_mapping`; `searchable`/`aggregatable` from `_field_caps`. A path mapped to
  different types across the matched indices is reported as `conflict`.
- `Semantic fields` lists the searchable `semantic_text` fields among those
  shown, detected from the mapping type. Omitted when there are none.
- `Knowledge item types` and `Tags` show the top 20 `type` / `tags` values by
  document count in the current space, one `"value": count` per line. Each
  section is omitted unless its field is an aggregatable `keyword` — always the
  case on canonical KI indices, but a custom index that maps `type` / `tags` as
  `text`, or inconsistently across a pattern, gets no counts. One `terms`
  aggregation backs both; it errors rather than return undercounts if a shard
  fails. Both sections are also omitted when the caller lacks `read` on the
  backing indices; the rest of the block still renders.
- `Example queries` are three fixed ES|QL shapes written for the canonical KI
  schema (`title`, `description`, `content`, their `.semantic` multi-fields,
  `type`, `tags`) with only the `FROM` target substituted. They use named
  parameters (`?query`; `?type` and `?tag`) meant for `_query`'s `params`. They
  run as-is on canonical indices; for other mappings the agent adapts field
  names from `Fields`.

Describe runs no ES|QL. It issues `_mapping` and `_field_caps` (both needed:
`_field_caps` reports `semantic_text` as `text`) plus the one aggregation, all
as the current user. 404 when the AI Index is not registered; Elasticsearch 4xx
from `_mapping` / `_field_caps` (missing `view_index_metadata`) is returned
with its status. The aggregation is the exception: its 403 (missing `read`)
drops the counts sections instead. Each `_mapping` /
`_field_caps` response is capped at 20 MB before the field cap applies; a
target broad enough to exceed it returns 400.

### Privileges

`contextEngine:read` grants the routes; it grants **no** Elasticsearch index
privileges. Callers also need, on every backing index (`ai-index-*`):

- `read` to be listed. Without it the AI Index is left out of the list; there
  is no error. (The one case that looks different is a wildcard `dest.value`
  matching nothing the caller can read: Elasticsearch reports it as
  "no such index", so it shows up as an empty AI Index. See
  [Listing AI Indices](#listing-ai-indices));
- `read` to query, or Elasticsearch returns 403;
- `view_index_metadata` to describe (`_mapping` and `_field_caps`), or
  Elasticsearch returns 403. The counts aggregation also needs `read`; without
  it the two counts sections are omitted and the rest of the block is returned.

Two things decide what a caller can see: the space filter Kibana adds, and the
caller's own Elasticsearch permissions on the backing indices. Nothing checks
whether the caller could open the Kibana object a knowledge indicator describes.
That matters for the built-in SML index (`ai-index-idx-sml-data`): anyone with
Elasticsearch `read` on it may see knowledge indicators for dashboards, rules or
connectors they cannot open in Kibana. This is by design; the Elastic AI Index
is queried like any other index.

## Agent Builder tools

The `contextEngineAgentBuilder` plugin adds three read-only tools under
`platform.context_engine.*`. Each one runs the same code as the matching route
above, as the same user, so a tool and its route always return the same thing:

| Tool                | Route                    | Result                                                                            |
| ------------------- | ------------------------ | --------------------------------------------------------------------------------- |
| `list_ai_indices`   | `GET …/ai_index`         | `{ id, esql_target, description, managed, assigned_to_agent? }` per listed entry  |
| `describe_ai_index` | `GET …/{id}/_describe`   | `{ response }`, the text block describing the index                               |
| `query_ai_indices`  | `POST …/ai_index/_query` | `{ columns, values }`                                                             |

`assigned_to_agent` only appears when an agent calls the tool during a chat. It
says whether that agent is set up with the index. Over MCP there is no agent, so
the field is missing.

`query_ai_indices` has no `time_range` or `filter` parameters. Time constraints
go in the ES|QL itself or in `params`. Its rows come back as a plain `other`
result, not `esql_results`. This is deliberate. In chat, an `esql_results`
result gets a "See in Discover" link that opens the raw query in Discover, and
when the agent asks for a chart the UI runs the raw query again in Lens. Both
run the query as written, without the space filter and row limit the server
adds, so they could show documents from other spaces.

To see the tools, a caller needs Agent Builder's `read` privilege; that is the
only check the MCP server does. To use them, the caller also needs Context
Engine's `read` privilege. Every tool checks this itself and returns an error
result when it is missing.

In Agent Builder chat, any agent with at least one AI Index gets these three
tools automatically (while the `aiIndices` experimental feature is on). Its
system prompt tells it to list, then describe, then query, and leaves space
scoping to `query_ai_indices` rather than handing the agent a filter to copy.
The `ki-retrieval` skill teaches the same steps with the same tools.

The space always comes from the request; it cannot be passed as a parameter. In
Agent Builder chat, it is the agent's space. Over MCP, it is the space in the
URL the MCP server is served from: `/api/agent_builder/mcp` is the default
space and `/s/{spaceId}/api/agent_builder/mcp` is another space.

## Feedback analysis configuration

Signal *generation* is global — one background task, one advanced setting.
Signal *analysis* is per AI Index, because the improvement it proposes targets
that index's KI pipeline. The configuration therefore lives on the AI Index
record:

```json
{
  "enabled": true,
  "agent_id": "my-analysis-agent",
  "schedule": { "interval": "24h" },
  "signal_time_range": { "type": "relative", "from": "now-30d" },
  "signal_filter": "tags: query_error",
  "allowed_actions": ["add_ki", "edit_ki"]
}
```

- `enabled` is *desired* state. A schedule also needs credentials bound to it,
  so the scheduler stays authoritative for whether analysis is really running.
- `agent_id` is the Agent Builder agent that analyzes this index's signals. It
  is also the agent the interactive "Analyze & improve" hand-off opens.
- `schedule.interval` defaults to `24h` and must be at least 15 minutes. Every
  run is an LLM analysis over a window of signals, so the interval is a cost
  control rather than only a scheduling detail.
- `signal_time_range` defaults to `now-30d` and is a **read filter only**: it
  narrows which signals a run selects over, and never deletes or retains
  them. A `relative` window must cover at least one schedule interval, or
  signals arriving between runs would never be analyzed. Overlapping windows
  are harmless, because re-proposals are de-duplicated downstream. An
  `absolute` window is an open-ended "since this date", so it is always
  accepted.
- `signal_filter` is KQL narrowing which signals a run analyzes, applied on top
  of `signal_time_range`. It is validated as KQL when written, so a typo cannot
  silently disable every scheduled run. It belongs here rather than in the
  generation pipeline: generation is global and stateful, so dropping a signal
  at write time would drop it for every consumer, permanently, whereas a read
  filter is per index and reversible.
- `allowed_actions` defaults to the full [improvement action
  taxonomy](common/http_api/improvement_actions.ts) and bounds what the
  analysis may propose for this index. Deployments routinely want an agent that
  may suggest KIs but never touch workflows, and an agent asked in a prompt to
  avoid an action is not prevented from taking it — so the allowed set is
  config that the apply step enforces, not prompt text. An empty list is
  observe-only: the run still reports what it found but may not propose a
  change.

The dedicated `PUT .../feedback_analysis` route replaces only this block,
leaving the rest of the record untouched. Unlike a full AI Index replace it is
permitted on **managed** AI Indices: their definition is owned by the plugin
that registers them, but which agent analyzes them and how often is operator
preference. Without that carve-out, the indices that ship by default would be
the only ones that could never be analyzed.

## Connector sources

A `connector` source references an action-connector instance whose type opts
in to the Context Engine — i.e. its spec declares `contextEngine` in
`supportedFeatureIds`. The value stored on the source is the connector
**instance id** (not the connector type). Human-readable names are resolved
at render time via the Actions API, so renaming a connector in Stack
Management does not leave a stale label on the AI Index.

Which connector types are eligible is derived at runtime from the Actions
plugin's connector-types registry:

```
GET /api/actions/connector_types?feature_id=contextEngine
```

To make a new connector eligible, add `'contextEngine'` to the
`supportedFeatureIds` list on the connector spec (in `kbn-connector-specs`).
No changes to the Context Engine plugin are required.

## Signals

Signals are observations classified from Agent Builder traces and stored in the
per-space `context-engine-signals-<space>` index. The AI Index detail page
renders a read-only **Signals** panel: a preaggregated grouped-by-tag list, a
drill-down into a group's individual signals (each with a trace waterfall in a
flyout), and an "Analyze & improve" button that opens Agent Builder when a chat
opener has been registered.

The panel is backed by two internal, read-only routes (reads run as the current
user against the current space's signals index):

| Method | Path                                      | Description                                            |
| ------ | ----------------------------------------- | ------------------------------------------------------ |
| `GET`  | `/internal/context_engine/signals/groups` | Signals grouped by tag (a terms aggregation over tags) |
| `GET`  | `/internal/context_engine/signals`        | The individual signals for a `tag` (paginated)         |

Both routes are gated by the same `contextEngine:enabled` advanced setting as
the AI Index API (they return 404 while it is off).

## Improvements

An **improvement** is a proposed change to one AI Index's KI pipeline, derived
from that index's signals. They live in the single global
`context-engine-improvements` index, exposed to the server as
`ContextEnginePluginStart.getImprovementsService(esClient)`. There is no HTTP
surface yet: the analysis runner that produces improvements and the review UI
that applies them come later.

Unlike signals, the store is **global rather than per-space**: an improvement
targets an AI Index's KI pipeline, and the AI Index registry has no space
dimension. Two consequences are accepted deliberately — the analysis reads
signals across all spaces, so an improvement's rationale can cite evidence from
a space the reviewer cannot open; and a single index means one
`deleteByAiIndex` cleans up completely when an AI Index is deleted.

The lifecycle is an **append log** rather than a mutable status field, so the
record of what the loop did to a user's index survives every transition:

- `improvement_id` is the stable lineage key, derived idempotently from
  `hash(ai_index_id + change_fingerprint)`. The fingerprint describes the
  proposed fix (e.g. `remove_workflow:<workflow_id>`) and contains no free text,
  so a re-run over the same latent problem appends a revision instead of
  creating a near-duplicate row.
- `revision_id` is the ES `_id`; every write, including APPLY / REJECT, appends
  a revision carrying `previous_revision_id`.
- `latest: true` marks the head of each lineage, and `list`/`get` filter on it.
  A boolean flag rather than `collapse`, because `collapse` makes
  `track_total_hits` count hits instead of groups and the review UI needs an
  exact total to paginate.
- Transitions are serialized by retiring the current head under
  `if_seq_no`/`if_primary_term` before appending. A reviewer who loses that race
  appends nothing and gets a conflict, so the log can never hold both an
  `applied` and a `rejected` head for the same improvement.
- A batch `write` skips only the lineages that lost that race, rather than
  abandoning the batch. A bulk applies each operation independently, so the
  other heads are already retired by then; dropping them would leave those
  lineages with no `latest` revision at all.
- OCC only guards a lineage that already has a head. The first revision of a
  brand-new `improvement_id` has nothing to guard it, so two runs writing the
  same new improvement concurrently can both append a head. Analysis runs for
  one AI Index are therefore expected to be serialized. Should it happen anyway,
  it is self-healing rather than permanent: a head lookup returns every head of
  a lineage and the next `write` or `transition` retires all of them, so the
  lineage converges back to a single head.
- `failed` is a status, not an error return: an approval whose apply step errors
  stays visible and retryable, with the reason on `resolution.error`.
- A rejection keeps the reviewer's rationale on `resolution.reason`, so the next
  run knows a fix was considered and turned down rather than re-proposing it.

### Privileges

`context-engine-improvements` is a **user-owned index**, and needs no grant on
the `kibana_system` role. The work is split so that no single actor needs both
halves:

- **Kibana** installs the `context-engine-improvements` index template at start,
  which needs only the cluster-level `manage_index_templates` it already holds.
- **The caller** creates the index on the first write, and Elasticsearch applies
  the template's mappings to it. Every subsequent read and write is authorized
  against that caller too, so `getImprovementsService` takes the client to act
  through and callers pass a request-scoped one.

This is what keeps the store off the internal user. Applying mappings lazily per
operation instead — the usual storage-adapter pattern — would need `manage` on
the index from whoever performed it, including anyone merely reading the review
UI. Writers need `create_index` plus `write`; readers need `read`.

