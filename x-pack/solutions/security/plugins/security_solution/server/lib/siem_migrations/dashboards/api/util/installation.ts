/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsClientContract } from '@kbn/core/server';
import type {
  DashboardMigrationDashboard,
  UpdateMigrationDashboard,
} from '../../../../../../common/siem_migrations/model/dashboard_migration.gen';
import { getErrorMessage } from '../../../../../utils/error_helpers';
import { initPromisePool } from '../../../../../utils/promise_pool';
import type { SecuritySolutionApiRequestHandlerContext } from '../../../../..';
import { getVendorTag } from '../../../common/api/util/tags';
import { findOrCreateTagReferences } from './tag_utils';

const MAX_DASHBOARDS_TO_CREATE_IN_PARALLEL = 10;

interface InstallTranslatedProps {
  /**
   * The migration id
   */
  migrationId: string;

  /**
   * If specified, then installable translated dashboards in the list will be installed,
   * otherwise all installable translated dashboards will be installed.
   */
  ids?: string[];

  /**
   * The security solution context
   */
  securitySolutionContext: SecuritySolutionApiRequestHandlerContext;

  /**
   * The saved objects client
   */
  savedObjectsClient: SavedObjectsClientContract;

  /**
   * The space id
   */
  spaceId: string;
}

export const installTranslated = async ({
  migrationId,
  ids,
  savedObjectsClient,
  securitySolutionContext,
  spaceId,
}: InstallTranslatedProps): Promise<number> => {
  const dashboardMigrationsClient = securitySolutionContext.siemMigrations.getDashboardsClient();

  let installedCount = 0;
  const installationErrors: Error[] = [];

  // Get installable dashboard migrations
  const dashboardBatches = dashboardMigrationsClient.data.items.searchBatches(migrationId, {
    filters: { ids, installable: true },
  });

  let dashboardsToInstall = await dashboardBatches.next();
  while (dashboardsToInstall.length) {
    const { dashboardsToUpdate, errors } = await installDashboards(
      dashboardsToInstall,
      savedObjectsClient,
      spaceId
    );
    installedCount += dashboardsToUpdate.length;
    installationErrors.push(...errors);
    await dashboardMigrationsClient.data.items.update(migrationId, dashboardsToUpdate);
    dashboardsToInstall = await dashboardBatches.next();
  }

  // Throw an error if needed
  if (installationErrors.length) {
    throw new Error(installationErrors.map((err) => err.message).join(', '));
  }

  return installedCount;
};

const installDashboards = async (
  dashboardsToInstall: DashboardMigrationDashboard[],
  savedObjectsClient: SavedObjectsClientContract,
  spaceId: string
): Promise<{
  dashboardsToUpdate: Array<UpdateMigrationDashboard>;
  errors: Error[];
}> => {
  const errors: Error[] = [];
  const dashboardsToUpdate: Array<UpdateMigrationDashboard> = [];

  const createDashboardsOutcome = await initPromisePool({
    concurrency: MAX_DASHBOARDS_TO_CREATE_IN_PARALLEL,
    items: dashboardsToInstall,
    executor: async (dashboard) => {
      try {
        // Check if dashboard data exists
        if (!dashboard.elastic_dashboard?.data) {
          throw new Error('Invalid Dashboard: No data to install');
        }

        // Parse the dashboard data (assuming it's JSON)
        const dashboardData = JSON.parse(dashboard.elastic_dashboard.data);
        const tagNames = [getVendorTag(dashboard.original_dashboard.vendor)];

        // Find or create tag references
        const tagReferences = await findOrCreateTagReferences(savedObjectsClient, tagNames);

        const result = await savedObjectsClient.create(
          'dashboard',
          {
            title: dashboard.original_dashboard.title,
            description: dashboard.original_dashboard.description,
            // Add other dashboard attributes as needed
            ...dashboardData.attributes,
          },
          {
            id: dashboard.id,
            references: tagReferences,
            initialNamespaces: [spaceId],
          }
        );

        dashboardsToUpdate.push({
          id: dashboard.id,
          elastic_dashboard: {
            id: result.id,
          },
        });
      } catch (error) {
        errors.push(
          new Error(`Error installing dashboard ${dashboard.id}: ${getErrorMessage(error)}`)
        );
      }
    },
  });

  errors.push(
    ...createDashboardsOutcome.errors.map(
      (err) => new Error(`Error installing dashboard: ${getErrorMessage(err)}`)
    )
  );

  return { dashboardsToUpdate, errors };
};
