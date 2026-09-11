# Agent Builder Telemetry

This document describes the telemetry payload reported by the Agent Builder collector and the
usage counters used to build parts of that payload.

## Snapshot telemetry

The collector registers a single snapshot payload named `agent_builder`. The payload shape is
defined in `telemetry_collector.ts` as `AgentBuilderTelemetry` and is assembled in the `fetch`
function. The telemetry document is written under the `agent-builder` root in the
`agent-builder-telemetry` index (time field: `timestamp`). Below is a field-by-field description
of what is reported and how it is calculated.

### Platform metadata fields

In addition to the `agent-builder.*` payload, Kibana attaches standard metadata fields to the
telemetry document. These are not computed by the Agent Builder collector, but by the telemetry
pipeline. They include:
- Cluster and version metadata: `cluster_uuid`, `cluster-name`, `version`, `version-major-minor`.
- Cloud metadata: `cloud.*` (account ID, trial status, deployment flags, kbn UUID).
- ECE metadata: `ece.*` (account ID, kbn UUID).
- License metadata: `license.*` (UID, type, status, issue/start/expiry dates, max nodes/RUs).
- Serverless metadata: `serverless.*` (project ID, type, tier).

### custom_tools
- `custom_tools.total`
  - What it is: Total number of user-created tools (excluding built-in tools).
  - How we count: ES aggregation on the tools system index, filtering out `type: builtin`, then
    summing bucket doc counts. 
- `custom_tools.by_type[]`
  - What it is: Breakdown of custom tools by `type` (e.g., `esql`, `index_search`, `workflow`).
  - How we count: ES terms aggregation on `type`, excluding `builtin`.

### custom_agents
- `custom_agents.total`
  - What it is: Total number of custom agents created.
  - How we count: ES `count` on the agents system index.

### skills
- `skills.total`
  - What it is: Total number of persisted skills (custom + plugin-bundled).
  - How we count: ES `hits.total` on the skills system index.
- `skills.custom`
  - What it is: Number of user-created custom skills.
  - How we count: ES filter aggregation on skills without a `plugin_id` field.
- `skills.plugin`
  - What it is: Number of plugin-bundled skills.
  - How we count: ES filter aggregation on skills with a `plugin_id` field.

### plugins
- `plugins.total`
  - What it is: Total number of installed plugins.
  - How we count: ES `count` on the plugins system index.

### skill_invocations
- `skill_invocations.total`
  - What it is: Total skill invocations across all origins.
  - How we count: Sum of per-origin usage counters (see usage counters section).
- `skill_invocations.by_origin.builtin|custom|plugin`
  - What it is: Skill invocations grouped by origin.
  - How we count: Individual usage counters per origin.

### plugin_imports
- `plugin_imports.total`
  - What it is: Total plugin imports across all source types.
  - How we count: Sum of per-source usage counters (see usage counters section).
- `plugin_imports.by_source.url|upload`
  - What it is: Plugin imports grouped by source type.
  - How we count: Individual usage counters per source type.

### conversations

All-time conversation metrics (no date filter).

- `conversations.total`
  - What it is: Total number of conversations.
  - How we count: ES `hits.total` (with `track_total_hits: true`) on the conversations index.
- `conversations.rounds_distribution[]`
  - What it is: Distribution of conversations by number of rounds.
  - How we count: ES scripted terms aggregation using `conversation_rounds` (or `rounds` fallback)
    and bucket labels `1-5`, `6-10`, `11-20`, `21-50`, `51+`.
- `conversations.total_rounds`
  - What it is: Exact total number of rounds across all conversations.
  - How we count: ES scripted sum aggregation that counts the actual size of each conversation's
    `conversation_rounds` (or `rounds`) array.
- `conversations.avg_rounds_per_conversation`
  - What it is: Average rounds per conversation.
  - How we count: `total_rounds / total`, rounded to two decimals.
- `conversations.tokens_used`
  - What it is: Total tokens used across all conversation rounds (input + output).
  - How we count: Sum of `tokens_input` and `tokens_output`.
- `conversations.tokens_input`
  - What it is: Total input tokens across all conversation rounds.
  - How we count: ES scripted sum aggregation over `conversation_rounds[*].model_usage.input_tokens`.
- `conversations.tokens_output`
  - What it is: Total output tokens across all conversation rounds.
  - How we count: ES scripted sum aggregation over `conversation_rounds[*].model_usage.output_tokens`.
