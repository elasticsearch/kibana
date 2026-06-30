/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { TypeOf } from '@kbn/config-schema';
import type { DataSourceTypeESQL } from '../data_source';
import type { xyDataLayerSharedSchema, XYConfig } from './xy';
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
  ] satisfies TypeOf<typeof xyDataLayerSharedSchema.type>[];

  const typesWithBreakdown = [
    'bar_percentage',
    'area_percentage',
    'bar_horizontal_percentage',
  ] satisfies TypeOf<typeof xyDataLayerSharedSchema.type>[];
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
    ] satisfies TypeOf<typeof xyDataLayerSharedSchema.type>[])(
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
        expect(() => xyConfigSchema.validate(input)).not.toThrow();
      }
    );

    it.each(anyType)('should pass validation for %s with breakdown', (type) => {
      expect(() =>
        xyConfigSchema.validate({
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
          xyConfigSchema.validate({
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
        xyConfigSchema.validate({
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
        xyConfigSchema.validate({
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
        xyConfigSchema.validate({
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
          xyConfigSchema.validate({
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
          xyConfigSchema.validate({
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
          xyConfigSchema.validate({
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
      expect(() =>
        xyConfigSchema.validate({
          type: 'xy',
          title: `Faulty Chart`,
          layers: [],
        } satisfies XYConfig)
      ).toThrow();
    });

    it('should not let mix esql data_source with dsl operations', () => {
      expect(() =>
        xyConfigSchema.validate({
          type: 'xy',
          title: `Faulty Chart`,
          layers: [
            // @ts-expect-error - mixing not allowed
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
        } satisfies XYConfig)
      ).toThrow();
    });

    it('should reject annotation layer with esql data_source', () => {
      expect(() =>
        xyConfigSchema.validate({
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
            // @ts-expect-error - ES|QL data_source on annotation layer is not allowed
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
            },
          ],
        } satisfies XYConfig)
      ).toThrow();
    });

    it('should reject mixing ES|QL and DSL layers in one chart', () => {
      expect(() =>
        xyConfigSchema.validate({
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
        } as XYConfig)
      ).toThrow();
    });

    it('should reject list legend layout for left positions', () => {
      expect(() =>
        xyConfigSchema.validate({
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
        })
      ).toThrowErrorMatchingInlineSnapshot(`
        "types that failed validation:
        - [0.legend]: types that failed validation:
         - [legend.0.position]: types that failed validation:
          - [legend.position.0]: expected value to equal [top]
          - [legend.position.1]: expected value to equal [bottom]
         - [legend.1.layout.type]: expected value to equal [grid]
         - [legend.2.placement]: expected value to equal [inside]
        - [1.legend]: types that failed validation:
         - [legend.0.position]: types that failed validation:
          - [legend.position.0]: expected value to equal [top]
          - [legend.position.1]: expected value to equal [bottom]
         - [legend.1.layout.type]: expected value to equal [grid]
         - [legend.2.placement]: expected value to equal [inside]"
      `);
    });
  });

  describe('legend layout schema', () => {
    it('should allow list legend layout for top/bottom', () => {
      expect(() =>
        xyConfigSchema.validate({
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

    it('should accept ES|QL line layer combined with a manual-only annotation layer', () => {
      expect(() =>
        xyConfigSchema.validate({
          type: 'xy',
          title: 'Change Points',
          layers: [
            {
              data_source: {
                type: 'esql',
                query:
                  'FROM logs-* | STATS avg_bytes = AVG(bytes) BY bucket = BUCKET(@timestamp, 1 day)',
              },
              type: 'line',
              ignore_global_filters: false,
              sampling: 1,
              y: [{ column: 'avg_bytes' }],
            },
            {
              type: 'annotations',
              ignore_global_filters: false,
              events: [
                {
                  type: 'point',
                  label: 'step_change (p=0.001)',
                  timestamp: '2024-01-15T12:00:00Z',
                  text: { visible: true },
                },
              ],
            },
          ],
        })
      ).not.toThrow();
    });
  });

  it('should track number of statistics options', () => {
    const realStatisticsOptionsSize = (statisticsSchema.getSchema() as any)?.$_root?._types?.size;

    expect(statisticsOptionsSize).toBe(realStatisticsOptionsSize);
  });
});
