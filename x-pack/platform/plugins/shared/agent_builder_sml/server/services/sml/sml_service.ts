/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { errors } from '@elastic/elasticsearch';
import type { FieldValue } from '@elastic/elasticsearch/lib/api/types';
import type { IScopedClusterClient } from '@kbn/core-elasticsearch-server';
import type { Logger } from '@kbn/logging';
import type { KibanaRequest } from '@kbn/core-http-server';
import type { AuthorizationServiceSetup } from '@kbn/security-plugin-types-server';
import type {
  SmlService,
  SmlSearchResult,
  SmlAutocompleteResult,
  SmlDocument,
  SmlTypeDefinition,
  SmlSearchFilters,
  SmlSearchConstraints,
  SmlKibanaPrivilegeGroup,
} from './types';
import { createSmlTypeRegistry, type SmlTypeRegistry } from './sml_type_registry';
import { createSmlIndexer, type SmlIndexer } from './sml_indexer';
import { SmlCrawlerImpl } from './sml_crawler';
import type { SmlCrawler } from './types';
import { smlIndexName } from './sml_storage';
import { SmlAuthzEnumerationIncompleteError, SmlCorpusTooLargeError } from './sml_errors';
// ES client usage pattern in this module:
// - Read operations (search, getDocuments, checkAccess) use `esClient.asInternalUser` directly with
//   `allow_no_indices: true` / `ignore_unavailable: true` so they silently handle a missing index.
// - Every write path (origin-mode crawler, HTTP PUT/DELETE) goes through `SmlIndexer` so
//   type-registration enforcement, permission derivation, and storage shape stay consistent.
//   There are no document-write paths in this file.

export interface SmlServiceSetup {
  /**
   * Register an SML type definition.
   * Should be called during plugin setup.
   */
  registerType: (definition: SmlTypeDefinition) => void;
}

interface SmlServiceStartDeps {
  logger: Logger;
  securityAuthz?: AuthorizationServiceSetup;
}

export interface SmlServiceInstance {
  setup: (deps: { logger: Logger }) => SmlServiceSetup;
  start: (deps: SmlServiceStartDeps) => SmlService;
}

export const createSmlService = (): SmlServiceInstance => {
  return new SmlServiceImpl();
};

class SmlServiceImpl implements SmlServiceInstance {
  private registry: SmlTypeRegistry;
  private indexer?: SmlIndexer;
  private crawler?: SmlCrawler;
  private securityAuthz?: AuthorizationServiceSetup;

  constructor() {
    this.registry = createSmlTypeRegistry();
  }

  setup({ logger }: { logger: Logger }): SmlServiceSetup {
    return {
      registerType: (definition: SmlTypeDefinition) => {
        this.registry.register(definition);
        logger.info(`Registered SML type: ${definition.id}`);
      },
    };
  }

  start({ logger, securityAuthz }: SmlServiceStartDeps): SmlService {
    this.securityAuthz = securityAuthz;
    if (!securityAuthz) {
      logger.warn(
        'SML service started without security authorization — permission checks are disabled (open access)'
      );
    }
    this.indexer = createSmlIndexer({ registry: this.registry, logger: logger.get('indexer') });
    this.crawler = new SmlCrawlerImpl({
      indexer: this.indexer,
      logger: logger.get('crawler'),
    });

    const crawler = this.crawler;

    return {
      getCrawler: () => crawler,
      search: async ({
        query,
        size = 10,
        fields,
        spaceId,
        esClient,
        request,
        constraints,
        filters,
      }) => {
        return searchSml({
          query,
          size,
          fields,
          spaceId,
          esClient,
          request,
          securityAuthz: this.securityAuthz,
          logger,
          constraints,
          filters,
        });
      },
      autocomplete: async ({
        query,
        size = 10,
        spaceId,
        esClient,
        request,
        constraints,
        filters,
      }) => {
        return autocompleteSml({
          query,
          size,
          spaceId,
          esClient,
          request,
          securityAuthz: this.securityAuthz,
          logger,
          constraints,
          filters,
          registeredTypeIds: this.registry.list().map(({ id }) => id),
        });
      },
      checkItemsAccess: async ({ ids, spaceId, esClient, request }) => {
        return checkItemsAccess({
          ids,
          spaceId,
          esClient,
          request,
          securityAuthz: this.securityAuthz,
          logger,
        });
      },
      indexAttachment: async (params) => {
        return this.getIndexer().indexAttachment(params);
      },
      deleteAttachment: async (params) => {
        return this.getIndexer().deleteAttachment(params);
      },
      getDocuments: async ({ ids, spaceId, esClient }) => {
        return getDocumentsByIds({ ids, spaceId, esClient, logger });
      },
      getTypeDefinition: (typeId: string) => {
        return this.registry.get(typeId);
      },
      listTypeDefinitions: () => {
        return this.registry.list();
      },
    };
  }

  private getIndexer(): SmlIndexer {
    if (!this.indexer) {
      throw new Error('SML indexer not initialized — call start() first');
    }
    return this.indexer;
  }
}

export const isNotFoundError = (error: unknown): boolean => {
  return error instanceof errors.ResponseError && error.statusCode === 404;
};

