/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { useQuery, type QueryClient } from '@kbn/react-query';
import type { IHttpFetchError } from '@kbn/core/public';
import type { EntityType, SearchEntitiesFromEntityStoreResponse } from '@kbn/entity-store/public';
import { useEntityStoreEuidApi } from '@kbn/entity-store/public';
import type {
  HostEntity,
  UserEntity,
  ServiceEntity,
} from '../../../../../common/api/entity_analytics';
import type { HostItem, UserItem } from '../../../../../common/search_strategy';
import { useEntityAnalyticsRoutes } from '../../../../entity_analytics/api/api';

export const ENTITY_FROM_STORE_QUERY_KEY = 'ENTITY_FROM_STORE';

/**
 * After a successful entity-store upsert, search can still return the previous document briefly
 * (Elasticsearch NRT / transform timing). Merge the saved record into the cache so the UI updates
 * immediately instead of refetch overwriting with stale data.
 */
export function applyEntityStoreSearchCachePatch(
  queryClient: QueryClient,
  entityType: 'user' | 'host' | 'service',
  updatedRecord: EntityStoreRecord
): void {
  const canonicalId = updatedRecord.entity?.id;
  if (!canonicalId) {
    return;
  }

  queryClient.setQueriesData(
    {
      predicate: (query) =>
        Array.isArray(query.queryKey) &&
        query.queryKey[0] === ENTITY_FROM_STORE_QUERY_KEY &&
        query.queryKey[1] === entityType,
    },
    (previous: SearchEntitiesFromEntityStoreResponse | undefined) => {
      if (previous?.records?.[0]?.entity?.id !== canonicalId) {
        return previous;
      }
      const [, ...rest] = previous.records;
      return {
        ...previous,
        records: [
          updatedRecord as SearchEntitiesFromEntityStoreResponse['records'][number],
          ...rest,
        ],
      };
    }
  );
}

const entityIdFilter = (id: string) =>
  JSON.stringify({
    bool: { filter: [{ term: { 'entity.id': id } }] },
  });

export function serializeIdentityFieldsForQueryKey(
  fields: Record<string, string> | null | undefined
): string {
  if (fields == null || Object.keys(fields).length === 0) {
    return '';
  }
  const sortedKeys = Object.keys(fields).sort();
  return JSON.stringify(
    sortedKeys.reduce<Record<string, string>>((acc, key) => {
      acc[key] = fields[key];
      return acc;
    }, {})
  );
}

export function mapHostEntityToHostItem(entity: HostEntity): HostItem {
  const hostData = entity.host;
  if (!hostData) {
    return {};
  }
  return {
    host: {
      name: hostData.name ? [hostData.name] : undefined,
      id: hostData.id,
      ip: hostData.ip,
      mac: hostData.mac,
      architecture: hostData.architecture,
      type: hostData.type,
    },
  };
}

export function mapUserEntityToUserItem(entity: UserEntity): UserItem {
  const userData = entity.user;
  if (!userData) {
    return {};
  }
  return {
    user: {
      name: userData.name ? [userData.name] : undefined,
      id: userData.id,
      domain: userData.domain,
      full_name: userData.full_name,
      email: userData.email,
      hash: userData.hash,
    },
  };
}

export interface UseEntityFromStoreParams {
  /**
   * Canonical entity store id (`entity.id` on unified latest index). When set, the hook queries by this id.
   */
  entityId?: string;
  /**
   * When `entityId` is not set, identity field–value pairs for EUID resolution (e.g. `host.name`, `user.name`, `service.name`).
   */
  identityFields?: Record<string, string> | null;
  entityType?: string;
  skip: boolean;
}

export type EntityStoreRecord = HostEntity | UserEntity | ServiceEntity;

export interface EntityFromStoreResult<T> {
  entity: T | null;
  /** Raw entity store record (host/user/service) with risk and asset criticality. */
  entityRecord: EntityStoreRecord | null;
  firstSeen: string | null;
  lastSeen: string | null;
  isLoading: boolean;
  error: IHttpFetchError | null;
  inspect?: { dsl: string[]; response: string[] };
  refetch: () => void;
}

