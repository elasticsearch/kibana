/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildInspectData, getEntitiesQuery } from './use_fetch_grid_data';

describe('buildInspectData', () => {
  const queryParams = {
    index: ['entities-latest-default'],
    size: 500,
    query: { bool: { filter: [] } },
  };

  const rawResponse = {
    took: 22,
    timed_out: false,
    _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
    hits: {
      total: { value: 3, relation: 'eq' },
      hits: [
        { _index: 'entities-latest-default', _id: '1', _source: { entity: { name: 'host-1' } } },
      ],
    },
  };

  it('should format the response as pretty-printed JSON with indentation', () => {
    const inspect = buildInspectData(queryParams, rawResponse);

    expect(inspect.response[0]).toBe(JSON.stringify(rawResponse, null, 2));
    expect(inspect.response[0]).toContain('\n');
    expect(inspect.response[0]).toContain('  ');
  });

  it('should NOT format the response as compact single-line JSON', () => {
    const inspect = buildInspectData(queryParams, rawResponse);

    expect(inspect.response[0]).not.toBe(JSON.stringify(rawResponse));
  });

  it('should include the DSL query params as a JSON string', () => {
    const inspect = buildInspectData(queryParams, rawResponse);

    expect(inspect.dsl[0]).toBe(JSON.stringify(queryParams));
  });
});

describe('getEntitiesQuery', () => {
  const options = {
    query: undefined,
    sort: [['entity.name', 'asc']] as Array<[string, string]>,
    enabled: true,
    pageSize: 25,
  };

  it('throws when no index pattern is provided', () => {
    expect(() => getEntitiesQuery(options, undefined, undefined)).toThrow(
      'Index pattern is required'
    );
  });

  it('pins the query to the origin entity store via project_routing', () => {
    const params = getEntitiesQuery(options, undefined, 'entities-latest-default');

    expect(params).toHaveProperty('project_routing', '_alias:_origin');
  });

  it('targets the provided index pattern', () => {
    const params = getEntitiesQuery(options, undefined, 'entities-latest-default');

    expect(params.index).toEqual(['entities-latest-default']);
  });
});