/**
 * Privilege check for SML entries. Batch-checks which of the given Kibana
 * action strings are authorized for the user in the current space via a
 * single `_has_privileges` call (Kibana's `checkPrivileges` wrapper).
 *
 * Fails closed (empty Set) on error to avoid over-disclosure — a
 * transient ES error must not silently bypass the check.
 */
const getAuthorizedPrivileges = async ({
  permissions,
  request,
  securityAuthz,
  logger,
}: {
  permissions: string[];
  request: KibanaRequest;
  securityAuthz: AuthorizationServiceSetup;
  logger: Logger;
}): Promise<Set<string>> => {
  if (permissions.length === 0) {
    return new Set();
  }

  try {
    const checkPrivileges = securityAuthz.checkPrivilegesDynamicallyWithRequest(request);
    const response = await checkPrivileges({ kibana: permissions });

    return new Set(response.privileges.kibana.filter((p) => p.authorized).map((p) => p.privilege));
  } catch (error) {
    logger.warn(`SML privilege check failed; failing closed: ${(error as Error).message}`);
    return new Set();
  }
};

/**
 * The `nested` privileges field and its leaves (see sml_storage.ts). These paths are shared by the
 * enumeration aggregation, the authz filter, and the indexer's space-scoped delete.
 */
const PRIVILEGES_PATH = 'permissions.kibana.privileges' as const;
const PERM_NAME_FIELD = `${PRIVILEGES_PATH}.name` as const;
const PERM_SPACE_FIELD = `${PRIVILEGES_PATH}.space` as const;
const PERM_COUNT_FIELD = `${PRIVILEGES_PATH}.count` as const;

/**
 * The `nested` sub-query selecting elements that apply in `spaceId`: the space's own elements plus
 * any scoped to the global wildcard. Shared by the enumeration aggregation and the authz filter so
 * the two cannot drift.
 */
const spaceScopeQuery = (spaceId: string) => ({
  bool: {
    should: [{ term: { [PERM_SPACE_FIELD]: spaceId } }, { term: { [PERM_SPACE_FIELD]: '*' } }],
    minimum_should_match: 1,
  },
});

/**
 * Enumerate every distinct action present in the SML corpus that applies in `spaceId`.
 *
 * `permissions.kibana.privileges` is a `nested` field, so `_terms_enum` can no longer be used: it
 * reads one inverted-index field and cannot correlate `.name` with the `.space` on the same
 * element, which is exactly the correlation the space scoping depends on. Instead we run a
 * `composite` aggregation under `nested` -> `filter`, a parent chain Elasticsearch explicitly
 * permits for `composite`.
 *
 * `composite` rather than `terms` because enumeration here is a security primitive: `terms` is
 * approximate and would leave us inferring truncation from `sum_other_doc_count`, whereas
 * `composite` paginates exhaustively via `after_key`. Authorizing against a truncated universe
 * would silently grant access to values we never checked.
 *
 * Fail-closed contract: any shard failure, or exceeding the page ceiling, throws rather than
 * returning a partial set. A missing index returns `[]` (empty corpus), mirroring the
 * search/autocomplete paths.
 *
 * Read as the internal user, so DLS on the SML system index does not narrow the universe.
 */
const enumerateActionsInSpace = async ({
  spaceId,
  esClient,
  logger,
  pageSize = 1000,
  maxPages = 100,
}: {
  spaceId: string;
  esClient: IScopedClusterClient;
  logger: Logger;
  pageSize?: number;
  maxPages?: number;
}): Promise<string[]> => {
  const values: string[] = [];
  let afterKey: Record<string, string> | undefined;

  try {
    for (let page = 0; page < maxPages; page++) {
      const response = await esClient.asInternalUser.search({
        index: smlIndexName,
        size: 0,
        aggs: {
          privileges: {
            nested: { path: PRIVILEGES_PATH },
            aggs: {
              in_space: {
                filter: spaceScopeQuery(spaceId),
                aggs: {
                  names: {
                    composite: {
                      size: pageSize,
                      sources: [{ name: { terms: { field: PERM_NAME_FIELD } } }],
                      ...(afterKey ? { after: afterKey } : {}),
                    },
                  },
                },
              },
            },
          },
        },
      });

      if ((response._shards?.failed ?? 0) > 0) {
        logger.warn(`nested privileges aggregation had shard failures; failing closed`);
        throw new SmlAuthzEnumerationIncompleteError(
          `Could not complete permission authorization for this search; please retry.`
        );
      }

      const names = (
        response.aggregations as
          | {
              privileges?: {
                in_space?: {
                  names?: {
                    buckets?: Array<{ key: { name: string } }>;
                    after_key?: Record<string, string>;
                  };
                };
              };
            }
          | undefined
      )?.privileges?.in_space?.names;

      const buckets = names?.buckets ?? [];
      values.push(...buckets.map((b) => b.key.name));

      if (buckets.length < pageSize || !names?.after_key) {
        return values;
      }
      afterKey = names.after_key;
    }
  } catch (error) {
    if (error instanceof SmlAuthzEnumerationIncompleteError) {
      throw error;
    }
    if (isNotFoundError(error)) {
      logger.debug(`SML index does not exist yet — privilege universe is empty`);
      return [];
    }
    throw error;
  }

  throw new SmlCorpusTooLargeError(
    `Too many distinct permission values to authorize this search; the limit is ${
      maxPages * pageSize
    }.`
  );
};

