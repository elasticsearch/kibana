/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, IScopedClusterClient } from '@kbn/core-elasticsearch-server';
import type {
  SavedObjectsClientContract,
  ISavedObjectsRepository,
} from '@kbn/core-saved-objects-api-server';
import type { Logger } from '@kbn/logging';
import type { KibanaRequest } from '@kbn/core-http-server';
import type { AttachmentInput } from '@kbn/agent-builder-common/attachments';
import type { SmlSearchFilters, SmlSearchConstraints } from '../../../common/http_api/sml';

/**
 * Returned by SmlTypeDefinition.getPermissions hooks: RAW Kibana action strings.
 *
 * A list, not a single action: a type may require several, in which case the caller must hold
 * ALL of them within one space. Deliberately NOT shaped like {@link SmlPermissions} — that one is
 * an array of per-space groups, and keeping the two structurally distinct is what stops "list of
 * actions" being mistaken for "list of spaces". The indexer converts between them.
 */
export interface SmlPermissionsInput {
  kibana: { privileges: { name: string[] } };
}

/**
 * One space's slice of an SML document's access requirements.
 *
 * `name` holds bare Kibana action strings; `space` is the single space this group
 * applies to; `count` is how many actions THIS space requires, used as the
 * `minimum_should_match_field` of the ES-side `terms_set` clause.
 */
export interface SmlKibanaPrivilegeGroup {
  space: string;
  name: string[];
  count: number;
}

/**
 * Permissions required to access an entry, grouped by space.
 *
 * Semantics are OR across spaces, AND across actions within a space. Grouping is what makes that
 * expressible — a caller must satisfy one whole group to see the document, and matches cannot
 * accumulate across groups.
 *
 * Mirrors the Elasticsearch-side contract in `AiIndexImplicitPrivilegesProvider`.
 */
export interface SmlPermissions {
  kibana: { privileges: SmlKibanaPrivilegeGroup[] };
}

/**
 * Normalized data to index for one SML origin. Every currently-registered
 * SML type produces exactly one entry per originId — this is a flat shape,
 * not a chunk array, because no real multi-entry-per-origin use case exists.
 */
export interface SmlEntry {
  /** Type of the entry (e.g., 'dashboard', 'lens', 'esql') */
  type: string;
  /** Searchable content (indexed as `semantic_text`) */
  content: string;
  /** Display title */
  title: string;
  /** Longer summary for semantic search (indexed as `semantic_text`); omit or empty if none */
  description?: string;
  /** Free-form labels for filtering and discovery */
  tags?: string[];
  /**
   * Type-specific structured data. Stored as `flattened` so leaves are
   * keyword-searchable for sub-path filtering. SML treats this opaquely;
   * type writers own its shape.
   */
  attributes?: Record<string, unknown>;
  /** Owner or last-modifier user id when known */
  user_id?: string;
  /** Other SML entries this item references. Each entry carries a `uri` field. */
  references?: Array<{ uri: string }>;
}

/**
 * Context passed to SML type hooks (`list` and `getSmlEntry`).
 */
export interface SmlContext {
  esClient: ElasticsearchClient;
  savedObjectsClient: SavedObjectsClientContract;
  logger: Logger;
}

/**
 * Context passed to the toAttachment hook.
 */
export interface SmlToAttachmentContext {
  request: KibanaRequest;
  savedObjectsClient: SavedObjectsClientContract;
  spaceId: string;
}

/**
 * An item returned by the `list` hook of an SML type.
 */
export interface SmlListItem {
  /** Unique ID of the attachment (e.g., saved object ID) */
  id: string;
  /** Last updated timestamp — used by crawler for change detection */
  updatedAt: string;
  /** Space IDs this item belongs to */
  spaces: string[];
}

/**
 * Server-side type definition for SML (Semantic Metadata Layer).
 *
 * Registered via `agentBuilderSml.registerType()` during plugin setup.
 *
 * Solutions register these to make their content discoverable via the SML.
 */
export interface SmlTypeDefinition {
  /** Unique identifier for this SML type (e.g., 'dashboard', 'lens', 'esql') */
  id: string;

