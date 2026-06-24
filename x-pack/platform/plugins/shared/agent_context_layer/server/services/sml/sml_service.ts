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
  SmlDocumentInput,
  SmlTypeDefinition,
  SmlUpsertResult,
  SmlSearchFilters,
  SmlSearchConstraints,
  MatchedDiscoveryLabel,
  SmlPermissions,
} from './types';
import { createSmlTypeRegistry, type SmlTypeRegistry } from './sml_type_registry';
import { createSmlIndexer, type SmlIndexer } from './sml_indexer';
import { SmlCrawlerImpl } from './sml_crawler';
import type { SmlCrawler } from './types';
import { smlIndexName, createSmlStorage } from './sml_storage';
import {
  SmlResultWindowExceededError,
  SmlAuthzEnumerationIncompleteError,
  SmlCorpusTooLargeError,
} from './sml_errors';

// ES client usage pattern in this module:
// - Read operations (search, get, list, checkAccess) use `esClient.asInternalUser` directly with
//   `allow_no_indices: true` / `ignore_unavailable: true` so they silently handle a missing index.
// - Write operations (upsert, delete) use `createSmlStorage` / `smlClient` so that
//   StorageIndexAdapter auto-creates the index on first write.

export interface SmlServiceSetup {
  /**
   * Register an SML type definition.
   * Should be called during plugin setup.
   */
  registerType: (definition: SmlTypeDefinition) => void;
}

