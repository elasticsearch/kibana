/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';
import {
  createMockVisualization,
  mockStoreDeps,
  createMockFramePublicAPI,
  mockDatasourceMap,
  mockDatasourceStates,
  renderWithReduxStore,
} from '../../../../mocks';

import type {
  LensAppState,
  DatasourcePublicAPI,
  SuggestionRequest,
  DatasourceSuggestion,
  LensDocument,
  VisualizationMap,
} from '@kbn/lens-common';
import type { ChartSwitchProps } from './chart_switch';
import { getPersistedLayerVisualizationTypeId } from './chart_switch';
import { ChartSwitchPopover } from './chart_switch_popover';
import { applyChanges } from '../../../../state_management';
import { faker } from '@faker-js/faker';
import { EditorFrameServiceProvider } from '../../../editor_frame_service_context';

const mockFrame = (layers: string[]) => ({
  ...createMockFramePublicAPI(),
  datasourceLayers: layers.reduce(
    (acc, layerId) => ({
      ...acc,
      [layerId]: {
        getTableSpec: jest.fn(() => [{ columnId: 'col2' }]),
        getOperationForColumnId: () => {},
      } as unknown as DatasourcePublicAPI,
    }),
    {} as Record<string, DatasourcePublicAPI>
  ),
});

const datasourceSuggestions: Record<string, DatasourceSuggestion[]> = {
  unchanged: [
    {
      state: 'formBased suggestion',
      table: {
        columns: [
          {
            columnId: 'col1',
            operation: {
              label: '',
              dataType: 'string',
              isBucketed: true,
            },
          },
          {
            columnId: 'col2',
            operation: {
              label: '',
              dataType: 'number',
              isBucketed: false,
            },
          },
        ],
        layerId: 'a',
        isMultiRow: true,
        changeType: 'unchanged',
      },
      keptLayerIds: ['a', 'b'],
    },
  ],
  layers: [
    {
      state: 'formBased suggestion layer a',
      table: {
        columns: [
          {
            columnId: 'col1',
            operation: {
              label: '',
              dataType: 'string',
              isBucketed: true,
            },
          },
          {
            columnId: 'col2',
            operation: {
              label: '',
              dataType: 'number',
              isBucketed: false,
            },
          },
        ],
        layerId: 'a',
        isMultiRow: true,
        changeType: 'layers',
      },
      keptLayerIds: ['a'],
    },
    {
      state: 'formBased suggestion layer b',
      table: {
        columns: [
          {
            columnId: 'col1',
            operation: {
              label: '',
              dataType: 'string',
              isBucketed: true,
            },
          },
          {
            columnId: 'col2',
            operation: {
              label: '',
              dataType: 'number',
              isBucketed: false,
            },
          },
        ],
        layerId: 'b',
        isMultiRow: true,
        changeType: 'layers',
      },
      keptLayerIds: ['b'],
    },
  ],
};

