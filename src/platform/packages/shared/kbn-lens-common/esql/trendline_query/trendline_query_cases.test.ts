/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { buildTrendlineQueryCases } from '@kbn/lens-test-helpers';
import { buildTrendlineQueryWithMetricFieldMap } from './trendline_query';

// Same index the Scout API layer binds, so unit and API layers pin the
// exact same queries.
const INDEX = 'kibana_sample_data_logstsdb';

describe('trendline query case matrix (rewrite assertions)', () => {
  for (const queryCase of buildTrendlineQueryCases({ index: INDEX })) {
    it(`rewrites: ${queryCase.description}`, () => {
      const generated = buildTrendlineQueryWithMetricFieldMap(
        queryCase.sourceQuery,
        '@timestamp',
        queryCase.metricFields ? [...queryCase.metricFields] : undefined,
        queryCase.groupByFields ? [...queryCase.groupByFields] : undefined
      );

      expect(generated.query).toBe(queryCase.expectedQuery);
      expect(generated.timeField).toBe(queryCase.expectedTimeField);

      if (queryCase.expectedMetricFieldMap) {
        expect(Object.fromEntries(generated.metricFieldMap)).toEqual(
          queryCase.expectedMetricFieldMap
        );
      }
    });
  }
});
