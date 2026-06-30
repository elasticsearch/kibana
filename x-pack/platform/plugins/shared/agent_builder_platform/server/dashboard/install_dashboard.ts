/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Readable } from 'stream';
import pMap from 'p-map';
import type {
  CoreStart,
  ISavedObjectsImporter,
  ISavedObjectsRepository,
  Logger,
  SavedObjectsClientContract,
} from '@kbn/core/server';
import { SavedObjectsClient, SavedObjectsErrorHelpers } from '@kbn/core/server';
import {
  AGENT_BUILDER_OVERVIEW_DASHBOARD_ID,
  AGENT_BUILDER_OVERVIEW_DASHBOARD_VERSION,
  AGENT_BUILDER_TRACES_NAMESPACE_PLACEHOLDER,
} from './constants';
import { overviewDashboard } from './assets/overview_dashboard';

const SYNC_CONCURRENCY = 5;

interface DashboardSavedObjectAsset {
  id: string;
  type: string;
  managed: boolean;
  coreMigrationVersion: string;
  typeMigrationVersion: string;
  references: unknown[];
  attributes: { panelsJSON: string; version?: number } & Record<string, unknown>;
}

const sourceOverviewDashboard = overviewDashboard as DashboardSavedObjectAsset;

/**
 * return the id of the dashboard in the given space
 */
export function overviewDashboardId(spaceId: string): string {
  return `${AGENT_BUILDER_OVERVIEW_DASHBOARD_ID}-${spaceId}`;
}

/**
 * install the dashboard in the given space using the saved objects importer
 */
async function installAgentBuilderOverviewDashboard(
  client: SavedObjectsClientContract,
  importer: ISavedObjectsImporter,
  logger: Logger,
  spaceId: string,
  namespace: string | undefined
): Promise<void> {
  // Skip the import when the installed dashboard is already at the bundled version.
  const installedVersion = await getInstalledDashboardVersion(client, spaceId, namespace);
  if (
    installedVersion !== undefined &&
    installedVersion === AGENT_BUILDER_OVERVIEW_DASHBOARD_VERSION
  ) {
    logger.debug(
      `Agent Builder overview dashboard already at version ${AGENT_BUILDER_OVERVIEW_DASHBOARD_VERSION} in space "${spaceId}", skipping install`
    );
    return;
  }

  // Substitute the namespace placeholder everywhere it appears in the saved object
  const dashboard = JSON.parse(
    JSON.stringify(sourceOverviewDashboard).replaceAll(
      AGENT_BUILDER_TRACES_NAMESPACE_PLACEHOLDER,
      spaceId
    )
  ) as DashboardSavedObjectAsset;
  dashboard.id = overviewDashboardId(spaceId);

  const result = await importer.import({
    readStream: Readable.from([dashboard]),
    overwrite: true,
    createNewCopies: false,
    managed: true,
    namespace,
    refresh: false,
  });

  result.warnings.forEach((w) => {
    logger.warn(`Agent Builder dashboard import warning: ${JSON.stringify(w)}`);
  });

  if (!result.success) {
    const errors = (result.errors ?? []).map(
      (e) => `Couldn't import "${e.type}:${e.id}": ${JSON.stringify(e.error)}`
    );
    errors.forEach((e) => logger.error(e));
    throw new Error(errors.length > 0 ? errors[0] : 'Unknown import error');
  }

  logger.debug(`Agent Builder overview dashboard installed in space "${spaceId}"`);
}

/**
 * read the content version of the dashboard already installed in the given
 * space, or undefined when it isn't installed yet.
 */
async function getInstalledDashboardVersion(
  client: SavedObjectsClientContract,
  spaceId: string,
  namespace: string | undefined
): Promise<number | undefined> {
  try {
    const existing = await client.get<{ version?: number }>(
      'dashboard',
      overviewDashboardId(spaceId),
      { namespace }
    );
    return existing?.attributes?.version;
  } catch (error) {
    if (SavedObjectsErrorHelpers.isNotFoundError(error)) {
      return undefined;
    }
    throw error;
  }
}

/**
 * remove the dashboard from the given space
 */
async function removeAgentBuilderOverviewDashboard(
  client: SavedObjectsClientContract,
  logger: Logger,
  spaceId: string,
  namespace: string | undefined
): Promise<void> {
  try {
    await client.delete('dashboard', overviewDashboardId(spaceId), { namespace });
    logger.debug(`Agent Builder overview dashboard removed from space "${spaceId}"`);
  } catch (error) {
    if (SavedObjectsErrorHelpers.isNotFoundError(error)) {
      logger.debug(`Agent Builder overview dashboard already absent in space "${spaceId}"`);
      return;
    }
    throw error;
  }
}

/**
 * Sync the dashboard for all spaces. The dashboard visualizes Agent Builder
 * traces. When tracing is enabled (via the experimental features and tracing
 * uiSettings), the dashboard is installed into every space; otherwise it is
 * removed.
 */
export async function syncAgentBuilderOverviewDashboard(
  coreStart: Pick<CoreStart, 'savedObjects'>,
  tracingEnabled: boolean,
  logger: Logger
): Promise<void> {
  const client = new SavedObjectsClient(coreStart.savedObjects.createInternalRepository());
  const importer = coreStart.savedObjects.createImporter(client);

  // `space` is a hidden SO type, so it must be explicitly allowlisted on the repository.
  const spaceRepo = coreStart.savedObjects.createInternalRepository(['space']);
  const spaceIds = await getAllSpaceIds(spaceRepo);

  logger.debug(`Agent Builder dashboard sync: found ${spaceIds.length} space(s)`);

  await pMap(
    spaceIds,
    async (spaceId) => {
      const namespace = spaceId === 'default' ? undefined : spaceId;
      try {
        if (tracingEnabled) {
          await installAgentBuilderOverviewDashboard(client, importer, logger, spaceId, namespace);
        } else {
          await removeAgentBuilderOverviewDashboard(client, logger, spaceId, namespace);
        }
      } catch (err) {
        logger.error(`Agent Builder dashboard sync failed for space "${spaceId}": ${err}`);
      }
    },
    { concurrency: SYNC_CONCURRENCY }
  );
}

/**
 * Sync the dashboard for a single space. Installs when tracing is enabled,
 * removes otherwise.
 */
export async function syncAgentBuilderOverviewDashboardForSpace(
  coreStart: Pick<CoreStart, 'savedObjects'>,
  tracingEnabled: boolean,
  spaceId: string,
  logger: Logger
): Promise<void> {
  const client = new SavedObjectsClient(coreStart.savedObjects.createInternalRepository());
  const importer = coreStart.savedObjects.createImporter(client);
  const namespace = spaceId === 'default' ? undefined : spaceId;

  if (tracingEnabled) {
    await installAgentBuilderOverviewDashboard(client, importer, logger, spaceId, namespace);
  } else {
    await removeAgentBuilderOverviewDashboard(client, logger, spaceId, namespace);
  }
}

/**
 * fetch the ids of every space, paging through the (hidden) `space` saved objects.
 */
async function getAllSpaceIds(spaceRepo: ISavedObjectsRepository): Promise<string[]> {
  const perPage = 100;
  const spaceIds = new Set<string>(['default']);

  for (let page = 1; ; page++) {
    const { saved_objects: batch } = await spaceRepo.find<unknown>({
      type: 'space',
      perPage,
      page,
    });

    batch.forEach((space) => spaceIds.add(space.id));

    if (batch.length < perPage) {
      break;
    }
  }

  return [...spaceIds];
}
