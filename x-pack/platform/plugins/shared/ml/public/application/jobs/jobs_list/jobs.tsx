/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useCallback, useEffect, useState } from 'react';
import { EuiSpacer, useEuiTheme } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { usePageUrlState } from '@kbn/ml-url-state';
import type { ListingPageUrlState } from '@kbn/ml-url-state';
import { ML_PAGES } from '@kbn/ml-common-types/locator_ml_pages';
import { JobsListView } from './components/jobs_list_view';
import { HelpMenu } from '../../components/help_menu';
import { useMlKibana } from '../../contexts/kibana';
import { MlAppHeader } from '../../components/ml_app_header';
import { useEnabledFeatures } from '../../contexts/ml';
import { getMlNodeCount } from '../../ml_nodes_check/check_ml_nodes';
import { usePermissionCheck } from '../../capabilities/check_capabilities';
import { ImportJobsFlyout } from '../../components/import_export_jobs/import_jobs_flyout';
import { ExportJobsFlyout } from '../../components/import_export_jobs';
import { JobSpacesSyncFlyout } from '../../components/job_spaces_sync';
import { useAnomalyDetectionJobsMenu } from './hooks/use_anomaly_detection_jobs_menu';

interface PageUrlState {
  pageKey: typeof ML_PAGES.ANOMALY_DETECTION_JOBS_MANAGE_FOR_URL;
  pageUrlState: ListingPageUrlState;
}

interface JobsPageProps {
  isMlEnabledInSpace?: boolean;
  lastRefresh?: number;
  refreshList: () => void;
}

export const getDefaultAnomalyDetectionJobsListState = (): ListingPageUrlState => ({
  pageIndex: 0,
  pageSize: 10,
  sortField: 'id',
  sortDirection: 'asc',
});

export const JobsPage: FC<JobsPageProps> = ({ isMlEnabledInSpace, lastRefresh, refreshList }) => {
  const [pageState, setPageState] = usePageUrlState<PageUrlState>(
    ML_PAGES.ANOMALY_DETECTION_JOBS_MANAGE_FOR_URL,
    getDefaultAnomalyDetectionJobsListState()
  );
  const [showSyncFlyout, setShowSyncFlyout] = useState(false);
  const [showExportFlyout, setShowExportFlyout] = useState(false);
  const [showImportFlyout, setShowImportFlyout] = useState(false);
  const {
    services: {
      docLinks,
      mlServices: { mlApi },
    },
  } = useMlKibana();
  const { euiTheme } = useEuiTheme();

  useEffect(() => {
    getMlNodeCount(mlApi);
  }, [mlApi]);

  const { showNodeInfo } = useEnabledFeatures();
  const helpLink = docLinks.links.ml.anomalyDetection;
  const [canCreateJob] = usePermissionCheck(['canCreateJob']);

  const onCloseSyncFlyout = useCallback(() => {
    refreshList();
    setShowSyncFlyout(false);
  }, [refreshList]);

  const menu = useAnomalyDetectionJobsMenu({
    refreshList,
    onOpenSyncFlyout: () => setShowSyncFlyout(true),
    onOpenExportFlyout: () => setShowExportFlyout(true),
    onOpenImportFlyout: () => setShowImportFlyout(true),
  });

  return (
    <>
      <MlAppHeader
        title={i18n.translate('xpack.ml.jobsList.title', {
          defaultMessage: 'Anomaly Detection Jobs',
        })}
        menu={menu}
      />
      <EuiSpacer size="m" />
      <JobsListView
        euiTheme={euiTheme}
        isMlEnabledInSpace={isMlEnabledInSpace}
        lastRefresh={lastRefresh}
        jobsViewState={pageState}
        onJobsViewStateUpdate={setPageState}
        showNodeInfo={showNodeInfo}
        canCreateJob={canCreateJob}
      />
      {showSyncFlyout ? <JobSpacesSyncFlyout onClose={onCloseSyncFlyout} /> : null}
      <ExportJobsFlyout
        isDisabled={!canCreateJob}
        currentTab="anomaly-detector"
        isOpen={showExportFlyout}
        onClose={() => setShowExportFlyout(false)}
      />
      <ImportJobsFlyout
        isDisabled={!canCreateJob}
        onImportComplete={refreshList}
        isOpen={showImportFlyout}
        onClose={() => setShowImportFlyout(false)}
      />
      <HelpMenu docLink={helpLink} />
    </>
  );
};
