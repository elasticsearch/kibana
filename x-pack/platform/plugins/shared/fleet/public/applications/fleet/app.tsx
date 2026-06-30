/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useEffect, useState } from 'react';
import useObservable from 'react-use/lib/useObservable';
import type { AppMountParameters } from '@kbn/core/public';
import { EuiPortal } from '@elastic/eui';
import type { History } from 'history';
import { Redirect, useRouteMatch } from 'react-router-dom';
import { Router, Routes, Route } from '@kbn/shared-ux-router';
import { KibanaRenderContextProvider } from '@kbn/react-kibana-context-render';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import { RedirectAppLinks } from '@kbn/shared-ux-link-redirect-app';
import { EuiThemeProvider } from '@kbn/kibana-react-plugin/common';

import type { FleetConfigType, FleetStartServices } from '../../plugin';

import { PackageInstallProvider } from '../integrations/hooks';
import { SpaceSettingsContextProvider } from '../../hooks/use_space_settings_context';

import { ErrorLayout, PermissionsError } from '../../layouts/error';

import { type FleetStatusProviderProps, useAuthz, useFleetStatus, useFlyoutContext } from './hooks';

import {
  ConfigContext,
  FleetStatusProvider,
  KibanaVersionContext,
  sendGetPermissionsCheck,
  sendSetup,
  useBreadcrumbs,
  useStartServices,
  UIExtensionsContext,
  FlyoutContextProvider,
} from './hooks';
import {
  Error,
  Loading,
  FleetSetupLoading,
  AgentEnrollmentFlyout,
  FleetServerFlyout,
} from './components';
import type { UIExtensionsStorage } from './types';

import { FLEET_ROUTING_PATHS } from './constants';

import { AgentPolicyApp } from './sections/agent_policy';
import { DataStreamApp } from './sections/data_stream';
import { AgentsApp } from './sections/agents';
import { CreatePackagePolicyPage } from './sections/agent_policy/create_package_policy_page';
import { EnrollmentTokenListPage } from './sections/agents/enrollment_token_list_page';
import { UninstallTokenListPage } from './sections/agents/uninstall_token_list_page';
import { SettingsApp } from './sections/settings';
import { DebugPage } from './sections/debug';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'always',
    },
    mutations: {
      networkMode: 'always',
    },
  },
});

export const WithPermissionsAndSetup = memo<{ children?: React.ReactNode }>(({ children }) => {
  useBreadcrumbs('base');
  const core = useStartServices();
  const { notifications } = core;
  const authz = useAuthz();
  const hasAnyFleetReadPrivileges =
    authz.fleet.readEnrollmentTokens ||
    authz.fleet.readAgents ||
    authz.fleet.readAgentPolicies ||
    authz.fleet.readSettings;

  const hasIntegrationsCreateOrUpdatePrivileges = authz.integrations.all;

  const [isPermissionsLoading, setIsPermissionsLoading] = useState<boolean>(false);
  const [permissionsError, setPermissionsError] = useState<string>();
  const [isInitialized, setIsInitialized] = useState(false);
  const [initializationError, setInitializationError] = useState<Error | null>(null);

  const isAddIntegrationsPath = !!useRouteMatch(FLEET_ROUTING_PATHS.add_integration_to_policy);
  const isDebugPath = !!useRouteMatch(FLEET_ROUTING_PATHS.debug);

  useEffect(() => {
    (async () => {
      setIsPermissionsLoading(false);
      setPermissionsError(undefined);
      setIsInitialized(false);
      setInitializationError(null);
      try {
        setIsPermissionsLoading(true);
        const permissionsResponse = await sendGetPermissionsCheck();
        setIsPermissionsLoading(false);
        if (permissionsResponse.data?.success) {
          try {
            const setupResponse = await sendSetup();
            if (setupResponse.error) {
              setInitializationError(setupResponse.error);
            }
            if (setupResponse.data?.nonFatalErrors?.length) {
              notifications.toasts.addError(setupResponse.data.nonFatalErrors[0], {
                title: i18n.translate('xpack.fleet.setup.uiPreconfigurationErrorTitle', {
                  defaultMessage: 'Configuration error',
                }),
              });
            }
            if (!hasAnyFleetReadPrivileges) {
              setPermissionsError('MISSING_PRIVILEGES');
            }
            if (!hasIntegrationsCreateOrUpdatePrivileges && isAddIntegrationsPath) {
              setPermissionsError('MISSING_PRIVILEGES');
            }
          } catch (err) {
            setInitializationError(err);
          }
          setIsInitialized(true);
        } else {
          setPermissionsError(permissionsResponse.data?.error || 'REQUEST_ERROR');
        }
      } catch (err) {
        setPermissionsError('REQUEST_ERROR');
      }
    })();
  }, [
    notifications.toasts,
    hasAnyFleetReadPrivileges,
    hasIntegrationsCreateOrUpdatePrivileges,
    isAddIntegrationsPath,
  ]);

  if (isPermissionsLoading || permissionsError) {
    return (
      <ErrorLayout isAddIntegrationsPath={isAddIntegrationsPath}>
        {isPermissionsLoading ? (
          <Loading />
        ) : (
          <PermissionsError callingApplication="Fleet" error={permissionsError!} />
        )}
      </ErrorLayout>
    );
  }
  // Debug page moved outside of initialization to allow debugging when setup failed
  if (isDebugPath) {
    return <DebugPage setupError={initializationError} isInitialized={isInitialized} />;
  }

  if (!isInitialized || initializationError) {
    return (
      <ErrorLayout isAddIntegrationsPath={isAddIntegrationsPath}>
        {initializationError ? (
          <Error
            title={
              <FormattedMessage
                id="xpack.fleet.initializationErrorMessageTitle"
                defaultMessage="Unable to initialize Fleet"
              />
            }
            error={initializationError}
          />
        ) : (
          <FleetSetupLoading />
        )}
      </ErrorLayout>
    );
  }

  return <>{children}</>;
});

