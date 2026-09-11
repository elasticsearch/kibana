/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Ast } from '@kbn/interpreter';
import { fromExpression } from '@kbn/interpreter';
import { Position } from '@elastic/charts';
import { chartPluginMock } from '@kbn/charts-plugin/public/mocks';
import type { XYVisualizationState } from './xy_visualization';
import { getXyVisualization } from './xy_visualization';
import type { OperationDescriptor } from '@kbn/lens-common';
import { createMockDatasource, createMockFramePublicAPI } from '../../mocks';
import { LayerTypes } from '@kbn/expression-xy-plugin/public';
import { fieldFormatsServiceMock } from '@kbn/field-formats-plugin/public/mocks';
import { eventAnnotationServiceMock } from '@kbn/event-annotation-plugin/public/mocks';
import { defaultReferenceLineColor } from './color_assignment';
import { coreMock, themeServiceMock } from '@kbn/core/public/mocks';
import { DEFAULT_COLOR_MAPPING_CONFIG } from '@kbn/coloring';
import { LegendSize } from '@kbn/chart-expressions-common';
import { dataPluginMock } from '@kbn/data-plugin/public/mocks';
import type { IStorageWrapper } from '@kbn/kibana-utils-plugin/public';
import { unifiedSearchPluginMock } from '@kbn/unified-search-plugin/public/mocks';
import type { DataViewsServicePublic } from '@kbn/data-views-plugin/public';

