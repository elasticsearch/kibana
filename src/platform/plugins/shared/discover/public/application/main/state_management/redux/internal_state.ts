/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DataTableRecord } from '@kbn/discover-utils';
import { v4 as uuidv4 } from 'uuid';
import { isEqual, throttle } from 'lodash';
import { from, type Observable } from 'rxjs';
import {
  type ImmutableStateInvariantMiddlewareOptions,
  type PayloadAction,
  type PayloadActionCreator,
  type SerializableStateInvariantMiddlewareOptions,
  type ThunkAction,
  type ThunkDispatch,
  type TypedStartListening,
  type ListenerEffect,
  configureStore,
  createSlice,
  createListenerMiddleware,
  createAction,
  isAnyOf,
} from '@reduxjs/toolkit';
import { dismissFlyouts, DiscoverFlyouts } from '@kbn/discover-utils';
import type { IKbnUrlStateStorage } from '@kbn/kibana-utils-plugin/public';
import type { ESQLControlVariable } from '@kbn/esql-types';
import type { DiscoverSession } from '@kbn/saved-search-plugin/common';
import { isOfAggregateQueryType } from '@kbn/es-query';
import type { UnifiedDataTableRestorableState } from '@kbn/unified-data-table';
import { DISCOVER_QUERY_MODE_KEY } from '../../../../../common/constants';
import type { DiscoverCustomizationContext } from '../../../../customizations';
import type { DiscoverServices } from '../../../../build_services';
import type { ContextAwarenessToolkit } from '../../../../context_awareness/toolkit';
import {
  type RuntimeStateManager,
  selectTabRuntimeInternalState,
  selectTabRuntimeState,
} from './runtime_state';
import { createContextAwarenessToolkit } from './context_awareness_toolkit';
import {
  DEFAULT_PROFILE_STATE_FIELDS,
  TabsBarVisibility,
  type DefaultProfileStateField,
  type DiscoverInternalState,
  type ProfileStateSnapshot,
  type TabState,
  type RecentlyClosedTabState,
  TabInitializationStatus,
  HEAVY_STATE_KEYS,
} from './types';
import {
  loadDataViewList,
  initializeTabs,
  initializeSingleTab,
  type RawAppStatePayload,
} from './actions';
import { DEFAULT_EXPANDED_DOC_OWNER } from './constants';
import { type HasUnsavedChangesResult, selectTab } from './selectors';
import type { TabsStorageManager } from '../tabs_storage_manager';
import type { DiscoverSearchSessionManager } from '../discover_search_session';
import { createEsqlDataSource } from '../../../../../common/data_sources';
import type { CascadedDocumentsStateManager } from '../../data_fetching/cascaded_documents_fetcher';
import { createCascadedDocumentsStateManager } from './cascaded_documents_state_manager';

const MIDDLEWARE_THROTTLE_MS = 300;
const MIDDLEWARE_THROTTLE_OPTIONS = { leading: false, trailing: true };

const initialState: DiscoverInternalState = {
  initializationState: { hasESData: false, hasUserDataView: false },
  userId: undefined,
  spaceId: undefined,
  persistedDiscoverSession: undefined,
  hasUnsavedChanges: false,
  defaultProfileAdHocDataViewIds: [],
  defaultProfileEsqlQuery: undefined,
  savedDataViews: [],
  isESQLToDataViewTransitionModalVisible: false,
  tabsBarVisibility: TabsBarVisibility.default,
  tabs: {
    areInitializing: false,
    byId: {},
    allIds: [],
    unsavedIds: [],
    recentlyClosedTabsById: {},
    recentlyClosedTabIds: [],
    unsafeCurrentId: '',
  },
};

export type TabActionPayload<T extends object = object> = { tabId: string } & T;

type TabAction<T extends object = object> = PayloadAction<TabActionPayload<T>>;

const withTab = <TPayload extends TabActionPayload>(
  state: DiscoverInternalState,
  payload: TPayload,
  fn: (tab: TabState) => void
) => {
  const tab = selectTab(state, payload.tabId);

  if (tab) {
    fn(tab);
  }
};

const normalizeVisiblePanelsState = (appState: TabState['appState']) => {
  if (appState.hideChart && appState.hideTable) {
    return {
      ...appState,
      hideTable: false,
    };
  }

  return appState;
};