/**
 * Fleet Application context all the way down to the Router, but with no permissions or setup checks
 * and no routes defined
 */
export const FleetAppContext: React.FC<{
  startServices: FleetStartServices;
  config: FleetConfigType;
  history: AppMountParameters['history'];
  kibanaVersion: string;
  extensions: UIExtensionsStorage;
  /** For testing purposes only */
  routerHistory?: History<any>;
  fleetStatus?: FleetStatusProviderProps;
  children: React.ReactNode;
}> = memo(
  ({
    children,
    startServices,
    config,
    history,
    kibanaVersion,
    extensions,
    routerHistory: _routerHistory,
    fleetStatus,
  }) => {
    const XXL_BREAKPOINT = 1600;
    const isDarkMode = useObservable(
      startServices.theme.theme$,
      startServices.theme.getTheme()
    ).darkMode;

    return (
      <KibanaRenderContextProvider
        {...startServices}
        theme={startServices.theme}
        modify={{
          breakpoint: {
            xxl: XXL_BREAKPOINT,
          },
        }}
      >
        <RedirectAppLinks
          coreStart={{
            application: startServices.application,
          }}
        >
          <KibanaContextProvider services={{ ...startServices }}>
            <ConfigContext.Provider value={config}>
              <KibanaVersionContext.Provider value={kibanaVersion}>
                {/* This should be removed since theme is passed to `KibanaRenderContextProvider`,
                however, removing this breaks usages of `props.theme.eui` in styled components */}
                <EuiThemeProvider darkMode={isDarkMode}>
                  <QueryClientProvider client={queryClient}>
                    <ReactQueryDevtools initialIsOpen={false} />
                    <UIExtensionsContext.Provider value={extensions}>
                      <FleetStatusProvider defaultFleetStatus={fleetStatus}>
                        <SpaceSettingsContextProvider>
                          <Router history={history}>
                            <PackageInstallProvider startServices={startServices}>
                              <FlyoutContextProvider>{children}</FlyoutContextProvider>
                            </PackageInstallProvider>
                          </Router>
                        </SpaceSettingsContextProvider>
                      </FleetStatusProvider>
                    </UIExtensionsContext.Provider>
                  </QueryClientProvider>
                </EuiThemeProvider>
              </KibanaVersionContext.Provider>
            </ConfigContext.Provider>
          </KibanaContextProvider>
        </RedirectAppLinks>
      </KibanaRenderContextProvider>
    );
  }
);

