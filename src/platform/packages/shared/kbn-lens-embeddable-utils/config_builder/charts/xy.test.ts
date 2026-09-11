/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { buildXY } from './xy';
import { mockDataViewsService } from './mock_utils';
import type { XYVisualizationState } from '@kbn/lens-common';
import { LegendValue } from '@elastic/charts';
import type { LensSeriesLayer, LensXYConfig } from '../types';

test('generates xy chart config', async () => {
  const result = await buildXY(
    {
      chartType: 'xy',
      title: 'test',
      dataset: {
        esql: 'from test | count=count() by @timestamp',
      },
      layers: [
        {
          type: 'series',
          seriesType: 'bar',
          xAxis: '@timestamp',
          yAxis: [
            {
              label: 'test',
              value: 'count',
            },
          ],
        },
      ],
    },
    {
      dataViewsAPI: mockDataViewsService() as any,
    }
  );

  expect(result).toMatchInlineSnapshot(`
    Object {
      "description": undefined,
      "references": Array [],
      "state": Object {
        "adHocDataViews": Object {
          "test": Object {},
        },
        "datasourceStates": Object {
          "textBased": Object {
            "layers": Object {
              "layer_0": Object {
                "allColumns": Array [
                  Object {
                    "columnId": "x_metric_formula_accessor0",
                    "fieldName": "@timestamp",
                  },
                  Object {
                    "columnId": "metric_formula_accessor0_0",
                    "fieldName": "count",
                    "meta": Object {
                      "type": "number",
                    },
                  },
                ],
                "columns": Array [
                  Object {
                    "columnId": "x_metric_formula_accessor0",
                    "fieldName": "@timestamp",
                  },
                  Object {
                    "columnId": "metric_formula_accessor0_0",
                    "fieldName": "count",
                    "meta": Object {
                      "type": "number",
                    },
                  },
                ],
                "index": "test",
                "query": Object {
                  "esql": "from test | count=count() by @timestamp",
                },
                "timeField": undefined,
              },
            },
          },
        },
        "filters": Array [],
        "internalReferences": Array [
          Object {
            "id": "test",
            "name": "indexpattern-datasource-layer-layer_0",
            "type": "index-pattern",
          },
        ],
        "query": Object {
          "language": "kuery",
          "query": "",
        },
        "visualization": Object {
          "axisTitlesVisibilitySettings": Object {
            "x": true,
            "yLeft": true,
            "yRight": true,
          },
          "emphasizeFitting": true,
          "fittingFunction": "Linear",
          "gridlinesVisibilitySettings": Object {
            "x": true,
            "yLeft": true,
            "yRight": true,
          },
          "hideEndzones": true,
          "labelsOrientation": Object {
            "x": 0,
            "yLeft": 0,
            "yRight": 0,
          },
          "layers": Array [
            Object {
              "accessors": Array [
                "metric_formula_accessor0_0",
              ],
              "layerId": "layer_0",
              "layerType": "data",
              "seriesType": "bar",
              "xAccessor": "x_metric_formula_accessor0",
              "yConfig": Array [
                Object {
                  "color": undefined,
                  "forAccessor": "metric_formula_accessor0_0",
                },
              ],
            },
          ],
          "legend": Object {
            "isVisible": true,
            "position": "left",
          },
          "preferredSeriesType": "line",
          "tickLabelsVisibilitySettings": Object {
            "x": true,
            "yLeft": true,
            "yRight": true,
          },
          "valueLabels": "hide",
          "yLeftExtent": Object {
            "lowerBound": undefined,
            "mode": "full",
            "upperBound": undefined,
          },
        },
      },
      "title": "test",
      "visualizationType": "lnsXY",
    }
  `);
});

