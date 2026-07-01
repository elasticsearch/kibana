/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createHash } from 'crypto';
import { elasticsearchServiceMock } from '@kbn/core/server/mocks';
import { fetchEvents, regroupEvents, enrichEventDocData } from './fetch_events_graph';
import type { Logger } from '@kbn/core/server';
import type { OriginEventId, EsQuery, EventEsqlRow } from './types';
import { GRAPH_TARGET_EUID_SOURCE_FIELDS } from './constants';
import type { EntityEnrichmentFields } from './fetch_entity_enrichment';
import { hashIds } from './utils';

describe('fetchEvents', () => {
  const esClient = elasticsearchServiceMock.createScopedClusterClient();
  let logger: Logger;

  beforeEach(() => {
    const toRecordsMock = jest.fn().mockResolvedValue({ columns: [], records: [{ id: 'dummy' }] });
    esClient.asCurrentUser.helpers.esql.mockReturnValue({
      toRecords: toRecordsMock,
      toArrowTable: jest.fn(),
      toArrowReader: jest.fn(),
    });

    logger = {
      trace: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
    } as unknown as Logger;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should throw an error for an invalid index pattern', async () => {
    await expect(() =>
      fetchEvents({
        esClient,
        logger,
        start: 0,
        end: 1000,
        originEventIds: [] as OriginEventId[],
        showUnknownTarget: false,
        indexPatterns: ['invalid pattern'],
        spaceId: 'default',
        esQuery: undefined,
      })
    ).rejects.toThrowError(/Invalid index pattern/);
  });

  it('should execute the esql query and return records for valid inputs', async () => {
    const result = await fetchEvents({
      esClient,
      logger,
      start: 0,
      end: 1000,
      originEventIds: [] as OriginEventId[],
      showUnknownTarget: false,
      indexPatterns: ['valid_index'],
      spaceId: 'default',
      esQuery: undefined,
    });

    expect(esClient.asCurrentUser.helpers.esql).toBeCalledTimes(1);
    const [args] = esClient.asCurrentUser.helpers.esql.mock.calls[0];
    expect(args.query).toContain('FROM valid_index');
    expect(result).toEqual({ columns: [], records: [{ id: 'dummy' }] });
  });

  it('should include origin event parameters when originEventIds are provided', async () => {
    const originEventIds: OriginEventId[] = [
      { id: '1', isAlert: true },
      { id: '2', isAlert: false },
    ];
    const esQuery: EsQuery = {
      bool: { filter: [], must: [], should: [], must_not: [] },
    };

    await fetchEvents({
      esClient,
      logger,
      start: 100,
      end: 200,
      originEventIds,
      showUnknownTarget: true,
      indexPatterns: ['valid_index'],
      spaceId: 'default',
      esQuery,
    });

    const [args] = esClient.asCurrentUser.helpers.esql.mock.calls[0];
    // Two origin IDs → og_id0, og_id1; one alert → og_alrt_id0
    expect(args.params).toHaveLength(3);
    const params = args.params as Array<Record<string, string>>;
    const keys = params?.map((p) => Object.keys(p)[0]) ?? [];
    expect(keys.filter((k) => k.startsWith('og_id'))).toEqual(['og_id0', 'og_id1']);
    expect(keys.filter((k) => k.startsWith('og_alrt_id'))).toEqual(['og_alrt_id0']);
  });

  describe('Target entity filtering', () => {
    it('should require at least one target field to exist when showUnknownTarget is false', async () => {
      await fetchEvents({
        esClient,
        logger,
        start: 0,
        end: 1000,
        originEventIds: [] as OriginEventId[],
        showUnknownTarget: false,
        indexPatterns: ['valid_index'],
        spaceId: 'default',
        esQuery: undefined,
      });

      const [args] = esClient.asCurrentUser.helpers.esql.mock.calls[0];
      const filterArg = args.filter as any;

      const allTargetFields = [
        ...GRAPH_TARGET_EUID_SOURCE_FIELDS.user,
        ...GRAPH_TARGET_EUID_SOURCE_FIELDS.host,
        ...GRAPH_TARGET_EUID_SOURCE_FIELDS.service,
        ...GRAPH_TARGET_EUID_SOURCE_FIELDS.generic,
      ];
      const expectedExistsChecks = allTargetFields.map((field) => ({ exists: { field } }));

      expect(filterArg.bool.filter).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            bool: expect.objectContaining({
              should: expect.arrayContaining(expectedExistsChecks),
              minimum_should_match: 1,
            }),
          }),
        ])
      );
    });

    it('should not filter targets when showUnknownTarget is true', async () => {
      await fetchEvents({
        esClient,
        logger,
        start: 0,
        end: 1000,
        originEventIds: [] as OriginEventId[],
        showUnknownTarget: true,
        indexPatterns: ['valid_index'],
        spaceId: 'default',
        esQuery: undefined,
      });

      const [args] = esClient.asCurrentUser.helpers.esql.mock.calls[0];
      const filterArg = args.filter as any;

      const hasTargetCheck = filterArg.bool.filter.some((f: any) =>
        f.bool?.should?.some((s: any) => s.exists?.field?.includes('target'))
      );
      expect(hasTargetCheck).toBe(false);
    });
  });

  describe('projectRouting', () => {
    const ALERTS_PATTERN = '.alerts-security.alerts-default';

    it('omits project_routing when not supplied', async () => {
      await fetchEvents({
        esClient,
        logger,
        start: 0,
        end: 1000,
        originEventIds: [] as OriginEventId[],
        showUnknownTarget: false,
        indexPatterns: ['logs-*'],
        spaceId: 'default',
        esQuery: undefined,
      });

      const [args] = esClient.asCurrentUser.helpers.esql.mock.calls[0];
      expect(args).not.toHaveProperty('project_routing');
    });

    it('forwards project_routing to the query when supplied', async () => {
      await fetchEvents({
        esClient,
        logger,
        start: 0,
        end: 1000,
        originEventIds: [] as OriginEventId[],
        showUnknownTarget: false,
        indexPatterns: [ALERTS_PATTERN],
        spaceId: 'default',
        esQuery: undefined,
        projectRouting: '_alias:*',
      });

      const [args] = esClient.asCurrentUser.helpers.esql.mock.calls[0];
      expect(args.project_routing).toBe('_alias:*');
    });

    it('passes an arbitrary project_routing value through unchanged', async () => {
      await fetchEvents({
        esClient,
        logger,
        start: 0,
        end: 1000,
        originEventIds: [] as OriginEventId[],
        showUnknownTarget: false,
        indexPatterns: ['logs-*'],
        spaceId: 'default',
        esQuery: undefined,
        projectRouting: '_alias:_origin',
      });

      const [args] = esClient.asCurrentUser.helpers.esql.mock.calls[0];
      expect(args.project_routing).toBe('_alias:_origin');
    });
  });
});

