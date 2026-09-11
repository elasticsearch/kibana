/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { ImportJsonFlyoutContent } from '@kbn/as-code-import-flyout-component';

import type { DashboardState } from '../../../common';
import { dashboardClient } from '../../dashboard_client/dashboard_client';
import { coreServices } from '../../services/kibana_services';
import { sanitizeDashboard } from '../../dashboard_app/top_nav/share/export_json/sanitize_dashboard';
import { importDashboardJsonStrings } from './_import_dashboard_json_strings';

interface ImportDashboardJsonFlyoutProps {
  closeFlyout: () => void;
  onImportSuccess: (id: string, title: string) => void;
  titleId: string;
}

export const ImportDashboardJsonFlyout = ({
  closeFlyout,
  onImportSuccess,
  titleId,
}: ImportDashboardJsonFlyoutProps) => {
  return (
    <ImportJsonFlyoutContent<DashboardState>
      title={importDashboardJsonStrings.getFlyoutTitle()}
      titleId={titleId}
      closeFlyout={closeFlyout}
      dataTestSubjPrefix="importDashboardJson"
      exportApplication={importDashboardJsonStrings.getExportApplication()}
      services={coreServices}
      isTechnicalPreview
      serverValidationError={importDashboardJsonStrings.getServerValidationError()}
      getWarningsSummary={importDashboardJsonStrings.getWarningsBody}
      sanitizeImportJson={sanitizeDashboard}
      createFromJson={async (data) => {
        const result = await dashboardClient.create(data);
        return { id: result.id, title: result.data.title ?? '' };
      }}
      onImportSuccess={onImportSuccess}
    />
  );
};
