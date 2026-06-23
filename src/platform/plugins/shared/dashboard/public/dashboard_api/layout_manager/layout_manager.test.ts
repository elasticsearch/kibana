/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { pick } from 'lodash';
import { BehaviorSubject, of } from 'rxjs';

import {
  ControlValuesSource,
  DEFAULT_DSL_OPTIONS_LIST_STATE,
  DEFAULT_PINNED_CONTROL_STATE,
} from '@kbn/controls-constants';
import type { DefaultEmbeddableApi } from '@kbn/embeddable-plugin/public';
import type {
  HasLibraryTransforms,
  PhaseEvent,
  PublishingSubject,
} from '@kbn/presentation-publishing';
import { initializeTitleManager } from '@kbn/presentation-publishing';

import type { DashboardState } from '../../../common';
import { getSampleDashboardState } from '../../mocks';
import type { initializeTrackPanel } from '../track_panel';
import type { initializeViewModeManager } from '../view_mode_manager';
import { deserializeLayout } from './deserialize_layout';
import { initializeLayoutManager } from './layout_manager';

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('54321'),
}));

// disable distinctUntilChanged for the sake of testing
jest.mock('rxjs', () => ({
  ...jest.requireActual('rxjs'),
  distinctUntilChanged: () => (v: any) => v, // pass through the value without filtering
}));

const trackPanelMock = {
  setScrollToPanelId: jest.fn(),
  setHighlightPanelId: jest.fn(),
} as unknown as ReturnType<typeof initializeTrackPanel>['api'];

const viewModeManagerMock = { api: { viewMode$: new BehaviorSubject('view') } } as ReturnType<
  typeof initializeViewModeManager
>;

