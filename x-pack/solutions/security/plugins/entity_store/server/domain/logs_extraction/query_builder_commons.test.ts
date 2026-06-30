/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ESQLSearchResponse } from '@kbn/es-types';
import { conditionToESQL } from '@kbn/streamlang';
import { recentData } from '../../../common/domain/definitions/esql';
import { getEntityDefinition } from '../../../common/domain/definitions/registry';
import type {
  EntityField,
  SetFieldsByCondition,
} from '../../../common/domain/definitions/entity_schema';
import { USER_ENTITY_NAMESPACE } from '../../../common/domain/definitions/user_entity_constants';
import { getEuidEsqlDocumentsContainsIdFilter } from '../../../common/domain/euid/esql';
import {
  ENGINE_METADATA_PAGINATION_FIRST_SEEN_LOG_FIELD,
  ENGINE_METADATA_TYPE_FIELD,
  ENGINE_METADATA_UNTYPED_ID_FIELD,
  ENTITY_NAME_FIELD,
  ENTITY_TYPE_FIELD,
  MAIN_ENTITY_ID_FIELD,
  TIMESTAMP_FIELD,
  aggregationStats,
  buildExtractionSourceClause,
  buildFieldEvaluations,
  buildPaginationSection,
  buildPostStatsLogicalToColumnMap,
  buildSetFieldsByCondition,
  extractPaginationParams,
  fieldsToKeep,
  hasFieldEvaluations,
  mapPostAggFilterFieldsToRecentForEsql,
  statsFieldDestinations,
  type PaginationFields,
} from './query_builder_commons';

describe('exported field name constants', () => {
  it('should expose stable engine metadata and entity field names', () => {
    expect(ENGINE_METADATA_PAGINATION_FIRST_SEEN_LOG_FIELD).toBe(
      'entity.EngineMetadata.FirstSeenLogInPage'
    );
    expect(ENGINE_METADATA_UNTYPED_ID_FIELD).toBe('entity.EngineMetadata.UntypedId');
    expect(ENGINE_METADATA_TYPE_FIELD).toBe('entity.EngineMetadata.Type');
    expect(MAIN_ENTITY_ID_FIELD).toBe('entity.id');
    expect(ENTITY_NAME_FIELD).toBe('entity.name');
    expect(ENTITY_TYPE_FIELD).toBe('entity.type');
    expect(TIMESTAMP_FIELD).toBe('@timestamp');
  });
});

describe('buildExtractionSourceClause', () => {
  const baseParams = {
    indexPatterns: ['logs-*', 'metrics-*'],
    type: 'host' as const,
    fromDateISO: '2024-01-01T00:00:00.000Z',
    toDateISO: '2024-01-02T00:00:00.000Z',
  };

  it('should always use inclusive >= lower bound on @timestamp regardless of cursor', () => {
    const withCursor = buildExtractionSourceClause({
      ...baseParams,
      logsPageCursorStart: { timestampCursor: '2024-01-01T00:00:00.000Z' },
    });
    expect(withCursor).toContain('FROM logs-*, metrics-*');
    expect(withCursor).not.toContain('METADATA');
    expect(withCursor).toContain(`${TIMESTAMP_FIELD} >= TO_DATETIME("2024-01-01T00:00:00.000Z")`);
    expect(withCursor).toContain(`${TIMESTAMP_FIELD} <= TO_DATETIME("2024-01-02T00:00:00.000Z")`);
    expect(withCursor).toContain(getEuidEsqlDocumentsContainsIdFilter('host'));

    const withoutCursor = buildExtractionSourceClause({ ...baseParams });
    expect(withoutCursor).toContain(
      `${TIMESTAMP_FIELD} >= TO_DATETIME("2024-01-01T00:00:00.000Z")`
    );
  });
});

