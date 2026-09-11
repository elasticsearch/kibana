/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { isFunction, isEqual } from 'lodash';
import { type DataView, DataViewType } from '@kbn/data-views-plugin/common';
import type { DataTableRecord } from '@kbn/discover-utils/types';
import type { SerializableRecord } from '@kbn/utility-types';
import type { GlobalQueryStateFromUrl } from '@kbn/data-plugin/public';
import {
  type AggregateQuery,
  type Query,
  type TimeRange,
  isOfAggregateQueryType,
  isOfQueryType,
} from '@kbn/es-query';
import { getInitialESQLQuery } from '@kbn/esql-utils';
import {
  DOC_HIDE_TIME_COLUMN_SETTING,
  SORT_DEFAULT_ORDER_SETTING,
  getDefaultSort,
} from '@kbn/discover-utils';
import {
  GLOBAL_STATE_URL_KEY,
  PROFILE_STATE_URL_KEY,
  DISCOVER_QUERY_MODE_KEY,
} from '../../../../../../common/constants';
import { APP_STATE_URL_KEY } from '../../../../../../common';
import { DataSourceType } from '../../../../../../common/data_sources';
import {
  ExpandedDocLinkability,
  getExpandedDocLinkability,
  getExpandedDocRef,
} from '../../../utils/expanded_doc';
import { DEFAULT_EXPANDED_DOC_OWNER } from '../constants';
import { isEqualState } from '../../utils/state_comparators';
import {
  internalStateSlice,
  type InternalStateThunkActionCreator,
  type InternalStateThunkAction,
  type TabActionPayload,
} from '../internal_state';
import {
  ProfileStateType,
  type ProfileStateDefinition,
  type ProfileStateDefaultsHandling,
} from '../../../../../../common/context_awareness';
import type { ProfileStateMutationOptions } from '../../../../../context_awareness';
import { selectTab } from '../selectors';
import {
  selectDataSourceProfileId,
  selectCurrentProfileUrlState,
  selectCurrentProfileStateDefinition,
  selectTabRuntimeState,
} from '../runtime_state';
import type {
  DiscoverAppState,
  DiscoverInternalState,
  ExpandedDocCascadePath,
  TabState,
  UpdateESQLQueryActionPayload,
} from '../types';
import { addLog } from '../../../../../utils/add_log';
import { FetchStatus } from '../../../../types';

export interface RawAppStatePayload {
  appState: DiscoverAppState;
  /**
   * Marks app state changes that come from URL syncing or other internal updates
   * instead of direct user actions. These updates skip profile app state
   * snapshot syncing so they do not overwrite restorable profile app state
   * defaults. This should rarely be needed outside of URL syncing and specific
   * edge cases.
   */
  isSystemTriggered?: boolean;
}

type AppStatePayload = TabActionPayload<RawAppStatePayload>;

const mergeAppState = (
  currentState: DiscoverInternalState,
  { tabId, appState }: AppStatePayload
) => {
  const currentAppState = selectTab(currentState, tabId).appState;
  const mergedAppState = { ...currentAppState, ...appState };
  return { mergedAppState, hasStateChanges: !isEqualState(currentAppState, mergedAppState) };
};

export const setAppState: InternalStateThunkActionCreator<[AppStatePayload]> = (payload) =>
  function setAppStateThunkFn(dispatch, _, { runtimeStateManager }) {
    const profileId = selectDataSourceProfileId(runtimeStateManager, payload.tabId);
    dispatch(internalStateSlice.actions.setAppState({ ...payload, profileId }));
  };

export const syncProfileAppStateSnapshot: InternalStateThunkActionCreator<
  [TabActionPayload<{ appState?: DiscoverAppState }>]
> = (payload) =>
  function syncProfileAppStateSnapshotThunkFn(dispatch, _, { runtimeStateManager }) {
    const profileId = selectDataSourceProfileId(runtimeStateManager, payload.tabId);
    dispatch(internalStateSlice.actions.syncProfileAppStateSnapshot({ ...payload, profileId }));
  };

/**
 * Partially update the tab app state, merging with existing state and pushing to URL history
 */
export const updateAppState: InternalStateThunkActionCreator<[AppStatePayload]> = (payload) =>
  function updateAppStateThunkFn(dispatch, getState) {
    const { mergedAppState, hasStateChanges } = mergeAppState(getState(), payload);

    if (hasStateChanges) {
      dispatch(setAppState({ ...payload, appState: mergedAppState }));
    }
  };

