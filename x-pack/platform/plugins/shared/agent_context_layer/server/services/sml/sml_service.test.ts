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
import {
  SmlResultWindowExceededError,
  SmlAuthzEnumerationIncompleteError,
  SmlCorpusTooLargeError,
} from './sml_errors';
import { smlIndexName, createSmlStorage } from './sml_storage';
import type { SmlTypeDefinition } from './types';

jest.mock('./sml_storage', () => {
  const actual = jest.requireActual('./sml_storage');
  return {
    ...actual,
    createSmlStorage: jest.fn(),
  };
});

const createMockEsClient = (): jest.Mocked<ElasticsearchClient> =>
  ({
    search: jest.fn(),
    count: jest.fn(),
    termsEnum: jest.fn(),
    esql: {
      query: jest.fn(),
    },
  } as unknown as jest.Mocked<ElasticsearchClient>);

/**
 * Build a `termsEnum` mock that serves a corpus permission universe keyed by
 * field. Each distinct field returns a single complete page of its values.
 * Fields not present in the map return an empty, complete page (dimension
 * unused by the corpus).
 */
const buildTermsEnumMock = (universe: { kibana?: string[]; esIndices?: string[] }) =>
  jest.fn().mockImplementation(async (req: { field: string }) => {
    if (req.field === 'permissions.kibana.privileges.name') {
      return { complete: true, terms: universe.kibana ?? [] };
    }
    if (req.field === 'permissions.elasticsearch.indices.name') {
      return { complete: true, terms: universe.esIndices ?? [] };
    }
    return { complete: true, terms: [] };
  });

// Column order produced by buildSmlEsqlQuery. The permission name fields
// (perm_kibana, perm_es_indices) are always present; spaces and other optional
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
  { name: 'perm_es_indices', type: 'keyword' },
  ...(includeContent ? [{ name: 'content', type: 'text' }] : []),
];

