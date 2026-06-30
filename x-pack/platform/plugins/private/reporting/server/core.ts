/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as Rx from 'rxjs';
import { map, take } from 'rxjs';

import type {
  AnalyticsServiceStart,
  CoreSetup,
  DocLinksServiceSetup,
  IClusterClient,
  KibanaRequest,
  Logger,
  PackageInfo,
  PluginInitializerContext,
  SavedObjectsServiceStart,
  SecurityServiceStart,
  StatusServiceSetup,
  UiSettingsServiceStart,
} from '@kbn/core/server';
import { SECURITY_EXTENSION_ID } from '@kbn/core-saved-objects-server';
import type { PluginSetupContract as ActionsPluginSetupContract } from '@kbn/actions-plugin/server';
import type { PluginStart as DataPluginStart } from '@kbn/data-plugin/server';
import type { DiscoverServerPluginStart } from '@kbn/discover-plugin/server';
import type { FeaturesPluginSetup } from '@kbn/features-plugin/server';
import type { FieldFormatsStart } from '@kbn/field-formats-plugin/server';
import type { LicensingPluginStart } from '@kbn/licensing-plugin/server';
import type { ReportingHealthInfo, ReportingServerInfo } from '@kbn/reporting-common/types';
import { CsvSearchSourceExportType, CsvV2ExportType } from '@kbn/reporting-export-types-csv';
import { PdfExportType, PdfV1ExportType } from '@kbn/reporting-export-types-pdf';
import { PngExportType } from '@kbn/reporting-export-types-png';
import type { ReportingConfigType } from '@kbn/reporting-server';
import type { ExportType } from '@kbn/reporting-server';
import type { ScreenshottingStart } from '@kbn/screenshotting-plugin/server';
import type { SecurityPluginSetup, SecurityPluginStart } from '@kbn/security-plugin/server';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import type { SpacesPluginSetup } from '@kbn/spaces-plugin/server';
import type {
  TaskManagerSetupContract,
  TaskManagerStartContract,
} from '@kbn/task-manager-plugin/server';
import type { UsageCounter } from '@kbn/usage-collection-plugin/server';
import type { NotificationsPluginStart } from '@kbn/notifications-plugin/server';

import { checkLicense } from '@kbn/reporting-server/check_license';
import type { EncryptedSavedObjectsPluginSetup } from '@kbn/encrypted-saved-objects-plugin/server';
import type { ExportTypesRegistry } from '@kbn/reporting-server/export_types_registry';
import type { LicensingPluginSetup } from '@kbn/licensing-plugin/public';
import type { ReportingSetup } from '.';
import { createConfig } from './config';
import { reportingEventLoggerFactory } from './lib/event_logger/logger';
import type { IReport, ReportingStore } from './lib/store';
import type { ReportTaskParams, ScheduledReportTaskParamsWithoutSpaceId } from './lib/tasks';
import { RunSingleReportTask, RunScheduledReportTask } from './lib/tasks';
import type { ReportingPluginRouter } from './types';
import { EventTracker } from './usage';
import { SCHEDULED_REPORT_SAVED_OBJECT_TYPE } from './saved_objects';
import { EmailNotificationService } from './services/notifications/email_notification_service';
import { handleGenerateSystemReportRequest } from './routes/common/request_handler/generate_system_report_request_handler';
import { API_PRIVILEGES } from './features';

export interface ReportingInternalSetup {
  actions: ActionsPluginSetupContract;
  docLinks: DocLinksServiceSetup;
  encryptedSavedObjects: EncryptedSavedObjectsPluginSetup;
  features: FeaturesPluginSetup;
  licensing: LicensingPluginSetup;
  logger: Logger;
  router: ReportingPluginRouter;
  security?: SecurityPluginSetup;
  spaces?: SpacesPluginSetup;
  status: StatusServiceSetup;
  taskManager: TaskManagerSetupContract;
  usageCounter?: UsageCounter;
}

export interface ReportingInternalStart {
  store: ReportingStore;
  analytics: AnalyticsServiceStart;
  savedObjects: SavedObjectsServiceStart;
  uiSettings: UiSettingsServiceStart;
  esClient: IClusterClient;
  data: DataPluginStart;
  discover: DiscoverServerPluginStart;
  fieldFormats: FieldFormatsStart;
  licensing: LicensingPluginStart;
  logger: Logger;
  notifications: NotificationsPluginStart;
  screenshotting?: ScreenshottingStart;
  security?: SecurityPluginStart;
  securityService: SecurityServiceStart;
  taskManager: TaskManagerStartContract;
}

