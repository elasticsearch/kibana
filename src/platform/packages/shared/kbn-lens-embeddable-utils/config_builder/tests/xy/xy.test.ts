/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { XYVisualizationState } from '@kbn/lens-common';
import type { XYConfig } from '../../schema/charts/xy';
import { AUTO_COLOR, DEFAULT_CATEGORICAL_COLOR_MAPPING } from '../../schema/color';
import { LensConfigBuilder } from '../../config_builder';
import type { LensAttributes } from '../../types';
import { validator } from '../utils/validator';
import {
  apiXYWithNoTitleAndCustomOutsideLegend,
  apiXYWithNoYTitleAndInsideLegend,
  apiXYWithTopListWithTruncationLegend,
  barWithTwoLayersAttributes,
  breakdownXY,
  fullBasicXY,
  minimalAttributesXY,
  mixedChartAttributes,
  multipleMetricsXY,
  xyWithFormulaRefColumnsAndRankByTermsBucketOperationAttributes,
} from './basicXY.mock';
import { dualReferenceLineXY, referenceLineXY } from './referenceLines.mock';
import { annotationXY, byRefAnnotationXY } from './annotations.mock';
import {
  esqlChart,
  esqlChartWithBreakdownColorMapping,
  esqlXYWithCollapseByBreakdown,
} from './esqlXY.mock';
import {
  AS_CODE_DATA_VIEW_REFERENCE_TYPE,
  AS_CODE_DATA_VIEW_SPEC_TYPE,
} from '@kbn/as-code-data-views-schema';
import { DEFAULT_LINE_CATEGORICAL_COLOR_MAPPING } from '../../transforms/charts/xy/defaults';

function setSeriesType(attributes: LensAttributes, seriesType: 'bar' | 'line' | 'area') {
  return {
    ...attributes,
    state: {
      ...attributes.state,
      visualization: {
        ...(attributes.state.visualization as XYVisualizationState),
        layers: (attributes.state.visualization as XYVisualizationState).layers.map((layer) => {
          if (!layer.layerType || layer.layerType === 'data') {
            return {
              ...layer,
              seriesType,
            };
          }
          return layer;
        }),
      },
    },
  };
}