type ExpandedDocPayload = TabActionPayload<{
  expandedDoc: DataTableRecord | undefined;
  expandedDocOwner?: string;
  expandedDocCascadePath?: ExpandedDocCascadePath;
  initialDocViewerTabId?: string;
  initialDocViewerTabState?: object;
  shouldUpdateUrl?: boolean;
}>;

/** Sets the expanded document and synchronizes its URL reference. */
export const setExpandedDoc: InternalStateThunkActionCreator<[ExpandedDocPayload]> = (payload) =>
  function setExpandedDocThunkFn(dispatch, getState) {
    const { shouldUpdateUrl = true, ...expandedDocPayload } = payload;

    dispatch(internalStateSlice.actions.setExpandedDoc(expandedDocPayload));

    if (!shouldUpdateUrl) {
      return;
    }

    const { tabId, expandedDoc, expandedDocOwner = DEFAULT_EXPANDED_DOC_OWNER } = payload;
    const { appState } = selectTab(getState(), tabId);

    // The restore path cannot reconstruct documents from cascade grids.
    const nextExpandedDocRef =
      expandedDocOwner === DEFAULT_EXPANDED_DOC_OWNER &&
      getExpandedDocLinkability(appState.query, expandedDoc) === ExpandedDocLinkability.Linkable
        ? getExpandedDocRef(expandedDoc)
        : undefined;

    // Avoid adding URL history when closing a flyout that never wrote a reference.
    if (isEqual(appState.expandedDoc, nextExpandedDocRef)) {
      return;
    }

    dispatch(updateAppState({ tabId, appState: { expandedDoc: nextExpandedDocRef } }));
  };

/**
 * Partially update the tab app state, merging with existing state and replacing URL history
 */
export const updateAppStateAndReplaceUrl: InternalStateThunkActionCreator<
  [AppStatePayload],
  Promise<void>
> = (payload) =>
  async function updateAppStateAndReplaceUrlThunkFn(dispatch, getState, { urlStateStorage }) {
    const currentState = getState();

    if (currentState.tabs.unsafeCurrentId !== payload.tabId) {
      return dispatch(updateAppState(payload));
    }

    const { mergedAppState } = mergeAppState(currentState, payload);

    if (!payload.isSystemTriggered) {
      dispatch(
        syncProfileAppStateSnapshot({
          tabId: payload.tabId,
          appState: mergedAppState,
        })
      );
    }

    await urlStateStorage.set(APP_STATE_URL_KEY, mergedAppState, { replace: true });
  };

type GlobalStatePayload = TabActionPayload<Pick<TabState, 'globalState'>>;

const mergeGlobalState = (
  currentState: DiscoverInternalState,
  { tabId, globalState }: GlobalStatePayload
) => {
  const currentGlobalState = selectTab(currentState, tabId).globalState;
  const mergedGlobalState = { ...currentGlobalState, ...globalState };
  return {
    mergedGlobalState,
    hasStateChanges: !isEqualState(currentGlobalState, mergedGlobalState),
  };
};

/**
 * Partially update the tab global state, merging with existing state and pushing to URL history
 */
export const updateGlobalState: InternalStateThunkActionCreator<[GlobalStatePayload]> = (payload) =>
  function updateGlobalStateThunkFn(dispatch, getState) {
    const { mergedGlobalState, hasStateChanges } = mergeGlobalState(getState(), payload);

    if (hasStateChanges) {
      dispatch(
        internalStateSlice.actions.setGlobalState({
          tabId: payload.tabId,
          globalState: mergedGlobalState,
        })
      );
    }
  };

/**
 * Partially update the tab global state, merging with existing state and replacing URL history
 */
export const updateGlobalStateAndReplaceUrl: InternalStateThunkActionCreator<
  [GlobalStatePayload],
  Promise<void>
> = (payload) =>
  async function updateGlobalStateAndReplaceUrlThunkFn(dispatch, getState, { urlStateStorage }) {
    const currentState = getState();

    if (currentState.tabs.unsafeCurrentId !== payload.tabId) {
      return dispatch(updateGlobalState(payload));
    }

    const { mergedGlobalState } = mergeGlobalState(currentState, payload);
    const globalUrlState: GlobalQueryStateFromUrl = {
      time: mergedGlobalState.timeRange,
      refreshInterval: mergedGlobalState.refreshInterval,
      filters: mergedGlobalState.filters,
    };

    await urlStateStorage.set(GLOBAL_STATE_URL_KEY, globalUrlState, { replace: true });
  };

type AttributesPayload = TabActionPayload<{ attributes: Partial<TabState['attributes']> }>;

