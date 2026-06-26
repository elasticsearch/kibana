/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { useQuery } from '@kbn/react-query';
import { lastValueFrom } from 'rxjs';
import { SECURITY_SOLUTION_ENABLE_ASSET_INVENTORY_SETTING } from '@kbn/management-settings-ids';
import type { IKibanaSearchRequest, IKibanaSearchResponse } from '@kbn/search-types';
import type { estypes } from '@elastic/elasticsearch';
import type { GetEntityStoreStatusResponse } from '@kbn/entity-store/common';
import type { EntityAnalyticsPrivileges } from '../../../common/api/entity_analytics';
import { useKibana, useUiSetting } from '../../common/lib/kibana';
import { useIsExperimentalFeatureEnabled } from '../../common/hooks/use_experimental_features';
import { useEntityStoreStatus } from '../../entity_analytics/components/entity_store/hooks/use_entity_store';
import { useEntityAnalyticsRoutes } from '../../entity_analytics/api/api';
import { ASSET_INVENTORY_INDEX_PATTERN } from '../constants';
import { useAssetInventoryRoutes } from './use_asset_inventory_routes';

export type AssetInventoryStatus =
  | 'inactive_feature'
  | 'entity_store_v2_disabled'
  | 'disabled'
  | 'initializing'
  | 'empty'
  | 'insufficient_privileges'
  | 'ready';

export interface AssetInventoryStatusResponse {
  status: AssetInventoryStatus;
  privileges?: EntityAnalyticsPrivileges;
}

const ASSET_INVENTORY_HAS_DOCS_QUERY_KEY = ['GET', 'ASSET_INVENTORY_HAS_DOCS'];
const ASSET_INVENTORY_PRIVILEGES_QUERY_KEY = ['GET', 'ASSET_INVENTORY_ENTITY_STORE_PRIVILEGES'];
const STATUS_REFETCH_INTERVAL_MS = 3000;

type EntityStoreEngineStatus = GetEntityStoreStatusResponse['engines'][number];

interface GenericEntityEngineStatus extends Omit<EntityStoreEngineStatus, 'type'> {
  type: 'generic';
}

interface TaskComponent {
  runs: number;
}

const isGenericEntityEngine = (
  engine: EntityStoreEngineStatus
): engine is GenericEntityEngineStatus => engine.type === 'generic';

const isTaskComponent = (component: unknown): component is TaskComponent =>
  typeof component === 'object' &&
  component !== null &&
  'runs' in component &&
  typeof (component as TaskComponent).runs === 'number';

const hasGenericEngineExecuted = (engine: GenericEntityEngineStatus): boolean =>
  !!engine.components?.some(
    (component) => component.resource === 'task' && isTaskComponent(component) && component.runs > 0
  );

/**
 * Composed Asset Inventory status resolver.
 *
 * Replaces the legacy `/api/asset_inventory/status` endpoint by combining:
 * - feature & v2 flag gates (Asset Inventory uses entity store v2 only),
 * - the entity store v2 status route,
 * - the entity store v2 privileges route,
 * - a small "has any v2 entity docs" search (`size: 0` + `terminate_after: 1`).
 *
 * The mapping replicates the previous server-side logic so consumers
 * (`AssetInventoryOnboarding`, `PermissionDenied`) keep the same semantics.
 */
