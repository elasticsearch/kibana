/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { setStubKibanaServices } from '../../../services/mocks';
import { dataService } from '../../../services/kibana_services';
import { buildESQLPreFilter } from './filter_utils';

describe('buildESQLPreFilter', () => {
  beforeAll(() => {
    setStubKibanaServices();
  });

  const phraseFilter = (field: string, value: string) => ({
    meta: { type: 'phrase', key: field, params: { query: value } },
    query: { match_phrase: { [field]: value } },
  });

  it('returns undefined when there is no global query and no filters', () => {
    const result = buildESQLPreFilter({
      fetchContext: { query: undefined, filters: undefined },
      useGlobalFilters: true,
    });
    expect(result).toBeUndefined();
  });

  it('returns undefined when filters are gated off and there is no global query', () => {
    const result = buildESQLPreFilter({
      fetchContext: { query: undefined, filters: [phraseFilter('host', 'mainframe')] },
      useGlobalFilters: false,
    });
    expect(result).toBeUndefined();
  });

  it('drops ES|QL global queries because they cannot be translated to DSL', () => {
    const result = buildESQLPreFilter({
      fetchContext: { query: { esql: 'FROM logs' }, filters: undefined },
      useGlobalFilters: true,
    });
    expect(result).toBeUndefined();
  });

  it('builds a bool filter from a global KQL query', () => {
    const result = buildESQLPreFilter({
      fetchContext: {
        query: { language: 'kuery', query: 'level: "error"' },
        filters: undefined,
      },
      useGlobalFilters: true,
    });
    expect(result?.bool).toBeDefined();
    expect(JSON.stringify(result)).toContain('error');
  });

  it('includes ad-hoc filters when useGlobalFilters is true', () => {
    const result = buildESQLPreFilter({
      fetchContext: { query: undefined, filters: [phraseFilter('host', 'mainframe')] },
      useGlobalFilters: true,
    });
    expect(result?.bool).toBeDefined();
    expect(JSON.stringify(result)).toContain('mainframe');
  });

  it('omits ad-hoc filters when useGlobalFilters is false even if a global query is present', () => {
    const result = buildESQLPreFilter({
      fetchContext: {
        query: { language: 'kuery', query: 'level: "error"' },
        filters: [phraseFilter('host', 'mainframe')],
      },
      useGlobalFilters: false,
    });
    expect(JSON.stringify(result)).not.toContain('mainframe');
    expect(JSON.stringify(result)).toContain('error');
  });

  it('includes the dashboard time range as a DSL pre-filter when the query does not use time params', () => {
    jest.spyOn(dataService.query.timefilter.timefilter, 'createFilter').mockReturnValue({
      meta: { type: 'range', key: '@timestamp' },
      query: { range: { '@timestamp': { gte: 'now-15m', lte: 'now' } } },
    } as any);

    const dataView = {
      timeFieldName: '@timestamp',
      fields: [{ name: '@timestamp', type: 'date' }],
    } as any;

    const result = buildESQLPreFilter({
      fetchContext: { query: undefined, filters: undefined },
      useGlobalFilters: true,
      dataView,
      timeRange: { from: 'now-15m', to: 'now' },
      esqlQuery: 'FROM logs | KEEP host',
    });

    expect(result?.bool).toBeDefined();
    expect(JSON.stringify(result)).toContain('@timestamp');
  });

  it('does not add a DSL time pre-filter when the query already uses ?_tstart/?_tend', () => {
    const dataView = {
      timeFieldName: '@timestamp',
      fields: [{ name: '@timestamp', type: 'date' }],
    } as any;

    const result = buildESQLPreFilter({
      fetchContext: { query: undefined, filters: undefined },
      useGlobalFilters: true,
      dataView,
      timeRange: { from: 'now-15m', to: 'now' },
      esqlQuery: 'FROM logs | WHERE @timestamp >= ?_tstart AND @timestamp <= ?_tend | KEEP host',
    });

    expect(result).toBeUndefined();
  });
});
