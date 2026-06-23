/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildRemoteLogsExtractionEsqlQuery } from './remote_logs_extraction_query_builder';
import { getEntityDefinition } from '../../../../common/domain/definitions/registry';
import { validateQuery } from '@kbn/esql-language';

describe('buildRemoteLogsExtractionEsqlQuery', () => {
  it('generates query for generic entity type', async () => {
    const query = buildRemoteLogsExtractionEsqlQuery({
      indexPatterns: ['remote_cluster:logs-*'],
      entityDefinition: getEntityDefinition('generic', 'default'),
      fromDateISO: '2022-01-01T00:00:00.000Z',
      toDateISO: '2022-01-01T23:59:59.999Z',
      docsLimit: 10000,
    });
    expect(query).toMatchSnapshot();
    await expect(validateQuery(query)).resolves.toHaveProperty('errors', []);
  });

  it('generates expected query for host entity type', async () => {
    const query = buildRemoteLogsExtractionEsqlQuery({
      indexPatterns: ['remote:metrics-*'],
      entityDefinition: getEntityDefinition('host', 'default'),
      fromDateISO: '2022-01-01T00:00:00.000Z',
      toDateISO: '2022-01-01T23:59:59.999Z',
      docsLimit: 5000,
    });
    expect(query).toMatchSnapshot();
    await expect(validateQuery(query)).resolves.toHaveProperty('errors', []);
  });

  it('generates expected query with pagination', async () => {
    const query = buildRemoteLogsExtractionEsqlQuery({
      indexPatterns: ['remote:logs-*'],
      entityDefinition: getEntityDefinition('user', 'default'),
      fromDateISO: '2022-01-01T00:00:00.000Z',
      toDateISO: '2022-01-01T23:59:59.999Z',
      docsLimit: 10000,
      pagination: {
        timestampCursor: '2022-01-01T12:00:00.000Z',
        idCursor: 'cursor-id',
      },
    });
    expect(query).toContain('FirstSeenLogInPage > TO_DATETIME("2022-01-01T12:00:00.000Z")');
    expect(query).toMatchSnapshot();
    await expect(validateQuery(query)).resolves.toHaveProperty('errors', []);
  });

  it('generates expected query with log-slice cursor bounds', async () => {
    const query = buildRemoteLogsExtractionEsqlQuery({
      indexPatterns: ['remote:logs-*'],
      entityDefinition: getEntityDefinition('host', 'default'),
      fromDateISO: '2022-01-01T00:00:00.000Z',
      toDateISO: '2022-01-01T23:59:59.999Z',
      docsLimit: 10000,
      logsPageCursorStart: {
        timestampCursor: '2022-01-01T06:00:00.000Z',
      },
      logsPageCursorEnd: {
        timestampCursor: '2022-01-01T12:00:00.000Z',
      },
    });
    // Start filter: inclusive lower bound on @timestamp
    expect(query).toContain('2022-01-01T06:00:00.000Z');
    // End filter: inclusive upper bound on @timestamp
    expect(query).toContain('2022-01-01T12:00:00.000Z');
    expect(query).toMatchSnapshot();
    await expect(validateQuery(query)).resolves.toHaveProperty('errors', []);
  });

  it('inserts whenConditionTrueSetFieldsAfterStats EVAL after STATS and before KEEP without recent. prefix', () => {
    const base = getEntityDefinition('host', 'default');
    const query = buildRemoteLogsExtractionEsqlQuery({
      indexPatterns: ['remote:metrics-*'],
      entityDefinition: {
        ...base,
        whenConditionTrueSetFieldsAfterStats: [
          {
            condition: { field: 'host.name', eq: 'server1' },
            fields: { 'host.name': { source: 'host.id' } },
          },
        ],
      },
      fromDateISO: '2022-01-01T00:00:00.000Z',
      toDateISO: '2022-01-01T23:59:59.999Z',
      docsLimit: 100,
    });
    const statsIdx = query.indexOf('| STATS');
    const afterStatsEvalIdx = query.indexOf('host.name = CASE(');
    const keepIdx = query.indexOf('| KEEP');
    expect(statsIdx).toBeGreaterThan(-1);
    expect(afterStatsEvalIdx).toBeGreaterThan(statsIdx);
    expect(keepIdx).toBeGreaterThan(afterStatsEvalIdx);
    expect(query).not.toContain('recent.host.name');
  });
});