const setProfileStateSnapshotField = <TField extends DefaultProfileStateField>(
  snapshot: ProfileStateSnapshot,
  field: TField,
  value: TabState['appState'][TField]
) => {
  snapshot[field] = value;
};

const syncProfileStateSnapshot = (
  tab: TabState,
  profileId: string,
  nextAppState?: TabState['appState']
) => {
  const profileStateSnapshots = tab.defaultProfileState.snapshotsByProfileId;
  const profileStateSnapshot = profileStateSnapshots[profileId] ?? {};
  const snapshotAppState = nextAppState ?? tab.appState;

  for (const field of DEFAULT_PROFILE_STATE_FIELDS) {
    // If no nextAppState was passed, we're syncing the current app state (e.g. on profile init).
    // If nextAppState was passed, we're syncing only the changed fields (e.g. on user action).
    if (!nextAppState || !isEqual(tab.appState[field], nextAppState[field])) {
      setProfileStateSnapshotField(profileStateSnapshot, field, snapshotAppState[field]);
    }
  }

  profileStateSnapshots[profileId] = profileStateSnapshot;
};

export const internalStateSlice = createSlice({
  name: 'internalState',
  initialState,
  reducers: {
    setInitializationState: (
      state,
      action: PayloadAction<DiscoverInternalState['initializationState']>
    ) => {
      state.initializationState = action.payload;
    },

    setTabs: (
      state,
      action: PayloadAction<{
        allTabs: TabState[];
        selectedTabId: string;
        recentlyClosedTabs: RecentlyClosedTabState[];
        updatedDiscoverSession?: DiscoverSession;
      }>
    ) => {
      state.tabs.byId = action.payload.allTabs.reduce<Record<string, TabState>>(
        (acc, tab) => ({
          ...acc,
          [tab.id]:
            tab.id === action.payload.selectedTabId ? { ...tab, forceFetchOnSelect: false } : tab,
        }),
        {}
      );
      state.tabs.allIds = action.payload.allTabs.map((tab) => tab.id);
      state.tabs.recentlyClosedTabsById = action.payload.recentlyClosedTabs.reduce<
        Record<string, RecentlyClosedTabState>
      >(
        (acc, tab) => ({
          ...acc,
          [tab.id]: tab,
        }),
        {}
      );
      state.tabs.recentlyClosedTabIds = action.payload.recentlyClosedTabs.map((tab) => tab.id);
      state.tabs.unsafeCurrentId = action.payload.selectedTabId;
      state.persistedDiscoverSession =
        action.payload.updatedDiscoverSession ?? state.persistedDiscoverSession;
    },

    setUnsavedChanges: (state, action: PayloadAction<HasUnsavedChangesResult>) => {
      state.hasUnsavedChanges = action.payload.hasUnsavedChanges;
      state.tabs.unsavedIds = action.payload.unsavedTabIds;
    },

    disconnectTab: (state, action: TabAction) =>
      withTab(state, action.payload, (tab) => {
        tab.initializationState = { initializationStatus: TabInitializationStatus.Disconnected };
      }),

    setForceFetchOnSelect: (state, action: TabAction<Pick<TabState, 'forceFetchOnSelect'>>) =>
      withTab(state, action.payload, (tab) => {
        tab.forceFetchOnSelect = action.payload.forceFetchOnSelect;
      }),

    setIsDataViewLoading: (state, action: TabAction<Pick<TabState, 'isDataViewLoading'>>) =>
      withTab(state, action.payload, (tab) => {
        tab.isDataViewLoading = action.payload.isDataViewLoading;
      }),

    setDefaultProfileAdHocDataViewIds: (state, action: PayloadAction<string[]>) => {
      state.defaultProfileAdHocDataViewIds = action.payload;
    },

    setDefaultProfileEsqlQuery: (
      state,
      action: PayloadAction<DiscoverInternalState['defaultProfileEsqlQuery']>
    ) => {
      state.defaultProfileEsqlQuery = action.payload;
    },

    setTabsBarVisibility: (state, action: PayloadAction<TabsBarVisibility>) => {
      state.tabsBarVisibility = action.payload;
    },

    markNonActiveTabsForRefetch: (state) => {
      // Mark all non-active tabs to refetch on selection
      // Used when projectRouting changes in CPS Manager
      const currentTabId = state.tabs.unsafeCurrentId;
      state.tabs.allIds.forEach((tabId) => {
        if (tabId !== currentTabId && state.tabs.byId[tabId]) {
          state.tabs.byId[tabId].forceFetchOnSelect = true;
        }
      });
    },

    setExpandedDoc: (
      state,
      action: TabAction<{
        expandedDoc: DataTableRecord | undefined;
        expandedDocOwner?: string;
        initialDocViewerTabId?: string;
        initialDocViewerTabState?: object;
      }>
    ) => {
      withTab(state, action.payload, (tab) => {
        const nextExpandedDocOwner = action.payload.expandedDoc
          ? action.payload.expandedDocOwner ?? DEFAULT_EXPANDED_DOC_OWNER
          : undefined;

        if (tab.expandedDoc?.id !== action.payload.expandedDoc?.id) {
          // Reset the initialDocViewerTabId and docViewer when changing expandedDoc to a different document
          tab.initialDocViewerTabId = undefined;
          tab.uiState.docViewer = {};
        }

        if (!action.payload.expandedDoc || tab.expandedDocOwner !== nextExpandedDocOwner) {
          tab.renderDocumentViewMeta = undefined;
        }

        tab.expandedDoc = action.payload.expandedDoc;
        tab.expandedDocOwner = nextExpandedDocOwner;
        tab.initialDocViewerTabId = action.payload.initialDocViewerTabId;

        if (action.payload.initialDocViewerTabId && action.payload.initialDocViewerTabState) {
          tab.uiState.docViewer = {
            ...tab.uiState.docViewer,
            docViewerTabsState: {
              ...(tab.uiState.docViewer?.docViewerTabsState ?? {}),
              [action.payload.initialDocViewerTabId]: action.payload.initialDocViewerTabState,
            },
          };
        }
      });
    },

    setRenderDocumentViewMeta: (
      state,
      action: TabAction<Pick<TabState, 'renderDocumentViewMeta'>>
    ) => {
      withTab(state, action.payload, (tab) => {
        tab.renderDocumentViewMeta = action.payload.renderDocumentViewMeta;
      });
    },

    setInitialDocViewerTabId: (
      state,
      action: TabAction<{
        initialDocViewerTabId: string | undefined;
      }>
    ) => {
      withTab(state, action.payload, (tab) => {
        tab.initialDocViewerTabId = action.payload.initialDocViewerTabId;
      });
    },

    setDataRequestParams: (state, action: TabAction<Pick<TabState, 'dataRequestParams'>>) =>
      withTab(state, action.payload, (tab) => {
        tab.dataRequestParams = action.payload.dataRequestParams;
      }),

    /**
     * Set the tab global state, overwriting existing state and pushing to URL history
     */
    setGlobalState: (state, action: TabAction<Pick<TabState, 'globalState'>>) =>
      withTab(state, action.payload, (tab) => {
        tab.globalState = action.payload.globalState;
      }),

    /**
     * Set the tab app state, overwriting existing state and pushing to URL history
     */
    setAppState: (state, action: TabAction<RawAppStatePayload & { profileId: string }>) =>
      withTab(state, action.payload, (tab) => {
        let appState = normalizeVisiblePanelsState(action.payload.appState);

        // When updating to an ES|QL query, sync the data source
        if (isOfAggregateQueryType(appState.query)) {
          appState = { ...appState, dataSource: createEsqlDataSource() };
        }

        if (!action.payload.isSystemTriggered) {
          syncProfileStateSnapshot(tab, action.payload.profileId, appState);
        }

        tab.previousAppState = tab.appState;
        tab.appState = appState;
      }),

    syncProfileStateSnapshot: (
      state,
      action: TabAction<{ profileId: string; appState?: TabState['appState'] }>
    ) =>
      withTab(state, action.payload, (tab) => {
        syncProfileStateSnapshot(tab, action.payload.profileId, action.payload.appState);
      }),

    setProfileState: (state, action: TabAction<{ key: string; profileState: object }>) =>
      withTab(state, action.payload, (tab) => {
        tab.profileState[action.payload.key] = action.payload.profileState;
      }),

    /**
     * Set the tab app state and previous app state, overwriting existing state and pushing to URL history
     */
    resetAppState: (state, action: TabAction<Pick<TabState, 'appState'>>) =>
      withTab(state, action.payload, (tab) => {
        tab.previousAppState = action.payload.appState;
        tab.appState = action.payload.appState;
      }),

    /**
     * Set the tab attributes state
     */
    setAttributes: (state, action: TabAction<Pick<TabState, 'attributes'>>) =>
      withTab(state, action.payload, (tab) => {
        tab.attributes = action.payload.attributes;
      }),

    setOverriddenVisContextAfterInvalidation: (
      state,
      action: TabAction<Pick<TabState, 'overriddenVisContextAfterInvalidation'>>
    ) =>
      withTab(state, action.payload, (tab) => {
        tab.overriddenVisContextAfterInvalidation =
          action.payload.overriddenVisContextAfterInvalidation;
      }),

    setCascadedDocumentsState: (
      state,
      action: TabAction<Pick<TabState, 'cascadedDocumentsState'>>
    ) =>
      withTab(state, action.payload, (tab) => {
        tab.cascadedDocumentsState = action.payload.cascadedDocumentsState;
      }),

    setSelectedCascadeGroups: (
      state,
      actions: TabAction<Pick<TabState['cascadedDocumentsState'], 'selectedCascadeGroups'>>
    ) =>
      withTab(state, actions.payload, (tab) => {
        tab.cascadedDocumentsState.selectedCascadeGroups = actions.payload.selectedCascadeGroups;
      }),

    setEsqlVariables: (
      state,
      action: TabAction<{ esqlVariables: ESQLControlVariable[] | undefined }>
    ) =>
      withTab(state, action.payload, (tab) => {
        tab.esqlVariables = action.payload.esqlVariables;
      }),

    setIsESQLToDataViewTransitionModalVisible: (state, action: PayloadAction<boolean>) => {
      state.isESQLToDataViewTransitionModalVisible = action.payload;
    },

    setProfileStateFieldsToReset: {
      prepare: (
        payload: TabActionPayload<Pick<TabState['defaultProfileState'], 'fieldsToReset'>>
      ) => ({
        payload: {
          ...payload,
          fieldsToReset: {
            fieldsToReset: payload.fieldsToReset,
            resetId: uuidv4(),
          },
        },
      }),
      reducer: (
        state,
        action: TabAction<{
          fieldsToReset: Pick<TabState['defaultProfileState'], 'fieldsToReset' | 'resetId'>;
        }>
      ) =>
        withTab(state, action.payload, (tab) => {
          tab.defaultProfileState = {
            ...tab.defaultProfileState,
            ...action.payload.fieldsToReset,
          };
        }),
    },

    setProfileStateFieldsToResetWithoutResetId: (
      state,
      action: TabAction<Pick<TabState['defaultProfileState'], 'fieldsToReset'>>
    ) =>
      withTab(state, action.payload, (tab) => {
        tab.defaultProfileState = {
          ...tab.defaultProfileState,
          fieldsToReset: action.payload.fieldsToReset,
        };
      }),

    resetOnSavedSearchChange: (state, action: TabAction) =>
      withTab(state, action.payload, (tab) => {
        tab.overriddenVisContextAfterInvalidation = undefined;
        tab.expandedDoc = undefined;
        tab.expandedDocOwner = undefined;
        tab.renderDocumentViewMeta = undefined;
        tab.initialDocViewerTabId = undefined;
        tab.uiState.docViewer = {};
      }),

    setESQLEditorUiState: (
      state,
      action: TabAction<{ esqlEditorUiState: Partial<TabState['uiState']['esqlEditor']> }>
    ) =>
      withTab(state, action.payload, (tab) => {
        tab.uiState.esqlEditor = action.payload.esqlEditorUiState;
      }),

    setDataGridUiState: (
      state,
      action: TabAction<{ dataGridUiState: Partial<TabState['uiState']['dataGrid']> }>
    ) =>
      withTab(state, action.payload, (tab) => {
        tab.uiState.dataGrid = action.payload.dataGridUiState;
      }),

    setFieldListUiState: (
      state,
      action: TabAction<{ fieldListUiState: Partial<TabState['uiState']['fieldList']> }>
    ) =>
      withTab(state, action.payload, (tab) => {
        tab.uiState.fieldList = action.payload.fieldListUiState;
      }),

    setFieldListExistingFieldsInfoUiState: (
      state,
      action: TabAction<{
        fieldListExistingFieldsInfo: TabState['uiState']['fieldListExistingFieldsInfo'];
      }>
    ) =>
      withTab(state, action.payload, (tab) => {
        tab.uiState.fieldListExistingFieldsInfo = action.payload.fieldListExistingFieldsInfo;
      }),

    resetAffectedFieldListExistingFieldsInfoUiState: (
      state,
      action: PayloadAction<{
        dataViewId: string;
      }>
    ) => {
      Object.values(state.tabs.byId).forEach((tab) => {
        if (tab.uiState.fieldListExistingFieldsInfo?.dataViewId === action.payload.dataViewId) {
          tab.uiState.fieldListExistingFieldsInfo = undefined;
        }
      });
    },

    setLayoutUiState: (
      state,
      action: TabAction<{ layoutUiState: Partial<TabState['uiState']['layout']> }>
    ) =>
      withTab(state, action.payload, (tab) => {
        tab.uiState.layout = action.payload.layoutUiState;
      }),

    setSearchDraftUiState: (
      state,
      action: TabAction<{ searchDraftUiState: Partial<TabState['uiState']['searchDraft']> }>
    ) =>
      withTab(state, action.payload, (tab) => {
        tab.uiState.searchDraft = action.payload.searchDraftUiState;
      }),

    setMetricsGridState: (
      state,
      action: TabAction<{ metricsGridState: Partial<TabState['uiState']['metricsGrid']> }>
    ) =>
      withTab(state, action.payload, (tab) => {
        tab.uiState.metricsGrid = action.payload.metricsGridState;
      }),

    setDocViewerUiState: (
      state,
      action: TabAction<{ docViewerUiState: Partial<TabState['uiState']['docViewer']> }>
    ) =>
      withTab(state, action.payload, (tab) => {
        tab.uiState.docViewer = action.payload.docViewerUiState;
      }),

    setDataCascadeUiState: (
      state,
      action: TabAction<{ dataCascadeUiState: TabState['uiState']['dataCascade'] }>
    ) =>
      withTab(state, action.payload, (tab) => {
        tab.uiState.dataCascade = action.payload.dataCascadeUiState;
      }),

    setCascadedDocumentsDataGridUiState: (
      state,
      action: TabAction<{
        nodeId: string;
        dataGridUiState: Partial<UnifiedDataTableRestorableState>;
      }>
    ) =>
      withTab(state, action.payload, (tab) => {
        tab.uiState.cascadedDocumentsDataGridMap ??= {};
        tab.uiState.cascadedDocumentsDataGridMap[action.payload.nodeId] =
          action.payload.dataGridUiState;
      }),
  },
  extraReducers: (builder) => {
    builder.addCase(loadDataViewList.fulfilled, (state, action) => {
      state.savedDataViews = action.payload;
    });

    builder.addCase(initializeTabs.pending, (state) => {
      state.tabs.areInitializing = true;
    });

    builder.addCase(initializeTabs.fulfilled, (state, action) => {
      state.userId = action.payload.userId;
      state.spaceId = action.payload.spaceId;
      state.persistedDiscoverSession = action.payload.persistedDiscoverSession;
    });

    builder.addCase(initializeSingleTab.pending, (state, action) =>
      withTab(state, action.meta.arg, (tab) => {
        if (tab.initializationState.initializationStatus !== TabInitializationStatus.Disconnected) {
          tab.initializationState = {
            initializationStatus: TabInitializationStatus.InProgress,
          };
        }
      })
    );

    builder.addCase(initializeSingleTab.fulfilled, (state, action) =>
      withTab(state, action.meta.arg, (tab) => {
        if (tab.initializationState.initializationStatus !== TabInitializationStatus.Disconnected) {
          tab.initializationState = {
            initializationStatus: action.payload.showNoDataPage
              ? TabInitializationStatus.NoData
              : TabInitializationStatus.Complete,
          };
        }
      })
    );

    builder.addCase(initializeSingleTab.rejected, (state, action) =>
      withTab(state, action.meta.arg, (tab) => {
        if (tab.initializationState.initializationStatus !== TabInitializationStatus.Disconnected) {
          tab.initializationState = {
            initializationStatus: TabInitializationStatus.Error,
            error: action.error,
          };
        }
      })
    );

    builder.addMatcher(isAnyOf(initializeTabs.fulfilled, initializeTabs.rejected), (state) => {
      state.tabs.areInitializing = false;
    });
  },
});

