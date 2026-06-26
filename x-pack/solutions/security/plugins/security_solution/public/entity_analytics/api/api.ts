/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import type { AnonymizationFieldResponse } from '@kbn/elastic-assistant-common';
import {
  API_VERSIONS as ENTITY_STORE_API_VERSIONS,
  type EntityMaintainerResponseItem,
  ENTITY_STORE_ROUTES,
  type GetEntityMaintainersResponse,
} from '@kbn/entity-store/common';
import { compact } from 'lodash';
import type { EntityDetailsHighlightsResponse } from '../../../common/api/entity_analytics/entity_details/highlights.gen';
import { ENTITY_DETAILS_HIGHLIGHT_INTERNAL_URL } from '../../../common/entity_analytics/entity_analytics/constants';
import type {
  AssetCriticalityRecord,
  ConfigureRiskEngineSavedObjectRequestBodyInput,
  CreateEntitySourceResponse,
  CreatePrivilegesImportIndexResponse,
  CreateWatchlistRequestBodyInput,
  CreateWatchlistResponse,
  DisableRiskEngineResponse,
  EnableRiskEngineResponse,
  EntityAnalyticsPrivileges,
  FindAssetCriticalityRecordsResponse,
  InitMonitoringEngineResponse,
  InitRiskEngineResponse,
  InternalUploadAssetCriticalityV2CsvResponse,
  EntityType,
  ListEntitiesResponse,
  ListEntitySourcesResponse,
  PrivMonHealthResponse,
  PrivMonPrivilegesResponse,
  PrivmonBulkUploadUsersCSVResponse,
  ReadRiskEngineSettingsResponse,
  RiskEngineScheduleNowResponse,
  RiskEngineStatusResponse,
  RiskScoresEntityCalculationRequest,
  RiskScoresEntityCalculationResponse,
  RiskScoresPreviewRequest,
  RiskScoresPreviewResponse,
  SearchPrivilegesIndicesResponse,
  UpdateEntitySourceResponse,
  UploadAssetCriticalityRecordsResponse,
} from '../../../common/api/entity_analytics';
import type { ListWatchlistsResponse } from '../../../common/api/entity_analytics/watchlists/management/list.gen';
import type { GetWatchlistResponse } from '../../../common/api/entity_analytics/watchlists/management/get.gen';
import type {
  UpdateWatchlistRequestBodyInput,
  UpdateWatchlistResponse,
} from '../../../common/api/entity_analytics/watchlists/management/update.gen';
import type { ListWatchlistEntitySourcesResponse } from '../../../common/api/entity_analytics/watchlists/data_source/list.gen';
import type {
  UpdateWatchlistEntitySourceRequestBodyInput,
  UpdateWatchlistEntitySourceResponse,
} from '../../../common/api/entity_analytics/watchlists/data_source/update.gen';
import type {
  CreateWatchlistEntitySourceRequestBodyInput,
  CreateWatchlistEntitySourceResponse,
} from '../../../common/api/entity_analytics/watchlists/data_source/create.gen';
import {
  API_VERSIONS,
  ASSET_CRITICALITY_CSV_UPLOAD_V2_URL,
  ASSET_CRITICALITY_INTERNAL_PRIVILEGES_URL,
  ASSET_CRITICALITY_PUBLIC_CSV_UPLOAD_URL,
  ASSET_CRITICALITY_PUBLIC_LIST_URL,
  ASSET_CRITICALITY_PUBLIC_URL,
  ENTITY_STORE_INTERNAL_PRIVILEGES_URL,
  getPrivmonMonitoringSourceByIdUrl,
  LIST_ENTITIES_URL,
  MONITORING_ENGINE_INIT_URL,
  MONITORING_ENTITY_LIST_SOURCES_URL,
  MONITORING_ENTITY_SOURCE_URL,
  MONITORING_USERS_CSV_UPLOAD_URL,
  PRIVMON_HEALTH_URL,
  PRIVMON_INDICES_URL,
  PRIVMON_PRIVILEGE_CHECK_API,
  RISK_ENGINE_CLEANUP_URL,
  RISK_ENGINE_CONFIGURE_SO_URL,
  RISK_ENGINE_DISABLE_URL,
  RISK_ENGINE_ENABLE_URL,
  RISK_ENGINE_INIT_URL,
  RISK_ENGINE_PRIVILEGES_URL,
  RISK_ENGINE_SCHEDULE_NOW_URL,
  RISK_ENGINE_SETTINGS_URL,
  RISK_ENGINE_STATUS_URL,
  RISK_SCORE_ENTITY_CALCULATION_URL,
  RISK_SCORE_PREVIEW_URL,
} from '../../../common/constants';
import {
  WATCHLISTS_URL,
  WATCHLISTS_INDICES_URL,
  WATCHLISTS_CSV_UPLOAD_URL,
  WATCHLISTS_PRIVILEGES_URL,
} from '../../../common/entity_analytics/watchlists/constants';
import type { UploadWatchlistCsvResponse } from '../../../common/api/entity_analytics/watchlists/csv_upload/csv_upload.gen';
import {
  GENERATE_LEADS_URL,
  GET_LEADS_URL,
  LEAD_GENERATION_STATUS_URL,
  DISMISS_LEAD_URL,
  BULK_UPDATE_LEADS_URL,
  ENABLE_LEAD_GENERATION_URL,
  DISABLE_LEAD_GENERATION_URL,
  LEAD_GENERATION_PRIVILEGES_URL,
} from '../../../common/entity_analytics/lead_generation/constants';
import type {
  FindLeadsResponse,
  GenerateLeadsResponse,
  LeadGenerationStatus,
  BulkUpdateLeadsResponse,
} from '../../../common/entity_analytics/lead_generation/types';
import type { SnakeToCamelCase } from '../common/utils';
import { useKibana } from '../../common/lib/kibana/kibana_react';
import { useIsExperimentalFeatureEnabled } from '../../common/hooks/use_experimental_features';

