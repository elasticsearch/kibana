/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { type PropsWithChildren, createContext, useContext, useMemo } from 'react';
import type { DataView } from '@kbn/data-views-plugin/common';
import type { DataSource } from '@kbn/data-source';
import useObservable from 'react-use/lib/useObservable';
import { BehaviorSubject } from 'rxjs';
import type { UnifiedHistogramPartialLayoutProps } from '@kbn/unified-histogram';
import { useCurrentTabContext } from './hooks';
import type { DiscoverDataStateContainer } from '../discover_data_state_container';
import type { ConnectedCustomizationService } from '../../../../customizations';
import {
  ProfileStateType,
  type ProfileStateMap,
  type ProfileStateRegistry,
} from '../../../../../common/context_awareness';
import type { ContextAwarenessToolkit, ScopedProfilesManager } from '../../../../context_awareness';
import type { TabState } from './types';
import type { ScopedDiscoverEBTManager } from '../../../../ebt_manager';
import type { CascadedDocumentsStateManager } from '../../data_fetching/cascaded_documents_fetcher';
import { CascadedDocumentsFetcher } from '../../data_fetching/cascaded_documents_fetcher';
import type { DiscoverServices } from '../../../../build_services';
import { createSearchSource } from '../utils/create_search_source';

interface DiscoverRuntimeState {
  adHocDataViews: DataView[];
}

export const DEFAULT_HISTOGRAM_KEY_PREFIX = 'discover';

export interface UnifiedHistogramConfig {
  localStorageKeyPrefix?: string;
  layoutPropsMap: Record<string, UnifiedHistogramPartialLayoutProps | undefined>;
}

interface TabRuntimeState {
  dataStateContainer?: DiscoverDataStateContainer;
  customizationService?: ConnectedCustomizationService;
  unifiedHistogramConfig: UnifiedHistogramConfig;
  scopedProfilesManager: ScopedProfilesManager;
  scopedEbtManager: ScopedDiscoverEBTManager;
  cascadedDocumentsFetcher: CascadedDocumentsFetcher;
  currentDataView: DataView;
  currentDataSource: DataSource;
  unsubscribeFn: (() => void) | undefined;
}

type ReactiveRuntimeState<TState, TNullable extends keyof TState = never> = {
  [key in keyof TState & string as `${key}$`]: BehaviorSubject<
    key extends TNullable ? TState[key] | undefined : TState[key]
  >;
};

export type ReactiveTabRuntimeState = ReactiveRuntimeState<
  TabRuntimeState,
  'currentDataView' | 'currentDataSource'
>;

export type RuntimeStateManager = ReactiveRuntimeState<DiscoverRuntimeState> & {
  tabs: { byId: Record<string, ReactiveTabRuntimeState> };
};

export const createRuntimeStateManager = (): RuntimeStateManager => {
  return {
    adHocDataViews$: new BehaviorSubject<DataView[]>([]),
    tabs: { byId: {} },
  };
};

export type InitialUnifiedHistogramLayoutProps = Pick<
  UnifiedHistogramPartialLayoutProps,
  'topPanelHeight'
>;

type InitialUnifiedHistogramLayoutPropsMap = Record<
  string,
  InitialUnifiedHistogramLayoutProps | undefined
>;

export const createTabRuntimeState = ({
  services,
  toolkit,
  cascadedDocumentsStateManager,
  initialValues,
}: {
  services: DiscoverServices;
  toolkit: ContextAwarenessToolkit;
  cascadedDocumentsStateManager: CascadedDocumentsStateManager;
  initialValues?: {
    unifiedHistogramLayoutPropsMap?: InitialUnifiedHistogramLayoutPropsMap;
  };
}): ReactiveTabRuntimeState => {
  const scopedEbtManager = services.ebtManager.createScopedEBTManager();
  const scopedProfilesManager = services.profilesManager.createScopedProfilesManager({
    scopedEbtManager,
    toolkit,
  });
  const cascadedDocumentsFetcher = new CascadedDocumentsFetcher(
    services,
    scopedProfilesManager,
    cascadedDocumentsStateManager
  );

  return {
    dataStateContainer$: new BehaviorSubject<DiscoverDataStateContainer | undefined>(undefined),
    customizationService$: new BehaviorSubject<ConnectedCustomizationService | undefined>(
      undefined
    ),
    unifiedHistogramConfig$: new BehaviorSubject<UnifiedHistogramConfig>({
      localStorageKeyPrefix: undefined,
      layoutPropsMap: initialValues?.unifiedHistogramLayoutPropsMap ?? {},
    }),
    scopedProfilesManager$: new BehaviorSubject(scopedProfilesManager),
    scopedEbtManager$: new BehaviorSubject(scopedEbtManager),
    cascadedDocumentsFetcher$: new BehaviorSubject(cascadedDocumentsFetcher),
    currentDataView$: new BehaviorSubject<DataView | undefined>(undefined),
    currentDataSource$: new BehaviorSubject<DataSource | undefined>(undefined),
    unsubscribeFn$: new BehaviorSubject<TabRuntimeState['unsubscribeFn']>(undefined),
  };
};