export const syncLocallyPersistedTabState = createAction<TabActionPayload>(
  'internalState/syncLocallyPersistedTabState'
);

export const discardFlyoutsOnTabChange = createAction('internalState/discardFlyoutsOnTabChange');

export const transitionedFromEsqlToDataView = createAction<TabActionPayload>(
  'internalState/transitionedFromEsqlToDataView'
);

export const transitionedFromDataViewToEsql = createAction<TabActionPayload>(
  'internalState/transitionedFromDataViewToEsql'
);

type InternalStateListenerEffect<
  TActionCreator extends PayloadActionCreator<TPayload>,
  TPayload = TActionCreator extends PayloadActionCreator<infer T> ? T : never
> = ListenerEffect<
  ReturnType<TActionCreator>,
  DiscoverInternalState,
  InternalStateDispatch,
  InternalStateDependencies
>;

const createMiddleware = (options: InternalStateDependencies) => {
  const listenerMiddleware = createListenerMiddleware({ extra: options });
  const startListening = listenerMiddleware.startListening as TypedStartListening<
    DiscoverInternalState,
    InternalStateDispatch,
    InternalStateDependencies
  >;

  startListening({
    actionCreator: internalStateSlice.actions.setTabs,
    effect: throttle<InternalStateListenerEffect<typeof internalStateSlice.actions.setTabs>>(
      (action, listenerApi) => {
        const discoverSession =
          action.payload.updatedDiscoverSession ?? listenerApi.getState().persistedDiscoverSession;
        const { runtimeStateManager, tabsStorageManager, services } = listenerApi.extra;
        const getTabInternalState = (tabId: string) =>
          selectTabRuntimeInternalState({
            runtimeStateManager,
            tabState: selectTab(listenerApi.getState(), tabId),
            services,
          });
        void tabsStorageManager.persistLocally(
          action.payload,
          getTabInternalState,
          discoverSession?.id
        );
      },
      MIDDLEWARE_THROTTLE_MS,
      MIDDLEWARE_THROTTLE_OPTIONS
    ),
  });

  startListening({
    actionCreator: syncLocallyPersistedTabState,
    effect: throttle<InternalStateListenerEffect<typeof syncLocallyPersistedTabState>>(
      (action, listenerApi) => {
        const { runtimeStateManager, tabsStorageManager, services } = listenerApi.extra;
        withTab(listenerApi.getState(), action.payload, (tab) => {
          tabsStorageManager.updateTabStateLocally(action.payload.tabId, {
            internalState: selectTabRuntimeInternalState({
              runtimeStateManager,
              tabState: tab,
              services,
            }),
            attributes: tab.attributes,
            appState: tab.appState,
            globalState: tab.globalState,
          });
        });
      },
      MIDDLEWARE_THROTTLE_MS,
      MIDDLEWARE_THROTTLE_OPTIONS
    ),
  });

  startListening({
    actionCreator: discardFlyoutsOnTabChange,
    effect: () => {
      dismissFlyouts([DiscoverFlyouts.lensEdit]);
    },
  });

  // This pair of listeners updates the default query mode based on the last used query type (ES|QL vs Data View), we use
  // this so new discover sessions use that query mode as a default.
  //
  // NOTE: In the short term we will add a feature flag to default to ES|QL when there is no existing preference saved.
  // Right now we use classic - this means that users will have to switch to ES|QL manually the first time if they already
  // had classic stored as their last used mode.
  startListening({
    actionCreator: transitionedFromDataViewToEsql,
    effect: (action, listenerApi) => {
      const { services } = listenerApi.extra;
      services.storage.set(DISCOVER_QUERY_MODE_KEY, 'esql');
    },
  });

  startListening({
    actionCreator: transitionedFromEsqlToDataView,
    effect: (action, listenerApi) => {
      const { services } = listenerApi.extra;
      services.storage.set(DISCOVER_QUERY_MODE_KEY, 'classic');
    },
  });

  startListening({
    actionCreator: internalStateSlice.actions.resetOnSavedSearchChange,
    effect: (action, listenerApi) => {
      const { runtimeStateManager } = listenerApi.extra;
      const tabRuntimeState = selectTabRuntimeState(runtimeStateManager, action.payload.tabId);
      const dataStateContainer = tabRuntimeState?.dataStateContainer$.getValue();

      if (dataStateContainer?.cleanupEsql) {
        dataStateContainer.cleanupEsql();
      }
    },
  });

  return listenerMiddleware.middleware;
};