  /**
   * Yield pages of items to consider for indexing.
   * Called by the crawler to enumerate candidates.
   * Each yielded array is one page; the crawler processes pages
   * with O(page_size) memory instead of loading everything at once.
   */
  list: (context: SmlContext) => AsyncIterable<SmlListItem[]>;

  /**
   * Return normalized data to index for a specific item.
   */
  getSmlEntry: (originId: string, context: SmlContext) => Promise<SmlEntry | undefined>;

  /**
   * Convert an SML document into a conversation attachment.
   */
  toAttachment: (
    item: SmlDocument,
    context: SmlToAttachmentContext
  ) => Promise<AttachmentInput<string, unknown> | undefined>;

  /**
   * Compute the raw Kibana actions ({@link SmlPermissionsInput}) that gate access to the entry
   * for the given `originId`. Called by the indexer for every entry it stamps.
   *
   * Returns actions only — the indexer owns the stored shape, grouping them per space into
   * {@link SmlPermissions}. Implementations never construct that shape themselves.
   *
   * Authoritative when defined. `SmlEntry` does not carry a `permissions` field.
   *
   * Omit when the type wraps a resource that is intentionally public within
   * the space (e.g. taxonomy entries, public schema docs). The indexer then
   * stamps one `count: 0` privilege element per space, which the read-path
   * security filter treats as "no actions required" — the entry stays space
   * scoped but is visible to every caller in those spaces. A type that wraps a
   * sensitive resource MUST implement this hook.
   *
   * Prefer the `kibanaPermissions` helper over hand-writing the action string. Its `kiType` MUST
   * match the KI type the owning feature declares in `aiIndex: { read: [...] }` — which is the
   * SML type id (KI type id). A mismatch produces an action no feature privilege ever grants,
   * silently hiding every entry of the type from every user.
   */
  getPermissions?: (
    originId: string,
    context: SmlContext
  ) => Promise<SmlPermissionsInput> | SmlPermissionsInput;

  /**
   * Optional: custom crawl interval for the crawler.
   * Defaults to '10m' if not provided.
   */
  fetchFrequency?: () => string;

  /**
   * Hidden saved object types that this type's `list` and `getSmlEntry` hooks
   * require access to (e.g. ['action'] for connectors.)
   */
  requiredHiddenTypes?: readonly string[];
}

/**
 * How an entry was produced.
 *
 * - `'crawled'`: written by the SML crawler or by an event-driven `indexAttachment`
 *   origin-mode call (content fetched via `getSmlEntry`).
 * - `'manual'`: written explicitly by a user/admin via the HTTP upsert route.
 *   Manual entries are protected from being overwritten by the crawler /
 *   origin-mode `indexAttachment` unless `force: true` is passed.
 */
export type SmlIngestionMethod = 'manual' | 'crawled';

/**
 * An SML document, exactly as stored in the index and as handed to consumers (notably
 * {@link SmlTypeDefinition.toAttachment}).
 *
 * The index is `dynamic: strict` with mappings owned by the shared AI index templates, so SML's
 * own bookkeeping lives under the `flattened` `attributes` field. Query DSL can address those
 * keys as `attributes.x`; ES|QL needs `FIELD_EXTRACT(attributes, "x")` — see `buildSmlEsqlQuery`.
 */
export interface SmlDocument {
  /** SML type (e.g., 'visualization', 'dashboard') */
  type: string;
  /** Display title */
  title: string;
  /** Searchable content (`semantic_text` in the index) */
  content: string;
  /** Semantic summary (`semantic_text` in the index) */
  description?: string;
  /** Free-form labels */
  tags?: string[];
  /** Other SML entries this item references. Each entry carries a `uri` field; the object shape allows sub-fields (e.g. relationship kind) without a future migration. */
  references?: Array<{ uri: string }>;
  /**
   * Permissions required to access this entry. See {@link SmlPermissions} for the per-space group shape.
   */
  permissions: SmlPermissions;
  /** SML bookkeeping keys, written over the type writer's own {@link SmlEntry.attributes}. */
  attributes: SmlDocumentAttributes;
}