/**
 * Result of the request-scoped pre-aggregation pass.
 *
 * `authorizedActions` are the bare Kibana action strings the caller holds, intersected against what
 * the corpus actually uses in this space. `spaceId` travels with them because the authz filter needs
 * it to scope the nested clause.
 */
interface AuthorizedUniverse {
  authorizedActions: string[];
  spaceId: string;
}

/**
 * Pre-aggregation pass: enumerate the actions the corpus requires in this space (or globally), then
 * resolve which of them the caller holds via a single `_has_privileges` call.
 *
 * If the corpus uses no Kibana privileges, the privilege check is skipped entirely.
 */
const resolveAuthorizedUniverse = async ({
  esClient,
  request,
  securityAuthz,
  logger,
  spaceId,
}: {
  esClient: IScopedClusterClient;
  request: KibanaRequest;
  securityAuthz: AuthorizationServiceSetup;
  logger: Logger;
  spaceId: string;
}): Promise<AuthorizedUniverse> => {
  const actions = await enumerateActionsInSpace({ spaceId, esClient, logger });

  const authorizedActionsSet = await getAuthorizedPrivileges({
    permissions: actions,
    request,
    securityAuthz,
    logger,
  });

  return { authorizedActions: [...authorizedActionsSet].sort(), spaceId };
};

/**
 * The document-visibility filter, as Query DSL. Applied UNCONDITIONALLY — space scoping must not
 * depend on the security plugin, because Spaces are available (and space isolation expected) on a
 * Basic license with security disabled.
 *
 * Mirrors the Elasticsearch-side implicit DLS query: a document is visible when it carries no
 * privilege elements at all (public), OR when at least one element scoped to this requested space
 * (or to the global wildcard) matches. What "matches" means depends on `authz`:
 * - with `authz` (security plugin present), the element must additionally either require no
 *   actions at all (`count: 0` and no action names — see below) or have ALL of its actions covered
 *   by what the caller holds (the `terms_set` clause);
 * - without `authz` (security plugin absent — dev / test), space scoping alone applies:
 *   privilege enforcement is skipped, matching the open-access semantics of every other
 *   Kibana surface in that configuration.
 *
 * `count: 0` with no names is the public escape a type without `getPermissions` gets (one empty
 * element per space), per {@link SmlTypeDefinition.getPermissions}. Since the indexer derives
 * `count` from the list, `count: 0` *with* a name is malformed: the public branch requires no
 * names, the gated branch requires `count > 0`, so both reject it and it fails CLOSED.
 *
 * The public-document branch must be `must_not nested(match_all)`, not `must_not exists`: the
 * values live on child documents, so a root-level `exists` on a nested leaf matches everything and
 * would turn the whole filter into a no-op. The `must_not exists` inside the `count: 0` branch is
 * a different case — it sits *within* the `nested` query, where it is evaluated per child document.
 *
 * This is passed to the ES|QL `_query` API's `filter` parameter rather than expressed as a WHERE
 * clause, because ES|QL's index resolution excludes `nested` fields — they cannot be referenced as
 * columns at all. A Query DSL filter is pushed down to Lucene and does support them.
 *
 * `minimum_should_match: 1` is stated explicitly and MUST NOT be dropped. When ES|QL
 * pushes this filter into a `FORK` plan (every non-empty search query builds one)
 * the outer `bool` lands in the filter context, where a `should`-only bool
 * defaults to `minimum_should_match: 0` and therefore matches every document.
 */
const buildVisibilityFilter = ({
  spaceId,
  authz,
}: {
  spaceId: string;
  authz?: AuthorizedUniverse;
}): Record<string, unknown> => ({
  bool: {
    minimum_should_match: 1,
    should: [
      {
        bool: {
          must_not: [
            { nested: { path: PRIVILEGES_PATH, query: { match_all: {} }, score_mode: 'none' } },
          ],
        },
      },
      {
        nested: {
          path: PRIVILEGES_PATH,
          score_mode: 'none',
          query: {
            bool: {
              filter: [
                spaceScopeQuery(spaceId),
                ...(authz
                  ? [
                      {
                        bool: {
                          minimum_should_match: 1,
                          should: [
                            // Public escape: zero required actions, no names.
                            {
                              bool: {
                                filter: [
                                  { term: { [PERM_COUNT_FIELD]: 0 } },
                                  { bool: { must_not: [{ exists: { field: PERM_NAME_FIELD } }] } },
                                ],
                              },
                            },
                            {
                              bool: {
                                filter: [
                                  { range: { [PERM_COUNT_FIELD]: { gt: 0 } } },
                                  {
                                    terms_set: {
                                      [PERM_NAME_FIELD]: {
                                        terms: authz.authorizedActions,
                                        minimum_should_match_field: PERM_COUNT_FIELD,
                                      },
                                    },
                                  },
                                ],
                              },
                            },
                          ],
                        },
                      },
                    ]
                  : []),
              ],
            },
          },
        },
      },
    ],
  },
});

