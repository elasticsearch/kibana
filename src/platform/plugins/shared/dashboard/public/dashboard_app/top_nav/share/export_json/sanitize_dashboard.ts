/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DashboardState } from '@kbn/as-code-dashboard-schema';
import { DASHBOARD_INTERNAL_API_PATH } from '../../../../../common/constants';
import type { DashboardSanitizeResponseBody } from '../../../../../server';
import { coreServices } from '../../../../services/kibana_services';

export async function sanitizeDashboard(dashboardState: DashboardState) {
  const result = await coreServices.http.post<DashboardSanitizeResponseBody>(
    `${DASHBOARD_INTERNAL_API_PATH}/_sanitize`,
    {
      version: '1',
      body: JSON.stringify(dashboardState),
    }
  );

  return {
    data: result.data,
    warnings: (result.warnings ?? []).map(({ message }) => message),
  };
}
