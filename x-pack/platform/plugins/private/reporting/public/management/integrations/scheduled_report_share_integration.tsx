/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { ExportShareParameters, ShareContext } from '@kbn/share-plugin/public';
import type { ReportingSharingData } from '@kbn/reporting-public/share/share_context_menu';
import { EuiButton } from '@elastic/eui';
import type { ReportingAPIClient } from '@kbn/reporting-public';
import type { ReportTypeId } from '../../types';
import { SCHEDULE_EXPORT_BUTTON_LABEL, SCHEDULED_REPORT_FLYOUT_TITLE } from '../translations';
import type { ReportingPublicPluginStartDependencies } from '../../plugin';
import { supportedReportTypes } from '../report_params';
import { ScheduledReportFlyoutShareWrapper } from '../components/scheduled_report_flyout_share_wrapper';

export function getReportingShareIntegrationConfig(
  apiClient: ReportingAPIClient,
  services: ReportingPublicPluginStartDependencies,
  shareOpts: ShareContext
): ExportShareParameters {
  const { sharingData } = shareOpts as unknown as { sharingData: ReportingSharingData };

  return {
    label: ({ openFlyout }) => (
      <EuiButton iconType="calendar" onClick={openFlyout} data-test-subj="scheduleExport">
        {SCHEDULE_EXPORT_BUTTON_LABEL}
      </EuiButton>
    ),
    shouldRender: ({ availableExportItems }) => {
      const supportedExportItemsForScheduling = availableExportItems.filter((exportItem) =>
        supportedReportTypes.includes(exportItem.config.exportType as ReportTypeId)
      );
      return supportedExportItemsForScheduling.length > 0;
    },
    flyoutContent: ({ closeFlyout }) => {
      return (
        <ScheduledReportFlyoutShareWrapper
          apiClient={apiClient}
          services={services}
          sharingData={sharingData}
          onClose={closeFlyout}
        />
      );
    },
    flyoutSizing: { size: 'm', maxWidth: 500 },
    flyoutAriaLabel: SCHEDULED_REPORT_FLYOUT_TITLE,
  };
}