describe('#toExpression', () => {
  const xyVisualization = getXyVisualization({
    paletteService: chartPluginMock.createPaletteRegistry(),
    fieldFormats: fieldFormatsServiceMock.createStartContract(),
    kibanaTheme: themeServiceMock.createStartContract(),
    eventAnnotationService: eventAnnotationServiceMock,
    core: coreMock.createStart(),
    storage: {} as IStorageWrapper,
    data: dataPluginMock.createStartContract(),
    unifiedSearch: unifiedSearchPluginMock.createStartContract(),
    dataViewsService: {} as DataViewsServicePublic,
  });
  let mockDatasource: ReturnType<typeof createMockDatasource>;
  let frame: ReturnType<typeof createMockFramePublicAPI>;

  let datasourceExpressionsByLayers: Record<string, Ast>;

  beforeEach(() => {
    frame = createMockFramePublicAPI();
    mockDatasource = createMockDatasource();

    mockDatasource.publicAPIMock.getTableSpec.mockReturnValue([
      { columnId: 'd', fields: [] },
      { columnId: 'a', fields: [] },
      { columnId: 'b', fields: [] },
      { columnId: 'c', fields: [] },
    ]);

    mockDatasource.publicAPIMock.getOperationForColumnId.mockImplementation((col) => {
      return { label: `col_${col}`, dataType: 'number' } as OperationDescriptor;
    });

    frame.datasourceLayers = {
      first: mockDatasource.publicAPIMock,
    };

    const datasourceExpression = mockDatasource.toExpression(
      frame.datasourceLayers.first,
      'first',
      frame.dataViews.indexPatterns,
      frame.dateRange,
      new Date()
    ) ?? {
      type: 'expression',
      chain: [],
    };
    const exprAst =
      typeof datasourceExpression === 'string'
        ? fromExpression(datasourceExpression)
        : datasourceExpression;

    datasourceExpressionsByLayers = {
      first: exprAst,
      referenceLine: exprAst,
    };
  });

  it('should map to a valid AST', () => {
    expect(
      xyVisualization.toExpression(
        {
          legend: { position: Position.Left, isVisible: true },
          valueLabels: 'hide',
          preferredSeriesType: 'bar',
          areaFill: 'solid',
          fittingFunction: 'Carry',
          endValue: 'Nearest',
          emphasizeFitting: true,
          tickLabelsVisibilitySettings: { x: false, yLeft: true, yRight: true },
          labelsOrientation: {
            x: 0,
            yLeft: -90,
            yRight: -45,
          },
          gridlinesVisibilitySettings: { x: false, yLeft: true, yRight: true },
          hideEndzones: true,
          yRightExtent: {
            mode: 'custom',
            lowerBound: 123,
            upperBound: 456,
          },
          layers: [
            {
              layerId: 'first',
              layerType: LayerTypes.DATA,
              seriesType: 'area',
              splitAccessors: ['d'],
              xAccessor: 'a',
              accessors: ['b', 'c'],
            },
          ],
        },
        frame.datasourceLayers,
        undefined,
        datasourceExpressionsByLayers
      )
    ).toMatchSnapshot();
  });

  it('should default the fitting function to Linear', () => {
    const ast = xyVisualization.toExpression(
      {
        legend: { position: Position.Bottom, isVisible: true },
        valueLabels: 'hide',
        preferredSeriesType: 'bar',
        layers: [
          {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            seriesType: 'area',
            splitAccessors: ['d'],
            xAccessor: 'a',
            accessors: ['b', 'c'],
          },
        ],
      },
      frame.datasourceLayers,
      undefined,
      datasourceExpressionsByLayers
    ) as Ast;

    expect(ast.chain[0].arguments.fittingFunction[0]).toEqual('Linear');
    expect(ast.chain[0].arguments.emphasizeFitting[0]).toEqual(true);
  });

  it('should default the axisTitles visibility settings to true', () => {
    const expression = xyVisualization.toExpression(
      {
        legend: { position: Position.Bottom, isVisible: true },
        valueLabels: 'hide',
        preferredSeriesType: 'bar',
        layers: [
          {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            seriesType: 'area',
            splitAccessors: ['d'],
            xAccessor: 'a',
            accessors: ['b', 'c'],
          },
        ],
      },
      frame.datasourceLayers,
      undefined,
      datasourceExpressionsByLayers
    ) as Ast;
    expect((expression.chain[0].arguments.yAxisConfigs[0] as Ast).chain[0].arguments).toEqual(
      expect.objectContaining({
        showTitle: [true],
        position: ['left'],
      })
    );
    expect((expression.chain[0].arguments.yAxisConfigs[1] as Ast).chain[0].arguments).toEqual(
      expect.objectContaining({
        showTitle: [true],
        position: ['right'],
      })
    );
    expect((expression.chain[0].arguments.xAxisConfig[0] as Ast).chain[0].arguments).toEqual(
      expect.objectContaining({
        showTitle: [true],
      })
    );
  });

  it('should generate an expression without x accessor', () => {
    const expression = xyVisualization.toExpression(
      {
        legend: { position: Position.Bottom, isVisible: true },
        valueLabels: 'hide',
        preferredSeriesType: 'bar',
        layers: [
          {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            seriesType: 'area',
            splitAccessors: undefined,
            xAccessor: undefined,
            accessors: ['a'],
          },
        ],
      },
      frame.datasourceLayers,
      undefined,
      datasourceExpressionsByLayers
    ) as Ast;
    expect(
      (expression.chain[0].arguments.layers[0] as Ast).chain[0].arguments.xAccessor
    ).toBeUndefined();
  });

  it('should not generate an expression when missing y', () => {
    expect(
      xyVisualization.toExpression(
        {
          legend: { position: Position.Bottom, isVisible: true },
          valueLabels: 'hide',
          preferredSeriesType: 'bar',
          layers: [
            {
              layerId: 'first',
              layerType: LayerTypes.DATA,
              seriesType: 'area',
              splitAccessors: undefined,
              xAccessor: 'a',
              accessors: [],
            },
          ],
        },
        frame.datasourceLayers,
        undefined,
        datasourceExpressionsByLayers
      )
    ).toBeNull();
  });

  it('should default to labeling all columns with their column label', () => {
    const expression = xyVisualization.toExpression(
      {
        legend: { position: Position.Bottom, isVisible: true },
        valueLabels: 'hide',
        preferredSeriesType: 'bar',
        layers: [
          {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            seriesType: 'area',
            splitAccessors: ['d'],
            xAccessor: 'a',
            accessors: ['b', 'c'],
          },
        ],
      },
      frame.datasourceLayers,
      undefined,
      datasourceExpressionsByLayers
    )! as Ast;

    expect(mockDatasource.publicAPIMock.getOperationForColumnId).toHaveBeenCalledWith('b');
    expect(mockDatasource.publicAPIMock.getOperationForColumnId).toHaveBeenCalledWith('c');
    expect(mockDatasource.publicAPIMock.getOperationForColumnId).toHaveBeenCalledWith('d');
    expect(
      (expression.chain[0].arguments.layers[0] as Ast).chain[1].arguments.columnToLabel
    ).toEqual([
      JSON.stringify({
        b: 'col_b',
        c: 'col_c',
        d: 'col_d',
      }),
    ]);
  });

  it('should default the tick labels visibility settings to true', () => {
    const expression = xyVisualization.toExpression(
      {
        legend: { position: Position.Bottom, isVisible: true },
        valueLabels: 'hide',
        preferredSeriesType: 'bar',
        layers: [
          {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            seriesType: 'area',
            splitAccessors: ['d'],
            xAccessor: 'a',
            accessors: ['b', 'c'],
          },
        ],
      },
      frame.datasourceLayers,
      undefined,
      datasourceExpressionsByLayers
    ) as Ast;
    expect((expression.chain[0].arguments.yAxisConfigs[0] as Ast).chain[0].arguments).toEqual(
      expect.objectContaining({
        showLabels: [true],
        position: ['left'],
      })
    );
    expect((expression.chain[0].arguments.yAxisConfigs[1] as Ast).chain[0].arguments).toEqual(
      expect.objectContaining({
        showLabels: [true],
        position: ['right'],
      })
    );
    expect((expression.chain[0].arguments.xAxisConfig[0] as Ast).chain[0].arguments).toEqual(
      expect.objectContaining({
        showLabels: [true],
      })
    );
  });

  it('should default the tick labels orientation settings to 0', () => {
    const expression = xyVisualization.toExpression(
      {
        legend: { position: Position.Bottom, isVisible: true },
        valueLabels: 'hide',
        preferredSeriesType: 'bar',
        layers: [
          {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            seriesType: 'area',
            splitAccessors: ['d'],
            xAccessor: 'a',
            accessors: ['b', 'c'],
          },
        ],
      },
      frame.datasourceLayers,
      undefined,
      datasourceExpressionsByLayers
    ) as Ast;
    expect((expression.chain[0].arguments.yAxisConfigs[0] as Ast).chain[0].arguments).toEqual(
      expect.objectContaining({
        labelsOrientation: [0],
        position: ['left'],
      })
    );
    expect((expression.chain[0].arguments.yAxisConfigs[1] as Ast).chain[0].arguments).toEqual(
      expect.objectContaining({
        labelsOrientation: [0],
        position: ['right'],
      })
    );
    expect((expression.chain[0].arguments.xAxisConfig[0] as Ast).chain[0].arguments).toEqual(
      expect.objectContaining({
        labelsOrientation: [0],
      })
    );
  });

  it('should default the gridlines visibility settings to true', () => {
    const expression = xyVisualization.toExpression(
      {
        legend: { position: Position.Bottom, isVisible: true },
        valueLabels: 'hide',
        preferredSeriesType: 'bar',
        layers: [
          {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            seriesType: 'area',
            splitAccessors: ['d'],
            xAccessor: 'a',
            accessors: ['b', 'c'],
          },
        ],
      },
      frame.datasourceLayers,
      undefined,
      datasourceExpressionsByLayers
    ) as Ast;
    expect((expression.chain[0].arguments.yAxisConfigs[0] as Ast).chain[0].arguments).toEqual(
      expect.objectContaining({
        showGridLines: [true],
        position: ['left'],
      })
    );
    expect((expression.chain[0].arguments.yAxisConfigs[1] as Ast).chain[0].arguments).toEqual(
      expect.objectContaining({
        showGridLines: [true],
        position: ['right'],
      })
    );
    expect((expression.chain[0].arguments.xAxisConfig[0] as Ast).chain[0].arguments).toEqual(
      expect.objectContaining({
        showGridLines: [true],
      })
    );
  });

  it('should correctly report the valueLabels visibility settings', () => {
    const expression = xyVisualization.toExpression(
      {
        legend: { position: Position.Bottom, isVisible: true },
        valueLabels: 'show',
        preferredSeriesType: 'bar',
        layers: [
          {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            seriesType: 'area',
            splitAccessors: ['d'],
            xAccessor: 'a',
            accessors: ['b', 'c'],
          },
        ],
      },
      frame.datasourceLayers,
      undefined,
      datasourceExpressionsByLayers
    ) as Ast;
    expect(expression.chain[0].arguments.valueLabels[0] as Ast).toEqual('show');
  });

  it('should set legend size for outside legend', () => {
    const expression = xyVisualization.toExpression(
      {
        legend: { position: Position.Left, isVisible: true, legendSize: LegendSize.SMALL },
        valueLabels: 'show',
        preferredSeriesType: 'bar',
        layers: [
          {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            seriesType: 'area',
            splitAccessors: ['d'],
            xAccessor: 'a',
            accessors: ['b', 'c'],
          },
        ],
      },
      frame.datasourceLayers,
      undefined,
      datasourceExpressionsByLayers
    ) as Ast;
    expect(
      (expression.chain[0].arguments.legend[0] as Ast).chain[0].arguments.legendSize[0]
    ).toEqual('small');
  });

  it('should use auto legend size for bottom/top legend', () => {
    const expression = xyVisualization.toExpression(
      {
        legend: {
          position: Position.Bottom,
          isVisible: true,
          isInside: false,
          legendSize: LegendSize.SMALL,
        },
        valueLabels: 'show',
        preferredSeriesType: 'bar',
        layers: [
          {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            seriesType: 'area',
            splitAccessors: ['d'],
            xAccessor: 'a',
            accessors: ['b', 'c'],
          },
        ],
      },
      frame.datasourceLayers,
      undefined,
      datasourceExpressionsByLayers
    ) as Ast;
    expect((expression.chain[0].arguments.legend[0] as Ast).chain[0].arguments.legendSize[0]).toBe(
      LegendSize.AUTO
    );
  });

  it('should include legend maxLines in the legendConfig AST when set', () => {
    const expression = xyVisualization.toExpression(
      {
        legend: {
          position: Position.Bottom,
          isVisible: true,
          maxLines: 3,
        },
        valueLabels: 'hide',
        preferredSeriesType: 'bar',
        layers: [
          {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            seriesType: 'area',
            splitAccessors: ['d'],
            xAccessor: 'a',
            accessors: ['b', 'c'],
          },
        ],
      },
      frame.datasourceLayers,
      undefined,
      datasourceExpressionsByLayers
    ) as Ast;

    const legendConfig = (expression.chain[0].arguments.legend[0] as Ast).chain[0].arguments;
    expect(legendConfig.maxLines).toEqual([3]);
  });

  it('should ignore legend size for inside legend', () => {
    const expression = xyVisualization.toExpression(
      {
        legend: {
          position: Position.Left,
          isVisible: true,
          isInside: true,
          legendSize: LegendSize.SMALL,
        },
        valueLabels: 'show',
        preferredSeriesType: 'bar',
        layers: [
          {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            seriesType: 'area',
            splitAccessors: ['d'],
            xAccessor: 'a',
            accessors: ['b', 'c'],
          },
        ],
      },
      frame.datasourceLayers,
      undefined,
      datasourceExpressionsByLayers
    ) as Ast;
    expect(
      (expression.chain[0].arguments.legend[0] as Ast).chain[0].arguments.legendSize
    ).toBeUndefined();
  });

  it('should use the line-optimized palette for line charts without explicit palette', () => {
    const expression = xyVisualization.toExpression(
      {
        legend: { position: Position.Bottom, isVisible: true },
        valueLabels: 'hide',
        preferredSeriesType: 'line',
        layers: [
          {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            seriesType: 'line',
            splitAccessors: ['d'],
            xAccessor: 'a',
            accessors: ['b', 'c'],
          },
        ],
      },
      frame.datasourceLayers,
      undefined,
      datasourceExpressionsByLayers
    ) as Ast;

    const paletteExpression = (expression.chain[0].arguments.layers[0] as Ast).chain[1].arguments
      .palette[0] as Ast;
    expect(paletteExpression.chain[0].function).toEqual('system_palette');
    expect(paletteExpression.chain[0].arguments.name).toEqual(['elastic_line_optimized']);
  });

  it('should use the default palette for non-line charts without explicit palette', () => {
    const expression = xyVisualization.toExpression(
      {
        legend: { position: Position.Bottom, isVisible: true },
        valueLabels: 'hide',
        preferredSeriesType: 'bar',
        layers: [
          {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            seriesType: 'bar',
            splitAccessors: ['d'],
            xAccessor: 'a',
            accessors: ['b', 'c'],
          },
        ],
      },
      frame.datasourceLayers,
      undefined,
      datasourceExpressionsByLayers
    ) as Ast;

    const paletteExpression = (expression.chain[0].arguments.layers[0] as Ast).chain[1].arguments
      .palette[0] as Ast;
    expect(paletteExpression.chain[0].function).toEqual('system_palette');
    expect(paletteExpression.chain[0].arguments.name).toEqual(['default']);
  });

  it('should pass through colorMapping.paletteId as-is for line charts', () => {
    const expression = xyVisualization.toExpression(
      {
        legend: { position: Position.Bottom, isVisible: true },
        valueLabels: 'hide',
        preferredSeriesType: 'line',
        layers: [
          {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            seriesType: 'line',
            splitAccessors: ['d'],
            xAccessor: 'a',
            accessors: ['b', 'c'],
            colorMapping: {
              ...DEFAULT_COLOR_MAPPING_CONFIG,
              paletteId: 'elastic_line_optimized',
            },
          },
        ],
      },
      frame.datasourceLayers,
      undefined,
      datasourceExpressionsByLayers
    ) as Ast;

    const colorMappingJson = (expression.chain[0].arguments.layers[0] as Ast).chain[1].arguments
      .colorMapping[0] as string;
    const colorMappingConfig = JSON.parse(colorMappingJson);
    expect(colorMappingConfig.paletteId).toEqual('elastic_line_optimized');
  });

  it('should not override colorMapping.paletteId at expression time', () => {
    const expression = xyVisualization.toExpression(
      {
        legend: { position: Position.Bottom, isVisible: true },
        valueLabels: 'hide',
        preferredSeriesType: 'line',
        layers: [
          {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            seriesType: 'line',
            splitAccessors: ['d'],
            xAccessor: 'a',
            accessors: ['b', 'c'],
            colorMapping: DEFAULT_COLOR_MAPPING_CONFIG,
          },
        ],
      },
      frame.datasourceLayers,
      undefined,
      datasourceExpressionsByLayers
    ) as Ast;

    const colorMappingJson = (expression.chain[0].arguments.layers[0] as Ast).chain[1].arguments
      .colorMapping[0] as string;
    const colorMappingConfig = JSON.parse(colorMappingJson);
    expect(colorMappingConfig.paletteId).toEqual('default');
  });

  it('should use a default colorMapping with the correct paletteId when splitAccessors are defined but colorMapping is not', () => {
    const expression = xyVisualization.toExpression(
      {
        legend: { position: Position.Bottom, isVisible: true },
        valueLabels: 'hide',
        preferredSeriesType: 'bar',
        layers: [
          {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            seriesType: 'bar',
            splitAccessors: ['d'],
            xAccessor: 'a',
            accessors: ['b', 'c'],
          },
        ],
      },
      frame.datasourceLayers,
      undefined,
      datasourceExpressionsByLayers
    ) as Ast;

    const colorMappingJson = (expression.chain[0].arguments.layers[0] as Ast).chain[1].arguments
      .colorMapping[0] as string;
    const colorMappingConfig = JSON.parse(colorMappingJson);
    expect(colorMappingConfig).toEqual({
      ...DEFAULT_COLOR_MAPPING_CONFIG,
      paletteId: 'default',
    });
  });

  it('should use the line-optimized paletteId in the default colorMapping for line charts without explicit colorMapping', () => {
    const expression = xyVisualization.toExpression(
      {
        legend: { position: Position.Bottom, isVisible: true },
        valueLabels: 'hide',
        preferredSeriesType: 'line',
        layers: [
          {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            seriesType: 'line',
            splitAccessors: ['d'],
            xAccessor: 'a',
            accessors: ['b', 'c'],
          },
        ],
      },
      frame.datasourceLayers,
      undefined,
      datasourceExpressionsByLayers
    ) as Ast;

    const colorMappingJson = (expression.chain[0].arguments.layers[0] as Ast).chain[1].arguments
      .colorMapping[0] as string;
    const colorMappingConfig = JSON.parse(colorMappingJson);
    expect(colorMappingConfig).toEqual({
      ...DEFAULT_COLOR_MAPPING_CONFIG,
      paletteId: 'elastic_line_optimized',
    });
  });

  it('should not set colorMapping when there are no splitAccessors', () => {
    const expression = xyVisualization.toExpression(
      {
        legend: { position: Position.Bottom, isVisible: true },
        valueLabels: 'hide',
        preferredSeriesType: 'bar',
        layers: [
          {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            seriesType: 'bar',
            splitAccessors: undefined,
            xAccessor: 'a',
            accessors: ['b', 'c'],
          },
        ],
      },
      frame.datasourceLayers,
      undefined,
      datasourceExpressionsByLayers
    ) as Ast;

    expect(
      (expression.chain[0].arguments.layers[0] as Ast).chain[1].arguments.colorMapping
    ).toBeUndefined();
  });

  it('should not set colorMapping when splitAccessors are collapsed', () => {
    const expression = xyVisualization.toExpression(
      {
        legend: { position: Position.Bottom, isVisible: true },
        valueLabels: 'hide',
        preferredSeriesType: 'bar',
        layers: [
          {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            seriesType: 'bar',
            splitAccessors: ['d'],
            collapseFn: 'sum',
            xAccessor: 'a',
            accessors: ['b', 'c'],
          },
        ],
      },
      frame.datasourceLayers,
      undefined,
      datasourceExpressionsByLayers
    ) as Ast;

    expect(
      (expression.chain[0].arguments.layers[0] as Ast).chain[1].arguments.colorMapping
    ).toBeUndefined();
  });

  it('should not set colorMapping when splitAccessors are collapsed even if layer has colorMapping', () => {
    const expression = xyVisualization.toExpression(
      {
        legend: { position: Position.Bottom, isVisible: true },
        valueLabels: 'hide',
        preferredSeriesType: 'line',
        layers: [
          {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            seriesType: 'line',
            splitAccessors: ['d'],
            collapseFn: 'sum',
            xAccessor: 'a',
            accessors: ['b', 'c'],
            colorMapping: {
              ...DEFAULT_COLOR_MAPPING_CONFIG,
              paletteId: 'default',
            },
          },
        ],
      },
      frame.datasourceLayers,
      undefined,
      datasourceExpressionsByLayers
    ) as Ast;

    expect(
      (expression.chain[0].arguments.layers[0] as Ast).chain[1].arguments.colorMapping
    ).toBeUndefined();
  });

  it('should use the line-optimized palette in the expression when collapsed line chart has no explicit palette', () => {
    const expression = xyVisualization.toExpression(
      {
        legend: { position: Position.Bottom, isVisible: true },
        valueLabels: 'hide',
        preferredSeriesType: 'line',
        layers: [
          {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            seriesType: 'line',
            splitAccessors: ['d'],
            collapseFn: 'sum',
            xAccessor: 'a',
            accessors: ['b', 'c'],
          },
        ],
      },
      frame.datasourceLayers,
      undefined,
      datasourceExpressionsByLayers
    ) as Ast;

    const layerChain = (expression.chain[0].arguments.layers[0] as Ast).chain;
    const extendedDataLayer = layerChain[layerChain.length - 1];
    const paletteExpression = extendedDataLayer.arguments.palette[0] as Ast;
    expect(paletteExpression.chain[0].function).toEqual('system_palette');
    expect(paletteExpression.chain[0].arguments.name).toEqual(['elastic_line_optimized']);
  });

  it('should ignore legacy palette and use series type default when collapsed', () => {
    const expression = xyVisualization.toExpression(
      {
        legend: { position: Position.Bottom, isVisible: true },
        valueLabels: 'hide',
        preferredSeriesType: 'line',
        layers: [
          {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            seriesType: 'line',
            splitAccessors: ['d'],
            collapseFn: 'sum',
            xAccessor: 'a',
            accessors: ['b', 'c'],
            palette: { type: 'palette', name: 'kibana_palette' },
          },
        ],
      },
      frame.datasourceLayers,
      undefined,
      datasourceExpressionsByLayers
    ) as Ast;

    const layerChain = (expression.chain[0].arguments.layers[0] as Ast).chain;
    const extendedDataLayer = layerChain[layerChain.length - 1];
    const paletteExpression = extendedDataLayer.arguments.palette[0] as Ast;
    expect(paletteExpression.chain[0].function).toEqual('system_palette');
    expect(paletteExpression.chain[0].arguments.name).toEqual(['elastic_line_optimized']);
  });

  it('should not set colorMapping when a legacy palette is explicitly set with active splits', () => {
    const expression = xyVisualization.toExpression(
      {
        legend: { position: Position.Bottom, isVisible: true },
        valueLabels: 'hide',
        preferredSeriesType: 'line',
        layers: [
          {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            seriesType: 'line',
            splitAccessors: ['d'],
            xAccessor: 'a',
            accessors: ['b', 'c'],
            palette: { type: 'palette', name: 'kibana_palette' },
          },
        ],
      },
      frame.datasourceLayers,
      undefined,
      datasourceExpressionsByLayers
    ) as Ast;

    expect(
      (expression.chain[0].arguments.layers[0] as Ast).chain[1].arguments.colorMapping
    ).toBeUndefined();
  });

  it('should use the default palette for area charts without explicit palette', () => {
    const expression = xyVisualization.toExpression(
      {
        legend: { position: Position.Bottom, isVisible: true },
        valueLabels: 'hide',
        preferredSeriesType: 'area',
        layers: [
          {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            seriesType: 'area',
            splitAccessors: ['d'],
            xAccessor: 'a',
            accessors: ['b', 'c'],
          },
        ],
      },
      frame.datasourceLayers,
      undefined,
      datasourceExpressionsByLayers
    ) as Ast;

    const paletteExpression = (expression.chain[0].arguments.layers[0] as Ast).chain[1].arguments
      .palette[0] as Ast;
    expect(paletteExpression.chain[0].function).toEqual('system_palette');
    expect(paletteExpression.chain[0].arguments.name).toEqual(['default']);
  });

  it('should compute the correct series color fallback based on the layer type', () => {
    const expression = xyVisualization.toExpression(
      {
        legend: { position: Position.Bottom, isVisible: true },
        valueLabels: 'show',
        preferredSeriesType: 'bar',
        layers: [
          {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            seriesType: 'area',
            splitAccessors: ['d'],
            xAccessor: 'a',
            accessors: ['b', 'c'],
            yConfig: [{ forAccessor: 'a' }],
          },
          {
            layerId: 'referenceLine',
            layerType: LayerTypes.REFERENCELINE,
            accessors: ['b', 'c'],
            yConfig: [{ forAccessor: 'a' }],
          },
        ],
      },
      { ...frame.datasourceLayers, referenceLine: mockDatasource.publicAPIMock },
      undefined,
      datasourceExpressionsByLayers
    ) as Ast;

    function getYConfigColorForDataLayer(ast: Ast, index: number) {
      return (
        (ast.chain[0].arguments.layers[index] as Ast).chain[1].arguments.decorations[0] as Ast
      ).chain[0].arguments?.color;
    }
    function getYConfigColorForReferenceLayer(ast: Ast, index: number) {
      return (
        (ast.chain[0].arguments.layers[index] as Ast).chain[0].arguments.decorations[0] as Ast
      ).chain[0].arguments?.color;
    }
    expect(getYConfigColorForDataLayer(expression, 0)).toBeUndefined();
    expect(getYConfigColorForReferenceLayer(expression, 1)).toEqual([defaultReferenceLineColor]);
  });

  it('should ignore annotation layers with no event configured', () => {
    const expression = xyVisualization.toExpression(
      {
        legend: { position: Position.Bottom, isVisible: true },
        valueLabels: 'show',
        preferredSeriesType: 'bar',
        layers: [
          {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            seriesType: 'area',
            splitAccessors: ['d'],
            xAccessor: 'a',
            accessors: ['b', 'c'],
            yConfig: [{ forAccessor: 'a' }],
          },
          {
            layerId: 'first',
            layerType: LayerTypes.ANNOTATIONS,
            annotations: [],
            indexPatternId: 'my-indexPattern',
            ignoreGlobalFilters: true,
          },
        ],
      },
      { ...frame.datasourceLayers, referenceLine: mockDatasource.publicAPIMock },
      undefined,
      datasourceExpressionsByLayers
    ) as Ast;

    expect(expression.chain[0].arguments.layers).toHaveLength(1);
  });

  it('should correctly set the current time marker visibility settings', () => {
    // mock the xAccessor column to be of type date
    mockDatasource.publicAPIMock.getOperationForColumnId.mockImplementation((col) => {
      if (col === 'a')
        return { label: `col_${col}`, dataType: 'date', scale: 'interval' } as OperationDescriptor;
      return { label: `col_${col}`, dataType: 'number' } as OperationDescriptor;
    });
    const state: XYVisualizationState = {
      legend: { position: Position.Bottom, isVisible: true },
      valueLabels: 'show',
      preferredSeriesType: 'bar',
      layers: [
        {
          layerId: 'first',
          layerType: LayerTypes.DATA,
          seriesType: 'area',
          splitAccessors: ['d'],
          xAccessor: 'a',
          accessors: ['b', 'c'],
        },
      ],
    };
    let expression = xyVisualization.toExpression(
      {
        ...state,
        showCurrentTimeMarker: true,
      },
      frame.datasourceLayers,
      undefined,
      datasourceExpressionsByLayers
    ) as Ast;
    expect(expression.chain[0].arguments.addTimeMarker[0] as Ast).toEqual(true);

    expression = xyVisualization.toExpression(
      {
        ...state,
        showCurrentTimeMarker: false,
      },
      frame.datasourceLayers,
      undefined,
      datasourceExpressionsByLayers
    ) as Ast;
    expect(expression.chain[0].arguments.addTimeMarker[0] as Ast).toEqual(false);
  });

  it('ignores set current time marker visibility settings if the chart is not time-based', () => {
    const state: XYVisualizationState = {
      legend: { position: Position.Bottom, isVisible: true },
      valueLabels: 'show',
      preferredSeriesType: 'bar',
      layers: [
        {
          layerId: 'first',
          layerType: LayerTypes.DATA,
          seriesType: 'area',
          splitAccessors: ['d'],
          xAccessor: 'a',
          accessors: ['b', 'c'],
        },
      ],
    };
    const expression = xyVisualization.toExpression(
      {
        ...state,
        showCurrentTimeMarker: true,
      },
      frame.datasourceLayers,
      undefined,
      datasourceExpressionsByLayers
    ) as Ast;
    expect(expression.chain[0].arguments.addTimeMarker[0] as Ast).toEqual(false);
  });

  it('should include areaFill in the expression AST', () => {
    const ast = xyVisualization.toExpression(
      {
        legend: { position: Position.Bottom, isVisible: true },
        valueLabels: 'hide',
        preferredSeriesType: 'area',
        areaFill: 'gradient',
        layers: [
          {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            seriesType: 'area',
            splitAccessors: ['d'],
            xAccessor: 'a',
            accessors: ['b', 'c'],
          },
        ],
      },
      frame.datasourceLayers,
      undefined,
      datasourceExpressionsByLayers
    ) as Ast;

    expect(ast.chain[0].arguments.areaFill[0]).toEqual('gradient');
  });

  it('should default areaFill to solid', () => {
    const ast = xyVisualization.toExpression(
      {
        legend: { position: Position.Bottom, isVisible: true },
        valueLabels: 'hide',
        preferredSeriesType: 'area',
        layers: [
          {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            seriesType: 'area',
            splitAccessors: ['d'],
            xAccessor: 'a',
            accessors: ['b', 'c'],
          },
        ],
      },
      frame.datasourceLayers,
      undefined,
      datasourceExpressionsByLayers
    ) as Ast;

    expect(ast.chain[0].arguments.areaFill[0]).toEqual('solid');
  });

  it('should include a points layer in the expression when present in state', () => {
    const expression = xyVisualization.toExpression(
      {
        legend: { position: Position.Bottom, isVisible: true },
        valueLabels: 'hide',
        preferredSeriesType: 'bar',
        layers: [
          {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            seriesType: 'bar',
            xAccessor: 'a',
            accessors: ['b'],
            splitAccessors: [],
          },
          {
            layerId: 'points-layer',
            layerType: LayerTypes.POINTS,
            query: 'FROM metrics.exemplars-* | LIMIT 100',
            yAccessor: 'system.cpu.total.norm.pct',
          },
        ],
      },
      frame.datasourceLayers,
      undefined,
      datasourceExpressionsByLayers
    ) as Ast;

    const layers = expression.chain[0].arguments.layers as Ast[];
    // The points layer is a pipeline: kibana | esql | pointsLayer
    const pointsLayerAst = layers.find((l) => l.chain.at(-1)?.function === 'pointsLayer');

    expect(pointsLayerAst).toBeDefined();
    expect(pointsLayerAst!.chain[0].function).toBe('kibana');
    expect(pointsLayerAst!.chain[1].function).toBe('esql');
    expect(pointsLayerAst!.chain[1].arguments.query).toEqual([
      'FROM metrics.exemplars-* | LIMIT 100',
    ]);
    expect(pointsLayerAst!.chain[1].arguments.timeField).toEqual(['@timestamp']);

    const args = pointsLayerAst!.chain[2].arguments;
    expect(args.layerId).toEqual(['points-layer']);
    expect(args.query).toEqual(['FROM metrics.exemplars-* | LIMIT 100']);
    expect(args.yAccessor).toEqual(['system.cpu.total.norm.pct']);
  });

  it('should exclude a points layer with missing query or yAccessor', () => {
    const expression = xyVisualization.toExpression(
      {
        legend: { position: Position.Bottom, isVisible: true },
        valueLabels: 'hide',
        preferredSeriesType: 'bar',
        layers: [
          {
            layerId: 'first',
            layerType: LayerTypes.DATA,
            seriesType: 'bar',
            xAccessor: 'a',
            accessors: ['b'],
            splitAccessors: [],
          },
          {
            layerId: 'bad-points',
            layerType: LayerTypes.POINTS,
            query: '',
            yAccessor: 'some.metric',
          },
        ],
      },
      frame.datasourceLayers,
      undefined,
      datasourceExpressionsByLayers
    ) as Ast;

    const layers = expression.chain[0].arguments.layers as Ast[];
    const pointsLayerAst = layers.find((l) => l.chain.at(-1)?.function === 'pointsLayer');

    expect(pointsLayerAst).toBeUndefined();
  });
});