export interface InternalStateDependencies {
  services: DiscoverServices;
  customizationContext: DiscoverCustomizationContext;
  runtimeStateManager: RuntimeStateManager;
  urlStateStorage: IKbnUrlStateStorage;
  tabsStorageManager: TabsStorageManager;
  searchSessionManager: DiscoverSearchSessionManager;
  getInternalState$: () => Observable<DiscoverInternalState>;
  getContextAwarenessToolkit: (tabId: string) => ContextAwarenessToolkit;
  getCascadedDocumentsStateManager: (tabId: string) => CascadedDocumentsStateManager;
}

const IS_JEST_ENVIRONMENT = typeof jest !== 'undefined';
const DEFAULT_SERIALIZABLE_IGNORED_ACTION_PATHS = ['meta.arg', 'meta.baseQueryMeta'];
const HEAVY_STATE_PATHS = HEAVY_STATE_KEYS.map((key) => new RegExp(`(^|\\.)${key}(\\.|$)`));

const immutableCheckOptions: ImmutableStateInvariantMiddlewareOptions = {
  ignoredPaths: HEAVY_STATE_PATHS,
};

const serializableCheckOptions: SerializableStateInvariantMiddlewareOptions = {
  // Skipped values from HEAVY_STATE_KEYS still go through RTK's isNestedFrozen
  // cache eligibility check unless disableCache is set, which can cause noticeable
  // rendering delays when using Discover in dev builds
  disableCache: true,
  ignoredActionPaths: [...DEFAULT_SERIALIZABLE_IGNORED_ACTION_PATHS, ...HEAVY_STATE_PATHS],
  ignoredPaths: HEAVY_STATE_PATHS,
};

