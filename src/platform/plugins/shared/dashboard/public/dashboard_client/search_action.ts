/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ActionDefinition } from '@kbn/ui-actions-plugin/public/actions';
import { dashboardClient } from './dashboard_client';
import type { DashboardSearchRequestParams } from '../../server';

interface Context {
  onResults: (dashboards: Array<{ id: string; isManaged: boolean; title: string }>) => void;
  search: DashboardSearchRequestParams;
}

// temporary escape hatch to avoid circular dependencies
// use findDashboardService if possible
export const searchAction: ActionDefinition<Context> = {
  id: 'searchDashboardAction',
  execute: async (context: Context) => {
    const searchResults = await dashboardClient.search(context.search);
    context.onResults(
      searchResults.data.map(({ id, data, meta }) => ({
        id,
        isManaged: Boolean(meta.managed),
        title: data.title,
      }))
    );
  },
};
