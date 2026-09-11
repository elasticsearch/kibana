/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { XYVisualizationState } from '@kbn/lens-common';
import type { XYConfig, XYConfigNoESQL } from '../../schema/charts/xy';
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
import { annotationXY, byRefAnnotationXY, runtimeByRefAnnotationXY } from './annotations.mock';
import {
  esqlChart,
  esqlChartWithBreakdownColorMapping,
  esqlChartWithManualAnnotationLayer,
  esqlChartWithReferenceLineLayer,
  esqlXYWithCollapseByBreakdown,
} from './esqlXY.mock';
import {
  AS_CODE_DATA_VIEW_REFERENCE_TYPE,
  AS_CODE_DATA_VIEW_SPEC_TYPE,
} from '@kbn/as-code-data-views-schema';
import { DEFAULT_LINE_CATEGORICAL_COLOR_MAPPING } from '../../transforms/charts/xy/defaults';
import { xyConfigSchema } from '../../schema/charts/xy';

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

type AnnotationApiLayer = Extract<XYConfigNoESQL['layers'][number], { type: 'annotations' }>;

// Builds an XY API config whose annotation layer points at the given
// data_source. Reuses annotationXY so every defaulted field is present and only
// the annotation layer's data_source is swapped.
function withAnnotationDataSource(
  builder: LensConfigBuilder,
  dataSource: AnnotationApiLayer['data_source']
): XYConfigNoESQL {
  const api = builder.toAPIFormat(annotationXY) as XYConfigNoESQL;
  return {
    ...api,
    layers: api.layers.map((layer) =>
      layer.type === 'annotations' ? { ...layer, data_source: dataSource } : layer
    ),
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

      // Regression test for https://github.com/elastic/kibana/issues/268820
      // Column/accessor ids must be unique across the whole document, not just
      // within a layer. Two layers of the same series type used to produce
      // colliding column ids (e.g. both `line_x`/`line_y_0`) on the
      // `fromAPIFormat` round trip, which corrupts multi-layer state and prevents
      // the suggestion engine from recognizing the layer/column shape (e.g. the
      // treemap suggestion no longer appears when transitioning a multi-layer
      // stacked bar chart).
      it('produces unique, layer-aligned column ids for a multi-layer chart after an API round trip', () => {
        const builder = new LensConfigBuilder(undefined, true);
        const api = builder.toAPIFormat(barWithTwoLayersAttributes);
        const lensState = builder.fromAPIFormat(api);

        const layers = lensState.state.datasourceStates.formBased?.layers ?? {};

        // Column ids must be globally unique across all layers.
        const allColumnIds = Object.values(layers).flatMap((layer) => Object.keys(layer.columns));
        expect(new Set(allColumnIds).size).toBe(allColumnIds.length);

        // Every visualization data-layer accessor must resolve to a column in its
        // own datasource layer.
        const visualizationLayers = (lensState.state.visualization as XYVisualizationState).layers;
        for (const vizLayer of visualizationLayers as Array<{
          layerId: string;
          layerType?: string;
          accessors?: string[];
          xAccessor?: string;
          splitAccessors?: string[];
        }>) {
          if (vizLayer.layerType && vizLayer.layerType !== 'data') {
            continue;
          }
          const layerColumns = layers[vizLayer.layerId]?.columns ?? {};
          for (const accessor of vizLayer.accessors ?? []) {
            expect(layerColumns).toHaveProperty(accessor);
          }
          if (vizLayer.xAccessor) {
            expect(layerColumns).toHaveProperty(vizLayer.xAccessor);
          }
          for (const splitAccessor of vizLayer.splitAccessors ?? []) {
            expect(layerColumns).toHaveProperty(splitAccessor);
          }
        }
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

      // Regression test for https://github.com/elastic/kibana/issues/268821
      // A by-value annotation layer must round-trip its data view reference under
      // the `xy-visualization-layer-` name, matching the layer id in the rebuilt
      // visualization state. If the reference is emitted with the generic
      // `indexpattern-datasource-layer-` prefix, the runtime cannot resolve the
      // annotation layer's data view and the panel fails to render.
      it('preserves resolvable data view references for a by-value annotation layer after an API round trip', () => {
        const builder = new LensConfigBuilder(undefined, true);
        const api = builder.toAPIFormat(annotationXY);
        const lensState = builder.fromAPIFormat(api);

        const referenceNames = new Set(lensState.references.map((ref) => ref.name));

        const visualizationLayers = (
          lensState.state.visualization as { layers: Array<Record<string, unknown>> }
        ).layers;
        for (const layer of visualizationLayers) {
          if (layer.layerType === 'annotations' && layer.persistanceType !== 'byReference') {
            expect(referenceNames.has(`xy-visualization-layer-${layer.layerId}`)).toBe(true);
          }
        }

        const formBasedLayerIds = Object.keys(
          lensState.state.datasourceStates.formBased?.layers ?? {}
        );
        for (const layerId of formBasedLayerIds) {
          expect(referenceNames.has(`indexpattern-datasource-layer-${layerId}`)).toBe(true);
        }
      });

      // Regression test for https://github.com/elastic/kibana/issues/268821
      // A by-value annotation layer made of manual (point/range) annotations does
      // not query an index, so the data view is not useful for it. Even when the
      // state still carries a `xy-visualization-layer-<layerId>` reference (e.g.
      // sample data / older saved objects), `toAPIFormat` should NOT emit a
      // `data_source` for a manual-only layer, and the round trip back to state
      // produces a persisted by-value layer (no `indexPatternId`) that relies on
      // the Lens XY runtime fallback.
      it('omits data_source for a manual-only annotation layer and persists it for the runtime fallback', () => {
        const manualAnnotationXY: LensAttributes = {
          ...annotationXY,
          state: {
            ...annotationXY.state,
            visualization: {
              ...(annotationXY.state.visualization as XYVisualizationState),
              layers: (annotationXY.state.visualization as XYVisualizationState).layers.map(
                (layer) =>
                  layer.layerType === 'annotations'
                    ? {
                        ...layer,
                        annotations: [
                          {
                            type: 'manual',
                            id: 'manual_event_0',
                            label: 'Event',
                            key: {
                              type: 'point_in_time',
                              timestamp: '2016-02-09T10:30:00.000Z',
                            },
                          },
                        ],
                      }
                    : layer
              ),
            },
          },
        } as LensAttributes;

        const builder = new LensConfigBuilder(undefined, true);

        expect(() => builder.toAPIFormat(manualAnnotationXY)).not.toThrow();

        const api = builder.toAPIFormat(manualAnnotationXY) as XYConfigNoESQL;
        const annotationLayer = api.layers.find((layer) => layer.type === 'annotations');

        // Manual-only annotation layer: no data view is emitted on the API layer,
        // even though the source state still has the `xy-visualization-layer-` ref.
        expect(annotationLayer).toBeDefined();
        expect(
          annotationLayer && 'data_source' in annotationLayer
            ? annotationLayer.data_source
            : undefined
        ).toBeUndefined();

        // Round trip back to state must produce a persisted by-value annotation
        // layer (no `indexPatternId`, no own reference). The Lens XY runtime then
        // injects the data view via the first-index-pattern fallback.
        const lensState = builder.fromAPIFormat(api);
        const referenceNames = new Set(lensState.references.map((ref) => ref.name));

        const visualizationLayers = (
          lensState.state.visualization as { layers: Array<Record<string, unknown>> }
        ).layers;
        const rebuiltAnnotationLayer = visualizationLayers.find(
          (layer) => layer.layerType === 'annotations'
        );

        expect(rebuiltAnnotationLayer).toBeDefined();
        expect(rebuiltAnnotationLayer).not.toHaveProperty('indexPatternId');
        expect(rebuiltAnnotationLayer?.persistanceType).toBe('byValue');
        expect(
          referenceNames.has(`xy-visualization-layer-${rebuiltAnnotationLayer?.layerId}`)
        ).toBe(false);
      });

      // A query annotation genuinely queries an index, so `toAPIFormat` must emit
      // its `data_source` (and `fromAPIFormat` must round-trip the reference).
      it('emits data_source for a query annotation layer', () => {
        const builder = new LensConfigBuilder(undefined, true);
        const api = builder.toAPIFormat(annotationXY) as XYConfigNoESQL;
        const annotationLayer = api.layers.find((layer) => layer.type === 'annotations');

        expect(
          annotationLayer && 'data_source' in annotationLayer
            ? annotationLayer.data_source
            : undefined
        ).toEqual(
          expect.objectContaining({
            type: AS_CODE_DATA_VIEW_REFERENCE_TYPE,
            ref_id: 'metrics-*',
          })
        );
      });

      // The inbound direction must reject a query annotation layer that arrives
      // without a data_source, since a query event cannot be represented without
      // an index to query.
      it('throws when a query annotation layer is missing its data_source', () => {
        const builder = new LensConfigBuilder(undefined, true);
        // annotationXY is a DSL chart, so narrow to the concrete (non-ES|QL)
        // config to keep the spread within a single union member.
        const api = builder.toAPIFormat(annotationXY) as XYConfigNoESQL;

        // Strip data_source from the annotation layer to simulate a query
        // annotation arriving without an index to query. data_source is optional
        // in the schema, so the resulting config is still a valid XYConfig.
        const apiWithoutAnnotationDataSource: XYConfigNoESQL = {
          ...api,
          layers: api.layers.map((layer) => {
            if (layer.type !== 'annotations') {
              return layer;
            }
            const { data_source: _, ...rest } = layer;
            return rest;
          }),
        };

        expect(() => builder.fromAPIFormat(apiWithoutAnnotationDataSource)).toThrow(
          'A data source is required for annotation layers with query events'
        );
      });

      // Regression test for https://github.com/elastic/kibana/issues/280977
      //
      // A query annotation layer that uses an inline (ad hoc) data view must
      // round-trip through state and back:
      //   - API -> state: the `xy-visualization-layer-<layerId>` reference lives in
      //     `state.internalReferences` (not the top-level `references`) and points
      //     at an ad hoc data view in `adHocDataViews`, matching Lens's own
      //     persistence so the runtime resolves the correct data view.
      //   - state -> API: the reference must be resolved from `internalReferences`
      //     and the inline `data_view_spec` re-emitted, instead of throwing
      //     "cannot find data view ID for annotation layer".
      it('round-trips an inline (ad hoc) data view for a query annotation layer', () => {
        const builder = new LensConfigBuilder(undefined, true);
        const apiConfig = withAnnotationDataSource(builder, {
          type: AS_CODE_DATA_VIEW_SPEC_TYPE,
          index_pattern: 'annotations-*',
          time_field: '@timestamp',
        });

        const lensState = builder.fromAPIFormat(apiConfig);

        const visualizationLayers = (
          lensState.state.visualization as { layers: Array<Record<string, unknown>> }
        ).layers;
        const annotationLayer = visualizationLayers.find(
          (layer) => layer.layerType === 'annotations'
        );
        expect(annotationLayer).toBeDefined();

        // Ad hoc data view references are stored in internalReferences, pointing at
        // an entry in adHocDataViews.
        const internalReferences = lensState.state.internalReferences ?? [];
        const annotationReference = internalReferences.find(
          (ref) => ref.name === `xy-visualization-layer-${annotationLayer?.layerId}`
        );
        expect(annotationReference).toBeDefined();
        expect(annotationReference?.type).toBe('index-pattern');

        const adHocDataViews = lensState.state.adHocDataViews ?? {};
        expect(annotationReference?.id).toBeDefined();
        expect(Object.keys(adHocDataViews)).toContain(annotationReference?.id);

        // Reading the state back to API must resolve the internalReferences entry
        // and re-emit the inline data view spec.
        const roundTripped = builder.toAPIFormat(lensState) as XYConfigNoESQL;
        const roundTrippedAnnotationLayer = roundTripped.layers.find(
          (layer) => layer.type === 'annotations'
        );
        expect(roundTrippedAnnotationLayer?.data_source).toEqual(
          expect.objectContaining({
            type: AS_CODE_DATA_VIEW_SPEC_TYPE,
            index_pattern: 'annotations-*',
            time_field: '@timestamp',
          })
        );
      });

      // Guards the by-reference (persisted data view) branch through the full
      // builder: a query annotation layer pointing at a persisted data view must
      // round-trip API -> state -> API as a `data_view_reference`, preserving the
      // referenced id rather than collapsing into an inline spec.
      it('round-trips a persisted data view reference for a query annotation layer', () => {
        const builder = new LensConfigBuilder(undefined, true);
        const apiConfig = withAnnotationDataSource(builder, {
          type: AS_CODE_DATA_VIEW_REFERENCE_TYPE,
          ref_id: 'metrics-*',
        });

        const lensState = builder.fromAPIFormat(apiConfig);
        const roundTripped = builder.toAPIFormat(lensState) as XYConfigNoESQL;
        const annotationLayer = roundTripped.layers.find((layer) => layer.type === 'annotations');

        expect(annotationLayer?.data_source).toEqual(
          expect.objectContaining({
            type: AS_CODE_DATA_VIEW_REFERENCE_TYPE,
            ref_id: 'metrics-*',
          })
        );
      });

      for (const type of ['bar', 'line', 'area'] as const) {
        it(`should validate a runtime by-reference annotation with a ${type} chart`, () => {
          validator.xy.fromState(setSeriesType(runtimeByRefAnnotationXY, type));
        });
      }

      it('emits annotation_group with group_id for a runtime by-reference annotation layer', () => {
        const builder = new LensConfigBuilder(undefined, true);
        const api = builder.toAPIFormat(runtimeByRefAnnotationXY) as XYConfig;
        const annotationLayer = api.layers.find((l) => l.type === 'annotation_group');

        expect(annotationLayer).toBeDefined();
        expect(annotationLayer).toEqual({
          type: 'annotation_group',
          group_id: 'my-runtime-annotation-group-id',
        });
      });

      it('does not emit inline annotations or data_source for a runtime by-reference annotation layer', () => {
        const builder = new LensConfigBuilder(undefined, true);
        const api = builder.toAPIFormat(runtimeByRefAnnotationXY) as XYConfig;
        const annotationLayer = api.layers.find((l) => l.type === 'annotation_group');

        expect(annotationLayer).toBeDefined();
        expect(annotationLayer).not.toHaveProperty('annotations');
        expect(annotationLayer).not.toHaveProperty('data_source');
        expect(annotationLayer).not.toHaveProperty('events');
      });

      it('round-trips a runtime by-reference annotation as a persisted by-reference layer', () => {
        const builder = new LensConfigBuilder(undefined, true);
        const api = builder.toAPIFormat(runtimeByRefAnnotationXY);
        const lensState = builder.fromAPIFormat(api);

        const visualizationLayers = (
          lensState.state.visualization as { layers: Array<Record<string, unknown>> }
        ).layers;
        const annotationLayer = visualizationLayers.find(
          (layer) => layer.layerType === 'annotations'
        );

        expect(annotationLayer).toBeDefined();
        expect(annotationLayer?.persistanceType).toBe('byReference');
        expect(annotationLayer).toHaveProperty('annotationGroupRef');
        expect(annotationLayer).not.toHaveProperty('indexPatternId');
        expect(annotationLayer).not.toHaveProperty('annotations');

        const matchingRef = lensState.references.find(
          (ref) => ref.name === annotationLayer?.annotationGroupRef
        );
        expect(matchingRef).toBeDefined();
        expect(matchingRef?.id).toBe('my-runtime-annotation-group-id');
        expect(matchingRef?.type).toBe('event-annotation-group');
      });
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

      it('should convert an ES|QL chart with a manual by-value annotation layer', () => {
        validator.xy.fromState(esqlChartWithManualAnnotationLayer);
      });

      it('should convert an ES|QL chart with a form-based reference line layer', () => {
        validator.xy.fromState(esqlChartWithReferenceLineLayer);
      });

      describe('ES|QL configs with annotation and reference line layers (API-first)', () => {
        const esqlDataLayer = {
          data_source: {
            type: 'esql' as const,
            query:
              'FROM kibana_sample_data_logs | STATS count = COUNT(*) BY buckets = BUCKET(3 hours, @timestamp)',
          },
          type: 'bar' as const,
          ignore_global_filters: false,
          sampling: 1,
          x: { column: 'buckets' },
          y: [{ column: 'count' }],
        };

        it('should accept a manual annotation layer alongside an ES|QL data layer', () => {
          validator.xy.fromApi({
            type: 'xy',
            title: 'ES|QL chart with manual annotation',
            layers: [
              esqlDataLayer,
              {
                type: 'annotations',
                ignore_global_filters: true,
                events: [
                  {
                    type: 'point',
                    label: 'Alert fired',
                    timestamp: '2026-07-15T14:00:00.000Z',
                  },
                ],
              },
            ],
          });
        });

        it('should accept a static value reference line layer alongside an ES|QL data layer', () => {
          validator.xy.fromApi({
            type: 'xy',
            title: 'ES|QL chart with static reference line',
            layers: [
              esqlDataLayer,
              {
                type: 'reference_lines',
                data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'logs-*' },
                ignore_global_filters: false,
                sampling: 1,
                thresholds: [
                  {
                    operation: 'static_value',
                    value: 200,
                    color: { type: 'static', color: '#e5281e' },
                  },
                ],
              },
            ],
          });
        });

        it('should reject query-based annotations on ES|QL charts', () => {
          const result = xyConfigSchema.safeParse({
            type: 'xy',
            title: 'ES|QL chart with query annotation',
            layers: [
              esqlDataLayer,
              {
                type: 'annotations',
                ignore_global_filters: false,
                data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'logs-*' },
                events: [
                  {
                    type: 'query',
                    query: { language: 'kuery', query: 'error: true' },
                    time_field: '@timestamp',
                  },
                ],
              },
            ],
          });
          expect(result.success).toBe(false);
        });

        it('should reject by-reference annotation groups on ES|QL charts', () => {
          const result = xyConfigSchema.safeParse({
            type: 'xy',
            title: 'ES|QL chart with by-ref annotation group',
            layers: [esqlDataLayer, { type: 'annotation_group', group_id: 'my-group' }],
          });
          expect(result.success).toBe(false);
        });

        it('should reject non-static reference line thresholds on ES|QL charts', () => {
          const result = xyConfigSchema.safeParse({
            type: 'xy',
            title: 'ES|QL chart with dynamic reference line',
            layers: [
              esqlDataLayer,
              {
                type: 'reference_lines',
                data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'logs-*' },
                ignore_global_filters: false,
                sampling: 1,
                thresholds: [{ operation: 'average', field: 'bytes' }],
              },
            ],
          });
          expect(result.success).toBe(false);
        });

        it('should reject ES|QL column-based reference line layers on ES|QL charts', () => {
          const result = xyConfigSchema.safeParse({
            type: 'xy',
            title: 'ES|QL chart with ES|QL reference line',
            layers: [
              esqlDataLayer,
              {
                type: 'reference_lines',
                data_source: { type: 'esql', query: 'FROM logs | STATS threshold = AVG(bytes)' },
                thresholds: [{ column: 'threshold' }],
              },
            ],
          });
          expect(result.success).toBe(false);
        });
      });

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

    it('should round-trip area fill styling', () => {
      validator.xy.fromApi({
        type: 'xy',
        title: 'Area fill test',
        styling: {
          areas: { fill: 'gradient', fill_opacity: 0.5 },
        },
        layers: [
          {
            data_source: { type: AS_CODE_DATA_VIEW_REFERENCE_TYPE, ref_id: 'myDataView' },
            type: 'area',
            ignore_global_filters: false,
            sampling: 1,
            y: [{ operation: 'count', empty_as_null: false }],
          },
        ],
      });
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

    it('should emit default categorical palette on breakdown_by for stacked area charts', () => {
      const config = {
        type: 'xy',
        title: 'Stacked area breakdown color default test',
        layers: [
          {
            data_source: {
              type: 'esql',
              query: 'FROM logs | STATS count = count() BY product',
            },
            type: 'area_stacked',
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
  });
});