describe('aggregationStats', () => {
  const keywordField = (overrides: Partial<EntityField> = {}): EntityField => ({
    source: 'host.name',
    destination: 'host.name',
    mapping: { type: 'keyword' },
    retention: { operation: 'prefer_newest_value' },
    ...overrides,
  });

  it('should prefix destinations with recentData when renameToRecent is true', () => {
    expect(aggregationStats([keywordField()], true)).toBe(
      `${recentData(
        'host.name'
      )} = LAST(TO_STRING(host.name), ${TIMESTAMP_FIELD}) WHERE TO_STRING(host.name) IS NOT NULL`
    );
  });

  it('should keep raw destination when renameToRecent is false', () => {
    expect(aggregationStats([keywordField()], false)).toBe(
      `host.name = LAST(TO_STRING(host.name), ${TIMESTAMP_FIELD}) WHERE TO_STRING(host.name) IS NOT NULL`
    );
  });

  it('should emit collect_values aggregation using VALUES for CCS (no merge step)', () => {
    const field: EntityField = {
      source: 'tags',
      destination: 'tags',
      mapping: { type: 'keyword' },
      retention: { operation: 'collect_values' },
    };
    expect(aggregationStats([field], false)).toBe('tags = VALUES(TO_STRING(tags))');
  });

  it('should emit collect_values aggregation using VALUES for main pipeline', () => {
    const field: EntityField = {
      source: 'tags',
      destination: 'tags',
      mapping: { type: 'keyword' },
      retention: { operation: 'collect_values' },
    };
    expect(aggregationStats([field], true)).toBe('recent.tags = VALUES(TO_STRING(tags))');
  });

  it('should use VALUES for normalized entity.source aggregation', () => {
    const field: EntityField = {
      source: 'entity.source',
      destination: 'entity.source',
      mapping: { type: 'keyword' },
      retention: { operation: 'collect_values' },
    };
    expect(aggregationStats([field], false)).toBe(
      'entity.source = VALUES(TO_STRING(entity.source))'
    );
  });

  it('should emit prefer_oldest_value aggregation using FIRST', () => {
    const field: EntityField = {
      source: 'event.created',
      destination: 'event.created',
      mapping: { type: 'date' },
      retention: { operation: 'prefer_oldest_value' },
    };
    expect(aggregationStats([field], false)).toBe(
      `event.created = FIRST(TO_DATETIME(event.created), ${TIMESTAMP_FIELD}) WHERE TO_DATETIME(event.created) IS NOT NULL`
    );
  });

  it('should join multiple field stats with comma and newline', () => {
    const a: EntityField = {
      source: 'a',
      destination: 'a',
      retention: { operation: 'prefer_newest_value' },
    };
    const b: EntityField = {
      source: 'b',
      destination: 'b',
      retention: { operation: 'prefer_oldest_value' },
    };
    // Fields without explicit mapping.type default to TO_STRING
    expect(aggregationStats([a, b], false)).toBe(
      `a = LAST(TO_STRING(a), ${TIMESTAMP_FIELD}) WHERE TO_STRING(a) IS NOT NULL,\n b = FIRST(TO_STRING(b), ${TIMESTAMP_FIELD}) WHERE TO_STRING(b) IS NOT NULL`
    );
  });

  it('should throw when retention operation is not supported', () => {
    const invalidField = {
      source: 'x',
      destination: 'y',
      retention: { operation: 'not_a_real_operation' },
    } as unknown as EntityField;
    expect(() => aggregationStats([invalidField])).toThrow('unknown field operation');
  });

  describe('managed × allowAPIUpdate matrix', () => {
    // The 2×2 matrix: managed retention controls ESQL inclusion; allowAPIUpdate is orthogonal.
    it('log-derived allowAPIUpdate:false — field is included in STATS (normal log field)', () => {
      const field = keywordField({ allowAPIUpdate: false });
      expect(aggregationStats([field], false)).toContain('host.name');
    });

    it('log-derived allowAPIUpdate:true — field is included in STATS (API-updatable + from logs)', () => {
      const field = keywordField({ allowAPIUpdate: true });
      expect(aggregationStats([field], false)).toContain('host.name');
    });

    it('managed allowAPIUpdate:false — field is excluded from STATS (maintainer-written)', () => {
      const field = keywordField({ retention: { operation: 'managed' }, allowAPIUpdate: false });
      expect(aggregationStats([field], false)).toBe('');
    });

    it('managed allowAPIUpdate:true — field is excluded from STATS (pure API-only)', () => {
      const field = keywordField({ retention: { operation: 'managed' }, allowAPIUpdate: true });
      expect(aggregationStats([field], false)).toBe('');
    });

    it('allowAPIUpdate alone does not affect STATS output', () => {
      const withoutAPIUpdate = keywordField({ allowAPIUpdate: false });
      const withAPIUpdate = keywordField({ allowAPIUpdate: true });
      expect(aggregationStats([withoutAPIUpdate], false)).toBe(
        aggregationStats([withAPIUpdate], false)
      );
    });
  });
});

