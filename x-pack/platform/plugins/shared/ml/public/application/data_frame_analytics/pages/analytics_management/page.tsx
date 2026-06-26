/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useCallback, useState } from 'react';
import { i18n } from '@kbn/i18n';
import { usePageUrlState, type ListingPageUrlState } from '@kbn/ml-url-state';
import { ML_PAGES } from '@kbn/ml-common-types/locator_ml_pages';
import { DataFrameAnalyticsList } from './components/analytics_list';
import { useRefreshInterval } from './components/analytics_list/use_refresh_interval';
import { NodeAvailableWarning } from '../../../components/node_available_warning';
import { SavedObjectsWarning } from '../../../components/saved_objects_warning';
import { UpgradeWarning } from '../../../components/upgrade';
import { DataFrameAnalyticsListColumn } from './components/analytics_list/common';
import { HelpMenu } from '../../../components/help_menu';
import { useMlKibana, useMlManagementLocator } from '../../../contexts/kibana';
import { useRefreshAnalyticsList } from '../../common';
import { MlAppHeader } from '../../../components/ml_app_header';
import { usePermissionCheck } from '../../../capabilities/check_capabilities';
import { ExportJobsFlyout, ImportJobsFlyout } from '../../../components/import_export_jobs';
import { JobSpacesSyncFlyout } from '../../../components/job_spaces_sync';
import { useDataFrameAnalyticsJobsMenu } from './hooks/use_data_frame_analytics_jobs_menu';

interface PageUrlState {
  pageKey: typeof ML_PAGES.DATA_FRAME_ANALYTICS_JOBS_MANAGE_FOR_URL;
  pageUrlState: ListingPageUrlState;
}

export const getDefaultDFAListState = (): ListingPageUrlState => ({
  pageIndex: 0,
  pageSize: 10,
  sortField: DataFrameAnalyticsListColumn.id,
  sortDirection: 'asc',
});

export const Page: FC = () => {
  const [blockRefresh, setBlockRefresh] = useState(false);
  const [showSyncFlyout, setShowSyncFlyout] = useState(false);
  const [showExportFlyout, setShowExportFlyout] = useState(false);
  const [showImportFlyout, setShowImportFlyout] = useState(false);

  const [dfaPageState, setDfaPageState] = usePageUrlState<PageUrlState>(
    ML_PAGES.DATA_FRAME_ANALYTICS_JOBS_MANAGE_FOR_URL,
    getDefaultDFAListState()
  );

  useRefreshInterval(setBlockRefresh);
  const [isLoading, setIsLoading] = useState(false);
  const { refresh } = useRefreshAnalyticsList({ isLoading: setIsLoading });

  const {
    services: { docLinks },
  } = useMlKibana();
  const helpLink = docLinks.links.ml.dataFrameAnalytics;
  const mlManagementLocator = useMlManagementLocator();

  const navigateToSourceSelection = useCallback(async () => {
    await mlManagementLocator?.navigate({
      sectionId: 'ml',
      appId: `analytics/${ML_PAGES.DATA_FRAME_ANALYTICS_SOURCE_SELECTION}`,
    });
  }, [mlManagementLocator]);

  const canCreateAnalytics = usePermissionCheck('canCreateDataFrameAnalytics');

  const onCloseSyncFlyout = useCallback(() => {
    refresh();
    setShowSyncFlyout(false);
  }, [refresh]);

  const menu = useDataFrameAnalyticsJobsMenu({
    navigateToSourceSelection,
    onOpenSyncFlyout: () => setShowSyncFlyout(true),
    onOpenExportFlyout: () => setShowExportFlyout(true),
    onOpenImportFlyout: () => setShowImportFlyout(true),
  });

  return (
    <>
      <MlAppHeader
        title={i18n.translate('xpack.ml.dataframe.analyticsList.title', {
          defaultMessage: 'Data Frame Analytics Jobs',
        })}
        menu={menu}
      />

      <NodeAvailableWarning />

      <SavedObjectsWarning onCloseFlyout={refresh} forceRefresh={isLoading} />
      <UpgradeWarning />

      <DataFrameAnalyticsList
        blockRefresh={blockRefresh}
        pageState={dfaPageState}
        updatePageState={setDfaPageState}
      />
      {showSyncFlyout ? <JobSpacesSyncFlyout onClose={onCloseSyncFlyout} /> : null}
      <ExportJobsFlyout
        isDisabled={!canCreateAnalytics}
        currentTab="data-frame-analytics"
        isOpen={showExportFlyout}
        onClose={() => setShowExportFlyout(false)}
      />
      <ImportJobsFlyout
        isDisabled={!canCreateAnalytics}
        onImportComplete={refresh}
        isOpen={showImportFlyout}
        onClose={() => setShowImportFlyout(false)}
      />
      <HelpMenu docLink={helpLink} />
    </>
  );
};
