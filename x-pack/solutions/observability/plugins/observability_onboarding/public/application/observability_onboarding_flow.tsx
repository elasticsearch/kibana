/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import React, { useEffect } from 'react';
import { Route, Routes } from '@kbn/shared-ux-router';
import { Redirect } from 'react-router-dom';
import { useLocation } from 'react-router-dom-v5-compat';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { APP_MAIN_SCROLL_CONTAINER_ID } from '@kbn/core-chrome-layout-constants';
import {
  AutoDetectPage,
  LandingPage,
  OtelLogsPage,
  FirehosePage,
  OtelApmPage,
  CloudForwarderPage,
  KubernetesPage,
  KubernetesOtelPage,
} from './pages';
import {
  HostLinuxAutoDetectPage,
  HostLinuxOtelPage,
  HostMacosAutoDetectPage,
  HostMacosOtelPage,
  HostWindowsOtelPage,
} from './pages/host';
import type { ObservabilityOnboardingAppServices } from '..';
import { CloudwatchIntegrationRedirect } from './cloudwatch_integration_redirect';
import { IS_ADD_DATA_PAGE_V2_ENABLED } from '../../common/feature_flags';
import { useFlowBreadcrumb } from './shared/use_flow_breadcrumbs';
import { useManagedOtlpServiceAvailability } from './shared/use_managed_otlp_service_availability';

const queryClient = new QueryClient();

function OtelKubernetesRedirect() {
  const { search } = useLocation();
  const searchParams = new URLSearchParams(search);
  searchParams.delete('ingestion');
  const nextSearch = searchParams.toString();
  return <Redirect to={`/kubernetes${nextSearch ? `?${nextSearch}` : ''}`} />;
}

export function ObservabilityOnboardingFlow() {
  const { pathname } = useLocation();
  const {
    services: {
      featureFlags,
      context: { isDev, isCloud, isServerless },
    },
  } = useKibana<ObservabilityOnboardingAppServices>();
  const isAddDataPageV2Enabled = featureFlags.getBooleanValue(IS_ADD_DATA_PAGE_V2_ENABLED, false);

  useFlowBreadcrumb(null);

  useEffect(() => {
    document.getElementById(APP_MAIN_SCROLL_CONTAINER_ID)?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  }, [pathname]);

  const isManagedOtlpServiceAvailable = useManagedOtlpServiceAvailability();

  const v2HostRoutes = isAddDataPageV2Enabled
    ? [
        <Route key="host-linux" exact path="/host/linux">
          <HostLinuxOtelPage />
        </Route>,
        <Route key="host-linux-auto-detect" exact path="/host/linux/auto-detect">
          <HostLinuxAutoDetectPage />
        </Route>,
        <Route key="host-macos" exact path="/host/macos">
          <HostMacosOtelPage />
        </Route>,
        <Route key="host-macos-auto-detect" exact path="/host/macos/auto-detect">
          <HostMacosAutoDetectPage />
        </Route>,
        <Route key="host-windows" exact path="/host/windows">
          <HostWindowsOtelPage />
        </Route>,
      ]
    : [
        <Route key="host-v2-disabled" path="/host">
          <Redirect to="/" />
        </Route>,
      ];

  return (
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route path="/auto-detect">
          <AutoDetectPage />
        </Route>
        <Route key="kubernetes-otel" exact path="/kubernetes">
          <KubernetesOtelPage />
        </Route>
        <Route key="kubernetes-elastic-agent" exact path="/kubernetes/elastic-agent">
          <KubernetesPage />
        </Route>
        <Route key="otel-kubernetes-redirect" exact path="/otel-kubernetes">
          <OtelKubernetesRedirect />
        </Route>
        <Route key="aws-redirect" exact path="/aws">
          <CloudwatchIntegrationRedirect />
        </Route>
        <Route path="/otel-logs">
          <OtelLogsPage />
        </Route>
        {(isCloud || isDev) && (
          <Route path="/firehose">
            <FirehosePage />
          </Route>
        )}
        {isManagedOtlpServiceAvailable && (
          <Route path="/otel-apm">
            <OtelApmPage />
          </Route>
        )}
        {(isServerless || isDev) && (
          <Route path="/cloudforwarder">
            <CloudForwarderPage />
          </Route>
        )}
        {v2HostRoutes}
        <Route>
          <LandingPage />
        </Route>
      </Routes>
    </QueryClientProvider>
  );
}
