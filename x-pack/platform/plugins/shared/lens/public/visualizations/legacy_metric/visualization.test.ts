/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getLegacyMetricVisualization } from './visualization';
import { LayerTypes } from '@kbn/expression-xy-plugin/public';
import type { LegacyMetricState, DatasourcePublicAPI, FramePublicAPI } from '@kbn/lens-common';
import { createMockDatasource, createMockFramePublicAPI } from '../../mocks';
import { generateId } from '../../id_generator';
import { chartPluginMock } from '@kbn/charts-plugin/public/mocks';
import { ColorMode } from '@kbn/charts-plugin/common';
import { CUSTOM_PALETTE } from '@kbn/coloring';
import type { CustomPaletteParams, PaletteOutput } from '@kbn/coloring';

jest.mock('../../id_generator');

function exampleState(): LegacyMetricState {
  return {
    accessor: 'a',
    layerId: 'l1',
    layerType: LayerTypes.DATA,
  };
}

function mockFrame(): FramePublicAPI {
  return {
    ...createMockFramePublicAPI(),
    datasourceLayers: {
      l1: createMockDatasource('l1').publicAPIMock,
      l42: createMockDatasource('l42').publicAPIMock,
    },
  };
}

const metricVisualization = getLegacyMetricVisualization({
  paletteService: chartPluginMock.createPaletteRegistry(),
});