- `conversations.average_tokens_per_conversation`
  - What it is: Average tokens per conversation.
  - How we count: `tokens_used / total`, rounded to two decimals.

### daily

Same structure as `conversations` above, but filtered to the last 24 hours using a
`created_at >= now-24h` range filter. All fields (`total`, `total_rounds`, `tokens_used`,
`tokens_input`, `tokens_output`, `rounds_distribution`, etc.) are computed identically but
only over conversations created in the last day.

### tokens_by_model[]
- `tokens_by_model[].model`
  - What it is: LLM model identifier.
- `tokens_by_model[].total_tokens`
  - What it is: Total input + output tokens consumed by that model.
  - How we count: ES nested terms aggregation on model with sum of input and output tokens.
- `tokens_by_model[].avg_tokens_per_round`
  - What it is: Average tokens per round for that model.
  - How we count: `total_tokens / sample_count`, rounded to two decimals.
- `tokens_by_model[].sample_count`
  - What it is: Number of rounds that contributed to the model bucket.

### query_to_result_time
- `query_to_result_time.p50|p75|p90|p95|p99|mean`
  - What it is: Percentiles and mean of query-to-result latency.
  - How we count: Computed from the conversations index using nested percentiles/avg on
    `conversation_rounds.time_to_last_token`. This represents the end-to-end time to last token
    for completed rounds.

### query_to_result_time_by_model[]
- `query_to_result_time_by_model[].model`
  - What it is: LLM model identifier.
- `query_to_result_time_by_model[].p50|p75|p90|p95|p99|mean|total_samples|sample_count`
  - What it is: TTLT percentiles/mean and sample counts per model.
  - How we count: ES nested terms aggregation on model with percentiles/avg/count of
    `conversation_rounds.time_to_last_token`.

### query_to_result_time_by_agent_type[]
- `query_to_result_time_by_agent_type[].agent_id`
  - What it is: Agent identifier stored on the conversation.
- `query_to_result_time_by_agent_type[].p50|p75|p90|p95|p99|mean|total_samples|sample_count`
  - What it is: Per-agent TTLT percentiles/mean with sample counts.
  - How we count: ES terms aggregation on `agent_id`, then nested percentiles/avg/count over
    `conversation_rounds.time_to_last_token`.

### time_to_first_token
- `time_to_first_token.p50|p75|p90|p95|p99|mean|total_samples`
  - What it is: TTFT percentiles/mean and sample count.
  - How we count: ES nested aggregation on `conversation_rounds.time_to_first_token`.

### tool_calls
- `tool_calls.total`
  - What it is: Total tool calls across all sources.
  - How we count: Sum of per-source usage counters (see usage counters section).
- `tool_calls.by_source.default_agent|custom_agent|mcp|api|a2a`
  - What it is: Tool calls grouped by origin.
  - How we count: Individual usage counters per source.

### tool_calls_by_model[]
- `tool_calls_by_model[].model`
  - What it is: LLM model identifier from each round.
- `tool_calls_by_model[].count`
  - What it is: Total number of tool-call steps for that model across all rounds.
  - How we count: ES scripted metric that iterates each round and counts steps where
    `step.type == 'tool_call'`, then aggregates per model.

### llm_usage
- `llm_usage.by_provider[]`
  - What it is: Count of LLM invocations per provider.
  - How we count: Usage counters named `agent_builder_llm_provider_{provider}`.
    Provider names are sanitized for counter safety.
- `llm_usage.by_model[]`
  - What it is: Count of LLM invocations per model.
  - How we count: Usage counters named `agent_builder_llm_model_{model}`.
    Model names are sanitized for counter safety.

### errors
- `errors.total`
  - What it is: Total errors surfaced to users.
  - How we count: Usage counter `agent_builder_error_total`.
- `errors.total_conversations_with_errors`
  - What it is: Count of unique conversations that experienced an error.
  - How we count: Usage counter `agent_builder_error_conversations_with_errors`.
- `errors.avg_errors_per_conversation`
  - What it is: Average number of errors per conversation that had at least one error.
  - How we count: `errors.total / errors.total_conversations_with_errors` (0 if none).
- `errors.by_type[]`
  - What it is: Error counts grouped by normalized error type/code.
  - How we count: Usage counters prefixed with `agent_builder_error_by_type_`.

## EBT (Event-Based Telemetry) events

The Agent Builder emits server-side EBT events via `AnalyticsService`. All IDs that could
contain user-generated content are normalized before reporting (SHA-256 prefix hashing) to
protect privacy. Built-in identifiers are kept as-is.

