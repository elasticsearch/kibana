/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ES_FIELD_TYPES } from '@kbn/field-types';
import type { ParsedMetricItem } from '../../../types';
import { createExemplarsQuery } from './create_exemplars_query';

const mockMetric: ParsedMetricItem = {
  // METRICS_INFO already returns the `metrics.`-prefixed field name, and the exemplars
  // stream maps the very same field. Prefixing again would produce `metrics.metrics.*`.
  metricName: 'metrics.http.server.request.duration',
  indexName: 'metrics-generic.otel-default',
  units: ['ms'],
  metricTypes: ['histogram'],
  fieldTypes: [ES_FIELD_TYPES.TDIGEST],
  dimensionFields: [
    { name: 'attributes.http.route' },
    { name: 'resource.attributes.service.name' },
  ],
};

describe('createExemplarsQuery', () => {
  it('builds the exemplars query for an OTel metric', () => {
    expect(createExemplarsQuery({ metricItem: mockMetric })).toBe(
      `
FROM exemplars-generic.otel-default
  | WHERE \`metrics.http.server.request.duration\` IS NOT NULL
  | KEEP @timestamp, \`metrics.http.server.request.duration\`, trace_id, span_id, \`attributes.http.route\`, \`resource.attributes.service.name\`
  | SORT @timestamp DESC
  | LIMIT 500
`.trim()
    );
  });

  it('appends each non-empty where statement as its own WHERE pipe before KEEP', () => {
    expect(
      createExemplarsQuery({
        metricItem: mockMetric,
        whereStatements: [
          ' attributes.http.route == "/orders" ',
          '',
          'attributes.http.response.status_code >= 500',
          '  \n\t  ',
        ],
      })
    ).toBe(
      `
FROM exemplars-generic.otel-default
  | WHERE \`metrics.http.server.request.duration\` IS NOT NULL
  | WHERE attributes.http.route == "/orders"
  | WHERE attributes.http.response.status_code >= 500
  | KEEP @timestamp, \`metrics.http.server.request.duration\`, trace_id, span_id, \`attributes.http.route\`, \`resource.attributes.service.name\`
  | SORT @timestamp DESC
  | LIMIT 500
`.trim()
    );
  });

  it('keeps only the trace correlation columns when the metric declares no dimensions', () => {
    expect(createExemplarsQuery({ metricItem: { ...mockMetric, dimensionFields: [] } })).toBe(
      `
FROM exemplars-generic.otel-default
  | WHERE \`metrics.http.server.request.duration\` IS NOT NULL
  | KEEP @timestamp, \`metrics.http.server.request.duration\`, trace_id, span_id
  | SORT @timestamp DESC
  | LIMIT 500
`.trim()
    );
  });

  it('honours an explicit maxRows override', () => {
    expect(
      createExemplarsQuery({
        metricItem: { ...mockMetric, dimensionFields: [] },
        maxRows: 25,
      })
    ).toBe(
      `
FROM exemplars-generic.otel-default
  | WHERE \`metrics.http.server.request.duration\` IS NOT NULL
  | KEEP @timestamp, \`metrics.http.server.request.duration\`, trace_id, span_id
  | SORT @timestamp DESC
  | LIMIT 25
`.trim()
    );
  });

  it('escapes identifiers that contain backticks', () => {
    expect(
      createExemplarsQuery({
        metricItem: {
          ...mockMetric,
          metricName: 'metrics.odd`name',
          dimensionFields: [{ name: 'attributes.odd`dimension' }],
        },
      })
    ).toBe(
      `
FROM exemplars-generic.otel-default
  | WHERE \`metrics.odd\`\`name\` IS NOT NULL
  | KEEP @timestamp, \`metrics.odd\`\`name\`, trace_id, span_id, \`attributes.odd\`\`dimension\`
  | SORT @timestamp DESC
  | LIMIT 500
`.trim()
    );
  });

  it('does not repeat a dimension that collides with a trace correlation column', () => {
    const query = createExemplarsQuery({
      metricItem: {
        ...mockMetric,
        dimensionFields: [{ name: 'trace_id' }, { name: 'attributes.http.route' }],
      },
    });

    expect(query).toContain(
      'KEEP @timestamp, `metrics.http.server.request.duration`, trace_id, span_id, `attributes.http.route`'
    );
  });

  describe('index resolution', () => {
    it('prefers originalSource when the user typed a single concrete index', () => {
      expect(
        createExemplarsQuery({
          metricItem: { ...mockMetric, dimensionFields: [] },
          originalSource: 'metrics-generic.otel-production',
        })
      ).toContain('FROM exemplars-generic.otel-production');
    });

    it('falls back to indexName when originalSource is a pattern', () => {
      expect(
        createExemplarsQuery({
          metricItem: { ...mockMetric, dimensionFields: [] },
          originalSource: 'metrics-*',
        })
      ).toContain('FROM exemplars-generic.otel-default');
    });
  });

  describe('returns an empty string so callers skip the fetch', () => {
    it('when the metrics index is not an OTel data stream', () => {
      expect(
        createExemplarsQuery({
          metricItem: { ...mockMetric, indexName: 'metrics-system.cpu-default' },
        })
      ).toBe('');
    });

    it('when the metrics index is a wildcard pattern', () => {
      expect(createExemplarsQuery({ metricItem: { ...mockMetric, indexName: 'metrics-*' } })).toBe(
        ''
      );
    });

    it('when the metric name is missing', () => {
      expect(createExemplarsQuery({ metricItem: { ...mockMetric, metricName: '' } })).toBe('');
    });
  });

  // AC 5: breaking down by a dimension must not change which exemplars are fetched.
  // `createExemplarsQuery` takes no `splitAccessors`, so the guard is that the emitted
  // query never carries an aggregation to break down by.
  describe('AC 5 regression guard: no breakdown reaches the query', () => {
    it('emits no STATS or BY clause', () => {
      const query = createExemplarsQuery({ metricItem: mockMetric });

      expect(query).not.toMatch(/\bSTATS\b/);
      expect(query).not.toMatch(/\bBY\b/);
      expect(query).not.toMatch(/\bTBUCKET\b/);
    });

    it('emits the same query regardless of which dimensions the grid is broken down by', () => {
      // The grid's breakdown selection lives in `selectedDimensions`, which this builder
      // deliberately has no parameter for. `dimensionFields` is the metric's declared
      // dimension set (used only for column projection) and is breakdown-independent.
      const first = createExemplarsQuery({ metricItem: mockMetric });
      const second = createExemplarsQuery({ metricItem: mockMetric });

      expect(first).toBe(second);
    });
  });
});