/** Privilege groups scoped to this space or the global wildcard; others are irrelevant. */
const relevantGroupsInSpace = (
  privileges: SmlKibanaPrivilegeGroup[],
  spaceId: string
): SmlKibanaPrivilegeGroup[] => privileges.filter((g) => g.space === spaceId || g.space === '*');

/**
 * Whether the caller may access each SML item. Grants when it holds at least `count` distinct named
 * actions of a group scoped to this space (or the wildcard). Items with no privileges are public;
 * with the security plugin absent every id resolves to `true` (open access).
 */
const checkItemsAccess = async ({
  ids,
  spaceId,
  esClient,
  request,
  securityAuthz,
  logger,
}: {
  ids: string[];
  spaceId: string;
  esClient: IScopedClusterClient;
  request: KibanaRequest;
  securityAuthz?: AuthorizationServiceSetup;
  logger: Logger;
}): Promise<Map<string, boolean>> => {
  const accessMap = new Map<string, boolean>();

  // When the security plugin is absent, grant access to all items.
  if (!securityAuthz) {
    for (const id of ids) {
      accessMap.set(id, true);
    }
    return accessMap;
  }

  let docAuthz: Map<string, SmlKibanaPrivilegeGroup[]>;
  try {
    const response = await esClient.asInternalUser.search<
      Pick<SmlDocument, 'attributes' | 'permissions'>
    >({
      index: smlIndexName,
      size: ids.length,
      allow_no_indices: true,
      ignore_unavailable: true,
      query: {
        bool: {
          filter: [{ terms: { 'attributes.id': ids } }],
        },
      },
      _source: ['attributes.id', 'permissions'],
    });

    docAuthz = new Map(
      response.hits.hits
        .filter((hit) => hit._source != null)
        .map((hit) => {
          const source = hit._source!;
          return [source.attributes?.id ?? '', source.permissions?.kibana?.privileges ?? []] as [
            string,
            SmlKibanaPrivilegeGroup[]
          ];
        })
    );
  } catch (error) {
    if (isNotFoundError(error)) {
      for (const id of ids) {
        accessMap.set(id, false);
      }
      return accessMap;
    }
    logger.warn(`SML items access check failed: ${(error as Error).message}`);
    for (const id of ids) {
      accessMap.set(id, false);
    }
    return accessMap;
  }

  const relevantGroupsByDoc = new Map<string, SmlKibanaPrivilegeGroup[]>();
  for (const [id, groups] of docAuthz) {
    relevantGroupsByDoc.set(id, relevantGroupsInSpace(groups, spaceId));
  }

  const uniqueActions = [
    ...new Set([...relevantGroupsByDoc.values()].flat().flatMap((g) => g.name)),
  ];

  const authorizedPerms = await getAuthorizedPrivileges({
    permissions: uniqueActions,
    request,
    securityAuthz,
    logger,
  });

  for (const id of ids) {
    const groups = relevantGroupsByDoc.get(id);
    if (groups === undefined) {
      // No such document in the corpus.
      accessMap.set(id, false);
      continue;
    }
    // A document carrying no privilege elements at all is public, matching the ES-side
    // `must_not nested(match_all)` branch. One with elements but none for this space is not
    // visible here.
    if ((docAuthz.get(id) ?? []).length === 0) {
      accessMap.set(id, true);
      continue;
    }
    accessMap.set(
      id,
      groups.some((group) => {
        if (group.count === 0) {
          return group.name.length === 0;
        }
        const distinctHeld = new Set(group.name.filter((action) => authorizedPerms.has(action)));
        return group.count > 0 && group.name.length > 0 && distinctHeld.size >= group.count;
      })
    );
  }

  return accessMap;
};

/**
 * Per-FORK-branch candidate depth multiplier. Each retrieval leg (BM25 +
 * semantic) collects size × MAX_SCAN_MULTIPLIER candidates before FUSE computes
 * RRF scores, so a relevant doc ranked outside the top `size` on one leg can
 * still surface after fusion. Authorization is now enforced in-query (a
 * pre-FORK WHERE), so this no longer absorbs a post-filter — the outer LIMIT
 * bounds the final set to `size`.
 */
const MAX_SCAN_MULTIPLIER = 10;

/** BM25 text fields searched in the first FORK branch. */
const SML_BM25_FIELDS = ['title', 'description', 'content'] as const;

/** Semantic multi-fields searched in the second FORK branch. */
const SML_SEMANTIC_FIELDS = ['title.semantic', 'description.semantic', 'content.semantic'] as const;

