/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo, useCallback } from 'react';
import { i18n } from '@kbn/i18n';
import type { AppHeaderMenu } from '@kbn/app-header';
import { ML_PAGES } from '@kbn/ml-common-types/locator_ml_pages';
import { useCreateAndNavigateToManagementMlLink } from '../../../contexts/kibana/use_create_url';
import { useMlLocator, useNavigateToPath } from '../../../contexts/kibana';
import { usePermissionCheck } from '../../../capabilities/check_capabilities';
import { mlNodesAvailable } from '../../../ml_nodes_check/check_ml_nodes';
import { useEnabledFeatures } from '../../../contexts/ml';

interface UseAnomalyDetectionJobsMenuArgs {
  refreshList: () => void;
  onOpenSyncFlyout: () => void;
  onOpenExportFlyout: () => void;
  onOpenImportFlyout: () => void;
}

export const useAnomalyDetectionJobsMenu = ({
  refreshList,
  onOpenSyncFlyout,
  onOpenExportFlyout,
  onOpenImportFlyout,
}: UseAnomalyDetectionJobsMenuArgs): AppHeaderMenu => {
  const [canCreateJob, canCreateDataFrameAnalytics, canCreateTrainedModels] = usePermissionCheck([
    'canCreateJob',
    'canCreateDataFrameAnalytics',
    'canCreateTrainedModels',
  ]);
  const redirectToSuppliedConfigurationsPage = useCreateAndNavigateToManagementMlLink(
    ML_PAGES.SUPPLIED_CONFIGURATIONS,
    'anomaly_detection'
  );
  const redirectToAnomalyDetectionSettingsPage = useCreateAndNavigateToManagementMlLink(
    '',
    'ad_settings'
  );
  const mlLocator = useMlLocator();
  const navigateToPath = useNavigateToPath();
  const { isADEnabled, isDFAEnabled } = useEnabledFeatures();

  const navigateToSettings = useCallback(async () => {
    if (!mlLocator) {
      return;
    }
    const path = await mlLocator.getUrl({
      page: ML_PAGES.SETTINGS,
    });
    navigateToPath(path);
  }, [mlLocator, navigateToPath]);

  const navigateToCreateJob = useCallback(async () => {
    if (!mlLocator || !canCreateJob) {
      return;
    }
    await mlLocator.navigate({
      sectionId: 'ml',
      appId: `anomaly_detection/${ML_PAGES.ANOMALY_DETECTION_CREATE_JOB_SELECT_INDEX}`,
    });
  }, [canCreateJob, mlLocator]);

  const canSync = canCreateJob || canCreateDataFrameAnalytics || canCreateTrainedModels;
  const canCreate = canCreateJob && mlNodesAvailable();
  const showImportExport = isADEnabled !== false || isDFAEnabled !== false;

  return useMemo<AppHeaderMenu>(
    () => ({
      primaryActionItem: canCreate
        ? {
            id: 'createAnomalyDetectionJob',
            label: i18n.translate('xpack.ml.jobsList.createNewJobButtonLabel', {
              defaultMessage: 'Create job',
            }),
            iconType: 'plusInCircle' as const,
            run: navigateToCreateJob,
            testId: 'mlCreateNewJobButton',
          }
        : undefined,
      items: [
        {
          id: 'suppliedConfigurations',
          order: 100,
          label: i18n.translate('xpack.ml.suppliedConfigurationsManagementLabel', {
            defaultMessage: 'Supplied configurations',
          }),
          iconType: 'plusInCircle' as const,
          run: redirectToSuppliedConfigurationsPage,
          testId: 'mlSuppliedConfigurationsButton',
        },
        {
          id: 'anomalyDetectionSettings',
          order: 200,
          label: i18n.translate('xpack.ml.anomalyDetectionSettingsLabel', {
            defaultMessage: 'Settings',
          }),
          iconType: 'gear' as const,
          run: redirectToAnomalyDetectionSettingsPage,
          testId: 'mlAnomalyDetectionSettingsButton',
        },
        {
          id: 'mlSettings',
          order: 250,
          label: i18n.translate('xpack.ml.navMenu.settingsTabLinkText', {
            defaultMessage: 'Settings',
          }),
          iconType: 'gear' as const,
          run: navigateToSettings,
          testId: 'mlNavMenuSettingsTabLink',
          overflow: true,
        },
        ...(canSync
          ? [
              {
                id: 'syncSavedObjects',
                order: 300,
                label: i18n.translate('xpack.ml.management.jobsList.syncFlyoutButton', {
                  defaultMessage: 'Synchronize saved objects',
                }),
                iconType: 'inputOutput' as const,
                run: onOpenSyncFlyout,
                testId: 'mlStackMgmtSyncButton',
              },
            ]
          : []),
        ...(showImportExport
          ? [
              {
                id: 'exportJobs',
                order: 400,
                label: i18n.translate('xpack.ml.importExport.exportButton', {
                  defaultMessage: 'Export jobs',
                }),
                iconType: 'exportAction' as const,
                run: onOpenExportFlyout,
                testId: 'mlJobsExportButton',
                overflow: true,
              },
              {
                id: 'importJobs',
                order: 500,
                label: i18n.translate('xpack.ml.importExport.importButton', {
                  defaultMessage: 'Import jobs',
                }),
                iconType: 'importAction' as const,
                run: onOpenImportFlyout,
                testId: 'mlJobsImportButton',
                overflow: true,
              },
            ]
          : []),
      ],
    }),
    [
      canCreate,
      canSync,
      navigateToCreateJob,
      navigateToSettings,
      onOpenExportFlyout,
      onOpenImportFlyout,
      onOpenSyncFlyout,
      redirectToAnomalyDetectionSettingsPage,
      redirectToSuppliedConfigurationsPage,
      showImportExport,
    ]
  );
};