export const useAssetInventoryStatus = () => {
  const { data: dataService } = useKibana().services;
  const { fetchEntityStoreV2Privileges } = useEntityAnalyticsRoutes();
  const { postInstallAssetInventoryDataView } = useAssetInventoryRoutes();

  const isAssetInventoryEnabled = useUiSetting<boolean>(
    SECURITY_SOLUTION_ENABLE_ASSET_INVENTORY_SETTING
  );
  const isEntityStoreV2ExperimentalEnabled = useIsExperimentalFeatureEnabled(
    'entityAnalyticsEntityStoreV2'
  );
  const v2FlagsEnabled = isEntityStoreV2ExperimentalEnabled;
  const featureGatesPassed = isAssetInventoryEnabled && v2FlagsEnabled;

  const hasDocsQuery = useQuery<boolean>({
    queryKey: ASSET_INVENTORY_HAS_DOCS_QUERY_KEY,
    queryFn: async () => {
      const response = await lastValueFrom(
        dataService.search.search<
          IKibanaSearchRequest<estypes.SearchRequest>,
          IKibanaSearchResponse<estypes.SearchResponse<unknown>>
        >({
          params: {
            index: ASSET_INVENTORY_INDEX_PATTERN,
            size: 0,
            terminate_after: 1,
            track_total_hits: 1,
          },
        })
      );
      const total = response.rawResponse.hits.total;
      const totalValue = typeof total === 'number' ? total : total?.value ?? 0;
      return totalValue > 0;
    },
    enabled: featureGatesPassed,
    // Once we've seen any v2 entity docs we don't need to keep polling — the
    // status hook caller will treat the result as "ready" indefinitely.
    refetchInterval: (data) => (data === true ? false : STATUS_REFETCH_INTERVAL_MS),
    // Lower-privileged users can hit a 4xx here; treat as "no docs visible"
    // so the privileges branch decides the final status.
    retry: false,
  });

  // Stop polling auxiliary signals as soon as `hasDocs` resolves to true: the
  // composed status will pin to `ready` and we no longer care about engine
  // status or privileges.
  const auxRefetchInterval = hasDocsQuery.data === true ? false : STATUS_REFETCH_INTERVAL_MS;

  const entityStoreStatusQuery = useEntityStoreStatus({
    withComponents: true,
    enabled: featureGatesPassed,
    refetchInterval: auxRefetchInterval,
  });

  const privilegesQuery = useQuery<EntityAnalyticsPrivileges>({
    queryKey: ASSET_INVENTORY_PRIVILEGES_QUERY_KEY,
    queryFn: () => fetchEntityStoreV2Privileges(),
    enabled: featureGatesPassed,
    refetchInterval: auxRefetchInterval,
  });

  const data = useMemo<AssetInventoryStatusResponse | undefined>(() => {
    if (!isAssetInventoryEnabled) {
      return { status: 'inactive_feature' };
    }
    if (!v2FlagsEnabled) {
      return { status: 'entity_store_v2_disabled' };
    }

    if (entityStoreStatusQuery.isLoading || privilegesQuery.isLoading || hasDocsQuery.isLoading) {
      return undefined;
    }

    const hasDocs = hasDocsQuery.data === true;
    const privileges = privilegesQuery.data;
    const entityStoreStatus = entityStoreStatusQuery.data;

    if (hasDocs) {
      // Best-effort install of the per-space data view — the route is idempotent
      // and the next status poll retries on failure.
      postInstallAssetInventoryDataView().catch(() => undefined);
      return { status: 'ready' };
    }

    if (privileges && !privileges.has_all_required) {
      return { status: 'insufficient_privileges', privileges };
    }

    if (!entityStoreStatus) {
      return { status: 'disabled' };
    }

    if (entityStoreStatus.status === 'not_installed') {
      return { status: 'disabled' };
    }
    if (entityStoreStatus.status === 'installing') {
      return { status: 'initializing' };
    }

    const genericEngine = entityStoreStatus.engines.find(isGenericEntityEngine);
    if (!genericEngine) {
      return { status: 'disabled' };
    }

    if (hasGenericEngineExecuted(genericEngine)) {
      return { status: 'empty' };
    }

    return { status: 'initializing' };
  }, [
    isAssetInventoryEnabled,
    v2FlagsEnabled,
    entityStoreStatusQuery.isLoading,
    entityStoreStatusQuery.data,
    privilegesQuery.isLoading,
    privilegesQuery.data,
    hasDocsQuery.isLoading,
    hasDocsQuery.data,
    postInstallAssetInventoryDataView,
  ]);

  const isLoading = featureGatesPassed
    ? entityStoreStatusQuery.isLoading || privilegesQuery.isLoading || hasDocsQuery.isLoading
    : false;

  // Surface a single refetch handle so callers (e.g. `useEnableAssetInventory`)
  // can re-run all three composed queries after enabling Asset Inventory.
  const refetch = () => {
    if (!featureGatesPassed) return;
    entityStoreStatusQuery.refetch();
    privilegesQuery.refetch();
    hasDocsQuery.refetch();
  };

  return {
    data,
    isLoading,
    refetch,
  };
};