export interface SmlServiceStartDeps {
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
        const rawResults = await autocompleteSml({
          query,
          size,
          spaceId,
          esClient,
          logger,
          constraints,
          filters,
        });
        return filterResultsByPermissions({
          searchResult: rawResults,
          request,
          securityAuthz: this.securityAuthz,
          logger,
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
      listDocuments: async ({ spaceId, esClient, page, perPage, type, originUri, tags }) => {
        return listDocuments({
          spaceId,
          esClient,
          logger,
          page,
          perPage,
          type,
          originId: originUri,
          tags,
        });
      },
      upsertDocument: async ({ id, spaceId, document, esClient }) => {
        return upsertDocument({ id, spaceId, document, esClient, logger });
      },
      deleteDocument: async ({ id, spaceId, esClient }) => {
        return deleteDocument({ id, spaceId, esClient, logger });
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
 * Empty-but-fully-shaped permissions object. Used as a fallback when
 * `_source.permissions` is somehow missing (legacy / test docs) and as
 * the input default in `upsertDocument`.
 */
const emptyPermissions = (): SmlDocument['permissions'] => ({
  kibana: { privileges: [] },
  elasticsearch: { indices: [] },
});

const isResultWindowExceededError = (error: unknown): boolean => {
  if (!(error instanceof errors.ResponseError) || error.statusCode !== 400) return false;
  const body = error.body as
    | {
        error?: {
          reason?: string;
          caused_by?: { reason?: string };
          root_cause?: Array<{ reason?: string }>;
        };
      }
    | undefined;
  const reasons = [
    body?.error?.reason,
    body?.error?.caused_by?.reason,
    ...(body?.error?.root_cause?.map((rc) => rc.reason) ?? []),
  ];
  return reasons.some(
    (reason) => typeof reason === 'string' && reason.includes('Result window is too large')
  );
};

/**
 * Combined privilege check for SML chunks. In a single ES `_has_privileges`
 * call (via Kibana's `checkPrivileges` wrapper), batch-checks:
 *
 *   - Which of the given Kibana action strings are authorized for the user
 *     in the current space.
 *   - Which of the given concrete Elasticsearch index / alias / data stream
 *     names the user has `read` on.
 *
 * Kibana's `checkPrivilegesDynamicallyWithRequest` packs both the
 * `application:` (Kibana feature privs) and `index:` (raw ES grants)
 * sections into the same `_has_privileges` POST, so this is one HTTP
 * round-trip — not two.
 *
 * Per `IndicesPermission.checkResourcePrivileges`, ES evaluates each
 * requested index name against the user's role grants by automaton
 * subset check, so callers must pass **concrete names only** — not
 * patterns. SML chunks store concrete names by construction.
 *
 * Fails closed (empty Sets) on error to avoid over-disclosure — a
 * transient ES error must not silently bypass either check.
 */
const getAuthorizedPrivileges = async ({
  permissions,
  indices,
  request,
  securityAuthz,
  logger,
}: {
  permissions: string[];
  indices: string[];
  request: KibanaRequest;
  securityAuthz: AuthorizationServiceSetup;
  logger: Logger;
}): Promise<{ authorizedPerms: Set<string>; authorizedIndices: Set<string> }> => {
  if (permissions.length === 0 && indices.length === 0) {
    return { authorizedPerms: new Set(), authorizedIndices: new Set() };
  }

  try {
    const checkPrivileges = securityAuthz.checkPrivilegesDynamicallyWithRequest(request);
    const response = await checkPrivileges({
      ...(permissions.length > 0 ? { kibana: permissions } : {}),
      ...(indices.length > 0
        ? {
            elasticsearch: {
              cluster: [],
              index: Object.fromEntries(indices.map((i) => [i, ['read']])),
            },
          }
        : {}),
    });

    const authorizedPerms = new Set(
      response.privileges.kibana.filter((p) => p.authorized).map((p) => p.privilege)
    );
    const authorizedIndices = new Set<string>();
    for (const [name, privs] of Object.entries(response.privileges.elasticsearch.index ?? {})) {
      if (privs.some((p) => p.privilege === 'read' && p.authorized)) {
        authorizedIndices.add(name);
      }
    }
    return { authorizedPerms, authorizedIndices };
  } catch (error) {
    logger.warn(`SML privilege check failed; failing closed: ${(error as Error).message}`);
    return { authorizedPerms: new Set(), authorizedIndices: new Set() };
  }
};

/**
 * Keyword leaf fields enumerated by the pre-aggregation pass. These are the
 * concrete `_terms_enum`-addressable leaves of the nested `permissions` object
 * (see sml_storage.ts) — the same paths the ES|QL authz filter references.
 */
const PERM_KIBANA_FIELD = 'permissions.kibana.privileges.name' as const;
const PERM_ES_INDICES_FIELD = 'permissions.elasticsearch.indices.name' as const;

type EnumerableAuthzField = typeof PERM_KIBANA_FIELD | typeof PERM_ES_INDICES_FIELD;

/**
 * Enumerate every distinct value of a keyword permission field across the SML
 * corpus via `_terms_enum`, paginated by `search_after`.
 *
 * Pre-aggregation needs the full universe of permission values present in the
 * corpus so it can resolve, up front, exactly which the caller is authorized
 * for. `_terms_enum` reads the inverted index directly (no doc scan), which is
 * far cheaper than aggregating, and is unaffected by Document Level Security on
 * the SML system index (we always read as the internal user).
 *
 * Fail-closed contract: a `complete: false` response (node error / timeout)
 * means the returned terms are a *subset* of the true universe. Authorizing
 * against a truncated universe would silently grant access to values we never
 * checked, so we throw rather than undercount. Likewise, exceeding the page
 * ceiling throws instead of proceeding with a partial set.
 *
 * A missing index returns `[]` (empty corpus), mirroring the empty-results
 * behavior of the search/autocomplete paths.
 *
 * `index_filter` is intentionally omitted: segment-level pruning is a no-op on
 * our single-primary-shard system index.
 */
const enumerateDistinctValues = async ({
  field,
  esClient,
  logger,
  pageSize = 1000,
  maxPages = 100,
}: {
  field: EnumerableAuthzField;
  esClient: IScopedClusterClient;
  logger: Logger;
  pageSize?: number;
  maxPages?: number;
}): Promise<string[]> => {
  const values: string[] = [];
  let searchAfter: string | undefined;

  try {
    for (let page = 0; page < maxPages; page++) {
      const response = await esClient.asInternalUser.termsEnum({
        index: smlIndexName,
        field,
        size: pageSize,
        ...(searchAfter !== undefined ? { search_after: searchAfter } : {}),
      });

      if (!response.complete) {
        logger.warn(`_terms_enum on '${field}' returned complete=false; failing closed`);
        throw new SmlAuthzEnumerationIncompleteError(
          `Could not complete permission authorization for this search; please retry.`
        );
      }

      values.push(...response.terms);

      if (response.terms.length < pageSize) {
        return values;
      }
      searchAfter = response.terms[response.terms.length - 1];
    }
  } catch (error) {
    if (error instanceof SmlAuthzEnumerationIncompleteError) {
      throw error;
    }
    if (isNotFoundError(error)) {
      logger.debug(`SML index does not exist yet — '${field}' universe is empty`);
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
 * `authorizedActions` / `authorizedIndices` are the values the caller is
 * authorized for, intersected against what the corpus actually uses. The
 * `*UniverseNonEmpty` flags distinguish "the corpus uses this dimension but the
 * caller holds nothing" (→ restrict to public KIs) from "the corpus does not
 * use this dimension at all" (→ no filter needed).
 */
interface AuthorizedUniverse {
  authorizedActions: string[];
  authorizedIndices: string[];
  kibanaUniverseNonEmpty: boolean;
  indexUniverseNonEmpty: boolean;
}

/**
 * Pre-aggregation pass: discover the corpus's permission universe and resolve,
 * in a single `_has_privileges` call, which values the caller is authorized
 * for. The resulting sets are pushed into the ES|QL search as an in-query
 * authorization filter, replacing the old overfetch + JS post-filter.
 *
 * Both field enumerations run concurrently. If neither dimension is used by the
 * corpus, the privilege check is skipped entirely.
 */
const resolveAuthorizedUniverse = async ({
  esClient,
  request,
  securityAuthz,
  logger,
}: {
  esClient: IScopedClusterClient;
  request: KibanaRequest;
  securityAuthz: AuthorizationServiceSetup;
  logger: Logger;
}): Promise<AuthorizedUniverse> => {
  const [kibanaUniverse, indexUniverse] = await Promise.all([
    enumerateDistinctValues({ field: PERM_KIBANA_FIELD, esClient, logger }),
    enumerateDistinctValues({ field: PERM_ES_INDICES_FIELD, esClient, logger }),
  ]);

  const kibanaUniverseNonEmpty = kibanaUniverse.length > 0;
  const indexUniverseNonEmpty = indexUniverse.length > 0;

  if (!kibanaUniverseNonEmpty && !indexUniverseNonEmpty) {
    return {
      authorizedActions: [],
      authorizedIndices: [],
      kibanaUniverseNonEmpty,
      indexUniverseNonEmpty,
    };
  }

  const { authorizedPerms, authorizedIndices } = await getAuthorizedPrivileges({
    permissions: kibanaUniverse,
    indices: indexUniverse,
    request,
    securityAuthz,
    logger,
  });

  return {
    authorizedActions: [...authorizedPerms],
    authorizedIndices: [...authorizedIndices],
    kibanaUniverseNonEmpty,
    indexUniverseNonEmpty,
  };
};

/**
 * Filter a single page of results by the current user's privileges. Applies
 * two stacked all-of checks per chunk in a single `_has_privileges` call:
 *
 *   1. Kibana `permissions.kibana.privileges[].name` — every action
 *      string a chunk lists must be authorized for the user.
 *   2. ES `permissions.elasticsearch.indices[].name` — every concrete
 *      index / alias / data stream a chunk depends on must be `read`-
 *      authorized.
 *
 * Chunks with no `kibana.privileges` pass check 1 trivially; chunks with
 * no `elasticsearch.indices` pass check 2 trivially.
 *
 * Used by the search loop (per page) and directly by autocomplete (single
 * pass). When the security plugin is absent (dev / test), the function is
 * a no-op — both checks are skipped — to preserve open-access semantics.
 */
const filterPageByPermissions = async <T extends { permissions: SmlPermissions }>(
  items: T[],
  {
    request,
    securityAuthz,
    logger,
  }: {
    request: KibanaRequest;
    securityAuthz?: AuthorizationServiceSetup;
    logger: Logger;
  }
): Promise<T[]> => {
  if (!securityAuthz || items.length === 0) return items;

  const allPermissions = [
    ...new Set(items.flatMap((hit) => hit.permissions.kibana.privileges.map((p) => p.name))),
  ];
  const allTargetIndices = [
    ...new Set(items.flatMap((hit) => hit.permissions.elasticsearch.indices.map((i) => i.name))),
  ];

  if (allPermissions.length === 0 && allTargetIndices.length === 0) {
    return items;
  }

  const { authorizedPerms, authorizedIndices } = await getAuthorizedPrivileges({
    permissions: allPermissions,
    indices: allTargetIndices,
    request,
    securityAuthz,
    logger,
  });

  return items.filter((hit) => {
    const kbnPrivs = hit.permissions.kibana.privileges.map((p) => p.name);
    const esIdx = hit.permissions.elasticsearch.indices.map((i) => i.name);

    const permsOk = kbnPrivs.length === 0 || kbnPrivs.every((p) => authorizedPerms.has(p));
    if (!permsOk) return false;

    const indicesOk = esIdx.length === 0 || esIdx.every((idx) => authorizedIndices.has(idx));
    return indicesOk;
  });
};

/**
 * Wrap filterPageByPermissions for callers that hold a `{ results }` object.
 * Used by the autocomplete path.
 */
const filterResultsByPermissions = async <T extends { permissions: SmlPermissions }>({
  searchResult,
  request,
  securityAuthz,
  logger,
}: {
  searchResult: { results: T[] };
  request: KibanaRequest;
  securityAuthz?: AuthorizationServiceSetup;
  logger: Logger;
}): Promise<{ results: T[] }> => {
  const filtered = await filterPageByPermissions(searchResult.results, {
    request,
    securityAuthz,
    logger,
  });
  return { results: filtered };
};

/**
 * Check whether the current user has access to specific SML items.
 * For each id, the access verdict is the AND of:
 *
 *   - Kibana `permissions.kibana.privileges[].name` — all listed action
 *     strings are authorized.
 *   - ES `permissions.elasticsearch.indices[].name` — all listed
 *     concrete index/alias/data stream names are `read`-authorized via
 *     `_has_privileges`.
 *
 * Chunks without any kibana privileges and without any elasticsearch
 * indices are visible to anyone in the space. When the security plugin
 * is absent, all ids resolve to `true` (open access).
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

  interface DocAuthz {
    kbnPrivs: string[];
    esIdx: string[];
  }

  let docAuthz: Map<string, DocAuthz>;
  try {
    const response = await esClient.asInternalUser.search<Pick<SmlDocument, 'id' | 'permissions'>>({
      index: smlIndexName,
      size: ids.length,
      allow_no_indices: true,
      ignore_unavailable: true,
      query: {
        bool: {
          filter: [
            { terms: { id: ids } },
            {
              bool: {
                should: [{ term: { spaces: spaceId } }, { term: { spaces: '*' } }],
                minimum_should_match: 1,
              },
            },
          ],
        },
      },
      _source: ['id', 'permissions'],
    });

    docAuthz = new Map(
      response.hits.hits
        .filter((hit) => hit._source != null)
        .map((hit) => {
          const source = hit._source!;
          return [
            source.id ?? '',
            {
              kbnPrivs: source.permissions?.kibana?.privileges?.map((p) => p.name) ?? [],
              esIdx: source.permissions?.elasticsearch?.indices?.map((i) => i.name) ?? [],
            },
          ] as [string, DocAuthz];
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

  const allPermissions = [...new Set([...docAuthz.values()].flatMap((doc) => doc.kbnPrivs))];
  const allTargetIndices = [...new Set([...docAuthz.values()].flatMap((doc) => doc.esIdx))];

  const { authorizedPerms, authorizedIndices } = await getAuthorizedPrivileges({
    permissions: allPermissions,
    indices: allTargetIndices,
    request,
    securityAuthz,
    logger,
  });

  for (const id of ids) {
    const doc = docAuthz.get(id);
    if (!doc) {
      accessMap.set(id, false);
      continue;
    }
    const permsOk = doc.kbnPrivs.length === 0 || doc.kbnPrivs.every((p) => authorizedPerms.has(p));
    const indicesOk =
      doc.esIdx.length === 0 || doc.esIdx.every((idx) => authorizedIndices.has(idx));
    accessMap.set(id, permsOk && indicesOk);
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
 * Spaces and tag filters use MV_CONTAINS rather than `==` because `==` returns
 * null (not false) on multi-value fields — an ES|QL semantic that would
 * silently drop multi-space / multi-tag documents.
 *
 * Authorization is enforced in-query via the `authz` param (pre-aggregation):
 * a doc is authorized iff its required permissions are a subset of what the
 * caller holds. `MV_CONTAINS(?authorized, permissions...name)` expresses
 * exactly that (the authorized set is bound as a single multivalue param) —
 * and because a null/empty permission field is treated as the empty set,
 * public KIs (no required perms) pass automatically. This replaces the former
 * overfetch + JS post-filter, so the outer LIMIT is just `size`.
 *
 * `references.uri` is extracted via EVAL before KEEP so the result column is
 * a flat keyword array that can be reconstructed into Array<{uri}> client-side.
 */
const buildSmlEsqlQuery = ({
  query,
  size,
  fields,
  spaceId,
  constraints,
  filters,
  authz,
}: {
  query: string;
  size: number;
  fields?: string[];
  spaceId: string;
  constraints?: SmlSearchConstraints;
  filters?: SmlSearchFilters;
  authz?: AuthorizedUniverse;
}): { esql: string; params: unknown[] } => {
  const params: unknown[] = [];
  // METADATA is required for FUSE (which needs _id, _index, _score to compute RRF).
  const lines: string[] = [`FROM ${smlIndexName} METADATA _id, _index, _score`];

  // spaces filter (see docblock for the MV_CONTAINS rationale)
  params.push(spaceId);
  lines.push('| WHERE MV_CONTAINS(spaces, ?)');

  // Authorization pre-filter. The authorized set is bound as a single
  // multivalue param (ES|QL rejects an inline `[?, ?]` list), and a clause is
  // emitted only for dimensions the corpus actually uses. See docblock for the
  // subset semantics.
  if (authz) {
    const pushAuthzClause = (
      authorized: string[],
      universeNonEmpty: boolean,
      field: EnumerableAuthzField
    ) => {
      if (!universeNonEmpty) return;
      params.push(authorized);
      lines.push(`| WHERE MV_CONTAINS(?, ${field})`);
    };

    pushAuthzClause(authz.authorizedActions, authz.kibanaUniverseNonEmpty, PERM_KIBANA_FIELD);
    pushAuthzClause(authz.authorizedIndices, authz.indexUniverseNonEmpty, PERM_ES_INDICES_FIELD);
  }

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
        lines.push(`| WHERE type != ? OR origin.uri IN (${uriPlaceholders})`);
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
    // LIMIT inside each FORK branch caps the per-leg candidate set before FUSE
    // computes RRF scores; without it FUSE would merge all matches. The outer
    // LIMIT after FUSE+SORT bounds the final set to `size` (authorization is
    // already enforced by the pre-FORK WHERE clauses above).
    lines.push('| FORK');
    const bm25Conditions = SML_BM25_FIELDS.map((field) => {
      params.push(trimmed);
      return `MATCH(${field}, ?)`;
    }).join(' OR ');
    lines.push(`  (WHERE ${bm25Conditions} | LIMIT ${size * MAX_SCAN_MULTIPLIER})`);
    const semanticConditions = SML_SEMANTIC_FIELDS.map((field) => {
      params.push(trimmed);
      return `MATCH(${field}, ?)`;
    }).join(' OR ');
    lines.push(`  (WHERE ${semanticConditions} | LIMIT ${size * MAX_SCAN_MULTIPLIER})`);
    lines.push('| FUSE');
    lines.push('| SORT _score DESC, id ASC');
  }

  lines.push(`| LIMIT ${size}`);

  // description is included in the baseline (short summary, useful for triage).
  // content, tags, references, spaces, permissions are opt-in via the fields param.
  const DEFAULT_FIELDS = new Set(['description']);
  const shouldKeep = (f: string) =>
    fields !== undefined ? fields.includes(f) : DEFAULT_FIELDS.has(f);

  // Materialize object sub-fields into flat columns before KEEP.
  lines.push('| EVAL origin_uri = origin.uri');
  if (shouldKeep('references')) {
    lines.push('| EVAL ref_uris = references.uri');
  }

  // permissions is a nested object; its leaf name fields are materialized into
  // flat keyword columns (mirroring origin_uri / ref_uris) so they can be
  // reconstructed into the nested shape client-side. Always fetched for
  // server-side RBAC filtering; only surfaced in the result when requested.
  lines.push('| EVAL perm_kibana = permissions.kibana.privileges.name');
  lines.push('| EVAL perm_es_indices = permissions.elasticsearch.indices.name');

  // spaces is purely opt-in.
  const keepCols = [
    'id',
    'type',
    'title',
    'origin_uri',
    ...(shouldKeep('description') ? ['description'] : []),
    ...(shouldKeep('tags') ? ['tags'] : []),
    ...(shouldKeep('references') ? ['ref_uris'] : []),
    ...(shouldKeep('spaces') ? ['spaces'] : []),
    'perm_kibana',
    'perm_es_indices',
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
              terms: { 'origin.uri': criteria.ids.map((id) => `${typeId}://${id}`) },
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
 * Before the search, `resolveAuthorizedUniverse` enumerates the corpus's
 * permission universe (`_terms_enum`) and resolves, in a single
 * `_has_privileges` call, which Kibana actions and ES indices the caller is
 * authorized for. Those sets are pushed into the ES|QL query as MV_CONTAINS
 * subset filters, so the index returns only authorized docs — no overfetch, no
 * JS post-filter. The outer LIMIT is exactly `size`.
 *
 * When the security plugin is absent (dev / test), enumeration is skipped and
 * all docs in the space are returned (open-access parity with the prior
 * behavior).
 *
 * Non-empty queries: two FORK branches (BM25 over all text fields + semantic
 * over all semantic multi-fields), merged by FUSE with RRF — mirrors the old
 * `retriever.rrf fields` two-retriever structure. Empty string or `*`: plain
 * sorted scan, no relevance signal.
 *
 * Filter composition: spaces (MV_CONTAINS) + authz (MV_CONTAINS) + constraints
 * (runtime-imposed per-type id-allowlist) + agent filters — each component is a
 * separate WHERE clause (ANDed across dimensions); within types and tags,
 * matching is OR (any listed value matches).
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

  // Pre-aggregation: resolve the caller's authorized permission universe so the
  // ES|QL query can filter to authorized docs in-query. Skipped when the
  // security plugin is absent (dev / test) — open-access parity.
  let authz: AuthorizedUniverse | undefined;
  if (securityAuthz) {
    authz = await resolveAuthorizedUniverse({ esClient, request, securityAuthz, logger });
    logger.debug(
      `SML search authz: actions=${authz.authorizedActions.length}, indices=${authz.authorizedIndices.length}`
    );
  }

  const { esql, params } = buildSmlEsqlQuery({
    query,
    size,
    fields,
    spaceId,
    constraints,
    filters,
    authz,
  });

  let response: { columns: Array<{ name: string; type: string }>; values: unknown[][] };
  try {
    response = await esClient.asInternalUser.esql.query({
      query: esql,
      ...(params.length > 0 ? { params: params as unknown as FieldValue[] } : {}),
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

  // permissions columns are kept for optional surfacing (fields includes
  // 'permissions'); authorization itself is enforced in-query. spaces is
  // surfaced only when requested.
  type SmlSearchResultInternal = SmlSearchResult & { permissions: SmlPermissions };

  const allResults: SmlSearchResultInternal[] = response.values.map((row) => {
    const result: SmlSearchResultInternal = {
      id: String(row[colIndex.get('id')!] ?? ''),
      type: String(row[colIndex.get('type')!] ?? ''),
      title: String(row[colIndex.get('title')!] ?? ''),
      origin: { uri: String(row[colIndex.get('origin_uri')!] ?? '') },
      permissions: {
        kibana: {
          privileges: toStringArray(row[colIndex.get('perm_kibana')!]).map((name) => ({ name })),
        },
        elasticsearch: {
          indices: toStringArray(row[colIndex.get('perm_es_indices')!]).map((name) => ({ name })),
        },
      },
    };
    const spacesIdx = colIndex.get('spaces');
    if (spacesIdx !== undefined) result.spaces = toStringArray(row[spacesIdx]);

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

  // Authorization is already enforced in-query (MV_CONTAINS subset filters), so
  // every returned row is authorized and the ES|QL LIMIT bounds it to `size`.
  logger.debug(`SML search: returned=${response.values.length}, size=${size}`);
  const includePermissions = fields !== undefined && fields.includes('permissions');
  return {
    results: allResults.map(({ permissions, ...rest }) =>
      includePermissions ? { ...rest, permissions } : rest
    ),
  };
};

/**
 * Pick a highlight snippet from ES's per-subfield highlight object.
 * Returns the first non-empty snippet; absent if none.
 */
const pickHighlightSnippet = (
  highlight: Record<string, string[]> | undefined
): string | undefined => {
  if (!highlight) return undefined;
  for (const snippets of Object.values(highlight)) {
    if (snippets && snippets.length > 0) {
      return snippets[0];
    }
  }
  return undefined;
};

/**
 * Build the autocomplete query: a single nested `multi_match bool_prefix` against
 * `discovery_labels.value` (SAYT) and its auto-generated `_2gram` / `_3gram`
 * subfields, with `inner_hits` to surface which entries matched (with their
 * `kind`). Title and type are reachable through this surface because the
 * indexer auto-prepends them to `discovery_labels`.
 *
 * `bool_prefix` is SAYT's native query type: all-but-last analyzed tokens are
 * required to match as exact indexed terms (against the bigram/trigram shingle
 * subfields), and the last token is required to match as a prefix (against
 * `_index_prefix`). With `operator: and` every typed token must contribute —
 * including the trailing partial. This yields tight per-token semantics:
 * `"github c"` matches `"GitHub Connector"` but not `"Githubster Cup"`
 * (because `"github"` is not an indexed token of `"Githubster"`).
 *
 * Known limitation: ES does not produce useful highlight snippets for
 * SAYT + `bool_prefix` + nested + inner_hits (bug
 * elastic/elasticsearch#53744, open since 2020). The highlight config below
 * is retained so the route is forward-compatible once the bug is fixed; until
 * then, `matched_discovery_labels` entries are returned without `highlighted`
 * and the UI renders plain `value`.
 *
 * After trim: empty string or `*` → `match_all`.
 */
const buildSmlAutocompleteQuery = (query: string): Record<string, unknown> => {
  const trimmed = query.trim();
  if (trimmed === '' || trimmed === '*') {
    return { match_all: {} };
  }
  return {
    nested: {
      path: 'discovery_labels',
      query: {
        multi_match: {
          query: trimmed,
          type: 'bool_prefix',
          operator: 'and',
          fields: [
            'discovery_labels.value',
            'discovery_labels.value._2gram',
            'discovery_labels.value._3gram',
          ],
        },
      },
      inner_hits: {
        _source: ['discovery_labels.value', 'discovery_labels.kind'],
        size: 10,
        highlight: {
          type: 'unified',
          number_of_fragments: 0,
          pre_tags: ['<em>'],
          post_tags: ['</em>'],
          // HTML-encode the source text so literal `<`/`>`/`&` in user content
          // don't collide with the `<em>` wrappers when rendered. No-op while
          // #53744 keeps SAYT+nested highlight broken; correct once it lands.
          encoder: 'html',
          fields: {
            'discovery_labels.value': {},
          },
        },
      },
    },
  };
};

/**
 * Autocomplete the SML index. Prefix-only, with per-row provenance for the @ menu.
 */
const autocompleteSml = async ({
  query,
  size,
  spaceId,
  esClient,
  logger,
  constraints,
  filters,
}: {
  query: string;
  size: number;
  spaceId: string;
  esClient: IScopedClusterClient;
  logger: Logger;
  constraints?: SmlSearchConstraints;
  filters?: SmlSearchFilters;
}): Promise<{ results: SmlAutocompleteResult[] }> => {
  logger.debug(
    `SML autocomplete: query=${JSON.stringify(
      query
    )}, size=${size}, spaceId='${spaceId}', index='${smlIndexName}'`
  );

  try {
    const smlQuery = buildSmlAutocompleteQuery(query);

    const filterClauses: Array<Record<string, unknown>> = [
      {
        bool: {
          should: [{ term: { spaces: spaceId } }, { term: { spaces: '*' } }],
          minimum_should_match: 1,
        },
      },
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
      _source: ['id', 'type', 'title', 'origin', 'permissions'],
    });

    const results: SmlAutocompleteResult[] = response.hits.hits
      .filter((hit) => hit._source != null)
      .map((hit) => {
        const source = hit._source!;
        const result: SmlAutocompleteResult = {
          id: source.id ?? '',
          type: source.type ?? '',
          title: source.title ?? '',
          origin: { uri: source.origin?.uri ?? '' },
          spaces: source.spaces ?? [],
          permissions: source.permissions ?? emptyPermissions(),
        };
        // Inner hits from the nested discovery_labels query: the specific entries
        // that matched, with their ES-generated highlight snippet wrapping the
        // matched span(s) in <em>...</em>.
        const innerHits = (
          hit as {
            inner_hits?: Record<
              string,
              {
                hits: {
                  hits: Array<{
                    _source: { value?: string; kind?: string };
                    highlight?: Record<string, string[]>;
                  }>;
                };
              }
            >;
          }
        ).inner_hits;
        const labelHits = innerHits?.discovery_labels?.hits?.hits;
        if (labelHits && labelHits.length > 0) {
          const matched: MatchedDiscoveryLabel[] = labelHits
            .filter((h) => h._source?.value != null && h._source?.kind != null)
            .map((h) => {
              const entry: MatchedDiscoveryLabel = {
                value: h._source.value!,
                kind: h._source.kind!,
              };
              const snippet = pickHighlightSnippet(h.highlight);
              if (snippet) {
                entry.highlighted = snippet;
              }
              return entry;
            });
          if (matched.length > 0) {
            result.matched_discovery_labels = matched;
          }
        }
        return result;
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
 * Fetch SML documents by their chunk IDs, scoped to a space.
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
          filter: [
            { terms: { id: ids } },
            {
              bool: {
                should: [{ term: { spaces: spaceId } }, { term: { spaces: '*' } }],
                minimum_should_match: 1,
              },
            },
          ],
        },
      },
    });

    for (const hit of response.hits.hits) {
      if (!hit._source) continue;
      const source = hit._source;
      const originUri = source.origin?.uri ?? '';
      const doc: SmlDocument = {
        id: source.id ?? '',
        type: source.type ?? '',
        title: source.title ?? '',
        origin_id: originUri.split('://')[1] ?? '',
        origin: { uri: originUri },
        content: source.content ?? '',
        created_at: source.created_at ?? '',
        updated_at: source.updated_at ?? '',
        spaces: source.spaces ?? [],
        permissions: source.permissions ?? emptyPermissions(),
        ingestion_method: source.ingestion_method ?? 'crawled',
      };
      if (source.description !== undefined) {
        doc.description = source.description;
      }
      if (source.tags !== undefined) {
        doc.tags = source.tags;
      }
      if (source.discovery_labels !== undefined) {
        doc.discovery_labels = source.discovery_labels;
      }
      if (source.extended_attrs !== undefined) {
        doc.extended_attrs = source.extended_attrs;
      }
      if (source.user_id !== undefined) {
        doc.user_id = source.user_id;
      }
      if (source.references !== undefined) {
        doc.references = source.references;
      }
      docMap.set(doc.id, doc);
    }
  } catch (error) {
    if (!isNotFoundError(error)) {
      logger.warn(`SML getDocuments failed: ${(error as Error).message}`);
    }
  }

  return docMap;
};

/**
 * Fetch a single SML document by id, scoped to a space.
 * Returns `undefined` when the document does not exist or is not in the space.
 */
const getDocumentById = async ({
  id,
  spaceId,
  esClient,
  logger,
}: {
  id: string;
  spaceId: string;
  esClient: IScopedClusterClient;
  logger: Logger;
}): Promise<SmlDocument | undefined> => {
  try {
    const response = await esClient.asInternalUser.search<SmlDocument>({
      index: smlIndexName,
      size: 1,
      allow_no_indices: true,
      ignore_unavailable: true,
      query: {
        bool: {
          filter: [
            { term: { id } },
            {
              bool: {
                should: [{ term: { spaces: spaceId } }, { term: { spaces: '*' } }],
                minimum_should_match: 1,
              },
            },
          ],
        },
      },
    });

    const hit = response.hits.hits[0];
    if (!hit?._source) return undefined;

    const source = hit._source;
    return {
      id: source.id ?? '',
      type: source.type ?? '',
      title: source.title ?? '',
      origin_id: (source.origin?.uri ?? '').split('://')[1] ?? '',
      origin: { uri: source.origin?.uri ?? '' },
      content: source.content ?? '',
      created_at: source.created_at ?? '',
      updated_at: source.updated_at ?? '',
      spaces: source.spaces ?? [],
      permissions: source.permissions ?? emptyPermissions(),
      ingestion_method: source.ingestion_method ?? 'crawled',
    };
  } catch (error) {
    if (isNotFoundError(error)) {
      return undefined;
    }
    logger.warn(`SML getDocument failed: ${(error as Error).message}`);
    throw error;
  }
};

/**
 * List SML documents in a space with optional filters and pagination.
 *
 * Pagination follows the standard Kibana convention (`page` is 1-based,
 * `per_page` bounds the page size).
 */
const listDocuments = async ({
  spaceId,
  esClient,
  logger,
  page = 1,
  perPage = 20,
  type,
  originId,
  tags,
}: {
  spaceId: string;
  esClient: IScopedClusterClient;
  logger: Logger;
  page?: number;
  perPage?: number;
  type?: string;
  originId?: string;
  tags?: string[];
}): Promise<{ total: number; results: SmlDocument[] }> => {
  const filters: Array<Record<string, unknown>> = [
    {
      bool: {
        should: [{ term: { spaces: spaceId } }, { term: { spaces: '*' } }],
        minimum_should_match: 1,
      },
    },
  ];
  if (type) {
    filters.push({ term: { type } });
  }
  if (originId) {
    filters.push({ term: { 'origin.uri': originId } });
  }
  if (tags && tags.length > 0) {
    filters.push({ terms: { tags } });
  }

  try {
    const response = await esClient.asInternalUser.search<SmlDocument>({
      index: smlIndexName,
      from: (page - 1) * perPage,
      size: perPage,
      allow_no_indices: true,
      ignore_unavailable: true,
      track_total_hits: true,
      query: {
        bool: {
          filter: filters,
        },
      },
      sort: [{ updated_at: { order: 'desc' } }],
    });

    const total =
      typeof response.hits.total === 'number'
        ? response.hits.total
        : response.hits.total?.value ?? 0;

    const results: SmlDocument[] = response.hits.hits
      .filter((hit) => hit._source != null)
      .map((hit) => {
        const source = hit._source!;
        const uri = source.origin?.uri ?? '';
        return {
          id: source.id ?? '',
          type: source.type ?? '',
          title: source.title ?? '',
          origin_id: uri.split('://')[1] ?? '',
          origin: { uri },
          content: source.content ?? '',
          created_at: source.created_at ?? '',
          updated_at: source.updated_at ?? '',
          spaces: source.spaces ?? [],
          permissions: source.permissions ?? emptyPermissions(),
          ingestion_method: source.ingestion_method ?? 'crawled',
          ...(source.tags !== undefined ? { tags: source.tags } : {}),
        };
      });

    return { total, results };
  } catch (error) {
    if (isNotFoundError(error)) {
      return { total: 0, results: [] };
    }
    if (isResultWindowExceededError(error)) {
      const responseError = error as errors.ResponseError;
      const body = responseError.body as
        | { error?: { root_cause?: Array<{ reason?: string }>; reason?: string } }
        | undefined;
      const reason =
        body?.error?.root_cause?.[0]?.reason ?? body?.error?.reason ?? responseError.message;
      throw new SmlResultWindowExceededError(reason);
    }
    logger.warn(`SML listDocuments failed: ${(error as Error).message}`);
    throw error;
  }
};

/**
 * Upsert an SML document by id, scoped to a space.
 *
 * On create, `spaces` is set to `[spaceId]`. On update, `created_at` and the
 * existing `spaces` are preserved (callers cannot widen or narrow space
 * membership through this endpoint), and `updated_at` is refreshed.
 *
 * Returns `null` when a document with this id exists but is not visible from
 * `spaceId` — callers cannot clobber documents in other spaces.
 */
const upsertDocument = async ({
  id,
  spaceId,
  document,
  esClient,
  logger,
}: {
  id: string;
  spaceId: string;
  document: SmlDocumentInput;
  esClient: IScopedClusterClient;
  logger: Logger;
}): Promise<SmlUpsertResult | null> => {
  // TODO: Implement optimistic concurrency using _seq_no/_primary_term to prevent lost-update
  // races. The current get-then-index pattern allows two concurrent upserts to silently overwrite
  // each other. A fix should use esClient.asInternalUser.get() (which reliably returns
  // _seq_no/_primary_term) and pass if_seq_no/if_primary_term to the index call.
  // Note: StorageIndexAdapter.get() uses search internally and does not request
  // seq_no_primary_term, so _seq_no is unreliable via that path.

  // We use smlClient.get() rather than the space-aware getDocumentById() here intentionally:
  // we need to detect documents that exist in another space (to block cross-space overwrites).
  // getDocumentById() would return undefined for those, causing us to silently overwrite them.
  const internalEsClient = esClient.asInternalUser;
  const storage = createSmlStorage({ logger, esClient: internalEsClient });
  const smlClient = storage.getClient();

  let existing: SmlDocument | undefined;
  try {
    const existingResponse = await smlClient.get({ id });
    if (existingResponse?.found && existingResponse._source) {
      existing = existingResponse._source;
    }
  } catch (error) {
    if (!isNotFoundError(error)) {
      logger.warn(`SML upsertDocument lookup failed: ${(error as Error).message}`);
      throw error;
    }
  }

  if (existing && !isVisibleInSpace(existing.spaces, spaceId)) {
    return null;
  }

  const now = new Date().toISOString();
  const created = !existing;
  const fullDocument: SmlDocument = {
    id,
    type: document.type,
    title: document.title,
    origin: { uri: `${document.type}://${document.origin_id}` },
    content: document.content,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    spaces: existing?.spaces ?? [spaceId],
    permissions: {
      kibana: { privileges: document.permissions?.kibana?.privileges ?? [] },
      elasticsearch: { indices: document.permissions?.elasticsearch?.indices ?? [] },
    },
    // On create: default to []. On update: preserve existing tags if caller omits the field.
    tags: document.tags ?? existing?.tags ?? [],
    // HTTP upserts are by definition manual writes; tagging here lets the crawler
    // (and origin-mode indexAttachment) skip these entries to avoid clobbering them.
    ingestion_method: 'manual',
  };

  await smlClient.index({ id, document: fullDocument });

  return { document: fullDocument, created };
};

const isVisibleInSpace = (spaces: string[] | undefined, spaceId: string): boolean => {
  if (!spaces || spaces.length === 0) return false;
  return spaces.includes(spaceId) || spaces.includes('*');
};

/**
 * Delete an SML document by id, scoped to a space.
 *
 * The space scope is enforced via a lookup before the delete: documents
 * that exist but are not visible in `spaceId` are reported as not found.
 * Returns `true` when a document was deleted, `false` otherwise.
 */
const deleteDocument = async ({
  id,
  spaceId,
  esClient,
  logger,
}: {
  id: string;
  spaceId: string;
  esClient: IScopedClusterClient;
  logger: Logger;
}): Promise<boolean> => {
  const existing = await getDocumentById({ id, spaceId, esClient, logger });
  if (!existing) {
    return false;
  }

  const internalEsClient = esClient.asInternalUser;
  const storage = createSmlStorage({ logger, esClient: internalEsClient });
  const smlClient = storage.getClient();

  try {
    const response = await smlClient.delete({ id });
    return response.result === 'deleted';
  } catch (error) {
    if (isNotFoundError(error)) {
      return false;
    }
    logger.warn(`SML deleteDocument failed: ${(error as Error).message}`);
    throw error;
  }
};