/** The `attributes` payload of an {@link SmlDocument}. */
export interface SmlDocumentAttributes extends Record<string, unknown> {
  /** Unique id of the entry */
  id: string;
  /** Self-describing URI for the origin, e.g. `${type}://${originId}`. `getSmlOriginId` parses the raw origin id back out. */
  origin: { uri: string };
  /** Timestamp when first created */
  created_at: string;
  /** Timestamp when last updated */
  updated_at: string;
  /** How this entry was produced. */
  ingestion_method: SmlIngestionMethod;
  /** Owner or last-modifier user id */
  user_id?: string;
}

/**
 * Compact SML search result — LLM-shaped. Drops the full `content` blob, the
 * full `attributes`, and bookkeeping fields. Callers fetch full content via the
 * lookup tool (`sml_read`) when they need it.
 *
 * `permissions` is retained here so callers (route / tool wrapper) can apply
 * post-hoc authorization filtering; downstream consumers should not expose it
 * in their response shape.
 *
 * Optional fields (`content`, `description`, `tags`, `references`) are omitted
 * when the caller passes a `fields` array that excludes them. `permissions` is
 * an internal pipeline detail — not present in results.
 */
export interface SmlSearchResult {
  id: string;
  type: string;
  title: string;
  origin: { uri: string };
  content?: string;
  description?: string;
  references?: Array<{ uri: string }>;
  tags?: string[];
}

/**
 * An SML autocomplete result — narrower than {@link SmlSearchResult}, tuned for
 * @ menu / typeahead rendering. Drops bulk content (`content`, `description`,
 * `attributes`, etc.).
 */
export interface SmlAutocompleteResult {
  id: string;
  type: string;
  title: string;
  origin: { uri: string };
}

/**
 * Crawler state document stored in the crawler state index.
 */
export interface SmlCrawlerStateDocument {
  /** Origin ID (e.g., saved object ID) */
  origin_id: string;
  /** SML type definition ID (e.g., 'visualization') */
  type_id: string;
  /** Space IDs this item belongs to (from the source saved object) */
  spaces: string[];
  created_at: string;
  updated_at: string;
  /** Pending action set by the crawler. undefined (field omitted) when the action has been processed. */
  update_action: 'create' | 'update' | 'delete' | undefined;
  /** Timestamp of the last crawl run that saw this item. Used for mark-and-sweep deletion. */
  last_crawled_at: string;
}

/**
 * Action to index an SML attachment.
 */
export type SmlIndexAction = 'create' | 'update' | 'delete';

/**
 * The SML crawler enumerates registered SML types, compares the current state
 * with what has been previously indexed, and queues create/update/delete actions
 * to be processed by the indexer.
 */
export interface SmlCrawler {
  crawl: (params: {
    definition: SmlTypeDefinition;
    esClient: ElasticsearchClient;
    savedObjectsClient: ISavedObjectsRepository;
    abortSignal?: AbortSignal;
  }) => Promise<void>;
}

/**
 * Filter parameters for SML search.
 * Re-exported from the shared HTTP API types so server and client use a single definition.
 */
export type { SmlSearchFilters, SmlSearchConstraints } from '../../../common/http_api/sml';

/**
 * Scope selector for `deleteAttachment` and the `deleteAttachment` start
 * contract method.
 *
 * - `'crawled'` (default) — remove crawler output only; preserve curated manual
 *   entries. This matches the historical behavior of
 *   `indexAttachment({ action: 'delete' })` and the crawler's own semantic.
 * - `'manual'` — remove curated manual entries; preserve crawled output.
 * - `'all'` — remove the entry for the `origin_id` regardless of how it was
 *   produced. Use when the caller "owns" the origin and is fully retiring it
 *   (e.g. a workflow that wrote the entry and is now cleaning up).
 */
export type SmlDeleteScope = SmlIngestionMethod | 'all';

