/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  KibanaRequest,
  SavedObjectsClientContract,
  IScopedClusterClient,
  CoreAuditService,
} from '@kbn/core/server';
import type { SecurityPluginSetup } from '@kbn/security-plugin/server';
import type { PluginStart as DataViewsPluginStart } from '@kbn/data-views-plugin/server';
import type { MlLicense } from '../../common/license';
import type { CompatibleModule } from '../../common/constants/app';
import type { ServerlessInfo } from '../types';
import type { MlClient } from '../lib/ml_client';
import { getMlClient } from '../lib/ml_client';
import { MlAuditLogger } from '../lib/ml_client/ml_audit_logger';
import { mlSavedObjectServiceFactory } from '../saved_objects/service';
import type { DataRecognizer } from '../models/data_recognizer/data_recognizer';
import { dataRecognizerFactory } from '../models/data_recognizer/data_recognizer';
import { getDataViewsServiceFactory } from '../lib/data_views_utils';

export interface MlClientFactoryDeps {
  getInternalSavedObjectsClient: () => SavedObjectsClientContract | null;
  getAuditService: () => CoreAuditService | null;
  spacesEnabled: boolean;
  authorization?: SecurityPluginSetup['authz'];
  mlLicense: MlLicense;
  serverless: ServerlessInfo;
  isMlReady: () => Promise<void>;
  /** Optional — required for recognize_modules / get_module operations. */
  getDataViews?: () => DataViewsPluginStart | null;
  /** Optional — filters modules by solution type when provided. */
  compatibleModuleType?: CompatibleModule | null;
}

export type BuildMlClientFn = (
  esClient: IScopedClusterClient,
  savedObjectsClient: SavedObjectsClientContract,
  request: KibanaRequest
) => MlClient | null;

export type BuildDataRecognizerFn = (
  esClient: IScopedClusterClient,
  savedObjectsClient: SavedObjectsClientContract,
  request: KibanaRequest
) => Promise<DataRecognizer | null>;

/**
 * Returns a per-request MlClient factory that can be called from inside a tool handler.
 * This ensures ML writes (putJob, putDatafeed) create the ML saved objects that make
 * jobs visible in the ML UI and space-scoped, matching what RouteGuard provides to routes.
 */
export function createMlClientFactory(deps: MlClientFactoryDeps): BuildMlClientFn {
  return function buildMlClient(
    esClient: IScopedClusterClient,
    savedObjectsClient: SavedObjectsClientContract,
    request: KibanaRequest
  ): MlClient | null {
    const internalSavedObjectsClient = deps.getInternalSavedObjectsClient();
    if (internalSavedObjectsClient === null) {
      return null;
    }

    const mlSavedObjectService = mlSavedObjectServiceFactory(
      savedObjectsClient,
      internalSavedObjectsClient,
      deps.spacesEnabled,
      deps.authorization,
      esClient,
      deps.isMlReady
    );

    const auditService = deps.getAuditService();
    if (auditService === null) {
      // audit service is assigned in plugin start(); it is always non-null at request time
      return null;
    }
    const auditLogger = new MlAuditLogger(auditService, request);

    return getMlClient(
      esClient,
      mlSavedObjectService,
      auditLogger,
      deps.mlLicense,
      deps.serverless
    );
  };
}

/**
 * Returns a per-request DataRecognizer factory for module recognition operations.
 * Returns undefined if getDataViews was not provided in deps.
 */
export function createDataRecognizerFactory(
  deps: MlClientFactoryDeps
): BuildDataRecognizerFn | undefined {
  if (!deps.getDataViews) return undefined;

  return async function buildDataRecognizer(
    esClient: IScopedClusterClient,
    savedObjectsClient: SavedObjectsClientContract,
    request: KibanaRequest
  ): Promise<DataRecognizer | null> {
    const internalSavedObjectsClient = deps.getInternalSavedObjectsClient();
    if (internalSavedObjectsClient === null) return null;

    const mlSavedObjectService = mlSavedObjectServiceFactory(
      savedObjectsClient,
      internalSavedObjectsClient,
      deps.spacesEnabled,
      deps.authorization,
      esClient,
      deps.isMlReady
    );

    const auditService = deps.getAuditService();
    if (auditService === null) return null;
    const auditLogger = new MlAuditLogger(auditService, request);
    const mlClient = getMlClient(
      esClient,
      mlSavedObjectService,
      auditLogger,
      deps.mlLicense,
      deps.serverless
    );

    const getDataViewsService = getDataViewsServiceFactory(
      deps.getDataViews!,
      savedObjectsClient,
      esClient,
      request
    );

    let dataViewsService;
    try {
      dataViewsService = await getDataViewsService();
    } catch {
      return null;
    }

    return dataRecognizerFactory(
      esClient,
      mlClient,
      savedObjectsClient,
      dataViewsService,
      mlSavedObjectService,
      request,
      deps.compatibleModuleType ?? null,
      deps.serverless
    );
  };
}
