/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { PerformanceContextProvider } from '@kbn/ebt-tools';
import { APP_WRAPPER_CLASS } from '@kbn/core/public';
import { KibanaContextProvider, useKibana } from '@kbn/kibana-react-plugin/public';
import { RedirectAppLinks } from '@kbn/shared-ux-link-redirect-app';
import { Storage } from '@kbn/kibana-utils-plugin/public';
import {
  HeaderMenuPortal,
  InspectorContextProvider,
} from '@kbn/observability-shared-plugin/public';
import { Route } from '@kbn/shared-ux-router';
import { RouteRenderer, RouterProvider } from '@kbn/typed-react-router-config';
import React, { useEffect } from 'react';
import { EMPTY, skip } from 'rxjs';
import { EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import type { CPSPluginStart } from '@kbn/cps/public';
import { KibanaEnvironmentContextProvider } from '../../../context/kibana_environment_context/kibana_environment_context';
import { AnomalyDetectionJobsContextProvider } from '../../../context/anomaly_detection_jobs/anomaly_detection_jobs_context';
import { EnvironmentsContextProvider } from '../../../context/environments_context/environments_context';
import type { ApmPluginContextValue } from '../../../context/apm_plugin/apm_plugin_context';
import { ApmPluginContext } from '../../../context/apm_plugin/apm_plugin_context';
import { useApmPluginContext } from '../../../context/apm_plugin/use_apm_plugin_context';
import { BreadcrumbsContextProvider } from '../../../context/breadcrumbs/context';
import { LicenseProvider } from '../../../context/license/license_context';
import { TimeRangeIdContextProvider } from '../../../context/time_range_id/time_range_id_context';
import { useTimeRangeId } from '../../../context/time_range_id/use_time_range_id';
import { UrlParamsProvider } from '../../../context/url_params_context/url_params_context';
import type { ApmPluginStartDeps, ApmServices } from '../../../plugin';
import { ApmErrorBoundary } from '../apm_error_boundary';
import { apmRouter } from '../apm_route_config';
import { TrackPageview } from '../track_pageview';
import { ApmHeaderActionMenu } from './apm_header_action_menu';
import { RedirectDependenciesToDependenciesInventory } from './redirect_dependencies_to_dependencies_inventory';
import { RedirectWithDefaultDateRange } from './redirect_with_default_date_range';
import { RedirectWithDefaultEnvironment } from './redirect_with_default_environment';
import { RedirectWithOffset } from './redirect_with_offset';
import { ScrollToTopOnPathChange } from './scroll_to_top_on_path_change';
import { UpdateExecutionContextOnRouteChange } from './update_execution_context_on_route_change';

const storage = new Storage(localStorage);

export function ApmAppRoot({
  apmPluginContextValue,
  pluginsStart,
  apmServices,
}: {
  apmPluginContextValue: ApmPluginContextValue;
  pluginsStart: ApmPluginStartDeps;
  apmServices: ApmServices;
}) {
  const { appMountParameters, kibanaEnvironment, core } = apmPluginContextValue;
  const { history } = appMountParameters;
  const i18nCore = core.i18n;

  return (
    <div className={APP_WRAPPER_CLASS} data-test-subj="apmMainContainer">
      <RedirectAppLinks
        coreStart={{
          application: core.application,
        }}
      >
        <ApmPluginContext.Provider value={apmPluginContextValue}>
          <KibanaContextProvider services={{ ...core, ...pluginsStart, storage, ...apmServices }}>
            <KibanaEnvironmentContextProvider kibanaEnvironment={kibanaEnvironment}>
              <i18nCore.Context>
                <TimeRangeIdContextProvider>
                  <CpsProjectRoutingSync />
                  <RouterProvider history={history} router={apmRouter as any}>
                    <PerformanceContextProvider>
                      <ApmErrorBoundary>
                        <RedirectDependenciesToDependenciesInventory>
                          <RedirectWithDefaultEnvironment>
                            <RedirectWithDefaultDateRange>
                              <RedirectWithOffset>
                                <TrackPageview>
                                  <UpdateExecutionContextOnRouteChange>
                                    <BreadcrumbsContextProvider>
                                      <UrlParamsProvider>
                                        <LicenseProvider>
                                          <EnvironmentsContextProvider>
                                            <AnomalyDetectionJobsContextProvider>
                                              <InspectorContextProvider>
                                                <MountApmHeaderActionMenu />
                                                <Route component={ScrollToTopOnPathChange} />
                                                <RouteRenderer />
                                              </InspectorContextProvider>
                                            </AnomalyDetectionJobsContextProvider>
                                          </EnvironmentsContextProvider>
                                        </LicenseProvider>
                                      </UrlParamsProvider>
                                    </BreadcrumbsContextProvider>
                                  </UpdateExecutionContextOnRouteChange>
                                </TrackPageview>
                              </RedirectWithOffset>
                            </RedirectWithDefaultDateRange>
                          </RedirectWithDefaultEnvironment>
                        </RedirectDependenciesToDependenciesInventory>
                      </ApmErrorBoundary>
                    </PerformanceContextProvider>
                  </RouterProvider>
                </TimeRangeIdContextProvider>
              </i18nCore.Context>
            </KibanaEnvironmentContextProvider>
          </KibanaContextProvider>
        </ApmPluginContext.Provider>
      </RedirectAppLinks>
    </div>
  );
}

function CpsProjectRoutingSync() {
  const { incrementTimeRangeId } = useTimeRangeId();
  const { services } = useKibana<{ cps?: CPSPluginStart }>();
  const cpsManager = services.cps?.cpsManager;

  useEffect(() => {
    const subscription = (cpsManager?.getProjectRouting$() ?? EMPTY).pipe(skip(1)).subscribe(() => {
      incrementTimeRangeId();
    });
    return () => subscription.unsubscribe();
  }, [cpsManager, incrementTimeRangeId]);

  return null;
}

function MountApmHeaderActionMenu() {
  const {
    appMountParameters: { setHeaderActionMenu, theme$ },
  } = useApmPluginContext();

  return (
    <HeaderMenuPortal setHeaderActionMenu={setHeaderActionMenu} theme$={theme$}>
      <EuiFlexGroup responsive={false} gutterSize="s">
        <EuiFlexItem>
          <ApmHeaderActionMenu />
        </EuiFlexItem>
      </EuiFlexGroup>
    </HeaderMenuPortal>
  );
}
