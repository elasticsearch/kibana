/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { type AppMountParameters, type CoreStart } from '@kbn/core/public';
import {
  BreadcrumbsContextProvider,
  RouteRenderer,
  RouterProvider,
} from '@kbn/typed-react-router-config';
import { PerformanceContextProvider } from '@kbn/ebt-tools';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { StreamsAppContextProvider } from '../streams_app_context_provider';
import { StreamsTourProvider } from '../streams_tour';
import { streamsAppRouter } from '../../routes/config';
import type { StreamsAppStartDependencies } from '../../types';
import type { StreamsAppServices } from '../../services/types';
import { KbnUrlStateStorageFromRouterProvider } from '../../util/kbn_url_state_context';
import { DateRangeRedirect } from '../date_range_redirect';
import { DiscoverySettingsProvider } from '../significant_events/significant_events_discovery/context';
import { UpdateExecutionContextOnRouteChange } from './update_execution_context_on_route_change';

const queryClient = new QueryClient();

export function AppRoot({
  coreStart,
  pluginsStart,
  services,
  appMountParameters,
  isServerless,
}: {
  coreStart: CoreStart;
  pluginsStart: StreamsAppStartDependencies;
  services: StreamsAppServices;
  isServerless: boolean;
} & { appMountParameters: AppMountParameters }) {
  const { history } = appMountParameters;

  const context = {
    appParams: appMountParameters,
    core: coreStart,
    dependencies: {
      start: pluginsStart,
    },
    services,
    isServerless,
  };

  return (
    <StreamsAppContextProvider context={context}>
      <StreamsTourProvider>
        <QueryClientProvider client={queryClient}>
          {/* @ts-expect-error upgrade typescript v5.4.5 */}
          <RouterProvider history={history} router={streamsAppRouter}>
            <UpdateExecutionContextOnRouteChange>
              <DiscoverySettingsProvider>
                <DateRangeRedirect>
                  <PerformanceContextProvider>
                    <KbnUrlStateStorageFromRouterProvider>
                      <BreadcrumbsContextProvider>
                        <RouteRenderer />
                      </BreadcrumbsContextProvider>
                    </KbnUrlStateStorageFromRouterProvider>
                  </PerformanceContextProvider>
                </DateRangeRedirect>
              </DiscoverySettingsProvider>
            </UpdateExecutionContextOnRouteChange>
          </RouterProvider>
        </QueryClientProvider>
      </StreamsTourProvider>
    </StreamsAppContextProvider>
  );
}