describe('fieldsToKeep', () => {
  it('should collapse dotted paths to wildcard roots and dedupe', () => {
    const definitionFields: EntityField[] = [
      { source: 'a', destination: 'host.name', retention: { operation: 'prefer_newest_value' } },
      { source: 'b', destination: 'host.id', retention: { operation: 'prefer_newest_value' } },
    ];
    const result = fieldsToKeep(definitionFields, [MAIN_ENTITY_ID_FIELD, TIMESTAMP_FIELD]);
    expect(result.split(',\n').sort()).toEqual(
      // `entity.id` collapses to `entity*` (first segment + wildcard), same as `host.name` / `host.id`.
      ['entity*', TIMESTAMP_FIELD, 'host*'].sort()
    );
  });

  it('should keep single-segment field names as-is', () => {
    const definitionFields: EntityField[] = [
      { source: 's', destination: 'name', retention: { operation: 'prefer_newest_value' } },
    ];
    expect(fieldsToKeep(definitionFields, ['id'])).toBe('name,\nid');
  });

  it('should omit managed fields from KEEP patterns', () => {
    const definitionFields: EntityField[] = [
      {
        source: 'a',
        destination: 'included.field',
        retention: { operation: 'prefer_newest_value' },
      },
      {
        source: 'b',
        destination: 'skipped.field',
        retention: { operation: 'managed' },
      },
    ];
    const result = fieldsToKeep(definitionFields, []);
    expect(result).toContain('included*');
    expect(result).not.toContain('skipped*');
  });
});

describe('extractPaginationParams', () => {
  const paginationFields: PaginationFields = {
    timestampField: '@ts',
    idFieldInQuery: 'idInQuery',
    finalIdField: 'finalId',
  };

  const makeResponse = (columns: { name: string }[], values: unknown[][]): ESQLSearchResponse => ({
    columns: columns.map((c) => ({ name: c.name, type: 'keyword' })),
    values,
  });

  it('should return undefined when there are no rows', () => {
    expect(
      extractPaginationParams(makeResponse([{ name: '@ts' }], []), 10, paginationFields)
    ).toBeUndefined();
  });

  it('should return undefined when row count is below docs limit', () => {
    const response = makeResponse(
      [{ name: '@ts' }, { name: 'finalId' }],
      [
        ['2024-01-01', 'a'],
        ['2024-01-02', 'b'],
      ]
    );
    expect(extractPaginationParams(response, 5, paginationFields)).toBeUndefined();
  });

  it('should return cursors from the last row when row count reaches docs limit', () => {
    const response = makeResponse(
      [{ name: '@ts' }, { name: 'finalId' }],
      [
        ['2024-01-01', 'first'],
        ['2024-01-02', 'last'],
      ]
    );
    expect(extractPaginationParams(response, 2, paginationFields)).toEqual({
      timestampCursor: '2024-01-02',
      idCursor: 'last',
    });
  });

  it('should throw when timestamp column is missing from the response', () => {
    const response = makeResponse([{ name: 'finalId' }], [['only-id']]);
    expect(() => extractPaginationParams(response, 1, paginationFields)).toThrow(
      '@ts not found in esql response, internal logic error'
    );
  });

  it('should throw when final id column is missing from the response', () => {
    const response = makeResponse([{ name: '@ts' }], [['2024-01-01']]);
    expect(() => extractPaginationParams(response, 1, paginationFields)).toThrow(
      'finalId not found in esql response, internal logic error'
    );
  });
});

describe('buildFieldEvaluations', () => {
  it('should return an EVAL pipeline fragment for shared field evaluations on single-field identities', () => {
    const fragment = buildFieldEvaluations(getEntityDefinition('host', 'default'));

    expect(fragment.startsWith('| EVAL ')).toBe(true);
    expect(fragment).toContain('entity.source = CASE(');
    expect(fragment).toContain('_src_entity_source0 = MV_FIRST(TO_STRING(event.module))');
    expect(fragment).toContain('_src_entity_source1 = MV_FIRST(TO_STRING(event.dataset))');
    expect(fragment).toContain('_src_entity_source2 = MV_FIRST(TO_STRING(data_stream.dataset))');
    expect(fragment).toContain('NULL');
  });

  it('should return only entity.source for user (entity.namespace moved to getEuidEsqlEvaluation)', () => {
    const fragment = buildFieldEvaluations(getEntityDefinition('user', 'default'));
    expect(fragment.startsWith('| EVAL ')).toBe(true);
    expect(fragment.length).toBeGreaterThan('| EVAL '.length);
    expect(fragment).toContain('entity.source = CASE(');
    // entity.namespace is now part of getEuidEsqlEvaluation, not shared field evals
    expect(fragment).not.toContain('entity.namespace');
  });
});

