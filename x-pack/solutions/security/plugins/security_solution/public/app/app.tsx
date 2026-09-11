/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { History } from 'history';
import type { FC } from 'react';
import React, { memo, useEffect } from 'react';
import type { Store, Action } from 'redux-v4';
import { Provider as ReduxStoreProvider } from 'react-redux-v7';

import { KibanaRenderContextProvider } from '@kbn/react-kibana-context-render';
import { useDarkMode } from '@kbn/kibana-react-plugin/public';
import type { AppMountParameters } from '@kbn/core/public';

import { EuiThemeProvider } from '@kbn/kibana-react-plugin/common';
import { CellActionsProvider } from '@kbn/cell-actions';
import { NavigationProvider } from '@kbn/security-solution-navigation';
import { EntityStoreEuidApiProvider, useInstallEntityStoreV2 } from '@kbn/entity-store/public';
import { APP_NAME } from '../../common/constants';
import { useEnsureSecurityLabs } from '../common/hooks/use_ensure_security_labs';
import { UpsellingProvider } from '../common/components/upselling_provider';
import { ManageUserInfo } from '../detections/components/user_info';
import { ErrorToastDispatcher } from '../common/components/error_toast_dispatcher';
import { MlCapabilitiesProvider } from '../common/components/ml/permissions/ml_capabilities_provider';
import { GlobalToaster, ManageGlobalToaster } from '../common/components/toasters';
import { KibanaContextProvider, useKibana } from '../common/lib/kibana';
import type { State } from '../common/store';
import type { StartServices } from '../types';
import { PageRouter } from './routes';
import { UserPrivilegesProvider } from '../common/components/user_privileges/user_privileges_context';
import { ReactQueryClientProvider } from '../common/containers/query_client/query_client_provider';
import { DiscoverInTimelineContextProvider } from '../common/components/discover_in_timeline/provider';
import { InitializationProvider } from '../common/components/initialization';
import { AssistantProvider } from '../assistant/provider';
import { TrialCompanion } from '../trial_companion/trial_companion';
import {
  consumePreserveAgentBuilderSessionGate,
  readLastAgentBuilderAgentIdForSecuritySession,
} from '../../common/agent_builder_navigation_gate';

interface StartAppComponent {
  children: React.ReactNode;
  history: History;
  store: Store<State, Action>;
  theme$: AppMountParameters['theme$'];
}

const StartAppComponent: FC<StartAppComponent> = ({ children, history, store, theme$ }) => {
  const services = useKibana().services;
  const {
    application: { capabilities },
    uiActions,
    upselling,
  } = services;

  const darkMode = useDarkMode();

  return (
    <KibanaRenderContextProvider {...services}>
      <ManageGlobalToaster>
        <ReduxStoreProvider store={store}>
          <EntityStoreEuidApiProvider>
            <EuiThemeProvider darkMode={darkMode}>
              <MlCapabilitiesProvider>
                <UserPrivilegesProvider kibanaCapabilities={capabilities}>
                  <ManageUserInfo>
                    <NavigationProvider core={services}>
                      <ReactQueryClientProvider>
                        <InitializationProvider>
                          <CellActionsProvider
                            getTriggerCompatibleActions={uiActions.getTriggerCompatibleActions}
                          >
                            <UpsellingProvider upsellingService={upselling}>
                              <DiscoverInTimelineContextProvider>
                                <PageRouter history={history}>
                                  <AssistantProvider>{children}</AssistantProvider>
                                  <TrialCompanion />
                                </PageRouter>
                              </DiscoverInTimelineContextProvider>
                            </UpsellingProvider>
                          </CellActionsProvider>
                        </InitializationProvider>
                      </ReactQueryClientProvider>
                    </NavigationProvider>
                  </ManageUserInfo>
                </UserPrivilegesProvider>
              </MlCapabilitiesProvider>
            </EuiThemeProvider>
          </EntityStoreEuidApiProvider>
          <ErrorToastDispatcher />
          <GlobalToaster />
        </ReduxStoreProvider>
      </ManageGlobalToaster>
    </KibanaRenderContextProvider>
  );
};

const StartApp = memo(StartAppComponent);

interface SecurityAppComponentProps {
  children: React.ReactNode;
  history: History;
  services: StartServices;
  store: Store<State, Action>;
  theme$: AppMountParameters['theme$'];
}

const SecurityAppComponent: React.FC<SecurityAppComponentProps> = ({
  children,
  history,
  services,
  store,
  theme$,
}) => {
  const CloudProvider = services.cloud?.CloudContextProvider ?? React.Fragment;

  useInstallEntityStoreV2(services);
  useEnsureSecurityLabs({
    productDocBase: services.productDocBase,
    uiSettings: services.uiSettings,
    logger: services.logger,
    // Product-doc install routes require manage llm_product_doc (Agent Builder All / manageAgents).
    hasManagePrivilege: services.application.capabilities.agentBuilder?.manageAgents === true,
  });

  // Set conversation flyout active config on mount, clear on unmount.
  // Skip if the sidebar is already open (e.g. navigating from Agent Builder
  // with an active conversation) to avoid clobbering its props.
  useEffect(() => {
    if (services.agentBuilder?.setChatConfig && !services.chrome.sidebar.isOpen()) {
      services.agentBuilder.setChatConfig({
        sessionTag: 'security',
        newConversation: false,
        agentId: readLastAgentBuilderAgentIdForSecuritySession(),
      });
    }

    return () => {
      if (consumePreserveAgentBuilderSessionGate()) {
        return;
      }
      // Re-read at teardown time: the Agent Builder panel may have opened after this effect
      // ran; using a stale `isOpen` from mount would incorrectly clear chat config mid-session.
      if (services.agentBuilder?.clearChatConfig && !services.chrome.sidebar.isOpen()) {
        services.agentBuilder.clearChatConfig();
      }
    };
  }, [services.agentBuilder, services.chrome.sidebar, services.uiSettings]);

  return (
    <KibanaContextProvider
      services={{
        appName: APP_NAME,
        ...services,
      }}
    >
      <CloudProvider>
        <StartApp history={history} store={store} theme$={theme$}>
          {children}
        </StartApp>
      </CloudProvider>
    </KibanaContextProvider>
  );
};

export const SecurityApp = memo(SecurityAppComponent);