// Helper to build a minimal EventEsqlRow (pre-aggregated ESQL output) for tests.
let nextRowId = 0;
const buildEventEsqlRow = (
  overrides: Partial<EventEsqlRow> & Pick<EventEsqlRow, 'actorEntityId'>
): EventEsqlRow => {
  const docId = `doc-${++nextRowId}`;
  const isAlert = overrides.isAlert ?? false;
  return {
    action: 'test-action',
    targetEntityId: overrides.targetEntityId ?? null,
    isOrigin: false,
    isOriginAlert: false,
    isAlert,
    pinned: null,
    badge: 1,
    docs: [`{"id":"${docId}","type":"event"}`],
    docIds: [docId],
    alertDocIds: isAlert ? [docId] : [],
    nonAlertDocIds: isAlert ? [] : [docId],
    actorDocData: `{"id":"${overrides.actorEntityId}","type":"entity","sourceFields":{}}`,
    targetDocData: overrides.targetEntityId
      ? `{"id":"${overrides.targetEntityId}","type":"entity","sourceFields":{}}`
      : '',
    ...overrides,
  };
};

describe('regroupEvents', () => {
  it('returns empty array for empty input', () => {
    expect(regroupEvents([], new Map())).toEqual([]);
  });

  it('single record with no enrichment derives actorEntityType from EUID prefix', () => {
    const record = buildEventEsqlRow({
      actorEntityId: 'user:alice',
      targetEntityId: 'host:server1',
    });

    const [group] = regroupEvents([record], new Map());

    expect(group.actorNodeId).toBe('user:alice');
    expect(group.actorEntityType).toBe('user');
    expect(group.targetEntityType).toBe('host');
    expect(group.actorsDocData).toEqual([record.actorDocData]);
    expect(group.targetsDocData).toEqual([record.targetDocData]);
  });

  it('uses enrichment type and subType over EUID prefix when enrichment is present', () => {
    const record = buildEventEsqlRow({
      actorEntityId: 'user:alice',
      targetEntityId: 'host:server1',
    });
    const enrichmentMap = new Map<string, EntityEnrichmentFields>([
      [
        'user:alice',
        { name: 'Alice', type: 'user', subType: 'admin', engineType: 'ecs', hostIps: [] },
      ],
    ]);

    const [group] = regroupEvents([record], enrichmentMap);

    expect(group.actorEntityType).toBe('user');
    expect(group.actorEntitySubType).toBe('admin');
    expect(group.actorsDocData).toEqual([record.actorDocData]);
  });

  it('merges multiple rows of the same type group into one group and sums badges', () => {
    const record1 = buildEventEsqlRow({
      actorEntityId: 'user:alice',
      targetEntityId: 'host:server1',
    });
    const record2 = buildEventEsqlRow({
      actorEntityId: 'user:bob',
      targetEntityId: 'host:server1',
    });
    const record3 = buildEventEsqlRow({
      actorEntityId: 'user:bob',
      targetEntityId: 'host:server1',
    });

    const enrichmentMap = new Map<string, EntityEnrichmentFields>([
      ['user:alice', { name: 'Alice', type: 'user', subType: null, engineType: null, hostIps: [] }],
      ['user:bob', { name: 'Bob', type: 'user', subType: null, engineType: null, hostIps: [] }],
      [
        'host:server1',
        { name: 'server1', type: 'host', subType: null, engineType: null, hostIps: [] },
      ],
    ]);

    const result = regroupEvents([record1, record2, record3], enrichmentMap);

    expect(result).toHaveLength(1);
    expect(result[0].badge).toBe(3);

    // actorNodeId is SHA-256 of sorted unique entity IDs joined by ","
    const expectedNodeId = createHash('sha256')
      .update(['user:alice', 'user:bob'].sort().join(','))
      .digest('hex');
    expect(result[0].actorNodeId).toBe(expectedNodeId);
  });

  it('produces separate groups for rows with different actorType after enrichment', () => {
    const record1 = buildEventEsqlRow({
      actorEntityId: 'user:alice',
      targetEntityId: 'host:server1',
    });
    const record2 = buildEventEsqlRow({
      actorEntityId: 'host:webserver',
      targetEntityId: 'host:server1',
    });

    const enrichmentMap = new Map<string, EntityEnrichmentFields>([
      ['user:alice', { name: 'Alice', type: 'user', subType: null, engineType: null, hostIps: [] }],
      [
        'host:webserver',
        { name: 'webserver', type: 'host', subType: null, engineType: null, hostIps: [] },
      ],
    ]);

    expect(regroupEvents([record1, record2], enrichmentMap)).toHaveLength(2);
  });

  it('unenriched entities with a typed EUID prefix do not collapse with generic entities', () => {
    // service:iam.googleapis.com has a "service:" prefix → type 'service'
    // projects/my-proj has no prefix → type null (generic)
    // They must end up in separate groups even without enrichment
    const record = buildEventEsqlRow({
      actorEntityId: 'user:actor',
      targetEntityId: ['service:iam.googleapis.com', 'projects/my-proj'] as unknown as string,
    });

    const result = regroupEvents([record], new Map());

    expect(result).toHaveLength(2);
    const types = result.map((g) => g.targetEntityType).sort();
    expect(types).toEqual([null, 'service']);
  });

  it('labelNodeId is unique per target-type group even when doc IDs are shared', () => {
    // One ES|QL row with two target types (service vs generic) that share the same docs.
    // Each type group must produce a distinct label node.
    const record = buildEventEsqlRow({
      actorEntityId: 'user:actor',
      targetEntityId: ['service:svc', 'projects/generic'] as unknown as string,
      docIds: ['doc-shared'],
      docs: ['{"id":"doc-shared","type":"event"}'],
      nonAlertDocIds: ['doc-shared'],
      alertDocIds: [],
    });

    const result = regroupEvents([record], new Map());

    expect(result).toHaveLength(2);
    const labelIds = result.map((g) => g.labelNodeId);
    expect(labelIds[0]).not.toBe(labelIds[1]);
  });

  it('labelNodeId is SHA-256 of sorted document _ids plus targetNodeId sentinel', () => {
    const record1 = buildEventEsqlRow({
      actorEntityId: 'user:alice',
      docIds: ['doc-a'],
      nonAlertDocIds: ['doc-a'],
      alertDocIds: [],
    });
    const record2 = buildEventEsqlRow({
      actorEntityId: 'user:alice',
      docIds: ['doc-b'],
      nonAlertDocIds: ['doc-b'],
      alertDocIds: [],
    });

    const [group] = regroupEvents([record1, record2], new Map());

    // targetNodeId is null → '' sentinel; hashIds sorts inputs before hashing
    const expectedLabelNodeId = createHash('sha256')
      .update(['', 'doc-a', 'doc-b'].join(','))
      .digest('hex');
    expect(group.labelNodeId).toBe(expectedLabelNodeId);
  });

  it('does not double-count uniqueEventsCount when the same doc appears in multiple rows', () => {
    const record1 = buildEventEsqlRow({
      actorEntityId: 'user:alice',
      targetEntityId: 'host:server1',
      docIds: ['shared-doc-1'],
      nonAlertDocIds: ['shared-doc-1'],
      alertDocIds: [],
      isAlert: false,
    });
    const record2 = buildEventEsqlRow({
      actorEntityId: 'user:bob',
      targetEntityId: 'host:server1',
      docIds: ['shared-doc-1'],
      nonAlertDocIds: ['shared-doc-1'],
      alertDocIds: [],
      isAlert: false,
    });

    const enrichmentMap = new Map<string, EntityEnrichmentFields>([
      ['user:alice', { name: 'Alice', type: 'user', subType: null, engineType: null, hostIps: [] }],
      ['user:bob', { name: 'Bob', type: 'user', subType: null, engineType: null, hostIps: [] }],
    ]);

    const result = regroupEvents([record1, record2], enrichmentMap);

    expect(result).toHaveLength(1);
    expect(result[0].uniqueEventsCount).toBe(1);
    expect(result[0].uniqueAlertsCount).toBe(0);
  });

  it('uniqueAlertsCount and uniqueEventsCount count distinct _ids across merged rows', () => {
    const records = [
      buildEventEsqlRow({
        actorEntityId: 'user:alice',
        docIds: ['evt-1'],
        nonAlertDocIds: ['evt-1'],
        alertDocIds: [],
        isAlert: false,
      }),
      buildEventEsqlRow({
        actorEntityId: 'user:alice',
        docIds: ['evt-2'],
        nonAlertDocIds: ['evt-2'],
        alertDocIds: [],
        isAlert: false,
      }),
      buildEventEsqlRow({
        actorEntityId: 'user:alice',
        docIds: ['evt-1'],
        nonAlertDocIds: ['evt-1'],
        alertDocIds: [],
        isAlert: false,
      }), // dup
      buildEventEsqlRow({
        actorEntityId: 'user:alice',
        docIds: ['alert-1'],
        nonAlertDocIds: [],
        alertDocIds: ['alert-1'],
        isAlert: true,
      }),
      buildEventEsqlRow({
        actorEntityId: 'user:alice',
        docIds: ['alert-1'],
        nonAlertDocIds: [],
        alertDocIds: ['alert-1'],
        isAlert: true,
      }), // dup
    ];

    const [group] = regroupEvents(records, new Map());

    expect(group.uniqueEventsCount).toBe(2); // evt-1, evt-2
    expect(group.uniqueAlertsCount).toBe(1); // alert-1
    expect(group.badge).toBe(5); // sum of per-row badges
    expect(group.isAlert).toBe(true);
  });

  it('deduplicates actorsDocData when the same actor appears in multiple rows', () => {
    const actorDoc = '{"id":"user:alice","type":"entity","sourceFields":{}}';
    const targetBDoc = '{"id":"host:b","type":"entity","sourceFields":{}}';
    const targetCDoc = '{"id":"host:c","type":"entity","sourceFields":{}}';

    const record1 = buildEventEsqlRow({
      actorEntityId: 'user:alice',
      targetEntityId: 'host:b',
      actorDocData: actorDoc,
      targetDocData: targetBDoc,
    });
    const record2 = buildEventEsqlRow({
      actorEntityId: 'user:alice',
      targetEntityId: 'host:c',
      actorDocData: actorDoc,
      targetDocData: targetCDoc,
    });

    const enrichmentMap = new Map<string, EntityEnrichmentFields>([
      ['user:alice', { name: 'Alice', type: 'user', subType: null, engineType: null, hostIps: [] }],
      ['host:b', { name: 'B', type: 'host', subType: null, engineType: null, hostIps: [] }],
      ['host:c', { name: 'C', type: 'host', subType: null, engineType: null, hostIps: [] }],
    ]);

    const [group] = regroupEvents([record1, record2], enrichmentMap);

    expect((group.actorsDocData as string[]).length).toBe(1);
    expect(group.actorsDocData).toContain(actorDoc);
    expect((group.targetsDocData as string[]).length).toBe(2);
    expect(group.targetsDocData).toContain(targetBDoc);
    expect(group.targetsDocData).toContain(targetCDoc);
  });

  it('does not leak targetsDocData across type groups from the same row', () => {
    // One ES|QL row: actor → [service:svc, projects/generic]
    // Each type group must only contain its own target's doc data
    const serviceDoc = '{"id":"service:svc","type":"entity","sourceFields":{}}';
    const genericDoc = '{"id":"projects/generic","type":"entity","sourceFields":{}}';

    const record = buildEventEsqlRow({
      actorEntityId: 'user:actor',
      targetEntityId: ['service:svc', 'projects/generic'] as unknown as string,
      targetDocData: [serviceDoc, genericDoc] as unknown as string,
    });

    const result = regroupEvents([record], new Map());

    expect(result).toHaveLength(2);
    const serviceGroup = result.find((g) => g.targetEntityType === 'service')!;
    const genericGroup = result.find((g) => g.targetEntityType === null)!;

    expect(serviceGroup.targetsDocData).toContain(serviceDoc);
    expect(serviceGroup.targetsDocData).not.toContain(genericDoc);
    expect(genericGroup.targetsDocData).toContain(genericDoc);
    expect(genericGroup.targetsDocData).not.toContain(serviceDoc);
  });

  it('deduplicates docs when the same document appears across merged rows', () => {
    const sharedDocData = '{"id":"shared-_id","type":"event","index":".alerts"}';
    const record1 = buildEventEsqlRow({
      actorEntityId: 'user:alice',
      targetEntityId: 'host:b',
      docIds: ['shared-_id'],
      docs: [sharedDocData],
      nonAlertDocIds: ['shared-_id'],
      alertDocIds: [],
    });
    const record2 = buildEventEsqlRow({
      actorEntityId: 'user:alice',
      targetEntityId: 'host:c',
      docIds: ['shared-_id'],
      docs: [sharedDocData],
      nonAlertDocIds: ['shared-_id'],
      alertDocIds: [],
    });

    const enrichmentMap = new Map<string, EntityEnrichmentFields>([
      ['user:alice', { name: 'Alice', type: 'user', subType: null, engineType: null, hostIps: [] }],
      ['host:b', { name: 'B', type: 'host', subType: null, engineType: null, hostIps: [] }],
      ['host:c', { name: 'C', type: 'host', subType: null, engineType: null, hostIps: [] }],
    ]);

    const [group] = regroupEvents([record1, record2], enrichmentMap);

    expect((group.docs as string[]).filter((d) => d === sharedDocData).length).toBe(1);
  });

  it('does not add the empty-string sentinel to targetsDocData when targetDocData is ""', () => {
    const record = buildEventEsqlRow({
      actorEntityId: 'user:alice',
      targetEntityId: null,
      targetDocData: '',
    });

    const [group] = regroupEvents([record], new Map());

    expect(group.targetsDocData).toEqual([]);
    expect(group.targetsDocData).not.toContain('');
  });

  it('sorts groups by action DESC then pinned ASC then isOrigin DESC', () => {
    const recordA = buildEventEsqlRow({
      actorEntityId: 'user:alice',
      action: 'aaa-action',
      isOrigin: false,
      pinned: null,
    });
    const recordB = buildEventEsqlRow({
      actorEntityId: 'user:bob',
      action: 'zzz-action',
      isOrigin: true,
      pinned: null,
    });
    const recordC = buildEventEsqlRow({
      actorEntityId: 'user:charlie',
      action: 'mmm-action',
      isOrigin: false,
      pinned: 'user:charlie',
    });

    const result = regroupEvents([recordA, recordB, recordC], new Map());

    expect(result[0].action).toBe('zzz-action');
    expect(result[1].action).toBe('mmm-action');
    expect(result[2].action).toBe('aaa-action');
  });

  it('sums badge and unions docs across pre-aggregated rows of the same type group', () => {
    const enrichmentMap = new Map<string, EntityEnrichmentFields>([
      ['host:a', { type: 'host', subType: 'linux', name: 'A' }],
      ['host:b', { type: 'host', subType: 'linux', name: 'B' }],
      ['host:t', { type: 'host', subType: 'linux', name: 'T' }],
    ]);
    const rows: EventEsqlRow[] = [
      {
        action: 'connect',
        actorEntityId: 'host:a',
        targetEntityId: 'host:t',
        isOrigin: false,
        isOriginAlert: false,
        isAlert: false,
        pinned: null,
        badge: 3,
        docs: ['{"id":"d1"}', '{"id":"d2"}', '{"id":"d3"}'],
        docIds: ['d1', 'd2', 'd3'],
        alertDocIds: [],
        nonAlertDocIds: ['d1', 'd2', 'd3'],
        actorDocData: '{"id":"host:a"}',
        targetDocData: '{"id":"host:t"}',
      },
      {
        action: 'connect',
        actorEntityId: 'host:b',
        targetEntityId: 'host:t',
        isOrigin: false,
        isOriginAlert: false,
        isAlert: false,
        pinned: null,
        badge: 2,
        docs: ['{"id":"d4"}', '{"id":"d5"}'],
        docIds: ['d4', 'd5'],
        alertDocIds: [],
        nonAlertDocIds: ['d4', 'd5'],
        actorDocData: '{"id":"host:b"}',
        targetDocData: '{"id":"host:t"}',
      },
    ];

    const result = regroupEvents(rows, enrichmentMap);

    expect(result).toHaveLength(1);
    expect(result[0].badge).toBe(5);
    expect(result[0].uniqueEventsCount).toBe(5);
    expect(result[0].uniqueAlertsCount).toBe(0);
    expect(result[0].actorIdsCount).toBe(2);
    expect(result[0].targetIdsCount).toBe(1);
    expect(result[0].actorNodeId).toBe(hashIds(['host:a', 'host:b']));
    expect(result[0].targetNodeId).toBe('host:t');
  });
});