/**
 * @internal
 */
export class ReportingCore {
  private packageInfo: PackageInfo;
  private pluginSetupDeps?: ReportingInternalSetup;
  private pluginStartDeps?: ReportingInternalStart;
  private readonly pluginSetup$ = new Rx.ReplaySubject<boolean>(); // observe async background setupDeps each are done
  private readonly pluginStart$ = new Rx.ReplaySubject<ReportingInternalStart>(); // observe async background startDeps
  private runSingleReportTask: RunSingleReportTask;
  private runScheduledReportTask: RunScheduledReportTask;
  private config: ReportingConfigType;
  private executing: Set<string>;

  public getContract: () => ReportingSetup;

  private kibanaShuttingDown$ = new Rx.ReplaySubject<void>(1);

  constructor(
    private core: CoreSetup,
    private logger: Logger,
    private exportTypesRegistry: ExportTypesRegistry,
    private context: PluginInitializerContext<ReportingConfigType>
  ) {
    this.packageInfo = context.env.packageInfo;
    const config = createConfig(core, context.config.get<ReportingConfigType>(), logger);
    this.config = config;

    this.getExportTypes().forEach((et) => {
      this.exportTypesRegistry.register(et);
    });
    this.runSingleReportTask = new RunSingleReportTask({
      reporting: this,
      config,
      logger: this.logger,
    });
    this.runScheduledReportTask = new RunScheduledReportTask({
      reporting: this,
      config,
      logger: this.logger,
    });

    this.getContract = () => ({
      registerExportTypes: (id) => id,
      getSpaceId: this.getSpaceId.bind(this),
      handleGenerateSystemReportRequest: (path, requestParams, handleResponseFunc) =>
        handleGenerateSystemReportRequest(
          this,
          this.logger,
          path,
          requestParams,
          handleResponseFunc
        ),
    });

    this.executing = new Set();
  }

  public getKibanaPackageInfo() {
    return this.packageInfo;
  }

  /*
   * Register setupDeps
   */
  public pluginSetup(setupDeps: ReportingInternalSetup) {
    this.pluginSetup$.next(true); // trigger the observer
    this.pluginSetupDeps = setupDeps; // cache

    this.exportTypesRegistry.getAll().forEach((et) => {
      et.setup(setupDeps);
    });

    const { runSingleReportTask, runScheduledReportTask } = this;
    setupDeps.taskManager.registerTaskDefinitions({
      [runSingleReportTask.TYPE]: runSingleReportTask.getTaskDefinition(),
      [runScheduledReportTask.TYPE]: runScheduledReportTask.getTaskDefinition(),
    });
  }

  /*
   * Register startDeps
   */
  public async pluginStart(startDeps: ReportingInternalStart) {
    this.pluginStart$.next(startDeps); // trigger the observer
    this.pluginStartDeps = startDeps; // cache

    this.exportTypesRegistry.getAll().forEach((et) => {
      et.start({ ...startDeps });
    });

    const { taskManager, notifications } = startDeps;
    const emailNotificationService = new EmailNotificationService({
      notifications,
    });

    const { runSingleReportTask, runScheduledReportTask } = this;
    // enable this instance to generate reports
    await Promise.all([
      runSingleReportTask.init(taskManager),
      runScheduledReportTask.init(taskManager, emailNotificationService),
    ]);
  }

  public pluginStop() {
    this.kibanaShuttingDown$.next();
  }

  public getKibanaShutdown$(): Rx.Observable<void> {
    return this.kibanaShuttingDown$.pipe(take(1));
  }

  /*
   * Blocks the caller until setup is done
   */
  public async pluginSetsUp(): Promise<boolean> {
    // use deps and config as a cached resolver
    if (this.pluginSetupDeps && this.config) {
      return true;
    }
    return await Rx.firstValueFrom(this.pluginSetup$.pipe(take(2))); // once for pluginSetupDeps (sync) and twice for config (async)
  }

  /*
   * Blocks the caller until start is done
   */
  public async pluginStartsUp(): Promise<boolean> {
    return await this.getPluginStartDeps().then(() => true);
  }

