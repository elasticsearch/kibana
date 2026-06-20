/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreStart } from '@kbn/core/public';
import { licenseService } from '../../../common/hooks/use_license';
import { ExperimentalFeaturesService } from '../../../common/experimental_features_service';
import type { TelemetryServiceStart } from '../../../common/lib/telemetry';
import type {
  CreateQRadarRuleMigrationRulesRequestBody,
  CreateSentinelRuleMigrationRulesRequestBody,
  CreateRuleMigrationRulesRequestBody,
  StartRuleMigrationResponse,
  StopRuleMigrationResponse,
  UpsertRuleMigrationResourcesRequestBody,
} from '../../../../common/siem_migrations/model/api/rules/rule_migration.gen';
import type { SiemMigrationRetryFilter } from '../../../../common/siem_migrations/constants';
import { SiemMigrationTaskStatus } from '../../../../common/siem_migrations/constants';
import type { StartPluginsDependencies } from '../../../types';
import * as api from '../api';
import type { RuleMigrationSettings, RuleMigrationStats } from '../types';
import * as i18n from './translations';
import { SiemRulesMigrationsTelemetry } from './telemetry';
import type { CapabilitiesLevel, MissingCapability } from '../../common/service';
import {
  SiemMigrationsServiceBase,
  getMissingCapabilitiesChecker,
  getMissingCapabilitiesToast,
  getNoConnectorToast,
} from '../../common/service';
import type { GetMigrationStatsParams, GetMigrationsStatsAllParams } from '../../common/types';
import { MigrationSource } from '../../common/types';
import { raiseSuccessToast } from './notification/success_notification';
import { START_STOP_POLLING_SLEEP_SECONDS } from '../../common/constants';
import { requiredRuleMigrationCapabilities } from './capabilities';
import type { SiemMigrationVendor } from '../../../../common/siem_migrations/types';

const CREATE_MIGRATION_BODY_BATCH_SIZE = 50;

export type CreateRuleMigrationParams =
  | {
      rules: CreateRuleMigrationRulesRequestBody;
      migrationName: string;
      vendor: 'splunk';
    }
  | {
      rules: CreateQRadarRuleMigrationRulesRequestBody;
      migrationName: string;
      vendor: 'qradar';
    }
  | {
      rules: CreateSentinelRuleMigrationRulesRequestBody;
      migrationName: string;
      vendor: 'microsoft-sentinel';
    };

export class SiemRulesMigrationsService extends SiemMigrationsServiceBase<RuleMigrationStats> {
  public telemetry: SiemRulesMigrationsTelemetry;

  constructor(
    core: CoreStart,
    plugins: StartPluginsDependencies,
    telemetryService: TelemetryServiceStart
  ) {
    super(core, plugins);
    this.telemetry = new SiemRulesMigrationsTelemetry(telemetryService);
  }

  /** Returns any missing capabilities for the user to use this feature */
  public getMissingCapabilities(level?: CapabilitiesLevel): MissingCapability[] {
    const getMissingCapabilities = getMissingCapabilitiesChecker(requiredRuleMigrationCapabilities);
    return getMissingCapabilities(this.core.application.capabilities, level);
  }

  /** Checks if the service is available based on the `license`, `capabilities` and `experimentalFeatures` */
  public isAvailable() {
    const { siemMigrationsDisabled } = ExperimentalFeaturesService.get();
    return (
      !siemMigrationsDisabled &&
      licenseService.isEnterprise() &&
      !this.hasMissingCapabilities('minimum')
    );
  }

  /** Accessor for the rule migrations API client */
  public get api() {
    return api;
  }

  public async addQradarRulesToMigration(
    migrationId: string,
    rules: CreateQRadarRuleMigrationRulesRequestBody
  ) {
    const rulesCount = rules.xml.length;
    if (rulesCount === 0) {
      throw new Error(i18n.EMPTY_RULES_ERROR);
    }

    const { count } = await api.addRulesToQRadarMigration({ migrationId, body: rules });

    return { count };
  }