test('generates xy chart config with legend stats', async () => {
  const result = await buildXY(
    {
      chartType: 'xy',
      title: 'test',
      dataset: {
        esql: 'from test | count=count() by @timestamp',
      },
      layers: [
        {
          type: 'series',
          seriesType: 'bar',
          xAxis: '@timestamp',
          yAxis: [
            {
              label: 'test',
              value: 'count',
            },
          ],
        },
      ],
      legend: {
        show: true,
        position: 'right',
        legendStats: [LegendValue.Average, LegendValue.Max],
      },
    },
    {
      dataViewsAPI: mockDataViewsService() as any,
    }
  );

  expect(result.state.visualization).toMatchObject({
    legend: {
      isVisible: true,
      position: 'right',
      legendStats: [LegendValue.Average, LegendValue.Max],
    },
  });
});

test('it generates xy chart with multiple reference lines', async () => {
  const result = await buildXY(
    {
      chartType: 'xy',
      title: 'test',
      dataset: {
        index: '1',
        timeFieldName: '@timestamp',
      },
      layers: [
        {
          type: 'series',
          seriesType: 'bar',
          xAxis: {
            type: 'dateHistogram',
            field: '@timestamp',
          },
          yAxis: [
            {
              label: 'test',
              value: 'count()',
            },
          ],
        },
        {
          type: 'reference',
          yAxis: [
            {
              seriesColor: 'red',
              lineThickness: 2,
              fill: 'above',
              value: '123',
            },
            {
              seriesColor: 'blue',
              lineThickness: 2,
              fill: 'below',
              value: '142',
            },
          ],
        },
        {
          type: 'reference',
          yAxis: [
            {
              seriesColor: 'yellow',
              fill: 'none',
              value: '100',
            },
          ],
        },
      ],
    },
    {
      dataViewsAPI: mockDataViewsService() as any,
    }
  );

  const xyState = result.state.visualization as XYVisualizationState;

  expect(xyState.layers).toHaveLength(3);

  const [_, referenceLayer1, referenceLayer2] = xyState.layers;

  expect(referenceLayer1).toEqual({
    layerId: 'layer_1',
    layerType: 'referenceLine',
    accessors: ['metric_formula_accessor1_0', 'metric_formula_accessor1_1'],
    yConfig: [
      {
        axisMode: 'left',
        color: 'red',
        fill: 'above',
        forAccessor: 'metric_formula_accessor1_0',
        lineWidth: 2,
      },
      {
        axisMode: 'left',
        color: 'blue',
        fill: 'below',
        forAccessor: 'metric_formula_accessor1_1',
        lineWidth: 2,
      },
    ],
  });

  expect(referenceLayer2).toEqual({
    layerId: 'layer_2',
    layerType: 'referenceLine',
    accessors: ['metric_formula_accessor2_0'],
    yConfig: [
      {
        axisMode: 'left',
        color: 'yellow',
        fill: 'none',
        forAccessor: 'metric_formula_accessor2_0',
      },
    ],
  });
});

describe('y-axis title', () => {
  const baseConfig = {
    chartType: 'xy' as const,
    title: 'test',
    dataset: {
      esql: 'from test | count=count() by @timestamp',
    },
    layers: [
      {
        type: 'series' as const,
        seriesType: 'line' as const,
        xAxis: '@timestamp',
        yAxis: [
          {
            label: 'test',
            value: 'count',
          },
        ],
      },
    ],
  };

  it('sets a custom y-axis title in the visualization state when yTitle is provided', async () => {
    const result = await buildXY(
      { ...baseConfig, yTitle: 'Avg' },
      {
        dataViewsAPI: mockDataViewsService() as any,
      }
    );

    const visualization = result.state.visualization as XYVisualizationState;
    expect(visualization.yTitle).toBe('Avg');
  });

  it('omits yTitle from the visualization state when yTitle is not provided', async () => {
    const result = await buildXY(baseConfig, {
      dataViewsAPI: mockDataViewsService() as any,
    });

    const visualization = result.state.visualization as XYVisualizationState;
    expect(visualization.yTitle).toBeUndefined();
  });

  it('sets a custom x-axis title in the visualization state when xTitle is provided', async () => {
    const result = await buildXY(
      { ...baseConfig, xTitle: 'Time' },
      {
        dataViewsAPI: mockDataViewsService() as any,
      }
    );

    const visualization = result.state.visualization as XYVisualizationState;
    expect(visualization.xTitle).toBe('Time');
  });

  it('omits xTitle from the visualization state when xTitle is not provided', async () => {
    const result = await buildXY(baseConfig, {
      dataViewsAPI: mockDataViewsService() as any,
    });

    const visualization = result.state.visualization as XYVisualizationState;
    expect(visualization.xTitle).toBeUndefined();
  });
});

