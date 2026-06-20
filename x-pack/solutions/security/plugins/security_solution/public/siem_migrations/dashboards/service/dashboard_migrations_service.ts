/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreStart } from '@kbn/core/public';
import type {
  CreateDashboardMigrationDashboardsRequestBody,
  StartDashboardsMigrationResponse,
  StopDashboardsMigrationResponse,
  UpsertDashboardMigrationResourcesRequestBody,
} from '../../../../common/siem_migrations/model/api/dashboards/dashboard_migration.gen';
import type { TelemetryServiceStart } from '../../../common/lib/telemetry';
import type { StartPluginsDependencies } from '../../../types';
import { ExperimentalFeaturesService } from '../../../common/experimental_features_service';
import { licenseService } from '../../../common/hooks/use_license';
import * as i18n from './translations';
import * as api from '../api';
import { getMissingCapabilitiesToast } from '../../common/service/notifications/missing_capabilities_notification';
import { getNoConnectorToast } from '../../common/service/notifications/no_connector_notification';
import { SiemMigrationTaskStatus } from '../../../../common/siem_migrations/constants';
import { raiseSuccessToast } from './notification/success_notification';
import type { CapabilitiesLevel, MissingCapability } from '../../common/service/capabilities';
import { getMissingCapabilitiesChecker } from '../../common/service/capabilities';
import { requiredDashboardMigrationCapabilities } from './capabilities';
import { SiemMigrationsServiceBase } from '../../common/service';
import type { GetMigrationsStatsAllParams, GetMigrationStatsParams } from '../../common/types';
import { START_STOP_POLLING_SLEEP_SECONDS } from '../../common/constants';
import type { DashboardMigrationStats } from '../types';
import { SiemDashboardMigrationsTelemetry } from './telemetry';
import type { SiemMigrationVendor } from '../../../../common/siem_migrations/types';

export const CREATE_MIGRATION_BODY_BATCH_SIZE = 50;

export class SiemDashboardMigrationsService extends SiemMigrationsServiceBase<DashboardMigrationStats> {
  public telemetry: SiemDashboardMigrationsTelemetry;

  constructor(
    core: CoreStart,
    plugins: StartPluginsDependencies,
    telemetryService: TelemetryServiceStart
  ) {
    super(core, plugins);
    this.telemetry = new SiemDashboardMigrationsTelemetry(telemetryService);
  }

  /** Accessor for the dashboard migrations API client */
  public get api() {
    return api;
  }

  /** Returns any missing capabilities for the user to use this feature */
  public getMissingCapabilities(level?: CapabilitiesLevel): MissingCapability[] {
    const getMissingCapabilities = getMissingCapabilitiesChecker(
      requiredDashboardMigrationCapabilities
    );
    return getMissingCapabilities(this.core.application.capabilities, level);
  }

  /** Checks if the service is available based on the `license`, `capabilities` and `experimentalFeatures` */
  public isAvailable() {
    const { automaticDashboardsMigration, siemMigrationsDisabled } =
      ExperimentalFeaturesService.get();
    return (
      automaticDashboardsMigration &&
      !siemMigrationsDisabled &&
      licenseService.isEnterprise() &&
      !this.hasMissingCapabilities('minimum')
    );
  }

