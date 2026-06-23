/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ElasticsearchClient,
  Logger,
  SavedObjectsClientContract,
  StartServicesAccessor,
} from '@kbn/core/server';
import type { EntityAnalyticsMigrationsParams } from '../../migrations';
import { buildScopedInternalSavedObjectsClientUnsafe } from '../../risk_score/tasks/helpers';
import { PRIVILEGED_USER_MODIFIER } from '../../risk_score/modifiers/privileged_users';
import {
  getPrivilegedUserWatchlistSavedObjectId,
  PRIVILEGED_USER_WATCHLIST_NAME,
} from '../../../../../common/entity_analytics/watchlists/constants';
import { getStreamPatternFor } from '../../privilege_monitoring/data_sources/constants';
import type { WatchlistConfigClient } from '../management/watchlist_config';
import { WatchlistConfigClient as WatchlistConfigClientClass } from '../management/watchlist_config';
import {
  WatchlistEntitySourceClient,
  watchlistEntitySourceTypeName,
} from '../entity_sources/infra';
import type { StartPlugins } from '../../../../plugin';

// Bump this when PREBUILT_WATCHLISTS definitions change
export const PREBUILT_WATCHLISTS_VERSION = 2;

const OKTA_PRIVILEGED_ROLES = [
  'Super Administrator',
  'Organization Administrator',
  'Group Administrator',
  'Application Administrator',
  'Mobile Administrator',
  'Help Desk Administrator',
  'Report Administrator',
  'API Access Management Administrator',
  'Group Membership Administrator',
  'Read-only Administrator',
];

const buildKqlValuesFilter = (field: string, values: string[]): string =>
  `${field}: (${values.map((v) => `"${v}"`).join(' OR ')})`;

const OKTA_QUERY_RULE = buildKqlValuesFilter('user.roles', OKTA_PRIVILEGED_ROLES);
const AD_QUERY_RULE = 'entityanalytics_ad.user.privileged_group_member: true';

const getPrebuiltWatchlists = (namespace: string) => [
  {
    id: getPrivilegedUserWatchlistSavedObjectId(namespace),
    name: PRIVILEGED_USER_WATCHLIST_NAME,
    description: 'System-managed watchlist for tracking privileged users',
    managed: true,
    riskModifier: PRIVILEGED_USER_MODIFIER,
    entitySources: [
      {
        type: 'entity_analytics_integration' as const,
        name: 'okta',
        indexPattern: getStreamPatternFor('entityanalytics_okta', namespace),
        integrationName: 'entityanalytics_okta',
        enabled: true,
        managed: true,
        queryRule: OKTA_QUERY_RULE,
      },
      {
        type: 'entity_analytics_integration' as const,
        name: 'ad',
        indexPattern: getStreamPatternFor('entityanalytics_ad', namespace),
        integrationName: 'entityanalytics_ad',
        enabled: true,
        managed: true,
        queryRule: AD_QUERY_RULE,
      },
    ],
  },
];

type PrebuiltWatchlistDefinition = ReturnType<typeof getPrebuiltWatchlists>[number];

/**
 * Ensures all prebuilt watchlists exist for the given namespace.
 * Idempotent: skips creation if the watchlist already exists.
 */
export const ensurePrebuiltWatchlists = async ({
  watchlistClient,
  soClient,
  namespace,
  logger,
  esClient,
  getStartServices,
  hasEncryptionKey,
}: {
  watchlistClient: WatchlistConfigClient;
  soClient: SavedObjectsClientContract;
  namespace: string;
  logger: Logger;
  esClient: ElasticsearchClient;
  getStartServices: StartServicesAccessor<StartPlugins>;
  hasEncryptionKey: boolean;
}) => {
  for (const watchlist of getPrebuiltWatchlists(namespace)) {
    const { id, entitySources, ...attrs } = watchlist;

    const watchlistId = await getOrCreateWatchlist({ watchlistClient, logger, id, attrs });
    if (!watchlistId) {
      return;
    }

    // Ensure entity sources exist, even if the watchlist was already present
    if (entitySources?.length) {
      await ensureEntitySources({
        watchlistClient,
        soClient,
        namespace,
        logger,
        watchlistId,
        entitySources,
        esClient,
        getStartServices,
        hasEncryptionKey,
      });
    }

    logger.info(`Prebuilt watchlist '${watchlist.name}' initialized.`);
  }
};