describe('breakdown handling', () => {
  it('should not include splitAccessors when breakdown is undefined', async () => {
    const result = await buildXY(
      {
        chartType: 'xy',
        title: 'test',
        dataset: {
          esql: 'from test | count=count() by @timestamp',
        },
        layers: [
          {
            type: 'series',
            seriesType: 'line',
            xAxis: '@timestamp',
            yAxis: [
              {
                label: 'test',
                value: 'count',
              },
            ],
          },
        ],
      },
      {
        dataViewsAPI: mockDataViewsService() as any,
      }
    );

    const xyState = result.state.visualization as XYVisualizationState;
    const dataLayer = xyState.layers[0] as any;

    expect(dataLayer.splitAccessors).toBeUndefined();
  });

  it('should create single splitAccessor when breakdown is a string', async () => {
    const result = await buildXY(
      {
        chartType: 'xy',
        title: 'test',
        dataset: {
          esql: 'from test | count=count() by @timestamp, service.name',
        },
        layers: [
          {
            type: 'series',
            seriesType: 'line',
            xAxis: '@timestamp',
            breakdown: 'service.name',
            yAxis: [
              {
                label: 'test',
                value: 'count',
              },
            ],
          },
        ],
      },
      {
        dataViewsAPI: mockDataViewsService() as any,
      }
    );

    const xyState = result.state.visualization as XYVisualizationState;
    const dataLayer = xyState.layers[0] as any;

    expect(dataLayer.splitAccessors).toEqual(['metric_formula_accessor0_breakdown_0']);
  });

  it('should create single splitAccessor when breakdown is an array with one item', async () => {
    const result = await buildXY(
      {
        chartType: 'xy',
        title: 'test',
        dataset: {
          esql: 'from test | count=count() by @timestamp, host.name',
        },
        layers: [
          {
            type: 'series',
            seriesType: 'line',
            xAxis: '@timestamp',
            breakdown: ['host.name'],
            yAxis: [
              {
                label: 'test',
                value: 'count',
              },
            ],
          },
        ],
      },
      {
        dataViewsAPI: mockDataViewsService() as any,
      }
    );

    const xyState = result.state.visualization as XYVisualizationState;
    const dataLayer = xyState.layers[0] as any;

    expect(dataLayer.splitAccessors).toEqual(['metric_formula_accessor0_breakdown_0']);
  });

  it('should create multiple splitAccessors when breakdown is an array with multiple items', async () => {
    const result = await buildXY(
      {
        chartType: 'xy',
        title: 'test',
        dataset: {
          esql: 'from test | count=count() by @timestamp, host.name, service.name, container.id',
        },
        layers: [
          {
            type: 'series',
            seriesType: 'line',
            xAxis: '@timestamp',
            breakdown: ['host.name', 'service.name', 'container.id'],
            yAxis: [
              {
                label: 'test',
                value: 'count',
              },
            ],
          },
        ],
      },
      {
        dataViewsAPI: mockDataViewsService() as any,
      }
    );

    const xyState = result.state.visualization as XYVisualizationState;
    const dataLayer = xyState.layers[0] as any;

    expect(dataLayer.splitAccessors).toEqual([
      'metric_formula_accessor0_breakdown_0',
      'metric_formula_accessor0_breakdown_1',
      'metric_formula_accessor0_breakdown_2',
    ]);
  });

  it('should create correct splitAccessors for multiple layers with different breakdowns', async () => {
    const result = await buildXY(
      {
        chartType: 'xy',
        title: 'test',
        dataset: {
          esql: 'from test | count=count() by @timestamp',
        },
        layers: [
          {
            type: 'series',
            seriesType: 'line',
            xAxis: '@timestamp',
            breakdown: 'service.name',
            yAxis: [
              {
                label: 'test',
                value: 'count',
              },
            ],
          },
          {
            type: 'series',
            seriesType: 'bar',
            xAxis: '@timestamp',
            breakdown: ['host.name', 'container.id'],
            yAxis: [
              {
                label: 'test2',
                value: 'count',
              },
            ],
          },
        ],
      },
      {
        dataViewsAPI: mockDataViewsService() as any,
      }
    );

    const xyState = result.state.visualization as XYVisualizationState;
    const layer0 = xyState.layers[0] as any;
    const layer1 = xyState.layers[1] as any;

    expect(layer0.splitAccessors).toEqual(['metric_formula_accessor0_breakdown_0']);
    expect(layer1.splitAccessors).toEqual([
      'metric_formula_accessor1_breakdown_0',
      'metric_formula_accessor1_breakdown_1',
    ]);
  });
});