  public async addSentinelRulesToMigration(
    migrationId: string,
    rules: CreateSentinelRuleMigrationRulesRequestBody
  ) {
    if (!rules.resources?.length) {
      throw new Error(i18n.EMPTY_RULES_ERROR);
    }

    const { count } = await api.addRulesToSentinelMigration({ migrationId, body: rules });

    return { count };
  }

  /** Adds rules to a rule migration, batching the requests to avoid hitting the max payload size limit of the API */
  public async addRulesToMigration(
    migrationId: string,
    rules: CreateRuleMigrationRulesRequestBody
  ) {
    const rulesCount = rules.length;
    if (rulesCount === 0) {
      throw new Error(i18n.EMPTY_RULES_ERROR);
    }

    // Batching creation to avoid hitting the max payload size limit of the API
    for (let i = 0; i < rulesCount; i += CREATE_MIGRATION_BODY_BATCH_SIZE) {
      const rulesBatch = rules.slice(i, i + CREATE_MIGRATION_BODY_BATCH_SIZE);
      await api.addRulesToMigration({ migrationId, body: rulesBatch });
    }
  }

  /** Creates a rule migration with a name and adds the rules to it, returning the migration ID */
  public async createRuleMigration({
    rules,
    migrationName,
    vendor,
  }: CreateRuleMigrationParams): Promise<string> {
    if (!rules) {
      const emptyRulesError = new Error(i18n.EMPTY_RULES_ERROR);
      this.telemetry.reportSetupMigrationCreated({
        count: 0,
        error: emptyRulesError,
        vendor,
      });
      throw emptyRulesError;
    }

    let migrationId: string | undefined;
    try {
      if (vendor === MigrationSource.QRADAR) {
        if (!rules.xml) {
          throw new Error(i18n.EMPTY_RULES_ERROR);
        }

        const { migration_id } = await api.createRuleMigration({
          name: migrationName,
        });
        migrationId = migration_id;
        const { count } = await this.addQradarRulesToMigration(migrationId, rules);
        this.telemetry.reportSetupMigrationCreated({ migrationId, count, vendor });

        return migrationId;
      } else if (vendor === MigrationSource.SENTINEL) {
        if (!rules.resources?.length) {
          throw new Error(i18n.EMPTY_RULES_ERROR);
        }

        // create the migration
        const { migration_id: migrationId } = await api.createRuleMigration({
          name: migrationName,
        });
        const { count } = await this.addSentinelRulesToMigration(migrationId, rules);
        this.telemetry.reportSetupMigrationCreated({ migrationId, count, vendor });

        return migrationId;
      } else {
        if (rules.length === 0) {
          throw new Error(i18n.EMPTY_RULES_ERROR);
        }

        const { migration_id } = await api.createRuleMigration({
          name: migrationName,
        });
        migrationId = migration_id;
        await this.addRulesToMigration(migrationId, rules);
        this.telemetry.reportSetupMigrationCreated({
          migrationId,
          count: rules.length,
          vendor,
        });

        return migrationId;
      }
    } catch (error) {
      if (migrationId) {
        await api.deleteMigration({ migrationId }).catch(() => {});
      }
      this.telemetry.reportSetupMigrationCreated({ count: 0, error, vendor });
      throw error;
    }
  }

  /** Deletes a rule migration by its ID, refreshing the stats to remove it from the list */
  public async deleteMigration({
    migrationId,
    vendor,
  }: {
    migrationId: string;
    vendor?: SiemMigrationVendor;
  }): Promise<string> {
    try {
      await api.deleteMigration({ migrationId });

      // Refresh stats to remove the deleted migration from the list. All UI observables will be updated automatically
      await this.getMigrationsStats();

      this.telemetry.reportSetupMigrationDeleted({ migrationId, vendor });
      return migrationId;
    } catch (error) {
      this.telemetry.reportSetupMigrationDeleted({
        migrationId,
        error,
        vendor,
      });
      throw error;
    }
  }