describe('chart_switch', () => {
  let visualizationMap = mockVisualizationMap();
  let datasourceMap = mockDatasourceMap();
  let datasourceStates = mockDatasourceStates();
  let frame = mockFrame(['a']);

  beforeEach(() => {
    visualizationMap = mockVisualizationMap();
    datasourceMap = mockDatasourceMap();
    datasourceStates = mockDatasourceStates();
    frame = mockFrame(['a']);
  });
  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * There are three visualizations. Each one has the following suggestion behavior:
   *
   * testVis: suggests an empty state
   * testVis2: suggests an empty state
   * testVis3:
   *  - Never switches to subvisC2
   *  - Allows a switch to subvisC3
   *  - Allows a switch to subvisC1
   */
  function mockVisualizationMap() {
    return {
      testVis: {
        ...createMockVisualization('testVis'),
        getSuggestions: jest.fn((options) => [
          {
            score: 1,
            title: '',
            state: `suggestion layer a`,
            previewIcon: 'empty',
            keptLayers: ['a'],
          },
          {
            score: 1,
            title: '',
            state: `suggestion layer b`,
            previewIcon: 'empty',
            keptLayers: ['b'],
          },
        ]),
      },
      testVis2: {
        ...createMockVisualization('testVis2'),
        getSuggestions: jest.fn((options) => [
          {
            score: 1,
            title: '',
            state: `suggestion testVis2`,
            previewIcon: 'empty',
            keptLayers: ['a'],
          },
        ]),
      },
      testVis3: {
        ...createMockVisualization('testVis3'),
        initialize: jest.fn((_frame, state) => state ?? { type: 'subvisC1' }),
        visualizationTypes: ['subvisC1', 'subvisC2', 'subvisC3'].map((id) => ({
          icon: 'empty',
          id,
          label: id,
          sortPriority: 1,
          description: faker.lorem.sentence(),
        })),
        getVisualizationTypeId: jest.fn((state) => state.type),
        getSuggestions: jest.fn((options) => {
          if (options.subVisualizationId === 'subvisC2') {
            return [];
          }
          // Multiple suggestions need to be filtered
          return [
            {
              score: 1,
              title: 'Primary suggestion',
              state: { type: 'subvisC3' },
              previewIcon: 'empty',
            },
            {
              score: 1,
              title: '',
              state: { type: 'subvisC1', notPrimary: true },
              previewIcon: 'empty',
            },
          ];
        }),
        hiddenVis: { ...createMockVisualization('hiddenVis'), hideFromChartSwitch: () => true },
      },
    };
  }

  const renderChartSwitch = (
    propsOverrides: Partial<ChartSwitchProps> = {},
    { preloadedStateOverrides }: { preloadedStateOverrides: Partial<LensAppState> } = {
      preloadedStateOverrides: {},
    }
  ) => {
    const { store, ...rtlRender } = renderWithReduxStore(
      <EditorFrameServiceProvider visualizationMap={visualizationMap} datasourceMap={datasourceMap}>
        <ChartSwitchPopover
          filteredVisualizationMap={visualizationMap}
          framePublicAPI={frame}
          layerId="a"
          {...propsOverrides}
        />
      </EditorFrameServiceProvider>,

      {},
      {
        storeDeps: mockStoreDeps({ datasourceMap, visualizationMap }),
        preloadedState: {
          visualization: {
            activeId: 'testVis',
            state: 'state from a',
            selectedLayerId: null,
          },
          datasourceStates,
          activeDatasourceId: 'formBased',
          ...preloadedStateOverrides,
        },
      }
    );

    // Disable pointer-events check: JSDOM doesn't compute CSS styles, so
    // elements rendered with pointer-events:none (e.g. EUI overlays) would
    // otherwise cause userEvent clicks to fail even though they work in browsers.
    const user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });

    const openChartSwitch = async () => {
      await user.click(screen.getByTestId('lnsChartSwitchPopover'));
      await waitFor(() => {
        expect(screen.getByTestId('lnsChartSwitchList')).toBeInTheDocument();
      });
    };

    const queryWarningNode = (subType: string) =>
      within(getMenuItem(subType)).queryByTestId(`lnsChartSwitchPopoverAlert_${subType}`);

    const getMenuItem = (subType: string) => {
      return screen.getByTestId(`lnsChartSwitchPopover_${subType}`);
    };

    const switchToVis = async (subType: string) => {
      await user.click(getMenuItem(subType));
      await waitForChartSwitchClosed();
    };

    const waitForChartSwitchClosed = async () => {
      await waitFor(() => {
        expect(screen.queryByTestId('lnsChartSwitchList')).not.toBeInTheDocument();
      });
    };

    return {
      ...rtlRender,
      store,
      switchToVis,
      getMenuItem,
      openChartSwitch,
      waitForChartSwitchClosed,
      queryWarningNode,
    };
  };

  describe('data loss indicators', () => {
    it('should indicate data loss if not all columns will be used', async () => {
      datasourceMap.formBased.getDatasourceSuggestionsFromCurrentState.mockReturnValue(
        datasourceSuggestions.unchanged
      );
      datasourceMap.formBased.publicAPIMock.getTableSpec.mockReturnValue([
        { columnId: 'col1', fields: [] },
        { columnId: 'col2', fields: [] },
        { columnId: 'col3', fields: [] },
      ]);

      const { openChartSwitch, queryWarningNode } = renderChartSwitch();
      await openChartSwitch();

      expect(queryWarningNode('testVis2')).toHaveTextContent(
        /Changing to this visualization modifies the current configuration/i
      );
    });

    it('should indicate data loss if not all layers will be used', async () => {
      frame = mockFrame(['a', 'b']);
      const { openChartSwitch, queryWarningNode } = renderChartSwitch();
      await openChartSwitch();

      expect(queryWarningNode('testVis2')).toHaveTextContent(
        'Changing to this visualization modifies currently selected layer`s configuration and removes all other layers.'
      );
    });

    it('should support multi-layer suggestions without data loss', async () => {
      frame = mockFrame(['a', 'b']);
      datasourceMap.formBased.getDatasourceSuggestionsFromCurrentState.mockReturnValue(
        datasourceSuggestions.unchanged
      );
      (frame.datasourceLayers.a?.getTableSpec as jest.Mock).mockReturnValue([
        { columnId: 'col2' },
        { columnId: 'col1' },
      ]);
      const { openChartSwitch, queryWarningNode } = renderChartSwitch();
      await openChartSwitch();
      expect(queryWarningNode('testVis2')).not.toBeInTheDocument();
    });

    it('should indicate data loss if no data will be used', async () => {
      visualizationMap.testVis2.getSuggestions.mockReturnValueOnce([]);
      const { openChartSwitch, queryWarningNode } = renderChartSwitch();
      await openChartSwitch();

      expect(queryWarningNode('testVis2')).toHaveTextContent(
        'Changing to this visualization clears the current configuration.'
      );
    });

    it('should not indicate data loss if there is no data', async () => {
      visualizationMap.testVis2.getSuggestions.mockReturnValueOnce([]);
      frame = mockFrame(['a']);
      (frame.datasourceLayers.a?.getTableSpec as jest.Mock).mockReturnValue([]);
      const { openChartSwitch, queryWarningNode } = renderChartSwitch();
      await openChartSwitch();
      expect(queryWarningNode('testVis2')).not.toBeInTheDocument();
    });

    it('should not show a warning when the subvisualization is the same', async () => {
      frame = mockFrame(['a', 'b', 'c']);

      visualizationMap.testVis3.getVisualizationTypeId.mockReturnValue('subvisC2');
      visualizationMap.testVis3.switchVisualizationType = jest.fn(() => ({ type: 'subvisC1' }));
      const { openChartSwitch, queryWarningNode } = renderChartSwitch(undefined, {
        preloadedStateOverrides: {
          visualization: {
            activeId: 'testVis3',
            state: { type: 'subvisC2' },
            selectedLayerId: null,
          },
        },
      });
      await openChartSwitch();

      expect(queryWarningNode('subvisC2')).not.toBeInTheDocument();
    });

    it('should not show a warning when the subvisualization is compatible', async () => {
      frame = mockFrame(['a', 'b', 'c']);

      visualizationMap.testVis3.getVisualizationTypeId.mockReturnValue('subvisC2');
      visualizationMap.testVis3.switchVisualizationType = jest.fn(() => ({ type: 'subvisC1' }));
      // we're mocking that subvisC1 is compatible with subvisC2
      visualizationMap.testVis3.isSubtypeCompatible = jest.fn(
        (t1, t2) => t2 === 'subvisC1' && t1 === 'subvisC2'
      );
      const { openChartSwitch, queryWarningNode } = renderChartSwitch(undefined, {
        preloadedStateOverrides: {
          visualization: {
            activeId: 'testVis3',
            state: { type: 'subvisC2' },
            selectedLayerId: null,
          },
        },
      });
      await openChartSwitch();

      // subvisC1 is compatible
      expect(queryWarningNode('subvisC1')).not.toBeInTheDocument();
      // subvisC2 is itself
      expect(queryWarningNode('subvisC2')).not.toBeInTheDocument();
      // subvisC3 is not compatible
      expect(queryWarningNode('subvisC3')).toHaveTextContent(
        'Changing to this visualization clears the current configuration.'
      );
    });
  });

  it('should initialize other visualization on switch', async () => {
    const { openChartSwitch, switchToVis } = renderChartSwitch();
    await openChartSwitch();
    await switchToVis('testVis2');
    expect(visualizationMap.testVis2.initialize).toHaveBeenCalled();
  });

  it('should use suggested state if there is a suggestion from the target visualization', async () => {
    const { store, openChartSwitch, switchToVis } = renderChartSwitch();
    await openChartSwitch();
    await switchToVis('testVis2');

    expect(store.dispatch).toHaveBeenCalledWith({
      type: 'lens/switchVisualization',
      payload: {
        suggestion: {
          visualizationState: 'testVis2 initial state',
          newVisualizationId: 'testVis2',
          datasourceId: 'formBased',
          datasourceState: {},
        },
        clearStagedPreview: true,
      },
    });
    expect(store.dispatch).not.toHaveBeenCalledWith({ type: applyChanges.type }); // should not apply changes automatically
  });

  it('should use suggestions to switch to new visualization', async () => {
    const { openChartSwitch, switchToVis } = renderChartSwitch();
    const initialState = 'suggested State';
    visualizationMap.testVis2.initialize.mockReturnValueOnce({ initial: true });
    visualizationMap.testVis2.getVisualizationTypeId.mockReturnValueOnce('testVis2');
    visualizationMap.testVis2.getSuggestions.mockReturnValueOnce([
      {
        title: 'Suggested vis',
        score: 1,
        state: initialState,
        previewIcon: 'empty',
        keptLayers: ['a'],
      },
    ]);
    await openChartSwitch();
    await switchToVis('testVis2');
    expect(visualizationMap.testVis2.getSuggestions).toHaveBeenCalled();
    expect(visualizationMap.testVis2.initialize).toHaveBeenCalledWith(
      expect.anything(),
      initialState
    );
  });

  it('should fall back when switching visualizations if the visualization has no suggested use', async () => {
    visualizationMap.testVis2.initialize.mockReturnValueOnce({ initial: true });
    visualizationMap.testVis2.getSuggestions.mockReturnValueOnce([]);
    const { openChartSwitch, switchToVis, waitForChartSwitchClosed } = renderChartSwitch();
    await openChartSwitch();
    await switchToVis('testVis2');

    expect(visualizationMap.testVis2.getSuggestions).toHaveBeenCalled();
    expect(visualizationMap.testVis2.initialize).toHaveBeenCalledWith(
      expect.any(Function), // generated layerId
      undefined,
      undefined
    );
    await waitForChartSwitchClosed();
  });

  it('should use initial state if there is no suggestion from the target visualization', async () => {
    visualizationMap.testVis2.getSuggestions.mockReturnValueOnce([]);
    (frame.datasourceLayers.a?.getTableSpec as jest.Mock).mockReturnValue([]);
    const { store, switchToVis, openChartSwitch } = renderChartSwitch();
    await openChartSwitch();
    await switchToVis('testVis2');

    expect(datasourceMap.formBased.removeLayer).toHaveBeenCalledWith({}, 'a'); // from preloaded state
    expect(store.dispatch).toHaveBeenCalledWith({
      type: 'lens/switchVisualization',
      payload: {
        suggestion: {
          visualizationState: 'testVis2 initial state',
          newVisualizationId: 'testVis2',
        },
        clearStagedPreview: true,
      },
    });
    expect(store.dispatch).toHaveBeenCalledWith({
      type: 'lens/removeLayers',
      payload: { layerIds: ['a'], visualizationId: 'testVis' },
    });
  });

  it('should query main palette from active chart and pass into suggestions', async () => {
    const legacyPalette: SuggestionRequest['mainPalette'] = {
      type: 'legacyPalette',
      value: { type: 'palette', name: 'mock' },
    };
    visualizationMap.testVis.getMainPalette = jest.fn(() => legacyPalette);
    visualizationMap.testVis2.getSuggestions.mockReturnValueOnce([]);
    frame = mockFrame(['a', 'b', 'c']);
    datasourceMap.formBased.getLayers.mockReturnValue(['a', 'b', 'c']);

    const { openChartSwitch, switchToVis } = renderChartSwitch();
    await openChartSwitch();
    await switchToVis('testVis2');

    expect(visualizationMap.testVis.getMainPalette).toHaveBeenCalledWith('state from a');

    expect(visualizationMap.testVis2.getSuggestions).toHaveBeenCalledWith(
      expect.objectContaining({
        keptLayerIds: ['a'],
        mainPalette: legacyPalette,
      })
    );
  });

  it('should ensure the new visualization has the proper subtype', async () => {
    visualizationMap.testVis2.switchVisualizationType = jest.fn(
      (visualizationType, state) => `${state} ${visualizationType}`
    );
    const { openChartSwitch, switchToVis, store } = renderChartSwitch();
    await openChartSwitch();
    await switchToVis('testVis2');

    expect(store.dispatch).toHaveBeenCalledWith({
      type: 'lens/switchVisualization',
      payload: {
        suggestion: {
          visualizationState: 'testVis2 initial state testVis2',
          newVisualizationId: 'testVis2',
          datasourceId: 'formBased',
          datasourceState: {},
        },
        clearStagedPreview: true,
      },
    });
  });

  it('should use the suggestion that matches the subtype', async () => {
    const { openChartSwitch, switchToVis } = renderChartSwitch(undefined, {
      preloadedStateOverrides: {
        visualization: {
          activeId: 'testVis3',
          state: { type: 'subvisC3' },
          selectedLayerId: null,
        },
      },
    });
    await openChartSwitch();
    await switchToVis('subvisC1');
    expect(visualizationMap.testVis3.switchVisualizationType).toHaveBeenCalledWith(
      'subvisC1',
      {
        type: 'subvisC1',
        notPrimary: true,
      },
      'a'
    );
  });

  describe('multi-layer suggestions', () => {
    it('should use suggestion for chart switch for selected layer', async () => {
      frame = mockFrame(['a', 'b']);
      datasourceMap.formBased.getLayers.mockReturnValue(['a', 'b']);
      datasourceMap.formBased.getDatasourceSuggestionsFromCurrentState.mockReturnValue(
        datasourceSuggestions.layers
      );
      (frame.datasourceLayers.a?.getTableSpec as jest.Mock).mockReturnValue([
        { columnId: 'col2' },
        { columnId: 'col1' },
      ]);
      (frame.datasourceLayers.b?.getTableSpec as jest.Mock).mockReturnValue([
        { columnId: 'col2' },
        { columnId: 'col1' },
      ]);

      const { store, openChartSwitch, switchToVis } = renderChartSwitch({ layerId: 'b' });
      await openChartSwitch();
      await switchToVis('testVis2');

      expect(store.dispatch).toHaveBeenCalledWith({
        type: 'lens/switchVisualization',
        payload: {
          suggestion: {
            visualizationState: 'testVis2 initial state',
            newVisualizationId: 'testVis2',
            datasourceId: 'formBased',
            datasourceState: 'formBased suggestion layer b',
          },
          clearStagedPreview: true,
        },
      });
      expect(store.dispatch).not.toHaveBeenCalledWith({ type: applyChanges.type }); // should not apply changes automatically
    });

    it('should not remove layers when switching between subtypes', async () => {
      frame = mockFrame(['a', 'b', 'c']);
      visualizationMap.testVis3.switchVisualizationType = jest.fn(() => 'switched');

      const { openChartSwitch, switchToVis, store } = renderChartSwitch(undefined, {
        preloadedStateOverrides: {
          visualization: {
            activeId: 'testVis3',
            state: { type: 'subvisC1' },
            selectedLayerId: null,
          },
        },
      });

      await openChartSwitch();
      await switchToVis('subvisC3');
      expect(visualizationMap.testVis3.switchVisualizationType).toHaveBeenCalledWith(
        'subvisC3',
        {
          type: 'subvisC3',
        },
        'a'
      );

      expect(store.dispatch).toHaveBeenCalledWith({
        type: 'lens/switchVisualization',
        payload: {
          suggestion: {
            datasourceId: 'formBased',
            datasourceState: {},
            visualizationState: 'switched',
            newVisualizationId: 'testVis3',
          },
          clearStagedPreview: true,
        },
      });
      expect(datasourceMap.formBased.removeLayer).not.toHaveBeenCalled();
    });

    it('should not remove layers and initialize with existing state when switching between subtypes without data', async () => {
      const datasourceLayers = frame.datasourceLayers as Record<string, DatasourcePublicAPI>;
      datasourceLayers.a.getTableSpec = jest.fn().mockReturnValue([]);

      visualizationMap.testVis3.getSuggestions = jest.fn().mockReturnValue([]);
      visualizationMap.testVis3.switchVisualizationType = jest.fn(() => 'switched');

      const { openChartSwitch, switchToVis } = renderChartSwitch(undefined, {
        preloadedStateOverrides: {
          visualization: {
            activeId: 'testVis3',
            state: { type: 'subvisC1' },
            selectedLayerId: null,
          },
        },
      });
      await openChartSwitch();
      await switchToVis('subvisC3');

      expect(visualizationMap.testVis3.switchVisualizationType).toHaveBeenCalledWith(
        'subvisC3',
        {
          type: 'subvisC1',
        },
        'a'
      );
      expect(datasourceMap.formBased.removeLayer).not.toHaveBeenCalled();
    });

    it('should switch to the updated datasource state', async () => {
      frame = mockFrame(['a', 'b']);

      datasourceMap.formBased.getDatasourceSuggestionsFromCurrentState.mockReturnValue(
        datasourceSuggestions.unchanged
      );

      const { openChartSwitch, switchToVis, store } = renderChartSwitch();
      await openChartSwitch();
      await switchToVis('testVis2');

      expect(store.dispatch).toHaveBeenCalledWith({
        type: 'lens/switchVisualization',
        payload: {
          suggestion: {
            newVisualizationId: 'testVis2',
            datasourceId: 'formBased',
            datasourceState: 'formBased suggestion',
            visualizationState: 'testVis2 initial state',
          },
          clearStagedPreview: true,
        },
      });
    });

    // it('should get suggestions when switching subvisualization based on the current layer', async () => {
    //   visualizationMap.testVis3.getSuggestions.mockReturnValueOnce([]);
    //   frame = mockFrame(['a', 'b', 'c']);
    //   datasourceMap.formBased.getLayers.mockReturnValue(['a', 'b', 'c']);

    //   const { openChartSwitch, switchToVis } = renderChartSwitch({ layerId: 'c' });
    //   openChartSwitch();
    //   screen.debug();
    //   switchToVis('testVis3');

    //   expect(datasourceMap.formBased.removeLayer).toHaveBeenCalledWith({}, 'a');
    //   expect(datasourceMap.formBased.removeLayer).toHaveBeenCalledWith({}, 'b');
    //   expect(datasourceMap.formBased.removeLayer).toHaveBeenCalledWith({}, 'c');
    //   expect(visualizationMap.testVis2.getSuggestions).toHaveBeenCalledWith(
    //     expect.objectContaining({
    //       keptLayerIds: ['a'],
    //     })
    //   );

    //   // expect(store.dispatch).toHaveBeenCalledWith({
    //   //   type: 'lens/switchVisualization',
    //   //   payload: {
    //   //     suggestion: {
    //   //       datasourceId: undefined,
    //   //       datasourceState: undefined,
    //   //       visualizationState: 'testVis2 initial state',
    //   //       newVisualizationId: 'testVis2',
    //   //     },
    //   //     clearStagedPreview: true,
    //   //   },
    //   // });
    // });

    it('should get suggestions when switching subvisualization', async () => {
      visualizationMap.testVis2.getSuggestions.mockReturnValueOnce([]);
      frame = mockFrame(['a', 'b', 'c']);
      datasourceMap.formBased.getLayers.mockReturnValue(['a', 'b', 'c']);

      const { openChartSwitch, switchToVis, store } = renderChartSwitch();
      await openChartSwitch();
      await switchToVis('testVis2');

      expect(datasourceMap.formBased.removeLayer).toHaveBeenCalledWith({}, 'a');
      expect(datasourceMap.formBased.removeLayer).toHaveBeenCalledWith({}, 'b');
      expect(datasourceMap.formBased.removeLayer).toHaveBeenCalledWith({}, 'c');
      expect(visualizationMap.testVis2.getSuggestions).toHaveBeenCalledWith(
        expect.objectContaining({
          keptLayerIds: ['a'],
        })
      );

      expect(store.dispatch).toHaveBeenCalledWith({
        type: 'lens/switchVisualization',
        payload: {
          suggestion: {
            datasourceId: undefined,
            datasourceState: undefined,
            visualizationState: 'testVis2 initial state',
            newVisualizationId: 'testVis2',
          },
          clearStagedPreview: true,
        },
      });
    });
  });
});

