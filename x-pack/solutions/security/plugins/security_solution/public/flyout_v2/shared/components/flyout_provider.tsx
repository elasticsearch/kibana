/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC, ReactElement, ReactNode } from 'react';
import React, { useEffect, useMemo } from 'react';
import type { History } from 'history';
import { createMemoryHistory } from 'history';
import { Router } from '@kbn/shared-ux-router';
import { useLocation } from 'react-router-dom';
import type { Store } from 'redux';
import { Provider, useStore } from 'react-redux';
import { CellActionsProvider } from '@kbn/cell-actions';
import { ExpandableFlyoutProvider } from '@kbn/expandable-flyout';
import { NavigationProvider } from '@kbn/security-solution-navigation';
import { EntityStoreEuidApiProvider } from '@kbn/entity-store/public';
import type { StartServices } from '../../../types';
import { ReactQueryClientProvider } from '../../../common/containers/query_client/query_client_provider';
import { KibanaContextProvider, useKibana } from '../../../common/lib/kibana';
import { UserPrivilegesProvider } from '../../../common/components/user_privileges/user_privileges_context';
import { UpsellingProvider } from '../../../common/components/upselling_provider';
import { DiscoverInTimelineContextProvider } from '../../../common/components/discover_in_timeline/provider';
import { AssistantProvider } from '../../../assistant/provider';
import { CaseProvider } from '../../../cases/components/provider/provider';
import { MlCapabilitiesProvider } from '../../../common/components/ml/permissions/ml_capabilities_provider';
import { setAbsoluteRangeDatePicker } from '../../../common/store/inputs/actions';
import { InputsModelId } from '../../../common/store/inputs/constants';
import { ConsoleManager } from '../../../management/components/console/components/console_manager';

/**
 * Syncs Kibana's global time filter to the Security Solution Redux store on mount.
 */
const TimeRangeSync: FC<{ children: ReactNode }> = ({ children }) => {
  const { services } = useKibana();
  const store = useStore();

  useEffect(() => {
    const tf = services.data.query.timefilter.timefilter;
    const { from, to } = tf.getAbsoluteTime();
    store.dispatch(setAbsoluteRangeDatePicker({ id: InputsModelId.global, from, to }));
  }, [services, store]);

  return <>{children}</>;
};

const useHasRouterContext = (): boolean => {
  try {
    useLocation();
    return true;
  } catch {
    return false;
  }
};

const FlyoutRouter: FC<{ children: ReactNode; history?: History }> = ({ children, history }) => {
  const hasRouterContext = useHasRouterContext();
  const fallbackHistory = useMemo(() => createMemoryHistory(), []);

  // Security app flyouts can be opened from inside an existing Router, while Discover can
  // render this provider without one. Reuse the host Router when present to avoid nesting.
  return hasRouterContext ? (
    <>{children}</>
  ) : (
    <Router history={history ?? fallbackHistory}>{children}</Router>
  );
};

export const flyoutProviders = ({
  services,
  store,
  children,
  history,
}: {
  services: StartServices;
  store: Store;
  children: ReactNode;
  history?: History;
}): ReactElement => {
  // This is currently necessary because of Analyzer (which internally has the logic to open other flyouts)
  // TODO remove ExpandableFlyoutProvider when we're ready to drop the expandable flyout
  // ConsoleManager and AssistantProvider must live inside the Router because the Respond
  // PageOverlay they render calls `useLocation()` (for `hideOnUrlPathnameChange`).
  const flyoutContent = (
    <FlyoutRouter history={history}>
      <ConsoleManager>
        <AssistantProvider>
          <ExpandableFlyoutProvider>{children}</ExpandableFlyoutProvider>
        </AssistantProvider>
      </ConsoleManager>
    </FlyoutRouter>
  );

  return (
    <KibanaContextProvider services={services}>
      <CellActionsProvider
        getTriggerCompatibleActions={services.uiActions.getTriggerCompatibleActions}
      >
        <NavigationProvider core={services}>
          <Provider store={store}>
            <ReactQueryClientProvider>
              <UserPrivilegesProvider kibanaCapabilities={services.application.capabilities}>
                <UpsellingProvider upsellingService={services.upselling}>
                  <DiscoverInTimelineContextProvider>
                    <CaseProvider>
                      <EntityStoreEuidApiProvider>
                        <MlCapabilitiesProvider>
                          <AssistantProvider>
                            <TimeRangeSync>{flyoutContent}</TimeRangeSync>
                          </AssistantProvider>
                        </MlCapabilitiesProvider>
                      </EntityStoreEuidApiProvider>
                    </CaseProvider>
                  </DiscoverInTimelineContextProvider>
                </UpsellingProvider>
              </UserPrivilegesProvider>
            </ReactQueryClientProvider>
          </Provider>
        </NavigationProvider>
      </CellActionsProvider>
    </KibanaContextProvider>
  );
};