/**
 * Origin-mode mixin for `indexAttachment`.
 *
 * Content is produced by the registered type's `getSmlEntry` hook. The
 * resulting entry is tagged `ingestion_method: 'crawled'`. If the target
 * `origin_id` already has an `ingestion_method: 'manual'` entry, the call
 * is a no-op unless `force: true` is provided.
 */
export interface SmlIndexAttachmentOriginMode {
  /** Override existing manual entries. Default: false. */
  force?: boolean;
}

/**
 * Common params shared by both modes of the internal `indexAttachment` flow
 * (`SmlService.indexAttachment` and `SmlIndexer.indexAttachment`).
 *
 * Unlike the public-contract `SmlIndexAttachmentParams` (`server/types.ts`), this
 * type has no `request` / `spaceId` — by the time the call reaches the service or
 * indexer, the public wrapper has already resolved a scoped saved-objects client,
 * an internal ES client, and the space list.
 */
interface SmlIndexerBaseParams {
  originId: string;
  attachmentType: string;
  action: SmlIndexAction;
  spaces: string[];
  esClient: ElasticsearchClient;
  savedObjectsClient: SavedObjectsClientContract | ISavedObjectsRepository;
  logger: Logger;
  /**
   * Set to `true` when `savedObjectsClient` comes from `getScopedClient` — that
   * client determines the namespace automatically and throws if one is passed
   * explicitly. Leave unset for internal repositories, which need an explicit
   * namespace to access non-default spaces.
   */
  clientHasSpacesExtension?: boolean;
}

export type SmlIndexerOriginParams = SmlIndexerBaseParams & SmlIndexAttachmentOriginMode;

/**
 * Internal params for `indexAttachment`. Origin-mode only — content is always
 * resolved via the registered type's `getSmlEntry` hook.
 */
export type SmlIndexerParams = SmlIndexerOriginParams;

/**
 * Internal params for `SmlIndexer.deleteAttachment` and
 * `SmlService.deleteAttachment`. Shape mirrors `SmlIndexerBaseParams` minus
 * `action` (the method itself implies delete) and adds the `ingestionMethod`
 * scope selector that lets callers wipe more than just the crawled entry.
 *
 * @remarks
 * `spaces` controls which entries are deleted: only entries whose stored
 * `spaces` array contains at least one of the provided space IDs (or the
 * wildcard `'*'`) are removed. HTTP-path callers (PUT/DELETE routes) pass
 * `[spaceId]` so the delete is scoped to the caller's space and entries
 * belonging to other spaces are left intact.
 *
 * Crawler origin-mode paths omit `spaces` (via `indexAttachment`) so
 * their deletes remain global — the crawler owns the full origin across
 * all spaces and must be able to wipe a stale entry regardless of which
 * space it was written from.
 */
export interface SmlIndexerDeleteAttachmentParams {
  originId: string;
  attachmentType: string;
  /**
   * Space-isolation guard. `deleteEntry` filters by a nested query on
   * `permissions.kibana.privileges.space` so only an entry whose privileges
   * contain one of the provided space IDs (or the global wildcard `'*'`) is
   * removed. NOTE: this is a whole-doc guard — a multi-space doc is fully
   * deleted if it matches any provided space.
   *
   * Omit (or pass an empty array) for global deletes (e.g. crawler origin-mode
   * rewrites where the caller controls all spaces).
   */
  spaces?: string[];
  esClient: ElasticsearchClient;
  savedObjectsClient: SavedObjectsClientContract | ISavedObjectsRepository;
  logger: Logger;
  /** Defaults to `'crawled'`. Pass `'all'` to fully retire the origin. */
  ingestionMethod?: SmlDeleteScope;
}

/**
 * SML service interface — exposed on the plugin start contract.
 */