describe('layout manager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const PANEL_ONE_ID = 'panelOne';

  const panel1 = {
    grid: { w: 1, h: 1, x: 0, y: 0 },
    type: 'testPanelType',
    config: { title: 'Panel One' },
    id: PANEL_ONE_ID,
  };

  const pinnedControls = [
    {
      ...DEFAULT_PINNED_CONTROL_STATE,
      id: 'control1',
      type: 'options_list_control',
      config: {
        ...DEFAULT_DSL_OPTIONS_LIST_STATE,
        values_source: ControlValuesSource.FIELD,
        data_view_id: '',
        field_name: '',
      },
    },
    {
      ...DEFAULT_PINNED_CONTROL_STATE,
      id: 'control2',
      type: 'options_list_control',
      config: {
        ...DEFAULT_DSL_OPTIONS_LIST_STATE,
        values_source: ControlValuesSource.FIELD,
        data_view_id: '',
        field_name: '',
      },
    },
  ] as DashboardState['pinned_panels'];

  const titleManager = initializeTitleManager(panel1.config);
  const panel1Api: DefaultEmbeddableApi = {
    type: 'testPanelType',
    uuid: PANEL_ONE_ID,
    phase$: {} as unknown as PublishingSubject<PhaseEvent | undefined>,
    ...titleManager.api,
    anyStateChange$: of(),
    serializeState: () => titleManager.getLatestState(),
    applySerializedState: jest.fn(),
  };

  const section1 = {
    title: 'Section one',
    collapsed: false,
    id: 'section1',
    grid: {
      y: 1,
    },
    panels: [panel1],
  };

  test('can register child APIs', () => {
    const layoutManager = initializeLayoutManager(
      viewModeManagerMock,
      undefined,
      [panel1],
      [],
      trackPanelMock
    );
    layoutManager.api.registerChildApi(panel1Api);
    expect(layoutManager.api.children$.getValue()[PANEL_ONE_ID]).toBe(panel1Api);
  });

  test('should apply incoming serialized child state during reset when supported', async () => {
    const layoutManager = initializeLayoutManager(
      viewModeManagerMock,
      undefined,
      [panel1],
      [],
      trackPanelMock
    );
    const applySerializedState = jest.fn().mockResolvedValue(undefined);

    layoutManager.api.registerChildApi({
      ...panel1Api,
      applySerializedState,
      hasUnsavedChanges$: new BehaviorSubject(false),
    } as DefaultEmbeddableApi);

    layoutManager.internalApi.reset(
      getSampleDashboardState({
        panels: [{ ...panel1, config: { title: 'Updated title' } }],
        pinned_panels: [],
      })
    );

    expect(applySerializedState).toHaveBeenCalledWith({ title: 'Updated title' });
  });

  test('should ignore child state application when child does not support it', async () => {
    const layoutManager = initializeLayoutManager(
      viewModeManagerMock,
      undefined,
      [panel1],
      [],
      trackPanelMock
    );
    layoutManager.api.registerChildApi({
      ...panel1Api,
      hasUnsavedChanges$: new BehaviorSubject(false),
    } as DefaultEmbeddableApi);

    layoutManager.internalApi.reset(
      getSampleDashboardState({
        panels: [{ ...panel1, config: { title: 'Updated title' } }],
        pinned_panels: [],
      })
    );

    expect(layoutManager.api.children$.getValue()[PANEL_ONE_ID]).toBeDefined();
  });

  test('should append incoming embeddables to existing panels', () => {
    const incomingEmbeddables = [
      {
        embeddableId: 'panelTwo',
        serializedState: {
          title: 'Panel Two',
        },
        size: {
          height: 1,
          width: 1,
        },
        type: 'testPanelType',
      },
      {
        embeddableId: 'panelThree',
        serializedState: {
          title: 'Panel Three',
        },
        size: {
          height: 1,
          width: 1,
        },
        type: 'anotherPanelType',
      },
    ];
    const layoutManager = initializeLayoutManager(
      viewModeManagerMock,
      incomingEmbeddables,
      [panel1],
      [],
      trackPanelMock
    );

    const layout = layoutManager.api.layout$.value;
    expect(Object.keys(layout.panels).length).toBe(3);
    expect(layout.panels.panelTwo).toEqual({
      grid: {
        h: 1,
        w: 1,
        x: 1,
        y: 0,
      },
      type: 'testPanelType',
    });
    expect(layout.panels.panelThree).toEqual({
      grid: {
        h: 1,
        w: 1,
        x: 2,
        y: 0,
      },
      type: 'anotherPanelType',
    });
    const incomingPanelStatePanelTwo =
      layoutManager.internalApi.getSerializedStateForPanel('panelTwo');
    const incomingPanelStatePanelThree =
      layoutManager.internalApi.getSerializedStateForPanel('panelThree');
    expect(incomingPanelStatePanelTwo).toEqual({
      title: 'Panel Two',
    });
    expect(incomingPanelStatePanelThree).toEqual({
      title: 'Panel Three',
    });
  });

  describe('duplicatePanel', () => {
    test('should add duplicated panel to layout', async () => {
      const layoutManager = initializeLayoutManager(
        viewModeManagerMock,
        undefined,
        [panel1],
        [],
        trackPanelMock
      );

      layoutManager.api.registerChildApi(panel1Api);

      await layoutManager.api.duplicatePanel('panelOne');

      const layout = layoutManager.api.layout$.value;
      expect(Object.keys(layout.panels).length).toBe(2);
      expect(layout.panels['54321']).toEqual({
        grid: {
          h: 1,
          w: 1,
          x: 1,
          y: 0,
        },
        type: 'testPanelType',
      });
      const duplicatedPanelState = layoutManager.internalApi.getSerializedStateForPanel('54321');
      expect(duplicatedPanelState).toEqual({
        title: 'Panel One (copy)',
      });
    });

    test('should clone by reference embeddable as by value', async () => {
      const layoutManager = initializeLayoutManager(
        viewModeManagerMock,
        undefined,
        [panel1],
        [],
        trackPanelMock
      );
      layoutManager.api.registerChildApi({
        ...panel1Api,
        hasLibraryItemWithTitle: jest.fn(),
        canLinkToLibrary: jest.fn(),
        canUnlinkFromLibrary: jest.fn(),
        saveToLibrary: jest.fn(),
        getSerializedStateByReference: jest.fn(),
        getSerializedStateByValue: () => ({
          isByValue: true,
        }),
      } as DefaultEmbeddableApi & HasLibraryTransforms);

      await layoutManager.api.duplicatePanel('panelOne');

      const duplicatedPanelState = layoutManager.internalApi.getSerializedStateForPanel('54321');
      expect(duplicatedPanelState).toEqual({
        isByValue: true,
        title: 'Panel One (copy)',
      });
    });

    test('should give a correct title to the clone of a clone', async () => {
      const layoutManager = initializeLayoutManager(
        viewModeManagerMock,
        undefined,
        [panel1],
        [],
        trackPanelMock
      );
      const titleManagerOfClone = initializeTitleManager({ title: 'Panel One (copy)' });
      layoutManager.api.registerChildApi({
        ...panel1Api,
        ...titleManagerOfClone.api,
        serializeState: () => titleManagerOfClone.getLatestState(),
      });

      await layoutManager.api.duplicatePanel('panelOne');

      const duplicatedPanelState = layoutManager.internalApi.getSerializedStateForPanel('54321');
      expect(duplicatedPanelState).toEqual({
        title: 'Panel One (copy 1)',
      });
    });
  });

  describe('canRemovePanels', () => {
    test('allows removing panels when there is no expanded panel', () => {
      const layoutManager = initializeLayoutManager(viewModeManagerMock, undefined, [panel1], [], {
        ...trackPanelMock,
        expandedPanelId$: new BehaviorSubject<string | undefined>(undefined),
      });
      expect(layoutManager.api.canRemovePanels()).toBe(true);
    });

    test('does not allow removing panels when there is an expanded panel', () => {
      const layoutManager = initializeLayoutManager(viewModeManagerMock, undefined, [panel1], [], {
        ...trackPanelMock,
        expandedPanelId$: new BehaviorSubject<string | undefined>('1'),
      });
      expect(layoutManager.api.canRemovePanels()).toBe(false);
    });
  });

  describe('getChildApi', () => {
    test('should return api when api is available', (done) => {
      const layoutManager = initializeLayoutManager(
        viewModeManagerMock,
        undefined,
        [panel1],
        [],
        trackPanelMock
      );

      layoutManager.api.getChildApi(PANEL_ONE_ID).then((api) => {
        expect(api).toBe(panel1Api);
        done();
      });

      layoutManager.api.registerChildApi(panel1Api);
    });

    test('should return api from panel in open section when api is available', (done) => {
      const layoutManager = initializeLayoutManager(
        viewModeManagerMock,
        undefined,
        [
          {
            ...section1,
            collapsed: false,
          },
        ],
        [],
        trackPanelMock
      );

      layoutManager.api.getChildApi(PANEL_ONE_ID).then((api) => {
        expect(api).toBe(panel1Api);
        done();
      });

      layoutManager.api.registerChildApi(panel1Api);
    });

    test('should return undefined from panel in closed section', (done) => {
      const layoutManager = initializeLayoutManager(
        viewModeManagerMock,
        undefined,
        [
          {
            ...section1,
            collapsed: true,
          },
        ],
        [],
        trackPanelMock
      );

      layoutManager.api.getChildApi(PANEL_ONE_ID).then((api) => {
        expect(api).toBeUndefined();
        done();
      });

      // do not call layoutManager.internalApi.registerChildApi
      // because api will never become available
    });
  });

  describe('pinned panels', () => {
    test('can pin panel', () => {
      const layoutManager = initializeLayoutManager(
        viewModeManagerMock,
        undefined,
        [
          panel1,
          {
            id: 'control3',
            type: 'options_list_control',
            config: {},
            grid: { x: 0, y: 2, h: 1, w: 1 },
          },
        ],
        pinnedControls,
        {
          ...trackPanelMock,
          expandedPanelId$: new BehaviorSubject<string | undefined>(undefined),
        }
      );

      layoutManager.api.pinPanel('control3');
      expect(layoutManager.api.layout$.getValue().pinnedPanels).toEqual({
        ['control1']: {
          ...pick(pinnedControls[0], ['grow', 'width', 'type']),
          order: 0,
        },
        ['control2']: {
          ...pick(pinnedControls[1], ['grow', 'width', 'type']),
          order: 1,
        },
        ['control3']: {
          ...DEFAULT_PINNED_CONTROL_STATE,
          type: 'options_list_control',
          order: 2,
        },
      });
      expect(layoutManager.api.layout$.getValue().panels).toEqual({
        [panel1.id]: pick(panel1, ['grid', 'type']),
        // control3 gets removed as a panel
      });
    });

    test('can unpin panel', () => {
      const layoutManager = initializeLayoutManager(
        viewModeManagerMock,
        undefined,
        [panel1],
        pinnedControls,
        {
          ...trackPanelMock,
          expandedPanelId$: new BehaviorSubject<string | undefined>(undefined),
        }
      );
      expect(layoutManager.api.layout$.getValue().pinnedPanels).toEqual({
        ['control1']: {
          ...pick(pinnedControls[0], ['grow', 'width', 'type']),
          order: 0,
        },
        ['control2']: {
          ...pick(pinnedControls[1], ['grow', 'width', 'type']),
          order: 1,
        },
      });

      layoutManager.api.unpinPanel('control1');
      expect(layoutManager.api.layout$.getValue().pinnedPanels).toEqual({
        ['control2']: {
          ...pick(pinnedControls[1], ['grow', 'width', 'type']),
          order: 0, // adjusted order
        },
      });
      expect(layoutManager.api.layout$.getValue().panels).toEqual({
        [panel1.id]: {
          type: 'testPanelType',
          grid: { ...panel1.grid, y: 2 }, // push panel 1 down,
        },
        ['control1']: {
          type: 'options_list_control',
          grid: { x: 0, y: 0, w: 12, h: 2 },
        },
      });
    });

    test('determines when a panel is pinned', () => {
      const layoutManager = initializeLayoutManager(
        viewModeManagerMock,
        undefined,
        [
          panel1,
          {
            ...pinnedControls[1],
            id: 'control2',
            grid: { x: 0, y: 0, w: 12, h: 12 },
            config: { title: 'Control' },
          },
        ],
        [pinnedControls[0]],
        {
          ...trackPanelMock,
          expandedPanelId$: new BehaviorSubject<string | undefined>(undefined),
        }
      );
      expect(layoutManager.api.panelIsPinned('control1')).toBe(true);
      expect(layoutManager.api.panelIsPinned('control2')).toBe(false);
    });
  });

  describe('childrenLoading$', () => {
    test('all children load when no sections', async () => {
      const loadingStates: boolean[] = [];
      const layoutManager = initializeLayoutManager(
        viewModeManagerMock,
        undefined,
        [panel1],
        pinnedControls,
        trackPanelMock
      );
      layoutManager.internalApi.childrenLoading$.subscribe((loading) => {
        loadingStates.push(loading);
      });

      // delay registering children to mock loading
      await new Promise((resolve) => setTimeout(resolve, 10));
      layoutManager.api.registerChildApi(panel1Api);
      layoutManager.api.registerChildApi({
        uuid: pinnedControls[0].id,
      } as DefaultEmbeddableApi);
      await new Promise((resolve) => setTimeout(resolve, 5));
      layoutManager.api.registerChildApi({
        uuid: pinnedControls[1].id,
      } as DefaultEmbeddableApi);

      expect(loadingStates.filter((loading) => !loading).length).toEqual(1); // loading done is only triggered once
      expect(loadingStates.at(-1)).toEqual(false); // last element is signaling loading is done
    });

    test('all children load when in non-collapsed sections', async () => {
      const loadingStates: boolean[] = [];
      const layoutManager = initializeLayoutManager(
        viewModeManagerMock,
        undefined,
        [section1],
        pinnedControls,
        trackPanelMock
      );
      layoutManager.internalApi.childrenLoading$.subscribe((loading) => {
        loadingStates.push(loading);
      });

      // delay registering children to mock loading
      await new Promise((resolve) => setTimeout(resolve, 10));
      layoutManager.api.registerChildApi({
        uuid: pinnedControls[1].id,
      } as DefaultEmbeddableApi);
      await new Promise((resolve) => setTimeout(resolve, 5));
      layoutManager.api.registerChildApi({
        uuid: pinnedControls[0].id,
      } as DefaultEmbeddableApi);
      layoutManager.api.registerChildApi(panel1Api);

      expect(loadingStates.filter((loading) => !loading).length).toEqual(1);
      expect(loadingStates.at(-1)).toEqual(false);
    });

    test('ignores children in collapsed sections until the section is expanded', async () => {
      const loadingStates: boolean[] = [];
      const panel2 = { id: 'panel2', config: {}, grid: { w: 1, h: 1, x: 0, y: 0 }, type: 'type' };
      const { layout } = deserializeLayout([panel2, section1], pinnedControls);
      const layoutManager = initializeLayoutManager(
        viewModeManagerMock,
        undefined,
        [panel2, { ...section1, collapsed: true }],
        pinnedControls,
        trackPanelMock
      );
      layoutManager.internalApi.childrenLoading$.subscribe((loading) => {
        loadingStates.push(loading);
      });

      // waits until all children APIs are registered to trigger done loading
      expect(loadingStates.at(-1)).toEqual(true);
      layoutManager.api.registerChildApi({
        uuid: pinnedControls[1].id,
      } as DefaultEmbeddableApi);
      expect(loadingStates.at(-1)).toEqual(true);
      layoutManager.api.registerChildApi({
        uuid: pinnedControls[0].id,
      } as DefaultEmbeddableApi);
      expect(loadingStates.at(-1)).toEqual(true);
      layoutManager.api.registerChildApi({
        uuid: 'panel2',
      } as DefaultEmbeddableApi);
      expect(loadingStates.at(-1)).toEqual(false);

      // expand section **after** children APIs are already registered causes loading
      layoutManager.api.layout$.next({
        ...layout,
        sections: { section1: { ...layout.sections.section1, collapsed: false } },
      });
      expect(loadingStates.at(-1)).toEqual(true);

      // once the new API is ready, loading is false again
      layoutManager.api.registerChildApi(panel1Api);
      expect(loadingStates.filter((loading) => !loading).length).toEqual(2);
      expect(loadingStates.at(-1)).toEqual(false);
    });

    test('toggling a collapsible section does not trigger loading when children APIs are available', async () => {
      const loadingStates: boolean[] = [];
      const panel2 = { id: 'panel2', config: {}, grid: { w: 1, h: 1, x: 0, y: 0 }, type: 'type' };
      const { layout } = deserializeLayout([panel2, section1], []);
      const layoutManager = initializeLayoutManager(
        viewModeManagerMock,
        undefined,
        [panel2, section1],
        [],
        trackPanelMock
      );

      layoutManager.internalApi.childrenLoading$.subscribe((loading) => {
        loadingStates.push(loading);
      });
      layoutManager.api.registerChildApi(panel1Api);
      layoutManager.api.registerChildApi({
        uuid: 'panel2',
      } as DefaultEmbeddableApi);

      // collapse section **after** children APIs are already registered
      layoutManager.api.layout$.next({
        ...layout,
        sections: { section1: { ...layout.sections.section1, collapsed: true } },
      });

      // last two loading states should be `false` - collapsing section doesn't trigger loading
      expect(loadingStates.filter((loading) => !loading).length).toEqual(2);
      expect(loadingStates.at(-1)).toEqual(false);
      expect(loadingStates.at(-2)).toEqual(false);

      // re-opening the collapsed section should also not trigger loading, since the children API are available
      layoutManager.api.layout$.next({
        ...layout,
        sections: { section1: { ...layout.sections.section1, collapsed: false } },
      });
      expect(loadingStates.filter((loading) => !loading).length).toEqual(3);
      expect(loadingStates.at(-3)).toEqual(false);
    });
  });
});
