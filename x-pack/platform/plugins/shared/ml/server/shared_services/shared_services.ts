/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SpacesPluginStart } from '@kbn/spaces-plugin/server';
import type { CloudSetup } from '@kbn/cloud-plugin/server';
import type { PluginStart as DataViewsPluginStart } from '@kbn/data-views-plugin/server';
import type { SecurityPluginSetup } from '@kbn/security-plugin/server';
import type { FieldFormatsStart } from '@kbn/field-formats-plugin/server';
import { isCoreKibanaRequest } from '@kbn/core-http-server-utils';
import type { KibanaRequest } from '@kbn/core-http-server';
import type { SavedObjectsClientContract } from '@kbn/core-saved-objects-api-server';
import type { IClusterClient, IScopedClusterClient } from '@kbn/core-elasticsearch-server';
import type { UiSettingsServiceStart } from '@kbn/core-ui-settings-server';
import type { CoreAuditService } from '@kbn/core-security-server';
import type { ResolveMlCapabilities, MlCapabilitiesKey } from '@kbn/ml-common-types/capabilities';
import type { FieldFormatsRegistryProvider } from '@kbn/ml-common-types/kibana';
import type { CompatibleModule, MlFeatures } from '../../common/constants/app';
import type { MlLicense } from '../../common/license';

import { licenseChecks } from './license_checks';
import type {
  MlSystemProvider,
  JobServiceProvider,
  ResultsServiceProvider,
  TrainedModelsProvider,
  AnomalyDetectorsProvider,
  ModulesProvider,
} from './providers';

import {
  getMlSystemProvider,
  getJobServiceProvider,
  getModulesProvider,
  getResultsServiceProvider,
  getTrainedModelsProvider,
  getAnomalyDetectorsProvider,
} from './providers';

import type { HasMlCapabilities } from '../lib/capabilities';
import { hasMlCapabilitiesProvider } from '../lib/capabilities';
import {
  MLClusterClientUninitialized,
  MLFieldFormatRegistryUninitialized,
  MLUISettingsClientUninitialized,
} from './errors';
import type { MlClient } from '../lib/ml_client';
import { getMlClient, MlAuditLogger } from '../lib/ml_client';
import type { MLSavedObjectService } from '../saved_objects';
import { mlSavedObjectServiceFactory } from '../saved_objects';
import type { MlAlertingServiceProvider } from './providers/alerting_service';
import { getAlertingServiceProvider } from './providers/alerting_service';
import type { JobsHealthServiceProvider } from '../lib/alerts/jobs_health_service';
import { getJobsHealthServiceProvider } from '../lib/alerts/jobs_health_service';
import type { GetDataViewsService } from '../lib/data_views_utils';
import { getDataViewsServiceFactory } from '../lib/data_views_utils';
import type { ServerlessInfo } from '../types';

export type SharedServices = JobServiceProvider &
  AnomalyDetectorsProvider &
  MlSystemProvider &
  ModulesProvider &
  ResultsServiceProvider &
  MlAlertingServiceProvider &
  TrainedModelsProvider;

export type MlServicesProviders = JobsHealthServiceProvider;

interface Guards {
  isMinimumLicense(): Guards;

  isFullLicense(): Guards;

  hasMlCapabilities: (caps: MlCapabilitiesKey[]) => Guards;

  ok(callback: OkCallback): any;
}

export type GetGuards = (
  request: KibanaRequest,
  savedObjectsClient: SavedObjectsClientContract
) => Guards;

export interface SharedServicesChecks {
  getGuards(request: KibanaRequest): Guards;
}

interface OkParams {
  scopedClient: IScopedClusterClient;
  mlClient: MlClient;
  mlSavedObjectService: MLSavedObjectService;
  getFieldsFormatRegistry: FieldFormatsRegistryProvider;
  getDataViewsService: GetDataViewsService;
}

type OkCallback = (okParams: OkParams) => any;