const mergeAttributes = (
  currentState: DiscoverInternalState,
  { tabId, attributes }: AttributesPayload
) => {
  const currentAttributes = selectTab(currentState, tabId).attributes;
  const mergedAttributes = { ...currentAttributes, ...attributes };
  return {
    mergedAttributes,
    hasStateChanges: !isEqual(currentAttributes, mergedAttributes),
  };
};

/**
 * Partially update the tab attributes, merging with existing state
 */
export const updateAttributes: InternalStateThunkActionCreator<[AttributesPayload]> = (payload) =>
  function updateAttributesThunkFn(dispatch, getState) {
    const { mergedAttributes, hasStateChanges } = mergeAttributes(getState(), payload);

    if (hasStateChanges) {
      dispatch(
        internalStateSlice.actions.setAttributes({
          tabId: payload.tabId,
          attributes: mergedAttributes,
        })
      );
    }
  };

type ProfileStatePayload<TState extends SerializableRecord> = TabActionPayload<{
  profileStateDefinition: ProfileStateDefinition<TState>;
  profileState: TState;
  historyMethod?: ProfileStateMutationOptions['historyMethod'];
}>;

const ALL_PROFILE_STATE_TYPES = new Set([
  ProfileStateType.Ui,
  ProfileStateType.Url,
  ProfileStateType.Persistent,
]);
const NON_URL_PROFILE_STATE_TYPES = new Set([ProfileStateType.Ui, ProfileStateType.Persistent]);
const URL_PROFILE_STATE_TYPES = new Set([ProfileStateType.Url]);

/**
 * Updates tab profile state for provided definition, and optionally pushes to URL history
 */
export const setProfileState = <TState extends SerializableRecord>(
  payload: ProfileStatePayload<TState>
): InternalStateThunkAction =>
  function setProfileStateThunkFn(
    dispatch,
    getState,
    { runtimeStateManager, services, urlStateStorage }
  ) {
    const {
      tabId,
      profileStateDefinition,
      profileState: nextProfileState,
      historyMethod,
    } = payload;
    const { key, defaultState } = profileStateDefinition;
    const currentState = getState();
    const currentTab = selectTab(currentState, tabId);

    // Adapter writes can race with tab closure, so ignore them if the tab is closed
    if (!currentTab) {
      return;
    }

    // Consumers work with effective state, while Redux stores only explicit (non-default) overrides
    const currentExplicitProfileState = currentTab.profileState[key];
    const currentProfileState = currentExplicitProfileState
      ? { ...defaultState, ...currentExplicitProfileState }
      : defaultState;

    if (isEqual(currentProfileState, nextProfileState)) {
      return;
    }

    const filterProfileState = ({
      profileState,
      stateTypes,
      defaultsHandling,
    }: {
      profileState: SerializableRecord | undefined;
      stateTypes: Set<ProfileStateType>;
      defaultsHandling?: ProfileStateDefaultsHandling;
    }) => {
      return services.profileStateRegistry.filterFieldsByType({
        profileState,
        stateKey: key,
        stateTypes,
        defaultsHandling,
      });
    };

    const dispatchProfileState = (profileState: SerializableRecord | undefined) => {
      dispatch(internalStateSlice.actions.setProfileState({ tabId, key, profileState }));
    };

    const profileUrlStateDefinition = selectCurrentProfileStateDefinition(
      runtimeStateManager,
      tabId
    );

    // Normalize once to the canonical Redux shape before splitting by field lifetime
    const nextExplicitProfileState = filterProfileState({
      profileState: nextProfileState,
      stateTypes: ALL_PROFILE_STATE_TYPES,
      defaultsHandling: 'strip',
    });

    // Only active-profile replace updates need URL coordination; other updates can write straight
    // to Redux and let the usual sync paths handle URL persistence
    if (
      historyMethod !== 'replace' ||
      currentState.tabs.unsafeCurrentId !== tabId ||
      profileUrlStateDefinition?.key !== key
    ) {
      return dispatchProfileState(nextExplicitProfileState);
    }

    const nextNonUrlProfileState = filterProfileState({
      profileState: nextExplicitProfileState,
      stateTypes: NON_URL_PROFILE_STATE_TYPES,
    });
    const nextUrlProfileState = filterProfileState({
      profileState: nextExplicitProfileState,
      stateTypes: URL_PROFILE_STATE_TYPES,
    });
    const currentUrlProfileState = filterProfileState({
      profileState: currentExplicitProfileState,
      stateTypes: URL_PROFILE_STATE_TYPES,
      defaultsHandling: 'strip',
    });

    // Replace-mode updates keep old URL fields in Redux until the URL storage flush syncs the
    // replacement value back, so synchronous state observers can briefly see new non-URL fields
    // paired with old URL fields
    dispatchProfileState({ ...nextNonUrlProfileState, ...currentUrlProfileState });

    if (!isEqual(currentUrlProfileState, nextUrlProfileState)) {
      // Expand defaults only at the URL boundary so the replacement URL is self-contained without
      // changing Redux's explicit-only representation
      const expandedUrlProfileState = filterProfileState({
        profileState: nextExplicitProfileState,
        stateTypes: URL_PROFILE_STATE_TYPES,
        defaultsHandling: 'expand',
      });
      const profileStateForUrl = expandedUrlProfileState
        ? { [key]: expandedUrlProfileState }
        : undefined;

      void urlStateStorage.set(PROFILE_STATE_URL_KEY, profileStateForUrl, { replace: true });
      urlStateStorage.kbnUrlControls.flush();
    }
  };

