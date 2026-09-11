/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { createSearchSourceMock } from '@kbn/data-plugin/public/mocks';
import { dataViewMock } from '@kbn/discover-utils/src/__mocks__';
import type { SavedSearch } from '@kbn/saved-search-plugin/common';
import { waitFor, act, renderHook } from '@testing-library/react';
import { createMockStore, mockGlobalState, TestProviders } from '../../mock';
import { useDiscoverInTimelineActions } from './use_discover_in_timeline_actions';
import type { Filter } from '@kbn/es-query';
import { createStartServicesMock } from '../../lib/kibana/kibana_react.mock';
import { useKibana } from '../../lib/kibana';
import type { State } from '../../store';
import { TimelineId } from '../../../../common/types';
import * as timelineActions from '../../../timelines/store/actions';
import { timelineDefaults } from '../../../timelines/store/defaults';
import type { ComponentType, FC, PropsWithChildren } from 'react';
import React from 'react';
import type { DataView } from '@kbn/data-views-plugin/common';
import { createDiscoverServicesMock } from '@kbn/discover-plugin/public/__mocks__/services';
import { createMockDiscoverStateContainer } from './mocks/discover_in_timeline_provider';

const discoverServices = createDiscoverServicesMock();

let mockDiscoverStateContainerRef = {
  current: createMockDiscoverStateContainer(discoverServices),
};

jest.mock('../../lib/kibana');

const mockDispatch = jest.fn();

jest.mock('react-redux-v7', () => {
  const actual = jest.requireActual('react-redux-v7');
  return {
    ...actual,
    useDispatch: () => mockDispatch,
  };
});

const mockState: State = {
  ...mockGlobalState,
  timeline: {
    ...mockGlobalState.timeline,
    timelineById: {
      ...mockGlobalState.timeline.timelineById,
      [TimelineId.active]: {
        ...mockGlobalState.timeline.timelineById[TimelineId.active],
        title: 'Active Timeline',
        description: 'Active Timeline Description',
      },
    },
  },
};

jest.mock('./use_discover_in_timeline_actions', () => {
  const actual = jest.requireActual('./use_discover_in_timeline_actions');
  return actual;
});

const getTestProviderWithCustomState = (state: State = mockState) => {
  const store = createMockStore(state);

  const MockTestProvider: FC<PropsWithChildren<{}>> = ({ children }) => (
    <TestProviders store={store}> {children}</TestProviders>
  );

  return MockTestProvider;
};

const renderTestHook = (customWrapper: ComponentType = getTestProviderWithCustomState()) => {
  mockDiscoverStateContainerRef = {
    current: createMockDiscoverStateContainer(discoverServices),
  };
  return renderHook(() => useDiscoverInTimelineActions(mockDiscoverStateContainerRef), {
    wrapper: customWrapper,
  });
};

const customQuery = {
  language: 'kuery',
  query: '_id: *',
};

const customFilter = {
  $state: {
    store: 'appState',
  },
  meta: {
    alias: null,
    disabled: false,
    field: 'ecs.version',
    index: 'kibana-event-log-data-view',
    key: 'ecs.version',
    negate: false,
    params: {
      query: '1.8.0',
    },
    type: 'phrase',
  },
  query: {
    match_phrase: {
      'ecs.version': '1.8.0',
    },
  },
} as Filter;

const originalSavedSearchMock = {
  id: 'the-saved-search-id',
  title: 'A saved search',
  breakdownField: 'customBreakDownField',
  searchSource: createSearchSourceMock({
    index: dataViewMock,
    filter: [customFilter],
    query: customQuery,
  }),
};

export const savedSearchMock = {
  ...originalSavedSearchMock,
  hideChart: true,
  sort: [['@timestamp', 'desc']],
  timeRange: {
    from: 'now-20d',
    to: 'now',
  },
} as unknown as SavedSearch;

const startServicesMock = createStartServicesMock();

startServicesMock.dataViews.get = jest.fn(
  async () =>
    ({
      getIndexPattern: jest.fn(),
    } as unknown as DataView)
);