  /** Adds dashboards to a dashboard migration, batching the requests to avoid hitting the max payload size limit of the API */
  public async addDashboardsToMigration(
    migrationId: string,
    dashboards: CreateDashboardMigrationDashboardsRequestBody
  ) {
    const dashboardsCount = dashboards.length;
    if (dashboardsCount === 0) {
      throw new Error(i18n.EMPTY_DASHBOARDS_ERROR);
    }

    // Batching creation to avoid hitting the max payload size limit of the API
    const batches = [];
    for (let i = 0; i < dashboardsCount; i += CREATE_MIGRATION_BODY_BATCH_SIZE) {
      const dashboardsBatch = dashboards.slice(i, i + CREATE_MIGRATION_BODY_BATCH_SIZE);
      batches.push(api.addDashboardsToDashboardMigration({ migrationId, body: dashboardsBatch }));
    }
    const results = await Promise.allSettled(batches);
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    );
    if (rejected) {
      throw rejected.reason;
    }
  }

  /** Creates a dashboard migration with a name and adds the dashboards to it, returning the migration ID */
  public async createDashboardMigration(
    data: CreateDashboardMigrationDashboardsRequestBody,
    migrationName: string,
    vendor: SiemMigrationVendor
  ): Promise<string> {
    const dashboardsCount = data.length;
    if (dashboardsCount === 0) {
      const emptyDashboardError = new Error(i18n.EMPTY_DASHBOARDS_ERROR);
      this.telemetry.reportSetupMigrationCreated({
        vendor,
        count: dashboardsCount,
        error: emptyDashboardError,
      });
      throw emptyDashboardError;
    }

    let migrationId: string | undefined;
    try {
      const { migration_id } = await api.createDashboardMigration({
        name: migrationName,
      });
      migrationId = migration_id;

      await this.addDashboardsToMigration(migrationId, data);

      this.telemetry.reportSetupMigrationCreated({
        migrationId,
        count: dashboardsCount,
        vendor,
      });
      return migrationId;
    } catch (error) {
      if (migrationId) {
        await api.deleteDashboardMigration({ migrationId }).catch(() => {});
      }
      this.telemetry.reportSetupMigrationCreated({
        migrationId,
        count: dashboardsCount,
        error,
        vendor,
      });
      throw error;
    }
  }

  /** Upserts resources for a dashboard migration, batching the requests to avoid hitting the max payload size limit of the API */
  public async upsertMigrationResources({
    migrationId,
    vendor,
    body,
  }: {
    migrationId: string;
    vendor?: SiemMigrationVendor;
    body: UpsertDashboardMigrationResourcesRequestBody;
  }): Promise<void> {
    const count = body.length;
    if (count === 0) {
      throw new Error(i18n.EMPTY_DASHBOARDS_ERROR);
    }

    const type = body[0].type;

    // Batching creation to avoid hitting the max payload size limit of the API
    const batches = [];
    for (let i = 0; i < count; i += CREATE_MIGRATION_BODY_BATCH_SIZE) {
      const bodyBatch = body.slice(i, i + CREATE_MIGRATION_BODY_BATCH_SIZE);
      batches.push(api.upsertDashboardMigrationResources({ migrationId, body: bodyBatch }));
    }

    await Promise.all(batches)
      .then(() => {
        this.telemetry.reportSetupResourceUploaded({
          migrationId,
          type,
          count,
          vendor,
        });
      })
      .catch((error) => {
        this.telemetry.reportSetupResourceUploaded({
          migrationId,
          type,
          count,
          error,
          vendor,
        });
        throw error;
      });
  }

  /** Starts a dashbaord migration task and waits for the task to start running */
  public async startDashboardMigration({
    migrationId,
    retry,
    settings,
    vendor,
  }: {
    migrationId: string;
    retry?: api.StartDashboardsMigrationParams['retry'];
    settings?: api.StartDashboardsMigrationParams['settings'];
    vendor: SiemMigrationVendor;
  }): Promise<StartDashboardsMigrationResponse> {
    const missingCapabilities = this.getMissingCapabilities('all');
    if (missingCapabilities.length > 0) {
      this.core.notifications.toasts.add(
        getMissingCapabilitiesToast(missingCapabilities, this.core)
      );
      return { started: false };
    }
    const connectorId = settings?.connectorId ?? this.connectorIdStorage.get();
    if (!connectorId) {
      this.core.notifications.toasts.add(getNoConnectorToast(this.core));
      return { started: false };
    }
    const params: api.StartDashboardsMigrationParams = {
      migrationId,
      settings: { connectorId },
      retry,
    };

    const traceOptions = this.traceOptionsStorage.get();
    if (traceOptions) {
      params.langSmithOptions = {
        project_name: traceOptions.langSmithProject,
        api_key: traceOptions.langSmithApiKey,
      };
    }

    try {
      const result = await api.startDashboardMigration(params);

      // Should take a few seconds to start the task, so we poll until it is running
      await this.migrationTaskPollingUntil(
        migrationId,
        ({ status }) => status === SiemMigrationTaskStatus.RUNNING,
        { sleepSecs: START_STOP_POLLING_SLEEP_SECONDS, timeoutSecs: 90 } // wait up to 90 seconds for the task to start
      );

      this.startPolling();

      this.telemetry.reportStartTranslation({ ...params, vendor });
      return result;
    } catch (error) {
      this.telemetry.reportStartTranslation({ ...params, error, vendor });
      throw error;
    }
  }

  /** Stops a running dashboard migration task and waits for the task to completely stop */
  public async stopDashboardMigration({
    migrationId,
    vendor,
  }: {
    migrationId: string;
    vendor?: SiemMigrationVendor;
  }): Promise<StopDashboardsMigrationResponse> {
    const missingCapabilities = this.getMissingCapabilities('all');
    if (missingCapabilities.length > 0) {
      this.core.notifications.toasts.add(
        getMissingCapabilitiesToast(missingCapabilities, this.core)
      );
      return { stopped: false };
    }

    try {
      const result = await api.stopDashboardMigration({ migrationId });

      // Should take a few seconds to stop the task, so we poll until it is not running anymore
      await this.migrationTaskPollingUntil(
        migrationId,
        ({ status }) => status !== SiemMigrationTaskStatus.RUNNING, // may be STOPPED, FINISHED or INTERRUPTED
        { sleepSecs: START_STOP_POLLING_SLEEP_SECONDS, timeoutSecs: 90 } // wait up to 90 seconds for the task to stop
      );

      this.telemetry.reportStopTranslation({ migrationId, vendor });
      return result;
    } catch (error) {
      this.telemetry.reportStopTranslation({ migrationId, vendor, error });
      throw error;
    }
  }

  protected async startMigrationFromStats({
    connectorId,
    taskStats,
  }: {
    connectorId: string;
    taskStats: DashboardMigrationStats;
  }): Promise<void> {
    const params: api.StartDashboardsMigrationParams = {
      migrationId: taskStats.id,
      settings: { connectorId },
    };
    await api
      .startDashboardMigration(params)
      .then(() => {
        this.telemetry.reportStartTranslation({ ...params, vendor: taskStats.vendor });
      })
      .catch((error) => {
        this.telemetry.reportStartTranslation({ ...params, error, vendor: taskStats.vendor });
        throw error;
      });
  }

  protected async fetchMigrationStats({
    migrationId,
  }: GetMigrationStatsParams): Promise<DashboardMigrationStats> {
    const stats = await api.getDashboardMigrationStats({ migrationId });
    return stats;
  }
  protected async fetchMigrationsStatsAll(
    params: GetMigrationsStatsAllParams = {}
  ): Promise<DashboardMigrationStats[]> {
    const allStats = await api.getDashboardMigrationAllStats(params);
    return allStats;
  }

  protected sendFinishedMigrationNotification(taskStats: DashboardMigrationStats) {
    raiseSuccessToast(taskStats, this.core);
  }

  /** Deletes a dashboard migration by its ID, refreshing the stats to remove it from the list */
  public async deleteMigration({
    migrationId,
    vendor,
  }: {
    migrationId: string;
    vendor?: SiemMigrationVendor;
  }): Promise<string> {
    try {
      await api.deleteDashboardMigration({ migrationId });

      // Refresh stats to remove the deleted migration from the list. All UI observables will be updated automatically
      await this.getMigrationsStats();

      this.telemetry.reportSetupMigrationDeleted({ migrationId, vendor });
      return migrationId;
    } catch (error) {
      this.telemetry.reportSetupMigrationDeleted({ migrationId, error, vendor });
      throw error;
    }
  }
}
