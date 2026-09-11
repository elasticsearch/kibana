/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import React, { type PropsWithChildren, type ReactNode, useMemo, useState } from 'react';
import {
  type CombinedRuntimeState,
  InternalStateProvider,
  RuntimeStateProvider,
  RuntimeStateManagerProvider,
  CurrentTabProvider,
  selectTabRuntimeState,
  useRuntimeState,
} from '../application/main/state_management/redux';
import {
  DiscoverCustomizationProvider,
  type DiscoverCustomizationService,
} from '../customizations';
import { EMPTY_CONTEXT_AWARENESS_TOOLKIT, type ScopedProfilesManager } from '../context_awareness';
import type { DiscoverServices } from '../build_services';
import { createDiscoverServicesMock } from './services';
import { KibanaRenderContextProvider } from '@kbn/react-kibana-context-render';
import { ChartPortalsRenderer } from '../application/main/components/chart';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import type { ScopedDiscoverEBTManager } from '../ebt_manager';
import { ScopedServicesProvider } from '../components/scoped_services_provider';
import { type InternalStateMockToolkit } from './discover_state.mock';
import { from } from 'rxjs';
import useObservable from 'react-use/lib/useObservable';

export type DiscoverTestProviderProps = PropsWithChildren<{
  services?: DiscoverServices;
  internalState?: InternalStateMockToolkit['internalState'];
  runtimeStateManager?: InternalStateMockToolkit['runtimeStateManager'];
  customizationService?: DiscoverCustomizationService;
  scopedProfilesManager?: ScopedProfilesManager;
  scopedEbtManager?: ScopedDiscoverEBTManager;
  runtimeState?: CombinedRuntimeState;
  currentTabId?: string;
  usePortalsRenderer?: boolean;
}>;

export type DiscoverToolkitTestProviderProps = PropsWithChildren<{
  toolkit: InternalStateMockToolkit;
  usePortalsRenderer?: boolean;
}>;

/**
 * Similar to {@link DiscoverTestProvider} but accepts an {@link InternalStateMockToolkit}
 * returned by `getDiscoverInternalStateMock`, which is generally preferred for component tests.
 */
export const DiscoverToolkitTestProvider = ({
  toolkit,
  usePortalsRenderer,
  children,
}: DiscoverToolkitTestProviderProps) => {
  const [internalState$] = useState(() => from(toolkit.internalState));
  const internalState = useObservable(internalState$, toolkit.internalState.getState());
  const currentTabId = internalState.tabs.unsafeCurrentId;
  const currentTabRuntimeState = selectTabRuntimeState(toolkit.runtimeStateManager, currentTabId);
  const customizationService = useRuntimeState(currentTabRuntimeState.customizationService$);
  const adHocDataViews = useRuntimeState(toolkit.runtimeStateManager.adHocDataViews$);
  const currentDataSource = useRuntimeState(currentTabRuntimeState.currentDataSource$);
  const runtimeState = useMemo<CombinedRuntimeState | undefined>(
    () => (currentDataSource ? { adHocDataViews, currentDataSource } : undefined),
    [adHocDataViews, currentDataSource]
  );
  const scopedProfilesManager = useRuntimeState(currentTabRuntimeState.scopedProfilesManager$);
  const scopedEbtManager = useRuntimeState(currentTabRuntimeState.scopedEbtManager$);

  return (
    <DiscoverTestProvider
      services={toolkit.services}
      internalState={toolkit.internalState}
      runtimeStateManager={toolkit.runtimeStateManager}
      customizationService={customizationService}
      scopedProfilesManager={scopedProfilesManager}
      scopedEbtManager={scopedEbtManager}
      runtimeState={runtimeState}
      currentTabId={currentTabId}
      usePortalsRenderer={usePortalsRenderer}
    >
      {children}
    </DiscoverTestProvider>
  );
};

/**
 * A test provider that wraps Discover components with necessary contexts.
 * - When `internalState` and `runtimeStateManager` are provided, includes full Redux state management.
 * - When they're omitted, provides only basic services (Kibana context, query client, scoped services).
 * **Prefer {@link DiscoverToolkitTestProvider} for component tests requiring full state management.**
 */
export const DiscoverTestProvider = ({
  services: originalServices,
  internalState,
  runtimeStateManager,
  customizationService,
  runtimeState,
  scopedProfilesManager: originalScopedProfilesManager,
  scopedEbtManager: originalScopedEbtManager,
  currentTabId,
  usePortalsRenderer,
  children,
}: DiscoverTestProviderProps) => {
  const [queryClient] = useState(() => new QueryClient());
  const services = useMemo(
    () => originalServices ?? createDiscoverServicesMock(),
    [originalServices]
  );
  const scopedEbtManager = useMemo(
    () => originalScopedEbtManager ?? services.ebtManager.createScopedEBTManager(),
    [originalScopedEbtManager, services.ebtManager]
  );
  const scopedProfilesManager = useMemo(
    () =>
      originalScopedProfilesManager ??
      services.profilesManager.createScopedProfilesManager({
        scopedEbtManager,
        toolkit: EMPTY_CONTEXT_AWARENESS_TOOLKIT,
      }),
    [originalScopedProfilesManager, scopedEbtManager, services.profilesManager]
  );

  // Per-tab providers - these should be inside CurrentTabProvider
  let content: ReactNode = (
    <ScopedServicesProvider
      scopedProfilesManager={scopedProfilesManager}
      scopedEBTManager={scopedEbtManager}
    >
      {children}
    </ScopedServicesProvider>
  );

  if (runtimeState) {
    content = <RuntimeStateProvider {...runtimeState}>{content}</RuntimeStateProvider>;
  }

  if (customizationService) {
    content = (
      <DiscoverCustomizationProvider value={customizationService}>
        {content}
      </DiscoverCustomizationProvider>
    );
  }

  // CurrentTabProvider - either via ChartPortalsRenderer or directly
  if (usePortalsRenderer && runtimeStateManager) {
    content = (
      <ChartPortalsRenderer runtimeStateManager={runtimeStateManager}>
        {content}
      </ChartPortalsRenderer>
    );
  } else if (currentTabId) {
    content = <CurrentTabProvider currentTabId={currentTabId}>{content}</CurrentTabProvider>;
  }

  // Add Redux state providers when state managers are provided
  if (internalState && runtimeStateManager) {
    content = (
      <RuntimeStateManagerProvider value={runtimeStateManager}>
        <InternalStateProvider store={internalState}>{content}</InternalStateProvider>
      </RuntimeStateManagerProvider>
    );
  }

  return (
    <KibanaRenderContextProvider {...services.core}>
      <KibanaContextProvider services={services}>
        <QueryClientProvider client={queryClient}>{content}</QueryClientProvider>
      </KibanaContextProvider>
    </KibanaRenderContextProvider>
  );
};
