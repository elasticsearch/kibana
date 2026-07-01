/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act } from 'react-dom/test-utils';
import type { Query, AggregateQuery } from '@kbn/es-query';

import type { MountStoreProps } from '../../../mocks';
import {
  createMockFramePublicAPI,
  mockVisualizationMap,
  mockDatasourceMap,
  mockStoreDeps,
} from '../../../mocks';
import type { DataViewsPublicPluginStart } from '@kbn/data-views-plugin/public';
import type { Visualization } from '@kbn/lens-common';
import { ConfigPanel } from './config_panel';
import { LayerPanel } from './layer_panel';
import { coreMock } from '@kbn/core/public/mocks';
import type { UiActionsStart } from '@kbn/ui-actions-plugin/public';
import { uiActionsPluginMock } from '@kbn/ui-actions-plugin/public/mocks';
import { generateId } from '../../../id_generator';
import { mountWithReduxStore } from '../../../mocks';
import { LayerTypes } from '@kbn/expression-xy-plugin/public';
import type { ReactWrapper } from 'enzyme';
import { createIndexPatternServiceMock } from '../../../mocks/data_views_service_mock';
import { AddLayerButton } from '../../../visualizations/xy/add_layer';
import { dataPluginMock } from '@kbn/data-plugin/public/mocks';
import { EditorFrameServiceProvider } from '../../editor_frame_service_context';

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

describe('ConfigPanel', () => {
  const frame = createMockFramePublicAPI();

  let uiActions: UiActionsStart;

  beforeEach(() => {
    uiActions = uiActionsPluginMock.createStartContract();
  });

  function prepareAndMountComponent(
    props: ReturnType<typeof getDefaultProps>,
    customStoreProps?: Partial<MountStoreProps>,
    query?: Query | AggregateQuery,
    selectedLayerId: string | null = 'first'
  ) {
    (generateId as jest.Mock).mockReturnValue(`newId`);
    const { visualizationMap, datasourceMap, ...rest } = props;
    return mountWithReduxStore(
      <EditorFrameServiceProvider visualizationMap={visualizationMap} datasourceMap={datasourceMap}>
        <ConfigPanel {...rest} />
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
          query: query as Query,
          visualization: {
            activeId: 'testVis',
            state: 'state',
            selectedLayerId,
          },
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
  ) {
    frame.datasourceLayers = {
      first: datasourceMap.formBased.publicAPIMock,
    };
    return {
      activeVisualizationId: 'testVis',
      visualizationMap,
      activeDatasourceId: 'formBased',
      datasourceMap,
      activeVisualization: {
        ...visualizationMap.testVis,
        getLayerIds: () => Object.keys(frame.datasourceLayers),
        getAddLayerButtonComponent: (props) => {
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
        },
      } as Visualization,
      datasourceStates: {
        formBased: {
          isLoading: false,
          state: 'state',
        },
      },
      indexPatternService: createIndexPatternServiceMock(),
      visualizationState: 'state',
      updateVisualization: jest.fn(),
      updateDatasource: jest.fn(),
      updateAll: jest.fn(),
      framePublicAPI: frame,
      dispatch: jest.fn(),
      core: coreMock.createStart(),
      isFullscreen: false,
      toggleFullscreen: jest.fn(),
      uiActions,
      dataViews: {} as DataViewsPublicPluginStart,
      data: dataPluginMock.createStartContract(),
      getUserMessages: () => [],
    };
  }

  // in what case is this test needed?
  it('should fail to render layerPanels if the public API is out of date', async () => {
    const props = getDefaultProps();
    props.framePublicAPI.datasourceLayers = {};
    const { instance } = await prepareAndMountComponent(props, undefined, undefined, null);
    expect(instance.find(LayerPanel).exists()).toBe(false);
  });

  it('updates datasources and visualizations', async () => {
    const props = getDefaultProps();
    const { instance, lensStore } = await prepareAndMountComponent(props);
    const { updateDatasource, updateAll } = instance.find(LayerPanel).props();

    const newDatasourceState = 'updated';
    updateDatasource('formBased', newDatasourceState);
    await waitMs(0);
    expect(lensStore.dispatch).toHaveBeenCalledTimes(1);
    expect((lensStore.dispatch as jest.Mock).mock.calls[0][0].payload.newDatasourceState).toEqual(
      'updated'
    );

    updateAll({
      datasourceId: 'formBased',
      newDatasourceState,
      layerId: 'first',
      groupId: 'a',
      columnId: 'col1',
    });
    // wait for one tick so async updater has a chance to trigger
    await waitMs(0);
    expect(lensStore.dispatch).toHaveBeenCalledTimes(2);
    expect((lensStore.dispatch as jest.Mock).mock.calls[0][0].payload.newDatasourceState).toEqual(
      'updated'
    );
  });

  describe('initial default value', () => {
    function clickToAddDimension(instance: ReactWrapper) {
      act(() => {
        instance.find('[data-test-subj="lns-empty-dimension"]').last().simulate('click');
      });
      return waitMs(0);
    }

    it('should add an initial dimension value when clicking on the empty dimension button', async () => {
      const datasourceMap = mockDatasourceMap();

      const visualizationMap = mockVisualizationMap();
      visualizationMap.testVis.getSupportedLayers = jest.fn(() => [
        {
          type: LayerTypes.DATA,
          label: 'Data Layer',
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

      await clickToAddDimension(instance);
      expect(lensStore.dispatch).toHaveBeenCalledTimes(1);

      expect(datasourceMap.formBased.initializeDimension).toHaveBeenCalledWith(
        'state',
        'first',
        frame.dataViews.indexPatterns,
        {
          groupId: 'a',
          columnId: 'newId',
          staticValue: 100,
          activeVisualizationTypeId: 'testVis',
          visualizationGroups: [
            expect.objectContaining({
              accessors: [],
              dataTestSubj: 'mockVisA',
              groupId: 'a',
              groupLabel: 'a',
              layerId: 'layer1',
              supportsMoreColumns: true,
            }),
          ],
        }
      );
    });
  });

  describe('text based languages', () => {
    it('should not allow to add a new layer', async () => {
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

      const { instance } = await prepareAndMountComponent(props, {}, { esql: 'from "foo"' });
      expect(instance.find(AddLayerButton).exists()).toBe(false);
    });
  });
});
