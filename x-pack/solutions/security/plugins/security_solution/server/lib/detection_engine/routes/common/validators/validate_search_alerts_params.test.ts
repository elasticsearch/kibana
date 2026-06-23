/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { QueryAlertsBodyParams } from '../../../../../../common/api/detection_engine/signals';
import { validateSearchAlertsParams } from './validate_search_alerts_params';

describe('validateSearchAlertsParams', () => {
  it('returns an error message when no searchable param is provided', () => {
    expect(validateSearchAlertsParams({})).toEqual('"value" must have at least 1 children');
  });

  it.each<[string, QueryAlertsBodyParams]>([
    ['query', { query: { match_all: {} } }],
    ['aggs', { aggs: { myAgg: { terms: { field: 'host.name' } } } }],
    ['_source', { _source: ['host.name'] }],
    ['fields', { fields: ['host.name'] }],
    ['track_total_hits', { track_total_hits: true }],
    ['size', { size: 10 }],
    ['sort', { sort: ['@timestamp'] }],
  ])('returns undefined when %s is provided', (_, params) => {
    expect(validateSearchAlertsParams(params)).toBeUndefined();
  });
});