describe('enrichEventDocData', () => {
  it('returns empty array for empty input', () => {
    expect(enrichEventDocData([], new Map())).toEqual([]);
  });

  it('rebuilds actorsDocData with availableInEntityStore=false when no enrichment', () => {
    const record = buildEventEsqlRow({
      actorEntityId: 'user:alice',
      targetEntityId: 'host:server1',
    });
    const [group] = enrichEventDocData(regroupEvents([record], new Map()), new Map());

    const actorDoc = JSON.parse((group.actorsDocData as string[])[0]);
    expect(actorDoc.entity.availableInEntityStore).toBe(false);

    const targetDoc = JSON.parse((group.targetsDocData as string[])[0]);
    expect(targetDoc.entity.availableInEntityStore).toBe(false);
  });

  it('rebuilds actorsDocData with availableInEntityStore=true and metadata when enrichment found', () => {
    const record = buildEventEsqlRow({
      actorEntityId: 'user:alice',
      targetEntityId: 'host:server1',
    });
    const enrichmentMap = new Map<string, EntityEnrichmentFields>([
      [
        'user:alice',
        { name: 'Alice', type: 'user', subType: 'admin', engineType: 'ecs', hostIps: [] },
      ],
    ]);

    const [group] = enrichEventDocData(regroupEvents([record], enrichmentMap), enrichmentMap);

    const actorDoc = JSON.parse((group.actorsDocData as string[])[0]);
    expect(actorDoc.entity.availableInEntityStore).toBe(true);
    expect(actorDoc.entity.name).toBe('Alice');
    expect(actorDoc.entity.type).toBe('user');
    expect(actorDoc.entity.sub_type).toBe('admin');
  });
});