/**
 * Push the current tab app state and global state to the URL, replacing URL history
 */
export const pushCurrentTabStateToUrl: InternalStateThunkActionCreator<
  [TabActionPayload],
  Promise<void>
> = ({ tabId }) =>
  async function pushCurrentTabStateToUrlThunkFn(
    dispatch,
    getState,
    { runtimeStateManager, services, urlStateStorage }
  ) {
    await Promise.all([
      dispatch(updateGlobalStateAndReplaceUrl({ tabId, globalState: {} })),
      dispatch(updateAppStateAndReplaceUrl({ tabId, appState: {} })),
      (async () => {
        const scopedProfilesManager = selectTabRuntimeState(
          runtimeStateManager,
          tabId
        ).scopedProfilesManager$.getValue();

        // Keep any hydrated profile URL state until we know which profile owns it
        if (!scopedProfilesManager.hasResolvedDataSourceProfile()) {
          return;
        }

        const profileStateForUrl = selectCurrentProfileUrlState({
          runtimeStateManager,
          tabId,
          profileStateMap: selectTab(getState(), tabId).profileState,
          profileStateRegistry: services.profileStateRegistry,
        });

        return urlStateStorage.set(PROFILE_STATE_URL_KEY, profileStateForUrl, { replace: true });
      })(),
    ]);
  };

/**
 * Triggered when transitioning from ESQL to Dataview
 * Clean ups the ES|QL query and moves to the dataview mode
 */
export const transitionFromESQLToDataView: InternalStateThunkActionCreator<
  [TabActionPayload<{ dataView: DataView }>]
> = ({ tabId, dataView }) =>
  function transitionFromESQLToDataViewThunkFn(dispatch, _, { services }) {
    // Mark all profile app state default fields to reset when transitioning to data view mode
    dispatch(
      internalStateSlice.actions.setProfileAppStateDefaultFieldsToReset({
        tabId,
        fieldsToReset: 'all',
      })
    );

    const sort = getDefaultSort(
      dataView,
      services.uiSettings.get(SORT_DEFAULT_ORDER_SETTING, 'desc'),
      services.uiSettings.get(DOC_HIDE_TIME_COLUMN_SETTING, false),
      false
    );

    dispatch(
      updateAppState({
        tabId,
        appState: {
          expandedDoc: undefined,
          query: {
            language: 'kuery',
            query: '',
          },
          columns: [],
          sort,
          dataSource: {
            type: DataSourceType.DataView,
            dataViewId: dataView.id ?? '',
          },
        },
      })
    );

    services.storage.set(DISCOVER_QUERY_MODE_KEY, {
      currentMode: 'classic',
      defaultMode: services.discoverFeatureFlags.getIsEsqlDefault() ? 'esql' : 'classic',
    });
  };

/**
 * Triggered when transitioning from ESQL to Dataview
 * Clean ups the ES|QL query and moves to the dataview mode
 */
export const transitionFromDataViewToESQL: InternalStateThunkActionCreator<
  [TabActionPayload<{ dataView: DataView }>]
