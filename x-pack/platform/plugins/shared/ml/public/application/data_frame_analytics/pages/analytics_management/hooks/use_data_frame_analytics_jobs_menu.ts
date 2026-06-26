/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import type { AppHeaderMenu } from '@kbn/app-header';
import { usePermissionCheck } from '../../../../capabilities/check_capabilities';
import { useEnabledFeatures } from '../../../../contexts/ml';

interface UseDataFrameAnalyticsJobsMenuArgs {
  navigateToSourceSelection: () => void;
  onOpenSyncFlyout: () => void;
  onOpenExportFlyout: () => void;
  onOpenImportFlyout: () => void;
}

export const useDataFrameAnalyticsJobsMenu = ({
  navigateToSourceSelection,
  onOpenSyncFlyout,
  onOpenExportFlyout,
  onOpenImportFlyout,
}: UseDataFrameAnalyticsJobsMenuArgs): AppHeaderMenu => {
  const [canCreateJob, canCreateDataFrameAnalytics, canCreateTrainedModels] = usePermissionCheck([
    'canCreateJob',
    'canCreateDataFrameAnalytics',
    'canCreateTrainedModels',
  ]);
  const { isADEnabled, isDFAEnabled } = useEnabledFeatures();

  const canSync = canCreateJob || canCreateDataFrameAnalytics || canCreateTrainedModels;
  const showImportExport = isADEnabled !== false || isDFAEnabled !== false;

  return useMemo<AppHeaderMenu>(
    () => ({
      primaryActionItem: canCreateDataFrameAnalytics
        ? {
            id: 'createDataFrameAnalyticsJob',
            label: i18n.translate(
              'xpack.ml.dataframe.analyticsList.createDataFrameAnalyticsButton',
              {
                defaultMessage: 'Create job',
              }
            ),
            iconType: 'plusInCircle' as const,
            run: navigateToSourceSelection,
            testId: 'mlAnalyticsButtonCreate',
          }
        : undefined,
      items: [
        ...(canSync
          ? [
              {
                id: 'syncSavedObjects',
                order: 100,
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
                order: 200,
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
                order: 300,
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
      canCreateDataFrameAnalytics,
      canSync,
      navigateToSourceSelection,
      onOpenExportFlyout,
      onOpenImportFlyout,
      onOpenSyncFlyout,
      showImportExport,
    ]
  );
};
