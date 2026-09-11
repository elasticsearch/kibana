/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { errors } from '@elastic/elasticsearch';
import { loggerMock } from '@kbn/logging-mocks';
import type { ElasticsearchClient, IScopedClusterClient } from '@kbn/core-elasticsearch-server';
import type { KibanaRequest } from '@kbn/core-http-server';
import type { AuthorizationServiceSetup } from '@kbn/security-plugin-types-server';
import { SmlSearchFilterType } from '../../../common/http_api/sml';
import { createSmlService, isNotFoundError } from './sml_service';
import { SmlAuthzEnumerationIncompleteError, SmlCorpusTooLargeError } from './sml_errors';
import { smlIndexName } from './sml_storage';
import type { SmlTypeDefinition } from './types';

jest.mock('./sml_storage', () => {
  const actual = jest.requireActual('./sml_storage');
  return {
    ...actual,
  };
});

const createMockEsClient = (): jest.Mocked<ElasticsearchClient> =>
  ({
    search: jest.fn(),
    count: jest.fn(),
    esql: {
      query: jest.fn(),
    },
  } as unknown as jest.Mocked<ElasticsearchClient>);

const PRIVILEGES_PATH = 'permissions.kibana.privileges';
const PERM_NAME_FIELD = `${PRIVILEGES_PATH}.name`;
const PERM_SPACE_FIELD = `${PRIVILEGES_PATH}.space`;
const PERM_COUNT_FIELD = `${PRIVILEGES_PATH}.count`;

/**
 * Response shape of the nested `composite` aggregation that enumerates the corpus's privilege
 * universe. A single page with no `after_key` terminates pagination.
 */
const universeAgg = (actions: string[], opts: { failedShards?: number } = {}) => ({
  _shards: { total: 1, successful: 1, failed: opts.failedShards ?? 0, skipped: 0 },
  aggregations: {
    privileges: {
      in_space: {
        names: { buckets: actions.map((name) => ({ key: { name }, doc_count: 1 })) },
      },
    },
  },
});

/** A full page plus an `after_key`, so pagination never exhausts and the ceiling is reached. */
const fullUniversePage = (pageSize = 1000) => {
  const actions = Array.from({ length: pageSize }, (_, i) => `priv-${i}`);
  const agg = universeAgg(actions) as any;
  agg.aggregations.privileges.in_space.names.after_key = { name: actions[actions.length - 1] };
  return agg;
};

/**
 * The visibility filter `buildVisibilityFilter` emits. With `actions` (security plugin present)
 * it carries the `terms_set` privilege clause; without (security absent) it is space-only.
 */