const getOrCreateWatchlist = async ({
  watchlistClient,
  logger,
  id,
  attrs,
}: {
  watchlistClient: WatchlistConfigClient;
  logger: Logger;
  id: string;
  attrs: Omit<PrebuiltWatchlistDefinition, 'id' | 'entitySources'>;
}): Promise<string | undefined> => {
  try {
    const existing = await watchlistClient.get(id);
    return existing.id ?? id;
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    if (!errorMessage.includes('not found')) {
      logger.error(`Error checking prebuilt watchlist '${attrs.name}': ${errorMessage}`);
      return undefined;
    }

    logger.info(`Prebuilt watchlist '${attrs.name}' not found, creating...`);
    const created = await watchlistClient.create(attrs, { id });
    if (!created.id) {
      throw new Error('Prebuilt watchlist creation succeeded but no ID was returned');
    }
    return created.id;
  }
};

const ensureEntitySources = async ({
  watchlistClient,
  soClient,
  namespace,
  logger,
  watchlistId,
  entitySources,
  esClient,
  getStartServices,
  hasEncryptionKey,
}: {
  watchlistClient: WatchlistConfigClient;
  soClient: SavedObjectsClientContract;
  namespace: string;
  logger: Logger;
  watchlistId: string;
  entitySources: PrebuiltWatchlistDefinition['entitySources'];
  esClient: ElasticsearchClient;
  getStartServices: StartServicesAccessor<StartPlugins>;
  hasEncryptionKey: boolean;
}) => {
  const sourceClient = new WatchlistEntitySourceClient({
    soClient,
    namespace,
    esClient,
    getStartServices,
    logger,
    hasEncryptionKey,
  });

  for (const entitySourceInput of entitySources) {
    const { sources } = await sourceClient.list({ name: entitySourceInput.name, per_page: 1 });
    const existingId = sources[0]?.id;

    if (existingId) {
      logger.debug(
        `Entity source '${entitySourceInput.name}' already exists, ensuring link to watchlist`
      );
      await watchlistClient.addEntitySourceReference(watchlistId, existingId);
    } else {
      const entitySource = await sourceClient.create(entitySourceInput);
      await watchlistClient.addEntitySourceReference(watchlistId, entitySource.id);
      logger.info(`Entity source '${entitySourceInput.name}' created and linked to watchlist`);
    }
  }
};

/**
 * Startup migration: discovers all Kibana spaces and ensures prebuilt
 * watchlists exist in every one of them.
 */
export const installPrebuiltWatchlists = async ({
  logger,
  getStartServices,
  hasEncryptionKey,
}: EntityAnalyticsMigrationsParams) => {
  const [coreStart] = await getStartServices();
  const internalRepo = coreStart.savedObjects.createInternalRepository();
  const esClient = coreStart.elasticsearch.client.asInternalUser;

  const spacesResponse = await internalRepo.find({
    type: 'space',
    perPage: 1000,
  });

  // Always include 'default' — it may not have an explicit saved object
  const namespaces = new Set<string>(['default']);
  for (const so of spacesResponse.saved_objects) {
    namespaces.add(so.id);
  }

  for (const namespace of namespaces) {
    const soClient = buildScopedInternalSavedObjectsClientUnsafe({
      coreStart,
      namespace,
      includedHiddenTypes: [watchlistEntitySourceTypeName],
    });
    const watchlistClient = new WatchlistConfigClientClass({
      soClient,
      esClient,
      internalEsClient: esClient,
      namespace,
      logger,
    });

    await ensurePrebuiltWatchlists({
      watchlistClient,
      soClient,
      namespace,
      logger,
      esClient,
      getStartServices,
      hasEncryptionKey,
    });
  }
};