describe('XY', () => {
  describe('state transform validation', () => {
    describe('Data only', () => {
      for (const type of ['bar', 'line', 'area'] as const) {
        it(`should convert a minimal ${type} chart with one data layer`, () => {
          validator.xy.fromState(setSeriesType(minimalAttributesXY, type));
        });
      }

      it(`should convert a full xy chart with one data layer`, () => {
        validator.xy.fromState(fullBasicXY);
      });

      it(`should convert a xy chart with multiple metrics`, () => {
        validator.xy.fromState(multipleMetricsXY);
      });

      it(`should convert a xy chart with multiple metrics and a breakdown`, () => {
        validator.xy.fromState(breakdownXY);
      });

      it('should convert a bar chart with 2 layers', () => {
        validator.xy.fromState(barWithTwoLayersAttributes);
      });

      it('should convert a mixed chart with 3 layers', () => {
        validator.xy.fromState(mixedChartAttributes);
      });

      it('should convert a chart with formula ref columns and rank_by in the terms bucket operation', () => {
        validator.xy.fromState(xyWithFormulaRefColumnsAndRankByTermsBucketOperationAttributes);
      });

      it('should convert an esql xy with collapse by breakdown', () => {
        validator.xy.fromState(esqlXYWithCollapseByBreakdown);
      });
    });

    describe('Reference lines', () => {
      for (const type of ['bar', 'line', 'area'] as const) {
        it(`should work for a reference line with a ${type} chart`, () => {
          validator.xy.fromState(setSeriesType(referenceLineXY, type));
        });
      }

      it('should work for both horizontal and vertical reference lines', () => {
        validator.xy.fromState(dualReferenceLineXY);
      });
    });

    describe('Annotations', () => {
      for (const type of ['bar', 'line', 'area'] as const) {
        it(`should work for an annotation with a ${type} chart`, () => {
          validator.xy.fromState(setSeriesType(annotationXY, type));
        });
      }

      for (const type of ['bar', 'line', 'area'] as const) {
        it(`should work for a by-reference annotation with a ${type} chart`, () => {
          validator.xy.fromState(setSeriesType(byRefAnnotationXY, type));
        });
      }
    });

    describe('ES|QL panels', () => {
      for (const type of ['bar', 'line', 'area'] as const) {
        it(`should work for an annotation with a ${type} chart`, () => {
          validator.xy.fromState(setSeriesType(esqlChart, type));
        });
      }

      for (const type of ['bar', 'line', 'area'] as const) {
        it(`should work for an ES|QL ${type} chart with breakdown and color mapping`, () => {
          validator.xy.fromState(setSeriesType(esqlChartWithBreakdownColorMapping, type));
        });
      }

      describe('X-axis scale detection', () => {
        it('should detect temporal scale for ES|QL chart with date column', () => {
          const esqlChartWithDateColumn: LensAttributes = {
            title: 'ES|QL Chart with Date X-Axis',
            references: [],
            visualizationType: 'lnsXY',
            state: {
              datasourceStates: {
                textBased: {
                  layers: {
                    layer1: {
                      index: 'test-index',
                      query: {
                        esql: 'FROM logs | STATS count = COUNT(*) BY timestamp',
                      },
                      columns: [
                        {
                          columnId: 'timestamp',
                          fieldName: 'timestamp',
                          meta: {
                            type: 'date',
                            esType: 'date',
                          },
                        },
                        {
                          columnId: 'count',
                          fieldName: 'count',
                          meta: {
                            type: 'number',
                            esType: 'long',
                          },
                          inMetricDimension: true,
                        },
                      ],
                    },
                  },
                },
              },
              visualization: {
                legend: { isVisible: true, position: 'right' },
                preferredSeriesType: 'bar',
                layers: [
                  {
                    layerId: 'layer1',
                    seriesType: 'bar',
                    xAccessor: 'timestamp',
                    accessors: ['count'],
                    layerType: 'data',
                  },
                ],
              },
              query: { esql: 'FROM logs | STATS count = COUNT(*) BY timestamp' },
              filters: [],
            },
          };

          validator.xy.fromState(esqlChartWithDateColumn);
        });

        it('should detect linear scale for ES|QL chart with numeric column', () => {
          const esqlChartWithNumericColumn: LensAttributes = {
            title: 'ES|QL Chart with Numeric X-Axis',
            references: [],
            visualizationType: 'lnsXY',
            state: {
              datasourceStates: {
                textBased: {
                  layers: {
                    layer1: {
                      index: 'test-index',
                      query: {
                        esql: 'FROM logs | STATS count = COUNT(*) BY bytes',
                      },
                      columns: [
                        {
                          columnId: 'bytes',
                          fieldName: 'bytes',
                          meta: {
                            type: 'number',
                            esType: 'long',
                          },
                        },
                        {
                          columnId: 'count',
                          fieldName: 'count',
                          meta: {
                            type: 'number',
                            esType: 'long',
                          },
                          inMetricDimension: true,
                        },
                      ],
                    },
                  },
                },
              },
              visualization: {
                legend: { isVisible: true, position: 'right' },
                preferredSeriesType: 'line',
                layers: [
                  {
                    layerId: 'layer1',
                    seriesType: 'line',
                    xAccessor: 'bytes',
                    accessors: ['count'],
                    layerType: 'data',
                  },
                ],
              },
              query: { esql: 'FROM logs | STATS count = COUNT(*) BY bytes' },
              filters: [],
            },
          };

          validator.xy.fromState(esqlChartWithNumericColumn);
        });

        it('should default to ordinal scale for form-based chart', () => {
          validator.xy.fromState(minimalAttributesXY);
        });
      });
    });
  });

  describe('api transform validation', () => {
    const universalTypes = [
      'bar',
      'line',
      'area',
      'bar_stacked',
      'area_stacked',
      'bar_horizontal',
      'bar_horizontal_stacked',
    ] as const;

    const typesWithBreakdown = [
      'bar_percentage',
      'area_percentage',
      'bar_horizontal_percentage',
    ] as const;
    const anyType = [...universalTypes, ...typesWithBreakdown];
    it.each(universalTypes)('should work for for a minimal %s', (type) => {
      validator.xy.fromApi({
        type: 'xy',
        title: `${type} Chart`,
        layers: [
          {
            ignore_global_filters: false,
            sampling: 1,
            data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'myDataView' },
            type,
            y: [{ operation: 'count', empty_as_null: false }],
          },
        ],
      });
    });

    it.each(anyType)('should work for ES|QL mode for a minimal %s chart with breakdown', (type) => {
      validator.xy.fromApi({
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
      });
    });

    it.each(anyType)(
      'should work for ES|QL mode for a %s chart with breakdown and collapse_by',
      (type) => {
        validator.xy.fromApi({
          type: 'xy',
          title: `${type} Chart with collapse`,
          layers: [
            {
              data_source: {
                type: 'esql',
                query: 'FROM kibana_sample_data_logs',
              },
              type,
              ignore_global_filters: false,
              sampling: 1,
              x: { column: '@timestamp' },
              y: [{ column: 'bytes' }],
              breakdown_by: { column: 'agent', collapse_by: 'max' },
            },
          ],
        });
      }
    );

    it.each(anyType)(
      'should work for ES|QL mode for %s chart with breakdown and categorical color mapping',
      (type) => {
        validator.xy.fromApi({
          type: 'xy',
          title: `${type} Chart with Color Mapping`,
          layers: [
            {
              data_source: {
                type: 'esql',
                query:
                  'FROM kibana_sample_data | STATS count = count() BY category, buckets = BUCKET(3 hours, order_date)',
              },
              type,
              ignore_global_filters: false,
              sampling: 1,
              x: { column: 'buckets' },
              y: [{ column: 'count' }],
              breakdown_by: {
                column: 'category',
                color: {
                  mode: 'categorical',
                  palette: 'default',
                  mapping: [
                    {
                      values: ['Clothing'],
                      color: { type: 'color_code', value: '#ff0000' },
                    },
                  ],
                },
              },
            },
          ],
        });
      }
    );
    it.each(anyType.map((type) => anyType.map((anotherType) => [type, anotherType])).flat(1))(
      'should handle multiple metric in multiple layers %s + %s with reference lines and annotations (DSL layers only)',
      (type1, type2) => {
        validator.xy.fromApi({
          type: 'xy',
          title: `Mixed Chart`,
          layers: [
            {
              data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'companyBIndex' },
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
        });
      }
    );

    it('should correctly transform no title and inside legend - bug 248611', () => {
      validator.xy.fromApi(apiXYWithNoYTitleAndInsideLegend);
    });

    it('should correctly transform top list layout', () => {
      validator.xy.fromApi(apiXYWithTopListWithTruncationLegend);
    });

    it('should correctly transform with custom position legend - bug 248611', () => {
      validator.xy.fromApi(apiXYWithNoTitleAndCustomOutsideLegend);
    });

    it('should convert API with by-reference annotation layer', () => {
      validator.xy.fromApi({
        type: 'xy',
        title: 'Chart with by-ref annotation',
        layers: [
          {
            data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'myDataView' },
            type: 'line',
            ignore_global_filters: false,
            sampling: 1,
            y: [{ operation: 'count', empty_as_null: false }],
          },
          {
            type: 'annotation_group',
            group_id: 'my-library-annotation-group',
          },
        ],
      });
    });

    describe('XY axis scale support (text-based)', () => {
      it('should convert temporal scale correctly for ES|QL layer', () => {
        validator.xy.fromApi({
          type: 'xy',
          title: 'XY Chart with Temporal Scale',
          axis: {
            x: {
              scale: 'temporal',
            },
          },
          layers: [
            {
              ignore_global_filters: false,
              sampling: 1,
              data_source: {
                type: 'esql',
                query:
                  'FROM kibana_sample_data_logs | STATS count = count() BY buckets = BUCKET(@timestamp, 1 hour)',
              },
              type: 'bar',
              x: { column: 'buckets' },
              y: [{ column: 'count' }],
            },
          ],
        });
      });

      it('should convert linear scale correctly for ES|QL layer', () => {
        validator.xy.fromApi({
          type: 'xy',
          title: 'XY Chart with Linear Scale',
          axis: {
            x: {
              scale: 'linear',
            },
          },
          layers: [
            {
              ignore_global_filters: false,
              sampling: 1,
              data_source: {
                type: 'esql',
                query: 'FROM kibana_sample_data_logs | STATS count = count() BY bytes',
              },
              type: 'line',
              x: { column: 'bytes' },
              y: [{ column: 'count' }],
            },
          ],
        });
      });

      it('should handle config without axis object', () => {
        validator.xy.fromApi({
          type: 'xy',
          title: 'XY Chart without Axis',
          layers: [
            {
              ignore_global_filters: false,
              sampling: 1,
              data_source: {
                type: 'esql',
                query: 'FROM kibana_sample_data_logs | STATS count = count() BY bytes',
              },
              type: 'bar',
              y: [{ column: 'count' }],
            },
          ],
        });
      });

      it('should handle config with axis but no x axis', () => {
        validator.xy.fromApi({
          type: 'xy',
          title: 'XY Chart with Y-Axis Only',
          axis: {
            y: {
              ticks: { visible: true },
              grid: { visible: true },
            },
          },
          layers: [
            {
              ignore_global_filters: false,
              sampling: 1,
              data_source: {
                type: 'esql',
                query: 'FROM kibana_sample_data_logs | STATS count = count() BY bytes',
              },
              type: 'bar',
              y: [{ column: 'count' }],
            },
          ],
        });
      });
    });
  });

  describe('color default application', () => {
    it('should emit AUTO_COLOR on y-axis metrics when no breakdown is present', () => {
      const config = {
        type: 'xy',
        title: 'Y-axis color default test',
        layers: [
          {
            data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'myDataView' },
            type: 'bar',
            ignore_global_filters: false,
            sampling: 1,
            y: [{ operation: 'count', empty_as_null: false }],
          },
        ],
      } satisfies XYConfig;

      const builder = new LensConfigBuilder();
      const lensState = builder.fromAPIFormat(config);
      const apiOutput = builder.toAPIFormat(lensState) as XYConfig;

      const dataLayer = apiOutput.layers[0];
      expect('y' in dataLayer && dataLayer.y[0].color).toEqual(AUTO_COLOR);
    });

    it('should emit default categorical color mapping on breakdown_by (bar)', () => {
      const config = {
        type: 'xy',
        title: 'Breakdown color default test',
        layers: [
          {
            data_source: {
              type: 'esql',
              query: 'FROM logs | STATS count = count() BY product',
            },
            type: 'bar',
            ignore_global_filters: false,
            sampling: 1,
            y: [{ column: 'count' }],
            breakdown_by: { column: 'product' },
          },
        ],
      } satisfies XYConfig;

      const builder = new LensConfigBuilder();
      const lensState = builder.fromAPIFormat(config);
      const apiOutput = builder.toAPIFormat(lensState) as XYConfig;

      const dataLayer = apiOutput.layers[0];
      expect('breakdown_by' in dataLayer && dataLayer.breakdown_by?.color).toEqual(
        DEFAULT_CATEGORICAL_COLOR_MAPPING
      );
    });

    it('should emit elastic_line_optimized palette on breakdown_by for line charts', () => {
      const config = {
        type: 'xy',
        title: 'Line breakdown color default test',
        layers: [
          {
            data_source: {
              type: 'esql',
              query: 'FROM logs | STATS count = count() BY product',
            },
            type: 'line',
            ignore_global_filters: false,
            sampling: 1,
            y: [{ column: 'count' }],
            breakdown_by: { column: 'product' },
          },
        ],
      } satisfies XYConfig;

      const builder = new LensConfigBuilder();
      const lensState = builder.fromAPIFormat(config);
      const apiOutput = builder.toAPIFormat(lensState) as XYConfig;

      const dataLayer = apiOutput.layers[0];
      expect('breakdown_by' in dataLayer && dataLayer.breakdown_by?.color).toEqual(
        DEFAULT_LINE_CATEGORICAL_COLOR_MAPPING
      );
    });

    it('should emit AUTO_COLOR on reference line when no color is specified', () => {
      const config = {
        type: 'xy',
        title: 'Reference line color default test',
        layers: [
          {
            data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'myDataView' },
            type: 'bar',
            ignore_global_filters: false,
            sampling: 1,
            y: [{ operation: 'count', empty_as_null: false }],
          },
          {
            data_source: {
              type: AS_CODE_DATA_VIEW_SPEC_TYPE,
              index_pattern: 'test-index',
              time_field: '@timestamp',
            },
            type: 'reference_lines',
            ignore_global_filters: false,
            sampling: 1,
            thresholds: [
              {
                operation: 'median',
                field: 'bytes',
                label: 'Median',
                axis: 'y',
              },
            ],
          },
        ],
      } satisfies XYConfig;

      const builder = new LensConfigBuilder();
      const lensState = builder.fromAPIFormat(config);
      const apiOutput = builder.toAPIFormat(lensState) as XYConfig;

      const refLineLayer = apiOutput.layers.find((l) => 'thresholds' in l);
      expect(refLineLayer).toBeDefined();
      if (refLineLayer && 'thresholds' in refLineLayer) {
        expect(refLineLayer.thresholds[0].color).toEqual(AUTO_COLOR);
      }
    });

    it('should emit AUTO_COLOR on annotation events when no color is specified', () => {
      const config = {
        type: 'xy',
        title: 'Annotation color default test',
        layers: [
          {
            data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'myDataView' },
            type: 'bar',
            ignore_global_filters: false,
            sampling: 1,
            y: [{ operation: 'count', empty_as_null: false }],
          },
          {
            type: 'annotations',
            ignore_global_filters: false,
            data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'myDataView' },
            events: [
              {
                type: 'point',
                label: 'Test Event',
                timestamp: '2023-01-01T00:00:00Z',
              },
              {
                type: 'range',
                label: 'Test Range',
                interval: {
                  from: '2023-01-01T00:00:00Z',
                  to: '2023-01-02T00:00:00Z',
                },
                fill: 'inside',
              },
            ],
          },
        ],
      } satisfies XYConfig;

      const builder = new LensConfigBuilder();
      const lensState = builder.fromAPIFormat(config);
      const apiOutput = builder.toAPIFormat(lensState) as XYConfig;

      const annotationLayer = apiOutput.layers.find((l) => 'events' in l);
      expect(annotationLayer).toBeDefined();
      if (annotationLayer && 'events' in annotationLayer) {
        for (const event of annotationLayer.events) {
          expect(event.color).toEqual(AUTO_COLOR);
        }
      }
    });

    it('should convert ES|QL line chart with manual annotation layer (no data source)', () => {
      const config = {
        type: 'xy',
        title: 'Change Points — avg_bytes',
        layers: [
          {
            data_source: {
              type: 'esql' as const,
              query:
                'FROM logs-* | STATS avg_bytes = AVG(bytes) BY bucket = BUCKET(@timestamp, 1 day)',
            },
            type: 'line' as const,
            ignore_global_filters: false,
            sampling: 1,
            y: [{ column: 'avg_bytes' }],
          },
          {
            type: 'annotations' as const,
            ignore_global_filters: false,
            events: [
              {
                type: 'point' as const,
                label: 'step_change (p=0.001)',
                timestamp: '2024-01-15T12:00:00Z',
                text: { visible: true },
              },
            ],
          },
        ],
      } satisfies XYConfig;

      const builder = new LensConfigBuilder();
      const lensState = builder.fromAPIFormat(config);

      const visualization = lensState.state.visualization as XYVisualizationState;
      expect(visualization.layers).toHaveLength(2);

      const dataLayer = visualization.layers.find((l) => !l.layerType || l.layerType === 'data');
      expect(dataLayer).toBeDefined();

      const annotationLayer = visualization.layers.find((l) => l.layerType === 'annotations');
      expect(annotationLayer).toBeDefined();
      if (annotationLayer && 'annotations' in annotationLayer) {
        expect(annotationLayer.annotations).toHaveLength(1);
        expect((annotationLayer as any).annotations[0].label).toBe('step_change (p=0.001)');
        // Annotation layers must use a *regular* (non-ES|QL-typed) ad-hoc data view so
        // that the Lens XY visualization can initialise the annotation context without
        // triggering the ES|QL text-based initialisation path (which would hang).
        const annotationDataViewId = (annotationLayer as any).indexPatternId;
        expect(annotationDataViewId).toBeTruthy();
        const adHocDataViews = lensState.state.adHocDataViews ?? {};
        const esqlDataViewEntry = Object.entries(adHocDataViews).find(
          ([, dataView]) => (dataView as any).type === 'esql'
        );
        expect(esqlDataViewEntry).toBeDefined();
        const [esqlDataViewId] = esqlDataViewEntry!;
        expect(annotationDataViewId).not.toBe(esqlDataViewId);
        const annotationDataView = adHocDataViews[annotationDataViewId];
        expect(annotationDataView).toBeDefined();
        // Must NOT be an ES|QL data view type
        expect((annotationDataView as any).type).not.toBe('esql');
      }
    });
  });
});