/**
 * Build an ES|QL query string + positional params array for the SML search path.
 *
 * Non-empty queries: two FORK branches merged by FUSE with RRF — one BM25
 * branch (MATCH across title, description, content) and one semantic branch
 * (MATCH across their semantic_text multi-fields). Mirrors the two-retriever
 * structure of the old `retriever.rrf fields` DSL shorthand. Filters are
 * applied as WHERE clauses before FORK so every branch operates on the same
 * filtered set.
 *
 * Empty string or `*`: plain sorted scan — no FORK/FUSE, no relevance signal.
 *
 * Tag filters use MV_CONTAINS rather than `==` because `==` returns null (not
 * false) on multi-value fields — an ES|QL semantic that would silently drop
 * multi-tag documents.
 *
 * Authorization is enforced via a `nested` Query DSL filter pushed into the ES|QL `_query` API's
 * `filter` parameter (not a WHERE clause). The caller passes `buildVisibilityFilter(...)` to the
 * `esql.query` call. It has to be a pushed-down filter rather than a WHERE clause because ES|QL's
 * index resolution excludes `nested` fields, so `permissions.kibana.privileges.*` cannot be
 * referenced as a column at all. Space scoping lives in the filter's `.space` term.
 *
 * `references.uri` is extracted via EVAL before KEEP so the result column is
 * a flat keyword array that can be reconstructed into Array<{uri}> client-side.
 */
const buildSmlEsqlQuery = ({
  query,
  size,
  fields,
  constraints,
  filters,
}: {
  query: string;
  size: number;
  fields?: string[];
  constraints?: SmlSearchConstraints;
  filters?: SmlSearchFilters;
}): { esql: string; params: unknown[] } => {
  const params: unknown[] = [];
  // METADATA is required for FUSE (which needs _id, _index, _score to compute RRF).
  const lines: string[] = [`FROM ${smlIndexName} METADATA _id, _index, _score`];

  // ES|QL cannot address keys of a `flattened` field as `attributes.x`; FIELD_EXTRACT them into
  // plain keyword columns up front so the WHERE / SORT / KEEP below can use them.
  lines.push(
    '| EVAL id = FIELD_EXTRACT(attributes, "id"), origin_uri = FIELD_EXTRACT(attributes, "origin.uri")'
  );

  // runtime-imposed per-type id-allowlist constraints
  if (constraints) {
    for (const [typeId, criteria] of Object.entries(constraints)) {
      if (!criteria?.ids) continue;
      if (criteria.ids.length === 0) {
        // Explicitly empty → exclude all documents of this type
        params.push(typeId);
        lines.push('| WHERE type != ?');
      } else {
        // Non-empty → allow matching docs of this type, pass through other types
        const uriPlaceholders = criteria.ids.map(() => '?').join(', ');
        params.push(typeId, ...criteria.ids.map((id) => `${typeId}://${id}`));
        lines.push(`| WHERE type != ? OR origin_uri IN (${uriPlaceholders})`);
      }
    }
  }

  // agent-discoverable type filter
  if (filters?.types && filters.types.length > 0) {
    const placeholders = filters.types.map(() => '?').join(', ');
    params.push(...filters.types);
    lines.push(`| WHERE type IN (${placeholders})`);
  }

  // agent-discoverable tag filter — MV_CONTAINS for multi-value safety
  if (filters?.tags && filters.tags.length > 0) {
    const tagConditions = filters.tags.map((tag) => {
      params.push(tag);
      return 'MV_CONTAINS(tags, ?)';
    });
    lines.push(`| WHERE ${tagConditions.join(' OR ')}`);
  }

  const trimmed = query.trim();
  if (trimmed === '' || trimmed === '*') {
    lines.push('| SORT id ASC');
  } else {
    // SORT _score DESC inside each branch is required so LIMIT selects the
    // top-scoring candidates before FUSE computes RRF ranks. Without it,
    // LIMIT takes the first N docs in scan order and FUSE assigns arbitrary
    // ranks, producing wrong results regardless of relevance scores.
    lines.push('| FORK');
    const bm25Conditions = SML_BM25_FIELDS.map((field) => {
      params.push(trimmed);
      return `MATCH(${field}, ?)`;
    }).join(' OR ');
    lines.push(
      `  (WHERE ${bm25Conditions} | SORT _score DESC | LIMIT ${size * MAX_SCAN_MULTIPLIER})`
    );
    const semanticConditions = SML_SEMANTIC_FIELDS.map((field) => {
      params.push(trimmed);
      return `MATCH(${field}, ?)`;
    }).join(' OR ');
    lines.push(
      `  (WHERE ${semanticConditions} | SORT _score DESC | LIMIT ${size * MAX_SCAN_MULTIPLIER})`
    );
    lines.push('| FUSE');
    lines.push('| SORT _score DESC, id ASC');
  }

  lines.push(`| LIMIT ${size}`);

  // description is included in the baseline (short summary, useful for triage).
  // content, tags, references, and permissions are opt-in via the fields param.
  const DEFAULT_FIELDS = new Set(['description']);
  const shouldKeep = (f: string) =>
    fields !== undefined ? fields.includes(f) : DEFAULT_FIELDS.has(f);

  // Materialize `references.uri` into a flat column before KEEP.
  if (shouldKeep('references')) {
    lines.push('| EVAL ref_uris = references.uri');
  }

  const keepCols = [
    'id',
    'type',
    'title',
    'origin_uri',
    ...(shouldKeep('description') ? ['description'] : []),
    ...(shouldKeep('tags') ? ['tags'] : []),
    ...(shouldKeep('references') ? ['ref_uris'] : []),
    ...(shouldKeep('content') ? ['content'] : []),
  ];
  lines.push(`| KEEP ${keepCols.join(', ')}`);

  return { esql: lines.join('\n'), params };
};

