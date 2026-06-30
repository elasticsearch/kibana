/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EsClient, KbnClient, ScoutLogger, ScoutParallelWorkerFixtures } from '@kbn/scout';
import { measurePerformanceAsync } from '@kbn/scout';
import type {
  RiskEngineStatusResponse,
  GetEntityStoreStatusResponse,
  StoreStatus,
} from '../../../constants/entity_analytics';

const ENTITY_STORE_V2_INSTALL_URL = '/api/security/entity_store/install';
const ENTITY_STORE_V2_UNINSTALL_URL = '/api/security/entity_store/uninstall';
const ENTITY_STORE_ENGINES_URL = '/api/entity_store/engines';
const ENTITY_STORE_STATUS_URL = '/api/entity_store/status';
const ENTITY_STORE_V2_STATUS_URL = '/api/security/entity_store/status';
const SAVED_OBJECTS_FIND_URL = '/api/saved_objects/_find';
const RISK_ENGINE_CONFIGURATION_TYPE = 'risk-engine-configuration';
const RISK_ENGINE_STATUS_URL = '/internal/risk_score/engine/status';
const RISK_ENGINE_INIT_URL = '/internal/risk_score/engine/init';

const API_VERSIONS = {
  public: {
    v1: '2023-10-31',
  },
  internal: {
    v1: '1',
  },
};

export interface EntityAnalyticsApiService {
  installEntityStoreV2: (entityTypes?: string[]) => Promise<void>;
  uninstallEntityStoreV2: (entityTypes?: string[]) => Promise<void>;
  indexEntityStoreEntry: (entityId: string, hostName: string) => Promise<void>;
  deleteEntityStoreEngines: () => Promise<void>;
  deleteRiskEngineConfiguration: () => Promise<void>;
  initRiskEngine: () => Promise<void>;
  getRiskEngineStatus: () => Promise<RiskEngineStatusResponse>;
  getEntityStoreStatus: () => Promise<GetEntityStoreStatusResponse>;
  getEntityStoreStatusV2: () => Promise<GetEntityStoreStatusResponse>;
  waitForEntityStoreStatus: (
    expectedStatus: StoreStatus,
    timeoutMs?: number
  ) => Promise<GetEntityStoreStatusResponse>;
  waitForEntityStoreStatusV2: (
    expectedStatus: StoreStatus,
    timeoutMs?: number
  ) => Promise<GetEntityStoreStatusResponse>;
  waitForEntityStoreStatusToChange: (timeoutMs?: number) => Promise<GetEntityStoreStatusResponse>;
  waitForEntityStoreCleanup: (timeoutMs?: number) => Promise<GetEntityStoreStatusResponse>;
  waitForRiskEngineCleanup: (timeoutMs?: number) => Promise<RiskEngineStatusResponse>;
}