  /** Upserts resources for a rule migration, batching the requests to avoid hitting the max payload size limit of the API */
  public async upsertMigrationResources({
    migrationId,
    vendor,
    body,
  }: {
    migrationId: string;
    vendor?: SiemMigrationVendor;
    body: UpsertRuleMigrationResourcesRequestBody;
  }): Promise<void> {
    const count = body.length;
    if (count === 0) {
      throw new Error(i18n.EMPTY_RULES_ERROR);
    }
    // We assume all resources are of the same type. There is no use case for mixing types in a single upload
    const type = body[0].type;
    try {
      // Batching creation to avoid hitting the max payload size limit of the API
      for (let i = 0; i < count; i += CREATE_MIGRATION_BODY_BATCH_SIZE) {
        const bodyBatch = body.slice(i, i + CREATE_MIGRATION_BODY_BATCH_SIZE);
        await api.upsertMigrationResources({ migrationId, body: bodyBatch });
      }
      this.telemetry.reportSetupResourceUploaded({
        migrationId,
        type,
        count,
        vendor,
      });
    } catch (error) {
      this.telemetry.reportSetupResourceUploaded({
        migrationId,
        type,
        count,
        error,
        vendor,
      });
      throw error;
    }
  }

  /** Starts a rule migration task and waits for the task to start running */
  public async startRuleMigration({
    migrationId,
    vendor,
    retry,
    settings,
  }: {
    migrationId: string;
    vendor: SiemMigrationVendor;
    retry?: SiemMigrationRetryFilter;
    settings?: RuleMigrationSettings;
  }): Promise<StartRuleMigrationResponse> {
    const missingCapabilities = this.getMissingCapabilities('all');
    if (missingCapabilities.length > 0) {
      this.core.notifications.toasts.add(
        getMissingCapabilitiesToast(missingCapabilities, this.core)
      );
      return { started: false };
    }
    const connectorId = settings?.connectorId ?? this.connectorIdStorage.get();
    const skipPrebuiltRulesMatching = settings?.skipPrebuiltRulesMatching;
    if (!connectorId) {
      this.core.notifications.toasts.add(getNoConnectorToast(this.core));
      return { started: false };
    }
    const params: api.StartRuleMigrationParams = {
      migrationId,
      settings: { connectorId, skipPrebuiltRulesMatching },
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
      const result = await api.startRuleMigration(params);

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

  /** Stops a running rule migration task and waits for the task to completely stop */
  public async stopRuleMigration({
    migrationId,
    vendor,
  }: {
    migrationId: string;
    vendor?: SiemMigrationVendor;
  }): Promise<StopRuleMigrationResponse> {
    const missingCapabilities = this.getMissingCapabilities('all');
    if (missingCapabilities.length > 0) {
      this.core.notifications.toasts.add(
        getMissingCapabilitiesToast(missingCapabilities, this.core)
      );
      return { stopped: false };
    }

    try {
      const result = await api.stopRuleMigration({ migrationId });

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
    taskStats: RuleMigrationStats;
  }): Promise<void> {
    const skipPrebuiltRulesMatching = taskStats.last_execution?.skip_prebuilt_rules_matching;
    await api.startRuleMigration({
      migrationId: taskStats.id,
      settings: { connectorId, skipPrebuiltRulesMatching },
    });
  }

  protected async fetchMigrationStats({
    migrationId,
  }: GetMigrationStatsParams): Promise<RuleMigrationStats> {
    const stats = await api.getRuleMigrationStats({ migrationId });
    return stats;
  }
  protected async fetchMigrationsStatsAll(
    params: GetMigrationsStatsAllParams
  ): Promise<RuleMigrationStats[]> {
    const allStats = await api.getRuleMigrationsStatsAll(params);
    return allStats;
  }

  protected sendFinishedMigrationNotification(taskStats: RuleMigrationStats) {
    raiseSuccessToast(taskStats, this.core);
  }
}
