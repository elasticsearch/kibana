/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useEffect } from 'react';
import { type IKbnUrlStateStorage } from '@kbn/kibana-utils-plugin/public';
import type { DataView, DataViewSpec } from '@kbn/data-views-plugin/common';
import type { ControlPanelsState } from '@kbn/control-group-renderer';
import useLatest from 'react-use/lib/useLatest';
import type { OptionsListESQLControlState } from '@kbn/controls-schemas';
import { createDataViewDataSource } from '../../../../../common/data_sources';
import type { ProfileStateMap } from '../../../../../common/context_awareness';
import { useDiscoverServices } from '../../../../hooks/use_discover_services';
import type { DiscoverAppState } from '../../state_management/redux';
import { getDataStateContainer } from '../../state_management/discover_data_state_container';
import {
  RuntimeStateProvider,
  internalStateActions,
  createTabActionInjector,
  selectTab,
  useInternalStateDispatch,
  useInternalStateSelector,
  useRuntimeState,
  useCurrentTabRuntimeState,
  useCurrentTabSelector,
  useCurrentTabAction,
  TabInitializationStatus,
} from '../../state_management/redux';
import type {
  CustomizationCallback,
  DiscoverCustomizationContext,
} from '../../../../customizations';
import type { InternalStateStore, RuntimeStateManager } from '../../state_management/redux';
import {
  DiscoverCustomizationProvider,
  getConnectedCustomizationService,
} from '../../../../customizations';
import { NoDataPage } from './no_data_page';
import { BrandedLoadingIndicator } from './branded_loading_indicator';
import { DiscoverMainApp } from './main_app';
import { ScopedServicesProvider } from '../../../../components/scoped_services_provider';
import { HideTabsBar } from '../tabs_view/hide_tabs_bar';
import { InitializationError } from './initialization_error';
import type { DiscoverSearchSessionManager } from '../../state_management/discover_search_session';

export interface SingleTabViewProps {
  customizationContext: DiscoverCustomizationContext;
  customizationCallbacks: CustomizationCallback[];
  urlStateStorage: IKbnUrlStateStorage;
  internalState: InternalStateStore;
  runtimeStateManager: RuntimeStateManager;
  searchSessionManager: DiscoverSearchSessionManager;
}

export const SingleTabView = ({
  customizationContext,
  customizationCallbacks,
  urlStateStorage,
  internalState,
  runtimeStateManager,
  searchSessionManager,
}: SingleTabViewProps) => {
  const dispatch = useInternalStateDispatch();
  const services = useDiscoverServices();

  const appInitializationState = useInternalStateSelector((state) => state.initializationState);
  const currentTabId = useCurrentTabSelector((tab) => tab.id);
  const currentTabInitializationState = useCurrentTabSelector((tab) => tab.initializationState);
  const currentDataStateContainer = useCurrentTabRuntimeState((tab) => tab.dataStateContainer$);
  const currentCustomizationService = useCurrentTabRuntimeState((tab) => tab.customizationService$);
  const scopedProfilesManager = useCurrentTabRuntimeState((tab) => tab.scopedProfilesManager$);
  const scopedEbtManager = useCurrentTabRuntimeState((tab) => tab.scopedEbtManager$);
  const currentDataSource = useCurrentTabRuntimeState((tab) => tab.currentDataSource$);
  const adHocDataViews = useRuntimeState(runtimeStateManager.adHocDataViews$);

  const initializeSingleTab = useCurrentTabAction(internalStateActions.initializeSingleTab);
  const initializeTab = useLatest(
    async ({
      dataViewSpec,
      defaultUrlState,
      esqlControls,
      profileState,
    }: {
      dataViewSpec?: DataViewSpec | undefined;
      defaultUrlState?: DiscoverAppState;
      esqlControls?: ControlPanelsState<OptionsListESQLControlState>;
      profileState?: ProfileStateMap;
    } = {}) => {
      const injectCurrentTab = createTabActionInjector(currentTabId);
      const getCurrentTab = () => selectTab(internalState.getState(), currentTabId);
      const customizationService = await getConnectedCustomizationService({
        customizationCallbacks,
        internalState,
        injectCurrentTab,
        getCurrentTab,
        runtimeStateManager,
        stateStorage: urlStateStorage,
        services,
      });

      const dataStateContainer = getDataStateContainer({
        services,
        searchSessionManager,
        internalState,
        runtimeStateManager,
        urlStateStorage,
        injectCurrentTab,
        getCurrentTab,
      });

      dispatch(
        initializeSingleTab({
          initializeSingleTabParams: {
            customizationService,
            dataStateContainer,
            dataViewSpec,
            esqlControls,
            defaultUrlState,
            profileState,
          },
        })
      );
    }
  );

  useEffect(() => {
    if (currentTabInitializationState.initializationStatus === TabInitializationStatus.NotStarted) {
      // The location state is captured by `initializeTabs` before the tab ID is pushed to the URL,
      // which discards it, so it can't be read from the history here
      const initialTabState = services.initialTabStateService.consume();

      initializeTab.current({
        dataViewSpec: initialTabState?.dataViewSpec,
        esqlControls: initialTabState?.esqlControls,
        defaultUrlState: initialTabState?.defaultState,
        profileState: initialTabState?.profileState,
      });
    }
  }, [currentTabInitializationState.initializationStatus, initializeTab, services]);

  if (currentTabInitializationState.initializationStatus === TabInitializationStatus.Error) {
    return <InitializationError error={currentTabInitializationState.error} />;
  }

  if (currentTabInitializationState.initializationStatus === TabInitializationStatus.NoData) {
    return (
      <HideTabsBar customizationContext={customizationContext}>
        <NoDataPage
          {...appInitializationState}
          onDataViewCreated={async (dataViewUnknown) => {
            await dispatch(internalStateActions.loadDataViewList());
            dispatch(
              internalStateActions.setInitializationState({
                hasESData: true,
                hasUserDataView: true,
              })
            );
            const dataView = dataViewUnknown as DataView;
            initializeTab.current({
              defaultUrlState: dataView.id
                ? { dataSource: createDataViewDataSource({ dataViewId: dataView.id }) }
                : undefined,
            });
          }}
          onESQLNavigationComplete={() => {
            initializeTab.current();
          }}
        />
      </HideTabsBar>
    );
  }

  if (!currentDataStateContainer || !currentCustomizationService || !currentDataSource) {
    return <BrandedLoadingIndicator />;
  }

  return (
    <DiscoverCustomizationProvider value={currentCustomizationService}>
      <RuntimeStateProvider currentDataSource={currentDataSource} adHocDataViews={adHocDataViews}>
        <ScopedServicesProvider
          scopedProfilesManager={scopedProfilesManager}
          scopedEBTManager={scopedEbtManager}
        >
          <DiscoverMainApp />
        </ScopedServicesProvider>
      </RuntimeStateProvider>
    </DiscoverCustomizationProvider>
  );
};
