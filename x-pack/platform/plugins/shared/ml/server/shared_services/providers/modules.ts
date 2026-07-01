/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest, SavedObjectsClientContract } from '@kbn/core/server';
import type { TypeOf } from '@kbn/config-schema';
import type { PluginStart as DataViewsPluginStart } from '@kbn/data-views-plugin/server';
import type { CompatibleModule } from '../../../common/constants/app';
import type { GetGuards } from '../shared_services';
import type { DataRecognizer } from '../../models/data_recognizer';
import { dataRecognizerFactory } from '../../models/data_recognizer';
import type { moduleIdParamSchema, setupModuleBodySchema } from '../../routes/schemas/modules';
import type { ServerlessInfo } from '../../types';

export type ModuleSetupPayload = TypeOf<typeof moduleIdParamSchema> &
  TypeOf<typeof setupModuleBodySchema>;

export interface ModulesProvider {
  modulesProvider(
    request: KibanaRequest,
    savedObjectsClient: SavedObjectsClientContract
  ): {
    recognize: DataRecognizer['findMatches'];
    getModule: DataRecognizer['getModule'];
    listModules: DataRecognizer['listModules'];
    setup(payload: ModuleSetupPayload): ReturnType<DataRecognizer['setup']>;
  };
}

export function getModulesProvider(
  getGuards: GetGuards,
  getDataViews: () => DataViewsPluginStart,
  compatibleModuleType: CompatibleModule | null,
  serverless: ServerlessInfo
): ModulesProvider {
  return {
    modulesProvider(request: KibanaRequest, savedObjectsClient: SavedObjectsClientContract) {
      const guards = getGuards(request, savedObjectsClient);
      return {
        async recognize(...args) {
          return await guards
            .isFullLicense()
            .hasMlCapabilities(['canGetJobs'])
            .ok(async ({ scopedClient, mlClient, mlSavedObjectService, getDataViewsService }) => {
              const dataViewsService = await getDataViewsService();
              const dr = dataRecognizerFactory(
                scopedClient,
                mlClient,
                savedObjectsClient,
                dataViewsService,
                mlSavedObjectService,
                request,
                compatibleModuleType,
                serverless
              );
              return dr.findMatches(...args);
            });
        },
        async getModule(...args) {
          return await guards
            .isFullLicense()
            .hasMlCapabilities(['canGetJobs'])
            .ok(async ({ scopedClient, mlClient, mlSavedObjectService, getDataViewsService }) => {
              const dataViewsService = await getDataViewsService();
              const dr = dataRecognizerFactory(
                scopedClient,
                mlClient,
                savedObjectsClient,
                dataViewsService,
                mlSavedObjectService,
                request,
                compatibleModuleType,
                serverless
              );
              return dr.getModule(...args);
            });
        },
        async listModules() {
          return await guards
            .isFullLicense()
            .hasMlCapabilities(['canGetJobs'])
            .ok(async ({ scopedClient, mlClient, mlSavedObjectService, getDataViewsService }) => {
              const dataViewsService = await getDataViewsService();
              const dr = dataRecognizerFactory(
                scopedClient,
                mlClient,
                savedObjectsClient,
                dataViewsService,
                mlSavedObjectService,
                request,
                compatibleModuleType,
                serverless
              );
              return dr.listModules();
            });
        },
        async setup(payload: ModuleSetupPayload) {
          return await guards
            .isFullLicense()
            .hasMlCapabilities(['canCreateJob'])
            .ok(async ({ scopedClient, mlClient, mlSavedObjectService, getDataViewsService }) => {
              const dataViewsService = await getDataViewsService();
              const dr = dataRecognizerFactory(
                scopedClient,
                mlClient,
                savedObjectsClient,
                dataViewsService,
                mlSavedObjectService,
                request,
                compatibleModuleType,
                serverless
              );
              return dr.setup(
                payload.moduleId,
                payload.prefix,
                payload.groups,
                payload.indexPatternName,
                payload.query,
                payload.useDedicatedIndex,
                payload.startDatafeed,
                payload.start,
                payload.end,
                payload.jobOverrides,
                payload.datafeedOverrides,
                payload.estimateModelMemory,
                payload.applyToAllSpaces
              );
            });
        },
      };
    },
  };
}