/**
 * Build an ES filter clause from runtime-imposed per-type constraints.
 *
 * For each type with an `ids` constraint, the filter returns documents that
 * either (a) match the type AND have an origin_id in the list, or (b) are
 * NOT of the constrained type. Types without constraints are unaffected.
 *
 * Renamed from `buildTypeFilters` to reflect the trust-boundary split
 * between runtime-imposed scope and agent-discoverable filters.
 */
export const buildConstraintsFilter = (
  constraints: SmlSearchConstraints | undefined
): Record<string, unknown> | undefined => {
  if (!constraints) {
    return undefined;
  }

  const clauses: Array<Record<string, unknown>> = [];

  for (const [typeId, criteria] of Object.entries(constraints)) {
    if (!criteria?.ids) {
      continue;
    }

    if (criteria.ids.length === 0) {
      // Explicitly empty → exclude all documents of this type
      clauses.push({ bool: { must_not: [{ term: { type: typeId } }] } });
    } else {
      // Non-empty → allow matching documents of this type, pass through other types
      clauses.push({
        bool: {
          should: [
            {
              terms: { 'attributes.origin.uri': criteria.ids.map((id) => `${typeId}://${id}`) },
            },
            {
              bool: {
                must_not: [{ term: { type: typeId } }],
              },
            },
          ],
          minimum_should_match: 1,
        },
      });
    }
  }

  if (clauses.length === 0) {
    return undefined;
  }

  if (clauses.length === 1) {
    return clauses[0];
  }

  return { bool: { must: clauses } };
};

/**
 * Build ES filter clauses from agent-discoverable filters (`types[]`,
 * `tags[]`). Each dimension lowers into a single `terms` clause; multiple
 * dimensions AND together via inclusion in the outer `filter` list.
 *
 * Empty arrays are ignored (treated as "no constraint") — the agent has no
 * way to express "exclude everything" and passing `[]` accidentally should
 * be a no-op.
 */
export const buildAgentFilters = (
  filters: SmlSearchFilters | undefined
): Array<Record<string, unknown>> => {
  if (!filters) {
    return [];
  }

  const clauses: Array<Record<string, unknown>> = [];

  if (filters.types && filters.types.length > 0) {
    clauses.push({ terms: { type: filters.types } });
  }

  if (filters.tags && filters.tags.length > 0) {
    clauses.push({ terms: { tags: filters.tags } });
  }

  return clauses;
};

/**
 * Returns true for ES|QL errors that indicate the SML index does not exist yet.
 * ES|QL does not support `ignore_unavailable`; a missing index surfaces as a
 * `verification_exception` (400) or `index_not_found_exception` (400/404).
 */
const isEsqlIndexMissingError = (error: unknown): boolean => {
  if (!(error instanceof errors.ResponseError)) return false;
  const body = error.body as { error?: { type?: string; reason?: string } } | undefined;
  if (body?.error?.type === 'index_not_found_exception') return true;
  if (body?.error?.type === 'verification_exception') {
    // verification_exception covers many error types; narrow to missing-index cases.
    const reason = body.error?.reason ?? '';
    return reason.includes('no such index') || reason.includes('Unknown index');
  }
  return false;
};

/**
 * Search the SML index using ES|QL FORK + FUSE hybrid retrieval, with
 * authorization enforced in-query via pre-aggregation.
 *
 * Before the search, `resolveAuthorizedUniverse` enumerates the corpus's Kibana-privilege
 * universe for this space (a `composite` aggregation under `nested`) and resolves, in a single
 * `_has_privileges` call, which Kibana actions the caller is authorized for. The resulting set is
 * pushed as a `nested` Query DSL filter via the ES|QL `_query` API `filter` param, so the index
 * returns only authorized docs — no overfetch, no JS post-filter. The outer LIMIT is exactly
 * `size`.
 *
 * When the security plugin is absent (dev / test), enumeration is skipped and
 * privilege enforcement drops out of the pushed filter — but space scoping is still applied, so
 * only docs visible in the requested space are returned (Spaces work without security).
 *
 * Non-empty queries: two FORK branches (BM25 over all text fields + semantic
 * over all semantic multi-fields), merged by FUSE with RRF — mirrors the old
 * `retriever.rrf fields` two-retriever structure. Empty string or `*`: plain
 * sorted scan, no relevance signal.
 *
 * Filter composition: authz (`terms_set` via ES|QL `filter` param) +
 * constraints (runtime-imposed per-type id-allowlist) + agent filters
 * — authz is a Query DSL filter; constraints and tags are WHERE clauses
 * (ANDed across dimensions); within types and tags, matching is OR.
 */
