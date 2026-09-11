/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EnhancedStore } from 'redux-toolkit-v1';
import type { Query } from '@kbn/es-query';
import type { LensRootStore } from '.';
import {
  switchDatasource,
  switchAndCleanDatasource,
  switchVisualization,
  setState,
  updateDatasourceState,
  updateVisualizationState,
  removeOrClearLayer,
  addLayer,
  selectTriggerApplyChanges,
  selectChangesApplied,
  removeDimension,
  setLayerDefaultDimension,
  setDimensionAndUpdateDatasource,
  onDropToDimension,
} from '.';
import { LayerTypes } from '@kbn/expression-xy-plugin/public';
import {
  makeLensStore,
  defaultState,
  mockStoreDeps,
  createMockDatasource,
  createMockVisualization,
} from '../mocks';
import type {
  Datasource,
  DatasourceMap,
  Visualization,
  VisualizationDimensionGroupConfig,
  VisualizationMap,
  DataViewsState,
  LensAppState,
} from '@kbn/lens-common';
import { LENS_LAYER_TYPES } from '@kbn/lens-common';
import { applyChanges, disableAutoApply, enableAutoApply, setChangesApplied } from './lens_slice';

describe('lensSlice', () => {
  let store: EnhancedStore<{ lens: LensAppState }>;
  beforeEach(() => {
    store = makeLensStore().store;
    jest.clearAllMocks();
  });
  const customQuery = { query: 'custom' } as Query;

  describe('state update', () => {
    it('setState: updates state ', () => {
      const lensState = store.getState().lens;
      expect(lensState).toEqual(defaultState);
      store.dispatch(setState({ query: customQuery }));
      const changedState = store.getState().lens;
      expect(changedState).toEqual({ ...defaultState, query: customQuery });
    });

    describe('auto-apply-related actions', () => {
      it('should disable auto apply', () => {
        expect(store.getState().lens.autoApplyDisabled).toBeUndefined();
        expect(store.getState().lens.changesApplied).toBeUndefined();

        store.dispatch(disableAutoApply());

        expect(store.getState().lens.autoApplyDisabled).toBe(true);
        expect(store.getState().lens.changesApplied).toBe(true);
      });

      it('should enable auto-apply', () => {
        store.dispatch(disableAutoApply());

        expect(store.getState().lens.autoApplyDisabled).toBe(true);

        store.dispatch(enableAutoApply());

        expect(store.getState().lens.autoApplyDisabled).toBe(false);
      });

      it('applies changes when auto-apply disabled', () => {
        store.dispatch(disableAutoApply());

        store.dispatch(applyChanges());

        expect(selectTriggerApplyChanges(store.getState())).toBe(true);
      });

      it('does not apply changes if auto-apply enabled', () => {
        expect(store.getState().lens.autoApplyDisabled).toBeUndefined();

        store.dispatch(applyChanges());

        expect(selectTriggerApplyChanges(store.getState())).toBe(false);
      });

      it('sets changes-applied flag', () => {
        expect(store.getState().lens.changesApplied).toBeUndefined();

        store.dispatch(setChangesApplied(true));

        expect(selectChangesApplied(store.getState())).toBe(true);

        store.dispatch(setChangesApplied(false));

        expect(selectChangesApplied(store.getState())).toBe(true);
      });
    });

    it('should update the corresponding visualization state on update', () => {
      const newVisState = {};
      store.dispatch(
        updateVisualizationState({
          visualizationId: 'testVis',
          newState: newVisState,
        })
      );

      expect(store.getState().lens.visualization.state).toEqual(newVisState);
    });
    it('should update the layer state with passed in reducer', () => {
      const newDatasourceState = {};
      store.dispatch(
        updateDatasourceState({
          datasourceId: 'formBased',
          newDatasourceState,
        })
      );
      expect(store.getState().lens.datasourceStates.formBased.state).toStrictEqual(
        newDatasourceState
      );
    });
    it('should orchestrate setDimension and datasource update in reducer', () => {
      const newOperation = {
        dataType: 'date',
        scale: 'interval',
        isBucketed: true,
        label: 'Date Histogram',
      };
      const datasource = createMockDatasource('formBased');
      datasource.getLayers.mockReturnValue(['first']);
      datasource.getPublicAPI.mockImplementation(({ state }) => ({
        ...datasource.publicAPIMock,
        datasourceId: 'formBased',
        getOperationForColumnId: jest
          .fn()
          .mockReturnValue(state === 'new-datasource-state' ? newOperation : undefined),
      }));

      let operationSeenBySetDimension: unknown;
      const visualization = createMockVisualization('testVis', ['first']);
      visualization.setDimension.mockImplementation(({ frame, layerId, columnId, prevState }) => {
        operationSeenBySetDimension =
          frame.datasourceLayers[layerId]?.getOperationForColumnId(columnId);
        return prevState;
      });

      const { store: localStore } = makeLensStore({
        preloadedState: {
          activeDatasourceId: 'formBased',
          datasourceStates: {
            formBased: {
              isLoading: false,
              state: 'old-datasource-state',
            },
          },
          visualization: {
            activeId: 'testVis',
            state: {},
            selectedLayerId: null,
          },
        },
        storeDeps: mockStoreDeps({
          datasourceMap: {
            formBased: datasource,
          } as unknown as DatasourceMap,
          visualizationMap: {
            testVis: visualization,
          } as unknown as VisualizationMap,
        }),
      });

      localStore.dispatch(
        setDimensionAndUpdateDatasource({
          visualizationId: 'testVis',
          datasourceId: 'formBased',
          newDatasourceState: 'new-datasource-state',
          layerId: 'first',
          groupId: 'x',
          columnId: 'date_column',
        })
      );

      expect(visualization.setDimension).toHaveBeenCalled();
      expect(operationSeenBySetDimension).toEqual(newOperation);
      expect(localStore.getState().lens.datasourceStates.formBased.state).toBe(
        'new-datasource-state'
      );
    });
    it('should should switch active visualization', () => {
      const newVisState = {};
      store.dispatch(
        switchVisualization({
          suggestion: {
            newVisualizationId: 'testVis2',
            visualizationState: newVisState,
          },
          clearStagedPreview: true,
        })
      );

      expect(store.getState().lens.visualization.state).toBe(newVisState);
    });

    it('should should switch active visualization and update datasource state', () => {
      const newVisState = {};
      const newDatasourceState = {};

      store.dispatch(
        switchVisualization({
          suggestion: {
            newVisualizationId: 'testVis2',
            visualizationState: newVisState,
            datasourceState: newDatasourceState,
            datasourceId: 'formBased',
          },
          clearStagedPreview: true,
        })
      );

      expect(store.getState().lens.visualization.state).toBe(newVisState);
      expect(store.getState().lens.datasourceStates.formBased.state).toBe(newDatasourceState);
    });

    it('should switch active datasource and initialize new state', () => {
      store.dispatch(
        switchDatasource({
          newDatasourceId: 'textBased',
        })
      );

      expect(store.getState().lens.activeDatasourceId).toEqual('textBased');
      expect(store.getState().lens.datasourceStates.textBased.isLoading).toEqual(true);
    });

    it('should not initialize already initialized datasource on switch', () => {
      const datasource2State = {};
      const { store: customStore } = makeLensStore({
        preloadedState: {
          datasourceStates: {
            formBased: {
              state: {},
              isLoading: false,
            },
            textBased: {
              state: datasource2State,
              isLoading: false,
            },
          },
        },
      });

      customStore.dispatch(
        switchDatasource({
          newDatasourceId: 'textBased',
        })
      );

      expect(customStore.getState().lens.activeDatasourceId).toEqual('textBased');
      expect(customStore.getState().lens.datasourceStates.textBased.isLoading).toEqual(false);
      expect(customStore.getState().lens.datasourceStates.textBased.state).toBe(datasource2State);
    });

    describe('switching to a new datasource and modify the state', () => {
      it('should switch active datasource and initialize new state', () => {
        store.dispatch(
          switchAndCleanDatasource({
            newDatasourceId: 'textBased',
            visualizationId: 'testVis',
            currentIndexPatternId: 'testIndexPatternId',
          })
        );
        expect(store.getState().lens.activeDatasourceId).toEqual('textBased');
        expect(store.getState().lens.datasourceStates.textBased.isLoading).toEqual(false);
        expect(store.getState().lens.visualization.activeId).toEqual('testVis');
      });

      it('should should switch active datasource and clean the datasource state', () => {
        const datasource2State = {
          layers: {},
        };
        const { store: customStore } = makeLensStore({
          preloadedState: {
            datasourceStates: {
              formBased: {
                state: {},
                isLoading: false,
              },
              textBased: {
                state: datasource2State,
                isLoading: false,
              },
            },
          },
        });

        customStore.dispatch(
          switchAndCleanDatasource({
            newDatasourceId: 'textBased',
            visualizationId: 'testVis',
            currentIndexPatternId: 'testIndexPatternId',
          })
        );

        expect(customStore.getState().lens.activeDatasourceId).toEqual('textBased');
        expect(customStore.getState().lens.datasourceStates.textBased.isLoading).toEqual(false);
        expect(customStore.getState().lens.datasourceStates.textBased.state).toStrictEqual({});
      });
    });

    describe('adding or removing layer', () => {
      const formBased = (datasourceId: string) => {
        return {
          id: datasourceId,
          getPublicAPI: () => ({
            datasourceId,
            getOperationForColumnId: jest.fn(),
            getTableSpec: jest.fn(),
          }),
          getLayers: (layerIds: unknown) => layerIds as string[],
          clearLayer: (layerIds: unknown, layerId: string) => ({
            removedLayerIds: [],
            newState: (layerIds as string[]).map((id: string) =>
              id === layerId ? `${datasourceId}_clear_${layerId}` : id
            ),
          }),
          removeLayer: (layerIds: unknown, layerId: string) => ({
            newState: (layerIds as string[]).filter((id: string) => id !== layerId),
            removedLayerIds: [layerId],
          }),
          insertLayer: (layerIds: unknown, layerId: string, layersToLinkTo: string[]) => [
            ...(layerIds as string[]),
            layerId,
            ...layersToLinkTo,
          ],
          getCurrentIndexPatternId: jest.fn(() => 'indexPattern1'),
          getUsedDataView: jest.fn(() => 'indexPattern1'),
        };
      };
      const datasourceStates = {
        formBased: {
          isLoading: false,
          state: ['layer1'],
        },
        textBased: {
          isLoading: false,
          state: ['layer2'],
        },
      };
      const datasourceMap = {
        formBased: formBased('formBased'),
        textBased: formBased('textBased'),
      };

      const activeVisId = 'testVis';
      const visualizationMap = {
        [activeVisId]: {
          clearLayer: (layerIds: unknown, layerId: string) =>
            (layerIds as string[]).map((id: string) =>
              id === layerId ? `vis_clear_${layerId}` : id
            ),
          removeLayer: jest.fn((layerIds: unknown, layerId: string) =>
            (layerIds as string[]).filter((id: string) => id !== layerId)
          ),
          getLayerIds: (layerIds: unknown) => layerIds as string[],
          getLayersToLinkTo: (state, newLayerId) => ['linked-layer-id'],
          appendLayer: (layerIds: unknown, layerId: string) => [...(layerIds as string[]), layerId],
          getSupportedLayers: jest.fn(() => [{ type: LENS_LAYER_TYPES.DATA, label: 'Data Layer' }]),
        } as Partial<Visualization>,
      };

      let customStore: LensRootStore;
      beforeEach(() => {
        customStore = makeLensStore({
          preloadedState: {
            activeDatasourceId: 'formBased',
            datasourceStates,
            visualization: {
              activeId: activeVisId,
              state: ['layer1', 'layer2'],
              selectedLayerId: null,
            },
            stagedPreview: {
              visualization: {
                activeId: activeVisId,
                state: ['layer1', 'layer2'],
                selectedLayerId: null,
              },
              datasourceStates,
            },
          },
          storeDeps: mockStoreDeps({
            visualizationMap: visualizationMap as unknown as VisualizationMap,
            datasourceMap: datasourceMap as unknown as DatasourceMap,
          }),
        }).store;
      });

      it('addLayer: should add the layer to the datasource and visualization', () => {
        customStore.dispatch(
          addLayer({
            layerId: 'foo',
            layerType: LayerTypes.DATA,
            extraArg: 'some arg',
          })
        );
        const state = customStore.getState().lens;

        expect(state.visualization.state).toEqual(['layer1', 'layer2', 'foo']);
        expect(state.datasourceStates.formBased.state).toEqual([
          'layer1',
          'foo',
          'linked-layer-id',
        ]);
        expect(state.datasourceStates.textBased.state).toEqual(['layer2']);
        expect(state.stagedPreview).not.toBeDefined();
      });

      it('addLayer: should add the layer to the requested datasource', () => {
        customStore.dispatch(
          addLayer({
            layerId: 'foo',
            layerType: LayerTypes.REFERENCELINE,
            extraArg: undefined,
            datasourceId: 'textBased',
          })
        );
        const state = customStore.getState().lens;

        expect(state.visualization.state).toEqual(['layer1', 'layer2', 'foo']);
        expect(state.datasourceStates.formBased.state).toEqual(['layer1']);
        expect(state.datasourceStates.textBased.state).toEqual([
          'layer2',
          'foo',
          'linked-layer-id',
        ]);
      });

      it('addLayer: syncs linked dimensions', () => {
        const activeVisualization = visualizationMap[activeVisId];

        activeVisualization.getLinkedDimensions = jest.fn(() => [
          {
            from: {
              layerId: 'from-layer',
              columnId: 'from-column',
              groupId: 'from-group',
            },
            to: {
              layerId: 'from-layer',
              columnId: 'from-column',
              groupId: 'from-group',
            },
          },
        ]);
        activeVisualization.getConfiguration = jest.fn(() => ({
          groups: [{ groupId: 'to-group' } as VisualizationDimensionGroupConfig],
        }));
        activeVisualization.onDrop = jest.fn(({ prevState }) => prevState);
        (datasourceMap.formBased as unknown as Datasource).syncColumns = jest.fn(
          ({ state }) => state
        );

        customStore.dispatch(
          addLayer({
            layerId: 'foo',
            layerType: LENS_LAYER_TYPES.DATA,
            extraArg: undefined,
          })
        );

        expect(
          (
            (datasourceMap.formBased as unknown as Datasource).syncColumns as jest.Mock<
              Datasource['syncColumns']
            >
          ).mock.calls[0][0]
        ).toMatchInlineSnapshot(`
          Object {
            "getDimensionGroups": [Function],
            "indexPatterns": Object {},
            "links": Array [
              Object {
                "from": Object {
                  "columnId": "from-column",
                  "groupId": "from-group",
                  "layerId": "from-layer",
                },
                "to": Object {
                  "columnId": "from-column",
                  "groupId": "from-group",
                  "layerId": "from-layer",
                },
              },
            ],
            "state": Array [
              "layer1",
              "foo",
              "linked-layer-id",
            ],
          }
        `);

        expect(activeVisualization.onDrop).toHaveBeenCalledTimes(1);
        expect({
          ...(activeVisualization.onDrop as jest.Mock<Visualization['onDrop']>).mock.calls[0][0],
          frame: undefined,
        }).toMatchInlineSnapshot(`
          Object {
            "dropType": "duplicate_compatible",
            "frame": undefined,
            "group": undefined,
            "prevState": Array [
              "layer1",
              "layer2",
              "foo",
            ],
            "source": Object {
              "columnId": "from-column",
              "groupId": "from-group",
              "humanData": Object {
                "label": "",
              },
              "id": "from-column",
              "layerId": "from-layer",
            },
            "target": Object {
              "columnId": "from-column",
              "filterOperations": [Function],
              "groupId": "from-group",
              "layerId": "from-layer",
            },
          }
        `);
      });

      // These tests replicate behavior that was previously tested in ConfigPanel tests
      // back when that component rendered all layers. Now that layer management moved to tabs
      // into LayerTabs and addLayer is no longer part of ConfigPanel,
      // we are just testing the state behavior here.
      describe('setLayerDefaultDimension', () => {
        it('should not call initializeDimension when layer has noDatasource: true', () => {
          const activeVisualization = visualizationMap[activeVisId] as Visualization;
          const formBasedWithInit = {
            ...datasourceMap.formBased,
            initializeDimension: jest.fn((state) => state),
          };
          const setDimensionMock = jest.fn(({ prevState }) => prevState);

          const customStoreWithInit = makeLensStore({
            preloadedState: {
              activeDatasourceId: 'formBased',
              datasourceStates,
              visualization: {
                activeId: activeVisId,
                state: ['layer1'],
                selectedLayerId: null,
              },
            },
            storeDeps: mockStoreDeps({
              visualizationMap: {
                [activeVisId]: {
                  ...activeVisualization,
                  getSupportedLayers: jest.fn(() => [
                    {
                      type: LayerTypes.ANNOTATIONS,
                      label: 'Annotations',
                      noDatasource: true,
                      initialDimensions: [
                        {
                          groupId: 'testGroup',
                          columnId: 'testColumn',
                          staticValue: 100,
                        },
                      ],
                    },
                  ]),
                  getLayerType: jest.fn(() => LayerTypes.ANNOTATIONS),
                  setDimension: setDimensionMock,
                  getConfiguration: jest.fn(() => ({ groups: [] })),
                },
              } as unknown as VisualizationMap,
              datasourceMap: {
                formBased: formBasedWithInit,
              } as unknown as DatasourceMap,
            }),
          }).store;

          customStoreWithInit.dispatch(
            setLayerDefaultDimension({
              layerId: 'layer1',
              columnId: 'testColumn',
              groupId: 'testGroup',
            })
          );

          expect(formBasedWithInit.initializeDimension).not.toHaveBeenCalled();
          expect(setDimensionMock).toHaveBeenCalled();
        });

        it('should call initializeDimension when layer does not have noDatasource flag', () => {
          const activeVisualization = visualizationMap[activeVisId] as Visualization;
          const formBasedWithInit = {
            ...datasourceMap.formBased,
            initializeDimension: jest.fn((state) => state),
          };

          const customStoreWithInit = makeLensStore({
            preloadedState: {
              activeDatasourceId: 'formBased',
              datasourceStates,
              visualization: {
                activeId: activeVisId,
                state: ['layer1'],
                selectedLayerId: null,
              },
            },
            storeDeps: mockStoreDeps({
              visualizationMap: {
                [activeVisId]: {
                  ...activeVisualization,
                  getSupportedLayers: jest.fn(() => [
                    {
                      type: LayerTypes.DATA,
                      label: 'Data Layer',
                      initialDimensions: [
                        {
                          groupId: 'testGroup',
                          columnId: 'testColumn',
                          staticValue: 100,
                        },
                      ],
                    },
                  ]),
                  getLayerType: jest.fn(() => LayerTypes.DATA),
                  setDimension: jest.fn(({ prevState }) => prevState),
                  getConfiguration: jest.fn(() => ({ groups: [] })),
                },
              } as unknown as VisualizationMap,
              datasourceMap: {
                formBased: formBasedWithInit,
              } as unknown as DatasourceMap,
            }),
          }).store;

          customStoreWithInit.dispatch(
            setLayerDefaultDimension({
              layerId: 'layer1',
              columnId: 'testColumn',
              groupId: 'testGroup',
            })
          );

          expect(formBasedWithInit.initializeDimension).toHaveBeenCalled();
        });

        it('should not initialize dimension when no initialDimensions are specified', () => {
          const activeVisualization = visualizationMap[activeVisId] as Visualization;
          const formBasedWithInit = {
            ...datasourceMap.formBased,
            initializeDimension: jest.fn((state) => state),
          };

          const customStoreWithInit = makeLensStore({
            preloadedState: {
              activeDatasourceId: 'formBased',
              datasourceStates,
              visualization: {
                activeId: activeVisId,
                state: ['layer1'],
                selectedLayerId: null,
              },
            },
            storeDeps: mockStoreDeps({
              visualizationMap: {
                [activeVisId]: {
                  ...activeVisualization,
                  getSupportedLayers: jest.fn(() => [
                    {
                      type: LayerTypes.REFERENCELINE,
                      label: 'Reference Layer',
                      // No initialDimensions specified
                    },
                  ]),
                  getLayerType: jest.fn(() => LayerTypes.REFERENCELINE),
                  setDimension: jest.fn(({ prevState }) => prevState),
                  getConfiguration: jest.fn(() => ({ groups: [] })),
                },
              } as unknown as VisualizationMap,
              datasourceMap: {
                formBased: formBasedWithInit,
              } as unknown as DatasourceMap,
            }),
          }).store;

          customStoreWithInit.dispatch(
            setLayerDefaultDimension({
              layerId: 'layer1',
              columnId: 'testColumn',
              groupId: 'testGroup',
            })
          );

          expect(formBasedWithInit.initializeDimension).not.toHaveBeenCalled();
        });

        it('should route the dimension to the datasource that owns the layer on mixed panels', () => {
          // active datasource is textBased (ES|QL chart), but the reference line
          // layer lives in the formBased datasource
          const activeVisualization = visualizationMap[activeVisId] as Visualization;
          const formBasedWithInit = {
            ...formBased('formBased'),
            initializeDimension: jest.fn((state) => state),
          };
          const textBasedWithInit = {
            ...formBased('textBased'),
            initializeDimension: jest.fn((state) => state),
          };

          const customStoreWithInit = makeLensStore({
            preloadedState: {
              activeDatasourceId: 'textBased',
              datasourceStates: {
                formBased: { isLoading: false, state: ['refLayer'] },
                textBased: { isLoading: false, state: ['layer2'] },
              },
              visualization: {
                activeId: activeVisId,
                state: ['refLayer', 'layer2'],
                selectedLayerId: null,
              },
            },
            storeDeps: mockStoreDeps({
              visualizationMap: {
                [activeVisId]: {
                  ...activeVisualization,
                  getSupportedLayers: jest.fn(() => [
                    {
                      type: LayerTypes.REFERENCELINE,
                      label: 'Reference Layer',
                      initialDimensions: [
                        { groupId: 'testGroup', columnId: 'testColumn', staticValue: 100 },
                      ],
                    },
                  ]),
                  getLayerType: jest.fn(() => LayerTypes.REFERENCELINE),
                  setDimension: jest.fn(({ prevState }) => prevState),
                  getConfiguration: jest.fn(() => ({ groups: [] })),
                },
              } as unknown as VisualizationMap,
              datasourceMap: {
                formBased: formBasedWithInit,
                textBased: textBasedWithInit,
              } as unknown as DatasourceMap,
            }),
          }).store;

          customStoreWithInit.dispatch(
            setLayerDefaultDimension({
              layerId: 'refLayer',
              columnId: 'testColumn',
              groupId: 'testGroup',
            })
          );

          expect(formBasedWithInit.initializeDimension).toHaveBeenCalled();
          expect(textBasedWithInit.initializeDimension).not.toHaveBeenCalled();
        });
      });

      describe('onDropToDimension', () => {
        it('syncs the datasource that owns the target layer, not the active one', () => {
          // active datasource is textBased (ES|QL chart); the drop target layer
          // lives in formBased. Regression: syncLinkedDimensions defaulted to the
          // active datasource and its state overwrote the formBased state.
          const activeVisualization = visualizationMap[activeVisId] as Visualization;
          const droppedFormBasedState = ['refLayer', 'newColumnMarker'];
          const formBasedWithDrop = {
            ...formBased('formBased'),
            onDrop: jest.fn(() => droppedFormBasedState),
          };
          const textBasedWithDrop = {
            ...formBased('textBased'),
            onDrop: jest.fn(),
          };

          const customStoreWithDrop = makeLensStore({
            preloadedState: {
              activeDatasourceId: 'textBased',
              datasourceStates: {
                formBased: { isLoading: false, state: ['refLayer'] },
                textBased: { isLoading: false, state: ['dataLayer'] },
              },
              visualization: {
                activeId: activeVisId,
                state: ['refLayer', 'dataLayer'],
                selectedLayerId: null,
              },
            },
            storeDeps: mockStoreDeps({
              visualizationMap: {
                [activeVisId]: {
                  ...activeVisualization,
                  getConfiguration: jest.fn(() => ({ groups: [] })),
                  onDrop: jest.fn(({ prevState }) => prevState),
                  getLinkedDimensions: jest.fn(() => undefined),
                },
              } as unknown as VisualizationMap,
              datasourceMap: {
                formBased: formBasedWithDrop,
                textBased: textBasedWithDrop,
              } as unknown as DatasourceMap,
            }),
          }).store;

          customStoreWithDrop.dispatch(
            onDropToDimension({
              source: { id: 'col1', humanData: { label: 'Col 1' } },
              target: {
                layerId: 'refLayer',
                columnId: 'col2',
                groupId: 'testGroup',
                filterOperations: () => true,
              },
              dropType: 'duplicate_compatible',
            })
          );

          const { lens } = customStoreWithDrop.getState();
          expect(formBasedWithDrop.onDrop).toHaveBeenCalled();
          expect(textBasedWithDrop.onDrop).not.toHaveBeenCalled();
          // formBased received its own dropped state and was not overwritten
          // with the active (textBased) datasource state
          expect(lens.datasourceStates.formBased.state).toEqual(droppedFormBasedState);
          expect(lens.datasourceStates.textBased.state).toEqual(['dataLayer']);
        });
      });

      it('removeLayer: should remove the layer if it is not the only layer', () => {
        customStore.dispatch(
          removeOrClearLayer({
            visualizationId: 'testVis',
            layerId: 'layer1',
            layerIds: ['layer1', 'layer2'],
          })
        );
        const state = customStore.getState().lens;

        expect(state.visualization.state).toEqual(['layer2']);
        expect(state.datasourceStates.formBased.state).toEqual([]);
        expect(state.datasourceStates.textBased.state).toEqual(['layer2']);
        expect(state.stagedPreview).not.toBeDefined();
      });

      it('removeLayer: should remove the layer from a non-active datasource that owns it', () => {
        // active datasource is formBased, but layer2 lives in the textBased datasource
        customStore.dispatch(
          removeOrClearLayer({
            visualizationId: 'testVis',
            layerId: 'layer2',
            layerIds: ['layer1', 'layer2'],
          })
        );
        const state = customStore.getState().lens;

        expect(state.visualization.state).toEqual(['layer1']);
        expect(state.datasourceStates.formBased.state).toEqual(['layer1']);
        expect(state.datasourceStates.textBased.state).toEqual([]);
        expect(state.stagedPreview).not.toBeDefined();
      });

      it('removeLayer: should remove all layers from visualization that were removed by datasource', () => {
        const removedLayerId = 'other-removed-layer';

        // formBased3 is an artificial test datasource. Production only supports formBased and textBased.
        const formBased3 = formBased('formBased3');
        formBased3.removeLayer = (layerIds: unknown, layerId: string) => ({
          newState: (layerIds as string[]).filter((id: string) => id !== layerId),
          removedLayerIds: [layerId, removedLayerId],
        });

        const localStore = makeLensStore({
          preloadedState: {
            activeDatasourceId: 'formBased',
            datasourceStates: {
              ...datasourceStates,
              formBased3: {
                isLoading: false,
                state: [],
              },
            },
            visualization: {
              activeId: activeVisId,
              state: ['layer1', 'layer2'],
              selectedLayerId: null,
            },
            stagedPreview: {
              visualization: {
                activeId: activeVisId,
                state: ['layer1', 'layer2'],
                selectedLayerId: null,
              },
              datasourceStates,
            },
          },
          storeDeps: mockStoreDeps({
            visualizationMap: visualizationMap as unknown as VisualizationMap,
            datasourceMap: { ...datasourceMap, formBased3 } as unknown as DatasourceMap,
          }),
        }).store;

        localStore.dispatch(
          removeOrClearLayer({
            visualizationId: 'testVis',
            layerId: 'layer1',
            layerIds: ['layer1', 'layer2'],
          })
        );

        expect(visualizationMap[activeVisId].removeLayer).toHaveBeenCalledTimes(2);
      });
    });

    describe('removing a dimension', () => {
      const colToRemove = 'col-id';
      const otherCol = 'other-col-id';
      const datasourceId = 'formBased';

      interface DatasourceState {
        cols: string[];
      }

      const datasourceStates = {
        [datasourceId]: {
          isLoading: false,
          state: {
            cols: [colToRemove, otherCol],
          } as DatasourceState,
        },
      };

      const datasourceMap = {
        [datasourceId]: {
          id: datasourceId,
          removeColumn: jest.fn(({ prevState: state, columnId }) => ({
            ...(state as DatasourceState),
            cols: (state as DatasourceState).cols.filter((id) => id !== columnId),
          })),
          getLayers: () => [],
        } as Partial<Datasource>,
      };

      const activeVisId = 'testVis';

      const visualizationMap = {
        [activeVisId]: {
          removeDimension: jest.fn(({ prevState, columnId }) =>
            (prevState as string[]).filter((id) => id !== columnId)
          ),
        } as Partial<Visualization>,
      };

      const visualizationState = [colToRemove, otherCol];

      const dataViews = { indexPatterns: {} } as DataViewsState;

      const layerId = 'some-layer-id';

      let customStore: LensRootStore;
      beforeEach(() => {
        customStore = makeLensStore({
          preloadedState: {
            activeDatasourceId: datasourceId,
            datasourceStates,
            visualization: {
              activeId: activeVisId,
              state: visualizationState,
              selectedLayerId: null,
            },
            dataViews,
          } as Partial<LensAppState>,
          storeDeps: mockStoreDeps({
            visualizationMap: visualizationMap as unknown as VisualizationMap,
            datasourceMap: datasourceMap as unknown as DatasourceMap,
          }),
        }).store;
      });

      it('removes a dimension', () => {
        customStore.dispatch(
          removeDimension({
            layerId,
            columnId: colToRemove,
            datasourceId,
          })
        );

        const state = customStore.getState().lens;

        expect(datasourceMap[datasourceId].removeColumn).toHaveBeenCalledWith({
          layerId,
          columnId: colToRemove,
          prevState: datasourceStates[datasourceId].state,
          indexPatterns: dataViews.indexPatterns,
        });
        expect(visualizationMap[activeVisId].removeDimension).toHaveBeenCalledWith(
          expect.objectContaining({
            layerId,
            columnId: colToRemove,
            prevState: visualizationState,
          })
        );
        expect(state.visualization.state).toEqual([otherCol]);
        expect((state.datasourceStates[datasourceId].state as DatasourceState).cols).toEqual([
          otherCol,
        ]);
      });

      it('removes a dimension without touching the datasource', () => {
        customStore.dispatch(
          removeDimension({
            layerId,
            columnId: colToRemove,
            datasourceId: undefined,
          })
        );

        const state = customStore.getState().lens;

        expect(datasourceMap[datasourceId].removeColumn).not.toHaveBeenCalled();

        expect(visualizationMap[activeVisId].removeDimension).toHaveBeenCalledWith(
          expect.objectContaining({
            layerId,
            columnId: colToRemove,
            prevState: visualizationState,
          })
        );
        expect(state.visualization.state).toEqual([otherCol]);
      });

      it('removes linked dimensions', () => {
        visualizationMap[activeVisId].getLinkedDimensions = jest.fn(() => [
          {
            from: {
              columnId: colToRemove,
              layerId,
              groupId: '',
            },
            to: {
              columnId: otherCol,
              layerId,
              groupId: '',
            },
          },
        ]);

        customStore.dispatch(
          removeDimension({
            layerId,
            columnId: colToRemove,
            datasourceId,
          })
        );

        const state = customStore.getState().lens;

        expect(state.visualization.state).toEqual([]);
        expect((state.datasourceStates[datasourceId].state as DatasourceState).cols).toEqual([]);
      });
    });
  });
});