export const getEntityAnalyticsApiService = ({
  kbnClient,
  log,
  scoutSpace,
  esClient,
}: {
  kbnClient: KbnClient;
  log: ScoutLogger;
  scoutSpace?: ScoutParallelWorkerFixtures['scoutSpace'];
  esClient?: EsClient;
}): EntityAnalyticsApiService => {
  const spaceId = scoutSpace?.id ?? 'default';
  const basePath = spaceId !== 'default' ? `/s/${spaceId}` : '';

  const service: EntityAnalyticsApiService = {
    installEntityStoreV2: async (entityTypes: string[] = ['host', 'user']) => {
      await measurePerformanceAsync(
        log,
        'security.entityAnalytics.installEntityStore',
        async () => {
          const current = await service.getEntityStoreStatusV2();
          if (current.status === 'running') {
            return;
          }

          // The entity store requires the security-solution data view to exist in the space.
          // Create it only if it doesn't already exist.
          const dataViewId = `security-solution-${spaceId}`;
          const existingDataView = await kbnClient.request<{ data_view?: unknown }>({
            method: 'GET',
            path: `${basePath}/api/data_views/data_view/${dataViewId}`,
            headers: { 'elastic-api-version': API_VERSIONS.public.v1 },
            ignoreErrors: [404],
          });
          if (!existingDataView?.data?.data_view) {
            await kbnClient.request({
              method: 'POST',
              path: `${basePath}/api/data_views/data_view`,
              headers: { 'elastic-api-version': API_VERSIONS.public.v1 },
              body: {
                data_view: {
                  id: dataViewId,
                  name: dataViewId,
                  title: 'logs-*',
                  timeFieldName: '@timestamp',
                },
              },
            });
          }
          await kbnClient.request({
            method: 'POST',
            path: `${basePath}${ENTITY_STORE_V2_INSTALL_URL}`,
            headers: {
              'elastic-api-version': API_VERSIONS.public.v1,
            },
            body: { entityTypes },
          });
          await service.waitForEntityStoreStatusV2('running');
        }
      );
    },

    uninstallEntityStoreV2: async (entityTypes: string[] = ['host', 'user']) => {
      await measurePerformanceAsync(
        log,
        'security.entityAnalytics.uninstallEntityStoreV2',
        async () => {
          await kbnClient.request({
            method: 'POST',
            path: `${basePath}${ENTITY_STORE_V2_UNINSTALL_URL}`,
            headers: { 'elastic-api-version': API_VERSIONS.public.v1 },
            body: { entityTypes },
            ignoreErrors: [404],
          });
          await service.waitForEntityStoreStatusV2('not_installed');
        }
      );
    },

    indexEntityStoreEntry: async (entityId: string, hostName: string) => {
      if (!esClient) {
        throw new Error('esClient is required to index entity store entries');
      }
      await measurePerformanceAsync(
        log,
        'security.entityAnalytics.indexEntityStoreEntry',
        async () => {
          const alias = `entities-latest-${spaceId}`;
          await esClient.index({
            index: alias,
            document: {
              '@timestamp': new Date().toISOString(),
              entity: { id: entityId, EngineMetadata: { Type: 'host' } },
              host: { name: hostName },
            },
            refresh: true,
          });
        }
      );
    },

    deleteEntityStoreEngines: async () => {
      await measurePerformanceAsync(
        log,
        'security.entityAnalytics.deleteEntityStoreEngines',
        async () => {
          await kbnClient.request({
            method: 'DELETE',
            path: `${basePath}${ENTITY_STORE_ENGINES_URL}`,
            query: {
              delete_data: 'true',
            },
            ignoreErrors: [404, 500],
          });
          // Wait for cleanup to complete - ensure server state is fully cleaned up
          await service.waitForEntityStoreCleanup();
        }
      );
    },

    deleteRiskEngineConfiguration: async () => {
      await measurePerformanceAsync(
        log,
        'security.entityAnalytics.deleteRiskEngineConfiguration',
        async () => {
          const findResponse = await kbnClient.request<{
            saved_objects?: Array<{ id: string }>;
          }>({
            method: 'GET',
            path: `${basePath}${SAVED_OBJECTS_FIND_URL}`,
            query: {
              type: RISK_ENGINE_CONFIGURATION_TYPE,
            },
            ignoreErrors: [404],
          });

          const savedObjectId = findResponse?.data?.saved_objects?.[0]?.id;
          if (savedObjectId) {
            await kbnClient.request({
              method: 'DELETE',
              path: `${basePath}/api/saved_objects/${RISK_ENGINE_CONFIGURATION_TYPE}/${savedObjectId}`,
              ignoreErrors: [404],
            });
            // Wait for cleanup to complete - ensure server state is fully cleaned up
            await service.waitForRiskEngineCleanup();
          } else {
            // No saved object to delete, check if already cleaned up
            const status = await service.getRiskEngineStatus();
            if (status.risk_engine_status !== 'NOT_INSTALLED') {
              // Status is not clean, wait for it to become clean (might be in transition)
              await service.waitForRiskEngineCleanup();
            }
          }
        }
      );
    },

    initRiskEngine: async () => {
      await measurePerformanceAsync(log, 'security.entityAnalytics.initRiskEngine', async () => {
        await kbnClient.request({
          method: 'POST',
          path: `${basePath}${RISK_ENGINE_INIT_URL}`,
          headers: {
            'elastic-api-version': API_VERSIONS.internal.v1,
          },
          body: {},
        });
      });
    },

    getRiskEngineStatus: async () => {
      return measurePerformanceAsync(
        log,
        'security.entityAnalytics.getRiskEngineStatus',
        async () => {
          const response = await kbnClient.request<RiskEngineStatusResponse>({
            method: 'GET',
            path: `${basePath}${RISK_ENGINE_STATUS_URL}`,
            headers: {
              'elastic-api-version': API_VERSIONS.internal.v1,
            },
          });
          return response.data;
        }
      );
    },

    getEntityStoreStatus: async () => {
      return measurePerformanceAsync(
        log,
        'security.entityAnalytics.getEntityStoreStatus',
        async () => {
          const response = await kbnClient.request<GetEntityStoreStatusResponse>({
            method: 'GET',
            path: `${basePath}${ENTITY_STORE_STATUS_URL}`,
            headers: {
              'elastic-api-version': API_VERSIONS.public.v1,
            },
          });
          return response.data;
        }
      );
    },

    getEntityStoreStatusV2: async () => {
      return measurePerformanceAsync(
        log,
        'security.entityAnalytics.getEntityStoreStatusV2',
        async () => {
          const response = await kbnClient.request<GetEntityStoreStatusResponse>({
            method: 'GET',
            path: `${basePath}${ENTITY_STORE_V2_STATUS_URL}`,
            headers: {
              'elastic-api-version': API_VERSIONS.public.v1,
            },
          });
          return response.data;
        }
      );
    },

    waitForEntityStoreStatus: async (expectedStatus: StoreStatus, timeoutMs: number = 60000) => {
      return measurePerformanceAsync(
        log,
        `security.entityAnalytics.waitForEntityStoreStatus [${expectedStatus}]`,
        async () => {
          const startTime = Date.now();
          let lastStatus: GetEntityStoreStatusResponse | undefined;

          while (Date.now() - startTime < timeoutMs) {
            try {
              const status = await service.getEntityStoreStatus();
              lastStatus = status;

              if (status.status === expectedStatus) {
                return status;
              }
            } catch (error) {
              log.debug(`Error checking entity store status: ${error}`);
            }

            await new Promise((resolve) => setTimeout(resolve, 1000));
          }

          throw new Error(
            `Timeout waiting for entity store status '${expectedStatus}' after ${timeoutMs}ms. Last status: ${JSON.stringify(
              lastStatus
            )}`
          );
        }
      );
    },

    waitForEntityStoreStatusV2: async (expectedStatus: StoreStatus, timeoutMs: number = 60000) => {
      return measurePerformanceAsync(
        log,
        `security.entityAnalytics.waitForEntityStoreStatusV2 [${expectedStatus}]`,
        async () => {
          const startTime = Date.now();
          let lastStatus: GetEntityStoreStatusResponse | undefined;

          while (Date.now() - startTime < timeoutMs) {
            try {
              const status = await service.getEntityStoreStatusV2();
              lastStatus = status;

              if (status.status === expectedStatus) {
                return status;
              }
            } catch (error) {
              log.debug(`Error checking entity store status: ${error}`);
            }

            await new Promise((resolve) => setTimeout(resolve, 1000));
          }

          throw new Error(
            `Timeout waiting for entity store status '${expectedStatus}' after ${timeoutMs}ms. Last status: ${JSON.stringify(
              lastStatus
            )}`
          );
        }
      );
    },

    waitForEntityStoreStatusToChange: async (timeoutMs: number = 60000) => {
      return measurePerformanceAsync(
        log,
        'security.entityAnalytics.waitForEntityStoreStatusToChange',
        async () => {
          const startTime = Date.now();
          let lastStatus: GetEntityStoreStatusResponse | undefined;

          while (Date.now() - startTime < timeoutMs) {
            try {
              const status = await service.getEntityStoreStatus();
              lastStatus = status;

              // Wait for status to change from 'not_installed' to any other state
              // This confirms the backend has processed the enable request
              if (status.status !== 'not_installed') {
                return status;
              }
            } catch (error) {
              log.debug(`Error checking entity store status: ${error}`);
            }

            await new Promise((resolve) => setTimeout(resolve, 1000));
          }

          throw new Error(
            `Timeout waiting for entity store status to change from 'not_installed' after ${timeoutMs}ms. Last status: ${JSON.stringify(
              lastStatus
            )}`
          );
        }
      );
    },

    waitForEntityStoreCleanup: async (timeoutMs: number = 60000) => {
      return measurePerformanceAsync(
        log,
        'security.entityAnalytics.waitForEntityStoreCleanup',
        async () => {
          // Check status first - if already clean, return immediately
          try {
            const currentStatus = await service.getEntityStoreStatus();
            if (currentStatus.status === 'not_installed') {
              return currentStatus;
            }
          } catch (error) {
            log.debug(`Error checking initial entity store status: ${error}`);
          }

          // Status is not clean, wait for cleanup to complete
          const startTime = Date.now();
          let lastStatus: GetEntityStoreStatusResponse | undefined;

          while (Date.now() - startTime < timeoutMs) {
            try {
              const status = await service.getEntityStoreStatus();
              lastStatus = status;

              // Wait for status to be 'not_installed' - confirms cleanup is complete
              if (status.status === 'not_installed') {
                return status;
              }
            } catch (error) {
              log.debug(`Error checking entity store status during cleanup: ${error}`);
            }

            await new Promise((resolve) => setTimeout(resolve, 1000));
          }

          throw new Error(
            `Timeout waiting for entity store cleanup (status 'not_installed') after ${timeoutMs}ms. Last status: ${JSON.stringify(
              lastStatus
            )}`
          );
        }
      );
    },

    waitForRiskEngineCleanup: async (timeoutMs: number = 60000) => {
      return measurePerformanceAsync(
        log,
        'security.entityAnalytics.waitForRiskEngineCleanup',
        async () => {
          const startTime = Date.now();
          let lastStatus: RiskEngineStatusResponse | undefined;

          while (Date.now() - startTime < timeoutMs) {
            try {
              const status = await service.getRiskEngineStatus();
              lastStatus = status;

              // Wait for status to be 'NOT_INSTALLED' - confirms cleanup is complete
              if (status.risk_engine_status === 'NOT_INSTALLED') {
                return status;
              }
            } catch (error) {
              log.debug(`Error checking risk engine status during cleanup: ${error}`);
            }

            await new Promise((resolve) => setTimeout(resolve, 1000));
          }

          throw new Error(
            `Timeout waiting for risk engine cleanup (status 'NOT_INSTALLED') after ${timeoutMs}ms. Last status: ${JSON.stringify(
              lastStatus
            )}`
          );
        }
      );
    },
  };

  return service;
};