export const AppRoutes = memo(() => {
  const flyoutContext = useFlyoutContext();
  const fleetStatus = useFleetStatus();
  const authz = useAuthz();

  return (
    <>
      <Routes>
        <Route path={FLEET_ROUTING_PATHS.agents} key={FLEET_ROUTING_PATHS.agents}>
          {authz.fleet.readAgents ? (
            <AgentsApp />
          ) : (
            <ErrorLayout isAddIntegrationsPath={false}>
              <PermissionsError
                callingApplication="Fleet"
                error="MISSING_PRIVILEGES"
                requiredFleetRole="Agents Read"
              />
            </ErrorLayout>
          )}
        </Route>

        <Route path={FLEET_ROUTING_PATHS.policies}>
          {authz.fleet.readAgentPolicies ? (
            <AgentPolicyApp />
          ) : (
            <ErrorLayout isAddIntegrationsPath={false}>
              <PermissionsError
                callingApplication="Fleet"
                error="MISSING_PRIVILEGES"
                requiredFleetRole="Agent policies Read"
              />
            </ErrorLayout>
          )}
        </Route>

        <Route path={FLEET_ROUTING_PATHS.enrollment_tokens}>
          {authz.fleet.allAgents ? (
            <EnrollmentTokenListPage />
          ) : (
            <ErrorLayout isAddIntegrationsPath={false}>
              <PermissionsError
                callingApplication="Fleet"
                error="MISSING_PRIVILEGES"
                requiredFleetRole="Agents All"
              />
            </ErrorLayout>
          )}
        </Route>

        <Route path={FLEET_ROUTING_PATHS.uninstall_tokens}>
          {authz.fleet.allAgents ? (
            <UninstallTokenListPage />
          ) : (
            <ErrorLayout isAddIntegrationsPath={false}>
              <PermissionsError
                callingApplication="Fleet"
                error="MISSING_PRIVILEGES"
                requiredFleetRole="Agents All"
              />
            </ErrorLayout>
          )}
        </Route>

        <Route path={FLEET_ROUTING_PATHS.data_streams}>
          <DataStreamApp />
        </Route>

        <Route path={FLEET_ROUTING_PATHS.settings}>
          {authz.fleet.readSettings ? (
            <SettingsApp />
          ) : (
            <ErrorLayout isAddIntegrationsPath={false}>
              <PermissionsError
                callingApplication="Fleet"
                error="MISSING_PRIVILEGES"
                requiredFleetRole="Settings Read"
              />
            </ErrorLayout>
          )}
        </Route>

        {/* TODO: Move this route to the Integrations app */}
        <Route path={FLEET_ROUTING_PATHS.add_integration_to_policy}>
          <CreatePackagePolicyPage />
        </Route>

        <Route
          render={({ location }) => {
            const shouldRedirectHash = location.pathname === '' && location.hash.length > 0;
            if (!shouldRedirectHash) {
              const redirectTo = authz.fleet.readAgents
                ? FLEET_ROUTING_PATHS.agents
                : authz.fleet.readAgentPolicies
                ? FLEET_ROUTING_PATHS.policies
                : FLEET_ROUTING_PATHS.settings;

              return <Redirect to={redirectTo} />;
            }
            const pathname = location.hash.replace(/^#(\/fleet)?/, '');

            return (
              <Redirect
                to={{
                  ...location,
                  pathname,
                  hash: undefined,
                }}
              />
            );
          }}
        />
      </Routes>
      {flyoutContext.isEnrollmentFlyoutOpen && (
        <EuiPortal>
          <AgentEnrollmentFlyout
            defaultMode={
              fleetStatus.isReady && !fleetStatus.missingRequirements?.includes('fleet_server')
                ? 'managed'
                : 'standalone'
            }
            isIntegrationFlow={true}
            onClose={() => flyoutContext.closeEnrollmentFlyout()}
          />
        </EuiPortal>
      )}
      {flyoutContext.isFleetServerFlyoutOpen && (
        <EuiPortal>
          <FleetServerFlyout onClose={() => flyoutContext.closeFleetServerFlyout()} />
        </EuiPortal>
      )}
    </>
  );
});