### `agent_builder_agent_created`

Fired when a custom agent is created.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agent_id` | keyword | yes | Normalized agent ID. |
| `tool_ids` | keyword[] | yes | Deduplicated, normalized tool IDs included in the agent's tool selection. |

### `agent_builder_agent_updated`

Fired when a custom agent is updated.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agent_id` | keyword | yes | Normalized agent ID. |
| `tool_ids` | keyword[] | yes | Deduplicated, normalized tool IDs after the update. |

### `agent_builder_tool_created`

Fired when a custom tool is created.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tool_id` | keyword | yes | Normalized tool ID. |
| `tool_type` | keyword | yes | Tool type (e.g. `esql`, `index_search`, `workflow`). |

### `agent_builder_round_complete`

Fired once per conversation round, on the execution that ends it. A round paused for human input
emits this only when it is finally answered, and the values are the round's totals across every
execution. For per-execution figures, and for pauses that were never resumed, see
`agent_builder_execution_complete`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agent_id` | keyword | yes | Normalized agent ID. |
| `attachments` | keyword[] | no | Attachment types (e.g. `file`, `screenshot`), if any. |
| `conversation_id` | keyword | no | Conversation ID. |
| `execution_id` | keyword | no | Agent run ID for the converse call. Not the timeline execution ID: identify an execution as `round_id` + `execution_index`. |
| `input_tokens` | integer | yes | Input tokens consumed in this round. |
| `cached_input_tokens` | integer | no | Input tokens served from cache in this round (subset of `input_tokens`), when reported by the provider. |
| `llm_calls` | integer | yes | Number of LLM calls made during the round. |
| `message_length` | integer | yes | Character length of the user's input message. |
| `model` | keyword | no | LLM model identifier. |
| `model_provider` | keyword | no | LLM provider identifier. |
| `output_tokens` | integer | yes | Output tokens produced in this round. |
| `round_id` | keyword | yes | Unique round identifier. |
| `round_status` | keyword | yes | Final status of the round. |
| `response_length` | integer | yes | Character length of the assistant's response. |
| `round_number` | integer | yes | 1-based round index within the conversation. |
| `started_at` | date | yes | Timestamp when the round started. |
| `time_to_first_token` | integer | yes | Milliseconds to first token. |
| `time_to_last_token` | integer | yes | Milliseconds to last token (end-to-end latency). |
| `tool_calls` | integer | yes | Total number of tool-call steps in this round. |
| `tool_call_errors` | integer | yes | Number of tool calls where all results were errors. |
| `tools_invoked` | keyword[] | yes | Normalized tool IDs invoked (may contain duplicates for per-tool counts). |

### `agent_builder_execution_complete`

Fired once per **execution**. A round normally has one; a round paused for human input has one for
the pause and one for each resume, each carrying only its own usage and latency.

Use this event, not `agent_builder_round_complete`, for anything about human-in-the-loop: pause
rates, how long people take to answer, and whether they accept or decline. Note that the
browser-side `agent_builder_hitl_prompt_shown` and `agent_builder_hitl_question_answered` events
cover a different population: they are UI-only, and only for `ask_user_question`.

