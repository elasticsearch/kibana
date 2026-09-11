/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHistory } from 'react-router-dom';
import type { CustomizationCallback } from '@kbn/discover-plugin/public/customizations/types';
import { createGlobalStyle } from 'styled-components';
import type { ScopedHistory } from '@kbn/core/public';
import { from, type Subscription } from 'rxjs';
import { useQuery } from '@kbn/react-query';
import { isEqualWith } from 'lodash';
import type { SavedSearch } from '@kbn/saved-search-plugin/common';
import { useDispatch } from 'react-redux-v7';
import { APP_STATE_URL_KEY } from '@kbn/discover-plugin/common';
import { PageScope } from '../../../../../data_view_manager/constants';
import { useDataView } from '../../../../../data_view_manager/hooks/use_data_view';
import { updateSavedSearchId } from '../../../../store/actions';
import { defaultDiscoverTimeRange } from '../../../../../common/components/discover_in_timeline/use_discover_in_timeline_actions';
import { useDiscoverInTimelineContext } from '../../../../../common/components/discover_in_timeline/use_discover_in_timeline_context';
import { applyTimelineStateToDiscover } from './apply_timeline_state_to_discover';
import { useKibana } from '../../../../../common/lib/kibana';
import { useDiscoverState } from './use_discover_state';
import { useSetDiscoverCustomizationCallbacks } from './customizations/use_set_discover_customizations';
import { EmbeddedDiscoverContainer, TimelineESQLGlobalStyles } from './styles';
import { timelineSelectors } from '../../../../store';
import { useShallowEqualSelector } from '../../../../../common/hooks/use_selector';
import { useUserPrivileges } from '../../../../../common/components/user_privileges';
import { timelineDefaults } from '../../../../store/defaults';
import { savedSearchComparator, hasNonEmptyEsqlQuery } from './utils';
import { GET_TIMELINE_DISCOVER_SAVED_SEARCH_TITLE } from './translations';

const HideSearchSessionIndicatorBreadcrumbIcon = createGlobalStyle`
  [data-test-subj='searchSessionIndicator'] {
    display: none;
  }
`;

interface DiscoverTabContentProps {
  timelineId: string;
}

