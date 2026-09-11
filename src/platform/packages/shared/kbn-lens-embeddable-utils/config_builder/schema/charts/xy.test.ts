/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { z } from '@kbn/zod';
import { expectPrettyError } from '@kbn/zod-helpers/v4';
import type { DataSourceTypeESQL } from '../data_source';
import type { xyDataLayerSharedShape, XYConfig, XYConfigNoESQL } from './xy';
import { statisticsOptionsSize, statisticsSchema, xyConfigSchema } from './xy';
import {
  AS_CODE_DATA_VIEW_REFERENCE_TYPE,
  AS_CODE_DATA_VIEW_SPEC_TYPE,
} from '@kbn/as-code-data-views-schema';

describe('XY', () => {
  const minimalLayer = {
    data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'myDataView' },
    type: 'bar',
    y: [{ operation: 'count' }],
  };
  const universalTypes = [
    'bar',
    'line',
    'area',
    'bar_stacked',
    'area_stacked',
    'bar_horizontal',
    'bar_horizontal_stacked',
  ] satisfies z.output<typeof xyDataLayerSharedShape.type>[];

  const typesWithBreakdown = [
    'bar_percentage',
    'area_percentage',
    'bar_horizontal_percentage',
  ] satisfies z.output<typeof xyDataLayerSharedShape.type>[];
  const anyType = [...universalTypes, ...typesWithBreakdown];
  describe('minimal xy charts', () => {
    it.each([
      'bar',
      'line',
      'area',
      'bar_stacked',
      'area_stacked',
      'bar_horizontal',
      'bar_horizontal_stacked',
    ] satisfies z.output<typeof xyDataLayerSharedShape.type>[])(
      'should pass validation for simple %s',
      (type) => {
        const input = {
          type: 'xy',
          title: `${type} Chart`,
          layers: [
            {
              data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'myDataView' },
              type,
              ignore_global_filters: false,
              sampling: 1,
              y: [{ operation: 'count', empty_as_null: false }],
            },
          ],
        } satisfies XYConfig;
        expect(() => xyConfigSchema.parse(input)).not.toThrow();
      }
    );

    it.each(anyType)('should pass validation for %s with breakdown', (type) => {
      expect(() =>
        xyConfigSchema.parse({
          type: 'xy',
          title: `${type} Chart`,
          layers: [
            {
              data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'myDataView' },
              type,
              ignore_global_filters: false,
              sampling: 1,
              y: [{ operation: 'count', empty_as_null: false }],
              breakdown_by: { operation: 'terms', fields: ['product'], limit: 5 },
            },
          ],
        } satisfies XYConfig)
      ).not.toThrow();
    });

    it.each(anyType)(
      'should pass validation for a date histogram %s with breakdown with multiple terms',
      (type) => {
        expect(() =>
          xyConfigSchema.parse({
            type: 'xy',
            title: `${type} Chart`,
            layers: [
              {
                data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'myDataView' },
                type,
                ignore_global_filters: false,
                sampling: 1,
                x: {
                  operation: 'date_histogram',
                  field: 'order_date',
                  suggested_interval: 'auto',
                  use_original_time_range: true,
                  include_empty_rows: false,
                },
                y: [{ operation: 'count', empty_as_null: false }],
                breakdown_by: { operation: 'terms', fields: ['product', 'category'], limit: 5 },
              },
            ],
          } satisfies XYConfig)
        ).not.toThrow();
      }
    );

    it.each(anyType)('should pass validation in ES|QL mode as %s chart', (type) => {
      expect(() =>
        xyConfigSchema.parse({
          type: 'xy',
          title: `${type} Chart`,
          layers: [
            {
              data_source: {
                type: 'esql',
                query:
                  'FROM kibana_simple_logs_data | STATS count = count() BY buckets = BUCKET(3 hours, order_date), product',
              },
              type,
              ignore_global_filters: false,
              sampling: 1,
              x: { column: 'order_date' },
              y: [{ column: 'count' }],
              breakdown_by: { column: 'product' },
            },
          ],
        } satisfies XYConfig)
      ).not.toThrow();
    });

    it.each(anyType)('should support reference lines in %s charts', (type) => {
      expect(() =>
        xyConfigSchema.parse({
          type: 'xy',
          title: `${type} Chart`,
          layers: [
            {
              data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'myDataView' },
              type,
              ignore_global_filters: false,
              sampling: 1,
              x: {
                operation: 'date_histogram',
                field: 'order_date',
                suggested_interval: 'auto',
                use_original_time_range: true,
                include_empty_rows: false,
              },
              y: [{ operation: 'count', empty_as_null: false }],
              breakdown_by: {
                operation: 'terms',
                fields: ['product', 'category'],
                limit: 5,
              },
            },
            {
              data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'myDataView' },
              type: 'reference_lines',
              ignore_global_filters: false,
              sampling: 1,
              thresholds: [
                {
                  operation: 'median',
                  field: 'price',
                  label: 'Median line',
                  color: { type: 'static', color: 'red' },
                  text: { visible: true },
                },
              ],
            },
          ],
        } satisfies XYConfig)
      ).not.toThrow();
    });

    it.each(anyType)('should support annotations in %s charts', (type) => {
      expect(() =>
        xyConfigSchema.parse({
          type: 'xy',
          title: `${type} Chart`,
          layers: [
            {
              data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'myDataView' },
              type,
              ignore_global_filters: false,
              sampling: 1,
              x: {
                operation: 'date_histogram',
                field: 'order_date',
                suggested_interval: 'auto',
                use_original_time_range: true,
                include_empty_rows: false,
              },
              y: [{ operation: 'count', empty_as_null: false }],
              breakdown_by: { operation: 'terms', fields: ['product', 'category'], limit: 5 },
            },
            {
              type: 'annotations',
              ignore_global_filters: false,
              data_source: {
                type: AS_CODE_DATA_VIEW_REFERENCE_TYPE,
                ref_id: 'metrics-*',
              },
              events: [
                {
                  type: 'point',
                  label: 'New Year',
                  timestamp: '2023-01-01T00:00:00Z',
                  text: { visible: true },
                  color: {
                    type: 'static',
                    color: '#ff0000',
                  },
                },
              ],
            },
          ],
        } satisfies XYConfig)
      ).not.toThrow();
    });
  });

  describe('full feature xy chart with multiple layers', () => {
    const combinationOfChartTypes = anyType
      .map((type) => anyType.map((anotherType) => [type, anotherType]))
      .flat(1);
    it.each(combinationOfChartTypes)(
      'should handle multiple metric in multiple layers with %s + %s',
      (type1, type2) => {
        expect(() =>
          xyConfigSchema.parse({
            type: 'xy',
            title: `Mixed Chart`,
            layers: [
              {
                data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'companyAIndex' },
                type: type1,
                ignore_global_filters: false,
                sampling: 1,
                x: {
                  operation: 'date_histogram',
                  field: 'order_date',
                  suggested_interval: 'auto',
                  use_original_time_range: true,
                  include_empty_rows: false,
                },
                y: [
                  { operation: 'count', empty_as_null: false },
                  { operation: 'average', field: 'price' },
                ],
                breakdown_by: { operation: 'terms', fields: ['product', 'category'], limit: 5 },
              },
              {
                data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'companyBIndex' },
                type: type2,
                ignore_global_filters: false,
                sampling: 1,
                x: {
                  operation: 'date_histogram',
                  field: 'order_date',
                  suggested_interval: 'auto',
                  use_original_time_range: true,
                  include_empty_rows: false,
                },
                y: [
                  { operation: 'count', empty_as_null: false },
                  { operation: 'average', field: 'price' },
                ],
                breakdown_by: { operation: 'terms', fields: ['product', 'category'], limit: 5 },
              },
            ],
          } satisfies XYConfig)
        ).not.toThrow();
      }
    );

    it.each(anyType.map((type) => anyType.map((anotherType) => [type, anotherType])).flat(1))(
      'should handle multiple metric in multiple layers %s + %s with reference lines and annotations',
      (type1, type2) => {
        expect(() =>
          xyConfigSchema.parse({
            type: 'xy',
            title: `Mixed Chart`,
            layers: [
              {
                data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'companyAIndex' },
                type: type1,
                ignore_global_filters: false,
                sampling: 1,
                x: {
                  operation: 'date_histogram',
                  field: 'order_date',
                  suggested_interval: 'auto',
                  use_original_time_range: true,
                  include_empty_rows: false,
                },
                y: [
                  { operation: 'count', empty_as_null: false },
                  { operation: 'average', field: 'price' },
                ],
                breakdown_by: { operation: 'terms', fields: ['product', 'category'], limit: 5 },
              },
              {
                data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'companyBIndex' },
                type: type2,
                ignore_global_filters: false,
                sampling: 1,
                x: {
                  operation: 'date_histogram',
                  field: 'order_date',
                  suggested_interval: 'auto',
                  use_original_time_range: true,
                  include_empty_rows: false,
                },
                y: [
                  { operation: 'count', empty_as_null: false },
                  { operation: 'average', field: 'price' },
                ],
                breakdown_by: { operation: 'terms', fields: ['product', 'category'], limit: 5 },
              },
              {
                data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'myDataView' },
                type: 'reference_lines',
                ignore_global_filters: false,
                sampling: 1,
                thresholds: [
                  {
                    operation: 'median',
                    field: 'price',
                    label: 'Median Price',
                    color: { type: 'static', color: 'red' },
                    text: { visible: true },
                  },
                  {
                    operation: 'average',
                    field: 'price',
                    label: 'Average Price',
                    color: { type: 'static', color: 'blue' },
                    text: { visible: true },
                  },
                ],
              },
              {
                type: 'annotations',
                ignore_global_filters: false,
                data_source: {
                  type: AS_CODE_DATA_VIEW_REFERENCE_TYPE,
                  ref_id: 'metrics-*',
                },
                events: [
                  {
                    type: 'point',
                    label: 'New Year',
                    timestamp: '2023-01-01T00:00:00Z',
                    text: { visible: true },
                    color: {
                      type: 'static',
                      color: '#ff0000',
                    },
                  },
                  {
                    type: 'point',
                    label: 'Christmas',
                    timestamp: '2023-12-25T00:00:00Z',
                    text: { visible: true },
                    color: {
                      type: 'static',
                      color: '#ff0000',
                    },
                  },
                  {
                    type: 'range',
                    label: 'Promotion',
                    interval: {
                      from: '2023-12-20T00:00:00Z',
                      to: '2023-12-27T23:59:59Z',
                    },
                    fill: 'outside',
                    color: {
                      type: 'static',
                      color: '#00ff00',
                    },
                  },
                  {
                    type: 'query',
                    label: 'Bingo!',
                    query: { language: 'kql', expression: 'order_amount > 1000' },
                    time_field: 'order_date',
                    text: { visible: true },
                    color: {
                      type: 'static',
                      color: '#0000ff',
                    },
                  },
                ],
              },
            ],
          } satisfies XYConfig)
        ).not.toThrow();
      }
    );

    it.each(anyType.map((type) => anyType.map((anotherType) => [type, anotherType])).flat(1))(
      'should handle multiple metric in multiple layers %s + %s with reference lines and annotations (DSL layers only)',
      (type1, type2) => {
        expect(() =>
          xyConfigSchema.parse({
            type: 'xy',
            title: `Mixed Chart`,
            layers: [
              {
                data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'companyAIndex' },
                type: type1,
                ignore_global_filters: false,
                sampling: 1,
                x: {
                  operation: 'date_histogram',
                  field: 'order_date',
                  include_empty_rows: false,
                  suggested_interval: 'auto',
                  use_original_time_range: true,
                  drop_partial_intervals: false,
                },
                y: [
                  { operation: 'count', empty_as_null: false },
                  { operation: 'average', field: 'price' },
                ],
                breakdown_by: {
                  operation: 'terms',
                  fields: ['product', 'category'],
                  limit: 5,
                  rank_by: {
                    direction: 'desc',
                    metric_index: 0,
                    type: 'metric',
                  },
                },
              },
              {
                data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'companyBIndex' },
                type: type2,
                ignore_global_filters: false,
                sampling: 1,
                x: {
                  operation: 'date_histogram',
                  field: 'order_date',
                  include_empty_rows: false,
                  suggested_interval: 'auto',
                  use_original_time_range: true,
                  drop_partial_intervals: false,
                },
                y: [
                  { operation: 'count', empty_as_null: false },
                  { operation: 'average', field: 'price' },
                ],
                breakdown_by: {
                  operation: 'terms',
                  fields: ['product', 'category'],
                  limit: 5,
                  rank_by: {
                    direction: 'desc',
                    metric_index: 0,
                    type: 'metric',
                  },
                },
              },
              {
                data_source: {
                  type: AS_CODE_DATA_VIEW_SPEC_TYPE,
                  index_pattern: 'companyIndex',
                  time_field: '@timestamp',
                },
                type: 'reference_lines',
                ignore_global_filters: false,
                sampling: 1,
                thresholds: [
                  {
                    operation: 'median',
                    field: 'price',
                    label: 'Median Price',
                    color: { type: 'static', color: 'red' },
                    text: { visible: true },
                  },
                  {
                    operation: 'average',
                    field: 'price',
                    label: 'Average Price',
                    color: { type: 'static', color: 'blue' },
                    text: { visible: false },
                  },
                ],
              },
              {
                type: 'annotations',
                ignore_global_filters: false,
                data_source: {
                  type: AS_CODE_DATA_VIEW_REFERENCE_TYPE,
                  ref_id: 'metrics-*',
                },
                events: [
                  {
                    type: 'point',
                    label: 'New Year',
                    timestamp: '2023-01-01T00:00:00Z',
                    text: { visible: true },
                    color: {
                      type: 'static',
                      color: '#ff0000',
                    },
                  },
                  {
                    type: 'point',
                    label: 'Christmas',
                    timestamp: '2023-12-25T00:00:00Z',
                    text: { visible: true },
                    color: {
                      type: 'static',
                      color: '#ff0000',
                    },
                  },
                  {
                    type: 'range',
                    label: 'Promotion',
                    interval: {
                      from: '2023-12-20T00:00:00Z',
                      to: '2023-12-27T23:59:59Z',
                    },
                    fill: 'outside',
                    color: {
                      type: 'static',
                      color: '#00ff00',
                    },
                  },
                  {
                    type: 'query',
                    label: 'Bingo!',
                    query: { language: 'kql', expression: 'order_amount > 1000' },
                    time_field: 'order_date',
                    text: {
                      visible: true,
                      field: 'order_id',
                    },
                    color: {
                      type: 'static',
                      color: '#0000ff',
                    },
                  },
                ],
              },
            ],
          } satisfies XYConfig)
        ).not.toThrow();
      }
    );
  });

  describe('invalid xy charts', () => {
    it('should throw for no layers', () => {
      const result = xyConfigSchema.safeParse({
        type: 'xy',
        title: `Faulty Chart`,
        layers: [],
      } satisfies XYConfig);
      expectPrettyError(result).toMatchInlineSnapshot(`"✖ Invalid input"`);
    });

    it('should not let mix esql data_source with dsl operations', () => {
      const result = xyConfigSchema.safeParse({
        type: 'xy',
        title: `Faulty Chart`,
        layers: [
          {
            data_source: { type: 'esql', query: 'FROM company_index' },
            type: 'bar',
            ignore_global_filters: false,
            sampling: 1,
            x: {
              operation: 'date_histogram',
              field: 'order_date',
              suggested_interval: 'auto',
              use_original_time_range: true,
              include_empty_rows: false,
            },
            y: [
              { operation: 'count', empty_as_null: false },
              { operation: 'average', field: 'price' },
            ],

            breakdown_by: { operation: 'terms', fields: ['product', 'category'], limit: 5 },
          },
        ],
      });
      expectPrettyError(result).toMatchInlineSnapshot(`"✖ Invalid input"`);
    });

    it('should not let esql annotations', () => {
      const result = xyConfigSchema.safeParse({
        type: 'xy',
        title: `Faulty Chart`,
        layers: [
          {
            data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'myDataView' },
            type: 'bar',
            ignore_global_filters: false,
            sampling: 1,
            x: {
              operation: 'date_histogram',
              field: 'order_date',
              suggested_interval: 'auto',
              use_original_time_range: true,
              include_empty_rows: false,
            },
            y: [{ operation: 'count', empty_as_null: false }],
          },
          // intentionally invalid layer to assert the schema rejects it: an ES|QL
          // data_source on an annotation layer matches no layer schema by design
          // (annotation layers are data-view based or, on ES|QL charts, carry no
          // data_source at all; an ES|QL variant may be added later, see
          // https://github.com/elastic/kibana-team/issues/4006). The cast below
          // bypasses the same rejection at the type level.
          {
            type: 'annotations',
            ignore_global_filters: false,
            data_source: {
              type: 'esql',
              query:
                'FROM kibana_simple_logs_data | EVAL timestamp = order_date | FILTER product == "xyz" ',
            } satisfies DataSourceTypeESQL,
            events: [
              {
                type: 'point',
                label: 'Event',
                timestamp: '2023-01-01T00:00:00Z',
                text: { visible: true },
                color: {
                  type: 'static',
                  color: '#ff0000',
                },
              },
            ],
          } as unknown as XYConfigNoESQL['layers'][number],
        ],
      } satisfies XYConfig);
      expectPrettyError(result).toMatchInlineSnapshot(`"✖ Invalid input"`);
    });

    it('should reject mixing ES|QL and DSL layers in one chart', () => {
      const result = xyConfigSchema.safeParse({
        type: 'xy',
        title: 'Mixed mode chart',
        layers: [
          {
            data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'companyAIndex' },
            type: 'bar',
            ignore_global_filters: false,
            sampling: 1,
            x: {
              operation: 'date_histogram',
              field: 'order_date',
              include_empty_rows: false,
              suggested_interval: 'auto',
              use_original_time_range: true,
              drop_partial_intervals: false,
            },
            y: [{ operation: 'count', empty_as_null: false }],
          },
          {
            dataset: { type: 'esql', query: 'FROM company_index' },
            type: 'line',
            ignore_global_filters: false,
            sampling: 1,
            x: { operation: 'value', column: 'order_date' },
            y: [{ operation: 'value', column: 'value' }],
          },
        ],
      } as XYConfig);
      expectPrettyError(result).toMatchInlineSnapshot(`"✖ Invalid input"`);
    });

    it('should reject list legend layout for left positions', () => {
      const result = xyConfigSchema.safeParse({
        type: 'xy',
        title: 'Invalid list legend position',
        legend: {
          visibility: 'visible',
          position: 'left',
          layout: {
            type: 'list',
          },
        },
        layers: [minimalLayer],
      });
      expectPrettyError(result).toMatchInlineSnapshot(`"✖ Invalid input"`);
    });
  });

  describe('legend layout schema', () => {
    it('should allow list legend layout for top/bottom', () => {
      expect(() =>
        xyConfigSchema.parse({
          type: 'xy',
          title: 'Valid list legend',
          legend: {
            visibility: 'visible',
            position: 'bottom',
            layout: {
              type: 'list',
            },
          },
          layers: [minimalLayer],
        })
      ).not.toThrow();
    });
  });

  it('should track number of statistics options', () => {
    const union = statisticsSchema as z.ZodUnion<readonly [z.ZodTypeAny, ...z.ZodTypeAny[]]>;
    expect(union.options.length).toBe(statisticsOptionsSize);
  });
});