describe('getPersistedLayerVisualizationTypeId', () => {
  const buildPersistedDoc = (visualizationType: string): LensDocument =>
    ({
      visualizationType,
      state: { visualization: { some: 'state' } },
    } as unknown as LensDocument);

  const buildVisualizationMap = (id: string): VisualizationMap =>
    ({ [id]: createMockVisualization(id) } as unknown as VisualizationMap);

  it('returns undefined when there is no persisted document', () => {
    expect(
      getPersistedLayerVisualizationTypeId(undefined, buildVisualizationMap('lnsXY'), 'layer1')
    ).toBeUndefined();
  });

  it('returns undefined when the persisted visualization is not in the map', () => {
    expect(
      getPersistedLayerVisualizationTypeId(
        buildPersistedDoc('lnsXY'),
        buildVisualizationMap('lnsDatatable'),
        'layer1'
      )
    ).toBeUndefined();
  });

  it('resolves the persisted visualization type id from the matching visualization', () => {
    expect(
      getPersistedLayerVisualizationTypeId(
        buildPersistedDoc('lnsDatatable'),
        buildVisualizationMap('lnsDatatable'),
        'layer1'
      )
    ).toBe('lnsDatatable');
  });

  it('delegates resolution to the visualization, passing the persisted state and layer id', () => {
    const visualization = createMockVisualization('lnsXY');
    visualization.getVisualizationTypeId.mockImplementation((_state, layerId) => `bar-${layerId}`);
    const visualizationMap = { lnsXY: visualization } as unknown as VisualizationMap;
    const persistedDoc = buildPersistedDoc('lnsXY');

    const result = getPersistedLayerVisualizationTypeId(persistedDoc, visualizationMap, 'layer1');

    expect(result).toBe('bar-layer1');
    expect(visualization.getVisualizationTypeId).toHaveBeenCalledWith(
      persistedDoc.state.visualization,
      'layer1'
    );
  });
});