An execution with `outcome: prompt_requested` and no `agent_builder_round_complete` for the same
`round_id` is a pause that was never resumed.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agent_id` | keyword | yes | Normalized agent ID. |
| `attachments` | keyword[] | no | Attachment types on the round's input, if any. |
| `conversation_id` | keyword | no | Conversation ID. |
| `execution_id` | keyword | no | Agent run ID for the converse call. Not the timeline execution ID. |
| `round_id` | keyword | yes | Round this execution belongs to. |
| `round_number` | integer | yes | 1-based round index within the conversation. |
| `execution_index` | integer | yes | 0 for the initial run, k for the k-th resume. |
| `trigger` | keyword | yes | `user_message` or `prompt_response`. |
| `outcome` | keyword | yes | `responded` if it ended the round, `prompt_requested` if it paused. |
| `input_tokens` | integer | yes | Input tokens consumed by this execution alone. |
| `cached_input_tokens` | integer | no | Cache reads, a subset of `input_tokens`. |
| `output_tokens` | integer | yes | Output tokens produced by this execution alone. |
| `llm_calls` | integer | yes | LLM calls made by this execution alone. |
| `model` | keyword | no | LLM model identifier. |
| `model_provider` | keyword | no | LLM provider identifier. |
| `started_at` | date | yes | When this execution started. |
| `time_to_first_token` | integer | yes | Milliseconds to first token, for this execution. |
| `time_to_last_token` | integer | yes | Milliseconds to last token, for this execution. |
| `tool_calls` | integer | yes | Tool-call steps in this execution. |
| `tool_call_errors` | integer | yes | Tool calls where every result was an error. |
| `tools_invoked` | keyword[] | yes | Normalized tool IDs, duplicated once per call. |
| `message_length` | integer | yes | Length of the round's user message, repeated on every execution since a resume has none of its own. |
| `response_length` | integer | yes | Length of this execution's response; 0 when it paused. |
| `prompt_count` | integer | no | Prompts this execution paused on. |
| `prompt_types` | keyword[] | no | `confirmation`, `authorization` or `ask_user_question`. |
| `prompt_response_types` | keyword[] | no | Types of the prompts this execution was resumed with. |
| `prompt_response_outcomes` | keyword[] | no | `accepted`, `declined`, `authorized`, `authorization_declined`, `answered` or `skipped`, index-aligned with `prompt_response_types`. |
| `human_latency_ms` | integer | no | Time from the pause to this resume. Absent on the initial execution, and on legacy conversations whose timeline timestamps are derived rather than measured. |

### `agent_builder_round_error`

Fired when a round fails with an unrecoverable error.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agent_id` | keyword | yes | Normalized agent ID. |
| `conversation_id` | keyword | no | Conversation ID. |
| `execution_id` | keyword | no | Agent execution ID. |
| `round_id` | keyword | no | Round ID, if available. |
| `model_provider` | keyword | no | LLM provider identifier. |
| `error_type` | keyword | yes | Sanitized/normalized error type or code. |
| `error_message` | keyword | yes | Error message (truncated to 500 chars). |

### `agent_builder_tool_call_success`

Fired after a tool call completes successfully.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tool_id` | keyword | yes | Normalized tool ID. |
| `tool_call_id` | keyword | yes | Unique tool call identifier. |
| `source` | keyword | yes | Origin of the tool call (e.g. `default_agent`, `custom_agent`, `mcp`). |
| `agent_id` | keyword | no | Normalized agent ID. |
| `conversation_id` | keyword | no | Conversation ID. |
| `execution_id` | keyword | no | Agent execution ID. |
| `model` | keyword | no | LLM model that requested the tool call. |
| `result_types` | keyword[] | yes | Types of result entries returned by the tool. |
| `duration_ms` | integer | yes | Tool execution time in milliseconds. |

### `agent_builder_tool_call_error`

Fired when a tool call fails.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tool_id` | keyword | yes | Normalized tool ID. |
| `tool_call_id` | keyword | yes | Unique tool call identifier. |
| `source` | keyword | yes | Origin of the tool call. |
| `agent_id` | keyword | no | Normalized agent ID. |
| `conversation_id` | keyword | no | Conversation ID. |
| `execution_id` | keyword | no | Agent execution ID. |
| `model` | keyword | no | LLM model that requested the tool call. |
| `error_type` | keyword | yes | Sanitized/normalized error type or code. |
| `error_message` | keyword | yes | Error message (truncated to 500 chars). |
| `duration_ms` | integer | yes | Tool execution time in milliseconds. |

### Skill CRUD events

Skill create/update/delete events fire on skill CRUD via the public API. Created and Updated
include `tool_ids`; Deleted does not.

| Event type | Constant |
|------------|----------|
| `agent_builder_skill_created` | `AGENT_BUILDER_EVENT_TYPES.SkillCreated` |
| `agent_builder_skill_updated` | `AGENT_BUILDER_EVENT_TYPES.SkillUpdated` |
| `agent_builder_skill_deleted` | `AGENT_BUILDER_EVENT_TYPES.SkillDeleted` |

| Field | Type | Required | Events | Description |
|-------|------|----------|--------|-------------|
| `skill_id` | keyword | yes | all | Normalized skill ID. Custom → `custom-<hash>`, plugin-bundled → `plugin-<plugin_hash>-<skill_hash>`. |
| `origin` | keyword | no | all | `custom` (direct API) or `plugin` (plugin-bundled). |
| `tool_ids` | keyword[] | yes | created, updated | Deduplicated, normalized tool IDs included in the skill after create/update. |

### `agent_builder_skill_invoked`