export interface DeleteAssetCriticalityResponse {
  deleted: true;
}

/**
 * This hardcoded name was temporarily introduced for 9.1.0.
 * It is used to identify the only entity source that can be edited by the UI.
 */
const ENTITY_SOURCE_NAME = 'User Monitored Indices';
const RISK_SCORE_MAINTAINER_ID = 'risk-score';
const ENTITY_STORE_V2_QUERY = { apiVersion: ENTITY_STORE_API_VERSIONS.internal.v2 } as const;

const getMaintainerRouteWithId = (route: string, id: string): string =>
  route.replace('{id}', encodeURIComponent(id));

export const useEntityAnalyticsRoutes = () => {
  const { http } = useKibana().services;
  const isEntityAnalyticsEntityStoreV2Enabled = useIsExperimentalFeatureEnabled(
    'entityAnalyticsEntityStoreV2'
  );
  const isMaintainerRiskScoreV2Enabled = isEntityAnalyticsEntityStoreV2Enabled;

  return useMemo(() => {
    const fetchEntityMaintainers = (ids?: string[]) =>
      http.fetch<GetEntityMaintainersResponse>(
        ENTITY_STORE_ROUTES.internal.ENTITY_MAINTAINERS_GET,
        {
          method: 'GET',
          query: {
            ...ENTITY_STORE_V2_QUERY,
            ...(ids && ids.length > 0 ? { ids } : {}),
          },
        }
      );

    const fetchRiskScoreMaintainer = async (): Promise<
      EntityMaintainerResponseItem | undefined
    > => {
      const maintainers = await fetchEntityMaintainers([RISK_SCORE_MAINTAINER_ID]);
      return maintainers.maintainers[0];
    };

    /**
     * Fetches preview risks scores
     */
    const fetchRiskScorePreview = ({
      signal,
      params,
    }: {
      signal?: AbortSignal;
      params: RiskScoresPreviewRequest;
    }) =>
      http.fetch<RiskScoresPreviewResponse>(RISK_SCORE_PREVIEW_URL, {
        version: '1',
        method: 'POST',
        body: JSON.stringify(params),
        signal,
      });

    /**
     * Fetches entities from the Entity Store
     */
    const fetchEntitiesList = ({
      signal,
      params,
    }: {
      signal?: AbortSignal;
      params: FetchEntitiesListParams;
    }) =>
      http.fetch<ListEntitiesResponse>(LIST_ENTITIES_URL, {
        version: API_VERSIONS.public.v1,
        method: 'GET',
        query: {
          entity_types: params.entityTypes,
          sort_field: params.sortField,
          sort_order: params.sortOrder,
          page: params.page,
          per_page: params.perPage,
          filterQuery: params.filterQuery,
        },
        signal,
      });

    /**
     * Fetches entities from the Entity Store v2 unified latest index (`entity_store` plugin CRUD GET; public API version).
     */
    const fetchEntitiesListV2 = ({
      signal,
      params,
    }: {
      signal?: AbortSignal;
      params: FetchEntitiesListParams;
    }) =>
      http.fetch<ListEntitiesResponse>(ENTITY_STORE_ROUTES.public.CRUD_GET, {
        version: ENTITY_STORE_API_VERSIONS.public.v1,
        method: 'GET',
        query: {
          entity_types: params.entityTypes,
          sort_field: params.sortField,
          sort_order: params.sortOrder,
          page: params.page,
          per_page: params.perPage,
          filterQuery: params.filterQuery,
        },
        signal,
      });

    /**
     * Fetches risks engine status
     */
    const fetchRiskEngineStatus = async ({ signal }: { signal?: AbortSignal }) => {
      if (isMaintainerRiskScoreV2Enabled) {
        const riskScoreMaintainer = await fetchRiskScoreMaintainer();
        const riskEngineStatus = !riskScoreMaintainer
          ? 'NOT_INSTALLED'
          : riskScoreMaintainer.taskStatus === 'started'
          ? 'ENABLED'
          : riskScoreMaintainer.taskStatus === 'stopped'
          ? 'DISABLED'
          : 'NOT_INSTALLED';
        const runAt = riskScoreMaintainer?.nextRunAt;

        // The maintainer API doesn't expose the underlying TaskManager status directly,
        // so we infer 'running' vs 'idle' based on whether nextRunAt is in the past.
        // This is a heuristic, but it avoids leaking TaskManager internals into the maintainer API.
        const isRunning = runAt ? new Date(runAt).getTime() <= Date.now() : false;
        const status = isRunning ? 'running' : 'idle';

        return {
          risk_engine_status: riskEngineStatus,
          risk_engine_task_status: runAt
            ? {
                status,
                runAt,
              }
            : undefined,
        } as RiskEngineStatusResponse;
      }

      return http.fetch<RiskEngineStatusResponse>(RISK_ENGINE_STATUS_URL, {
        version: '1',
        method: 'GET',
        signal,
      });
    };

    /**
     * Init risk score engine
     */
    const initRiskEngine = async () => {
      if (isMaintainerRiskScoreV2Enabled) {
        await http.fetch<{ ok: true }>(ENTITY_STORE_ROUTES.internal.ENTITY_MAINTAINERS_INIT, {
          method: 'POST',
          query: ENTITY_STORE_V2_QUERY,
          body: JSON.stringify({}),
        });

        return {
          result: {
            risk_engine_enabled: true,
            risk_engine_resources_installed: true,
            risk_engine_configuration_created: true,
            errors: [],
          },
        } as InitRiskEngineResponse;
      }

      return http.fetch<InitRiskEngineResponse>(RISK_ENGINE_INIT_URL, {
        version: '1',
        method: 'POST',
      });
    };

    /**
     * Enable risk score engine
     */
    const enableRiskEngine = async () => {
      if (isMaintainerRiskScoreV2Enabled) {
        await http.fetch<{ ok: true }>(
          getMaintainerRouteWithId(
            ENTITY_STORE_ROUTES.internal.ENTITY_MAINTAINERS_START,
            RISK_SCORE_MAINTAINER_ID
          ),
          {
            method: 'PUT',
            query: ENTITY_STORE_V2_QUERY,
            body: JSON.stringify({}),
          }
        );
        return { success: true } as EnableRiskEngineResponse;
      }

      return http.fetch<EnableRiskEngineResponse>(RISK_ENGINE_ENABLE_URL, {
        version: '1',
        method: 'POST',
      });
    };

    /**
     * Disable risk score engine
     */
    const disableRiskEngine = async () => {
      if (isMaintainerRiskScoreV2Enabled) {
        await http.fetch<{ ok: true }>(
          getMaintainerRouteWithId(
            ENTITY_STORE_ROUTES.internal.ENTITY_MAINTAINERS_STOP,
            RISK_SCORE_MAINTAINER_ID
          ),
          {
            method: 'PUT',
            query: ENTITY_STORE_V2_QUERY,
            body: JSON.stringify({}),
          }
        );
        return { success: true } as DisableRiskEngineResponse;
      }

      return http.fetch<DisableRiskEngineResponse>(RISK_ENGINE_DISABLE_URL, {
        version: '1',
        method: 'POST',
      });
    };

    /**
     * Enable risk score engine
     */
    const scheduleNowRiskEngine = async () => {
      if (isMaintainerRiskScoreV2Enabled) {
        await http.fetch<{ ok: true }>(
          getMaintainerRouteWithId(
            ENTITY_STORE_ROUTES.internal.ENTITY_MAINTAINERS_RUN,
            RISK_SCORE_MAINTAINER_ID
          ),
          {
            method: 'POST',
            query: ENTITY_STORE_V2_QUERY,
            body: JSON.stringify({}),
          }
        );
        return { success: true } as RiskEngineScheduleNowResponse;
      }

      return http.fetch<RiskEngineScheduleNowResponse>(RISK_ENGINE_SCHEDULE_NOW_URL, {
        version: API_VERSIONS.public.v1,
        method: 'POST',
      });
    };

    /**
     * Calculate and stores risk score for an entity
     */
    const calculateEntityRiskScore = (params: RiskScoresEntityCalculationRequest) => {
      return http.fetch<RiskScoresEntityCalculationResponse>(RISK_SCORE_ENTITY_CALCULATION_URL, {
        version: '1',
        method: 'POST',
        body: JSON.stringify(params),
      });
    };

    /**
     * Get risk engine privileges
     */
    const fetchRiskEnginePrivileges = () =>
      http.fetch<EntityAnalyticsPrivileges>(RISK_ENGINE_PRIVILEGES_URL, {
        version: '1',
        method: 'GET',
      });

    /**
     * Get asset criticality privileges
     */
    const fetchAssetCriticalityPrivileges = () =>
      http.fetch<EntityAnalyticsPrivileges>(ASSET_CRITICALITY_INTERNAL_PRIVILEGES_URL, {
        version: '1',
        method: 'GET',
      });

    /**
     * Get Entity Store privileges
     */
    const fetchEntityStorePrivileges = () =>
      http.fetch<EntityAnalyticsPrivileges>(ENTITY_STORE_INTERNAL_PRIVILEGES_URL, {
        version: '1',
        method: 'GET',
      });

    /**
     * Get Entity Store v2 privileges
     */
    const fetchEntityStoreV2Privileges = () =>
      http.fetch<EntityAnalyticsPrivileges>(ENTITY_STORE_ROUTES.internal.CHECK_PRIVILEGES, {
        version: ENTITY_STORE_API_VERSIONS.internal.v2,
        method: 'GET',
      });

    /**
     * Search indices for privilege monitoring import
     */
    const searchPrivMonIndices = async (params: {
      query: string | undefined;
      signal?: AbortSignal;
    }) =>
      http.fetch<SearchPrivilegesIndicesResponse>(PRIVMON_INDICES_URL, {
        version: API_VERSIONS.public.v1,
        method: 'GET',
        query: {
          searchQuery: params.query,
        },
        signal: params.signal,
      });

    /**
     * Create an index for privilege monitoring import
     */
    const createPrivMonImportIndex = async (params: {
      name: string;
      mode: 'standard' | 'lookup';
      signal?: AbortSignal;
    }) =>
      http.fetch<CreatePrivilegesImportIndexResponse>(PRIVMON_INDICES_URL, {
        version: API_VERSIONS.public.v1,
        method: 'PUT',
        body: JSON.stringify({
          name: params.name,
          mode: params.mode,
        }),
        signal: params.signal,
      });
    /**
     * Register a data source for privilege monitoring engine
     */
    const registerPrivMonMonitoredIndices = async (indexPattern: string | undefined) =>
      http.fetch<CreateEntitySourceResponse>(MONITORING_ENTITY_SOURCE_URL, {
        version: API_VERSIONS.public.v1,
        method: 'POST',
        body: JSON.stringify({
          type: 'index',
          name: ENTITY_SOURCE_NAME,
          indexPattern,
        }),
      });

    /**
     * Update a data source for privilege monitoring engine
     */
    const updatePrivMonMonitoredIndices = async (id: string, indexPattern: string | undefined) =>
      http.fetch<UpdateEntitySourceResponse>(getPrivmonMonitoringSourceByIdUrl(id), {
        version: API_VERSIONS.public.v1,
        method: 'PUT',
        body: JSON.stringify({
          name: ENTITY_SOURCE_NAME,
          indexPattern,
        }),
      });

    /**
     * Create asset criticality
    /**
     *
     *
     * @param {(Pick<AssetCriticality, 'idField' | 'idValue' | 'criticalityLevel'> & {
     *         refresh?: 'wait_for';
     *       })} params
     * @return {*}  {Promise<AssetCriticalityRecord>}
     */
    const createAssetCriticality = async (
      params: Pick<AssetCriticality, 'idField' | 'idValue' | 'criticalityLevel'> & {
        refresh?: 'wait_for';
      }
    ): Promise<AssetCriticalityRecord> =>
      http.fetch<AssetCriticalityRecord>(ASSET_CRITICALITY_PUBLIC_URL, {
        version: API_VERSIONS.public.v1,
        method: 'POST',
        body: JSON.stringify({
          id_value: params.idValue,
          id_field: params.idField,
          criticality_level: params.criticalityLevel,
          refresh: params.refresh,
        }),
      });

    const deleteAssetCriticality = async (
      params: Pick<AssetCriticality, 'idField' | 'idValue'> & {
        refresh?: 'wait_for';
      }
    ): Promise<{ deleted: true }> => {
      await http.fetch(ASSET_CRITICALITY_PUBLIC_URL, {
        version: API_VERSIONS.public.v1,
        method: 'DELETE',
        query: {
          id_value: params.idValue,
          id_field: params.idField,
          refresh: params.refresh,
        },
      });

      // spoof a response to allow us to better distnguish a delete from a create in use_asset_criticality.ts
      return { deleted: true };
    };

    /**
     * Get asset criticality
     */
    const fetchAssetCriticality = async (
      params: Pick<AssetCriticality, 'idField' | 'idValue'>
    ): Promise<AssetCriticalityRecord> => {
      return http.fetch<AssetCriticalityRecord>(ASSET_CRITICALITY_PUBLIC_URL, {
        version: API_VERSIONS.public.v1,
        method: 'GET',
        query: { id_value: params.idValue, id_field: params.idField },
      });
    };

    /**
     * Get multiple asset criticality records
     */
    const fetchAssetCriticalityList = async (params: {
      idField: string;
      idValues: string[];
    }): Promise<FindAssetCriticalityRecordsResponse> => {
      const wrapWithQuotes = (each: string) => `"${each}"`;
      const kueryValues = `${params.idValues.map(wrapWithQuotes).join(' OR ')}`;
      const kuery = `${params.idField}: (${kueryValues})`;

      return http.fetch<FindAssetCriticalityRecordsResponse>(ASSET_CRITICALITY_PUBLIC_LIST_URL, {
        version: API_VERSIONS.public.v1,
        method: 'GET',
        query: {
          kuery,
        },
      });
    };

    const uploadAssetCriticalityFile = async (
      fileContent: string,
      fileName: string
    ): Promise<UploadAssetCriticalityRecordsResponse> => {
      const file = new File([new Blob([fileContent])], fileName, {
        type: 'text/csv',
      });
      const body = new FormData();
      body.append('file', file);

      if (isEntityAnalyticsEntityStoreV2Enabled) {
        const response = await http.fetch<InternalUploadAssetCriticalityV2CsvResponse>(
          ASSET_CRITICALITY_CSV_UPLOAD_V2_URL,
          {
            version: API_VERSIONS.internal.v1,
            method: 'POST',
            headers: {
              'Content-Type': undefined, // Lets the browser set the appropriate content type
            },
            body,
          }
        );

        return {
          errors: compact(
            response.items.map((item, ndx) => {
              if (item.error) {
                return {
                  index: ndx,
                  message: item.error,
                };
              }
              return null;
            })
          ),
          stats: {
            successful: response.successful,
            failed: response.failed,
            total: response.total,
          },
        };
      }

      return http.fetch<UploadAssetCriticalityRecordsResponse>(
        ASSET_CRITICALITY_PUBLIC_CSV_UPLOAD_URL,
        {
          version: API_VERSIONS.public.v1,
          method: 'POST',
          headers: {
            'Content-Type': undefined, // Lets the browser set the appropriate content type
          },
          body,
        }
      );
    };

    /**
     * List all data source for privilege monitoring engine
     */
    const listPrivMonMonitoredIndices = async ({ signal }: { signal?: AbortSignal }) =>
      http.fetch<ListEntitySourcesResponse>(MONITORING_ENTITY_LIST_SOURCES_URL, {
        version: API_VERSIONS.public.v1,
        method: 'GET',
        signal,
        query: {
          type: 'index',
          managed: false,
          name: ENTITY_SOURCE_NAME,
        },
      });

    const uploadPrivilegedUserMonitoringFile = async (
      fileContent: string,
      fileName: string
    ): Promise<PrivmonBulkUploadUsersCSVResponse> => {
      const file = new File([new Blob([fileContent])], fileName, {
        type: 'text/csv',
      });
      const body = new FormData();
      body.append('file', file);

      return http.fetch<PrivmonBulkUploadUsersCSVResponse>(MONITORING_USERS_CSV_UPLOAD_URL, {
        version: API_VERSIONS.public.v1,
        method: 'POST',
        headers: {
          'Content-Type': undefined, // Lets the browser set the appropriate content type
        },
        body,
      });
    };

    const initPrivilegedMonitoringEngine = (): Promise<InitMonitoringEngineResponse> =>
      http.fetch<InitMonitoringEngineResponse>(MONITORING_ENGINE_INIT_URL, {
        version: API_VERSIONS.public.v1,
        method: 'POST',
      });

    const fetchPrivilegeMonitoringEngineStatus = (): Promise<PrivMonHealthResponse> =>
      http.fetch<PrivMonHealthResponse>(PRIVMON_HEALTH_URL, {
        version: API_VERSIONS.public.v1,
        method: 'GET',
      });

    const fetchPrivilegeMonitoringPrivileges = (): Promise<PrivMonPrivilegesResponse> =>
      http.fetch<PrivMonPrivilegesResponse>(PRIVMON_PRIVILEGE_CHECK_API, {
        version: API_VERSIONS.public.v1,
        method: 'GET',
      });

    const fetchWatchlistsPrivileges = (): Promise<EntityAnalyticsPrivileges> =>
      http.fetch<EntityAnalyticsPrivileges>(WATCHLISTS_PRIVILEGES_URL, {
        version: API_VERSIONS.public.v1,
        method: 'GET',
      });

    /**
     * Fetches risk engine settings
     */
    const fetchRiskEngineSettings = () =>
      http.fetch<ReadRiskEngineSettingsResponse>(RISK_ENGINE_SETTINGS_URL, {
        version: '1',
        method: 'GET',
      });

    /**
     * Deletes Risk engine installation and associated data
     */

    const cleanUpRiskEngine = () =>
      http.fetch(RISK_ENGINE_CLEANUP_URL, {
        version: '1',
        method: 'DELETE',
      });

    const updateSavedObjectConfiguration = (
      params: ConfigureRiskEngineSavedObjectRequestBodyInput
    ) =>
      http.fetch(RISK_ENGINE_CONFIGURE_SO_URL, {
        version: API_VERSIONS.public.v1,
        method: 'PUT',
        body: JSON.stringify(params),
      });

    const fetchEntityDetailsHighlights = (
      params: {
        entityType: string;
        entityIdentifier: string;
        anonymizationFields: AnonymizationFieldResponse[];
        from: number;
        to: number;
        connectorId: string;
      },
      signal?: AbortSignal
    ): Promise<EntityDetailsHighlightsResponse> =>
      http.fetch(ENTITY_DETAILS_HIGHLIGHT_INTERNAL_URL, {
        version: API_VERSIONS.internal.v1,
        method: 'POST',
        body: JSON.stringify(params),
        signal,
      });

    /**
     * List all watchlists
     */
    const fetchWatchlists = async ({ signal }: { signal?: AbortSignal } = {}) =>
      http.fetch<ListWatchlistsResponse>(`${WATCHLISTS_URL}/list`, {
        version: API_VERSIONS.public.v1,
        method: 'GET',
        signal,
      });

    const getWatchlist = async (params: { id: string; signal?: AbortSignal }) =>
      http.fetch<GetWatchlistResponse>(`${WATCHLISTS_URL}/${params.id}`, {
        version: API_VERSIONS.public.v1,
        method: 'GET',
        signal: params.signal,
      });

    const createWatchlist = async (params: CreateWatchlistRequestBodyInput) =>
      http.fetch<CreateWatchlistResponse>(WATCHLISTS_URL, {
        version: API_VERSIONS.public.v1,
        method: 'POST',
        body: JSON.stringify(params),
      });

    const updateWatchlist = async (params: { id: string; body: UpdateWatchlistRequestBodyInput }) =>
      http.fetch<UpdateWatchlistResponse>(`${WATCHLISTS_URL}/${params.id}`, {
        version: API_VERSIONS.public.v1,
        method: 'PUT',
        body: JSON.stringify(params.body),
      });

    const deleteWatchlist = async (params: { id: string }) =>
      http.fetch<{ deleted: true }>(`${WATCHLISTS_URL}/${params.id}`, {
        version: API_VERSIONS.public.v1,
        method: 'DELETE',
      });

    const listWatchlistEntitySources = async (params: {
      watchlistId: string;
      signal?: AbortSignal;
    }) =>
      http.fetch<ListWatchlistEntitySourcesResponse>(
        `${WATCHLISTS_URL}/${params.watchlistId}/entity_source/list`,
        {
          version: API_VERSIONS.public.v1,
          method: 'GET',
          signal: params.signal,
        }
      );

    const updateWatchlistEntitySource = async (params: {
      watchlistId: string;
      entitySourceId: string;
      body: UpdateWatchlistEntitySourceRequestBodyInput;
    }) =>
      http.fetch<UpdateWatchlistEntitySourceResponse>(
        `${WATCHLISTS_URL}/${params.watchlistId}/entity_source/${params.entitySourceId}`,
        {
          version: API_VERSIONS.public.v1,
          method: 'PUT',
          body: JSON.stringify(params.body),
        }
      );

    const createWatchlistEntitySource = async (params: {
      watchlistId: string;
      body: CreateWatchlistEntitySourceRequestBodyInput;
    }) =>
      http.fetch<CreateWatchlistEntitySourceResponse>(
        `${WATCHLISTS_URL}/${params.watchlistId}/entity_source`,
        {
          version: API_VERSIONS.public.v1,
          method: 'POST',
          body: JSON.stringify(params.body),
        }
      );

    const deleteWatchlistEntitySource = async (params: {
      watchlistId: string;
      entitySourceId: string;
    }) =>
      http.fetch(`${WATCHLISTS_URL}/${params.watchlistId}/entity_source/${params.entitySourceId}`, {
        version: API_VERSIONS.public.v1,
        method: 'DELETE',
      });

    const searchWatchlistIndices = async (params: {
      query: string | undefined;
      signal?: AbortSignal;
    }) =>
      http.fetch<string[]>(WATCHLISTS_INDICES_URL, {
        version: API_VERSIONS.public.v1,
        method: 'GET',
        query: {
          searchQuery: params.query,
        },
        signal: params.signal,
      });

    const uploadWatchlistCsv = async (
      watchlistId: string,
      file: File
    ): Promise<UploadWatchlistCsvResponse> => {
      const body = new FormData();
      body.append('file', file);
      return http.fetch<UploadWatchlistCsvResponse>(
        WATCHLISTS_CSV_UPLOAD_URL.replace('{watchlist_id}', encodeURIComponent(watchlistId)),
        {
          version: API_VERSIONS.public.v1,
          method: 'POST',
          headers: {
            'Content-Type': undefined, // Lets the browser set the appropriate content type
          },
          body,
        }
      );
    };

    const fetchLeads = ({
      signal,
      params,
    }: {
      signal?: AbortSignal;
      params?: {
        page?: number;
        perPage?: number;
        sortField?: 'priority' | 'timestamp';
        sortOrder?: 'asc' | 'desc';
        status?: 'active' | 'dismissed' | 'expired';
      };
    }) =>
      http.fetch<FindLeadsResponse>(GET_LEADS_URL, {
        version: API_VERSIONS.internal.v1,
        method: 'GET',
        query: params,
        signal,
      });

    const fetchLeadGenerationStatus = ({ signal }: { signal?: AbortSignal }) =>
      http.fetch<LeadGenerationStatus>(LEAD_GENERATION_STATUS_URL, {
        version: API_VERSIONS.internal.v1,
        method: 'GET',
        signal,
      });

    const generateLeads = ({
      signal,
      params,
    }: {
      signal?: AbortSignal;
      params: { connectorId: string; maxLeads?: number };
    }) =>
      http.fetch<GenerateLeadsResponse>(GENERATE_LEADS_URL, {
        version: API_VERSIONS.internal.v1,
        method: 'POST',
        body: JSON.stringify(params),
        signal,
      });

    const dismissLead = ({ signal, id }: { signal?: AbortSignal; id: string }) =>
      http.fetch<void>(DISMISS_LEAD_URL.replace('{id}', id), {
        version: API_VERSIONS.internal.v1,
        method: 'POST',
        signal,
      });

    const bulkUpdateLeads = ({
      signal,
      params,
    }: {
      signal?: AbortSignal;
      params: { ids: string[]; status: 'active' | 'dismissed' | 'expired' };
    }) =>
      http.fetch<BulkUpdateLeadsResponse>(BULK_UPDATE_LEADS_URL, {
        version: API_VERSIONS.internal.v1,
        method: 'POST',
        body: JSON.stringify(params),
        signal,
      });

    const enableLeadGeneration = ({ connectorId }: { connectorId: string }) =>
      http.fetch<{ success: boolean }>(ENABLE_LEAD_GENERATION_URL, {
        version: API_VERSIONS.internal.v1,
        method: 'POST',
        body: JSON.stringify({ connectorId }),
      });

    const disableLeadGeneration = () =>
      http.fetch<{ success: boolean }>(DISABLE_LEAD_GENERATION_URL, {
        version: API_VERSIONS.internal.v1,
        method: 'POST',
      });

    const fetchLeadGenerationPrivileges = () =>
      http.fetch<EntityAnalyticsPrivileges>(LEAD_GENERATION_PRIVILEGES_URL, {
        version: API_VERSIONS.internal.v1,
        method: 'GET',
      });

    return {
      fetchRiskScorePreview,
      fetchRiskEngineStatus,
      initRiskEngine,
      enableRiskEngine,
      disableRiskEngine,
      scheduleNowRiskEngine,
      fetchRiskEnginePrivileges,
      fetchAssetCriticalityPrivileges,
      fetchEntityStorePrivileges,
      fetchEntityStoreV2Privileges,
      searchPrivMonIndices,
      createPrivMonImportIndex,
      createAssetCriticality,
      deleteAssetCriticality,
      fetchAssetCriticality,
      fetchAssetCriticalityList,
      uploadAssetCriticalityFile,
      uploadPrivilegedUserMonitoringFile,
      initPrivilegedMonitoringEngine,
      registerPrivMonMonitoredIndices,
      updatePrivMonMonitoredIndices,
      fetchPrivilegeMonitoringEngineStatus,
      fetchPrivilegeMonitoringPrivileges,
      fetchWatchlistsPrivileges,
      createWatchlist,
      getWatchlist,
      updateWatchlist,
      deleteWatchlist,
      listWatchlistEntitySources,
      updateWatchlistEntitySource,
      createWatchlistEntitySource,
      deleteWatchlistEntitySource,
      searchWatchlistIndices,
      uploadWatchlistCsv,
      fetchRiskEngineSettings,
      calculateEntityRiskScore,
      cleanUpRiskEngine,
      fetchEntitiesList,
      fetchEntitiesListV2,
      updateSavedObjectConfiguration,
      listPrivMonMonitoredIndices,
      fetchEntityDetailsHighlights,
      fetchWatchlists,
      fetchLeads,
      fetchLeadGenerationStatus,
      generateLeads,
      dismissLead,
      bulkUpdateLeads,
      enableLeadGeneration,
      disableLeadGeneration,
      fetchLeadGenerationPrivileges,
    };
  }, [http, isEntityAnalyticsEntityStoreV2Enabled, isMaintainerRiskScoreV2Enabled]);
};

export type AssetCriticality = SnakeToCamelCase<AssetCriticalityRecord>;

// CamelCased mirror of `ListEntitiesRequestQuery` for ergonomic UI usage.
// Hand-written instead of derived via `SnakeToCamelCase` because that utility
// requires a type literal, while lint requires the source to be an interface.
export interface FetchEntitiesListParams {
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  perPage?: number;
  filterQuery?: string;
  entityTypes: EntityType[];
}
