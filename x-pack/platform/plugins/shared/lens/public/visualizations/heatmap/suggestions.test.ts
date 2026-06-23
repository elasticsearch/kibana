/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Position } from '@elastic/charts';
import { IconChartHeatmap } from '@kbn/chart-icons';
import { LayerTypes } from '@kbn/expression-xy-plugin/public';
import { getSuggestions } from './suggestions';
import type { HeatmapVisualizationState } from './types';
import { HEATMAP_GRID_FUNCTION, LEGEND_FUNCTION } from './constants';

describe('heatmap suggestions', () => {
  describe('rejects suggestions', () => {
    test('when currently active and unchanged data', () => {
      expect(
        getSuggestions({
          table: {
            layerId: 'first',
            isMultiRow: true,
            columns: [],
            changeType: 'unchanged',
          },
          state: {
            shape: 'heatmap',
            layerId: 'first',
            layerType: LayerTypes.DATA,
          } as HeatmapVisualizationState,
          keptLayerIds: ['first'],
        })
      ).toHaveLength(0);
    });

    test('when metric value isStaticValue', () => {
      expect(
        getSuggestions({
          table: {
            layerId: 'first',
            isMultiRow: true,
            columns: [
              {
                columnId: 'date-column',
                operation: {
                  isBucketed: true,
                  dataType: 'date',
                  scale: 'interval',
                  label: 'Date',
                },
              },
              {
                columnId: 'metric-column',
                operation: {
                  isBucketed: false,
                  dataType: 'number',
                  scale: 'ratio',
                  label: 'Metric',
                  isStaticValue: true,
                },
              },
              {
                columnId: 'group-column',
                operation: {
                  isBucketed: true,
                  dataType: 'string',
                  scale: 'ratio',
                  label: 'Group',
                },
              },
            ],
            changeType: 'initial',
          },
          state: {
            layerId: 'first',
            layerType: LayerTypes.DATA,
          } as HeatmapVisualizationState,
          keptLayerIds: ['first'],
        })
      ).toEqual([]);
    });

    test('when there is more than 1 metric', () => {
      expect(
        getSuggestions({
          table: {
            layerId: 'first',
            isMultiRow: true,
            columns: [
              {
                columnId: 'date-column',
                operation: {
                  isBucketed: true,
                  dataType: 'date',
                  scale: 'interval',
                  label: 'Date',
                },
              },
              {
                columnId: 'metric-column-1',
                operation: {
                  isBucketed: false,
                  dataType: 'number',
                  scale: 'ratio',
                  label: 'Metric 1',
                },
              },
              {
                columnId: 'metric-column-2',
                operation: {
                  isBucketed: false,
                  dataType: 'number',
                  scale: 'ratio',
                  label: 'Metric 2',
                },
              },
            ],
            changeType: 'initial',
          },
          state: {
            layerId: 'first',
            layerType: LayerTypes.DATA,
          } as HeatmapVisualizationState,
          keptLayerIds: ['first'],
        })
      ).toEqual([]);
    });

    test('when there are 3 or more buckets', () => {
      expect(
        getSuggestions({
          table: {
            layerId: 'first',
            isMultiRow: true,
            columns: [
              {
                columnId: 'date-column-01',
                operation: {
                  isBucketed: true,
                  dataType: 'date',
                  scale: 'interval',
                  label: 'Date',
                },
              },
              {
                columnId: 'date-column-02',
                operation: {
                  isBucketed: true,
                  dataType: 'date',
                  scale: 'interval',
                  label: 'Date',
                },
              },
              {
                columnId: 'another-bucket-column',
                operation: {
                  isBucketed: true,
                  dataType: 'string',
                  scale: 'ratio',
                  label: 'Bucket',
                },
              },
              {
                columnId: 'metric-column',
                operation: {
                  isBucketed: false,
                  dataType: 'number',
                  scale: 'ratio',
                  label: 'Metric',
                },
              },
            ],
            changeType: 'initial',
          },
          state: {
            layerId: 'first',
            layerType: LayerTypes.DATA,
          } as HeatmapVisualizationState,
          keptLayerIds: ['first'],
        })
      ).toEqual([]);
    });

    test('when currently active with partial configuration and not extended change type', () => {
      expect(
        getSuggestions({
          table: {
            layerId: 'first',
            isMultiRow: true,
            columns: [
              {
                columnId: 'date-column-01',
                operation: {
                  isBucketed: true,
                  dataType: 'date',
                  scale: 'interval',
                  label: 'Date',
                },
              },
              {
                columnId: 'another-bucket-column',
                operation: {
                  isBucketed: true,
                  dataType: 'string',
                  scale: 'ratio',
                  label: 'Bucket',
                },
              },
              {
                columnId: 'metric-column',
                operation: {
                  isBucketed: false,
                  dataType: 'number',
                  scale: 'ratio',
                  label: 'Metric',
                },
              },
            ],
            changeType: 'initial',
          },
          state: {
            shape: 'heatmap',
            layerId: 'first',
            layerType: LayerTypes.DATA,
            xAccessor: 'some-field',
          } as HeatmapVisualizationState,
          keptLayerIds: ['first'],
        })
      ).toHaveLength(0);
    });
  });

  describe('hides suggestions', () => {
    test('when table is reduced', () => {
      expect(
        getSuggestions({
          table: {
            layerId: 'first',
            isMultiRow: true,
            columns: [
              {
                columnId: 'date-column-01',
                operation: {
                  isBucketed: true,
                  dataType: 'date',
                  scale: 'interval',
                  label: 'Date',
                },
              },
              {
                columnId: 'another-bucket-column',
                operation: {
                  isBucketed: true,
                  dataType: 'string',
                  scale: 'ratio',
                  label: 'Bucket',
                },
              },
              {
                columnId: 'metric-column',
                operation: {
                  isBucketed: false,
                  dataType: 'number',
                  scale: 'ratio',
                  label: 'Metric',
                },
              },
            ],
            changeType: 'reduced',
          },
          state: {
            layerId: 'first',
            layerType: LayerTypes.DATA,
          } as HeatmapVisualizationState,
          keptLayerIds: ['first'],
        })
      ).toEqual([
        {
          state: {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            shape: 'heatmap',
            valueAccessor: 'metric-column',
            xAccessor: 'date-column-01',
            yAccessor: 'another-bucket-column',
            gridConfig: {
              type: HEATMAP_GRID_FUNCTION,
              isCellLabelVisible: false,
              isYAxisLabelVisible: true,
              isXAxisLabelVisible: true,
              isYAxisTitleVisible: false,
              isXAxisTitleVisible: false,
            },
            legend: {
              isVisible: true,
              position: Position.Right,
              type: LEGEND_FUNCTION,
            },
          },
          title: 'Heat map',
          hide: true,
          incomplete: false,
          previewIcon: IconChartHeatmap,
          score: 0.3,
        },
      ]);
    });

    test('when no metric dimension but groups', () => {
      expect(
        getSuggestions({
          table: {
            layerId: 'first',
            isMultiRow: true,
            columns: [
              {
                columnId: 'date-column',
                operation: {
                  isBucketed: true,
                  dataType: 'date',
                  scale: 'interval',
                  label: 'Date',
                },
              },
              {
                columnId: 'string-column-01',
                operation: {
                  isBucketed: true,
                  dataType: 'string',
                  label: 'Bucket 1',
                },
              },
            ],
            changeType: 'initial',
          },
          state: {
            layerId: 'first',
            layerType: LayerTypes.DATA,
          } as HeatmapVisualizationState,
          keptLayerIds: ['first'],
        })
      ).toEqual([
        {
          state: {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            shape: 'heatmap',
            xAccessor: 'date-column',
            yAccessor: 'string-column-01',
            gridConfig: {
              type: HEATMAP_GRID_FUNCTION,
              isCellLabelVisible: false,
              isYAxisLabelVisible: true,
              isXAxisLabelVisible: true,
              isYAxisTitleVisible: false,
              isXAxisTitleVisible: false,
            },
            legend: {
              isVisible: true,
              position: Position.Right,
              type: LEGEND_FUNCTION,
            },
          },
          title: 'Heat map',
          hide: true,
          incomplete: true,
          previewIcon: IconChartHeatmap,
          score: 0,
        },
      ]);
    });
    test('for tables with a single bucket dimension', () => {
      expect(
        getSuggestions({
          table: {
            layerId: 'first',
            isMultiRow: true,
            columns: [
              {
                columnId: 'test-column',
                operation: {
                  isBucketed: true,
                  dataType: 'date',
                  scale: 'interval',
                  label: 'Date',
                },
              },
            ],
            changeType: 'reduced',
          },
          state: {
            layerId: 'first',
            layerType: LayerTypes.DATA,
          } as HeatmapVisualizationState,
          keptLayerIds: ['first'],
        })
      ).toEqual([
        {
          state: {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            shape: 'heatmap',
            xAccessor: 'test-column',
            gridConfig: {
              type: HEATMAP_GRID_FUNCTION,
              isCellLabelVisible: false,
              isYAxisLabelVisible: true,
              isXAxisLabelVisible: true,
              isYAxisTitleVisible: false,
              isXAxisTitleVisible: false,
            },
            legend: {
              isVisible: true,
              position: Position.Right,
              type: LEGEND_FUNCTION,
            },
          },
          title: 'Heat map',
          hide: true,
          incomplete: true,
          previewIcon: IconChartHeatmap,
          score: 0,
        },
      ]);
    });

    test('for tables with a single metric dimension', () => {
      expect(
        getSuggestions({
          table: {
            layerId: 'first',
            isMultiRow: true,
            columns: [
              {
                columnId: 'test-column',
                operation: {
                  isBucketed: false,
                  dataType: 'number',
                  label: 'Count of records',
                },
              },
            ],
            changeType: 'reduced',
          },
          state: {
            layerId: 'first',
            layerType: LayerTypes.DATA,
          } as HeatmapVisualizationState,
          keptLayerIds: ['first'],
        })
      ).toEqual([
        {
          state: {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            shape: 'heatmap',
            valueAccessor: 'test-column',
            gridConfig: {
              type: HEATMAP_GRID_FUNCTION,
              isCellLabelVisible: false,
              isYAxisLabelVisible: true,
              isXAxisLabelVisible: true,
              isYAxisTitleVisible: false,
              isXAxisTitleVisible: false,
            },
            legend: {
              isVisible: true,
              position: Position.Right,
              type: LEGEND_FUNCTION,
            },
          },
          title: 'Heat map',
          hide: true,
          incomplete: true,
          previewIcon: IconChartHeatmap,
          score: 0.3,
        },
      ]);
    });

    test('when at least one axis has a date histogram', () => {
      expect(
        getSuggestions({
          table: {
            layerId: 'first',
            isMultiRow: true,
            columns: [
              {
                columnId: 'date-column',
                operation: {
                  isBucketed: true,
                  dataType: 'date',
                  scale: 'interval',
                  label: 'Date',
                },
              },
              {
                columnId: 'metric-column',
                operation: {
                  isBucketed: false,
                  dataType: 'number',
                  scale: 'ratio',
                  label: 'Metric',
                },
              },
            ],
            changeType: 'initial',
          },
          state: {
            layerId: 'first',
            layerType: LayerTypes.DATA,
          } as HeatmapVisualizationState,
          keptLayerIds: ['first'],
        })
      ).toEqual([
        {
          state: {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            shape: 'heatmap',
            xAccessor: 'date-column',
            valueAccessor: 'metric-column',
            gridConfig: {
              type: HEATMAP_GRID_FUNCTION,
              isCellLabelVisible: false,
              isYAxisLabelVisible: true,
              isXAxisLabelVisible: true,
              isYAxisTitleVisible: false,
              isXAxisTitleVisible: false,
            },
            legend: {
              isVisible: true,
              position: Position.Right,
              type: LEGEND_FUNCTION,
            },
          },
          title: 'Heat map',
          hide: true,
          incomplete: false,
          previewIcon: IconChartHeatmap,
          score: 0.3,
        },
      ]);
    });
  });

  describe('shows suggestions', () => {
    test('when at least one axis and value accessor are available', () => {
      expect(
        getSuggestions({
          table: {
            layerId: 'first',
            isMultiRow: true,
            columns: [
              {
                columnId: 'number-column',
                operation: {
                  isBucketed: true,
                  dataType: 'number',
                  scale: 'interval',
                  label: 'AvgTicketPrice',
                },
              },
              {
                columnId: 'metric-column',
                operation: {
                  isBucketed: false,
                  dataType: 'number',
                  scale: 'ratio',
                  label: 'Metric',
                },
              },
            ],
            changeType: 'initial',
          },
          state: {
            layerId: 'first',
            layerType: LayerTypes.DATA,
          } as HeatmapVisualizationState,
          keptLayerIds: ['first'],
        })
      ).toEqual([
        {
          state: {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            shape: 'heatmap',
            xAccessor: 'number-column',
            valueAccessor: 'metric-column',
            gridConfig: {
              type: HEATMAP_GRID_FUNCTION,
              isCellLabelVisible: false,
              isYAxisLabelVisible: true,
              isXAxisLabelVisible: true,
              isYAxisTitleVisible: false,
              isXAxisTitleVisible: false,
            },
            legend: {
              isVisible: true,
              position: Position.Right,
              type: LEGEND_FUNCTION,
            },
          },
          title: 'Heat map',
          hide: false,
          incomplete: false,
          previewIcon: IconChartHeatmap,
          score: 0.6,
        },
      ]);
    });

    test('when there is a date histogram and a second bucket dimension', () => {
      expect(
        getSuggestions({
          table: {
            layerId: 'first',
            isMultiRow: true,
            columns: [
              {
                columnId: 'number-column',
                operation: {
                  isBucketed: true,
                  dataType: 'number',
                  scale: 'interval',
                  label: 'AvgTicketPrice',
                },
              },
              {
                columnId: 'date-column',
                operation: {
                  isBucketed: true,
                  dataType: 'date',
                  scale: 'interval',
                  label: 'Date',
                },
              },
              {
                columnId: 'metric-column',
                operation: {
                  isBucketed: false,
                  dataType: 'number',
                  scale: 'ratio',
                  label: 'Metric',
                },
              },
            ],
            changeType: 'initial',
          },
          state: {
            layerId: 'first',
            layerType: LayerTypes.DATA,
          } as HeatmapVisualizationState,
          keptLayerIds: ['first'],
        })
      ).toEqual([
        {
          state: {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            shape: 'heatmap',
            yAccessor: 'date-column',
            xAccessor: 'number-column',
            valueAccessor: 'metric-column',
            gridConfig: {
              type: HEATMAP_GRID_FUNCTION,
              isCellLabelVisible: false,
              isYAxisLabelVisible: true,
              isXAxisLabelVisible: true,
              isYAxisTitleVisible: false,
              isXAxisTitleVisible: false,
            },
            legend: {
              isVisible: true,
              position: Position.Right,
              type: LEGEND_FUNCTION,
            },
          },
          title: 'Heat map',
          hide: false,
          incomplete: false,
          previewIcon: IconChartHeatmap,
          score: 0.3,
        },
      ]);
    });

    test('when complete configuration has been resolved', () => {
      expect(
        getSuggestions({
          table: {
            layerId: 'first',
            isMultiRow: true,
            columns: [
              {
                columnId: 'number-column',
                operation: {
                  isBucketed: true,
                  dataType: 'number',
                  scale: 'interval',
                  label: 'AvgTicketPrice',
                },
              },
              {
                columnId: 'metric-column',
                operation: {
                  isBucketed: false,
                  dataType: 'number',
                  scale: 'ratio',
                  label: 'Metric',
                },
              },
              {
                columnId: 'group-column',
                operation: {
                  isBucketed: true,
                  dataType: 'string',
                  scale: 'ratio',
                  label: 'Group',
                },
              },
            ],
            changeType: 'initial',
          },
          state: {
            layerId: 'first',
            layerType: LayerTypes.DATA,
          } as HeatmapVisualizationState,
          keptLayerIds: ['first'],
        })
      ).toEqual([
        {
          state: {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            shape: 'heatmap',
            xAccessor: 'number-column',
            yAccessor: 'group-column',
            valueAccessor: 'metric-column',
            gridConfig: {
              type: HEATMAP_GRID_FUNCTION,
              isCellLabelVisible: false,
              isYAxisLabelVisible: true,
              isXAxisLabelVisible: true,
              isYAxisTitleVisible: false,
              isXAxisTitleVisible: false,
            },
            legend: {
              isVisible: true,
              position: Position.Right,
              type: LEGEND_FUNCTION,
            },
          },
          title: 'Heat map',
          hide: false,
          incomplete: false,
          previewIcon: IconChartHeatmap,
          score: 0.9,
        },
      ]);
    });

    test('when Y axis is numeric, sets ySortPredicate to descending', () => {
      expect(
        getSuggestions({
          table: {
            layerId: 'first',
            isMultiRow: true,
            columns: [
              {
                columnId: 'date-column',
                operation: {
                  isBucketed: true,
                  dataType: 'date',
                  scale: 'interval',
                  label: 'Date',
                },
              },
              {
                columnId: 'number-bucket-column',
                operation: {
                  isBucketed: true,
                  dataType: 'number',
                  scale: 'interval',
                  label: 'Price range',
                },
              },
              {
                columnId: 'metric-column',
                operation: {
                  isBucketed: false,
                  dataType: 'number',
                  scale: 'ratio',
                  label: 'Count',
                },
              },
            ],
            changeType: 'initial',
          },
          state: {
            layerId: 'first',
            layerType: LayerTypes.DATA,
          } as HeatmapVisualizationState,
          keptLayerIds: ['first'],
        })
      ).toEqual([
        {
          state: {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            shape: 'heatmap',
            xAccessor: 'date-column',
            yAccessor: 'number-bucket-column',
            valueAccessor: 'metric-column',
            gridConfig: {
              type: HEATMAP_GRID_FUNCTION,
              isCellLabelVisible: false,
              isYAxisLabelVisible: true,
              isXAxisLabelVisible: true,
              isYAxisTitleVisible: false,
              isXAxisTitleVisible: false,
              ySortPredicate: 'desc',
            },
            legend: {
              isVisible: true,
              position: Position.Right,
              type: LEGEND_FUNCTION,
            },
          },
          title: 'Heat map',
          hide: false,
          incomplete: false,
          previewIcon: IconChartHeatmap,
          score: 0.3,
        },
      ]);
    });

    test('when Y axis is a string, does not set ySortPredicate', () => {
      const result = getSuggestions({
        table: {
          layerId: 'first',
          isMultiRow: true,
          columns: [
            {
              columnId: 'date-column',
              operation: {
                isBucketed: true,
                dataType: 'date',
                scale: 'interval',
                label: 'Date',
              },
            },
            {
              columnId: 'string-bucket-column',
              operation: {
                isBucketed: true,
                dataType: 'string',
                scale: 'ratio',
                label: 'Region',
              },
            },
            {
              columnId: 'metric-column',
              operation: {
                isBucketed: false,
                dataType: 'number',
                scale: 'ratio',
                label: 'Count',
              },
            },
          ],
          changeType: 'initial',
        },
        state: {
          layerId: 'first',
          layerType: LayerTypes.DATA,
        } as HeatmapVisualizationState,
        keptLayerIds: ['first'],
      });

      expect(result).toHaveLength(1);
      expect(result[0].state.gridConfig).not.toHaveProperty('ySortPredicate');
    });
  });
});