const searchSml = async ({
  query,
  size,
  fields,
  spaceId,
  esClient,
  request,
  securityAuthz,
  logger,
  constraints,
  filters,
}: {
  query: string;
  size: number;
  fields?: string[];
  spaceId: string;
  esClient: IScopedClusterClient;
  request: KibanaRequest;
  securityAuthz?: AuthorizationServiceSetup;
  logger: Logger;
  constraints?: SmlSearchConstraints;
  filters?: SmlSearchFilters;
}): Promise<{ results: SmlSearchResult[] }> => {
  logger.debug(`SML search: query=${JSON.stringify(query)}, size=${size}, spaceId='${spaceId}'`);

  let authz: AuthorizedUniverse | undefined;
  if (securityAuthz) {
    authz = await resolveAuthorizedUniverse({ esClient, request, securityAuthz, logger, spaceId });
    logger.debug(`SML search authz: actions=${authz.authorizedActions.length}`);
  }

  const { esql, params } = buildSmlEsqlQuery({
    query,
    size,
    fields,
    constraints,
    filters,
  });

  let response: { columns: Array<{ name: string; type: string }>; values: unknown[][] };
  try {
    response = await esClient.asInternalUser.esql.query({
      query: esql,
      ...(params.length > 0 ? { params: params as unknown as FieldValue[] } : {}),
      // Always pushed: space scoping must hold even without the security plugin.
      filter: buildVisibilityFilter({ spaceId, authz }),
    });
  } catch (error) {
    if (isNotFoundError(error) || isEsqlIndexMissingError(error)) {
      logger.debug('SML index does not exist yet — returning empty results');
      return { results: [] };
    }
    logger.warn(`SML search failed: ${(error as Error).message}`);
    throw error;
  }

  const colIndex = new Map<string, number>(response.columns.map((col, i) => [col.name, i]));

  const toStringArray = (v: unknown): string[] => {
    if (v == null) return [];
    return Array.isArray(v) ? (v as unknown[]).filter((s) => s != null).map(String) : [String(v)];
  };

  const allResults: SmlSearchResult[] = response.values.map((row) => {
    const result: SmlSearchResult = {
      id: String(row[colIndex.get('id')!] ?? ''),
      type: String(row[colIndex.get('type')!] ?? ''),
      title: String(row[colIndex.get('title')!] ?? ''),
      origin: { uri: String(row[colIndex.get('origin_uri')!] ?? '') },
    };

    const contentIdx = colIndex.get('content');
    if (contentIdx !== undefined) {
      const content = row[contentIdx];
      if (content != null) result.content = String(content);
    }

    const descIdx = colIndex.get('description');
    if (descIdx !== undefined) {
      const desc = row[descIdx];
      if (desc != null) result.description = String(desc);
    }

    const tagsIdx = colIndex.get('tags');
    if (tagsIdx !== undefined) {
      const rawTags = row[tagsIdx];
      if (rawTags != null) result.tags = toStringArray(rawTags);
    }

    const refUrisIdx = colIndex.get('ref_uris');
    if (refUrisIdx !== undefined) {
      const refUris = toStringArray(row[refUrisIdx]);
      if (refUris.length > 0) result.references = refUris.map((uri) => ({ uri }));
    }

    return result;
  });

  // Authorization is enforced via the terms_set filter; LIMIT bounds to `size`.
  logger.debug(`SML search: returned=${response.values.length}, size=${size}`);
  return { results: allResults };
};

// Every typed token must match, with the last one matched as a prefix.
const buildTitlePrefixClause = (text: string): Record<string, unknown> => ({
  match_bool_prefix: { title: { query: text, operator: 'and' } },
});

// `type` is a low-cardinality keyword, so a `prefix` query is cheap.
const buildTypePrefixClause = (text: string): Record<string, unknown> => ({
  prefix: { type: text.toLowerCase() },
});

const buildTypeTermsClause = (typeIds: string[]): Record<string, unknown> => ({
  terms: { type: typeIds },
});

/**
 * The abbreviation "conn" resolves to `['connector']`.
 * Empty when no type is resolved.
 */
const resolveTypeIds = (text: string, registeredTypeIds: string[]): string[] => {
  const lowered = text.toLowerCase();
  return registeredTypeIds.filter((id) => id.toLowerCase().startsWith(lowered));
};

/**
 * Build the autocomplete query. Results render as "type/title", so a slash splits
 * the input: the left side must name a registered type, the right prefix-matches
 * the title. A slash that names no type is part of the title, e.g.
 * "sales/marketing".
 */
const buildSmlAutocompleteQuery = (
  query: string,
  registeredTypeIds: string[]
): Record<string, unknown> => {
  const trimmed = query.trim();
  if (trimmed === '' || trimmed === '*') {
    return { match_all: {} };
  }

  const slashIdx = trimmed.indexOf('/');

  // No slash typed yet: the text could be either half, so match against both.
  if (slashIdx === -1) {
    return {
      bool: {
        should: [buildTitlePrefixClause(trimmed), buildTypePrefixClause(trimmed)],
        minimum_should_match: 1,
      },
    };
  }

  const typePart = trimmed.slice(0, slashIdx).trim();
  const namePart = trimmed.slice(slashIdx + 1).trim();

  // A lone "/" carries no signal, thus, match everything
  if (typePart === '' && namePart === '') {
    return { match_all: {} };
  }

  if (typePart === '') {
    return buildTitlePrefixClause(namePart);
  }

  const typeIds = resolveTypeIds(typePart, registeredTypeIds);
  if (typeIds.length === 0) {
    return buildTitlePrefixClause(trimmed);
  }

  if (namePart === '') {
    return { bool: { filter: [buildTypeTermsClause(typeIds)] } };
  }

  return {
    bool: {
      filter: [buildTypeTermsClause(typeIds)],
      must: [buildTitlePrefixClause(namePart)],
    },
  };
};