Fired when the agent reads a skill file and its tools are dynamically loaded into the tool
manager (`loadSkillToolsAfterRead` hook).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `skill_id` | keyword | yes | Normalized skill ID. Built-ins keep original ID; custom → `custom-<hash>`; plugin → `plugin-<plugin_hash>-<skill_hash>`. |
| `origin` | keyword | yes | `builtin`, `custom`, or `plugin`. |
| `solution_area` | keyword | yes | `security`, `observability`, `search`, `platform`, `custom`, `plugin`, or `unknown`. Derived from `basePath` for built-ins. |
| `plugin_id` | keyword | no | Normalized plugin ID (`custom-<hash>`). Present when `origin` is `plugin`. |
| `agent_id` | keyword | no | Normalized agent ID from the run context. |
| `conversation_id` | keyword | no | Conversation ID. |
| `execution_id` | keyword | no | Agent execution ID. |
| `tool_count` | integer | yes | Number of tools (inline + registry) registered by this skill load. |

### `agent_builder_plugin_imported`

Fired after a successful plugin install (URL or file upload).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `plugin_id` | keyword | yes | Normalized plugin ID (`custom-<hash>`). Falls back to `unknown` if empty. |
| `source_type` | keyword | yes | `url` or `upload`. |
| `skill_count` | integer | yes | Number of skills bundled with the imported plugin. |

### ID normalization scheme

| Entity | Built-in | Custom | Plugin-backed |
|--------|----------|--------|---------------|
| Agent ID | original ID | `custom-<sha256[0:16]>` | — |
| Tool ID | original ID | `custom-<sha256[0:16]>` | — |
| Skill ID | original ID (readonly) | `custom-<sha256[0:16]>` | `plugin-<plugin_sha256[0:16]>-<skill_sha256[0:16]>` |
| Plugin ID | — | — | `custom-<sha256[0:16]>` |

All hashes use SHA-256 truncated to the first 16 hex characters. Implementation is in
`telemetry/utils.ts`.

## Usage counters

All usage counters are stored under the domain `agent_builder` using the Usage Counters
service. Counters are persisted as daily saved objects (`usage-counter`) with a retention
period configured by Kibana (defaults to several days).

### Tool call counters
- `agent_builder_tool_call_default_agent`
  - Count of tool calls triggered by default agents.
- `agent_builder_tool_call_custom_agent`
  - Count of tool calls triggered by custom agents.
- `agent_builder_tool_call_mcp`
  - Count of tool calls triggered by MCP clients.
- `agent_builder_tool_call_api`
  - Count of tool calls triggered via direct API calls.
- `agent_builder_tool_call_a2a`
  - Count of tool calls triggered by agent-to-agent communication.

### LLM usage counters
- `agent_builder_llm_provider_{provider}`
  - Count of LLM invocations for a provider (sanitized string).
- `agent_builder_llm_model_{model}`
  - Count of LLM invocations for a model (sanitized string).

### Error counters
- `agent_builder_error_total`
  - Count of all errors surfaced to users.
- `agent_builder_error_conversations_with_errors`
  - Count of unique conversations that had at least one error.
- `agent_builder_error_by_type_{error_type}`
  - Count of errors by normalized error type/code.
  - For agent execution errors, the type is prefixed with
    `agentExecutionError_{code}` after normalization.

### Conversation round counters
- `agent_builder_rounds_1-5`
- `agent_builder_rounds_6-10`
- `agent_builder_rounds_11-20`
- `agent_builder_rounds_21-50`
- `agent_builder_rounds_51+`
  - Count of conversation rounds bucketed by current round number.
  - Counts rounds **started**, incremented on a round's first execution. A round paused for human
    input and never resumed still counts here. Compare against `agent_builder_round_complete`,
    which counts rounds **completed**: the difference is the abandonment rate.

### Skill invocation counters
- `agent_builder_skill_invocation_builtin`
  - Count of skill invocations from built-in skills.
- `agent_builder_skill_invocation_custom`
  - Count of skill invocations from user-created skills.
- `agent_builder_skill_invocation_plugin`
  - Count of skill invocations from plugin-bundled skills.

### Plugin import counters
- `agent_builder_plugin_import_url`
  - Count of plugins imported via URL.
- `agent_builder_plugin_import_upload`
  - Count of plugins imported via file upload.

### Query-to-result time counters
- `agent_builder_query_to_result_time_<1s`
- `agent_builder_query_to_result_time_1-5s`
- `agent_builder_query_to_result_time_5-10s`
- `agent_builder_query_to_result_time_10-30s`
- `agent_builder_query_to_result_time_30s+`
  - Count of query-to-result durations bucketed by latency. These buckets are
    currently tracked for usage counters but are not used in the snapshot payload.

