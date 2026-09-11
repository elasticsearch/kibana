/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { omit } from 'lodash';
import { internalStateSlice, syncLocallyPersistedTabState } from './internal_state';
import * as actions from './actions';

export {
  type DiscoverInternalState,
  type TabState,
  type TabStateGlobalState,
  type RecentlyClosedTabState,
  type DiscoverAppState,
  type ExpandedDocCascadePath,
  type InternalStateDataRequestParams,
  type CascadedDocumentsState,
  type ProfileAppStateDefaultField,
  type ProfileAppStateDefaultFields,
  type ProfileAppStateDefaults,
  type ProfileAppStateSnapshot,
  type UpdateESQLQueryActionPayload,
  PROFILE_APP_STATE_DEFAULT_FIELDS,
  TabInitializationStatus,
  TabsBarVisibility,
} from './types';

export { DEFAULT_EXPANDED_DOC_OWNER, DEFAULT_TAB_STATE } from './constants';

export {
  type InternalStateStore,
  type InternalStateDispatch,
  type InternalStateDependencies,
  createInternalStateStore,
} from './internal_state';

export const internalStateActions = {
  ...omit(
    internalStateSlice.actions,
    'setTabs',
    'disconnectTab',
    'setDefaultProfileAdHocDataViewIds',
    'setAppState',
    'setProfileState',
    'syncProfileAppStateSnapshot',
    'setExpandedDoc'
  ),
  ...actions,
  syncLocallyPersistedTabState,
};

export {
  InternalStateProvider,
  useInternalStateDispatch,
  useInternalStateGetState,
  useInternalStateSubscribe,
  useInternalStateSelector,
  CurrentTabProvider,
  useCurrentTabSelector,
  useAppStateSelector,
  useCurrentTabAction,
  useCurrentChartPortalNode,
  useDataViewsForPicker,
} from './hooks';

export {
  selectAllTabs,
  selectRecentlyClosedTabs,
  selectPersistedDiscoverSession,
  selectSavedDataViews,
  selectTab,
  selectTabAppState,
  selectTabCombinedFilters,
  selectIsTabsBarHidden,
  selectHasUnsavedChanges,
  searchSourceComparator,
  selectTabSavedSearch,
  selectTabSavedSearchByValueAttributes,
} from './selectors';

export {
  type RuntimeStateManager,
  type ReactiveTabRuntimeState,
  type CombinedRuntimeState,
  type InitialUnifiedHistogramLayoutProps,
  DEFAULT_HISTOGRAM_KEY_PREFIX,
  createRuntimeStateManager,
  useRuntimeState,
  selectTabRuntimeState,
  selectDataSourceProfileId,
  selectCurrentProfileStateDefinition,
  selectCurrentProfileUrlState,
  selectCurrentProfileLocatorState,
  selectCurrentTabType,
  selectTabTypeForPersistence,
  selectIsDataViewUsedInMultipleRuntimeTabStates,
  selectInitialUnifiedHistogramLayoutPropsMap,
  useCurrentTabRuntimeState,
  useCurrentTabDataStateContainer,
  RuntimeStateProvider,
  RuntimeStateManagerProvider,
  useRuntimeStateManager,
  useCurrentDataView,
  useAdHocDataViews,
} from './runtime_state';

export {
  type TabActionInjector,
  createTabActionInjector,
  createTabItem,
  getSerializedSearchSourceDataViewDetails,
  parseControlGroupJson,
  extractEsqlVariables,
} from './utils';

export {
  fromSavedObjectTabToSearchSource,
  fromSavedObjectTabToAppState,
  fromSavedObjectTabToTabState,
  fromSavedObjectTabToSavedSearch,
  fromTabStateToSavedObjectTab,
  fromSavedSearchToSavedObjectTab,
} from './tab_mapping_utils';