export function createSharedServices(
  mlLicense: MlLicense,
  getSpaces: (() => Promise<SpacesPluginStart>) | undefined,
  cloud: CloudSetup,
  authorization: SecurityPluginSetup['authz'] | undefined,
  resolveMlCapabilities: ResolveMlCapabilities,
  getClusterClient: () => IClusterClient | null,
  getInternalSavedObjectsClient: () => SavedObjectsClientContract | null,
  getUiSettings: () => UiSettingsServiceStart | null,
  getFieldsFormat: () => FieldFormatsStart | null,
  getDataViews: () => DataViewsPluginStart,
  getAuditService: () => CoreAuditService | null,
  isMlReady: () => Promise<void>,
  compatibleModuleType: CompatibleModule | null,
  enabledFeatures: MlFeatures,
  serverless: ServerlessInfo
): {
  sharedServicesProviders: SharedServices;
  internalServicesProviders: MlServicesProviders;
} {
  const { isFullLicense, isMinimumLicense } = licenseChecks(mlLicense);

  function getGuards(
    request: KibanaRequest,
    savedObjectsClient: SavedObjectsClientContract
  ): Guards {
    const internalSavedObjectsClient = getInternalSavedObjectsClient();

    if (internalSavedObjectsClient === null) {
      throw new Error('Internal saved object client not initialized');
    }
    const getRequestItems = getRequestItemsProvider(
      resolveMlCapabilities,
      getClusterClient,
      savedObjectsClient,
      internalSavedObjectsClient,
      authorization,
      getSpaces !== undefined,
      isMlReady,
      getUiSettings,
      getFieldsFormat,
      getDataViews,
      getAuditService,
      mlLicense,
      serverless
    );

    const {
      hasMlCapabilities,
      scopedClient,
      mlClient,
      mlSavedObjectService,
      getFieldsFormatRegistry,
      getDataViewsService,
    } = getRequestItems(request);
    const asyncGuards: Array<Promise<void>> = [];

    const guards: Guards = {
      isMinimumLicense: () => {
        isMinimumLicense();
        return guards;
      },
      isFullLicense: () => {
        isFullLicense();
        return guards;
      },
      hasMlCapabilities: (caps: MlCapabilitiesKey[]) => {
        asyncGuards.push(hasMlCapabilities(caps));
        return guards;
      },
      async ok(callback: OkCallback) {
        await Promise.all(asyncGuards);
        return callback({
          scopedClient,
          mlClient,
          mlSavedObjectService,
          getFieldsFormatRegistry,
          getDataViewsService,
        });
      },
    };
    return guards;
  }

  return {
    /**
     * Exposed providers for shared services used by other plugins
     */
    sharedServicesProviders: {
      ...getJobServiceProvider(getGuards, serverless),
      ...getAnomalyDetectorsProvider(getGuards),
      ...getModulesProvider(getGuards, getDataViews, compatibleModuleType, serverless),
      ...getResultsServiceProvider(getGuards),
      ...getMlSystemProvider(getGuards, mlLicense, getSpaces, cloud, resolveMlCapabilities),
      ...getAlertingServiceProvider(getGuards),
      ...getTrainedModelsProvider(getGuards, cloud, enabledFeatures),
    },
    /**
     * Services providers for ML internal usage
     */
    internalServicesProviders: {
      ...getJobsHealthServiceProvider(getGuards, serverless),
    },
  };
}

function getRequestItemsProvider(
  resolveMlCapabilities: ResolveMlCapabilities,
  getClusterClient: () => IClusterClient | null,
  savedObjectsClient: SavedObjectsClientContract,
  internalSavedObjectsClient: SavedObjectsClientContract,
  authorization: SecurityPluginSetup['authz'] | undefined,
  spaceEnabled: boolean,
  isMlReady: () => Promise<void>,
  getUiSettings: () => UiSettingsServiceStart | null,
  getFieldsFormat: () => FieldFormatsStart | null,
  getDataViews: () => DataViewsPluginStart,
  getAuditService: () => CoreAuditService | null,
  mlLicense: MlLicense,
  serverless: ServerlessInfo
) {
  return (request: KibanaRequest) => {
    let hasMlCapabilities: HasMlCapabilities = hasMlCapabilitiesProvider(
      resolveMlCapabilities,
      request
    );
    let scopedClient: IScopedClusterClient;
    let mlClient: MlClient;
    // While https://github.com/elastic/kibana/issues/64588 exists we
    // will not receive a real request object when being called from an alert.
    // instead a dummy request object will be supplied
    const clusterClient = getClusterClient();
    const getSobSavedObjectService = (client: IScopedClusterClient) => {
      return mlSavedObjectServiceFactory(
        savedObjectsClient,
        internalSavedObjectsClient,
        spaceEnabled,
        authorization,
        client,
        isMlReady
      );
    };

    if (clusterClient === null) {
      throw new MLClusterClientUninitialized(`ML's cluster client has not been initialized`);
    }

    const auditService = getAuditService();
    if (!auditService) {
      throw new Error('Audit service not initialized');
    }

    const uiSettingsClient = getUiSettings()?.asScopedToClient(savedObjectsClient);
    if (!uiSettingsClient) {
      throw new MLUISettingsClientUninitialized(`ML's UI settings client has not been initialized`);
    }

    const getFieldsFormatRegistry = async () => {
      let fieldFormatRegistry;
      try {
        fieldFormatRegistry = await getFieldsFormat()!.fieldFormatServiceFactory(uiSettingsClient!);
      } catch (e) {
        // throw an custom error during the fieldFormatRegistry check
      }

      if (!fieldFormatRegistry) {
        throw new MLFieldFormatRegistryUninitialized(
          `ML's field format registry has not been initialized`
        );
      }

      return fieldFormatRegistry;
    };

    let mlSavedObjectService;
    if (isCoreKibanaRequest(request)) {
      scopedClient = clusterClient.asScoped(request);
      mlSavedObjectService = getSobSavedObjectService(scopedClient);
      const auditLogger = new MlAuditLogger(auditService, request);
      mlClient = getMlClient(
        scopedClient,
        mlSavedObjectService,
        auditLogger,
        mlLicense,
        serverless
      );
    } else {
      hasMlCapabilities = () => Promise.resolve();
      const { asInternalUser } = clusterClient;
      scopedClient = {
        asInternalUser,
        asCurrentUser: asInternalUser,
        asSecondaryAuthUser: asInternalUser,
      };
      mlSavedObjectService = getSobSavedObjectService(scopedClient);
      const auditLogger = new MlAuditLogger(auditService);
      mlClient = getMlClient(
        scopedClient,
        mlSavedObjectService,
        auditLogger,
        mlLicense,
        serverless
      );
    }

    const getDataViewsService = getDataViewsServiceFactory(
      getDataViews,
      savedObjectsClient,
      scopedClient,
      request
    );

    return {
      hasMlCapabilities,
      scopedClient,
      mlClient,
      mlSavedObjectService,
      getFieldsFormatRegistry,
      getDataViewsService,
    };
  };
}
