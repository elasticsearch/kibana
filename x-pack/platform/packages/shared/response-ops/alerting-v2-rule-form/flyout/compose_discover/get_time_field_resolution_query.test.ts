/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getTimeFieldResolutionQuery } from './get_time_field_resolution_query';
import type { RuleQuery } from '../../form/types';

const composedQuery: RuleQuery = {
  format: 'composed',
  base: 'FROM kibana_sample_data_flights | STATS COUNT(*) BY timestamp',
  breach: { segment: '| WHERE Cancelled == "true"' },
};

const standaloneQuery: RuleQuery = {
  format: 'standalone',
  breach: { query: 'FROM logs-* | LIMIT 10' },
};

describe('getTimeFieldResolutionQuery', () => {
  it('returns the base query in alert mode when committed', () => {
    expect(getTimeFieldResolutionQuery(composedQuery, true, true)).toBe(composedQuery.base);
  });

  it('returns the breach query in signal mode when committed', () => {
    expect(getTimeFieldResolutionQuery(standaloneQuery, false, true)).toBe(
      standaloneQuery.breach.query
    );
  });

  it('returns empty when the query is not committed', () => {
    expect(getTimeFieldResolutionQuery(composedQuery, true, false)).toBe('');
  });

  it('returns empty when the candidate query has no FROM clause', () => {
    expect(
      getTimeFieldResolutionQuery(
        { format: 'composed', base: '', breach: { segment: '| WHERE count > 1' } },
        true,
        true
      )
    ).toBe('');
  });
});