export const createInternalStateStore = (
  options: Omit<
    InternalStateDependencies,
    'getInternalState$' | 'getContextAwarenessToolkit' | 'getCascadedDocumentsStateManager'
  >
) => {
  const optionsWithStore: InternalStateDependencies = {
    ...options,
    getInternalState$: () => from(internalState),
    getContextAwarenessToolkit: (tabId: string) => {
      return createContextAwarenessToolkit({
        internalState,
        profileStateRegistry: options.services.profileStateRegistry,
        tabId,
      });
    },
    getCascadedDocumentsStateManager: (tabId) => {
      return createCascadedDocumentsStateManager({
        internalState,
        tabId,
      });
    },
  };

  const internalState = configureStore({
    reducer: internalStateSlice.reducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        thunk: { extraArgument: optionsWithStore },
        immutableCheck: immutableCheckOptions,
        serializableCheck: IS_JEST_ENVIRONMENT ? false : serializableCheckOptions,
      }).prepend(createMiddleware(optionsWithStore)),
    devTools: {
      name: 'DiscoverInternalState',
    },
  });

  return internalState;
};

export type InternalStateStore = ReturnType<typeof createInternalStateStore>;

export type InternalStateDispatch = InternalStateStore['dispatch'];

type InternalStateThunkAction<TReturn = void> = ThunkAction<
  TReturn,
  InternalStateDispatch extends ThunkDispatch<infer TState, never, never> ? TState : never,
  InternalStateDispatch extends ThunkDispatch<never, infer TExtra, never> ? TExtra : never,
  InternalStateDispatch extends ThunkDispatch<never, never, infer TAction> ? TAction : never
>;

export type InternalStateThunkActionCreator<TArgs extends unknown[] = [], TReturn = void> = (
  ...args: TArgs
) => InternalStateThunkAction<TReturn>;