/**
 * Autocomplete the SML index. Prefix-only, with per-row provenance for the @ menu.
 *
 * When the security plugin is absent (dev / test), privilege enforcement is
 * skipped but space scoping is still applied — only docs visible in the requested space are
 * returned (Spaces work without security).
 */
const autocompleteSml = async ({
  query,
  size,
  spaceId,
  esClient,
  request,
  securityAuthz,
  logger,
  constraints,
  filters,
  registeredTypeIds,
}: {
  query: string;
  size: number;
  spaceId: string;
  esClient: IScopedClusterClient;
  request: KibanaRequest;
  securityAuthz?: AuthorizationServiceSetup;
  logger: Logger;
  constraints?: SmlSearchConstraints;
  filters?: SmlSearchFilters;
  /** Used to tell a "type/name" query apart from a title that contains a slash. */
  registeredTypeIds: string[];
}): Promise<{ results: SmlAutocompleteResult[] }> => {
  logger.debug(
    `SML autocomplete: query=${JSON.stringify(
      query
    )}, size=${size}, spaceId='${spaceId}', index='${smlIndexName}'`
  );

  // Pre-aggregation: resolve the caller's authorized permission universe so
  // the query can filter to authorized docs in-query. Skipped when the
  // security plugin is absent (dev / test) — open-access parity.
  let authz: AuthorizedUniverse | undefined;
  if (securityAuthz) {
    authz = await resolveAuthorizedUniverse({ esClient, request, securityAuthz, logger, spaceId });
    logger.debug(`SML autocomplete authz: actions=${authz.authorizedActions.length}`);
  }

  try {
    const smlQuery = buildSmlAutocompleteQuery(query, registeredTypeIds);

    // Always applied: space scoping must hold even without the security plugin.
    const filterClauses: Array<Record<string, unknown>> = [
      buildVisibilityFilter({ spaceId, authz }),
    ];

    const constraintsFilter = buildConstraintsFilter(constraints);
    if (constraintsFilter) {
      filterClauses.push(constraintsFilter);
    }
    for (const agentClause of buildAgentFilters(filters)) {
      filterClauses.push(agentClause);
    }

    const response = await esClient.asInternalUser.search<SmlDocument>({
      index: smlIndexName,
      size,
      allow_no_indices: true,
      ignore_unavailable: true,
      query: {
        bool: {
          must: [smlQuery],
          filter: filterClauses,
        },
      },
      // Order will be arbitrary as every result scores the same. `attributes.updated_at` is a
      // `flattened` keyword holding an ISO-8601 string, so a lexical sort is still chronological.
      sort: [
        { _score: { order: 'desc' } },
        { 'attributes.updated_at': 'desc' },
        { 'attributes.id': 'asc' },
      ],
      _source: ['attributes.id', 'type', 'title', 'attributes.origin'],
    });

    const results: SmlAutocompleteResult[] = response.hits.hits
      .filter((hit) => hit._source != null)
      .map((hit) => {
        const source = hit._source!;
        return {
          id: source.attributes?.id ?? '',
          type: source.type ?? '',
          title: source.title ?? '',
          origin: { uri: source.attributes?.origin?.uri ?? '' },
        };
      });

    logger.debug(`SML autocomplete: returned ${results.length} result(s)`);

    return { results };
  } catch (error) {
    if (isNotFoundError(error)) {
      logger.debug('SML index does not exist yet — returning empty autocomplete results');
      return { results: [] };
    }
    logger.warn(`SML autocomplete failed: ${(error as Error).message}`);
    throw error;
  }
};

/**
 * Fetch SML documents by their IDs, scoped to a space.
 */
const getDocumentsByIds = async ({
  ids,
  spaceId,
  esClient,
  logger,
}: {
  ids: string[];
  spaceId: string;
  esClient: IScopedClusterClient;
  logger: Logger;
}): Promise<Map<string, SmlDocument>> => {
  const docMap = new Map<string, SmlDocument>();
  if (ids.length === 0) return docMap;

  try {
    const response = await esClient.asInternalUser.search<SmlDocument>({
      index: smlIndexName,
      size: ids.length,
      allow_no_indices: true,
      ignore_unavailable: true,
      query: {
        bool: {
          filter: [{ terms: { 'attributes.id': ids } }, buildVisibilityFilter({ spaceId })],
        },
      },
    });

    for (const { _source: doc } of response.hits.hits) {
      if (!doc) continue;
      docMap.set(doc.attributes.id, doc);
    }
  } catch (error) {
    if (!isNotFoundError(error)) {
      logger.warn(`SML getDocuments failed: ${(error as Error).message}`);
    }
  }

  return docMap;
};