export const DiscoverTabContent: FC<DiscoverTabContentProps> = ({ timelineId }) => {
  const history = useHistory();
  const {
    services: { customDataService: discoverDataService, discover, savedSearch: savedSearchService },
  } = useKibana();
  const {
    timelinePrivileges: { crud: canSaveTimeline },
  } = useUserPrivileges();

  const dispatch = useDispatch();

  const { status: dataViewStatus } = useDataView(PageScope.alerts);

  const [tabStateVersion, setTabStateVersion] = useState(0);

  const discoverAppStateSubscription = useRef<Subscription>();
  const discoverInternalStateSubscription = useRef<Subscription>();
  const discoverTabStateSubscription = useRef<Subscription>();

  const {
    discoverStateContainer,
    setDiscoverStateContainer,
    getAppStateFromSavedSearch,
    updateSavedSearch,
    initializeLocalSavedSearch,
    defaultDiscoverAppState,
    timelineRestorePending,
  } = useDiscoverInTimelineContext();

  const { discoverAppState, setDiscoverInternalState, setDiscoverAppState } = useDiscoverState();

  const discoverCustomizationCallbacks = useSetDiscoverCustomizationCallbacks();

  const getTimeline = useMemo(() => timelineSelectors.getTimelineByIdSelector(), []);
  const timeline = useShallowEqualSelector(
    (state) => getTimeline(state, timelineId) ?? timelineDefaults
  );
  const { status, savedSearchId, activeTab, savedObjectId, title, description } = timeline;

  const {
    data: savedSearchById,
    isFetching,
    status: savedSearchByIdStatus,
  } = useQuery({
    queryKey: ['savedSearchById', savedSearchId ?? ''],
    queryFn: () => (savedSearchId ? savedSearchService.get(savedSearchId) : Promise.resolve(null)),
  });

  const getCombinedDiscoverSavedSearchState = useCallback(async (): Promise<
    SavedSearch | undefined
  > => {
    const savedSearch = await discoverStateContainer.current?.getSavedSearchFromCurrentTab();
    if (!savedSearch) return;
    return {
      ...savedSearch,
      timeRange: discoverDataService.query.timefilter.timefilter.getTime(),
      refreshInterval: discoverStateContainer.current?.getCurrentTab().globalState.refreshInterval,
      breakdownField: discoverStateContainer.current?.getCurrentTab().appState.breakdownField,
      rowsPerPage: discoverStateContainer.current?.getCurrentTab().appState.rowsPerPage,
      title: GET_TIMELINE_DISCOVER_SAVED_SEARCH_TITLE(title),
      description,
    };
  }, [discoverStateContainer, discoverDataService.query.timefilter.timefilter, title, description]);

  const combinedDiscoverSavedSearchStateRef = useRef<SavedSearch | undefined>();
  useEffect(() => {
    if (isFetching) return;
    if (savedSearchByIdStatus === 'error' && savedSearchId) {
      // when a timeline json is uploaded with a saved search Id that not longer
      // exists, we need to reset the saved search Id in the timeline and remove th saved search
      dispatch(updateSavedSearchId({ id: timelineId, savedSearchId: null }));
      return;
    }
    // Self-heal stale savedSearchIds from the phantom-creation bug. If the linked saved
    // search has no actual ES|QL query, the savedSearchId was created when the user opened
    // the ES|QL tab without typing anything (now prevented by the hasNonEmptyEsqlQuery guard
    // above). Clear the stale reference so the timeline is no longer incorrectly flagged as
    // ES|QL-incompatible. The user should save the timeline to persist this correction.
    if (
      savedSearchId &&
      savedSearchById &&
      !hasNonEmptyEsqlQuery(savedSearchById.searchSource.getField('query'))
    ) {
      dispatch(updateSavedSearchId({ id: timelineId, savedSearchId: null }));
      return;
    }
    if (!savedObjectId) return;
    if (!status || status === 'draft') return;
    if (!canSaveTimeline) return;

    const syncSavedSearch = async () => {
      const latestState = await getCombinedDiscoverSavedSearchState();
      const index = latestState?.searchSource.getField('index');
      /* when a new timeline is loaded, a new discover instance is loaded which first emits
       * discover's initial state which is then updated in the saved search. We want to avoid that.*/
      if (!index) return;
      if (!latestState || combinedDiscoverSavedSearchStateRef.current === latestState) return;
      if (isEqualWith(latestState, savedSearchById, savedSearchComparator)) return;
      // Don't create a saved search just because the ES|QL tab was opened — only persist
      // when there is an actual ES|QL query. Without this guard, visiting the tab with an
      // empty Discover state sets savedSearchId on any KQL timeline, making it appear
      // incompatible with Super Timeline even though no ES|QL query was ever authored.
      // The guard only applies when no saved search exists yet; once savedSearchId is set,
      // normal update-on-change behaviour continues unchanged.
      if (!savedSearchId && !hasNonEmptyEsqlQuery(latestState.searchSource.getField('query'))) {
        return;
      }
      await updateSavedSearch(latestState, timelineId, function onUpdate() {
        combinedDiscoverSavedSearchStateRef.current = latestState;
      });
    };

    syncSavedSearch();
  }, [
    getCombinedDiscoverSavedSearchState,
    savedSearchById,
    updateSavedSearch,
    activeTab,
    status,
    tabStateVersion,
    savedObjectId,
    isFetching,
    timelineId,
    dispatch,
    savedSearchId,
    savedSearchByIdStatus,
    canSaveTimeline,
  ]);

  useEffect(() => {
    const unSubscribeAll = () => {
      [
        discoverAppStateSubscription.current,
        discoverInternalStateSubscription.current,
        discoverTabStateSubscription.current,
      ].forEach((sub) => {
        if (sub) sub.unsubscribe();
      });
    };

    return unSubscribeAll;
  }, [discoverStateContainer]);

  // The timeline tabs are conditionally rendered, so this component unmounts whenever the user
  // leaves the ES|QL tab, taking the Discover state container it published with it. Releasing the
  // reference keeps callers from dispatching into a disposed container, where writes are accepted
  // and silently dropped.
  useEffect(() => () => setDiscoverStateContainer(undefined), [setDiscoverStateContainer]);

  const initialDiscoverCustomizationCallback: CustomizationCallback = useCallback(
    async ({ stateContainer }) => {
      setDiscoverStateContainer(stateContainer);
      let savedSearchAppState;
      if (savedSearchId) {
        try {
          const localSavedSearch = await savedSearchService.get(savedSearchId);
          initializeLocalSavedSearch(localSavedSearch, timelineId);
          savedSearchAppState = getAppStateFromSavedSearch(localSavedSearch);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('Stale Saved search Id which no longer exists', e);
        }
      }

      const finalAppState =
        ((savedSearchAppState?.appState?.query &&
          'esql' in savedSearchAppState?.appState?.query &&
          savedSearchAppState?.appState) ||
          discoverAppState) ??
        defaultDiscoverAppState;

      // A different timeline was opened while this tab was unmounted, so it never got the chance
      // to restore. The timeline is the source of truth for its own ES|QL tab: a restored
      // timeline gets its saved session's state, a timeline without one gets the default. This
      // deliberately wins over leftover Discover URL state, which belongs to the previously
      // opened timeline and would otherwise be restored in its place — silently, since the two
      // often share a query.
      const isTimelineRestore = timelineRestorePending.current;

      // Nothing of this timeline's own session is at stake: the URL carries no app state, or the
      // tab holds no ES|QL query yet. Seeding it from the timeline cannot lose in-session work.
      const hasNoEsqlStateToPreserve =
        !stateContainer.stateStorage.get(APP_STATE_URL_KEY) ||
        !(stateContainer.getCurrentTab().appState.query as { esql?: string })?.esql;

      if (isTimelineRestore || hasNoEsqlStateToPreserve) {
        timelineRestorePending.current = false;
        await applyTimelineStateToDiscover({
          stateContainer,
          appState: finalAppState,
          timeRange:
            savedSearchAppState?.savedSearch.timeRange ??
            // Only a restore may fall back to the default range. Remounting the same timeline
            // must keep the range the user is looking at, which lives in the data service the
            // ES|QL search reads from rather than in the saved session.
            (isTimelineRestore
              ? defaultDiscoverTimeRange
              : discoverDataService.query.timefilter.timefilter.getTime()),
        });
      }

      const unsubscribeState = stateContainer.createAppStateObservable().subscribe({
        next: setDiscoverAppState,
      });

      const internalStateSubscription = from(stateContainer.internalState).subscribe({
        next: setDiscoverInternalState,
      });

      const tabStateSub = stateContainer.createTabPersistableStateObservable().subscribe({
        next: () => {
          setTabStateVersion((prev) => prev + 1);
        },
      });

      discoverAppStateSubscription.current = unsubscribeState;
      discoverInternalStateSubscription.current = internalStateSubscription;
      discoverTabStateSubscription.current = tabStateSub;
    },
    [
      discoverAppState,
      setDiscoverInternalState,
      setDiscoverAppState,
      setDiscoverStateContainer,
      getAppStateFromSavedSearch,
      savedSearchId,
      savedSearchService,
      defaultDiscoverAppState,
      timelineId,
      initializeLocalSavedSearch,
      timelineRestorePending,
      discoverDataService,
    ]
  );

  const customizationsCallbacks = useMemo(
    () => [initialDiscoverCustomizationCallback, ...discoverCustomizationCallbacks],
    [initialDiscoverCustomizationCallback, discoverCustomizationCallbacks]
  );

  const services = useMemo(
    () => ({
      data: discoverDataService,
      filterManager: discoverDataService.query.filterManager,
      timefilter: discoverDataService.query.timefilter.timefilter,
    }),
    [discoverDataService]
  );

  const DiscoverContainer = discover.DiscoverContainer;

  const isLoading = dataViewStatus === 'loading' || dataViewStatus === 'pristine';

  return (
    <EmbeddedDiscoverContainer data-test-subj="timeline-embedded-discover">
      <HideSearchSessionIndicatorBreadcrumbIcon />
      <TimelineESQLGlobalStyles />
      <DiscoverContainer
        overrideServices={services}
        scopedHistory={history as ScopedHistory}
        customizationCallbacks={customizationsCallbacks}
        isLoading={isLoading}
      />
    </EmbeddedDiscoverContainer>
  );
};

// eslint-disable-next-line import/no-default-export
export default DiscoverTabContent;
