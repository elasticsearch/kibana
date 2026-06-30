/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsClientContract } from '@kbn/core-saved-objects-api-server';
import { isSavedObjectErrorResult } from '@kbn/core-saved-objects-api-server';
import { DASHBOARD_SAVED_OBJECT_TYPE } from '@kbn/deeplinks-analytics/constants';
import type { PackageClient } from '@kbn/fleet-plugin/server';
import type { Dashboard } from '../../../common/api_types';

export async function getIntegrationDashboards(
  packageClient: PackageClient,
  savedObjectsClient: SavedObjectsClientContract,
  integration: string
): Promise<Dashboard[]> {
  // Retrieve integration savedObject
  const integrationSavedObjects = await packageClient.getInstallation(integration);
  if (!integrationSavedObjects) return [];

  // Extract dashboard ids
  const dashboardIds: string[] = [];
  integrationSavedObjects.installed_kibana.forEach((intSavedObject) => {
    if (intSavedObject.type === DASHBOARD_SAVED_OBJECT_TYPE) {
      dashboardIds.push(intSavedObject.id);
    }
  });

  // Fetch dashboards savedObject
  // We are directly querying the SO here
  // The dashboard service is not exposed from the server side at the moment
  // https://github.com/elastic/kibana/issues/179759
  const dashboardsSavedObjects = await savedObjectsClient.bulkGet<{
    title?: string;
  }>(
    dashboardIds.map((id) => ({
      id,
      type: DASHBOARD_SAVED_OBJECT_TYPE,
      fields: ['title'],
    }))
  );

  // Ignore faulty dashboards
  const allValidDashboardSavedObjects = dashboardsSavedObjects.saved_objects.filter(
    (so) => !isSavedObjectErrorResult(so)
  );

  // Construct dashboard result
  const packageDashboards = allValidDashboardSavedObjects.map((so) => ({
    id: so.id,
    title: so.attributes.title || so.id,
  }));

  return packageDashboards;
}