export function useEntityFromStore(
  params: UseEntityFromStoreParams
): EntityFromStoreResult<HostItem | UserItem> {
  const { entityId, identityFields, entityType, skip } = params;
  const euidApi = useEntityStoreEuidApi();
  const { fetchEntitiesListV2 } = useEntityAnalyticsRoutes();

  const identityDocument = useMemo(() => {
    if (identityFields == null || Object.keys(identityFields).length === 0) {
      return {};
    }
    return { ...identityFields };
  }, [identityFields]);

  const documentFilter = useMemo(
    () =>
      euidApi?.euid
        ? euidApi.euid.dsl.getEuidFilterBasedOnDocument(entityType as EntityType, identityDocument)
        : undefined,
    [euidApi?.euid, entityType, identityDocument]
  );

  /**
   * When EUID cannot build a DSL document from minimal identity (e.g. only `user.name` from the alerts
   * table), we still need a store query so the request completes and the UI can show "no entity" state.
   * Otherwise React Query stays in `status: 'loading'` while the query never runs (`enabled` false),
   * so `isLoading` never clears and flyouts skip the "no corresponding entity" callout.
   */
  const identityTermsFilter = useMemo(() => {
    const entries = Object.entries(identityDocument).filter(
      ([, value]) => value != null && String(value) !== ''
    );
    if (entries.length === 0) {
      return undefined;
    }
    return {
      bool: {
        filter: entries.map(([field, value]) => ({ term: { [field]: value } })),
      },
    };
  }, [identityDocument]);

  const storeFilter = documentFilter ?? identityTermsFilter;

  const entityStoreFilterKey = useMemo(() => {
    if (entityId) {
      return `id:${entityId}`;
    }
    if (documentFilter) {
      return `euid:${JSON.stringify(documentFilter)}`;
    }
    if (identityTermsFilter) {
      return `terms:${JSON.stringify(identityTermsFilter)}`;
    }
    return '';
  }, [entityId, documentFilter, identityTermsFilter]);

  const stableQueryKey = useMemo(
    () => entityId ?? serializeIdentityFieldsForQueryKey(identityFields),
    [entityId, identityFields]
  );

  const queryResult = useQuery({
    queryKey: [
      ENTITY_FROM_STORE_QUERY_KEY,
      entityType,
      stableQueryKey,
      entityStoreFilterKey,
      skip,
      entityId ?? '',
    ],
    queryFn: async ({ signal }) => {
      let filterQuery: string | undefined;
      if (entityId) {
        filterQuery = entityIdFilter(entityId);
      } else if (storeFilter) {
        filterQuery = JSON.stringify(storeFilter);
      }
      return fetchEntitiesListV2({
        signal,
        params: {
          entityTypes: [entityType as EntityType],
          filterQuery,
          page: 1,
          perPage: 1,
          sortField: '@timestamp',
          sortOrder: 'desc',
        },
      });
    },
    enabled: !skip && (Boolean(entityId) || Boolean(storeFilter)),
  });

  const { data, isLoading, error, refetch } = queryResult;
  const record = data?.records?.[0] as HostEntity | UserEntity | undefined;
  const entityField = record?.entity;

  const firstSeen = entityField?.lifecycle?.first_seen ?? null;
  const lastSeen =
    entityField?.lifecycle?.last_activity ?? entityField?.lifecycle?.last_seen ?? null;

  const mappedDetails = useMemo((): HostItem | UserItem | null => {
    if (!record) {
      return null;
    }
    if (entityType === 'host' && 'host' in record) {
      return mapHostEntityToHostItem(record);
    }
    if (entityType === 'user' && 'user' in record) {
      return mapUserEntityToUserItem(record);
    }
    return null;
  }, [record, entityType]);

  return useMemo(
    () => ({
      entity: mappedDetails,
      entityRecord: record ?? null,
      firstSeen,
      lastSeen,
      isLoading,
      error: error as IHttpFetchError | null,
      inspect: data?.inspect,
      refetch,
    }),
    [mappedDetails, record, firstSeen, lastSeen, isLoading, error, data?.inspect, refetch]
  );
}
