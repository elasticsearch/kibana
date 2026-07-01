/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import { act } from 'react-dom/test-utils';
import type { ReactWrapper } from 'enzyme';

import type { LensLayerType } from '@kbn/lens-common';
import { coreMock } from '@kbn/core/public/mocks';
import { LayerTypes } from '@kbn/expression-xy-plugin/public';

import {
  createMockFramePublicAPI,
  mockVisualizationMap,
  mockDatasourceMap,
  mockStoreDeps,
  mountWithReduxStore,
} from '../../../mocks';
import { createMockStartDependencies } from '../../../editor_frame_service/mocks';
import type { MountStoreProps } from '../../../mocks';
import type { LensPluginStartDependencies } from '../../../plugin';
import { generateId } from '../../../id_generator';
import { EditorFrameServiceProvider } from '../../../editor_frame_service/editor_frame_service_context';
import {
  addLayer as addLayerAction,
  setSelectedLayerId,
  useLensDispatch,
} from '../../../state_management';

import { LayerTabsWrapper } from './layer_tabs';
import type { LayerTabsProps } from './types';

jest.mock('../../../id_generator');

jest.mock('@kbn/kibana-utils-plugin/public', () => {
  const original = jest.requireActual('@kbn/kibana-utils-plugin/public');
  return {
    ...original,
    Storage: class Storage {
      get = () => ({ skipDeleteModal: true });
    },
  };
});

// Test component that renders add layer buttons connected to Redux
function AddLayerButtonsTestComponent({
  visualizationMap,
}: {
  visualizationMap: ReturnType<typeof mockVisualizationMap>;
}) {
  const dispatchLens = useLensDispatch();

  const addLayer = useCallback(
    (layerType: LensLayerType) => {
      const layerId = generateId();
      dispatchLens(addLayerAction({ layerId, layerType, extraArg: undefined }));
      dispatchLens(setSelectedLayerId({ layerId }));
    },
    [dispatchLens]
  );

  return (
    <div data-test-subj="lnsAddLayerButtonWrapper">
      {visualizationMap.testVis.getAddLayerButtonComponent?.({
        state: 'state',
        supportedLayers: [],
        addLayer,
        ensureIndexPattern: async () => {},
        registerLibraryAnnotationGroup: () => {},
        isInlineEditing: true,
      })}
    </div>
  );
}

const addNewLayer = (instance: ReactWrapper, type: LensLayerType = LayerTypes.REFERENCELINE) =>
  act(() => {
    instance.find(`button[data-test-subj="${type}"]`).first().simulate('click');
  });

const waitMs = (time: number) => new Promise((r) => setTimeout(r, time));

let container: HTMLDivElement | undefined;

beforeEach(() => {
  container = document.createElement('div');
  container.id = 'lensContainer';
  document.body.appendChild(container);
});

afterEach(() => {
  if (container && container.parentNode) {
    container.parentNode.removeChild(container);
  }

  container = undefined;
});

