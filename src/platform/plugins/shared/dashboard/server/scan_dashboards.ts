/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SavedObjectsClientContract } from '@kbn/core/server';
import type { Reference } from '@kbn/content-management-utils';
import type { DashboardState } from '@kbn/as-code-dashboard-schema';
import type { DashboardSavedObjectAttributes } from './dashboard_saved_object';
import { DASHBOARD_SAVED_OBJECT_TYPE } from '../common/constants';
import { transformDashboardOut } from './api/transforms';
import type { getDashboardStateSchema } from './api/dashboard_state_schemas';

/**
 * The result of scanning dashboards.
 * Contains a paginated list of dashboard summaries.
 */
export interface ScanDashboardsResult {
  /** Array of dashboard summaries with their metadata. */
  dashboards: Array<
    Pick<DashboardState, 'description' | 'panels' | 'tags' | 'title'> & {
      id: string;
      references: Reference[];
    }
  >;
  /** The current page number. */
  page: number;
  /** The total number of dashboards. */
  total: number;
}

export async function scanDashboards(
  savedObjectsClient: SavedObjectsClientContract,
  page: number,
  perPage: number,
  strictValidationSchema: ReturnType<typeof getDashboardStateSchema>
): Promise<ScanDashboardsResult> {
  const soResponse = await savedObjectsClient.find<DashboardSavedObjectAttributes>({
    type: DASHBOARD_SAVED_OBJECT_TYPE,
    fields: ['description', 'title', 'panelsJSON', 'sections'],
    perPage,
    page,
  });

  return {
    dashboards: soResponse.saved_objects.map((so) => {
      const {
        dashboardState: { description, tags, title, panels },
      } = transformDashboardOut(
        so.attributes,
        so.references,
        true, // temporary fix to return old Lens SO panel format,
        strictValidationSchema
      );

      return {
        id: so.id,
        references: so.references,
        ...(description?.length && { description }),
        panels: panels ?? [],
        ...(tags?.length && { tags }),
        title: title ?? '',
      };
    }),
    page: soResponse.page,
    total: soResponse.total,
  };
}
