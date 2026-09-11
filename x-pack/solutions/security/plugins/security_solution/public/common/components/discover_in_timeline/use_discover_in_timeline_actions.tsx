/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ExtendedDiscoverStateContainer } from '@kbn/discover-plugin/public';
import type { SaveSavedSearchOptions } from '@kbn/saved-search-plugin/public';
import { isEqualWith } from 'lodash';
import { useMemo, useCallback, useRef } from 'react';
import type { RefObject } from 'react';
import { useDispatch, useStore } from 'react-redux-v7';
import type { SavedSearch } from '@kbn/saved-search-plugin/common';
import type { DiscoverAppState } from '@kbn/discover-plugin/public/application/main/state_management/redux';
import type { TimeRange } from '@kbn/es-query';
import { useMutation, useQueryClient } from '@kbn/react-query';
import { useDiscoverState } from '../../../timelines/components/timeline/tabs/esql/use_discover_state';
import { timelineDefaults } from '../../../timelines/store/defaults';
import { TimelineId } from '../../../../common/types';
import { timelineActions, timelineSelectors } from '../../../timelines/store';
import { useAppToasts } from '../../hooks/use_app_toasts';
import { useShallowEqualSelector } from '../../hooks/use_selector';
import { useKibana } from '../../lib/kibana';
import type { State } from '../../store';
import {
  savedSearchComparator,
  hasNonEmptyEsqlQuery,
} from '../../../timelines/components/timeline/tabs/esql/utils';
import {
  DISCOVER_SEARCH_SAVE_ERROR_TITLE,
  DISCOVER_SEARCH_SAVE_ERROR_UNKNOWN,
} from './translations';

function defaultDiscoverAppState(): DiscoverAppState {
  return {
    query: {
      esql: '',
    },
    sort: [['@timestamp', 'desc']],
    columns: [],
    interval: 'auto',
    filters: [],
    hideChart: true,
    grid: {},
  };
}

export const defaultDiscoverTimeRange: TimeRange = {
  from: 'now-15m',
  to: 'now',
  mode: 'relative',
};