const expectedVisibilityFilter = ({
  actions,
  spaceId = 'default',
}: {
  actions?: string[];
  spaceId?: string;
}) => ({
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
                {
                  bool: {
                    should: [
                      { term: { [PERM_SPACE_FIELD]: spaceId } },
                      { term: { [PERM_SPACE_FIELD]: '*' } },
                    ],
                    minimum_should_match: 1,
                  },
                },
                ...(actions
                  ? [
                      {
                        bool: {
                          minimum_should_match: 1,
                          should: [
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
                                        terms: actions,
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

/** The slice of Query DSL the visibility-filter assertions have to walk. */
interface QueryClause {
  nested?: { query: { bool: { filter: QueryClause[] } } };
  bool?: { should?: QueryClause[]; filter?: QueryClause[] };
  terms_set?: Record<string, unknown>;
}

const hasTermsSet = (clause: QueryClause): boolean =>
  clause.bool?.filter?.some((f) => f.terms_set != null) ?? false;

/** Non-gated (public-escape) branch of an emitted visibility filter. */
const findZeroActionBranch = (visibilityFilter: unknown): QueryClause | undefined => {
  const { should } = (visibilityFilter as { bool: { should: QueryClause[] } }).bool;
  const nested = should.find((clause) => clause.nested != null)?.nested;
  // Privilege clause = space-filter sibling whose branches hold a `terms_set`.
  const privilegeClause = nested?.query.bool.filter.find((clause) =>
    clause.bool?.should?.some(hasTermsSet)
  );
  return privilegeClause?.bool?.should?.find((clause) => !hasTermsSet(clause));
};

/** Gated (`terms_set`) branch of an emitted visibility filter. */
const findGatedBranch = (visibilityFilter: unknown): QueryClause | undefined => {
  const { should } = (visibilityFilter as { bool: { should: QueryClause[] } }).bool;
  const nested = should.find((clause) => clause.nested != null)?.nested;
  const privilegeClause = nested?.query.bool.filter.find((clause) =>
    clause.bool?.should?.some(hasTermsSet)
  );
  return privilegeClause?.bool?.should?.find(hasTermsSet);
};

/** The authorization filter emitted when the security plugin is present. */
const expectedAuthzFilter = (actions: string[], spaceId = 'default') =>
  expectedVisibilityFilter({ actions, spaceId });

// Column order produced by buildSmlEsqlQuery. The permission name field
// (perm_kibana) is always present; spaces and other optional
// fields appear only when explicitly requested.
const makeEsqlColumns = (includeContent = true, includeSpaces = false) => [
  { name: 'id', type: 'keyword' },
  { name: 'type', type: 'keyword' },
  { name: 'title', type: 'text' },
  { name: 'origin_uri', type: 'keyword' },
  { name: 'description', type: 'text' },
  { name: 'tags', type: 'keyword' },
  { name: 'ref_uris', type: 'keyword' },
  ...(includeSpaces ? [{ name: 'spaces', type: 'keyword' }] : []),
  { name: 'perm_kibana', type: 'keyword' },
  ...(includeContent ? [{ name: 'content', type: 'text' }] : []),
];

// Build a single ES|QL row value array matching makeEsqlColumns order. The
// `permissions` positional arg supplies the Kibana privilege names.
const makeEsqlRow = (
  id: string,
  type: string,
  title: string,
  originId: string,
  permissions: string | string[],
  {
    spaces,
    description,
    tags,
    refUris,
    content,
    includeContent = true,
    includeSpaces = false,
  }: {
    spaces?: string | string[];
    description?: string;
    tags?: string[] | null;
    refUris?: string[] | null;
    content?: string;
    includeContent?: boolean;
    includeSpaces?: boolean;
  } = {}
): unknown[] => [
  id,
  type,
  title,
  originId,
  description ?? null,
  tags ?? null,
  refUris ?? null,
  ...(includeSpaces ? [spaces ?? null] : []),
  permissions,
  ...(includeContent ? [content ?? null] : []),
];

const createMockScopedClient = (
  internalUser: jest.Mocked<ElasticsearchClient>
): IScopedClusterClient => {
  return {
    asInternalUser: internalUser,
    asCurrentUser: createMockEsClient(),
  } as unknown as IScopedClusterClient;
};

/** The first `search` call that is not the privilege-enumeration aggregation. */
const docSearchCall = (esClient: jest.Mocked<ElasticsearchClient>) =>
  esClient.search.mock.calls.map((c) => c[0] as any).find((a) => !a?.aggs)!;

/** How many privilege-enumeration aggregation calls were issued. */
const enumerationCallCount = (esClient: jest.Mocked<ElasticsearchClient>) =>
  esClient.search.mock.calls.filter((c) => (c[0] as any)?.aggs).length;

const createMockLogger = () => {
  const log = loggerMock.create();
  log.get = jest.fn().mockReturnValue(log);
  return log;
};

/**
 * Build a `checkPrivileges` mock that handles `kibana` privilege inputs.
 */
const buildCheckPrivilegesMock = (authorizedKibana: Set<string>) =>
  jest.fn().mockImplementation(async (req: { kibana?: string[] }) => ({
    privileges: {
      kibana: (req.kibana ?? []).map((privilege) => ({
        privilege,
        authorized: authorizedKibana.has(privilege),
      })),
    },
  }));

const createMockSecurityAuthz = (authorizedPrivileges: string[]): AuthorizationServiceSetup => {
  const checkPrivileges = buildCheckPrivilegesMock(new Set(authorizedPrivileges));
  return {
    checkPrivilegesDynamicallyWithRequest: jest.fn().mockReturnValue(checkPrivileges),
  } as unknown as AuthorizationServiceSetup;
};

const createMockSecurityAuthzPartial = (
  authorized: string[],
  unauthorized: string[]
): AuthorizationServiceSetup => {
  // `unauthorized` is retained as a documentation aid for the test author —
  // the mock simply treats any privilege not in `authorized` as denied.
  void unauthorized;
  const checkPrivileges = buildCheckPrivilegesMock(new Set(authorized));
  return {
    checkPrivilegesDynamicallyWithRequest: jest.fn().mockReturnValue(checkPrivileges),
  } as unknown as AuthorizationServiceSetup;
};

const createMockSmlTypeDefinition = (
  overrides: Partial<SmlTypeDefinition> = {}
): SmlTypeDefinition => ({
  id: 'test-type',
  list: jest.fn(),
  getSmlEntry: jest.fn(),
  toAttachment: jest.fn(),
  ...overrides,
});

const createNotFoundError = () =>
  new errors.ResponseError({
    statusCode: 404,
    body: { error: { type: 'index_not_found_exception' } },
    warnings: [],
    headers: {},
    meta: {} as any,
  });

/**
 * Build a fully-shaped `permissions` object for fixtures and assertions: one nested element per
 * space, each carrying that space's required actions and their count.
 */
const makePermissions = (groups: Array<{ space: string; name: string[] }> = []) => ({
  kibana: {
    privileges: groups.map((g) => ({ space: g.space, name: g.name, count: g.name.length })),
  },
});

describe('createSmlService', () => {
  describe('lifecycle', () => {
    it('setup() returns registerType', () => {
      const service = createSmlService();
      const logger = createMockLogger();
      const setup = service.setup({ logger });

      expect(setup.registerType).toBeDefined();
      expect(typeof setup.registerType).toBe('function');

      const def = createMockSmlTypeDefinition({ id: 'dashboard' });
      setup.registerType(def);
      expect(logger.info).toHaveBeenCalledWith('Registered SML type: dashboard');
    });

    it('start() returns the SmlService with registered types accessible', () => {
      const service = createSmlService();
      const logger = createMockLogger();
      const setup = service.setup({ logger });

      const def = createMockSmlTypeDefinition({ id: 'dashboard' });
      setup.registerType(def);

      const smlService = service.start({ logger });

      expect(smlService.search).toBeDefined();
      expect(smlService.autocomplete).toBeDefined();
      expect(smlService.checkItemsAccess).toBeDefined();
      expect(smlService.getDocuments).toBeDefined();
      expect(smlService.indexAttachment).toBeDefined();
      expect(smlService.deleteAttachment).toBeDefined();
      expect(smlService.getTypeDefinition).toBeDefined();
      expect(smlService.listTypeDefinitions).toBeDefined();
      expect(smlService.getCrawler).toBeDefined();
      expect(smlService.getCrawler()).toBeDefined();
      expect(smlService.getTypeDefinition('dashboard')).toBe(def);
      expect(smlService.listTypeDefinitions()).toContain(def);
    });
  });
});

describe('isNotFoundError', () => {
  it('returns true for ES ResponseError with statusCode 404', () => {
    const notFoundError = createNotFoundError();
    expect(isNotFoundError(notFoundError)).toBe(true);
  });

  it('returns false for ES ResponseError with other status code', () => {
    const serverError = new errors.ResponseError({
      statusCode: 500,
      body: { error: { type: 'internal_server_error' } },
      warnings: [],
      headers: {},
      meta: {} as any,
    });
    expect(isNotFoundError(serverError)).toBe(false);
  });

  it('returns false for generic Error', () => {
    expect(isNotFoundError(new Error('generic'))).toBe(false);
  });

  it('returns false for non-error values', () => {
    expect(isNotFoundError(null)).toBe(false);
    expect(isNotFoundError(undefined)).toBe(false);
    expect(isNotFoundError('string')).toBe(false);
  });
});

describe('SmlService', () => {
  let esClient: jest.Mocked<ElasticsearchClient>;
  let esqlQueryMock: jest.Mock;
  // Privilege enumeration and document fetches both go through `search`; these two hold the
  // response for each so a test can set one without having to model the other.
  let aggResponse: unknown;
  let hitsResponse: unknown;
  let scopedClient: IScopedClusterClient;
  let logger: ReturnType<typeof createMockLogger>;
  let request: KibanaRequest;

  beforeEach(() => {
    esClient = createMockEsClient();
    // `jest.Mocked` does not unwrap overloaded functions, so extract as jest.Mock directly.
    esqlQueryMock = (esClient as unknown as { esql: { query: jest.Mock } }).esql.query;
    // Default to an empty permission universe; per-case tests override `aggResponse`.
    aggResponse = universeAgg([]);
    hitsResponse = { hits: { total: 0, hits: [] } };
    esClient.search.mockImplementation((async (req: { aggs?: unknown }) =>
      req?.aggs ? aggResponse : hitsResponse) as never);
    scopedClient = createMockScopedClient(esClient);
    logger = createMockLogger();
    request = {} as unknown as KibanaRequest;
  });

  describe('search', () => {
    it('issues an ES|QL FORK+FUSE hybrid query with MV_CONTAINS space filter', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esqlQueryMock.mockResolvedValue({
        columns: makeEsqlColumns(),
        values: [],
      } as any);

      await smlService.search({
        query: 'foo bar',
        size: 10,
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      expect(esqlQueryMock).toHaveBeenCalledTimes(1);
      expect(esClient.search).not.toHaveBeenCalled();
      expect(
        (scopedClient.asCurrentUser as jest.Mocked<ElasticsearchClient>).search
      ).not.toHaveBeenCalled();

      const { query: esql } = esqlQueryMock.mock.calls[0]![0]! as {
        query: string;
        params?: unknown[];
      };
      // Hybrid search path: FORK + FUSE present
      expect(esql).toContain('| FORK');
      expect(esql).toContain('| FUSE');
      // METADATA required for FUSE (_id, _index, _score columns)
      expect(esql).toContain('METADATA _id, _index, _score');
      // Two FORK branches: BM25 (OR across text fields) + semantic (OR across semantic multi-fields).
      // Per-branch candidate depth is size(10) × MAX_SCAN_MULTIPLIER(10) for RRF recall.
      // SORT _score DESC inside each branch is required so LIMIT selects the top-scoring
      // candidates; without it LIMIT takes scan-order docs and FUSE assigns wrong RRF ranks.
      expect(esql).toContain(
        '(WHERE MATCH(title, ?) OR MATCH(description, ?) OR MATCH(content, ?) | SORT _score DESC | LIMIT 100)'
      );
      expect(esql).toContain(
        '(WHERE MATCH(title.semantic, ?) OR MATCH(description.semantic, ?) OR MATCH(content.semantic, ?) | SORT _score DESC | LIMIT 100)'
      );
      // Outer limit after FUSE is exactly `size` — authorization is enforced
      // in-query, so there is no overfetch to absorb a post-filter.
      expect(esql).toContain('| LIMIT 10');
      // Sorted by relevance score after FUSE
      expect(esql).toContain('| SORT _score DESC');
    });

    it('uses plain sorted scan for query "*" (no FORK/FUSE)', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esqlQueryMock.mockResolvedValue({
        columns: makeEsqlColumns(),
        values: [],
      } as any);

      await smlService.search({
        query: '*',
        size: 5,
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      const { query: esql } = esqlQueryMock.mock.calls[0]![0]! as { query: string };
      expect(esql).not.toContain('FORK');
      expect(esql).not.toContain('FUSE');
      expect(esql).toContain(
        '| EVAL id = FIELD_EXTRACT(attributes, "id"), origin_uri = FIELD_EXTRACT(attributes, "origin.uri")'
      );
      expect(esql).toContain('| SORT id ASC');
    });

    it('uses plain sorted scan for empty query after trim (no FORK/FUSE)', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esqlQueryMock.mockResolvedValue({
        columns: makeEsqlColumns(),
        values: [],
      } as any);

      await smlService.search({
        query: '',
        size: 5,
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      const { query: esql } = esqlQueryMock.mock.calls[0]![0]! as { query: string };
      expect(esql).not.toContain('FORK');
      expect(esql).toContain('| SORT id ASC');
    });

    it('threads constraints and agent filters as WHERE clauses with positional params', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esqlQueryMock.mockResolvedValue({
        columns: makeEsqlColumns(),
        values: [],
      } as any);

      await smlService.search({
        query: 'github',
        size: 10,
        spaceId: 'default',
        esClient: scopedClient,
        request,
        constraints: { [SmlSearchFilterType.connector]: { ids: ['gh-1'] } },
        filters: { types: ['connector', 'dashboard'], tags: ['production'] },
      });

      const { query: esql, params } = esqlQueryMock.mock.calls[0]![0]! as {
        query: string;
        params?: unknown[];
      };

      // Constraints WHERE clause: exclude type OR allow specific origin URIs
      expect(esql).toContain('| WHERE type != ? OR origin_uri IN (?)');
      // Agent type filter
      expect(esql).toContain('| WHERE type IN (?, ?)');
      // Agent tag filter with MV_CONTAINS
      expect(esql).toContain('| WHERE MV_CONTAINS(tags, ?)');

      // Positional params: [scopeTypeId, scopeUri, filterType1, filterType2, filterTag, ...queryX6]
      expect(params![0]).toBe('connector'); // constraints typeId
      expect(params![1]).toBe('connector://gh-1'); // constraints origin URI
      expect(params![2]).toBe('connector'); // filter type 1
      expect(params![3]).toBe('dashboard'); // filter type 2
      expect(params![4]).toBe('production'); // filter tag
      // query string repeated for each of the 6 MATCH branches
      expect(params!.slice(5)).toEqual(Array(6).fill('github'));
    });

    it('passes query to MATCH branches for all BM25 and semantic fields', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esqlQueryMock.mockResolvedValue({
        columns: makeEsqlColumns(),
        values: [],
      } as any);

      await smlService.search({
        query: 'how is the fleet performing this quarter',
        size: 10,
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      const { query: esql, params } = esqlQueryMock.mock.calls[0]![0]! as {
        query: string;
        params?: unknown[];
      };
      // Both FORK branches present with all six fields
      expect(esql).toContain('MATCH(title, ?)');
      expect(esql).toContain('MATCH(description, ?)');
      expect(esql).toContain('MATCH(content, ?)');
      expect(esql).toContain('MATCH(title.semantic, ?)');
      expect(esql).toContain('MATCH(description.semantic, ?)');
      expect(esql).toContain('MATCH(content.semantic, ?)');
      // Query repeated six times (once per MATCH branch)
      const queryString = 'how is the fleet performing this quarter';
      expect(params).toEqual(Array(6).fill(queryString));
    });

    it('returns baseline fields only when no fields param is provided', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esqlQueryMock.mockResolvedValue({
        columns: makeEsqlColumns(false),
        values: [
          makeEsqlRow('entry-1', 'lens', 'My Viz', 'ref-1', ['saved_object:lens/get'], {
            description: 'A lens viz',
            includeContent: false,
          }),
        ],
      } as any);

      const result = await smlService.search({
        query: 'viz',
        size: 10,
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toEqual({
        id: 'entry-1',
        type: 'lens',
        title: 'My Viz',
        origin: { uri: 'ref-1' },
        description: 'A lens viz',
      });
      expect(result.results[0]).not.toHaveProperty('content');
      expect(result.results[0]).not.toHaveProperty('tags');
      expect(result.results[0]).not.toHaveProperty('spaces');
      expect(result.results[0]).not.toHaveProperty('permissions');

      // content not in KEEP when fields is omitted
      const { query: esql } = esqlQueryMock.mock.calls[0]![0]! as { query: string };
      expect(esql).not.toMatch(/\bKEEP\b.*\bcontent\b/);
    });

    it('returns requested optional fields when fields param is provided', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esqlQueryMock.mockResolvedValue({
        columns: makeEsqlColumns(true),
        values: [
          makeEsqlRow('entry-1', 'lens', 'My Viz', 'ref-1', ['saved_object:lens/get'], {
            description: 'A lens viz',
            refUris: ['lens:other:uuid'],
            content: 'content text',
          }),
        ],
      } as any);

      const result = await smlService.search({
        query: 'viz',
        size: 10,
        spaceId: 'default',
        esClient: scopedClient,
        request,
        fields: ['content', 'description', 'references'],
      });

      expect(result.results[0]).toEqual({
        id: 'entry-1',
        type: 'lens',
        title: 'My Viz',
        origin: { uri: 'ref-1' },
        content: 'content text',
        description: 'A lens viz',
        references: [{ uri: 'lens:other:uuid' }],
      });
      expect(result.results[0]).not.toHaveProperty('spaces');
      expect(result.results[0]).not.toHaveProperty('permissions');
    });

    it('returns only the requested fields when fields param is provided', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esqlQueryMock.mockResolvedValue({
        columns: makeEsqlColumns(false),
        values: [
          makeEsqlRow('entry-bare', 'connector', 'Bare', 'b1', [], {
            includeContent: false,
          }),
        ],
      } as any);

      const result = await smlService.search({
        query: '*',
        size: 10,
        spaceId: 'default',
        esClient: scopedClient,
        request,
        fields: ['description'],
      });
      expect(result.results[0]).not.toHaveProperty('content');

      // Only requested optional fields appear in KEEP; content is absent
      const { query: esql } = esqlQueryMock.mock.calls[0]![0]! as { query: string };
      expect(esql).not.toMatch(/\bKEEP\b.*\bcontent\b/);
      expect(esql).toContain('description');
    });

    it('surfaces description, tags, and references on hits (compact LLM shape)', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esqlQueryMock.mockResolvedValue({
        columns: makeEsqlColumns(true),
        values: [
          makeEsqlRow(
            'entry-2',
            'dashboard',
            'Sales Q3',
            'dash-100',
            ['saved_object:dashboard/get'],
            {
              description: 'sales summary',
              tags: ['sales', 'executive'],
              refUris: ['category://sales'],
              content: 'sales content',
            }
          ),
        ],
      } as any);

      const result = await smlService.search({
        query: 'sales',
        size: 10,
        spaceId: 'default',
        esClient: scopedClient,
        request,
        fields: ['content', 'tags', 'references'],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toEqual({
        id: 'entry-2',
        type: 'dashboard',
        title: 'Sales Q3',
        origin: { uri: 'dash-100' },
        content: 'sales content',
        description: 'sales summary',
        tags: ['sales', 'executive'],
        references: [{ uri: 'category://sales' }],
      });
      expect(result.results[0]).not.toHaveProperty('spaces');
      expect(result.results[0]).not.toHaveProperty('permissions');
    });

    it('returns multiple results from ES|QL tabular response', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esqlQueryMock.mockResolvedValue({
        columns: makeEsqlColumns(true),
        values: [
          makeEsqlRow('entry-1', 'lens', 'A', 'r1', [], { content: '' }),
          makeEsqlRow('entry-2', 'lens', 'B', 'r2', [], { content: '' }),
        ],
      } as any);

      const result = await smlService.search({
        query: '*',
        size: 10,
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      expect(result.results).toHaveLength(2);
    });

    it('returns empty results when index does not exist (404)', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esqlQueryMock.mockRejectedValue(createNotFoundError());

      const result = await smlService.search({
        query: 'foo',
        size: 10,
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      expect(result.results).toEqual([]);
      expect(logger.debug).toHaveBeenCalledWith(
        'SML index does not exist yet — returning empty results'
      );
    });

    it('throws on non-404 errors', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esqlQueryMock.mockRejectedValue(new Error('Connection refused'));

      await expect(
        smlService.search({
          query: 'foo',
          size: 10,
          spaceId: 'default',
          esClient: scopedClient,
          request,
        })
      ).rejects.toThrow('Connection refused');

      expect(logger.warn).toHaveBeenCalledWith('SML search failed: Connection refused');
    });

    it('emits no authz clause and skips enumeration when securityAuthz is absent', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esqlQueryMock.mockResolvedValue({
        columns: makeEsqlColumns(true),
        values: [
          makeEsqlRow('entry-1', 'lens', 'Lens', 'r1', ['saved_object:lens/get'], { content: '' }),
          makeEsqlRow('entry-2', 'dashboard', 'Dashboard', 'r2', ['saved_object:dashboard/get'], {
            content: '',
          }),
        ],
      } as any);

      const result = await smlService.search({
        query: '*',
        size: 10,
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      // No security plugin → no enumeration, no privilege (terms_set) clause — but space
      // scoping is still pushed: Spaces work without security, so isolation must hold.
      expect(enumerationCallCount(esClient)).toBe(0);
      const call = esqlQueryMock.mock.calls[0]![0]! as { query: string; filter?: unknown };
      expect(call.query).not.toContain('MV_CONTAINS(?, permissions');
      expect(call.filter).toEqual(expectedVisibilityFilter({}));
      expect(result.results).toHaveLength(2);
    });

    it('pushes a space-only visibility filter for the requested space when securityAuthz is absent', async () => {
      // Regression guard: space isolation must not depend on the security plugin. A
      // security-disabled multi-space deployment must still only see the requested space.
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esqlQueryMock.mockResolvedValue({
        columns: makeEsqlColumns(true),
        values: [],
      } as any);

      await smlService.search({
        query: '*',
        size: 10,
        spaceId: 'space-b',
        esClient: scopedClient,
        request,
      });

      const call = esqlQueryMock.mock.calls[0]![0]! as { query: string; filter?: unknown };
      expect(call.filter).toEqual(expectedVisibilityFilter({ spaceId: 'space-b' }));
    });

    it('emits empty-terms filter (F3 fail-closed) when corpus has no permission tokens', async () => {
      // securityAuthz present but corpus has no permission tokens in the index →
      // the enumeration aggregation returns no buckets. The filter is still emitted with terms:[]
      // (fail-closed: matches no documents with a count requirement).
      const securityAuthz = createMockSecurityAuthz([]);
      // aggResponse defaults to an empty universe.
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger, securityAuthz });

      esqlQueryMock.mockResolvedValue({
        columns: makeEsqlColumns(true),
        values: [makeEsqlRow('entry-1', 'lens', 'Lens', 'r1', [], { content: '' })],
      } as any);

      await smlService.search({
        query: '*',
        size: 10,
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      const call = esqlQueryMock.mock.calls[0]![0]! as { query: string; filter?: unknown };
      expect(call.query).not.toContain('MV_CONTAINS(?, permissions');
      // Filter is emitted with empty terms (fail-closed).
      expect(call.filter).toEqual(expectedAuthzFilter([]));
    });

    it('uses default size of 10 when not specified (outer LIMIT = size)', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esqlQueryMock.mockResolvedValue({
        columns: makeEsqlColumns(),
        values: [],
      } as any);

      await smlService.search({
        query: '*',
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      const { query: esql } = esqlQueryMock.mock.calls[0]![0]! as { query: string };
      // Default size 10 → outer LIMIT 10 (no overfetch; authz is in-query).
      expect(esql).toContain('| LIMIT 10');
    });
  });

  describe('autocomplete', () => {
    const titlePrefixQuery = (text: string) => ({
      match_bool_prefix: { title: { query: text, operator: 'and' } },
    });

    /**
     * A "type/name" query is only recognised when the left side names a registered
     * type, so tests exercising that syntax must register the type first.
     */
    const startServiceWithTypes = (typeIds: string[]) => {
      const service = createSmlService();
      const { registerType } = service.setup({ logger });
      for (const id of typeIds) {
        registerType(createMockSmlTypeDefinition({ id }));
      }
      return service.start({ logger });
    };

    it('builds a single nested discovery_labels query (with inner_hits) and a space-only filter when securityAuthz is absent', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      hitsResponse = {
        hits: { total: 0, hits: [] },
      };

      await smlService.autocomplete({
        query: 'git',
        size: 10,
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      expect(esClient.search).toHaveBeenCalledTimes(1);
      const call = docSearchCall(esClient);
      expect(call.query).toEqual({
        bool: {
          must: [
            {
              bool: {
                should: [titlePrefixQuery('git'), { prefix: { type: 'git' } }],
                minimum_should_match: 1,
              },
            },
          ],
          filter: [expectedVisibilityFilter({})],
        },
      });
      expect(call._source).toEqual(['attributes.id', 'type', 'title', 'attributes.origin']);
    });

    it('breaks score ties deterministically instead of falling back to doc order', async () => {
      const smlService = startServiceWithTypes(['connector']);

      esClient.search.mockResolvedValue({ hits: { total: 0, hits: [] } } as any);

      // A type-only query runs entirely in filter context, so every hit ties on
      // score and the tiebreak is what determines the order the menu shows.
      await smlService.autocomplete({
        query: 'connector/',
        size: 10,
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      const call = esClient.search.mock.calls[0]![0]!;
      expect(call.sort).toEqual([
        { _score: { order: 'desc' } },
        { 'attributes.updated_at': 'desc' },
        { 'attributes.id': 'asc' },
      ]);
    });

    it('requires every typed token to match, trailing one as a prefix', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esClient.search.mockResolvedValue({ hits: { total: 0, hits: [] } } as any);

      await smlService.autocomplete({
        query: 'pacific blue',
        size: 10,
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      const call = esClient.search.mock.calls[0]![0]!;
      const titleClause = (call.query!.bool!.must as any[])[0].bool.should[0];
      expect(titleClause).toEqual({
        match_bool_prefix: { title: { query: 'pacific blue', operator: 'and' } },
      });
    });

    it('uses match_all for query "*"', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      hitsResponse = { hits: { total: 0, hits: [] } };

      await smlService.autocomplete({
        query: '*',
        size: 10,
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      const call = docSearchCall(esClient);
      expect(call.query!.bool!.must).toEqual([{ match_all: {} }]);
    });

    describe('"type/name" query syntax', () => {
      it('matches each half against its own field, with type in filter context', async () => {
        const smlService = startServiceWithTypes(['connector']);

        hitsResponse = { hits: { total: 0, hits: [] } };

        await smlService.autocomplete({
          query: 'connector/s3',
          size: 10,
          spaceId: 'default',
          esClient: scopedClient,
          request,
        });

        const call = docSearchCall(esClient);
        expect(call.query!.bool!.must).toEqual([
          {
            bool: {
              filter: [{ terms: { type: ['connector'] } }],
              must: [titlePrefixQuery('s3')],
            },
          },
        ]);
      });

      it('matches on type alone for a bare trailing slash', async () => {
        const smlService = startServiceWithTypes(['connector']);

        esClient.search.mockResolvedValue({ hits: { total: 0, hits: [] } } as any);

        await smlService.autocomplete({
          query: 'connector/',
          size: 10,
          spaceId: 'default',
          esClient: scopedClient,
          request,
        });

        const call = esClient.search.mock.calls[0]![0]!;
        expect(call.query!.bool!.must).toEqual([
          { bool: { filter: [{ terms: { type: ['connector'] } }] } },
        ]);
      });

      it('resolves the type half case-insensitively', async () => {
        const smlService = startServiceWithTypes(['connector']);

        esClient.search.mockResolvedValue({ hits: { total: 0, hits: [] } } as any);

        await smlService.autocomplete({
          query: 'Connector/s3',
          size: 10,
          spaceId: 'default',
          esClient: scopedClient,
          request,
        });

        const call = esClient.search.mock.calls[0]![0]!;
        expect(call.query!.bool!.must).toEqual([
          {
            bool: {
              filter: [{ terms: { type: ['connector'] } }],
              must: [titlePrefixQuery('s3')],
            },
          },
        ]);
      });

      it('filters on every type an ambiguous abbreviation could mean', async () => {
        const smlService = startServiceWithTypes([
          'alerting_v2_rule',
          'alerting_v2_action_policy',
          'connector',
        ]);

        esClient.search.mockResolvedValue({ hits: { total: 0, hits: [] } } as any);

        await smlService.autocomplete({
          query: 'alerting_v2/',
          size: 10,
          spaceId: 'default',
          esClient: scopedClient,
          request,
        });

        const call = esClient.search.mock.calls[0]![0]!;
        expect(call.query!.bool!.must).toEqual([
          {
            bool: {
              filter: [{ terms: { type: ['alerting_v2_rule', 'alerting_v2_action_policy'] } }],
            },
          },
        ]);
      });

      it('treats a slash as title punctuation when the left side is not a type', async () => {
        const smlService = startServiceWithTypes(['connector', 'dashboard']);

        esClient.search.mockResolvedValue({ hits: { total: 0, hits: [] } } as any);

        await smlService.autocomplete({
          query: 'sales/marketing',
          size: 10,
          spaceId: 'default',
          esClient: scopedClient,
          request,
        });

        // No registered type starts with "sales", so the whole string goes to
        // `title` — the analyzer splits on the slash — rather than filtering on a
        // type that cannot exist, which would return nothing.
        const call = esClient.search.mock.calls[0]![0]!;
        expect(call.query!.bool!.must).toEqual([titlePrefixQuery('sales/marketing')]);
      });

      it('resolves an abbreviated type id to the full id', async () => {
        const smlService = startServiceWithTypes(['connector']);

        esClient.search.mockResolvedValue({ hits: { total: 0, hits: [] } } as any);

        await smlService.autocomplete({
          query: 'conn/s3',
          size: 10,
          spaceId: 'default',
          esClient: scopedClient,
          request,
        });

        const call = esClient.search.mock.calls[0]![0]!;
        expect(call.query!.bool!.must).toEqual([
          {
            bool: {
              filter: [{ terms: { type: ['connector'] } }],
              must: [titlePrefixQuery('s3')],
            },
          },
        ]);
      });

      it('matches everything for a lone slash', async () => {
        const service = createSmlService();
        service.setup({ logger });
        const smlService = service.start({ logger });

        hitsResponse = { hits: { total: 0, hits: [] } };

        await smlService.autocomplete({
          query: '/',
          size: 10,
          spaceId: 'default',
          esClient: scopedClient,
          request,
        });

        const call = docSearchCall(esClient);
        expect(call.query!.bool!.must).toEqual([{ match_all: {} }]);
      });

      it('searches only by name when the query starts with a slash', async () => {
        const service = createSmlService();
        service.setup({ logger });
        const smlService = service.start({ logger });

        hitsResponse = { hits: { total: 0, hits: [] } };

        await smlService.autocomplete({
          query: '/s3',
          size: 10,
          spaceId: 'default',
          esClient: scopedClient,
          request,
        });

        const call = docSearchCall(esClient);
        expect(call.query!.bool!.must).toEqual([titlePrefixQuery('s3')]);
      });
    });

    it('threads per-type constraints through buildConstraintsFilter into the ES filter clauses', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      hitsResponse = { hits: { total: 0, hits: [] } };

      await smlService.autocomplete({
        query: 'git',
        size: 10,
        spaceId: 'default',
        esClient: scopedClient,
        request,
        constraints: { [SmlSearchFilterType.connector]: { ids: ['gh-1', 'jira-1'] } },
      });

      const call = docSearchCall(esClient);
      const filterClauses = call.query!.bool!.filter as Array<Record<string, unknown>>;
      // With no securityAuthz: the space-only visibility filter plus the constraints filter.
      expect(filterClauses).toHaveLength(2);
      expect(filterClauses[0]).toEqual(expectedVisibilityFilter({}));
      expect(filterClauses[1]).toEqual({
        bool: {
          should: [
            {
              terms: { 'attributes.origin.uri': ['connector://gh-1', 'connector://jira-1'] },
            },
            { bool: { must_not: [{ term: { type: 'connector' } }] } },
          ],
          minimum_should_match: 1,
        },
      });
    });

    it('preserves the score order Elasticsearch returned', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      hitsResponse = {
        hits: {
          total: 2,
          hits: [
            {
              _source: {
                type: 'connector',
                title: 'GitHub',
                permissions: makePermissions(),
                attributes: {
                  id: 'entry-1',
                  origin: { uri: 'gh-1' },
                },
              },
              _score: 5.4,
            },
            {
              _source: {
                type: 'connector',
                title: 'GitHub Enterprise Server',
                spaces: ['default'],
                permissions: makePermissions(),
                attributes: {
                  id: 'entry-2',
                  origin: { uri: 'gh-2' },
                },
              },
              _score: 4.1,
            },
          ],
        },
      };

      const result = await smlService.autocomplete({
        query: 'git',
        size: 10,
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      expect(result.results.map(({ id }) => id)).toEqual(['entry-1', 'entry-2']);
    });

    it('projects a hit as an autocomplete result', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      hitsResponse = {
        hits: {
          total: 1,
          hits: [
            {
              _source: {
                type: 'dashboard',
                title: 'Sales Q3',
                permissions: makePermissions(),
                attributes: {
                  id: 'entry-2',
                  origin: { uri: 'dash-1' },
                },
              },
              _score: 2.0,
            },
          ],
        },
      };

      const result = await smlService.autocomplete({
        query: 'sal',
        size: 10,
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      expect(result.results[0]).toEqual({
        id: 'entry-2',
        type: 'dashboard',
        title: 'Sales Q3',
        origin: { uri: 'dash-1' },
      });
    });

    it('returns empty results when the index does not exist (404)', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esClient.search.mockRejectedValue(createNotFoundError());

      const result = await smlService.autocomplete({
        query: 'git',
        size: 10,
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      expect(result).toEqual({ results: [] });
    });

    it('emits empty-terms filter (matches nothing) when corpus has no permission tokens (F3 fail-closed)', async () => {
      // When the corpus has no permission tokens in the index (the enumeration aggregation returns no buckets),
      // a terms_set filter with terms:[] is still emitted — fail-closed.
      const securityAuthz = createMockSecurityAuthzPartial(
        ['saved_object:dashboard/get'],
        ['saved_object:connector/get']
      );
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger, securityAuthz });

      // aggResponse defaults to an empty universe.
      hitsResponse = {
        hits: { total: 0, hits: [] },
      };

      await smlService.autocomplete({
        query: 'a',
        size: 10,
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      // One enumeration aggregation; the space and wildcard scopes are a single nested filter now.
      expect(enumerationCallCount(esClient)).toBe(1);

      const call = docSearchCall(esClient);
      const filterClauses = call.query!.bool!.filter as Array<Record<string, unknown>>;
      expect(filterClauses).toHaveLength(1);
      expect(filterClauses[0]).toEqual(expectedAuthzFilter([]));
    });

    it('emits the nested authz filter when securityAuthz is present', async () => {
      // Corpus uses two Kibana privileges; caller holds one.
      // The pre-aggregation pass emits a bare terms_set filter (no must_not/should wrapper)
      // in both spaceId| and *| forms.
      const securityAuthz = createMockSecurityAuthz(['saved_object:dashboard/get']);
      aggResponse = universeAgg(['saved_object:dashboard/get', 'saved_object:lens/get']);
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger, securityAuthz });

      hitsResponse = { hits: { total: 0, hits: [] } };

      await smlService.autocomplete({
        query: 'git',
        size: 10,
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      // One enumeration aggregation; the space and wildcard scopes are a single nested filter now.
      expect(enumerationCallCount(esClient)).toBe(1);

      const call = docSearchCall(esClient);
      const filterClauses = call.query!.bool!.filter as Array<Record<string, unknown>>;
      expect(filterClauses).toHaveLength(1);
      expect(filterClauses[0]).toEqual(expectedAuthzFilter(['saved_object:dashboard/get']));
    });

    it('gates the zero-action branch on the element carrying no action names', async () => {
      // Asserted independently of `expectedAuthzFilter` so loosening that helper can't hide a
      // regression: the public branch must pair `count: 0` with `must_not exists` on names.
      const securityAuthz = createMockSecurityAuthz(['saved_object:dashboard/get']);
      aggResponse = universeAgg(['saved_object:dashboard/get']);
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger, securityAuthz });

      hitsResponse = { hits: { total: 0, hits: [] } };

      await smlService.autocomplete({
        query: 'git',
        size: 10,
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      const call = docSearchCall(esClient);
      const filterClauses = call.query!.bool!.filter as Array<Record<string, unknown>>;
      const privilegeClause = findZeroActionBranch(filterClauses[0]);

      // Separates "the branch changed" from "the walk no longer finds the privilege clause".
      expect(privilegeClause).toBeDefined();
      expect(privilegeClause).toEqual({
        bool: {
          filter: [
            { term: { [PERM_COUNT_FIELD]: 0 } },
            { bool: { must_not: [{ exists: { field: PERM_NAME_FIELD } }] } },
          ],
        },
      });
    });

    it('gates the terms_set branch on count > 0', async () => {
      // Asserted independently of `expectedAuthzFilter`: the gated branch must carry the `count > 0`
      // guard, else a malformed `count: 0` element leaks to holders of a named action.
      const securityAuthz = createMockSecurityAuthz(['saved_object:dashboard/get']);
      aggResponse = universeAgg(['saved_object:dashboard/get']);
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger, securityAuthz });

      hitsResponse = { hits: { total: 0, hits: [] } };

      await smlService.autocomplete({
        query: 'git',
        size: 10,
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      const call = docSearchCall(esClient);
      const filterClauses = call.query!.bool!.filter as Array<Record<string, unknown>>;
      const gatedClause = findGatedBranch(filterClauses[0]);

      expect(gatedClause).toBeDefined();
      expect(gatedClause).toEqual({
        bool: {
          filter: [
            { range: { [PERM_COUNT_FIELD]: { gt: 0 } } },
            {
              terms_set: {
                [PERM_NAME_FIELD]: {
                  terms: ['saved_object:dashboard/get'],
                  minimum_should_match_field: PERM_COUNT_FIELD,
                },
              },
            },
          ],
        },
      });
    });

    it('emits a space-only visibility filter (no terms_set) when securityAuthz is absent', async () => {
      // Open access applies to PRIVILEGES only — space isolation must hold without the security
      // plugin, because Spaces are available on Basic with security disabled.
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      hitsResponse = { hits: { total: 0, hits: [] } };

      await smlService.autocomplete({
        query: 'git',
        size: 10,
        spaceId: 'space-b',
        esClient: scopedClient,
        request,
      });

      // No enumeration — security plugin absent.
      expect(enumerationCallCount(esClient)).toBe(0);
      const call = docSearchCall(esClient);
      const filterClauses = call.query!.bool!.filter as Array<Record<string, unknown>>;
      expect(filterClauses).toEqual([expectedVisibilityFilter({ spaceId: 'space-b' })]);
    });

    describe('pre-aggregation authz filter', () => {
      const getEsql = () =>
        esqlQueryMock.mock.calls[0]![0]! as { query: string; params?: unknown[] };

      it('fails closed when the enumeration aggregation reports shard failures', async () => {
        const securityAuthz = createMockSecurityAuthz(['saved_object:lens/get']);
        aggResponse = universeAgg(['saved_object:lens/get'], { failedShards: 1 });
        const service = createSmlService();
        service.setup({ logger });
        const smlService = service.start({ logger, securityAuthz });

        await expect(
          smlService.search({
            query: '*',
            size: 10,
            spaceId: 'default',
            esClient: scopedClient,
            request,
          })
        ).rejects.toBeInstanceOf(SmlAuthzEnumerationIncompleteError);
        // The search query is never issued when authz enumeration is incomplete.
        expect(esqlQueryMock).not.toHaveBeenCalled();
      });

      it('fails closed (SmlCorpusTooLargeError) when distinct values exceed the ceiling', async () => {
        const securityAuthz = createMockSecurityAuthz(['saved_object:lens/get']);
        // Always a full page with an after_key → pagination never exhausts → ceiling hit.
        aggResponse = fullUniversePage();
        const service = createSmlService();
        service.setup({ logger });
        const smlService = service.start({ logger, securityAuthz });

        await expect(
          smlService.search({
            query: '*',
            size: 10,
            spaceId: 'default',
            esClient: scopedClient,
            request,
          })
        ).rejects.toBeInstanceOf(SmlCorpusTooLargeError);
      });

      it('treats a missing index as an empty universe (emits empty-terms filter)', async () => {
        const securityAuthz = createMockSecurityAuthz(['saved_object:lens/get']);
        esClient.search.mockRejectedValue(createNotFoundError());
        const service = createSmlService();
        service.setup({ logger });
        const smlService = service.start({ logger, securityAuthz });
        esqlQueryMock.mockResolvedValue({ columns: makeEsqlColumns(true), values: [] } as any);

        await smlService.search({
          query: '*',
          size: 10,
          spaceId: 'default',
          esClient: scopedClient,
          request,
        });

        const call = getEsql() as { query: string; filter?: unknown };
        expect(call.query).not.toContain('MV_CONTAINS(?, permissions');
        // Empty corpus → no authorized actions → fail-closed filter.
        expect(call.filter).toEqual(expectedAuthzFilter([]));
      });
    });
  });

  describe('checkItemsAccess', () => {
    it('grants all access when securityAuthz is absent', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      const result = await smlService.checkItemsAccess({
        ids: ['item-1', 'item-2'],
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      expect(result.get('item-1')).toBe(true);
      expect(result.get('item-2')).toBe(true);
      expect(esClient.search).not.toHaveBeenCalled();
    });

    it('denies access when items not found in index', async () => {
      const securityAuthz = createMockSecurityAuthz(['saved_object:lens/get']);
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger, securityAuthz });

      hitsResponse = {
        hits: {
          total: 0,
          hits: [],
        },
      };

      const result = await smlService.checkItemsAccess({
        ids: ['missing-item'],
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      expect(result.get('missing-item')).toBe(false);
    });

    it('checks permissions correctly for authorized items', async () => {
      const securityAuthz = createMockSecurityAuthz(['saved_object:lens/get']);
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger, securityAuthz });

      // Documents store composite `space|action` tokens.
      hitsResponse = {
        hits: {
          total: 1,
          hits: [
            {
              _source: {
                permissions: makePermissions([
                  { space: 'default', name: ['saved_object:lens/get'] },
                ]),
                attributes: {
                  id: 'item-1',
                },
              },
            },
          ],
        },
      };

      const result = await smlService.checkItemsAccess({
        ids: ['item-1'],
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      expect(result.get('item-1')).toBe(true);
    });

    it('checks permissions correctly for unauthorized items', async () => {
      const securityAuthz = createMockSecurityAuthzPartial([], ['saved_object:dashboard/get']);
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger, securityAuthz });

      // Documents store composite `space|action` tokens.
      hitsResponse = {
        hits: {
          total: 1,
          hits: [
            {
              _source: {
                permissions: makePermissions([
                  { space: 'default', name: ['saved_object:dashboard/get'] },
                ]),
                attributes: {
                  id: 'item-1',
                },
              },
            },
          ],
        },
      };

      const result = await smlService.checkItemsAccess({
        ids: ['item-1'],
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      expect(result.get('item-1')).toBe(false);
    });

    it('grants access for items with *| global tokens when caller is authorized', async () => {
      const securityAuthz = createMockSecurityAuthz(['saved_object:lens/get']);
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger, securityAuthz });

      hitsResponse = {
        hits: {
          total: 1,
          hits: [
            {
              _source: {
                permissions: makePermissions([{ space: '*', name: ['saved_object:lens/get'] }]),
                attributes: {
                  id: 'item-global',
                },
              },
            },
          ],
        },
      };

      const result = await smlService.checkItemsAccess({
        ids: ['item-global'],
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      expect(result.get('item-global')).toBe(true);
    });

    it('denies access for items with only tokens for other spaces', async () => {
      const securityAuthz = createMockSecurityAuthz(['saved_object:lens/get']);
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger, securityAuthz });

      hitsResponse = {
        hits: {
          total: 1,
          hits: [
            {
              _source: {
                // Only tokens for a different space — no spaceId| or *| match for 'default'.
                permissions: makePermissions([
                  { space: 'other-space', name: ['saved_object:lens/get'] },
                ]),
                attributes: {
                  id: 'item-other-space',
                },
              },
            },
          ],
        },
      };

      const result = await smlService.checkItemsAccess({
        ids: ['item-other-space'],
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      expect(result.get('item-other-space')).toBe(false);
    });

    it('grants access for items carrying no privilege elements at all (public document)', async () => {
      // A document with an empty `privileges` array is public, matching the Elasticsearch-side
      // `must_not nested(match_all)` branch of the implicit DLS query. Previously this denied,
      // which meant Kibana hid documents Elasticsearch considered visible to everyone.
      // Note this is distinct from a document that HAS elements but none for this space —
      // covered by the `only tokens for other spaces` case above, which still denies.
      const securityAuthz = createMockSecurityAuthz([]);
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger, securityAuthz });

      hitsResponse = {
        hits: {
          total: 1,
          hits: [
            {
              _source: {
                permissions: makePermissions(),
                attributes: {
                  id: 'item-1',
                },
              },
            },
          ],
        },
      };

      const result = await smlService.checkItemsAccess({
        ids: ['item-1'],
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      expect(result.get('item-1')).toBe(true);
    });

    it('grants access for items whose space element requires zero actions', async () => {
      // A type resolving to no actions gets `{ name: [], count: 0 }`, the public escape: visible to
      // anyone in the space rather than silently dropped.
      const securityAuthz = createMockSecurityAuthz([]);
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger, securityAuthz });

      hitsResponse = {
        hits: {
          total: 1,
          hits: [
            {
              _source: {
                permissions: makePermissions([{ space: 'default', name: [] }]),
                attributes: {
                  id: 'item-zero-actions',
                },
              },
            },
          ],
        },
      };

      const result = await smlService.checkItemsAccess({
        ids: ['item-zero-actions'],
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      expect(result.get('item-zero-actions')).toBe(true);
    });

    it('denies access for a malformed element whose count is 0 but still names actions', async () => {
      // `count: 0` is the public escape only when it names nothing; naming an action is malformed
      // and fails CLOSED.
      const securityAuthz = createMockSecurityAuthz([]);
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger, securityAuthz });

      hitsResponse = {
        hits: {
          total: 1,
          hits: [
            {
              _source: {
                permissions: {
                  kibana: {
                    privileges: [
                      { space: 'default', name: ['saved_object:dashboard/get'], count: 0 },
                    ],
                  },
                },
                attributes: {
                  id: 'item-malformed',
                },
              },
            },
          ],
        },
      };

      const result = await smlService.checkItemsAccess({
        ids: ['item-malformed'],
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      expect(result.get('item-malformed')).toBe(false);
    });

    it('denies a malformed count-0 element even to a caller holding the named action', async () => {
      // The real fail-open: a holder of the named action would see this malformed element without
      // the `count === 0` guard.
      const securityAuthz = createMockSecurityAuthz(['saved_object:dashboard/get']);
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger, securityAuthz });

      hitsResponse = {
        hits: {
          total: 1,
          hits: [
            {
              _source: {
                permissions: {
                  kibana: {
                    privileges: [
                      { space: 'default', name: ['saved_object:dashboard/get'], count: 0 },
                    ],
                  },
                },
                attributes: {
                  id: 'item-malformed',
                },
              },
            },
          ],
        },
      };

      const result = await smlService.checkItemsAccess({
        ids: ['item-malformed'],
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      expect(result.get('item-malformed')).toBe(false);
    });

    it('denies a malformed negative-count element even to a caller holding the named action', async () => {
      // A negative count is neither public (count !== 0) nor gated (count > 0), so it fails CLOSED.
      const securityAuthz = createMockSecurityAuthz(['saved_object:dashboard/get']);
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger, securityAuthz });

      hitsResponse = {
        hits: {
          total: 1,
          hits: [
            {
              _source: {
                permissions: {
                  kibana: {
                    privileges: [
                      { space: 'default', name: ['saved_object:dashboard/get'], count: -1 },
                    ],
                  },
                },
                attributes: {
                  id: 'item-negative',
                },
              },
            },
          ],
        },
      };

      const result = await smlService.checkItemsAccess({
        ids: ['item-negative'],
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      expect(result.get('item-negative')).toBe(false);
    });

    it('denies a malformed positive-count element that names no actions', async () => {
      // Zero named actions can never satisfy a positive count, so the empty-list case fails CLOSED.
      const securityAuthz = createMockSecurityAuthz(['saved_object:dashboard/get']);
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger, securityAuthz });

      hitsResponse = {
        hits: {
          total: 1,
          hits: [
            {
              _source: {
                permissions: {
                  kibana: {
                    privileges: [{ space: 'default', name: [], count: 3 }],
                  },
                },
                attributes: {
                  id: 'item-empty-names',
                },
              },
            },
          ],
        },
      };

      const result = await smlService.checkItemsAccess({
        ids: ['item-empty-names'],
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      expect(result.get('item-empty-names')).toBe(false);
    });

    it('denies a malformed element whose count is padded by duplicate action names', async () => {
      // `terms_set` counts DISTINCT terms, so `['a','a']` with `count: 2` needs two distinct held
      // actions; without deduping, holding `a` once would leak it.
      const securityAuthz = createMockSecurityAuthz(['saved_object:dashboard/get']);
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger, securityAuthz });

      hitsResponse = {
        hits: {
          total: 1,
          hits: [
            {
              _source: {
                permissions: {
                  kibana: {
                    privileges: [
                      {
                        space: 'default',
                        name: ['saved_object:dashboard/get', 'saved_object:dashboard/get'],
                        count: 2,
                      },
                    ],
                  },
                },
                attributes: {
                  id: 'item-duplicate-names',
                },
              },
            },
          ],
        },
      };

      const result = await smlService.checkItemsAccess({
        ids: ['item-duplicate-names'],
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      expect(result.get('item-duplicate-names')).toBe(false);
    });

    it('handles 404 error by returning false for all items', async () => {
      const securityAuthz = createMockSecurityAuthz(['saved_object:lens/get']);
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger, securityAuthz });

      esClient.search.mockRejectedValue(createNotFoundError());

      const result = await smlService.checkItemsAccess({
        ids: ['item-1', 'item-2'],
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      expect(result.get('item-1')).toBe(false);
      expect(result.get('item-2')).toBe(false);
    });

    it('calls ES search with correct query for checkItemsAccess', async () => {
      const securityAuthz = createMockSecurityAuthz([]);
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger, securityAuthz });

      hitsResponse = {
        hits: { total: 0, hits: [] },
      };

      await smlService.checkItemsAccess({
        ids: ['id-1'],
        spaceId: 'my-space',
        esClient: scopedClient,
        request,
      });

      expect(esClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          index: smlIndexName,
          size: 1,
          allow_no_indices: true,
          ignore_unavailable: true,
          query: {
            bool: {
              filter: [{ terms: { 'attributes.id': ['id-1'] } }],
            },
          },
          _source: ['attributes.id', 'permissions'],
        })
      );
      expect(
        (scopedClient.asCurrentUser as jest.Mocked<ElasticsearchClient>).search
      ).not.toHaveBeenCalled();
    });

    it('fails closed when checkPrivileges throws — denies every item that requires a privilege', async () => {
      const securityAuthz = createMockSecurityAuthz(['saved_object:lens/get']);
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger, securityAuthz });

      esClient.search.mockResolvedValueOnce({
        hits: {
          total: 2,
          hits: [
            {
              _source: {
                permissions: makePermissions([]),
                attributes: {
                  id: 'no-tokens',
                },
              },
            },
            {
              _source: {
                permissions: makePermissions([
                  { space: 'default', name: ['saved_object:lens/get'] },
                ]),
                attributes: {
                  id: 'with-deps',
                },
              },
            },
          ],
        },
      } as any);
      const checkPrivileges = (
        securityAuthz.checkPrivilegesDynamicallyWithRequest as jest.Mock
      )() as jest.Mock;
      checkPrivileges.mockRejectedValueOnce(new Error('cluster unreachable'));

      const result = await smlService.checkItemsAccess({
        ids: ['no-tokens', 'with-deps'],
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      // with-deps requires an action, checkPrivileges failed → getAuthorizedPrivileges returns an
      // empty Set → denied. no-tokens carries no privilege elements at all, so it is a public
      // document: visible regardless of the privilege check, which is not a fail-open because
      // nothing was ever required to see it.
      expect(result.get('no-tokens')).toBe(true);
      expect(result.get('with-deps')).toBe(false);
    });
  });

  describe('getDocuments', () => {
    it('fetches documents from ES and returns Map', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      hitsResponse = {
        hits: {
          total: 2,
          hits: [
            {
              _source: {
                type: 'lens',
                title: 'Doc 1',
                content: 'content 1',
                permissions: makePermissions(),
                attributes: {
                  id: 'doc-1',
                  origin: { uri: 'lens://ref-1' },
                  created_at: '2024-01-01',
                  updated_at: '2024-01-02',
                },
              },
            },
            {
              _source: {
                type: 'dashboard',
                title: 'Doc 2',
                content: 'content 2',
                description: 'dash desc',
                references: [{ uri: 'lens:x:y' }],
                permissions: makePermissions(),
                attributes: {
                  id: 'doc-2',
                  origin: { uri: 'dashboard://ref-2' },
                  user_id: 'u2',
                  created_at: '2024-01-01',
                  updated_at: '2024-01-02',
                },
              },
            },
          ],
        },
      };

      const result = await smlService.getDocuments({
        ids: ['doc-1', 'doc-2'],
        spaceId: 'default',
        esClient: scopedClient,
      });

      expect(result.size).toBe(2);
      expect(result.get('doc-1')).toEqual({
        type: 'lens',
        title: 'Doc 1',
        content: 'content 1',
        permissions: makePermissions(),
        attributes: {
          id: 'doc-1',
          origin: { uri: 'lens://ref-1' },
          created_at: '2024-01-01',
          updated_at: '2024-01-02',
        },
      });
      expect(result.get('doc-2')).toEqual({
        type: 'dashboard',
        title: 'Doc 2',
        content: 'content 2',
        description: 'dash desc',
        references: [{ uri: 'lens:x:y' }],
        permissions: makePermissions(),
        attributes: {
          id: 'doc-2',
          origin: { uri: 'dashboard://ref-2' },
          user_id: 'u2',
          created_at: '2024-01-01',
          updated_at: '2024-01-02',
        },
      });
    });

    it('round-trips all new schema fields (origin, tags, attributes)', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      hitsResponse = {
        hits: {
          total: 1,
          hits: [
            {
              _source: {
                type: 'dashboard',
                title: 'Sales Q3',
                content: 'sales content',
                description: 'sales summary',
                tags: ['sales', 'executive'],
                references: [{ uri: 'category://sales' }],
                permissions: makePermissions([
                  { space: 'default', name: ['saved_object:dashboard/get'] },
                ]),
                attributes: {
                  owner_team: 'sales-ops',
                  id: 'doc-3',
                  origin: { uri: 'dashboard://dash-100' },
                  user_id: 'user-7',
                  created_at: '2026-04-01T00:00:00.000Z',
                  updated_at: '2026-04-02T00:00:00.000Z',
                },
              },
            },
          ],
        },
      };

      const result = await smlService.getDocuments({
        ids: ['doc-3'],
        spaceId: 'default',
        esClient: scopedClient,
      });

      expect(result.get('doc-3')).toEqual({
        type: 'dashboard',
        title: 'Sales Q3',
        content: 'sales content',
        description: 'sales summary',
        tags: ['sales', 'executive'],
        references: [{ uri: 'category://sales' }],
        permissions: makePermissions([{ space: 'default', name: ['saved_object:dashboard/get'] }]),
        attributes: {
          owner_team: 'sales-ops',
          id: 'doc-3',
          origin: { uri: 'dashboard://dash-100' },
          user_id: 'user-7',
          created_at: '2026-04-01T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        },
      });
    });

    it('returns empty map for empty ids', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      const result = await smlService.getDocuments({
        ids: [],
        spaceId: 'default',
        esClient: scopedClient,
      });

      expect(result.size).toBe(0);
      expect(esClient.search).not.toHaveBeenCalled();
    });

    it('handles 404 error gracefully', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esClient.search.mockRejectedValue(createNotFoundError());

      const result = await smlService.getDocuments({
        ids: ['doc-1'],
        spaceId: 'default',
        esClient: scopedClient,
      });

      expect(result.size).toBe(0);
    });

    it('handles other errors gracefully', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esClient.search.mockRejectedValue(new Error('Connection timeout'));

      const result = await smlService.getDocuments({
        ids: ['doc-1'],
        spaceId: 'default',
        esClient: scopedClient,
      });

      expect(result.size).toBe(0);
      expect(logger.warn).toHaveBeenCalledWith('SML getDocuments failed: Connection timeout');
    });

    it('calls ES search with correct query', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      hitsResponse = {
        hits: { total: 0, hits: [] },
      };

      await smlService.getDocuments({
        ids: ['id-1', 'id-2'],
        spaceId: 'default',
        esClient: scopedClient,
      });

      expect(esClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          index: smlIndexName,
          size: 2,
          allow_no_indices: true,
          ignore_unavailable: true,
          query: {
            bool: {
              filter: [
                { terms: { 'attributes.id': ['id-1', 'id-2'] } },
                {
                  bool: {
                    minimum_should_match: 1,
                    should: [
                      {
                        bool: {
                          must_not: [
                            {
                              nested: {
                                path: 'permissions.kibana.privileges',
                                query: { match_all: {} },
                                score_mode: 'none',
                              },
                            },
                          ],
                        },
                      },
                      {
                        nested: {
                          path: 'permissions.kibana.privileges',
                          score_mode: 'none',
                          query: {
                            bool: {
                              filter: [
                                {
                                  bool: {
                                    should: [
                                      {
                                        term: {
                                          'permissions.kibana.privileges.space': 'default',
                                        },
                                      },
                                      {
                                        term: {
                                          'permissions.kibana.privileges.space': '*',
                                        },
                                      },
                                    ],
                                    minimum_should_match: 1,
                                  },
                                },
                              ],
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        })
      );
      expect(
        (scopedClient.asCurrentUser as jest.Mocked<ElasticsearchClient>).search
      ).not.toHaveBeenCalled();
    });
  });
});
