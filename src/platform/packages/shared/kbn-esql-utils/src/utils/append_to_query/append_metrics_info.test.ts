/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { buildMetricsInfoQuery } from './append_metrics_info';

describe('buildMetricsInfoQuery', () => {
  it('returns empty string for empty or undefined esql', () => {
    expect(buildMetricsInfoQuery('')).toBe('');
    expect(buildMetricsInfoQuery(undefined)).toBe('');
    expect(buildMetricsInfoQuery('   ')).toBe('');
  });

  it('appends | METRICS_INFO when no dimension filter', () => {
    expect(buildMetricsInfoQuery('FROM metrics-*')).toBe(`FROM metrics-*\n | METRICS_INFO`);
    expect(buildMetricsInfoQuery('TS INDEX')).toBe(`TS INDEX\n | METRICS_INFO`);
  });

  it('returns query as-is when METRICS_INFO is already in the pipeline', () => {
    const simpleQuery = 'TS INDEX | METRICS_INFO';
    expect(buildMetricsInfoQuery(simpleQuery)).toBe(simpleQuery);
    const withLimit = 'TS INDEX | METRICS_INFO | LIMIT 100';
    expect(buildMetricsInfoQuery(withLimit)).toBe(withLimit);
  });

  it('does not inject dimension filters when METRICS_INFO is already user-authored', () => {
    const userQuery = 'TS INDEX | METRICS_INFO';
    expect(buildMetricsInfoQuery(userQuery, ['environment', 'station.name'])).toBe(userQuery);
  });

  it('does not add dimension filter when dimensionFieldNames is empty', () => {
    expect(buildMetricsInfoQuery('TS INDEX', [])).toBe(`TS INDEX\n | METRICS_INFO`);
  });

  it('add WHERE dimension filter when multiple dimension names', () => {
    expect(buildMetricsInfoQuery('TS INDEX', ['environment', 'station.name'])).toBe(
      `TS INDEX\n| WHERE TO_STRING(\`environment\`) IS NOT NULL AND TO_STRING(\`station.name\`) IS NOT NULL | METRICS_INFO | WHERE MV_CONTAINS(dimension_fields, "environment") AND MV_CONTAINS(dimension_fields, "station.name")`
    );
  });

  it('adds a single MV_CONTAINS membership filter for one dimension', () => {
    expect(buildMetricsInfoQuery('TS INDEX', ['environment'])).toBe(
      `TS INDEX\n| WHERE TO_STRING(\`environment\`) IS NOT NULL | METRICS_INFO | WHERE MV_CONTAINS(dimension_fields, "environment")`
    );
  });

  it('escapes quotes and backslashes in the MV_CONTAINS string literal', () => {
    expect(buildMetricsInfoQuery('TS INDEX', ['weird"name', 'back\\slash'])).toBe(
      `TS INDEX\n| WHERE TO_STRING(\`weird"name\`) IS NOT NULL AND TO_STRING(\`back\\slash\`) IS NOT NULL | METRICS_INFO | WHERE MV_CONTAINS(dimension_fields, "weird\\"name") AND MV_CONTAINS(dimension_fields, "back\\\\slash")`
    );
  });

  it('combines with existing WHERE via AND when multiple dimensions', () => {
    expect(
      buildMetricsInfoQuery('TS INDEX | WHERE region == eu', ['environment', 'station.name'])
    ).toBe(
      'TS INDEX | WHERE region == eu\n| WHERE TO_STRING(`environment`) IS NOT NULL AND TO_STRING(`station.name`) IS NOT NULL | METRICS_INFO | WHERE MV_CONTAINS(dimension_fields, "environment") AND MV_CONTAINS(dimension_fields, "station.name")'
    );
  });

  it('returns empty string for query with transformational command', () => {
    expect(buildMetricsInfoQuery('FROM x | STATS count()')).toBe('');
    expect(buildMetricsInfoQuery('FROM x | STATS count()', ['a', 'b'])).toBe('');
  });

  it('inserts METRICS_INFO before LIMIT when query has LIMIT', () => {
    expect(buildMetricsInfoQuery('FROM metrics-* | LIMIT 100')).toBe(
      `FROM metrics-*\n | METRICS_INFO | LIMIT 100`
    );
    expect(buildMetricsInfoQuery('TS INDEX | LIMIT 10')).toBe(
      `TS INDEX\n | METRICS_INFO | LIMIT 10`
    );
  });

  it('removes SORT from the query', () => {
    expect(buildMetricsInfoQuery('FROM metrics-* | LIMIT 100 | SORT timestamp DESC')).toBe(
      `FROM metrics-*\n | METRICS_INFO | LIMIT 100`
    );

    expect(buildMetricsInfoQuery('FROM metrics-* | SORT timestamp DESC | LIMIT 100 ')).toBe(
      `FROM metrics-*\n | METRICS_INFO | LIMIT 100`
    );

    expect(
      buildMetricsInfoQuery(
        'FROM metrics-* | SORT timestamp DESC | LIMIT 100 | WHERE timestamp > now-1h',
        ['environment', 'station.name']
      )
    ).toBe(
      `FROM metrics-* | WHERE timestamp > now - 1h\n| WHERE TO_STRING(\`environment\`) IS NOT NULL AND TO_STRING(\`station.name\`) IS NOT NULL | METRICS_INFO | WHERE MV_CONTAINS(dimension_fields, "environment") AND MV_CONTAINS(dimension_fields, "station.name") | LIMIT 100`
    );
  });
});