describe('useDiscoverInTimelineActions', () => {
  beforeEach(() => {
    (useKibana as jest.Mock).mockImplementation(() => ({
      services: startServicesMock,
    }));
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
  describe('getAppStateFromSavedSearch', () => {
    it('should reach out to discover to convert app state from saved search', async () => {
      const { result } = renderTestHook();
      const { appState } = result.current.getAppStateFromSavedSearch(savedSearchMock);
      await waitFor(() => {
        expect(appState).toMatchObject(
          expect.objectContaining({
            breakdownField: 'customBreakDownField',
            columns: ['default_column'],
            filters: [customFilter],
            grid: {},
            hideAggregatedPreview: undefined,
            hideChart: true,
            dataSource: {
              type: 'dataView',
              dataViewId: 'the-data-view-id',
            },
            interval: 'auto',
            query: customQuery,
            rowHeight: undefined,
            rowsPerPage: undefined,
            savedQuery: undefined,
            sort: [['@timestamp', 'desc']],
            viewMode: undefined,
          })
        );
      });
    });
  });

  describe('resetDiscoverAppState', () => {
    it('should reset Discover AppState to a default state', async () => {
      const { result } = renderTestHook();
      await result.current.resetDiscoverAppState();
      await waitFor(() => {
        const appState = mockDiscoverStateContainerRef.current.getCurrentTab().appState;
        expect(appState).toMatchObject(result.current.defaultDiscoverAppState);
      });
    });
    it('should reset Discover time to a default state', async () => {
      const { result } = renderTestHook();
      await result.current.resetDiscoverAppState();
      await waitFor(() => {
        const globalState = mockDiscoverStateContainerRef.current.getCurrentTab().globalState;
        expect(globalState).toMatchObject({ timeRange: { from: 'now-15m', to: 'now' } });
      });
    });
    it('should reset the time range the ES|QL search runs against', async () => {
      // The date picker renders Discover's own copy of the range, but the ES|QL search reads it
      // from the timefilter service, so both have to be reset for the two to agree.
      const { result } = renderTestHook();
      await result.current.resetDiscoverAppState();

      expect(
        startServicesMock.customDataService.query.timefilter.timefilter.setTime
      ).toHaveBeenCalledWith({ from: 'now-15m', to: 'now', mode: 'relative' });
    });
    it('should restore the time range the ES|QL search runs against from the saved search', async () => {
      (startServicesMock.savedSearch.get as jest.Mock).mockResolvedValueOnce(savedSearchMock);
      const { result } = renderTestHook();

      await result.current.resetDiscoverAppState(savedSearchMock.id);

      expect(
        startServicesMock.customDataService.query.timefilter.timefilter.setTime
      ).toHaveBeenCalledWith(savedSearchMock.timeRange);
    });
    it('should fall back to the default time range when the saved search has none', async () => {
      const { timeRange, ...savedSearchWithoutTimeRange } = savedSearchMock;
      (startServicesMock.savedSearch.get as jest.Mock).mockResolvedValueOnce(
        savedSearchWithoutTimeRange
      );
      const { result } = renderTestHook();

      await result.current.resetDiscoverAppState(savedSearchMock.id);

      expect(
        startServicesMock.customDataService.query.timefilter.timefilter.setTime
      ).toHaveBeenCalledWith({ from: 'now-15m', to: 'now', mode: 'relative' });
    });
    it('should not consider a restore pending while the ES|QL tab is mounted', async () => {
      (startServicesMock.savedSearch.get as jest.Mock).mockResolvedValueOnce(savedSearchMock);
      const { result } = renderTestHook();

      await result.current.resetDiscoverAppState(savedSearchMock.id);

      expect(result.current.timelineRestorePending.current).toBe(false);
    });
    it('should defer the restore to the ES|QL tab when it holds no state container', async () => {
      // The tab releases its container when it unmounts, so there is nothing to restore into.
      // Applying the default state here would wipe what the tab falls back on when it mounts.
      const { result } = renderHook(() => useDiscoverInTimelineActions({ current: undefined }), {
        wrapper: getTestProviderWithCustomState(),
      });

      await result.current.resetDiscoverAppState(savedSearchMock.id);

      expect(
        startServicesMock.customDataService.query.timefilter.timefilter.setTime
      ).not.toHaveBeenCalled();
      expect(result.current.timelineRestorePending.current).toBe(true);
    });
  });
  describe('updateSavedSearch', () => {
    it('should add defaults to the savedSearch before updating saved search', async () => {
      const { result } = renderTestHook();

      await waitFor(() =>
        expect(result.current).toEqual(
          expect.objectContaining({
            updateSavedSearch: expect.any(Function),
          })
        )
      );

      await act(async () => {
        await result.current.updateSavedSearch(savedSearchMock, TimelineId.active);
      });

      expect(startServicesMock.savedSearch.save).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          timeRestore: true,
          timeRange: {
            from: 'now-20d',
            to: 'now',
          },
          tags: ['security-solution-default'],
        }),
        expect.objectContaining({
          copyOnSave: true,
        })
      );
    });

    it('should initialize the local saved search after creating a new one', async () => {
      // Without this, the redux copy stays null and every later timeline save skips persisting
      // the Discover session, because `patchTimeline` is guarded on it.
      const newSavedSearchId = 'newly-created-saved-search-id';
      (startServicesMock.savedSearch.save as jest.Mock).mockResolvedValueOnce(newSavedSearchId);

      const { result } = renderTestHook();

      await waitFor(() =>
        expect(result.current).toEqual(
          expect.objectContaining({
            updateSavedSearch: expect.any(Function),
          })
        )
      );

      await act(async () => {
        await result.current.updateSavedSearch(savedSearchMock, TimelineId.active);
      });

      expect(mockDispatch).toHaveBeenCalledWith(
        timelineActions.initializeSavedSearch({
          id: TimelineId.active,
          savedSearch: { ...savedSearchMock, id: newSavedSearchId },
        })
      );
    });

    it('should not hand the new Discover session to a timeline created while the save was in flight', async () => {
      // `TimelineId.active` is a slot: hitting "New" mid-save puts a different timeline in it, and
      // these dispatches would move the previous timeline's ES|QL session onto the empty one.
      const store = createMockStore({
        ...mockState,
        timeline: {
          ...mockState.timeline,
          timelineById: {
            ...mockState.timeline.timelineById,
            [TimelineId.active]: {
              ...mockState.timeline.timelineById[TimelineId.active],
              savedObjectId: 'the-timeline-being-saved',
            },
          },
        },
      });
      const wrapper: FC<PropsWithChildren<{}>> = ({ children }) => (
        <TestProviders store={store}>{children}</TestProviders>
      );

      const { columns, dataViewId, indexNames } = timelineDefaults;

      const newSavedSearchId = 'newly-created-saved-search-id';
      (startServicesMock.savedSearch.save as jest.Mock).mockImplementationOnce(async () => {
        // the user creates a new timeline before the save resolves
        store.dispatch(
          timelineActions.createTimeline({
            id: TimelineId.active,
            show: true,
            columns,
            dataViewId,
            indexNames,
          })
        );
        return newSavedSearchId;
      });

      const { result } = renderTestHook(wrapper);

      await waitFor(() =>
        expect(result.current).toEqual(
          expect.objectContaining({ updateSavedSearch: expect.any(Function) })
        )
      );

      await act(async () => {
        await result.current.updateSavedSearch(savedSearchMock, TimelineId.active);
      });

      expect(mockDispatch).not.toHaveBeenCalledWith(
        timelineActions.updateSavedSearchId({
          id: TimelineId.active,
          savedSearchId: newSavedSearchId,
        })
      );
      expect(mockDispatch).not.toHaveBeenCalledWith(
        timelineActions.initializeSavedSearch({
          id: TimelineId.active,
          savedSearch: { ...savedSearchMock, id: newSavedSearchId },
        })
      );
      expect(mockDispatch).not.toHaveBeenCalledWith(
        timelineActions.saveTimeline({ id: TimelineId.active, saveAsNew: false })
      );
    });

    it('should initialize saved search when it is not set on the timeline model yet', async () => {
      const localMockState: State = {
        ...mockGlobalState,
        timeline: {
          ...mockGlobalState.timeline,
          timelineById: {
            ...mockGlobalState.timeline.timelineById,
            [TimelineId.active]: {
              ...mockGlobalState.timeline.timelineById[TimelineId.active],
              title: 'Active Timeline',
              description: 'Active Timeline Description',
              savedSearchId: 'saved_search_id',
            },
          },
        },
      };

      const LocalTestProvider = getTestProviderWithCustomState(localMockState);
      const { result } = renderTestHook(LocalTestProvider);
      await waitFor(() =>
        expect(result.current).toEqual(
          expect.objectContaining({
            updateSavedSearch: expect.any(Function),
          })
        )
      );
      await act(async () => {
        await result.current.updateSavedSearch(savedSearchMock, TimelineId.active);
      });

      expect(mockDispatch).toHaveBeenNthCalledWith(
        1,
        timelineActions.initializeSavedSearch({
          id: TimelineId.active,
          savedSearch: savedSearchMock,
        })
      );
    });

    it('should update saved search when it has changes', async () => {
      const changedSavedSearchMock = { ...savedSearchMock, title: 'changed' };
      const localMockState: State = {
        ...mockGlobalState,
        timeline: {
          ...mockGlobalState.timeline,
          timelineById: {
            ...mockGlobalState.timeline.timelineById,
            [TimelineId.active]: {
              ...mockGlobalState.timeline.timelineById[TimelineId.active],
              title: 'Active Timeline',
              description: 'Active Timeline Description',
              savedSearchId: 'saved_search_id',
              savedSearch: savedSearchMock,
            },
          },
        },
      };

      const LocalTestProvider = getTestProviderWithCustomState(localMockState);
      const { result } = renderTestHook(LocalTestProvider);
      await waitFor(() =>
        expect(result.current).toEqual(
          expect.objectContaining({
            updateSavedSearch: expect.any(Function),
          })
        )
      );
      await act(async () => {
        await result.current.updateSavedSearch(changedSavedSearchMock, TimelineId.active);
      });

      expect(mockDispatch).toHaveBeenNthCalledWith(
        1,
        timelineActions.updateSavedSearch({
          id: TimelineId.active,
          savedSearch: changedSavedSearchMock,
        })
      );
    });

    it('should raise appropriate notification in case of any error in saving discover saved search', () => {});
  });
});