  /*
   * Synchronously checks if all async background setup and startup is completed
   */
  public pluginIsStarted() {
    return this.pluginSetupDeps != null && this.config != null && this.pluginStartDeps != null;
  }

  /*
   * Allows config to be set in the background
   */
  public setConfig(config: ReportingConfigType) {
    this.config = config;
    this.pluginSetup$.next(true);
  }

  /**
   * Validate export types with config settings
   * only CSV export types should be registered in the export types registry for serverless
   */
  private getExportTypes(): ExportType[] {
    const { csv, pdf, png } = this.config.export_types;
    const exportTypes: ExportType[] = [];

    if (csv.enabled) {
      // NOTE: CsvSearchSourceExportType should be deprecated and replaced with V2 in the UI: https://github.com/elastic/kibana/issues/151190
      exportTypes.push(
        new CsvSearchSourceExportType(this.core, this.config, this.logger, this.context)
      );
      exportTypes.push(new CsvV2ExportType(this.core, this.config, this.logger, this.context));
    }

    if (pdf.enabled) {
      // NOTE: PdfV1ExportType is deprecated and tagged for removal: https://github.com/elastic/kibana/issues/154601
      exportTypes.push(new PdfV1ExportType(this.core, this.config, this.logger, this.context));
      exportTypes.push(new PdfExportType(this.core, this.config, this.logger, this.context));
    }

    if (png.enabled) {
      exportTypes.push(new PngExportType(this.core, this.config, this.logger, this.context));
    }

    return exportTypes;
  }

  /*
   * Returns configurable server info
   */
  public getServerInfo(): ReportingServerInfo {
    const { http } = this.core;
    const serverInfo = http.getServerInfo();
    return {
      basePath: this.core.http.basePath.serverBasePath,
      hostname: serverInfo.hostname,
      name: serverInfo.name,
      port: serverInfo.port,
      uuid: this.context.env.instanceUuid,
      protocol: serverInfo.protocol,
    };
  }

  public async getHealthInfo(): Promise<ReportingHealthInfo> {
    const { encryptedSavedObjects } = this.getPluginSetupDeps();
    const { notifications, securityService } = await this.getPluginStartDeps();
    const isSecurityEnabled = await this.isSecurityEnabled();

    let isSufficientlySecure: boolean;
    const apiKeysAreEnabled = (await securityService.authc.apiKeys.areAPIKeysEnabled()) ?? false;

    if (isSecurityEnabled === null) {
      isSufficientlySecure = false;
    } else {
      // if esSecurityIsEnabled = true, then areApiKeysEnabled must be true to be considered secure
      // if esSecurityIsEnabled = false, then it does not matter what areApiKeysEnabled is
      if (!isSecurityEnabled) {
        isSufficientlySecure = false;
      } else {
        isSufficientlySecure = apiKeysAreEnabled;
      }
    }

    return {
      isSufficientlySecure,
      hasPermanentEncryptionKey: encryptedSavedObjects.canEncrypt,
      areNotificationsEnabled: notifications.isEmailServiceAvailable(),
    };
  }

  public async canManageReportingForSpace(req: KibanaRequest): Promise<boolean> {
    const { security } = await this.getPluginStartDeps();
    const spaceId = this.getSpaceId(req);
    const result = await security?.authz
      .checkPrivilegesWithRequest(req)
      .atSpace(spaceId ?? DEFAULT_SPACE_ID, {
        kibana: [security?.authz.actions.api.get(API_PRIVILEGES.MANAGE_SCHEDULED_REPORTING)],
      });

    return result?.hasAllRequested ?? false;
  }

  /*
   * Gives synchronous access to the config
   */
  public getConfig(): ReportingConfigType {
    return this.config;
  }

  /*
   * Track usage of API endpoints
   */
  public getUsageCounter(): UsageCounter | undefined {
    return this.pluginSetupDeps?.usageCounter;
  }

  /*
   * Track metrics of internal events
   */
  public getEventTracker(
    reportId: string,
    exportType: string,
    objectType: string
  ): EventTracker | undefined {
    const { analytics } = this.pluginStartDeps ?? {};
    if (analytics) {
      return new EventTracker(analytics, reportId, exportType, objectType);
    }
  }

