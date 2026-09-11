/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { AS_CODE_DATA_VIEW_SPEC_TYPE } from '@kbn/as-code-data-views-schema';
import type { MetricVisualizationState, TermsIndexPatternColumn } from '@kbn/lens-common';

import { validator } from '../utils/validator';
import { DEFAULT_LAYER_ID } from '../../constants';
import type { MetricConfig } from '../../schema/charts/metric';
import { AUTO_COLOR, NO_COLOR } from '../../schema/color';
import { LensConfigBuilder } from '../../config_builder';
import {
  simpleMetricAttributes,
  breakdownMetricAttributes,
  complexMetricAttributes,
  breakdownMetricWithFormulaRefColumnsAttributes,
  selectorColorByValueAttributes,
  defaultColorByValueAttributes,
  dynamicColorsMetricAttributes,
} from './lens_state_config.mock';
import {
  simpleMetricAPIAttributes,
  breakdownMetricAPIAttributes,
  complexMetricAPIAttributes,
  complexESQLMetricAPIAttributes,
  esqlMetricWithTrendAPIAttributes,
  metricAPIWithTermsRankedBySecondary,
} from './lens_api_config.mock';

describe('Metric', () => {
  const baseMetric = {
    type: 'metric',
    title: 'Color default test',
    data_source: {
      type: AS_CODE_DATA_VIEW_SPEC_TYPE,
      index_pattern: 'test-index',
      time_field: '@timestamp',
    },
    metrics: [
      {
        type: 'primary',
        operation: 'count',
        empty_as_null: false,
      },
    ],
    sampling: 1,
    ignore_global_filters: false,
  } satisfies MetricConfig;

  describe('state transform validation', () => {
    it('should convert a simple metric', () => {
      validator.metric.fromState(simpleMetricAttributes);
    });

    it('should convert a complex metric', () => {
      validator.metric.fromState(complexMetricAttributes);
    });

    it('should convert a breakdown-by metric', () => {
      validator.metric.fromState(breakdownMetricAttributes);
    });

    it('should convert a breakdown-by metric with formula reference columns and rank_by in the terms bucket operation', () => {
      validator.metric.fromState(breakdownMetricWithFormulaRefColumnsAttributes);
    });

    it('should convert a default color by value palette', () => {
      validator.metric.fromState(defaultColorByValueAttributes);
    });

    it('should convert a selector color by value palette', () => {
      validator.metric.fromState(selectorColorByValueAttributes);
    });

    it('should convert a dynamic colors metric', () => {
      validator.metric.fromState(dynamicColorsMetricAttributes);
    });
  });

  describe('api transform validation', () => {
    it('should convert a simple metric', () => {
      validator.metric.fromApi(simpleMetricAPIAttributes);
    });

    it('should convert a complex metric', () => {
      validator.metric.fromApi(complexMetricAPIAttributes);
    });

    it('should convert a breakdown-by metric', () => {
      validator.metric.fromApi(breakdownMetricAPIAttributes);
    });

    it('should convert a complex ESQL metric chart', () => {
      validator.metric.fromApi(complexESQLMetricAPIAttributes);
    });

    it('should convert an ESQL metric with trend background chart', () => {
      validator.metric.fromApi(esqlMetricWithTrendAPIAttributes);
    });

    it('should convert a metric with a terms agg ranked by secondary metric', () => {
      validator.metric.fromApi(metricAPIWithTermsRankedBySecondary);
    });
  });

  describe('trendline persistence', () => {
    it('should preserve an ESQL metric trendline when serializing renderable Lens state', () => {
      const builder = new LensConfigBuilder(undefined, true);
      const lensState = builder.fromAPIFormat(esqlMetricWithTrendAPIAttributes);
      const visualization = lensState.state.visualization as MetricVisualizationState;

      expect(visualization.trendlineLayerId).toBeDefined();
      expect(visualization.trendlineMetricAccessor).toBeDefined();
      expect(visualization.trendlineTimeAccessor).toBeDefined();

      delete visualization.trendlineLayerType;

      const apiOutput = builder.toAPIFormat(lensState) as MetricConfig;
      const [primaryMetric] = apiOutput.metrics;

      expect(primaryMetric).toMatchObject({
        type: 'primary',
        background_chart: { type: 'trend' },
      });
    });

    it('uses an aliased TBUCKET result column for a TS metric trendline', () => {
      const builder = new LensConfigBuilder(undefined, true);
      const query =
        'TS metrics-* | STATS avg_cpu = AVG(AVG_OVER_TIME(cpu)) BY custom_time_bucket = TBUCKET(100)';
      const lensState = builder.fromAPIFormat({
        type: 'metric',
        title: 'TS metric with aliased TBUCKET trendline',
        data_source: { type: 'esql', query },
        ignore_global_filters: false,
        sampling: 1,
        metrics: [
          {
            type: 'primary',
            column: 'avg_cpu',
            background_chart: { type: 'trend' },
          },
        ],
      } satisfies MetricConfig);
      const visualization = lensState.state.visualization as MetricVisualizationState;
      const trendlineLayerId = visualization.trendlineLayerId;
      const trendlineTimeAccessor = visualization.trendlineTimeAccessor;

      if (!trendlineLayerId || !trendlineTimeAccessor) {
        throw new Error('Expected trendline accessors in metric visualization state');
      }

      const trendlineLayer = lensState.state.datasourceStates.textBased?.layers[trendlineLayerId];
      expect(trendlineLayer?.query?.esql).toBe(query);
      expect(trendlineLayer?.query?.esql).not.toContain('BUCKET(@timestamp');
      expect(
        trendlineLayer?.columns.find(({ columnId }) => columnId === trendlineTimeAccessor)
          ?.fieldName
      ).toBe('custom_time_bucket');
    });

    it('derives the trendline from the FORK branch producing the metric column', () => {
      const builder = new LensConfigBuilder(undefined, true);
      const query =
        'FROM kibana_sample_data_flights | WHERE timestamp >= ?_tstart AND timestamp < ?_tend | FORK (STATS `Total Flights` = COUNT(*)) (STATS `Flight Count` = COUNT(*) BY `Time Bucket` = BUCKET(timestamp, 75, ?_tstart, ?_tend))';
      const lensState = builder.fromAPIFormat({
        type: 'metric',
        title: 'FORK metric with trendline',
        data_source: { type: 'esql', query },
        ignore_global_filters: false,
        sampling: 1,
        metrics: [
          {
            type: 'primary',
            column: 'Total Flights',
            background_chart: { type: 'trend' },
          },
        ],
      } satisfies MetricConfig);
      const visualization = lensState.state.visualization as MetricVisualizationState;
      const trendlineLayerId = visualization.trendlineLayerId;
      const trendlineTimeAccessor = visualization.trendlineTimeAccessor;

      if (!trendlineLayerId || !trendlineTimeAccessor) {
        throw new Error('Expected trendline accessors in metric visualization state');
      }

      const trendlineLayer = lensState.state.datasourceStates.textBased?.layers[trendlineLayerId];
      expect(trendlineLayer?.query?.esql).toBe(
        'FROM kibana_sample_data_flights | WHERE timestamp >= ?_tstart AND timestamp < ?_tend | STATS `Total Flights` = COUNT(*) BY BUCKET(timestamp, 75, ?_tstart, ?_tend)'
      );
      expect(trendlineLayer?.query?.esql).not.toContain('FORK');
      expect(
        trendlineLayer?.columns.find(({ columnId }) => columnId === trendlineTimeAccessor)
          ?.fieldName
      ).toBe('BUCKET(timestamp, 75, ?_tstart, ?_tend)');
    });
  });

  describe('form-based trendline breakdown ordering', () => {
    const TRENDLINE_LAYER_ID = `${DEFAULT_LAYER_ID}_trendline`;

    const trendlineBreakdownConfig = {
      type: 'metric',
      title: 'Metric - Trendline with breakdown',
      data_source: {
        type: AS_CODE_DATA_VIEW_SPEC_TYPE,
        index_pattern: 'test-index',
        time_field: '@timestamp',
      },
      metrics: [
        {
          type: 'primary',
          operation: 'average',
          field: 'system.cpu',
          background_chart: { type: 'trend' },
        },
        {
          type: 'secondary',
          operation: 'average',
          field: 'bytes',
        },
      ],
      breakdown_by: {
        operation: 'terms',
        fields: ['host.name'],
        limit: 3,
        columns: 3,
        rank_by: { type: 'metric', metric_index: 0, direction: 'desc' },
      },
      sampling: 1,
      ignore_global_filters: false,
    } satisfies MetricConfig;

    const getTermsColumn = (
      lensState: ReturnType<LensConfigBuilder['fromAPIFormat']>,
      layerId: string,
      columnId: string
    ): TermsIndexPatternColumn => {
      const formBased = lensState.state.datasourceStates.formBased;
      if (!formBased) {
        throw new Error('expected a form-based datasource state');
      }
      return formBased.layers[layerId].columns[columnId] as TermsIndexPatternColumn;
    };

    it(`orders the trendline layer breakdown by the trendline layer's own metric column (rank_by primary)`, () => {
      const builder = new LensConfigBuilder(undefined, true);
      const lensState = builder.fromAPIFormat(trendlineBreakdownConfig);

      // The main layer breakdown orders by the main metric column.
      expect(
        getTermsColumn(lensState, DEFAULT_LAYER_ID, 'metric_accessor_breakdown').params.orderBy
      ).toEqual({ type: 'column', columnId: 'metric_accessor_metric' });

      // The trendline layer breakdown must order by the trendline layer's own metric column,
      // otherwise the runtime terms agg silently falls back to `_key` (alphabetical) ordering.
      const trendlineBreakdown = getTermsColumn(
        lensState,
        TRENDLINE_LAYER_ID,
        'metric_accessor_breakdown_trendline'
      );
      expect(trendlineBreakdown.params.orderBy).toEqual({
        type: 'column',
        columnId: 'metric_accessor_trendline',
      });

      // The referenced column must actually exist in the trendline layer.
      const trendlineLayer = lensState.state.datasourceStates.formBased!.layers[TRENDLINE_LAYER_ID];
      expect(trendlineLayer.columns).toHaveProperty('metric_accessor_trendline');
    });

    it('orders the trendline layer breakdown by the trendline secondary column (rank_by secondary)', () => {
      const config = {
        ...trendlineBreakdownConfig,
        breakdown_by: {
          ...trendlineBreakdownConfig.breakdown_by,
          rank_by: { type: 'metric', metric_index: 1, direction: 'desc' },
        },
      } satisfies MetricConfig;

      const builder = new LensConfigBuilder(undefined, true);
      const lensState = builder.fromAPIFormat(config);

      const trendlineBreakdown = getTermsColumn(
        lensState,
        TRENDLINE_LAYER_ID,
        'metric_accessor_breakdown_trendline'
      );
      expect(trendlineBreakdown.params.orderBy).toEqual({
        type: 'column',
        columnId: 'metric_accessor_secondary_trendlineX0',
      });

      const trendlineLayer = lensState.state.datasourceStates.formBased!.layers[TRENDLINE_LAYER_ID];
      expect(trendlineLayer.columns).toHaveProperty('metric_accessor_secondary_trendlineX0');
    });
  });

  describe('default application', () => {
    it('should emit AUTO_COLOR for primary metric when no color is specified', () => {
      const builder = new LensConfigBuilder();
      const lensState = builder.fromAPIFormat(baseMetric);
      const apiOutput = builder.toAPIFormat(lensState) as MetricConfig;

      expect(apiOutput.metrics[0].color).toEqual(AUTO_COLOR);
    });

    it('should emit NO_COLOR for secondary metric when no color is specified', () => {
      const config = {
        ...baseMetric,
        metrics: [
          ...baseMetric.metrics,
          {
            type: 'secondary',
            operation: 'average',
            field: 'bytes',
          },
        ],
      } satisfies MetricConfig;

      const builder = new LensConfigBuilder();
      const lensState = builder.fromAPIFormat(config);
      const apiOutput = builder.toAPIFormat(lensState) as MetricConfig;

      expect(apiOutput.metrics[0].color).toEqual(AUTO_COLOR);
      expect(apiOutput.metrics[1].color).toEqual(NO_COLOR);
    });

    it('should emit default density when no density is specified', () => {
      const builder = new LensConfigBuilder();
      const lensState = builder.fromAPIFormat(baseMetric);
      const apiOutput = builder.toAPIFormat(lensState) as MetricConfig;
      const visualization = lensState.state.visualization as MetricVisualizationState;

      expect(visualization.density).toBe('default');
      expect(apiOutput.styling?.density).toBe('default');
    });
  });

  describe('secondary metric name visibility', () => {
    const getConfigWithSecondaryLabel = (
      label?: NonNullable<NonNullable<MetricConfig['styling']>['secondary']>['label']
    ) =>
      ({
        ...baseMetric,
        metrics: [
          ...baseMetric.metrics,
          {
            type: 'secondary',
            operation: 'average',
            field: 'bytes',
          },
        ],
        ...(label ? { styling: { secondary: { label } } } : {}),
      } satisfies MetricConfig);

    const convert = (config: MetricConfig) => {
      const builder = new LensConfigBuilder();
      const lensState = builder.fromAPIFormat(config);
      return {
        visualization: lensState.state.visualization as MetricVisualizationState,
        apiOutput: builder.toAPIFormat(lensState) as MetricConfig,
      };
    };

    it('should hide the name when no label visibility is specified', () => {
      const { visualization, apiOutput } = convert(getConfigWithSecondaryLabel());

      expect(visualization.secondaryNameVisibility).toBe('hidden');
      expect(apiOutput.styling?.secondary?.label).toEqual({ visible: false });
    });

    it('should hide the name when the label is explicitly not visible', () => {
      const { visualization, apiOutput } = convert(
        getConfigWithSecondaryLabel({ visible: false, placement: 'after' })
      );

      expect(visualization.secondaryNameVisibility).toBe('hidden');
      expect(apiOutput.styling?.secondary?.label).toEqual({ visible: false });
    });

    it.each(['before', 'after'] as const)(
      'should place a visible name %s the value',
      (placement) => {
        const { visualization, apiOutput } = convert(
          getConfigWithSecondaryLabel({ visible: true, placement })
        );

        expect(visualization.secondaryNameVisibility).toBe(placement);
        expect(apiOutput.styling?.secondary?.label).toEqual({ visible: true, placement });
      }
    );

    it('should default a visible name to before the value', () => {
      const { visualization } = convert(getConfigWithSecondaryLabel({ visible: true }));

      expect(visualization.secondaryNameVisibility).toBe('before');
    });
  });

  describe('legacy secondaryLabel on API round-trip', () => {
    const LEGACY_LABEL = 'Custom Name (label)';

    const getLegacyAttributes = () => {
      const attributes = structuredClone(complexMetricAttributes);
      const visualization = attributes.state.visualization as MetricVisualizationState;
      visualization.secondaryLabel = LEGACY_LABEL;
      const layer = attributes.state.datasourceStates.formBased!.layers[visualization.layerId];
      const column = layer.columns[visualization.secondaryMetricAccessor!];
      column.label = 'Custom Name';
      column.customLabel = true;
      return attributes;
    };

    it('emits leftover vis secondaryLabel as the secondary metric label', () => {
      const builder = new LensConfigBuilder(undefined, true);
      const api = builder.toAPIFormat(getLegacyAttributes()) as MetricConfig;
      const secondary = api.metrics.find((metric) => metric.type === 'secondary');

      expect(secondary?.label).toBe(LEGACY_LABEL);
    });

    it('writes leftover vis secondaryLabel onto the column and drops it from visualization', () => {
      const builder = new LensConfigBuilder(undefined, true);
      const so = builder.fromAPIFormat(builder.toAPIFormat(getLegacyAttributes()));
      const visualization = so.state.visualization as MetricVisualizationState;
      const column =
        so.state.datasourceStates.formBased!.layers[DEFAULT_LAYER_ID].columns
          .metric_accessor_secondary;

      expect(visualization).not.toHaveProperty('secondaryLabel');
      expect(column.label).toBe(LEGACY_LABEL);
      expect(column.customLabel).toBe(true);
    });

    it('does not overlay an empty leftover secondaryLabel', () => {
      const attributes = getLegacyAttributes();
      (attributes.state.visualization as MetricVisualizationState).secondaryLabel = '';
      const builder = new LensConfigBuilder(undefined, true);
      const api = builder.toAPIFormat(attributes) as MetricConfig;
      const secondary = api.metrics.find((metric) => metric.type === 'secondary');

      expect(secondary?.label).toBe('Custom Name');
    });
  });

  describe('color by value named palette', () => {
    it('(API -> SO -> API) round-trips a named palette on a single-value metric as a numeric range', () => {
      const config = {
        ...baseMetric,
        metrics: [
          {
            type: 'primary',
            operation: 'count',
            empty_as_null: false,
            color: {
              type: 'distributed_palette',
              palette: 'status',
            },
          },
        ],
      } satisfies MetricConfig;

      const builder = new LensConfigBuilder();
      const lensState = builder.fromAPIFormat(config);
      const viz = lensState.state.visualization as MetricVisualizationState;
      const apiOutput = builder.toAPIFormat(lensState) as MetricConfig;

      expect(viz.palette?.params?.rangeType).toBe('number');
      expect(viz.palette?.params?.continuity).toBe('all');
      expect(apiOutput.metrics[0].color).toEqual(config.metrics[0].color);
    });

    it('(API -> SO -> API) round-trips a named palette on a breakdown metric as a percentage range', () => {
      const config = {
        ...breakdownMetricAPIAttributes,
        metrics: [
          {
            type: 'primary',
            operation: 'count',
            empty_as_null: true,
            color: {
              type: 'distributed_palette',
              palette: 'temperature',
            },
          },
        ],
      } satisfies MetricConfig;

      const builder = new LensConfigBuilder();
      const lensState = builder.fromAPIFormat(config);
      const viz = lensState.state.visualization as MetricVisualizationState;
      const apiOutput = builder.toAPIFormat(lensState) as MetricConfig;

      expect(viz.palette?.params?.rangeType).toBe('percent');
      expect(apiOutput.metrics[0].color).toEqual(config.metrics[0].color);
    });

    it('(SO -> API -> SO) keeps the numeric range of a single-value named palette ', () => {
      const builder = new LensConfigBuilder();
      const api = builder.toAPIFormat(defaultColorByValueAttributes);
      const so = builder.fromAPIFormat(api);
      const viz = so.state.visualization as MetricVisualizationState;

      expect(viz.palette?.params?.rangeType).toBe('number');
      // A distributed palette always opens both bounds so out-of-range values stay colored
      expect(viz.palette?.params?.continuity).toBe('all');
      expect(viz.palette?.params?.steps).toBe(3);
      expect(viz.palette?.params?.stops).toBeUndefined();
      expect(viz.palette?.params?.colorStops).toBeUndefined();
    });

    it('(SO -> API -> SO) reconstructs a percentage range for a breakdown named palette even when the SO stored a numeric range', () => {
      // Breakdown shape reconstructs as `percent`, so a stored `number` range is intentionally contradictory.
      const attributes = structuredClone(breakdownMetricAttributes);
      const inViz = attributes.state.visualization as MetricVisualizationState;
      inViz.palette = {
        type: 'palette',
        name: 'status',
        params: {
          name: 'status',
          reverse: false,
          rangeType: 'number',
          // @ts-expect-error - null is allowed for rangeMin and rangeMax
          rangeMin: null,
          // @ts-expect-error - null is allowed for rangeMin and rangeMax
          rangeMax: null,
          progression: 'fixed',
          // correct stops
          stops: [
            {
              color: '#24c292',
              stop: 1548.66,
            },
            {
              color: '#fcd883',
              stop: 3097.33,
            },
            {
              color: '#f6726a',
              stop: 4646,
            },
          ],
          steps: 3,
          colorStops: [],
          continuity: 'all',
          maxSteps: 5,
        },
      };

      const builder = new LensConfigBuilder();
      const api = builder.toAPIFormat(attributes);
      const so = builder.fromAPIFormat(api);
      const outViz = so.state.visualization as MetricVisualizationState;

      expect(outViz.palette?.params?.rangeType).toBe('percent');
      expect(outViz.palette?.params?.steps).toBe(3);
      // A distributed palette always opens both bounds so out-of-range values stay colored
      expect(outViz.palette?.params?.continuity).toBe('all');
      expect(outViz.palette?.params?.stops).toBeUndefined();
      expect(outViz.palette?.params?.colorStops).toBeUndefined();
    });
  });

  describe('ES|QL Control Variable', () => {
    const builder = new LensConfigBuilder(undefined, true);
    const esqlControlMetric = {
      type: 'metric',
      title: 'Identifier Control variable',
      data_source: {
        type: 'esql',
        query: 'FROM logs | STATS count = COUNT(*) BY ??field',
      },
      metrics: [{ type: 'primary', column: 'count' }],
      breakdown_by: { column: '??field', columns: 3 },
      sampling: 1,
      ignore_global_filters: true,
    } satisfies MetricConfig;

    const getColumnByFieldName = (
      attributes: ReturnType<LensConfigBuilder['fromAPIFormat']>,
      fieldName: string
    ) =>
      Object.values(attributes.state.datasourceStates.textBased?.layers ?? {})
        .flatMap((layer) => layer.columns)
        .find((column) => column.fieldName === fieldName);

    it('(SO -> API -> SO) preserves `variable`', () => {
      const original = builder.fromAPIFormat(esqlControlMetric);
      expect(getColumnByFieldName(original, '??field')?.variable).toBe('field');

      const api = builder.toAPIFormat(original) as MetricConfig;
      const so = builder.fromAPIFormat(api);
      expect(getColumnByFieldName(so, '??field')?.variable).toBe('field');
    });

    it('(SO -> API -> SO) does not stamp `variable` for a Value (`?`) control', () => {
      const original = builder.fromAPIFormat({
        ...esqlControlMetric,
        title: 'Value Control variable',
        data_source: {
          ...esqlControlMetric.data_source,
          query: 'FROM logs | STATS count = COUNT(*) BY ??field, ?os',
        },
        breakdown_by: { ...esqlControlMetric.breakdown_by, column: '?os' },
      } satisfies MetricConfig);
      expect(getColumnByFieldName(original, '?os')?.variable).toBeUndefined();

      const api = builder.toAPIFormat(original) as MetricConfig;
      const so = builder.fromAPIFormat(api);

      expect(getColumnByFieldName(so, '?os')?.variable).toBeUndefined();
    });
  });
});