describe('buildSetFieldsByCondition', () => {
  it('should build CASE-based EVAL for literal and source-backed values', () => {
    const spec: SetFieldsByCondition = {
      condition: { always: {} },
      fields: {
        'entity.namespace': USER_ENTITY_NAMESPACE.Local,
        'entity.name': { source: 'user.name' },
      },
    };
    const fragment = buildSetFieldsByCondition(spec);
    expect(fragment.startsWith('| EVAL ')).toBe(true);
    expect(fragment).toContain('entity.namespace = CASE(');
    expect(fragment).toContain(`"${USER_ENTITY_NAMESPACE.Local}"`);
    expect(fragment).toContain('TO_STRING(user.name)');
    expect(fragment).toContain('entity.name = CASE(');
  });

  it('should build CONCAT for composition field values', () => {
    const spec: SetFieldsByCondition = {
      condition: { field: 'event.kind', exists: true },
      fields: {
        'custom.key': { composition: { fields: ['host.id', 'user.name'], sep: '|' } },
      },
    };
    const fragment = buildSetFieldsByCondition(spec);
    expect(fragment).toContain('CONCAT(');
    expect(fragment).toContain('TO_STRING(host.id)');
    expect(fragment).toContain('TO_STRING(user.name)');
  });
});

const postStatsSampleFields: EntityField[] = [
  {
    source: 'entity.namespace',
    destination: 'entity.namespace',
    retention: { operation: 'prefer_newest_value' },
  },
  {
    source: 'user.name',
    destination: 'user.name',
    retention: { operation: 'prefer_newest_value' },
  },
  {
    source: 'entity.name',
    destination: 'entity.name',
    retention: { operation: 'prefer_newest_value' },
  },
];

describe('buildPostStatsLogicalToColumnMap', () => {
  it('should prefix destinations with recent. when useRecentDataPrefix is true', () => {
    const m = buildPostStatsLogicalToColumnMap(postStatsSampleFields, true);
    expect(m.get('entity.namespace')).toBe(recentData('entity.namespace'));
    expect(m.get('user.name')).toBe(recentData('user.name'));
  });

  it('should use plain destination names when useRecentDataPrefix is false (remote)', () => {
    const m = buildPostStatsLogicalToColumnMap(postStatsSampleFields, false);
    expect(m.get('entity.namespace')).toBe('entity.namespace');
    expect(m.get('user.name')).toBe('user.name');
  });
});

describe('buildSetFieldsByCondition post-STATS context', () => {
  it('should remap condition and targets to recent.* when useRecentDataPrefix is true', () => {
    const fragment = buildSetFieldsByCondition(
      {
        condition: { field: 'entity.namespace', eq: USER_ENTITY_NAMESPACE.Local },
        fields: { 'entity.name': { source: 'user.name' } },
      },
      { entityFields: postStatsSampleFields, useRecentDataPrefix: true }
    );
    expect(fragment).toBe(
      '| EVAL recent.entity.name = CASE((TO_STRING(recent.entity.namespace) == "local"), TO_STRING(recent.user.name), recent.entity.name)'
    );
  });

  it('should use plain column names when useRecentDataPrefix is false (remote)', () => {
    const fragment = buildSetFieldsByCondition(
      {
        condition: { field: 'entity.namespace', eq: USER_ENTITY_NAMESPACE.Local },
        fields: { 'entity.name': { source: 'user.name' } },
      },
      { entityFields: postStatsSampleFields, useRecentDataPrefix: false }
    );
    expect(fragment).toBe(
      '| EVAL entity.name = CASE((TO_STRING(entity.namespace) == "local"), TO_STRING(user.name), entity.name)'
    );
  });

  it('should remap nested and conditions', () => {
    const fragment = buildSetFieldsByCondition(
      {
        condition: {
          and: [
            { field: 'entity.namespace', eq: USER_ENTITY_NAMESPACE.Local },
            { field: 'user.name', exists: true },
          ],
        },
        fields: { 'entity.name': { source: 'user.name' } },
      },
      { entityFields: postStatsSampleFields, useRecentDataPrefix: true }
    );
    expect(fragment).toBe(
      '| EVAL recent.entity.name = CASE((TO_STRING(recent.entity.namespace) == "local" AND TO_STRING(recent.user.name) IS NOT NULL), TO_STRING(recent.user.name), recent.entity.name)'
    );
  });
});