  /*
   * Gives async access to the startDeps
   */
  public async getPluginStartDeps() {
    if (this.pluginStartDeps) {
      return this.pluginStartDeps;
    }

    return await Rx.firstValueFrom(this.pluginStart$);
  }

  public getExportTypesRegistry() {
    return this.exportTypesRegistry;
  }

  public async scheduleTask(request: KibanaRequest, report: ReportTaskParams) {
    return await this.runSingleReportTask.scheduleTask(request, report);
  }

  public async scheduleTaskWithInternalES(request: KibanaRequest, report: ReportTaskParams) {
    return await this.runSingleReportTask.scheduleTask(request, report, { useInternalUser: true });
  }

  public async scheduleRecurringTask(
    request: KibanaRequest,
    report: ScheduledReportTaskParamsWithoutSpaceId
  ) {
    return await this.runScheduledReportTask.scheduleTask(request, report);
  }

  public async getStore() {
    return (await this.getPluginStartDeps()).store;
  }

  public async getAuditLogger(request: KibanaRequest) {
    const startDeps = await this.getPluginStartDeps();
    return startDeps.securityService.audit.asScoped(request);
  }

  public async getLicenseInfo() {
    const { license$ } = (await this.getPluginStartDeps()).licensing;
    const registry = this.getExportTypesRegistry();

    return await Rx.firstValueFrom(
      license$.pipe(map((license) => checkLicense(registry, license)))
    );
  }

  public async isSecurityEnabled() {
    const { license$ } = (await this.getPluginStartDeps()).licensing;
    return await Rx.firstValueFrom(
      license$.pipe(
        map((license) => {
          if (!license || !license?.isAvailable) {
            return null;
          }

          const { isEnabled } = license.getFeature('security');
          return isEnabled;
        })
      )
    );
  }

  public validateNotificationEmails(emails: string[]): string | undefined {
    const pluginSetupDeps = this.getPluginSetupDeps();
    return pluginSetupDeps.actions
      .getActionsConfigurationUtilities()
      .validateEmailAddresses(emails);
  }

  /*
   * Gives synchronous access to the setupDeps
   */
  public getPluginSetupDeps() {
    if (!this.pluginSetupDeps) {
      throw new Error(`"pluginSetupDeps" dependencies haven't initialized yet`);
    }
    return this.pluginSetupDeps;
  }

  public async getDataViewsService(request: KibanaRequest) {
    const { savedObjects } = await this.getPluginStartDeps();
    const savedObjectsClient = savedObjects.getScopedClient(request);
    const { indexPatterns } = await this.getDataService();
    const { asCurrentUser: esClient } = (await this.getEsClient()).asScoped(request);
    const dataViews = await indexPatterns.dataViewsServiceFactory(savedObjectsClient, esClient);

    return dataViews;
  }

  public async getScopedSoClient(request: KibanaRequest) {
    const { savedObjects } = await this.getPluginStartDeps();
    return savedObjects.getScopedClient(request, {
      excludedExtensions: [SECURITY_EXTENSION_ID],
      includedHiddenTypes: [SCHEDULED_REPORT_SAVED_OBJECT_TYPE],
    });
  }

  public async getInternalSoClient() {
    const { savedObjects } = await this.getPluginStartDeps();
    return savedObjects.createInternalRepository([SCHEDULED_REPORT_SAVED_OBJECT_TYPE]);
  }

  public async getTaskManager() {
    const { taskManager } = await this.getPluginStartDeps();
    return taskManager;
  }

  public async getDataService() {
    const startDeps = await this.getPluginStartDeps();
    return startDeps.data;
  }

  public async getEsClient() {
    const startDeps = await this.getPluginStartDeps();
    return startDeps.esClient;
  }

  public getSpaceId(request: KibanaRequest, logger = this.logger): string | undefined {
    const spacesService = this.getPluginSetupDeps().spaces?.spacesService;
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

  public trackReport(reportId: string) {
    this.executing.add(reportId);
  }

  public untrackReport(reportId: string) {
    this.executing.delete(reportId);
  }

  public countConcurrentReports(): number {
    return this.executing.size;
  }

  public getEventLogger(report: IReport, task?: { id: string }) {
    const ReportingEventLogger = reportingEventLoggerFactory(this.logger);
    return new ReportingEventLogger(report, task);
  }
}
