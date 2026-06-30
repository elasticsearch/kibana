/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { IClusterClient } from '@kbn/core-elasticsearch-server';
import type {
  FakeRawRequest,
  Headers,
  HttpServiceSetup,
  KibanaRequest,
} from '@kbn/core-http-server';
import type { CoreSetup } from '@kbn/core-lifecycle-server';
import type { PluginInitializerContext } from '@kbn/core-plugins-server';
import type { SavedObjectsClientContract } from '@kbn/core-saved-objects-api-server';
import type { SavedObjectsServiceStart } from '@kbn/core-saved-objects-server';
import type { UiSettingsServiceStart } from '@kbn/core-ui-settings-server';
import type { LicenseType } from '@kbn/licensing-types';
import type { Logger } from '@kbn/logging';
import type { ReportingServerInfo } from '@kbn/reporting-common/types';
import type { ScreenshottingStart } from '@kbn/screenshotting-plugin/server';
import { asSpaceId, DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import type { SpacesPluginSetup } from '@kbn/spaces-plugin/server';

import { kibanaRequestFactory } from '@kbn/core-http-server-utils';
import type { LicensingPluginStart } from '@kbn/licensing-plugin/server';
import {
  EXPORT_TYPE_SCHEDULED,
  LICENSE_TYPE_BASIC,
  REPORTING_FEATURE_ID,
} from '@kbn/reporting-common';
import type { CreateJobFn, RunTaskFn } from './types';
import type { ReportingConfigType } from '.';

export interface BaseExportTypeSetupDeps {
  spaces?: SpacesPluginSetup;
}

export interface BaseExportTypeStartDeps {
  licensing: LicensingPluginStart;
  savedObjects: SavedObjectsServiceStart;
  uiSettings: UiSettingsServiceStart;
  esClient: IClusterClient;
  screenshotting?: ScreenshottingStart;
}

export abstract class ExportType<
  JobParamsType extends object = any,
  TaskPayloadType extends object = any,
  SetupDepsType extends BaseExportTypeSetupDeps = BaseExportTypeSetupDeps,
  StartDepsType extends BaseExportTypeStartDeps = BaseExportTypeStartDeps
> {
  abstract id: string; // ID for exportTypesRegistry.getById()
  abstract name: string; // user-facing string
  abstract jobType: string; // for job params

  abstract jobContentEncoding?: 'base64' | 'csv';
  abstract jobContentExtension: 'pdf' | 'png' | 'csv';

  abstract createJob: CreateJobFn<JobParamsType, TaskPayloadType>;
  abstract runTask: RunTaskFn<TaskPayloadType>;

  abstract validLicenses: LicenseType[];

  public setupDeps!: SetupDepsType;
  public startDeps!: StartDepsType;
  public http!: HttpServiceSetup;
  public isServerless: boolean;

  constructor(
    core: CoreSetup,
    public config: ReportingConfigType,
    public logger: Logger,
    public context: PluginInitializerContext<ReportingConfigType>
  ) {
    this.http = core.http;
    this.isServerless = context.env.packageInfo.buildFlavor === 'serverless';
  }

  setup(setupDeps: SetupDepsType) {
    this.setupDeps = setupDeps;
  }
  start(startDeps: StartDepsType) {
    this.startDeps = startDeps;
  }

  getFeatureUsageName(type: string): string {
    return `${REPORTING_FEATURE_ID}: ${this.id} ${type} export`;
  }
  shouldNotifyUsage(type: string): boolean {
    if (type === EXPORT_TYPE_SCHEDULED) {
      return true;
    }

    return !this.validLicenses.includes(LICENSE_TYPE_BASIC);
  }

  notifyUsage(type: string) {
    if (this.shouldNotifyUsage(type)) {
      this.startDeps.licensing.featureUsage.notifyUsage(this.getFeatureUsageName(type));
    }
  }

  private async getSavedObjectsClient(request: KibanaRequest) {
    const { savedObjects } = this.startDeps;
    return savedObjects.getScopedClient(request) as SavedObjectsClientContract;
  }

  private getSpaceId(request: KibanaRequest, logger = this.logger): string | undefined {
    const spacesService = this.setupDeps.spaces?.spacesService;
    if (spacesService) {
      const spaceId = spacesService?.getSpaceId(request);

      if (spaceId !== DEFAULT_SPACE_ID) {
        logger.trace(`Request uses Space ID: ${spaceId}`);
        return spaceId;
      } else {
        logger.trace(`Request uses default Space`);
      }
    }
  }

  protected getUiSettingsServiceFactory(savedObjectsClient: SavedObjectsClientContract) {
    const { uiSettings: uiSettingsService } = this.startDeps;
    const scopedUiSettingsService = uiSettingsService.asScopedToClient(savedObjectsClient);
    return scopedUiSettingsService;
  }

  protected async getUiSettingsClient(request: KibanaRequest, logger = this.logger) {
    const spacesService = this.setupDeps.spaces?.spacesService;
    const spaceId = this.getSpaceId(request, logger);

    if (spacesService && spaceId) {
      logger.info(`Creating UI Settings Client for space: ${spaceId}`);
    }
    const savedObjectsClient = await this.getSavedObjectsClient(request);
    return this.getUiSettingsServiceFactory(savedObjectsClient);
  }

  protected getFakeRequest(
    headers: Headers,
    spaceId: string | undefined,
    logger = this.logger
  ): KibanaRequest {
    if (spaceId && spaceId !== DEFAULT_SPACE_ID) {
      logger.info(`Generating request for space: ${spaceId}`);
    }
    const rawRequest: FakeRawRequest = {
      headers,
      spaceId: spaceId ? asSpaceId(spaceId) : undefined,
    };
    return kibanaRequestFactory(rawRequest);
  }

  /*
   * Returns configurable server info
   */
  protected getServerInfo(): ReportingServerInfo {
    const serverInfo = this.http.getServerInfo();
    return {
      basePath: this.http.basePath.serverBasePath,
      hostname: serverInfo.hostname,
      name: serverInfo.name,
      port: serverInfo.port,
      uuid: this.context.env.instanceUuid,
      protocol: serverInfo.protocol,
    };
  }
}