describe('LayerTabs', () => {
  const frame = createMockFramePublicAPI();

  function prepareAndMountComponent(
    props: ReturnType<typeof getDefaultProps>,
    customStoreProps?: Partial<MountStoreProps>
  ) {
    (generateId as jest.Mock).mockReturnValue(`newId`);
    const { visualizationMap, datasourceMap, ...rest } = props;
    return mountWithReduxStore(
      <EditorFrameServiceProvider visualizationMap={visualizationMap} datasourceMap={datasourceMap}>
        <div>
          {/* Render the add layer button component separately like in the actual UI */}
          <AddLayerButtonsTestComponent visualizationMap={visualizationMap} />
          <LayerTabsWrapper {...rest} />
        </div>
      </EditorFrameServiceProvider>,
      {
        preloadedState: {
          datasourceStates: {
            formBased: {
              isLoading: false,
              state: 'state',
            },
          },
          activeDatasourceId: 'formBased',
          visualization: {
            activeId: 'testVis',
            state: 'state',
            selectedLayerId: 'layer1',
          },
          query: undefined,
        },
        storeDeps: mockStoreDeps({
          datasourceMap,
          visualizationMap,
        }),
        ...customStoreProps,
      },
      {
        attachTo: container,
      }
    );
  }

  function getDefaultProps(
    { datasourceMap = mockDatasourceMap(), visualizationMap = mockVisualizationMap() } = {
      datasourceMap: mockDatasourceMap(),
      visualizationMap: mockVisualizationMap(),
    }
  ): LayerTabsProps & {
    visualizationMap: ReturnType<typeof mockVisualizationMap>;
    datasourceMap: ReturnType<typeof mockDatasourceMap>;
  } {
    frame.datasourceLayers = {
      first: datasourceMap.formBased.publicAPIMock,
    };

    // Override getAddLayerButtonComponent to return simple buttons for testing
    visualizationMap.testVis.getAddLayerButtonComponent = (props) => {
      return (
        <>
          <button
            data-test-subj={LayerTypes.REFERENCELINE}
            onClick={() => props.addLayer(LayerTypes.REFERENCELINE)}
          />
          <button
            data-test-subj={LayerTypes.ANNOTATIONS}
            onClick={() => props.addLayer(LayerTypes.ANNOTATIONS)}
          />
        </>
      );
    };

    const mockStartDependencies =
      createMockStartDependencies() as unknown as LensPluginStartDependencies;

    return {
      visualizationMap,
      datasourceMap,
      framePublicAPI: frame,
      coreStart: coreMock.createStart(),
      uiActions: mockStartDependencies.uiActions,
    };
  }

  describe('noDatasource layer type', () => {
    it('When visualization is `noDatasource` should not run datasource methods', async () => {
      const datasourceMap = mockDatasourceMap();
      const visualizationMap = mockVisualizationMap();

      visualizationMap.testVis.setDimension = jest.fn();
      visualizationMap.testVis.getSupportedLayers = jest.fn(() => [
        {
          type: LayerTypes.DATA,
          label: 'Data Layer',
          initialDimensions: [
            {
              groupId: 'testGroup',
              columnId: 'myColumn',
              staticValue: 100,
            },
          ],
        },
        {
          type: LayerTypes.REFERENCELINE,
          label: 'Reference layer',
        },
        {
          type: LayerTypes.ANNOTATIONS,
          label: 'Annotations Layer',
          noDatasource: true,
          initialDimensions: [
            {
              groupId: 'a',
              columnId: 'newId',
              staticValue: 100,
            },
          ],
        },
      ]);

      datasourceMap.formBased.initializeDimension = jest.fn();
      const props = getDefaultProps({ visualizationMap, datasourceMap });
      const { instance, lensStore } = await prepareAndMountComponent(props);

      // Wait for component to mount and update
      await waitMs(0);
      instance.update();

      addNewLayer(instance, LayerTypes.ANNOTATIONS);

      // Wait for state updates
      await waitMs(0);

      // One call for adding the layer, one call for setting it as the current selected layer
      expect(lensStore.dispatch).toHaveBeenCalledTimes(2);

      expect(visualizationMap.testVis.setDimension).toHaveBeenCalledWith({
        columnId: 'newId',
        frame: {
          dataViews: expect.anything(),
          activeData: undefined,
          datasourceLayers: {
            a: expect.anything(),
          },
          dateRange: expect.anything(),
          absDateRange: expect.anything(),
          filters: [],
          now: expect.anything(),
          query: undefined,
        },
        groupId: 'a',
        layerId: 'newId',
        prevState: undefined,
      });
      expect(datasourceMap.formBased.initializeDimension).not.toHaveBeenCalled();
    });

    it('should not add an initial dimension when not specified', async () => {
      const datasourceMap = mockDatasourceMap();
      const visualizationMap = mockVisualizationMap();

      visualizationMap.testVis.getSupportedLayers = jest.fn(() => [
        { type: LayerTypes.DATA, label: 'Data Layer' },
        {
          type: LayerTypes.REFERENCELINE,
          label: 'Reference layer',
        },
      ]);
      datasourceMap.formBased.initializeDimension = jest.fn();
      const props = getDefaultProps({ datasourceMap, visualizationMap });

      const { instance, lensStore } = await prepareAndMountComponent(props);
      addNewLayer(instance);

      // One call for adding the layer, one call for setting it as the current selected layer
      expect(lensStore.dispatch).toHaveBeenCalledTimes(2);
      expect(datasourceMap.formBased.initializeDimension).not.toHaveBeenCalled();
    });

    it('should not add an initial dimension when initialDimensions are not available for the given layer type', async () => {
      const datasourceMap = mockDatasourceMap();
      const visualizationMap = mockVisualizationMap();
      datasourceMap.formBased.initializeDimension = jest.fn();

      visualizationMap.testVis.getSupportedLayers = jest.fn(() => [
        {
          type: LayerTypes.DATA,
          label: 'Data Layer',
          initialDimensions: [
            {
              groupId: 'testGroup',
              columnId: 'myColumn',
              staticValue: 100,
            },
          ],
        },
        {
          type: LayerTypes.REFERENCELINE,
          label: 'Reference layer',
        },
      ]);
      const props = getDefaultProps({ datasourceMap, visualizationMap });
      const { instance, lensStore } = await prepareAndMountComponent(props);

      addNewLayer(instance);
      // One call for adding the layer, one call for setting it as the current selected layer
      expect(lensStore.dispatch).toHaveBeenCalledTimes(2);
      expect(datasourceMap.formBased.initializeDimension).not.toHaveBeenCalled();
    });

    it('should use group initial dimension value when adding a new layer if available', async () => {
      const datasourceMap = mockDatasourceMap();
      const visualizationMap = mockVisualizationMap();

      // Set up visualization to return 2 layers initially so tabs render
      visualizationMap.testVis.getLayerIds = jest.fn(() => ['layer1', 'layer2']);
      visualizationMap.testVis.getConfiguration = jest.fn(() => ({
        groups: [
          {
            layerId: 'layer1',
            groupId: 'a',
            groupLabel: 'A',
            accessors: [],
            filterOperations: () => true,
            supportsMoreColumns: true,
            dataTestSubj: 'mockVisA',
          },
        ],
      }));

      visualizationMap.testVis.getSupportedLayers = jest.fn(() => [
        { type: LayerTypes.DATA, label: 'Data Layer' },
        {
          type: LayerTypes.REFERENCELINE,
          label: 'Reference layer',
          initialDimensions: [
            {
              groupId: 'testGroup',
              columnId: 'myColumn',
              staticValue: 100,
            },
          ],
        },
      ]);
      datasourceMap.formBased.initializeDimension = jest.fn();
      const props = getDefaultProps({ datasourceMap, visualizationMap });

      const { instance, lensStore } = await prepareAndMountComponent(props);
      addNewLayer(instance);

      // One call for adding the layer, one call for setting it as the current selected layer
      expect(lensStore.dispatch).toHaveBeenCalledTimes(2);
      expect(datasourceMap.formBased.initializeDimension).toHaveBeenCalledWith(
        {},
        'newId',
        frame.dataViews.indexPatterns,
        {
          columnId: 'myColumn',
          groupId: 'testGroup',
          staticValue: 100,
          activeVisualizationTypeId: 'testVis',
          visualizationGroups: [
            expect.objectContaining({
              accessors: [],
              dataTestSubj: 'mockVisA',
              groupId: 'a',
              groupLabel: 'A',
              layerId: 'layer1',
              supportsMoreColumns: true,
            }),
          ],
        }
      );
    });
  });

  describe('layer reset and remove', () => {
    it('should hide layer tabs when single layer', async () => {
      const datasourceMap = mockDatasourceMap();
      const visualizationMap = mockVisualizationMap();

      // Set up visualization to return a single layer
      visualizationMap.testVis.getLayerIds = jest.fn(() => ['layer1']);
      visualizationMap.testVis.getConfiguration = jest.fn(() => ({
        groups: [
          {
            layerId: 'layer1',
            groupId: 'a',
            groupLabel: 'A',
            accessors: [],
            filterOperations: () => true,
            supportsMoreColumns: true,
            dataTestSubj: 'mockVisA',
          },
        ],
      }));

      const props = getDefaultProps({ visualizationMap, datasourceMap });

      const { instance } = await prepareAndMountComponent(props);

      // Layer tabs should not be rendered when there's only one layer
      expect(instance.find('[data-test-subj="lnsLayerActions"]').exists()).toBe(false);

      // UnifiedTabs component should not be rendered
      expect(instance.find('UnifiedTabs').exists()).toBe(false);
    });

    it('should show layer actions menu when multiple layers', async () => {
      const datasourceMap = mockDatasourceMap();
      const visualizationMap = mockVisualizationMap();

      // Mock multiple layers
      visualizationMap.testVis.getLayerIds = jest.fn(() => ['layer1', 'layer2']);
      visualizationMap.testVis.getConfiguration = jest.fn(() => ({
        groups: [
          {
            layerId: 'layer1',
            groupId: 'a',
            groupLabel: 'A',
            accessors: [],
            filterOperations: () => true,
            supportsMoreColumns: true,
            dataTestSubj: 'mockVisA',
          },
        ],
      }));

      const props = getDefaultProps({ visualizationMap, datasourceMap });

      const { instance } = await prepareAndMountComponent(props, {
        preloadedState: {
          datasourceStates: {
            formBased: {
              isLoading: false,
              state: 'state',
            },
          },
          activeDatasourceId: 'formBased',
          visualization: {
            activeId: 'testVis',
            state: 'state',
            selectedLayerId: 'layer1',
          },
          query: undefined,
        },
      });

      // The tab action button should exist
      expect(instance.find('[data-test-subj="lnsLayerActions"]').exists()).toBe(true);

      // Click the tab action button to open the menu
      act(() => {
        instance.find('button[aria-label="Layer actions"]').first().simulate('click');
      });
      instance.update();

      // The layer actions menu should exist (contains reset/remove buttons)
      expect(instance.find('[data-test-subj="lnsLayerActionsMenu"]').exists()).toBe(true);

      // The delete action should exist
      expect(instance.find('button[aria-label="Delete layer"]').exists()).toBe(true);
    });

    it('should call the remove callback when deleting layer', async () => {
      const datasourceMap = mockDatasourceMap();
      const visualizationMap = mockVisualizationMap();

      // Set up visualization to return 2 layers (tabs visible, shows "Delete layer")
      visualizationMap.testVis.getLayerIds = jest.fn(() => ['layer1', 'layer2']);
      visualizationMap.testVis.getConfiguration = jest.fn(() => ({
        groups: [
          {
            layerId: 'layer1',
            groupId: 'a',
            groupLabel: 'A',
            accessors: [],
            filterOperations: () => true,
            supportsMoreColumns: true,
            dataTestSubj: 'mockVisA',
          },
          {
            layerId: 'layer2',
            groupId: 'b',
            groupLabel: 'B',
            accessors: [],
            filterOperations: () => true,
            supportsMoreColumns: true,
            dataTestSubj: 'mockVisB',
          },
        ],
      }));

      const props = getDefaultProps({ visualizationMap, datasourceMap });

      const { instance, lensStore } = await prepareAndMountComponent(props);

      // Click the tab action button to open the menu
      act(() => {
        instance.find('button[aria-label="Layer actions"]').first().simulate('click');
      });
      instance.update();

      // Click the delete layer button
      act(() => {
        instance.find('button[aria-label="Delete layer"]').first().simulate('click');
      });
      instance.update();

      // Wait for state updates
      await waitMs(0);

      // lens/removeOrClearLayer action should be dispatched
      expect(lensStore.dispatch).toHaveBeenCalledWith({
        payload: {
          layerId: 'layer1',
          layerIds: ['layer1', 'layer2'],
          visualizationId: 'testVis',
        },
        type: 'lens/removeOrClearLayer',
      });
    });
  });
});
