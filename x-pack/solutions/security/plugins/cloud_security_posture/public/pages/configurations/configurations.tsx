/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';
import { Redirect, useLocation } from 'react-router-dom';
import { Routes, Route } from '@kbn/shared-ux-router';
import { TrackApplicationView } from '@kbn/usage-collection-plugin/public';
import { useCspSetupStatusApi } from '@kbn/cloud-security-posture/src/hooks/use_csp_setup_status_api';
import { CDR_MISCONFIGURATIONS_DATA_VIEW_ID_PREFIX } from '@kbn/cloud-security-posture-common';
import { findingsNavigation } from '@kbn/cloud-security-posture';
import { useDataView } from '@kbn/cloud-security-posture/src/hooks/use_data_view';
import { EuiSpacer } from '@elastic/eui';
import { ProjectRoutingAccess, useRouteBasedCpsPickerAccess } from '@kbn/cps-utils';
import type { CPSPluginStart } from '@kbn/cps/public';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type { CoreStart } from '@kbn/core/public';
import { NoFindingsStates } from '../../components/no_findings_states';
import { CloudPosturePage, defaultLoadingRenderer } from '../../components/cloud_posture_page';
import { cloudPosturePages } from '../../common/navigation/constants';
import { LatestFindingsContainer } from './latest_findings/latest_findings_container';
import { DataViewContext } from '../../common/contexts/data_view_context';
import { IntegrationPageRouteCallout } from '../../components/integration_page_route_callout';

export const Configurations = () => {
  const location = useLocation();
  const dataViewQuery = useDataView(CDR_MISCONFIGURATIONS_DATA_VIEW_ID_PREFIX);
  const { data: getSetupStatus, isLoading: getSetupStatusIsLoading } = useCspSetupStatusApi();
  const { application, cps } = useKibana<CoreStart & { cps?: CPSPluginStart }>().services;
  useRouteBasedCpsPickerAccess(ProjectRoutingAccess.DISABLED, { application, cps });
  const hasMisconfigurationsFindings = !!getSetupStatus?.hasMisconfigurationsFindings;

  const hasFindings =
    hasMisconfigurationsFindings ||
    getSetupStatus?.kspm.status === 'indexed' ||
    getSetupStatus?.cspm.status === 'indexed';

  // For now, when there are no findings we prompt first to install cspm, if it is already installed we will prompt to
  // install kspm
  const noFindingsForPostureType =
    getSetupStatus?.cspm.status !== 'not-installed' ? 'cspm' : 'kspm';

  if (getSetupStatusIsLoading) return defaultLoadingRenderer();
  if (!hasFindings) return <NoFindingsStates postureType={noFindingsForPostureType} />;

  const dataViewContextValue = {
    dataView: dataViewQuery.data!,
    dataViewRefetch: dataViewQuery.refetch,
    dataViewIsRefetching: dataViewQuery.isRefetching,
  };

  return (
    <CloudPosturePage query={dataViewQuery}>
      <EuiSpacer />
      <IntegrationPageRouteCallout workflowName="misconfiguration_workflow" />
      <Routes>
        <Route
          exact
          path={cloudPosturePages.findings.path}
          render={() => (
            <Redirect
              to={{
                pathname: findingsNavigation.findings_default.path,
                search: location.search,
              }}
            />
          )}
        />
        <Route
          path={findingsNavigation.findings_default.path}
          render={() => (
            <TrackApplicationView viewId={findingsNavigation.findings_default.id}>
              <DataViewContext.Provider value={dataViewContextValue}>
                <LatestFindingsContainer />
              </DataViewContext.Provider>
            </TrackApplicationView>
          )}
        />
        <Route path="*" render={() => <Redirect to={findingsNavigation.findings_default.path} />} />
      </Routes>
    </CloudPosturePage>
  );
};
