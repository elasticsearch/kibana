/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { extractFromSourceQuery } from './extract_from_source_query';

describe('extractFromSourceQuery', () => {
  it('returns empty string for empty input', () => {
    expect(extractFromSourceQuery('')).toBe('');
    expect(extractFromSourceQuery('   ')).toBe('');
  });

  it('extracts FROM from a simple query', () => {
    expect(extractFromSourceQuery('FROM logs-* | LIMIT 10')).toBe('FROM logs-*');
  });

  it('extracts FROM from a STATS pipeline', () => {
    expect(
      extractFromSourceQuery(
        'FROM kibana_sample_data_flights | STATS COUNT(*) BY DestCityName, timestamp | WHERE Cancelled == "true"'
      )
    ).toBe('FROM kibana_sample_data_flights');
  });

  it('extracts FROM with dotted index name', () => {
    expect(extractFromSourceQuery('FROM metrics-* | WHERE host.name == "a"')).toBe(
      'FROM metrics-*'
    );
  });

  it('returns empty string when query has no FROM', () => {
    expect(extractFromSourceQuery('SHOW INFO')).toBe('');
  });

  it('extracts FROM with multiple indices', () => {
    expect(extractFromSourceQuery('FROM logs-*, metrics-* | LIMIT 10')).toBe(
      'FROM logs-*, metrics-*'
    );
  });
});
