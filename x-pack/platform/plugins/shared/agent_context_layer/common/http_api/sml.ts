/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Allowed type keys for the runtime-imposed `constraints` parameter in SML search.
 * Extend this enum when adding new constrainable SML types.
 */
export enum SmlSearchFilterType {
  connector = 'connector',
}

/**
 * Runtime-imposed, per-type id-allowlist constraints for SML search.
 *
 * Applied transparently by call wrappers from the caller's context (e.g. agent
 * SO `connector_ids`, future allowed-indices, allowed-skills, RBAC). Not
 * exposed to the LLM — the agent can't bypass constraints by construction.
 *
 * Keys must be values of {@link SmlSearchFilterType}.
 *
 * **Cross-type semantics:** constraints compose with OR across types — a record
 * satisfies constraints if it passes the constraint for its own type (or has no
 * constraint for its type). Because a record has exactly one type, per-type
 * constraints are always mutually exclusive on any given hit; AND semantics
 * across types are not expressible and not needed.
 *
 * **Complexity limit:** this shape intentionally supports only id-allowlists.
 * More complex runtime constraints (capability-based, classification-based, etc.)
 * must be pre-computed into a flat list of allowed IDs before being passed here,
 * or handled as a separate named parameter on the service call.
 */
export type SmlSearchConstraints = Partial<Record<SmlSearchFilterType, { ids?: string[] }>>;

/**
 * Agent-discoverable refinements for SML search.
 *
 * Exposed in the LLM tool input schema; the agent picks which (if any) to
 * supply. Combined with {@link SmlSearchConstraints} server-side — agent filters
 * never widen the runtime-imposed constraints.
 */
export interface SmlSearchFilters {
  /** Restrict to one or more SML types (ANY semantics; matches if `type` is in the list). */
  types?: string[];
  /** Restrict to records with any of these tags (ANY semantics; `terms` clause on `tags`). */
  tags?: string[];
}

/**
 * Max length of `query` for POST `/internal/agent_context_layer/sml/_search`.
 */
export const SML_HTTP_SEARCH_QUERY_MAX_LENGTH = 512;

/**
 * Response body for `POST /internal/agent_context_layer/sml/_search`.
 */
export interface SmlSearchHttpResponse {
  results: SmlSearchHttpResultItem[];
}

/**
 * Per-hit shape returned by `POST /sml/_search`.
 * Baseline always includes id, type, title, origin, description. Optional fields
 * (content, tags, references, spaces, permissions) are included only when
 * explicitly requested via the `fields[]` parameter.
 */
export interface SmlSearchHttpResultItem {
  id: string;
  type: string;
  origin: { uri: string };
  title: string;
  description?: string;
  content?: string;
  references?: Array<{ uri: string }>;
  tags?: string[];
}

/**
 * Wire representation of a single SML object.
 *
 * Mirrors the server-side `SmlDocument` shape used by the storage layer.
 */
export interface SmlHttpItem {
  id: string;
  type: string;
  title: string;
  origin: { uri: string };
  content: string;
  created_at: string;
  updated_at: string;
  spaces: string[];
  tags: string[];
  /**
   * Permissions required to access the underlying element. Always
   * present; inner arrays may be empty.
   */
  permissions: {
    kibana: { privileges: Array<{ name: string }> };
    elasticsearch: { indices: Array<{ name: string }> };
  };
  /** How this chunk was produced. */
  ingestion_method: 'manual' | 'crawled';
}

/**
 * Response body for `GET /internal/agent_context_layer/sml/{id}`.
 */
export interface SmlGetHttpResponse {
  item: SmlHttpItem;
}

/**
 * Default and maximum `per_page` values for the list endpoint.
 *
 * Deeper pagination is bounded at runtime by the index's
 * `index.max_result_window` setting (default 10000); requests that exceed it
 * are rejected with HTTP 400.
 */
export const SML_HTTP_LIST_PER_PAGE_DEFAULT = 20;
export const SML_HTTP_LIST_PER_PAGE_MAX = 1000;
export const SML_HTTP_LIST_PAGE_DEFAULT = 1;

/**
 * Response body for `GET /internal/agent_context_layer/sml`.
 */
export interface SmlListHttpResponse {
  page: number;
  per_page: number;
  items: SmlHttpItem[];
}

/**
 * Response body for `PUT /internal/agent_context_layer/sml/{id}`.
 */
export interface SmlUpsertHttpResponse {
  item: SmlHttpItem;
  /** Whether the document was newly created (vs. updated in place). */
  created: boolean;
}

/**
 * Response body for `DELETE /internal/agent_context_layer/sml/{id}`.
 */
export interface SmlDeleteHttpResponse {
  id: string;
  deleted: boolean;
}

/**
 * Max length of `query` for POST `/internal/agent_context_layer/sml/_autocomplete`.
 * Autocomplete payloads are user-typed prefixes - shorter than full retrieval queries.
 */
export const SML_HTTP_AUTOCOMPLETE_QUERY_MAX_LENGTH = 256;

/**
 * Response body for `POST /internal/agent_context_layer/sml/_autocomplete`.
 */
export interface SmlAutocompleteHttpResponse {
  results: SmlAutocompleteHttpResultItem[];
}

/**
 * One row in the @ menu / typeahead. Results are returned in score order;
 * consumers iterate without re-sorting.
 */
export interface SmlAutocompleteHttpResultItem {
  id: string;
  type: string;
  origin: { uri: string };
  title: string;
  /**
   * The specific `discovery_labels` entries that matched the typed prefix,
   * with their `kind` so the UI can render the matched label in context
   * (e.g. for `kind: 'title'` the UI may bold the matched span in the title;
   * for `kind: 'tagline'` it may render the value as a chip).
   *
   * Title and type are reachable as discovery_labels (indexer auto-prepends
   * `{value: title, kind: 'title'}` and `{value: type, kind: 'type'}`).
   */
  matched_discovery_labels?: SmlMatchedDiscoveryLabel[];
}

export interface SmlMatchedDiscoveryLabel {
  value: string;
  kind: string;
  /**
   * The matched span within `value`, wrapped in `<em>...</em>` tags. Present
   * when ES returned a highlight snippet for this entry. UI renders the tags
   * as appropriate (e.g. mapping `<em>` to a bolded span). Example: typed
   * prefix `"git"` against value `"github"` produces `"<em>git</em>hub"`.
   */
  highlighted?: string;
}