// Build a single ES|QL row value array matching makeEsqlColumns order. The
// `permissions` positional arg supplies the Kibana privilege names; ES index
// names (post-filter gating) are supplied via the `esIndices` option.
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
    esIndices,
    includeContent = true,
    includeSpaces = false,
  }: {
    spaces?: string | string[];
    description?: string;
    tags?: string[] | null;
    refUris?: string[] | null;
    content?: string;
    esIndices?: string | string[] | null;
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
  esIndices ?? null,
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

const createMockLogger = () => {
  const log = loggerMock.create();
  log.get = jest.fn().mockReturnValue(log);
  return log;
};

/**
 * Build a `checkPrivileges` mock that handles both `kibana` and
 * `elasticsearch.index` inputs (mirroring Kibana's real wrapper which
 * bundles both into a single `_has_privileges` POST).
 */
const buildCheckPrivilegesMock = (authorizedKibana: Set<string>, authorizedIndices: Set<string>) =>
  jest
    .fn()
    .mockImplementation(
      async (req: { kibana?: string[]; elasticsearch?: { index?: Record<string, string[]> } }) => ({
        privileges: {
          kibana: (req.kibana ?? []).map((privilege) => ({
            privilege,
            authorized: authorizedKibana.has(privilege),
          })),
          elasticsearch: {
            cluster: [],
            index: Object.fromEntries(
              Object.entries(req.elasticsearch?.index ?? {}).map(([name, perms]) => [
                name,
                perms.map((privilege) => ({
                  privilege,
                  authorized: privilege === 'read' && authorizedIndices.has(name),
                })),
              ])
            ),
          },
        },
      })
    );

const createMockSecurityAuthz = (
  authorizedPrivileges: string[],
  authorizedIndices: string[] = []
): AuthorizationServiceSetup => {
  const checkPrivileges = buildCheckPrivilegesMock(
    new Set(authorizedPrivileges),
    new Set(authorizedIndices)
  );
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
  const checkPrivileges = buildCheckPrivilegesMock(new Set(authorized), new Set());
  return {
    checkPrivilegesDynamicallyWithRequest: jest.fn().mockReturnValue(checkPrivileges),
  } as unknown as AuthorizationServiceSetup;
};

const createMockSmlTypeDefinition = (
  overrides: Partial<SmlTypeDefinition> = {}
): SmlTypeDefinition => ({
  id: 'test-type',
  list: jest.fn(),
  getSmlData: jest.fn(),
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
 * Build a fully-shaped `permissions` object for fixtures and assertions.
 * Both inner arrays are always present; pass `[]` (the default) for
 * "no privileges of this kind".
 */
const makePermissions = (kibanaPrivs: string[] = [], esIndices: string[] = []) => ({
  kibana: { privileges: kibanaPrivs.map((name) => ({ name })) },
  elasticsearch: { indices: esIndices.map((name) => ({ name })) },
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
  let termsEnumMock: jest.Mock;
  let scopedClient: IScopedClusterClient;
  let logger: ReturnType<typeof createMockLogger>;
  let request: KibanaRequest;

  beforeEach(() => {
    esClient = createMockEsClient();
    // `jest.Mocked` does not unwrap overloaded functions, so extract as jest.Mock directly.
    esqlQueryMock = (esClient as unknown as { esql: { query: jest.Mock } }).esql.query;
    termsEnumMock = (esClient as unknown as { termsEnum: jest.Mock }).termsEnum;
    // Default to an empty permission universe; per-case tests override this.
    termsEnumMock.mockImplementation(async () => ({ complete: true, terms: [] }));
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

      const { query: esql, params } = esqlQueryMock.mock.calls[0]![0]! as {
        query: string;
        params?: unknown[];
      };
      // Hybrid search path: FORK + FUSE present
      expect(esql).toContain('| FORK');
      expect(esql).toContain('| FUSE');
      // METADATA required for FUSE (_id, _index, _score columns)
      expect(esql).toContain('METADATA _id, _index, _score');
      // Space filter uses MV_CONTAINS (not `==`) for multi-value safety
      expect(esql).toContain('| WHERE MV_CONTAINS(spaces, ?)');
      // Two FORK branches: BM25 (OR across text fields) + semantic (OR across semantic multi-fields).
      // Per-branch candidate depth is size(10) × MAX_SCAN_MULTIPLIER(10) for RRF recall.
      expect(esql).toContain(
        '(WHERE MATCH(title, ?) OR MATCH(description, ?) OR MATCH(content, ?) | LIMIT 100)'
      );
      expect(esql).toContain(
        '(WHERE MATCH(title.semantic, ?) OR MATCH(description.semantic, ?) OR MATCH(content.semantic, ?) | LIMIT 100)'
      );
      // Outer limit after FUSE is exactly `size` — authorization is enforced
      // in-query, so there is no overfetch to absorb a post-filter.
      expect(esql).toContain('| LIMIT 10');
      // Sorted by relevance score after FUSE
      expect(esql).toContain('| SORT _score DESC');
      // spaceId is first positional param
      expect(params![0]).toBe('default');
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
      expect(esql).toContain('| WHERE type != ? OR origin.uri IN (?)');
      // Agent type filter
      expect(esql).toContain('| WHERE type IN (?, ?)');
      // Agent tag filter with MV_CONTAINS
      expect(esql).toContain('| WHERE MV_CONTAINS(tags, ?)');

      // Positional params: [spaceId, scopeTypeId, scopeUri, filterType1, filterType2, filterTag, ...queryX6]
      expect(params![0]).toBe('default'); // spaceId
      expect(params![1]).toBe('connector'); // constraints typeId
      expect(params![2]).toBe('connector://gh-1'); // constraints origin URI
      expect(params![3]).toBe('connector'); // filter type 1
      expect(params![4]).toBe('dashboard'); // filter type 2
      expect(params![5]).toBe('production'); // filter tag
      // query string repeated for each of the 6 MATCH branches
      expect(params!.slice(6)).toEqual(Array(6).fill('github'));
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
      // Query repeated six times (once per MATCH branch), after the spaceId param
      const queryString = 'how is the fleet performing this quarter';
      expect(params!.slice(1)).toEqual(Array(6).fill(queryString));
    });

    it('returns baseline fields only when no fields param is provided', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esqlQueryMock.mockResolvedValue({
        columns: makeEsqlColumns(false),
        values: [
          makeEsqlRow('chunk-1', 'lens', 'My Viz', 'ref-1', ['saved_object:lens/get'], {
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
        id: 'chunk-1',
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
          makeEsqlRow('chunk-1', 'lens', 'My Viz', 'ref-1', ['saved_object:lens/get'], {
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
        id: 'chunk-1',
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
          makeEsqlRow('chunk-bare', 'connector', 'Bare', 'b1', [], {
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
            'chunk-2',
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
        id: 'chunk-2',
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
          makeEsqlRow('chunk-1', 'lens', 'A', 'r1', [], { content: '' }),
          makeEsqlRow('chunk-2', 'lens', 'B', 'r2', [], { content: '' }),
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

    it('pushes an MV_CONTAINS authz filter into the query when securityAuthz is present', async () => {
      // Corpus uses two Kibana privileges; caller is authorized for one. The
      // pre-aggregation pass resolves the authorized subset and pushes it into
      // the ES|QL query so ES does the filtering.
      const securityAuthz = createMockSecurityAuthz(['saved_object:lens/get']);
      termsEnumMock.mockImplementation(
        buildTermsEnumMock({
          kibana: ['saved_object:lens/get', 'saved_object:dashboard/get'],
        })
      );
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger, securityAuthz });

      esqlQueryMock.mockResolvedValue({
        columns: makeEsqlColumns(true),
        values: [],
      } as any);

      await smlService.search({
        query: '*',
        size: 10,
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      // Both permission fields are enumerated up front.
      expect(termsEnumMock).toHaveBeenCalledWith(
        expect.objectContaining({ field: 'permissions.kibana.privileges.name' })
      );
      expect(termsEnumMock).toHaveBeenCalledWith(
        expect.objectContaining({ field: 'permissions.elasticsearch.indices.name' })
      );

      const { query: esql, params } = esqlQueryMock.mock.calls[0]![0]! as {
        query: string;
        params?: unknown[];
      };
      // Authorized Kibana subset pushed as an MV_CONTAINS subset filter. The
      // authorized set is bound as a single multivalue param (array), not an
      // inline `[?, ?]` list (which ES|QL rejects).
      expect(esql).toContain('| WHERE MV_CONTAINS(?, permissions.kibana.privileges.name)');
      // The authorized set is a single array-valued positional param.
      expect(params).toContainEqual(['saved_object:lens/get']);
    });

    it('restricts to public KIs when the caller holds nothing in a used dimension', async () => {
      // Corpus uses a Kibana privilege the caller does NOT hold → the authorized
      // array is empty, so MV_CONTAINS(?, field) admits only KIs whose required
      // set is a subset of {} (i.e. public KIs with no required privilege).
      const securityAuthz = createMockSecurityAuthz([]);
      termsEnumMock.mockImplementation(
        buildTermsEnumMock({ kibana: ['saved_object:dashboard/get'] })
      );
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger, securityAuthz });

      esqlQueryMock.mockResolvedValue({
        columns: makeEsqlColumns(true),
        values: [],
      } as any);

      await smlService.search({
        query: '*',
        size: 10,
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      const { query: esql, params } = esqlQueryMock.mock.calls[0]![0]! as {
        query: string;
        params?: unknown[];
      };
      // Clause is still emitted (dimension is used); the empty authorized array
      // is what restricts to public KIs.
      expect(esql).toContain('| WHERE MV_CONTAINS(?, permissions.kibana.privileges.name)');
      expect(params).toContainEqual([]);
    });

    it('emits no authz clause and skips enumeration when securityAuthz is absent', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esqlQueryMock.mockResolvedValue({
        columns: makeEsqlColumns(true),
        values: [
          makeEsqlRow('chunk-1', 'lens', 'Lens', 'r1', ['saved_object:lens/get'], { content: '' }),
          makeEsqlRow('chunk-2', 'dashboard', 'Dashboard', 'r2', ['saved_object:dashboard/get'], {
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

      // No security plugin → no enumeration, no authz filter, all rows returned.
      expect(termsEnumMock).not.toHaveBeenCalled();
      const { query: esql } = esqlQueryMock.mock.calls[0]![0]! as { query: string };
      expect(esql).not.toContain('| WHERE MV_CONTAINS(?, permissions.kibana.privileges.name)');
      expect(esql).not.toContain('| WHERE MV_CONTAINS(?, permissions.elasticsearch.indices.name)');
      expect(result.results).toHaveLength(2);
    });

    it('emits no authz clause when the corpus uses no permission dimensions', async () => {
      // securityAuthz present but the corpus is permission-free → both universes
      // are empty, so no privilege check and no authz WHERE clause.
      const securityAuthz = createMockSecurityAuthz([]);
      // termsEnumMock default already returns empty pages for both fields.
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger, securityAuthz });

      esqlQueryMock.mockResolvedValue({
        columns: makeEsqlColumns(true),
        values: [makeEsqlRow('chunk-1', 'lens', 'Lens', 'r1', [], { content: '' })],
      } as any);

      const result = await smlService.search({
        query: '*',
        size: 10,
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      const { query: esql } = esqlQueryMock.mock.calls[0]![0]! as { query: string };
      expect(esql).not.toContain('| WHERE MV_CONTAINS(?, permissions.kibana.privileges.name)');
      expect(esql).not.toContain('| WHERE MV_CONTAINS(?, permissions.elasticsearch.indices.name)');
      // The privilege check is skipped entirely when both universes are empty.
      expect(securityAuthz.checkPrivilegesDynamicallyWithRequest).not.toHaveBeenCalled();
      expect(result.results).toHaveLength(1);
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
    it('builds a single nested discovery_labels query (with inner_hits) and a space filter', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esClient.search.mockResolvedValue({
        hits: { total: 0, hits: [] },
      } as any);

      await smlService.autocomplete({
        query: 'git',
        size: 10,
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      expect(esClient.search).toHaveBeenCalledTimes(1);
      const call = esClient.search.mock.calls[0]![0]!;
      expect(call.query).toEqual({
        bool: {
          must: [
            {
              nested: {
                path: 'discovery_labels',
                query: {
                  multi_match: {
                    query: 'git',
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
                    encoder: 'html',
                    fields: {
                      'discovery_labels.value': {},
                    },
                  },
                },
              },
            },
          ],
          filter: [
            {
              bool: {
                should: [{ term: { spaces: 'default' } }, { term: { spaces: '*' } }],
                minimum_should_match: 1,
              },
            },
          ],
        },
      });
      expect(call._source).toEqual(['id', 'type', 'title', 'origin', 'permissions']);
    });

    it('uses match_all for query "*"', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esClient.search.mockResolvedValue({ hits: { total: 0, hits: [] } } as any);

      await smlService.autocomplete({
        query: '*',
        size: 10,
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      const call = esClient.search.mock.calls[0]![0]!;
      expect(call.query!.bool!.must).toEqual([{ match_all: {} }]);
    });

    it('threads per-type constraints through buildConstraintsFilter into the ES filter clauses', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esClient.search.mockResolvedValue({ hits: { total: 0, hits: [] } } as any);

      await smlService.autocomplete({
        query: 'git',
        size: 10,
        spaceId: 'default',
        esClient: scopedClient,
        request,
        constraints: { [SmlSearchFilterType.connector]: { ids: ['gh-1', 'jira-1'] } },
      });

      const call = esClient.search.mock.calls[0]![0]!;
      const filterClauses = call.query!.bool!.filter as Array<Record<string, unknown>>;
      // First clause is the space filter; second is the constraints filter.
      expect(filterClauses).toHaveLength(2);
      expect(filterClauses[1]).toEqual({
        bool: {
          should: [
            {
              terms: { 'origin.uri': ['connector://gh-1', 'connector://jira-1'] },
            },
            { bool: { must_not: [{ term: { type: 'connector' } }] } },
          ],
          minimum_should_match: 1,
        },
      });
    });

    it('maps inner_hits onto matched_discovery_labels', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esClient.search.mockResolvedValue({
        hits: {
          total: 1,
          hits: [
            {
              _source: {
                id: 'chunk-1',
                type: 'connector',
                title: 'GitHub Connector',
                origin: { uri: 'gh-1' },
                spaces: ['default'],
                permissions: makePermissions(),
              },
              _score: 5.4,
              inner_hits: {
                discovery_labels: {
                  hits: {
                    total: { value: 2, relation: 'eq' },
                    hits: [
                      {
                        _nested: { field: 'discovery_labels', offset: 0 },
                        _score: 5.4,
                        _source: { value: 'GitHub Connector', kind: 'title' },
                        highlight: {
                          'discovery_labels.value': ['<em>GitHub</em> Connector'],
                        },
                      },
                      {
                        _nested: { field: 'discovery_labels', offset: 2 },
                        _score: 4.1,
                        _source: { value: 'github', kind: 'tagline' },
                        highlight: {
                          'discovery_labels.value': ['<em>github</em>'],
                        },
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      } as any);

      const result = await smlService.autocomplete({
        query: 'git',
        size: 10,
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toEqual({
        id: 'chunk-1',
        type: 'connector',
        title: 'GitHub Connector',
        origin: { uri: 'gh-1' },
        spaces: ['default'],
        permissions: makePermissions(),
        matched_discovery_labels: [
          {
            value: 'GitHub Connector',
            kind: 'title',
            highlighted: '<em>GitHub</em> Connector',
          },
          { value: 'github', kind: 'tagline', highlighted: '<em>github</em>' },
        ],
      });
    });

    it('omits matched_discovery_labels when absent', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esClient.search.mockResolvedValue({
        hits: {
          total: 1,
          hits: [
            {
              _source: {
                id: 'chunk-2',
                type: 'dashboard',
                title: 'Sales Q3',
                origin: { uri: 'dash-1' },
                spaces: ['default'],
                permissions: makePermissions(),
              },
              _score: 2.0,
            },
          ],
        },
      } as any);

      const result = await smlService.autocomplete({
        query: 'sal',
        size: 10,
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      expect(result.results[0]).toEqual({
        id: 'chunk-2',
        type: 'dashboard',
        title: 'Sales Q3',
        origin: { uri: 'dash-1' },
        spaces: ['default'],
        permissions: makePermissions(),
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

    it('applies permission filtering when securityAuthz is present', async () => {
      const securityAuthz = createMockSecurityAuthzPartial(
        ['saved_object:dashboard/get'],
        ['saved_object:connector/get']
      );
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger, securityAuthz });

      esClient.search.mockResolvedValue({
        hits: {
          total: 2,
          hits: [
            {
              _source: {
                id: 'chunk-allowed',
                type: 'dashboard',
                title: 'Allowed',
                origin: { uri: 'd1' },
                spaces: ['default'],
                permissions: makePermissions(['saved_object:dashboard/get']),
              },
              _score: 3,
            },
            {
              _source: {
                id: 'chunk-denied',
                type: 'connector',
                title: 'Denied',
                origin: { uri: 'c1' },
                spaces: ['default'],
                permissions: makePermissions(['saved_object:connector/get']),
              },
              _score: 2,
            },
          ],
        },
      } as any);

      const result = await smlService.autocomplete({
        query: 'a',
        size: 10,
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].id).toBe('chunk-allowed');
    });

    describe('pre-aggregation authz filter (MV_CONTAINS subset)', () => {
      const startWithAuthz = (
        securityAuthz: AuthorizationServiceSetup,
        universe: { kibana?: string[]; esIndices?: string[] }
      ) => {
        termsEnumMock.mockImplementation(buildTermsEnumMock(universe));
        const service = createSmlService();
        service.setup({ logger });
        const smlService = service.start({ logger, securityAuthz });
        esqlQueryMock.mockResolvedValue({ columns: makeEsqlColumns(true), values: [] } as any);
        return smlService;
      };

      const getEsql = () =>
        esqlQueryMock.mock.calls[0]![0]! as { query: string; params?: unknown[] };

      it('pushes the authorized ES index subset as an MV_CONTAINS filter', async () => {
        const securityAuthz = createMockSecurityAuthz(['saved_object:lens/get'], ['logs-2024']);
        const smlService = startWithAuthz(securityAuthz, {
          kibana: ['saved_object:lens/get'],
          esIndices: ['logs-2024', 'super-secret'],
        });

        await smlService.search({
          query: '*',
          size: 10,
          spaceId: 'default',
          esClient: scopedClient,
          request,
        });

        const { query: esql, params } = getEsql();
        // Authorized index subset (logs-2024 only) pushed as MV_CONTAINS with the
        // authorized set bound as a single multivalue param.
        expect(esql).toContain('| WHERE MV_CONTAINS(?, permissions.elasticsearch.indices.name)');
        // The authorized array contains only the authorized index, never the
        // unauthorized one.
        expect(params).toContainEqual(['logs-2024']);
        expect(params).not.toContainEqual(['logs-2024', 'super-secret']);
        expect(params!.flat()).not.toContain('super-secret');
      });

      it('consolidates both permission dimensions into a single _has_privileges call', async () => {
        const securityAuthz = createMockSecurityAuthz(['saved_object:lens/get'], ['logs-2024']);
        const smlService = startWithAuthz(securityAuthz, {
          kibana: ['saved_object:lens/get'],
          esIndices: ['logs-2024', 'metrics'],
        });

        await smlService.search({
          query: '*',
          size: 10,
          spaceId: 'default',
          esClient: scopedClient,
          request,
        });

        const checkPrivileges = (securityAuthz.checkPrivilegesDynamicallyWithRequest as jest.Mock)
          .mock.results[0].value as jest.Mock;
        // Exactly one consolidated call carrying BOTH the kibana actions and the
        // ES index grants (the whole point of pre-aggregation).
        expect(checkPrivileges).toHaveBeenCalledTimes(1);
        const call = checkPrivileges.mock.calls[0][0] as {
          kibana?: string[];
          elasticsearch?: { index: Record<string, string[]> };
        };
        expect(call.kibana).toEqual(['saved_object:lens/get']);
        expect(new Set(Object.keys(call.elasticsearch!.index))).toEqual(
          new Set(['logs-2024', 'metrics'])
        );
        for (const perms of Object.values(call.elasticsearch!.index)) {
          expect(perms).toEqual(['read']);
        }
      });

      it('restricts to public KIs (empty authorized set) when caller holds no authorized index', async () => {
        const securityAuthz = createMockSecurityAuthz(['saved_object:lens/get'], []);
        const smlService = startWithAuthz(securityAuthz, {
          esIndices: ['logs-2024'],
        });

        await smlService.search({
          query: '*',
          size: 10,
          spaceId: 'default',
          esClient: scopedClient,
          request,
        });

        const { query: esql, params } = getEsql();
        // Clause is still emitted (dimension is used); the empty authorized array
        // is what restricts to public KIs (subset of {}).
        expect(esql).toContain('| WHERE MV_CONTAINS(?, permissions.elasticsearch.indices.name)');
        expect(params).toContainEqual([]);
      });

      it('fails closed when _terms_enum returns complete=false', async () => {
        const securityAuthz = createMockSecurityAuthz(['saved_object:lens/get']);
        termsEnumMock.mockImplementation(async (req: { field: string }) => {
          if (req.field === 'permissions.elasticsearch.indices.name') {
            return { complete: false, terms: ['logs-2024'] };
          }
          return { complete: true, terms: [] };
        });
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
        // Always return a full page → pagination never exhausts → ceiling hit.
        const fullPage = Array.from({ length: 1000 }, (_, i) => `idx-${i}`);
        termsEnumMock.mockImplementation(async (req: { field: string }) => {
          if (req.field === 'permissions.elasticsearch.indices.name') {
            return { complete: true, terms: fullPage };
          }
          return { complete: true, terms: [] };
        });
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

      it('treats a missing index as an empty universe (no authz clause)', async () => {
        const securityAuthz = createMockSecurityAuthz(['saved_object:lens/get']);
        termsEnumMock.mockRejectedValue(createNotFoundError());
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

        const { query: esql } = getEsql();
        // No authz WHERE clause is emitted (the EVAL materialization columns,
        // which always reference these paths, are not WHERE clauses).
        expect(esql).not.toContain('| WHERE MV_CONTAINS(?, permissions.kibana.privileges.name)');
        expect(esql).not.toContain(
          '| WHERE MV_CONTAINS(?, permissions.elasticsearch.indices.name)'
        );
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

      esClient.search.mockResolvedValue({
        hits: {
          total: 0,
          hits: [],
        },
      } as any);

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

      esClient.search.mockResolvedValue({
        hits: {
          total: 1,
          hits: [
            {
              _source: {
                id: 'item-1',
                permissions: makePermissions(['saved_object:lens/get']),
              },
            },
          ],
        },
      } as any);

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

      esClient.search.mockResolvedValue({
        hits: {
          total: 1,
          hits: [
            {
              _source: {
                id: 'item-1',
                permissions: makePermissions(['saved_object:dashboard/get']),
              },
            },
          ],
        },
      } as any);

      const result = await smlService.checkItemsAccess({
        ids: ['item-1'],
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      expect(result.get('item-1')).toBe(false);
    });

    it('grants access for items with empty permissions', async () => {
      const securityAuthz = createMockSecurityAuthz([]);
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger, securityAuthz });

      esClient.search.mockResolvedValue({
        hits: {
          total: 1,
          hits: [
            {
              _source: {
                id: 'item-1',
                permissions: makePermissions(),
              },
            },
          ],
        },
      } as any);

      const result = await smlService.checkItemsAccess({
        ids: ['item-1'],
        spaceId: 'default',
        esClient: scopedClient,
        request,
      });

      expect(result.get('item-1')).toBe(true);
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

      esClient.search.mockResolvedValue({
        hits: { total: 0, hits: [] },
      } as any);

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
              filter: [
                { terms: { id: ['id-1'] } },
                {
                  bool: {
                    should: [{ term: { spaces: 'my-space' } }, { term: { spaces: '*' } }],
                    minimum_should_match: 1,
                  },
                },
              ],
            },
          },
          _source: ['id', 'permissions'],
        })
      );
      expect(
        (scopedClient.asCurrentUser as jest.Mocked<ElasticsearchClient>).search
      ).not.toHaveBeenCalled();
    });

    describe('elasticsearch.indices post-filter (combined checkPrivileges all-of)', () => {
      const makeHit = (
        overrides: {
          id?: string;
          indices?: string[];
          kbnPrivs?: string[];
        } = {}
      ) => ({
        _source: {
          id: overrides.id ?? 'id-x',
          permissions: makePermissions(
            overrides.kbnPrivs ?? ['saved_object:lens/get'],
            overrides.indices ?? []
          ),
        },
      });

      it('grants access when all elasticsearch.indices are read-authorized', async () => {
        const securityAuthz = createMockSecurityAuthz(['saved_object:lens/get'], ['logs-2024']);
        const service = createSmlService();
        service.setup({ logger });
        const smlService = service.start({ logger, securityAuthz });

        esClient.search.mockResolvedValueOnce({
          hits: {
            total: 1,
            hits: [makeHit({ id: 'id-1', indices: ['logs-2024'] })],
          },
        } as any);

        const result = await smlService.checkItemsAccess({
          ids: ['id-1'],
          spaceId: 'default',
          esClient: scopedClient,
          request,
        });

        expect(result.get('id-1')).toBe(true);
        const checkPrivileges = (securityAuthz.checkPrivilegesDynamicallyWithRequest as jest.Mock)
          .mock.results[0].value as jest.Mock;
        expect(checkPrivileges).toHaveBeenCalledWith(
          expect.objectContaining({
            elasticsearch: { cluster: [], index: { 'logs-2024': ['read'] } },
          })
        );
      });

      it('denies access when the user lacks read on ANY elasticsearch.indices value', async () => {
        const securityAuthz = createMockSecurityAuthz(['saved_object:lens/get'], ['logs-2024']);
        const service = createSmlService();
        service.setup({ logger });
        const smlService = service.start({ logger, securityAuthz });

        esClient.search.mockResolvedValueOnce({
          hits: {
            total: 1,
            hits: [
              makeHit({
                id: 'id-1',
                indices: ['logs-2024', 'super-secret'],
              }),
            ],
          },
        } as any);

        const result = await smlService.checkItemsAccess({
          ids: ['id-1'],
          spaceId: 'default',
          esClient: scopedClient,
          request,
        });

        expect(result.get('id-1')).toBe(false);
      });

      it('grants access for items with kibana privileges OK and no elasticsearch.indices', async () => {
        const securityAuthz = createMockSecurityAuthz(['saved_object:lens/get']);
        const service = createSmlService();
        service.setup({ logger });
        const smlService = service.start({ logger, securityAuthz });

        esClient.search.mockResolvedValueOnce({
          hits: {
            total: 1,
            hits: [makeHit({ id: 'id-1' })],
          },
        } as any);

        const result = await smlService.checkItemsAccess({
          ids: ['id-1'],
          spaceId: 'default',
          esClient: scopedClient,
          request,
        });

        expect(result.get('id-1')).toBe(true);
        const checkPrivileges = (securityAuthz.checkPrivilegesDynamicallyWithRequest as jest.Mock)
          .mock.results[0].value as jest.Mock;
        const lastCall = checkPrivileges.mock.calls[0]?.[0] as
          | {
              elasticsearch?: unknown;
            }
          | undefined;
        expect(lastCall?.elasticsearch).toBeUndefined();
      });

      it('fails closed when checkPrivileges throws — denies items with deps, keeps trivial items', async () => {
        const securityAuthz = createMockSecurityAuthz(['saved_object:lens/get'], ['logs-2024']);
        const service = createSmlService();
        service.setup({ logger });
        const smlService = service.start({ logger, securityAuthz });

        esClient.search.mockResolvedValueOnce({
          hits: {
            total: 2,
            hits: [
              // Truly trivial item — no kibana privs and no indices —
              // passes both per-item checks regardless of authz state.
              makeHit({ id: 'trivial', kbnPrivs: [], indices: [] }),
              makeHit({ id: 'with-deps', indices: ['logs-2024'] }),
            ],
          },
        } as any);
        const checkPrivileges = (
          securityAuthz.checkPrivilegesDynamicallyWithRequest as jest.Mock
        )() as jest.Mock;
        checkPrivileges.mockRejectedValueOnce(new Error('cluster unreachable'));

        const result = await smlService.checkItemsAccess({
          ids: ['trivial', 'with-deps'],
          spaceId: 'default',
          esClient: scopedClient,
          request,
        });

        expect(result.get('trivial')).toBe(true);
        expect(result.get('with-deps')).toBe(false);
      });
    });
  });

  describe('getDocuments', () => {
    it('fetches documents from ES and returns Map', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esClient.search.mockResolvedValue({
        hits: {
          total: 2,
          hits: [
            {
              _source: {
                id: 'doc-1',
                type: 'lens',
                title: 'Doc 1',
                origin: { uri: 'lens://ref-1' },
                content: 'content 1',
                created_at: '2024-01-01',
                updated_at: '2024-01-02',
                spaces: ['default'],
                permissions: makePermissions(),
              },
            },
            {
              _source: {
                id: 'doc-2',
                type: 'dashboard',
                title: 'Doc 2',
                origin: { uri: 'dashboard://ref-2' },
                content: 'content 2',
                description: 'dash desc',
                user_id: 'u2',
                references: [{ uri: 'lens:x:y' }],
                created_at: '2024-01-01',
                updated_at: '2024-01-02',
                spaces: ['default'],
                permissions: makePermissions(),
              },
            },
          ],
        },
      } as any);

      const result = await smlService.getDocuments({
        ids: ['doc-1', 'doc-2'],
        spaceId: 'default',
        esClient: scopedClient,
      });

      expect(result.size).toBe(2);
      expect(result.get('doc-1')).toEqual({
        id: 'doc-1',
        type: 'lens',
        title: 'Doc 1',
        origin_id: 'ref-1',
        origin: { uri: 'lens://ref-1' },
        content: 'content 1',
        created_at: '2024-01-01',
        updated_at: '2024-01-02',
        spaces: ['default'],
        permissions: makePermissions(),
        ingestion_method: 'crawled',
      });
      expect(result.get('doc-2')).toEqual({
        id: 'doc-2',
        type: 'dashboard',
        title: 'Doc 2',
        origin_id: 'ref-2',
        origin: { uri: 'dashboard://ref-2' },
        content: 'content 2',
        description: 'dash desc',
        user_id: 'u2',
        references: [{ uri: 'lens:x:y' }],
        created_at: '2024-01-01',
        updated_at: '2024-01-02',
        spaces: ['default'],
        permissions: makePermissions(),
        ingestion_method: 'crawled',
      });
    });

    it('round-trips all new schema fields (origin, tags, discovery_labels, extended_attrs)', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esClient.search.mockResolvedValue({
        hits: {
          total: 1,
          hits: [
            {
              _source: {
                id: 'doc-3',
                type: 'dashboard',
                title: 'Sales Q3',
                origin: { uri: 'dashboard://dash-100' },
                content: 'sales content',
                description: 'sales summary',
                tags: ['sales', 'executive'],
                discovery_labels: [{ value: 'q3 sales', kind: 'tagline' }],
                extended_attrs: { owner_team: 'sales-ops' },
                user_id: 'user-7',
                references: [{ uri: 'category://sales' }],
                created_at: '2026-04-01T00:00:00.000Z',
                updated_at: '2026-04-02T00:00:00.000Z',
                spaces: ['default'],
                permissions: makePermissions(['saved_object:dashboard/get']),
              },
            },
          ],
        },
      } as any);

      const result = await smlService.getDocuments({
        ids: ['doc-3'],
        spaceId: 'default',
        esClient: scopedClient,
      });

      expect(result.get('doc-3')).toEqual({
        id: 'doc-3',
        type: 'dashboard',
        title: 'Sales Q3',
        origin_id: 'dash-100',
        origin: { uri: 'dashboard://dash-100' },
        content: 'sales content',
        description: 'sales summary',
        tags: ['sales', 'executive'],
        discovery_labels: [{ value: 'q3 sales', kind: 'tagline' }],
        extended_attrs: { owner_team: 'sales-ops' },
        user_id: 'user-7',
        references: [{ uri: 'category://sales' }],
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-02T00:00:00.000Z',
        spaces: ['default'],
        permissions: makePermissions(['saved_object:dashboard/get']),
        ingestion_method: 'crawled',
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

      esClient.search.mockResolvedValue({
        hits: { total: 0, hits: [] },
      } as any);

      await smlService.getDocuments({
        ids: ['id-1', 'id-2'],
        spaceId: 'my-space',
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
                { terms: { id: ['id-1', 'id-2'] } },
                {
                  bool: {
                    should: [{ term: { spaces: 'my-space' } }, { term: { spaces: '*' } }],
                    minimum_should_match: 1,
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

  describe('listDocuments', () => {
    const sampleHit = {
      _source: {
        id: 'doc-1',
        type: 'lens',
        title: 'Doc 1',
        origin_id: 'ref-1',
        origin: { uri: 'lens://ref-1' },
        content: 'c',
        created_at: '2024-01-01',
        updated_at: '2024-01-02',
        spaces: ['default'],
        permissions: makePermissions(),
        ingestion_method: 'crawled' as const,
      },
    };

    it('passes pagination params to ES with sorted by updated_at desc', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esClient.search.mockResolvedValue({
        hits: { total: 1, hits: [sampleHit] },
      } as any);

      await smlService.listDocuments({
        spaceId: 'default',
        esClient: scopedClient,
        page: 3,
        perPage: 25,
      });

      const call = esClient.search.mock.calls[0]![0]!;
      expect(call.from).toBe(50);
      expect(call.size).toBe(25);
      expect(call.sort).toEqual([{ updated_at: { order: 'desc' } }]);
    });

    it('uses default page=1 perPage=20 when not specified', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esClient.search.mockResolvedValue({
        hits: { total: 0, hits: [] },
      } as any);

      await smlService.listDocuments({
        spaceId: 'default',
        esClient: scopedClient,
      });

      const call = esClient.search.mock.calls[0]![0]!;
      expect(call.from).toBe(0);
      expect(call.size).toBe(20);
    });

    it('adds optional type and origin_uri filters when provided', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esClient.search.mockResolvedValue({
        hits: { total: 0, hits: [] },
      } as any);

      await smlService.listDocuments({
        spaceId: 'default',
        esClient: scopedClient,
        type: 'dashboard',
        originUri: 'dashboard://dash-1',
      });

      const call = esClient.search.mock.calls[0]![0]! as {
        query?: { bool?: { filter?: unknown[] } };
      };
      const filters = call.query!.bool!.filter!;
      expect(filters).toContainEqual({ term: { type: 'dashboard' } });
      expect(filters).toContainEqual({ term: { 'origin.uri': 'dashboard://dash-1' } });
    });

    it('does not add type/origin_uri filters when omitted', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esClient.search.mockResolvedValue({
        hits: { total: 0, hits: [] },
      } as any);

      await smlService.listDocuments({
        spaceId: 'default',
        esClient: scopedClient,
      });

      const call = esClient.search.mock.calls[0]![0]! as {
        query?: { bool?: { filter?: unknown[] } };
      };
      const filters = call.query!.bool!.filter!;
      expect(filters).toHaveLength(1); // only the space filter
    });

    it('adds a terms: { tags } filter when tags are provided', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esClient.search.mockResolvedValue({
        hits: { total: 0, hits: [] },
      } as any);

      await smlService.listDocuments({
        spaceId: 'default',
        esClient: scopedClient,
        tags: ['otel', 'claude-code'],
      });

      const call = esClient.search.mock.calls[0]![0]! as {
        query?: { bool?: { filter?: unknown[] } };
      };
      const filters = call.query!.bool!.filter!;
      expect(filters).toContainEqual({ terms: { tags: ['otel', 'claude-code'] } });
    });

    it('does not add a tags filter when tags is omitted', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esClient.search.mockResolvedValue({
        hits: { total: 0, hits: [] },
      } as any);

      await smlService.listDocuments({
        spaceId: 'default',
        esClient: scopedClient,
      });

      const call = esClient.search.mock.calls[0]![0]! as {
        query?: { bool?: { filter?: unknown[] } };
      };
      const filters = call.query!.bool!.filter! as Array<Record<string, unknown>>;
      // Only the space filter should be present — no terms: { tags: ... } entry
      expect(filters).toHaveLength(1);
      const hasTagsFilter = filters.some((f) => 'terms' in f && 'tags' in (f.terms as object));
      expect(hasTagsFilter).toBe(false);
    });

    it('returns empty results when index does not exist', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esClient.search.mockRejectedValue(createNotFoundError());

      const result = await smlService.listDocuments({
        spaceId: 'default',
        esClient: scopedClient,
      });

      expect(result).toEqual({ total: 0, results: [] });
    });

    it('maps response total and results correctly', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esClient.search.mockResolvedValue({
        hits: { total: { value: 1, relation: 'eq' }, hits: [sampleHit] },
      } as any);

      const result = await smlService.listDocuments({
        spaceId: 'default',
        esClient: scopedClient,
      });

      expect(result.total).toBe(1);
      expect(result.results).toEqual([sampleHit._source]);
    });

    it('throws on non-404 errors', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esClient.search.mockRejectedValue(new Error('Connection refused'));

      await expect(
        smlService.listDocuments({
          spaceId: 'default',
          esClient: scopedClient,
        })
      ).rejects.toThrow('Connection refused');
      expect(logger.warn).toHaveBeenCalledWith('SML listDocuments failed: Connection refused');
    });

    it('throws SmlResultWindowExceededError when ES rejects with result-window error', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      const reason =
        'Result window is too large, from + size must be less than or equal to: [10000] but was [11000]';
      esClient.search.mockRejectedValue(
        new errors.ResponseError({
          statusCode: 400,
          body: {
            error: {
              type: 'search_phase_execution_exception',
              reason: 'all shards failed',
              root_cause: [{ type: 'illegal_argument_exception', reason }],
              caused_by: { type: 'illegal_argument_exception', reason },
            },
          },
          warnings: [],
          headers: {},
          meta: {} as any,
        })
      );

      await expect(
        smlService.listDocuments({
          spaceId: 'default',
          esClient: scopedClient,
          page: 11,
          perPage: 1000,
        })
      ).rejects.toBeInstanceOf(SmlResultWindowExceededError);
      // logger.warn is the bucket for unexpected ES failures; the typed error
      // is an expected outcome and should not log there.
      expect(logger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('SML listDocuments failed')
      );
    });

    it('does not translate unrelated 400 ES errors', async () => {
      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      esClient.search.mockRejectedValue(
        new errors.ResponseError({
          statusCode: 400,
          body: {
            error: { type: 'parse_exception', reason: 'unparseable query' },
          },
          warnings: [],
          headers: {},
          meta: {} as any,
        })
      );

      await expect(
        smlService.listDocuments({
          spaceId: 'default',
          esClient: scopedClient,
        })
      ).rejects.not.toBeInstanceOf(SmlResultWindowExceededError);
    });
  });

  describe('upsertDocument', () => {
    let smlClient: { get: jest.Mock; index: jest.Mock; delete: jest.Mock };

    beforeEach(() => {
      smlClient = {
        get: jest.fn(),
        index: jest.fn().mockResolvedValue({}),
        delete: jest.fn(),
      };
      (createSmlStorage as jest.Mock).mockReturnValue({
        getClient: () => smlClient,
      });
    });

    it('creates a new document with spaces=[spaceId] and equal timestamps when none exists (404)', async () => {
      smlClient.get.mockRejectedValue(createNotFoundError());

      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      const result = await smlService.upsertDocument({
        id: 'doc-1',
        spaceId: 'default',
        document: {
          type: 'lens',
          title: 'New Doc',
          origin_id: 'ref-1',
          content: 'c',
        },
        esClient: scopedClient,
      });

      expect(result).not.toBeNull();
      expect(result!.created).toBe(true);
      expect(result!.document.id).toBe('doc-1');
      expect(result!.document.spaces).toEqual(['default']);
      expect(result!.document.created_at).toBeDefined();
      expect(result!.document.created_at).toBe(result!.document.updated_at);
      expect(result!.document.permissions).toEqual(makePermissions());
      expect(smlClient.index).toHaveBeenCalledWith({
        id: 'doc-1',
        document: result!.document,
      });
    });

    it('updates an existing document, preserving created_at and spaces', async () => {
      smlClient.get.mockResolvedValue({
        found: true,
        _source: {
          id: 'doc-1',
          type: 'lens',
          title: 'Old',
          origin_id: 'ref-1',
          content: 'old',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-06-01T00:00:00.000Z',
          spaces: ['default', 'engineering'],
          permissions: makePermissions(),
        },
      });

      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      const result = await smlService.upsertDocument({
        id: 'doc-1',
        spaceId: 'default',
        document: {
          type: 'lens',
          title: 'New',
          origin_id: 'ref-1',
          content: 'new',
          permissions: makePermissions(['saved_object:lens/get']),
        },
        esClient: scopedClient,
      });

      expect(result).not.toBeNull();
      expect(result!.created).toBe(false);
      expect(result!.document.created_at).toBe('2023-01-01T00:00:00.000Z');
      expect(result!.document.updated_at).not.toBe('2023-06-01T00:00:00.000Z');
      expect(result!.document.title).toBe('New');
      expect(result!.document.permissions).toEqual(makePermissions(['saved_object:lens/get']));
      // existing spaces are preserved — caller cannot widen or narrow membership
      expect(result!.document.spaces).toEqual(['default', 'engineering']);
    });

    it('persists permissions.elasticsearch.indices when caller supplies concrete names', async () => {
      smlClient.get.mockRejectedValue(createNotFoundError());

      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      const result = await smlService.upsertDocument({
        id: 'doc-1',
        spaceId: 'default',
        document: {
          type: 'visualization',
          title: 'Viz',
          origin_id: 'ref-1',
          content: 'c',
          permissions: makePermissions([], ['logs-app-*', 'metrics-prod']),
        },
        esClient: scopedClient,
      });

      expect(result).not.toBeNull();
      expect(result!.document.permissions).toEqual(
        makePermissions([], ['logs-app-*', 'metrics-prod'])
      );
      expect(smlClient.index).toHaveBeenCalledWith({
        id: 'doc-1',
        document: expect.objectContaining({
          permissions: makePermissions([], ['logs-app-*', 'metrics-prod']),
        }),
      });
    });

    it('normalizes permissions to empty inner arrays when input omits them', async () => {
      smlClient.get.mockRejectedValue(createNotFoundError());

      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      // Permissions absent on input → stored as `{ kibana: { privileges: [] }, elasticsearch: { indices: [] } }`.
      const undefinedResult = await smlService.upsertDocument({
        id: 'doc-1',
        spaceId: 'default',
        document: {
          type: 'visualization',
          title: 'Viz',
          origin_id: 'ref-1',
          content: 'c',
        },
        esClient: scopedClient,
      });
      expect(undefinedResult!.document.permissions).toEqual(makePermissions());
      expect(smlClient.index).toHaveBeenLastCalledWith({
        id: 'doc-1',
        document: expect.objectContaining({ permissions: makePermissions() }),
      });

      // Explicit `permissions: undefined` and partial inputs both collapse to the
      // empty-but-fully-shaped default.
      const emptyResult = await smlService.upsertDocument({
        id: 'doc-2',
        spaceId: 'default',
        document: {
          type: 'visualization',
          title: 'Viz',
          origin_id: 'ref-2',
          content: 'c',
          permissions: makePermissions(),
        },
        esClient: scopedClient,
      });
      expect(emptyResult!.document.permissions).toEqual(makePermissions());
      expect(smlClient.index).toHaveBeenLastCalledWith({
        id: 'doc-2',
        document: expect.objectContaining({ permissions: makePermissions() }),
      });
    });

    it('returns null when an existing document is not visible in the caller space', async () => {
      smlClient.get.mockResolvedValue({
        found: true,
        _source: {
          id: 'doc-1',
          type: 'lens',
          title: 'Old',
          origin_id: 'ref-1',
          content: 'old',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-06-01T00:00:00.000Z',
          spaces: ['other-space'],
          permissions: makePermissions(),
        },
      });

      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      const result = await smlService.upsertDocument({
        id: 'doc-1',
        spaceId: 'default',
        document: {
          type: 'lens',
          title: 'New',
          origin_id: 'ref-1',
          content: 'new',
        },
        esClient: scopedClient,
      });

      expect(result).toBeNull();
      expect(smlClient.index).not.toHaveBeenCalled();
    });

    it('treats spaces=["*"] as visible in any caller space', async () => {
      smlClient.get.mockResolvedValue({
        found: true,
        _source: {
          id: 'doc-1',
          type: 'lens',
          title: 'Old',
          origin_id: 'ref-1',
          content: 'old',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-06-01T00:00:00.000Z',
          spaces: ['*'],
          permissions: makePermissions(),
        },
      });

      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      const result = await smlService.upsertDocument({
        id: 'doc-1',
        spaceId: 'default',
        document: {
          type: 'lens',
          title: 'New',
          origin_id: 'ref-1',
          content: 'new',
        },
        esClient: scopedClient,
      });

      expect(result).not.toBeNull();
      expect(result!.created).toBe(false);
      expect(result!.document.spaces).toEqual(['*']);
    });

    it('throws when storage lookup fails with non-404', async () => {
      smlClient.get.mockRejectedValue(new Error('boom'));

      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      await expect(
        smlService.upsertDocument({
          id: 'doc-1',
          spaceId: 'default',
          document: {
            type: 'lens',
            title: 'x',
            origin_id: 'ref-1',
            content: 'c',
          },
          esClient: scopedClient,
        })
      ).rejects.toThrow('boom');
      expect(smlClient.index).not.toHaveBeenCalled();
    });

    it('stores provided tags on create', async () => {
      smlClient.get.mockRejectedValue(createNotFoundError());

      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      const result = await smlService.upsertDocument({
        id: 'doc-tag-create',
        spaceId: 'default',
        document: {
          type: 'lens',
          title: 'Tagged Doc',
          origin_id: 'ref-1',
          content: 'c',
          tags: ['otel', 'claude-code'],
        },
        esClient: scopedClient,
      });

      expect(result).not.toBeNull();
      expect(result!.document.tags).toEqual(['otel', 'claude-code']);
      expect(smlClient.index).toHaveBeenCalledWith(
        expect.objectContaining({
          document: expect.objectContaining({ tags: ['otel', 'claude-code'] }),
        })
      );
    });

    it('defaults tags to [] on create when caller omits the field', async () => {
      smlClient.get.mockRejectedValue(createNotFoundError());

      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      const result = await smlService.upsertDocument({
        id: 'doc-no-tags',
        spaceId: 'default',
        document: {
          type: 'lens',
          title: 'No Tags',
          origin_id: 'ref-1',
          content: 'c',
        },
        esClient: scopedClient,
      });

      expect(result).not.toBeNull();
      expect(result!.document.tags).toEqual([]);
    });

    it('replaces existing tags when caller provides new tags on update', async () => {
      smlClient.get.mockResolvedValue({
        found: true,
        _source: {
          id: 'doc-1',
          type: 'lens',
          title: 'Old',
          origin_id: 'ref-1',
          content: 'old',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-06-01T00:00:00.000Z',
          spaces: ['default'],
          tags: ['old-tag'],
          permissions: makePermissions(),
        },
      });

      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      const result = await smlService.upsertDocument({
        id: 'doc-1',
        spaceId: 'default',
        document: {
          type: 'lens',
          title: 'New',
          origin_id: 'ref-1',
          content: 'new',
          tags: ['new-tag', 'another'],
        },
        esClient: scopedClient,
      });

      expect(result).not.toBeNull();
      expect(result!.document.tags).toEqual(['new-tag', 'another']);
    });

    it('preserves existing tags on update when caller omits the field', async () => {
      smlClient.get.mockResolvedValue({
        found: true,
        _source: {
          id: 'doc-1',
          type: 'lens',
          title: 'Old',
          origin_id: 'ref-1',
          content: 'old',
          created_at: '2023-01-01T00:00:00.000Z',
          updated_at: '2023-06-01T00:00:00.000Z',
          spaces: ['default'],
          tags: ['keep-me'],
          permissions: makePermissions(),
        },
      });

      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      const result = await smlService.upsertDocument({
        id: 'doc-1',
        spaceId: 'default',
        document: {
          type: 'lens',
          title: 'New',
          origin_id: 'ref-1',
          content: 'new',
          // tags omitted intentionally
        },
        esClient: scopedClient,
      });

      expect(result).not.toBeNull();
      expect(result!.document.tags).toEqual(['keep-me']);
    });
  });

  describe('deleteDocument', () => {
    let smlClient: { get: jest.Mock; index: jest.Mock; delete: jest.Mock };

    beforeEach(() => {
      smlClient = {
        get: jest.fn(),
        index: jest.fn(),
        delete: jest.fn(),
      };
      (createSmlStorage as jest.Mock).mockReturnValue({
        getClient: () => smlClient,
      });
    });

    it('returns false when no document exists in the requested space', async () => {
      esClient.search.mockResolvedValue({ hits: { total: 0, hits: [] } } as any);

      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      const result = await smlService.deleteDocument({
        id: 'missing',
        spaceId: 'default',
        esClient: scopedClient,
      });

      expect(result).toBe(false);
      expect(smlClient.delete).not.toHaveBeenCalled();
    });

    it('returns true when the document is deleted', async () => {
      esClient.search.mockResolvedValue({
        hits: {
          total: 1,
          hits: [
            {
              _source: {
                id: 'doc-1',
                type: 'lens',
                title: 'A',
                origin: { uri: 'lens://ref-1' },
                content: '',
                created_at: '',
                updated_at: '',
                spaces: ['default'],
                permissions: makePermissions(),
              },
            },
          ],
        },
      } as any);
      smlClient.delete.mockResolvedValue({ acknowledged: true, result: 'deleted' });

      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      const result = await smlService.deleteDocument({
        id: 'doc-1',
        spaceId: 'default',
        esClient: scopedClient,
      });

      expect(result).toBe(true);
      expect(smlClient.delete).toHaveBeenCalledWith({ id: 'doc-1' });
    });

    it('returns false when the storage delete reports not_found', async () => {
      esClient.search.mockResolvedValue({
        hits: {
          total: 1,
          hits: [
            {
              _source: {
                id: 'doc-1',
                type: 'lens',
                title: 'A',
                origin: { uri: 'lens://ref-1' },
                content: '',
                created_at: '',
                updated_at: '',
                spaces: ['default'],
                permissions: makePermissions(),
              },
            },
          ],
        },
      } as any);
      smlClient.delete.mockResolvedValue({ acknowledged: true, result: 'not_found' });

      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      const result = await smlService.deleteDocument({
        id: 'doc-1',
        spaceId: 'default',
        esClient: scopedClient,
      });

      expect(result).toBe(false);
    });

    it('returns false on a 404 from storage delete', async () => {
      esClient.search.mockResolvedValue({
        hits: {
          total: 1,
          hits: [
            {
              _source: {
                id: 'doc-1',
                type: 'lens',
                title: 'A',
                origin: { uri: 'lens://ref-1' },
                content: '',
                created_at: '',
                updated_at: '',
                spaces: ['default'],
                permissions: makePermissions(),
              },
            },
          ],
        },
      } as any);
      smlClient.delete.mockRejectedValue(createNotFoundError());

      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      const result = await smlService.deleteDocument({
        id: 'doc-1',
        spaceId: 'default',
        esClient: scopedClient,
      });

      expect(result).toBe(false);
    });

    it('throws on non-404 errors from storage delete', async () => {
      esClient.search.mockResolvedValue({
        hits: {
          total: 1,
          hits: [
            {
              _source: {
                id: 'doc-1',
                type: 'lens',
                title: 'A',
                origin: { uri: 'lens://ref-1' },
                content: '',
                created_at: '',
                updated_at: '',
                spaces: ['default'],
                permissions: makePermissions(),
              },
            },
          ],
        },
      } as any);
      smlClient.delete.mockRejectedValue(new Error('boom'));

      const service = createSmlService();
      service.setup({ logger });
      const smlService = service.start({ logger });

      await expect(
        smlService.deleteDocument({
          id: 'doc-1',
          spaceId: 'default',
          esClient: scopedClient,
        })
      ).rejects.toThrow('boom');
      expect(logger.warn).toHaveBeenCalledWith('SML deleteDocument failed: boom');
    });
  });
});
