/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreStart, ScopedHistory } from '@kbn/core/public';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import React from 'react';
import ReactDOM from 'react-dom';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import { I18nProvider } from '@kbn/i18n-react';
import { Router } from '@kbn/shared-ux-router';
import { RedirectAppLinks } from '@kbn/shared-ux-link-redirect-app';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import { AgentBuilderRoutes } from './routes';
import type { AgentBuilderInternalService } from '../services';
import type { AgentBuilderStartDependencies } from '../types';
import { AgentBuilderServicesContext } from './context/agent_builder_services_context';
import { ActiveSpaceProvider } from './context/active_space_context';
import { PageWrapper } from './page_wrapper';
import { AppLeaveContext, type OnAppLeave } from './context/app_leave_context';
import { StreamingProvider } from './context/streaming/streaming_context';
import { ConversationStreamService } from '../services';

export const mountApp = async ({
  core,
  plugins,
  element,
  history,
  services,
  onAppLeave,
}: {
  core: CoreStart;
  plugins: AgentBuilderStartDependencies;
  element: HTMLElement;
  history: ScopedHistory;
  services: AgentBuilderInternalService;
  onAppLeave: OnAppLeave;
}) => {
  const ApplicationUsageTrackingProvider =
    services.usageCollection?.components.ApplicationUsageTrackingProvider ?? React.Fragment;
  const kibanaServices = { ...core, plugins, appParams: { history } };
  const queryClient = new QueryClient();
  const conversationStreamService = new ConversationStreamService(services.eventsService);
  await services.accessChecker.initAccess();
  const activeSpaceId = (await plugins.spaces?.getActiveSpace())?.id ?? DEFAULT_SPACE_ID;

  ReactDOM.render(
    core.rendering.addContext(
      <KibanaContextProvider services={kibanaServices}>
        <ApplicationUsageTrackingProvider>
          <I18nProvider>
            <QueryClientProvider client={queryClient}>
              <AgentBuilderServicesContext.Provider value={services}>
                <ActiveSpaceProvider spaceId={activeSpaceId}>
                  <AppLeaveContext.Provider value={onAppLeave}>
                    <RedirectAppLinks coreStart={core}>
                      <PageWrapper>
                        <Router history={history}>
                          <StreamingProvider conversationStreamService={conversationStreamService}>
                            <AgentBuilderRoutes />
                          </StreamingProvider>
                        </Router>
                      </PageWrapper>
                    </RedirectAppLinks>
                  </AppLeaveContext.Provider>
                </ActiveSpaceProvider>
              </AgentBuilderServicesContext.Provider>
            </QueryClientProvider>
          </I18nProvider>
        </ApplicationUsageTrackingProvider>
      </KibanaContextProvider>
    ),
    element
  );

  return () => {
    ReactDOM.unmountComponentAtNode(element);
  };
};