export const useRuntimeState = <T,>(stateSubject$: BehaviorSubject<T>) =>
  useObservable(stateSubject$, stateSubject$.getValue());

export const selectTabRuntimeState = (runtimeStateManager: RuntimeStateManager, tabId: string) =>
  runtimeStateManager.tabs.byId[tabId];

export const selectDataSourceProfileId = (
  runtimeStateManager: RuntimeStateManager,
  tabId: string
) => {
  return selectTabRuntimeState(runtimeStateManager, tabId)
    .scopedProfilesManager$.getValue()
    .getContexts().dataSourceContext.profileId;
};

export const selectCurrentProfileStateDefinition = (
  runtimeStateManager: RuntimeStateManager,
  tabId: string
) => {
  return selectTabRuntimeState(runtimeStateManager, tabId)
    .scopedProfilesManager$.getValue()
    .getContexts().dataSourceContext.profileState;
};

export const selectCurrentTabType = (runtimeStateManager: RuntimeStateManager, tabId: string) => {
  return selectTabRuntimeState(runtimeStateManager, tabId)
    .scopedProfilesManager$.getValue()
    .getContexts().dataSourceContext.tabType;
};

/** Uses the resolved tab type when available, otherwise the inherited type. */
export const selectTabTypeForPersistence = ({
  runtimeStateManager,
  tabState,
}: {
  runtimeStateManager: RuntimeStateManager;
  tabState: TabState;
}) => {
  const scopedProfilesManager = selectTabRuntimeState(
    runtimeStateManager,
    tabState.id
  ).scopedProfilesManager$.getValue();

  return scopedProfilesManager.hasResolvedDataSourceProfile()
    ? selectCurrentTabType(runtimeStateManager, tabState.id)
    : tabState.initialInternalState?.tabType;
};

export const selectCurrentProfileUrlState = ({
  runtimeStateManager,
  tabId,
  profileStateMap,
  profileStateRegistry,
}: {
  runtimeStateManager: RuntimeStateManager;
  tabId: string;
  profileStateMap: ProfileStateMap;
  profileStateRegistry: ProfileStateRegistry;
}): ProfileStateMap | undefined => {
  return selectCurrentProfileState({
    runtimeStateManager,
    tabId,
    profileStateMap,
    profileStateRegistry,
    stateTypes: [ProfileStateType.Url],
    alwaysIncludeDefaults: false,
  });
};

export const selectCurrentProfileLocatorState = ({
  runtimeStateManager,
  tabId,
  profileStateMap,
  profileStateRegistry,
}: {
  runtimeStateManager: RuntimeStateManager;
  tabId: string;
  profileStateMap: ProfileStateMap;
  profileStateRegistry: ProfileStateRegistry;
}): ProfileStateMap | undefined => {
  return selectCurrentProfileState({
    runtimeStateManager,
    tabId,
    profileStateMap,
    profileStateRegistry,
    stateTypes: [ProfileStateType.Url, ProfileStateType.Persistent],
    alwaysIncludeDefaults: true,
  });
};

const selectCurrentProfileState = ({
  runtimeStateManager,
  tabId,
  profileStateMap,
  profileStateRegistry,
  stateTypes,
  alwaysIncludeDefaults,
}: {
  runtimeStateManager: RuntimeStateManager;
  tabId: string;
  profileStateMap: ProfileStateMap;
  profileStateRegistry: ProfileStateRegistry;
  stateTypes: ProfileStateType[];
  alwaysIncludeDefaults: boolean;
}): ProfileStateMap | undefined => {
  const profileStateDefinition = selectCurrentProfileStateDefinition(runtimeStateManager, tabId);

  if (!profileStateDefinition) {
    return undefined;
  }

  const filteredState = profileStateRegistry.filterFieldsByType({
    profileState: alwaysIncludeDefaults
      ? {
          ...profileStateDefinition.defaultState,
          ...profileStateMap[profileStateDefinition.key],
        }
      : profileStateMap[profileStateDefinition.key],
    stateKey: profileStateDefinition.key,
    stateTypes,
    defaultsHandling: 'expand',
  });

  return filteredState ? { [profileStateDefinition.key]: filteredState } : undefined;
};

export const selectIsDataViewUsedInMultipleRuntimeTabStates = (
  runtimeStateManager: RuntimeStateManager,
  dataViewId: string
) =>
  Object.values(runtimeStateManager.tabs.byId).filter(
    (tab) => tab.currentDataView$.getValue()?.id === dataViewId
  ).length > 1;