describe('metric_visualization', () => {
  describe('#initialize', () => {
    it('loads default state', () => {
      (generateId as jest.Mock).mockReturnValueOnce('test-id1');
      const initialState = metricVisualization.initialize(() => 'test-id1');

      expect(initialState.accessor).not.toBeDefined();
      expect(initialState).toMatchInlineSnapshot(`
        Object {
          "accessor": undefined,
          "layerId": "test-id1",
          "layerType": "data",
        }
      `);
    });

    it('loads from persisted state', () => {
      expect(metricVisualization.initialize(() => 'l1', exampleState())).toEqual(exampleState());
    });
  });

  describe('#getLayerIds', () => {
    it('returns the layer id', () => {
      expect(metricVisualization.getLayerIds(exampleState())).toEqual(['l1']);
    });
  });

  describe('#clearLayer', () => {
    it('returns a clean layer', () => {
      (generateId as jest.Mock).mockReturnValueOnce('test-id1');
      expect(metricVisualization.clearLayer(exampleState(), 'l1', 'indexPattern1')).toEqual({
        accessor: undefined,
        layerId: 'l1',
        layerType: LayerTypes.DATA,
      });
    });
  });

  describe('#getConfiguration', () => {
    it('can add a metric when there is no accessor', () => {
      expect(
        metricVisualization.getConfiguration({
          state: {
            accessor: undefined,
            layerId: 'l1',
            layerType: LayerTypes.DATA,
          },
          layerId: 'l1',
          frame: mockFrame(),
        })
      ).toEqual({
        groups: [
          expect.objectContaining({
            supportsMoreColumns: true,
          }),
        ],
      });
    });

    it('is not allowed to add a metric once one accessor is set', () => {
      expect(
        metricVisualization.getConfiguration({
          state: {
            accessor: 'a',
            layerId: 'l1',
            layerType: LayerTypes.DATA,
          },
          layerId: 'l1',
          frame: mockFrame(),
        })
      ).toEqual({
        groups: [
          expect.objectContaining({
            supportsMoreColumns: false,
          }),
        ],
      });
    });

    it('should show the palette when metric has coloring enabled', () => {
      expect(
        metricVisualization.getConfiguration({
          state: {
            accessor: 'a',
            layerId: 'l1',
            layerType: LayerTypes.DATA,
            palette: {
              type: 'palette',
              name: CUSTOM_PALETTE,
              params: {
                stops: [
                  { color: 'blue', stop: 0 },
                  { color: 'yellow', stop: 100 },
                ],
              },
            },
          },
          layerId: 'l1',
          frame: mockFrame(),
        })
      ).toEqual({
        groups: [
          expect.objectContaining({
            accessors: expect.arrayContaining([
              { columnId: 'a', triggerIconType: 'colorBy', palette: ['blue', 'yellow'] },
            ]),
          }),
        ],
      });
    });

    it('should not show the palette when not enabled', () => {
      expect(
        metricVisualization.getConfiguration({
          state: {
            accessor: 'a',
            layerId: 'l1',
            layerType: LayerTypes.DATA,
          },
          layerId: 'l1',
          frame: mockFrame(),
        })
      ).toEqual({
        groups: [
          expect.objectContaining({
            accessors: expect.arrayContaining([
              { columnId: 'a', triggerIconType: undefined, palette: undefined },
            ]),
          }),
        ],
      });
    });
  });

  describe('#setDimension', () => {
    it('sets the accessor', () => {
      expect(
        metricVisualization.setDimension({
          prevState: {
            accessor: undefined,
            layerId: 'l1',
            layerType: LayerTypes.DATA,
          },
          layerId: 'l1',
          groupId: '',
          columnId: 'newDimension',
          frame: mockFrame(),
        })
      ).toEqual({
        accessor: 'newDimension',
        layerId: 'l1',
        layerType: LayerTypes.DATA,
      });
    });
  });

  describe('#removeDimension', () => {
    it('removes the accessor', () => {
      expect(
        metricVisualization.removeDimension({
          prevState: {
            accessor: 'a',
            layerId: 'l1',
            layerType: LayerTypes.DATA,
          },
          layerId: 'l1',
          columnId: 'a',
          frame: mockFrame(),
        })
      ).toEqual({
        accessor: undefined,
        layerId: 'l1',
        layerType: LayerTypes.DATA,
        colorMode: ColorMode.None,
        palette: undefined,
      });
    });

    it('removes the palette configuration', () => {
      expect(
        metricVisualization.removeDimension({
          prevState: {
            accessor: 'a',
            layerId: 'l1',
            layerType: LayerTypes.DATA,
            colorMode: ColorMode.Background,
            palette: {
              type: 'palette',
              name: 'status',
              params: {
                rangeType: 'number',
                stops: [
                  { color: 'blue', stop: 100 },
                  { color: 'red', stop: 150 },
                ],
              },
            },
          },
          layerId: 'l1',
          columnId: 'a',
          frame: mockFrame(),
        })
      ).toEqual({
        accessor: undefined,
        layerId: 'l1',
        layerType: LayerTypes.DATA,
        colorMode: ColorMode.None,
        palette: undefined,
      });
    });
  });

  describe('#getSupportedLayers', () => {
    it('should return a single layer type', () => {
      expect(metricVisualization.getSupportedLayers()).toHaveLength(1);
    });
  });

  describe('#getLayerType', () => {
    it('should return the type only if the layer is in the state', () => {
      expect(metricVisualization.getLayerType('l1', exampleState())).toEqual(LayerTypes.DATA);
      expect(metricVisualization.getLayerType('foo', exampleState())).toBeUndefined();
    });
  });

  describe('#toExpression', () => {
    it('should map to a valid AST', () => {
      const datasource: DatasourcePublicAPI = {
        ...createMockDatasource('l1').publicAPIMock,
        getOperationForColumnId(_: string) {
          return {
            id: 'a',
            dataType: 'number',
            isBucketed: false,
            label: 'shazm',
            isStaticValue: false,
            hasTimeShift: false,
            hasReducedTimeRange: false,
          };
        },
      };

      const frame = {
        ...mockFrame(),
        datasourceLayers: { l1: datasource },
      };

      expect(metricVisualization.toExpression(exampleState(), frame.datasourceLayers))
        .toMatchInlineSnapshot(`
        Object {
          "chain": Array [
            Object {
              "arguments": Object {
                "autoScale": Array [
                  true,
                ],
                "colorFullBackground": Array [
                  true,
                ],
                "colorMode": Array [
                  "None",
                ],
                "font": Array [
                  Object {
                    "chain": Array [
                      Object {
                        "arguments": Object {
                          "align": Array [
                            "left",
                          ],
                          "lHeight": Array [
                            75,
                          ],
                          "size": Array [
                            50,
                          ],
                          "sizeUnit": Array [
                            "px",
                          ],
                          "weight": Array [
                            "600",
                          ],
                        },
                        "function": "font",
                        "type": "function",
                      },
                    ],
                    "type": "expression",
                  },
                ],
                "labelFont": Array [
                  Object {
                    "chain": Array [
                      Object {
                        "arguments": Object {
                          "align": Array [
                            "left",
                          ],
                          "lHeight": Array [
                            24,
                          ],
                          "size": Array [
                            16,
                          ],
                          "sizeUnit": Array [
                            "px",
                          ],
                        },
                        "function": "font",
                        "type": "function",
                      },
                    ],
                    "type": "expression",
                  },
                ],
                "labelPosition": Array [
                  "top",
                ],
                "metric": Array [
                  Object {
                    "chain": Array [
                      Object {
                        "arguments": Object {
                          "accessor": Array [
                            "a",
                          ],
                        },
                        "function": "visdimension",
                        "type": "function",
                      },
                    ],
                    "type": "expression",
                  },
                ],
                "percentageMode": Array [
                  false,
                ],
                "showLabels": Array [
                  true,
                ],
              },
              "function": "legacyMetricVis",
              "type": "function",
            },
          ],
          "type": "expression",
        }
      `);
    });

    describe('palette stops', () => {
      const numericDatasource = (): DatasourcePublicAPI => ({
        ...createMockDatasource('l1').publicAPIMock,
        getOperationForColumnId() {
          return {
            dataType: 'number',
            isBucketed: false,
            label: 'test_metric',
            isStaticValue: false,
            hasTimeShift: false,
            hasReducedTimeRange: false,
          };
        },
      });

      const getCustomPaletteToExpression = (palette: PaletteOutput<CustomPaletteParams>) => {
        const paletteService = chartPluginMock.createPaletteRegistry();
        const customPaletteToExpression = paletteService.get(CUSTOM_PALETTE)
          .toExpression as jest.Mock;
        const visualization = getLegacyMetricVisualization({ paletteService });

        visualization.toExpression(
          {
            ...exampleState(),
            colorMode: ColorMode.Background,
            palette,
          },
          { l1: numericDatasource() }
        );

        return customPaletteToExpression;
      };

      it('sends explicit stops for a custom palette', () => {
        const customPaletteToExpression = getCustomPaletteToExpression({
          type: 'palette',
          name: CUSTOM_PALETTE,
          params: {
            name: CUSTOM_PALETTE,
            stops: [
              { color: 'blue', stop: 10 },
              { color: 'red', stop: 20 },
            ],
          },
        });

        expect(customPaletteToExpression).toHaveBeenCalledWith(
          expect.objectContaining({ stops: [10, 20] })
        );
      });

      it('sends empty stops for a named palette so the renderer distributes across live data', () => {
        const customPaletteToExpression = getCustomPaletteToExpression({
          type: 'palette',
          name: 'status',
          params: {
            rangeType: 'number',
            stops: [
              { color: 'blue', stop: 10 },
              { color: 'red', stop: 20 },
            ],
          },
        });

        expect(customPaletteToExpression).toHaveBeenCalledWith(
          expect.objectContaining({ stops: [] })
        );
      });
    });
  });
});