describe('annotation layer handling', () => {
  it('does not create a datasource entry or spurious references for a manual annotation layer', async () => {
    const result = await buildXY(
      {
        chartType: 'xy',
        title: 'test',
        dataset: { esql: 'from main_index | limit 10' },
        layers: [
          {
            type: 'series',
            seriesType: 'line',
            xAxis: '@timestamp',
            yAxis: [{ label: 'count', value: 'count' }],
          },
          {
            type: 'annotation',
            yAxis: [],
            events: [{ name: 'deploy', datetime: '2024-01-15T00:00:00.000Z' }],
          },
        ],
      },
      { dataViewsAPI: mockDataViewsService() as any }
    );

    const xyState = result.state.visualization as XYVisualizationState;
    const annotationLayer = xyState.layers[1] as any;

    // manual annotations do not require an index pattern
    expect(annotationLayer.indexPatternId).toBeUndefined();

    // no datasource entry is created for the annotation layer
    expect(Object.keys(result.state.datasourceStates.textBased?.layers ?? {})).toEqual(['layer_0']);

    // no spurious datasource-style reference for the annotation layer
    const allRefs = [...result.references, ...(result.state.internalReferences ?? [])];
    expect(allRefs.some((r) => r.name === 'indexpattern-datasource-layer-layer_1')).toBe(false);
  });
});

describe('areaFill handling', () => {
  const buildWithLayers = async (
    layers: LensXYConfig['layers'],
    areaFill?: LensXYConfig['areaFill']
  ) => {
    const result = await buildXY(
      {
        chartType: 'xy',
        title: 'test',
        dataset: { esql: 'from test | count=count() by @timestamp' },
        layers,
        ...(areaFill ? { areaFill } : {}),
      },
      { dataViewsAPI: mockDataViewsService() as any }
    );

    return result.state.visualization as XYVisualizationState;
  };

  const seriesLayer = (seriesType: LensSeriesLayer['seriesType']): LensSeriesLayer => ({
    type: 'series',
    seriesType,
    xAxis: '@timestamp',
    yAxis: [{ label: 'test', value: 'count' }],
  });

  it('defaults area charts to a gradient fill', async () => {
    const xyState = await buildWithLayers([seriesLayer('area')]);
    expect(xyState.areaFill).toBe('gradient');
  });

  it('preserves an explicitly configured fill', async () => {
    const xyState = await buildWithLayers([seriesLayer('area')], 'solid');
    expect(xyState.areaFill).toBe('solid');
  });

  it('omits areaFill entirely for charts without area layers', async () => {
    const xyState = await buildWithLayers([seriesLayer('bar'), seriesLayer('line')]);
    expect(xyState).not.toHaveProperty('areaFill');
  });
});