export const selectTabRuntimeInternalState = ({
  runtimeStateManager,
  tabState,
  services,
}: {
  runtimeStateManager: RuntimeStateManager;
  tabState: TabState;
  services: DiscoverServices;
}): TabState['initialInternalState'] | undefined => {
  const tabRuntimeState = selectTabRuntimeState(runtimeStateManager, tabState.id);
  const dataView = tabRuntimeState?.currentDataView$.getValue();
  const dataStateContainer = tabRuntimeState?.dataStateContainer$.getValue();

  if (!dataStateContainer || !dataView) {
    return undefined;
  }

  const { dataRequestParams, appState, globalState } = tabState;
  const searchSource = createSearchSource({
    dataView,
    appState,
    globalState,
    services,
  });
  const tabType = selectTabTypeForPersistence({ runtimeStateManager, tabState });

  return {
    serializedSearchSource: searchSource.getSerializedFields(),
    ...(tabType ? { tabType } : {}),
    ...(dataRequestParams.isSearchSessionRestored
      ? { searchSessionId: dataRequestParams.searchSessionId }
      : {}),
  };
};

export const selectInitialUnifiedHistogramLayoutPropsMap = (
  runtimeStateManager: RuntimeStateManager,
  tabId: string
): InitialUnifiedHistogramLayoutPropsMap => {
  const tabRuntimeState = selectTabRuntimeState(runtimeStateManager, tabId);
  const layoutPropsMap = tabRuntimeState?.unifiedHistogramConfig$.getValue().layoutPropsMap ?? {};

  return Object.keys(layoutPropsMap).reduce<InitialUnifiedHistogramLayoutPropsMap>((acc, key) => {
    const topPanelHeight = layoutPropsMap[key]?.topPanelHeight;

    if (topPanelHeight !== undefined) {
      acc[key] = { topPanelHeight };
    }

    return acc;
  }, {});
};

export const useCurrentTabRuntimeState = <T,>(
  selector: (tab: ReactiveTabRuntimeState) => BehaviorSubject<T>
) => {
  const runtimeStateManager = useContext(runtimeStateManagerContext);
  const { currentTabId } = useCurrentTabContext();

  if (!runtimeStateManager) {
    throw new Error('useCurrentTabRuntimeState requires RuntimeStateManagerProvider');
  }

  return useRuntimeState(selector(selectTabRuntimeState(runtimeStateManager, currentTabId)));
};

export const useCurrentTabDataStateContainer = () => {
  const { currentTabId } = useCurrentTabContext();
  const dataStateContainer = useCurrentTabRuntimeState((tab) => tab.dataStateContainer$);

  if (!dataStateContainer) {
    throw new Error(
      `dataStateContainer not initialized for tab "${currentTabId}". Did you call initializeSingleTab?`
    );
  }

  return dataStateContainer;
};

export type CombinedRuntimeState = DiscoverRuntimeState & { currentDataSource: DataSource };

const runtimeStateContext = createContext<CombinedRuntimeState | undefined>(undefined);

export const RuntimeStateProvider = ({
  currentDataSource,
  adHocDataViews,
  children,
}: PropsWithChildren<CombinedRuntimeState>) => {
  const runtimeState = useMemo<CombinedRuntimeState>(
    () => ({ currentDataSource, adHocDataViews }),
    [adHocDataViews, currentDataSource]
  );

  return (
    <runtimeStateContext.Provider value={runtimeState}>{children}</runtimeStateContext.Provider>
  );
};

const useRuntimeStateContext = () => {
  const context = useContext(runtimeStateContext);

  if (!context) {
    throw new Error('useRuntimeStateContext must be used within a RuntimeStateProvider');
  }

  return context;
};

export const useCurrentDataSource = () => useRuntimeStateContext().currentDataSource;

/** Returns the underlying DataView for DSL consumers. Use {@link useCurrentDataSource} for rendering. */
export const useCurrentDataView = (): DataView => {
  const dataView = useCurrentTabRuntimeState((tab) => tab.currentDataView$);
  if (!dataView) {
    throw new Error('currentDataView is not initialized');
  }
  return dataView;
};

export const useAdHocDataViews = () => useRuntimeStateContext().adHocDataViews;

const runtimeStateManagerContext = createContext<RuntimeStateManager | undefined>(undefined);

export const RuntimeStateManagerProvider = runtimeStateManagerContext.Provider;

export const useRuntimeStateManager = () => {
  const context = useContext(runtimeStateManagerContext);

  if (!context) {
    throw new Error('useRuntimeStateManager must be used within a RuntimeStateManagerProvider');
  }

  return context;
};