export const useDiscoverInTimelineActions = (
  discoverStateContainer: RefObject<ExtendedDiscoverStateContainer | undefined>
) => {
  const { setDiscoverAppState } = useDiscoverState();
  const { addError } = useAppToasts();

  const {
    services: { customDataService: discoverDataService, savedSearch: savedSearchService },
  } = useKibana();

  const dispatch = useDispatch();
  const store = useStore<State>();

  const getTimeline = useMemo(() => timelineSelectors.getTimelineByIdSelector(), []);
  const timeline = useShallowEqualSelector(
    (state) => getTimeline(state, TimelineId.active) ?? timelineDefaults
  );

  /**
   * Reads the timeline currently occupying the active slot straight from the store, rather than
   * from the render-time copy, so callers can compare it across an await without depending on
   * React having re-rendered in the meantime.
   */
  const getActiveSavedObjectId = useCallback(
    () => getTimeline(store.getState(), TimelineId.active)?.savedObjectId ?? null,
    [getTimeline, store]
  );
  const { savedSearchId, version } = timeline;

  // We're using a ref here to prevent a cyclic hook-dependency chain of updateSavedSearch
  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;

  // Set when a timeline is restored while the ES|QL tab is not mounted, so there is no state
  // container to restore into. The tab reads it on mount to tell "a different timeline was
  // opened, take its state" from a plain remount of the timeline already on screen, where the
  // in-session state has to survive.
  const timelineRestorePending = useRef(false);

  const queryClient = useQueryClient();

  const { mutateAsync: saveSavedSearch, status: saveSavedSearchStatus } = useMutation({
    mutationFn: ({
      savedSearch,
      savedSearchOptions,
    }: {
      savedSearch: SavedSearch;
      savedSearchOptions: SaveSavedSearchOptions;
    }) => savedSearchService.save(savedSearch, savedSearchOptions),
    onSuccess: (data) => {
      // Invalidate and refetch
      if (data) {
        dispatch(
          timelineActions.endTimelineSaving({
            id: TimelineId.active,
          })
        );
      }
      queryClient.invalidateQueries({ queryKey: ['savedSearchById', savedSearchId] });
    },
    mutationKey: [version],
  });

  /*
   * generates Appstate from a given saved Search object
   *
   * @param savedSearch
   *
   * */
  const getAppStateFromSavedSearch = useCallback(
    (savedSearch: SavedSearch) => {
      const appState = discoverStateContainer.current?.getAppStateFromSavedSearch(savedSearch);
      return {
        savedSearch,
        appState,
      };
    },
    [discoverStateContainer]
  );

  /*
   * resets discover state to a default value
   *
   * */
  const resetDiscoverAppState = useCallback(
    async (newSavedSearchId?: string | null) => {
      // The ES|QL tab publishes its state container while it is mounted and releases it when it
      // is not, so an absent container means the restore has to be deferred to its next mount.
      timelineRestorePending.current = !discoverStateContainer.current;

      if (newSavedSearchId) {
        // Applying the default state below would empty the redux copy of the Discover state and
        // move the timefilter to `now-15m`, even though the caller asked for a session to be
        // restored. Leave both alone and let the tab restore itself when it mounts.
        if (!discoverStateContainer.current) return;

        let savedSearch;
        try {
          savedSearch = await savedSearchService.get(newSavedSearchId);
          const savedSearchState = savedSearch ? getAppStateFromSavedSearch(savedSearch) : null;
          const currentContainer = discoverStateContainer.current;

          if (
            !currentContainer?.internalState?.dispatch ||
            !currentContainer?.injectCurrentTab ||
            !currentContainer?.internalActions
          ) {
            return;
          }

          const discoverDispatch = currentContainer.internalState.dispatch;
          const injectCurrentTab = currentContainer.injectCurrentTab;
          const internalActions = currentContainer.internalActions;

          try {
            discoverDispatch(injectCurrentTab(internalActions.stopSyncing)());
            discoverDispatch(injectCurrentTab(internalActions.initializeAndSync)());
          } catch {
            // The tab has no data state container until Discover has finished mounting, and
            // re-establishing the sync throws until then. Keep going: the state below is what
            // the timeline is being restored to, and dropping it leaves the previously opened
            // timeline's Discover session on screen.
          }

          await discoverDispatch(
            injectCurrentTab(internalActions.updateAppStateAndReplaceUrl)({
              appState: savedSearchState?.appState ?? {},
            })
          );
          setDiscoverAppState(savedSearchState?.appState ?? defaultDiscoverAppState());
          const timeRange = savedSearch.timeRange ?? defaultDiscoverTimeRange;
          discoverDispatch(
            injectCurrentTab(internalActions.updateGlobalState)({
              globalState: {
                timeRange,
              },
            })
          );
          // `updateGlobalState` only writes Discover's own copy of the range, which is what the
          // date picker renders. The ES|QL search reads the range from the timefilter service
          // instead, so without this the picker shows the restored range while every query keeps
          // running against this service's default one.
          discoverDataService.query.timefilter.timefilter.setTime(timeRange);
        } catch (e) {
          /* empty */
        }
      } else {
        const defaultState = defaultDiscoverAppState();
        const currentProfileState =
          discoverStateContainer.current?.getCurrentTab().profileState ?? {};

        discoverStateContainer.current?.internalState.dispatch(
          discoverStateContainer.current.injectCurrentTab(
            discoverStateContainer.current.internalActions.initializeTabState
          )({
            initialAppState: defaultState,
            initialProfileState: currentProfileState,
          })
        );
        await discoverStateContainer.current?.internalState.dispatch(
          discoverStateContainer.current?.injectCurrentTab(
            discoverStateContainer.current?.internalActions.updateAppStateAndReplaceUrl
          )({
            appState: {},
          })
        );
        setDiscoverAppState(defaultState);
        const discoverState = discoverStateContainer.current;
        discoverState?.internalState.dispatch(
          discoverState.injectCurrentTab(discoverState.internalActions.updateGlobalState)({
            globalState: {
              timeRange: defaultDiscoverTimeRange,
            },
          })
        );
        discoverDataService.query.timefilter.timefilter.setTime(defaultDiscoverTimeRange);
      }
    },
    [
      discoverStateContainer,
      getAppStateFromSavedSearch,
      savedSearchService,
      setDiscoverAppState,
      discoverDataService,
    ]
  );

  const persistSavedSearch = useCallback(
    async (savedSearch: SavedSearch, savedSearchOption: SaveSavedSearchOptions) => {
      if (!discoverStateContainer) {
        // eslint-disable-next-line no-console
        console.log(`Saved search is not open since state container is null`);
        return;
      }
      if (!savedSearch) return;

      function onError(error: Error) {
        addError(error, { title: DISCOVER_SEARCH_SAVE_ERROR_TITLE });
      }
      try {
        const id = await saveSavedSearch({
          savedSearch,
          savedSearchOptions: savedSearchOption,
        });
        if (id) {
          return { id };
        } else {
          addError(DISCOVER_SEARCH_SAVE_ERROR_UNKNOWN, { title: DISCOVER_SEARCH_SAVE_ERROR_TITLE });
        }
      } catch (err) {
        onError(err);
      }
    },
    [addError, discoverStateContainer, saveSavedSearch]
  );

  /*
   * persists the given savedSearch
   *
   * */
  const updateSavedSearch = useCallback(
    async (savedSearch: SavedSearch, timelineId: string, onUpdate?: () => void) => {
      savedSearch.timeRestore = true;
      savedSearch.timeRange =
        savedSearch.timeRange ?? discoverDataService.query.timefilter.timefilter.getTime();
      savedSearch.tags = ['security-solution-default'];

      // If there is already a saved search, only update the local state
      if (savedSearchId) {
        // If an ES|QL query was explicitly cleared (query has `esql` key but value is blank),
        // drop the savedSearchId link immediately so the next explicit timeline save sends
        // savedSearchId: null to the server and the timeline appears compatible in the list
        // without requiring a second save. Non-ES|QL queries (kuery/lucene) must not trigger
        // this path — they have no `esql` key and are not related to the saved-search lifecycle.
        const currentQuery = savedSearch.searchSource.getField('query');
        const esqlQueryWasCleared =
          currentQuery != null &&
          typeof currentQuery === 'object' &&
          'esql' in currentQuery &&
          !hasNonEmptyEsqlQuery(currentQuery);
        if (esqlQueryWasCleared) {
          dispatch(
            timelineActions.updateSavedSearchId({ id: TimelineId.active, savedSearchId: null })
          );
          return;
        }
        savedSearch.id = savedSearchId;
        if (!timelineRef.current.savedSearch) {
          dispatch(
            timelineActions.initializeSavedSearch({
              id: TimelineId.active,
              savedSearch,
            })
          );
        } else if (
          !isEqualWith(timelineRef.current.savedSearch, savedSearch, savedSearchComparator)
        ) {
          dispatch(
            timelineActions.updateSavedSearch({
              id: TimelineId.active,
              savedSearch,
            })
          );
        }
      } else {
        // If no saved search exists. Create a new saved search instance and associate it with the timeline.
        try {
          // Make sure we're not creating a saved search while a previous creation call is in progress
          if (saveSavedSearchStatus === 'loading') {
            return;
          }
          dispatch(
            timelineActions.startTimelineSaving({
              id: TimelineId.active,
            })
          );
          // `TimelineId.active` is a slot, not an identity: creating a new timeline replaces
          // whatever occupies it. Remember which timeline this Discover session belongs to so
          // the dispatches below can be skipped if the slot moved on while the save was in
          // flight — otherwise they hand the session to the timeline that took its place.
          const savedObjectIdBeingSaved = getActiveSavedObjectId();
          const response = await persistSavedSearch(savedSearch, {
            copyOnSave: !savedSearchId,
          });

          const responseIsEmpty = !response || !response?.id;
          if (responseIsEmpty) {
            throw new Error('Response is empty');
          } else if (
            !savedSearchId &&
            !responseIsEmpty &&
            getActiveSavedObjectId() === savedObjectIdBeingSaved
          ) {
            dispatch(
              timelineActions.updateSavedSearchId({
                id: TimelineId.active,
                savedSearchId: response.id,
              })
            );
            // Seed the local saved search with the one that was just created. Without this the
            // redux copy stays null: the sync effect that would normally initialize it
            // short-circuits because the local and persisted states are already equal right
            // after creation. A null copy makes every later timeline save skip persisting the
            // Discover session, because `patchTimeline` is guarded on it.
            dispatch(
              timelineActions.initializeSavedSearch({
                id: TimelineId.active,
                savedSearch: { ...savedSearch, id: response.id },
              })
            );
            // Also save the timeline, this will only happen once, in case there is no saved search id yet
            dispatch(timelineActions.saveTimeline({ id: TimelineId.active, saveAsNew: false }));
            onUpdate?.();
          }
        } catch (err) {
          dispatch(
            timelineActions.endTimelineSaving({
              id: TimelineId.active,
            })
          );
        }
      }
    },
    [
      persistSavedSearch,
      savedSearchId,
      dispatch,
      discoverDataService,
      saveSavedSearchStatus,
      getActiveSavedObjectId,
    ]
  );

  const initializeLocalSavedSearch = useCallback(
    async (savedSearch: SavedSearch, timelineId: string) => {
      dispatch(
        timelineActions.initializeSavedSearch({
          id: TimelineId.active,
          savedSearch,
        })
      );
    },
    [dispatch]
  );

  const actions = useMemo(
    () => ({
      resetDiscoverAppState,
      updateSavedSearch,
      initializeLocalSavedSearch,
      getAppStateFromSavedSearch,
      defaultDiscoverAppState: defaultDiscoverAppState(),
      timelineRestorePending,
    }),
    [
      resetDiscoverAppState,
      updateSavedSearch,
      initializeLocalSavedSearch,
      getAppStateFromSavedSearch,
    ]
  );

  return actions;
};