export interface SmlService {
  /** Get the crawler instance (for task manager integration) */
  getCrawler: () => SmlCrawler;
  /**
   * Hybrid search the SML index (RRF over BM25 + semantic), filtering results
   * by space, constraints, agent-supplied filters, and permissions.
   *
   * `constraints` and `filters` are kept as separate parameters so the trust
   * boundary is visible at the API layer: `constraints` is runtime-imposed
   * (wrapper-applied from caller context — agent SO `connector_ids`, future
   * allowed-indices, RBAC) and the agent can't bypass it; `filters` is the
   * agent-discoverable refinement (`types[]`, `tags[]`). Both are combined
   * server-side; agent filters never widen the scope.
   */
  search: (params: {
    query: string;
    size?: number;
    spaceId: string;
    esClient: IScopedClusterClient;
    request: KibanaRequest;
    /**
     * Optional fields to include beyond the baseline (`id`, `type`, `title`,
     * `description`). Valid opt-in values: `'content'`, `'tags'`,
     * `'references'`.
     */
    fields?: string[];
    /** Runtime-imposed per-type id-allowlist constraints. See {@link SmlSearchConstraints}. */
    constraints?: SmlSearchConstraints;
    /** Agent-discoverable filters. See {@link SmlSearchFilters}. */
    filters?: SmlSearchFilters;
  }) => Promise<{ results: SmlSearchResult[] }>;

  /**
   * Autocomplete / typeahead against the SML index. A `match_bool_prefix
   * operator: and` against `title`, combined with a `prefix` clause on `type`
   * so a "type/title" query matches each half against its own field. Filters by
   * space and permissions the same way as `search`, and accepts the same
   * per-type `constraints` and caller-supplied `filters` so a specialized UI
   * picker (e.g. connectors-only or dashboards-only @ menu) can restrict
   * results without any LLM involvement.
   */
  autocomplete: (params: {
    query: string;
    size?: number;
    spaceId: string;
    esClient: IScopedClusterClient;
    request: KibanaRequest;
    /** Runtime-imposed per-type id-allowlist constraints. See {@link SmlSearchConstraints}. */
    constraints?: SmlSearchConstraints;
    /** Caller-supplied type/tag refinements. See {@link SmlSearchFilters}. */
    filters?: SmlSearchFilters;
  }) => Promise<{ results: SmlAutocompleteResult[] }>;

  /**
   * Check whether the current user has access to specific SML items.
   * Returns a map of document id → authorized (true/false).
   *
   * **Internal use only.** This primitive is exposed on the internal
   * `SmlService` so `resolveSmlAttachItems` can distinguish "access denied"
   * from "not found" in its per-item error messages.
   */
  checkItemsAccess: (params: {
    ids: string[];
    spaceId: string;
    esClient: IScopedClusterClient;
    request: KibanaRequest;
  }) => Promise<Map<string, boolean>>;

  /** Index a single attachment (event-driven or manual). See {@link SmlIndexerParams}. */
  indexAttachment: (params: SmlIndexerParams) => Promise<void>;

  /**
   * Delete the entry for an origin, with explicit control over which ingestion
   * method(s) are removed. See {@link SmlIndexerDeleteAttachmentParams}.
   *
   * Distinct from `indexAttachment({ action: 'delete' })` only in that
   * callers can choose to wipe a `'manual'` or `'all'` entry. Without this
   * method, the action: 'delete' path defaults to `'crawled'` to preserve
   * the historical crawler/event-driven semantics (delete crawled output,
   * keep curated manuals).
   */
  deleteAttachment: (params: SmlIndexerDeleteAttachmentParams) => Promise<void>;

  /**
   * Fetch SML documents by their IDs, scoped to a space.
   *
   * **Internal use only — does NOT perform permission checks.** Direct callers
   * MUST authorize IDs (via `checkItemsAccess`) before invoking this method,
   * or use it only from system contexts where the user's privileges are
   * irrelevant (e.g. crawler/indexer tasks).
   */
  getDocuments: (params: {
    ids: string[];
    spaceId: string;
    esClient: IScopedClusterClient;
  }) => Promise<Map<string, SmlDocument>>;

  /** Get a type definition by ID */
  getTypeDefinition: (typeId: string) => SmlTypeDefinition | undefined;

  /** List all registered type definitions */
  listTypeDefinitions: () => SmlTypeDefinition[];
}