describe('buildPaginationSection', () => {
  const paginationFields: PaginationFields = {
    timestampField: '@timestamp',
    idFieldInQuery: 'recent.id',
    finalIdField: 'final.id',
  };

  it('should emit SORT and LIMIT only when pagination is absent', () => {
    expect(buildPaginationSection('2024-01-01T00:00:00.000Z', 25, paginationFields)).toEqual([
      '| SORT @timestamp ASC, recent.id ASC',
      '| LIMIT 25',
    ]);
  });

  it('should add a WHERE cursor clause when pagination is provided without recovery', () => {
    const parts = buildPaginationSection('2024-01-01T00:00:00.000Z', 25, paginationFields, {
      timestampCursor: '2024-06-01T00:00:00.000Z',
      idCursor: 'cursor-id',
    });
    expect(parts[0]).toBe('| SORT @timestamp ASC, recent.id ASC');
    expect(parts[1]).toContain('| WHERE @timestamp > TO_DATETIME("2024-06-01T00:00:00.000Z")');
    expect(parts[1]).toContain('recent.id > "cursor-id"');
    expect(parts[2]).toBe('| LIMIT 25');
  });

  it('should use recovery id and from date for the pagination WHERE when recoveryId is set', () => {
    const parts = buildPaginationSection(
      '2024-01-10T00:00:00.000Z',
      10,
      paginationFields,
      { timestampCursor: 'ignored-ts', idCursor: 'ignored-id' },
      'recovery-entity-id'
    );
    expect(parts[1]).toContain('| WHERE @timestamp > TO_DATETIME("2024-01-10T00:00:00.000Z")');
    expect(parts[1]).toContain('recent.id > "recovery-entity-id"');
  });

  it('should escape double quotes and backslashes in idCursor to prevent ESQL injection', () => {
    const parts = buildPaginationSection('2024-01-01T00:00:00.000Z', 25, paginationFields, {
      timestampCursor: '2024-06-01T00:00:00.000Z',
      idCursor: 'evil"id\\with"chars',
    });
    expect(parts[1]).toContain('recent.id > "evil\\"id\\\\with\\"chars"');
  });

  it('should escape double quotes and backslashes in recoveryId', () => {
    const parts = buildPaginationSection(
      '2024-01-10T00:00:00.000Z',
      10,
      paginationFields,
      { timestampCursor: 'ignored-ts', idCursor: 'ignored-id' },
      'evil"recovery\\id'
    );
    expect(parts[1]).toContain('recent.id > "evil\\"recovery\\\\id"');
  });
});

describe('statsFieldDestinations', () => {
  it('should collect all field destinations for user definition', () => {
    const { fields } = getEntityDefinition('user', 'default');
    const dest = statsFieldDestinations(fields);
    expect(dest.has('event.kind')).toBe(true);
    expect(dest.has('user.name')).toBe(true);
    expect(dest.has('entity.name')).toBe(true);
  });

  it('should exclude managed fields from the destination set', () => {
    const fields: EntityField[] = [
      {
        source: 'a',
        destination: 'included.field',
        retention: { operation: 'prefer_newest_value' },
      },
      {
        source: 'b',
        destination: 'skipped.field',
        retention: { operation: 'managed' },
      },
    ];
    const dest = statsFieldDestinations(fields);
    expect(dest.has('included.field')).toBe(true);
    expect(dest.has('skipped.field')).toBe(false);
  });
});

describe('mapPostAggFilterFieldsToRecentForEsql', () => {
  it('should prefix STATS destinations with recent. and leave entity.id plain', () => {
    const userDef = getEntityDefinition('user', 'default');
    expect(userDef.postAggFilter).toBeDefined();
    const mapped = mapPostAggFilterFieldsToRecentForEsql(userDef.postAggFilter!, userDef);
    const esql = conditionToESQL(mapped);
    expect(esql).toContain(recentData('event.kind'));
    expect(esql).toContain('entity.id');
    expect(esql).not.toContain(recentData('entity.id'));
  });

  it('should be idempotent when fields are already recent.*', () => {
    const userDef = getEntityDefinition('user', 'default');
    const once = mapPostAggFilterFieldsToRecentForEsql(userDef.postAggFilter!, userDef);
    const twice = mapPostAggFilterFieldsToRecentForEsql(once, userDef);
    expect(twice).toEqual(once);
  });
});

describe('hasFieldEvaluations', () => {
  it('should return true when shared field evaluations exist on a single-field identity definition', () => {
    expect(hasFieldEvaluations(getEntityDefinition('host', 'default'))).toBe(true);
  });

  it('should return true when calculated identity defines field evaluations', () => {
    expect(hasFieldEvaluations(getEntityDefinition('user', 'default'))).toBe(true);
  });
});