> = ({ tabId, dataView }) =>
  function transitionFromDataViewToESQLThunkFn(dispatch, getState, { services }) {
    // Mark all profile app state default fields to reset when transitioning to ES|QL mode
    dispatch(
      internalStateSlice.actions.setProfileAppStateDefaultFieldsToReset({
        tabId,
        fieldsToReset: 'all',
      })
    );

    const currentState = getState();
    const tabState = selectTab(currentState, tabId);
    const { appState } = tabState;
    const { query } = appState;
    const filterQuery = query && isOfQueryType(query) ? query : undefined;

    const allFilters = [...(appState.filters ?? []), ...(tabState.globalState?.filters ?? [])];
    const queryString = getInitialESQLQuery(dataView, filterQuery, allFilters);

    dispatch(
      updateAppState({
        tabId,
        appState: {
          expandedDoc: undefined,
          query: { esql: queryString },
          filters: [],
          dataSource: {
            type: DataSourceType.Esql,
          },
          columns: [],
          sort: undefined,
        },
      })
    );

    // clears pinned filters
    dispatch(updateGlobalState({ tabId, globalState: { filters: [] } }));

    services.storage.set(DISCOVER_QUERY_MODE_KEY, {
      currentMode: 'esql',
      defaultMode: services.discoverFeatureFlags.getIsEsqlDefault() ? 'esql' : 'classic',
    });
  };

/**
 * Updates the ES|QL query string
 */
export const updateESQLQuery: InternalStateThunkActionCreator<[UpdateESQLQueryActionPayload]> = ({
  tabId,
  queryOrUpdater,
}) =>
  function updateESQLQueryThunkFn(dispatch, getState) {
    addLog('updateESQLQuery');
    const currentState = getState();
    const appState = selectTab(currentState, tabId).appState;
    const { query: currentQuery } = appState;

    if (!isOfAggregateQueryType(currentQuery)) {
      throw new Error(
        'Cannot update a non-ES|QL query. Make sure this function is only called once in ES|QL mode.'
      );
    }

    const queryUpdater = isFunction(queryOrUpdater) ? queryOrUpdater : () => queryOrUpdater;
    const query = { esql: queryUpdater(currentQuery.esql) };

    dispatch(updateAppState({ tabId, appState: { query } }));
  };

/**
 * Triggered when a user submits a query in the search bar
 */
export const onQuerySubmit: InternalStateThunkActionCreator<
  [
    TabActionPayload<{
      payload: { dateRange: TimeRange; query?: Query | AggregateQuery };
      isUpdate?: boolean;
    }>
  ]
> = ({ tabId, payload, isUpdate }) =>
  function onQuerySubmitThunkFn(
    dispatch,
    getState,
    { searchSessionManager, runtimeStateManager, services }
  ) {
    const { scopedEbtManager$, dataStateContainer$ } = selectTabRuntimeState(
      runtimeStateManager,
      tabId
    );

    const trackQueryFields = (query: Query | AggregateQuery | undefined) => {
      const scopedEbtManager = scopedEbtManager$.getValue();
      const { fieldsMetadata } = services;

      scopedEbtManager.trackSubmittingQuery({
        query,
        fieldsMetadata,
      });
    };

    trackQueryFields(payload.query);

    if (isUpdate === false) {
      // remove the search session if the given query is not just updated
      searchSessionManager.removeSearchSessionIdFromURL({ replace: false });
      addLog('onQuerySubmit triggers data fetching');
      dataStateContainer$.getValue()?.fetch();
    }
  };

/**
 * Triggers fetching of new data from Elasticsearch
 * If initial is true, when SEARCH_ON_PAGE_LOAD_SETTING is set to false and it's a new saved search no fetch is triggered
 */
export const fetchData: InternalStateThunkActionCreator<
  [TabActionPayload<{ initial?: boolean }>]
> = ({ tabId, initial }) =>
  function fetchDataThunkFn(dispatch, getState, { runtimeStateManager }) {
    addLog('fetchData', { initial });
    const { dataStateContainer$ } = selectTabRuntimeState(runtimeStateManager, tabId);
    const dataStateContainer = dataStateContainer$.getValue();
    if (!initial || dataStateContainer?.getInitialFetchStatus() === FetchStatus.LOADING) {
      dataStateContainer?.fetch();
    }
  };

/**
 * Pause auto refresh interval if the data view is not time-based or is a rollup
 */
export const pauseAutoRefreshInterval: InternalStateThunkActionCreator<
  [TabActionPayload<{ dataView: DataView }>]
> = ({ tabId, dataView }) =>
  function pauseAutoRefreshIntervalThunkFn(dispatch, getState) {
    if (dataView && (!dataView.isTimeBased() || dataView.type === DataViewType.ROLLUP)) {
      const currentState = getState();
      const globalState = selectTab(currentState, tabId).globalState;
      if (globalState?.refreshInterval && !globalState.refreshInterval.pause) {
        dispatch(
          updateGlobalState({
            tabId,
            globalState: {
              refreshInterval: { ...globalState.refreshInterval, pause: true },
            },
          })
        );
      }
    }
  };
