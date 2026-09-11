/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import type {
  ElasticsearchClient,
  KibanaRequest,
  SavedObjectsClientContract,
} from '@kbn/core/server';
import type { TaskManagerStartContract } from '@kbn/task-manager-plugin/server';
import type { SecurityPluginStart } from '@kbn/security-plugin/server';
import type { CheckPrivilegesResponse } from '@kbn/security-plugin-types-server';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import type { EntityType } from '../../../common';
import {
  ENTITY_STORE_CLUSTER_PRIVILEGES,
  ENTITY_STORE_SOURCE_INDICES_PRIVILEGES,
  ENTITY_STORE_TARGET_INDICES_PRIVILEGES,
} from '../../../common';
import { scheduleExtractEntityTask, stopExtractEntityTask } from '../../tasks/extract_entity_task';
import {
  scheduleHistorySnapshotTasks,
  stopHistorySnapshotTask,
} from '../../tasks/history_snapshot_task';
import { scheduleStatusReportTask, stopStatusReportTask } from '../../tasks/status_report_task';
import { scheduleResilienceTask, stopResilienceTask } from '../../tasks/resilience_task';
import { removeEntityMaintainer } from '../../tasks/entity_maintainers';
import { entityMaintainersRegistry } from '../../tasks/entity_maintainers/entity_maintainers_registry';
import { installSharedElasticsearchAssets, uninstallElasticsearchAssets } from './install_assets';
import { deleteLegacyRemoteStateSavedObjects } from '../saved_objects/remote_log_extraction_state/types';
import type { LogExtractionConfig } from '../saved_objects';
import {
  EngineDescriptorTypeName,
  type EngineDescriptor,
  type EngineDescriptorClient,
  type EntityStoreGlobalStateClient,
  HistorySnapshotState,
} from '../saved_objects';
import type { HistorySnapshotBodyParams, LogExtractionInstallParams } from '../../routes/constants';
import { getMergedConfig } from '../config';
import { ENGINE_STATUS, ENTITY_STORE_STATUS } from '../constants';
import type {
  EntityStoreStatus,
  EngineComponentStatus,
  EngineComponentResource,
  GetStatusResult,
} from '../types';
import { getExtractEntityTaskId } from '../../tasks/extract_entity_task';
import {
  getEntitiesAlias,
  ENTITY_LATEST,
  ENTITY_METADATA,
  ENTITY_SCHEMA_VERSION_V2,
  ENTITY_UPDATES,
  getLatestEntitiesIndexName,
  getLatestEntityIndexPattern,
  getLegacySecurityEntityIndexPattern,
  getLegacySecurityLatestEntitiesIndexName,
  getLegacySecurityLatestEntityIndexPattern,
} from '../../../common/domain/entity_index';
import { getLatestIndexTemplateId } from './latest_index_template';
import { getComponentTemplateName } from './component_templates';
import { getUpdatesEntitiesDataStreamName } from './updates_data_stream';
import {
  getMetadataEntitiesDataStreamName,
  getLegacySecurityMetadataEntitiesDataStreamName,
} from './metadata_data_stream';
import type { LogsExtractionClient } from '../logs_extraction';
import type { ManagedEntityDefinition } from '../../../common/domain/definitions/entity_schema';
import { getEntityDefinition } from '../../../common/domain/definitions/registry';
import {
  type TelemetryReporter,
  ENTITY_STORE_DELETION_EVENT,
  ENTITY_STORE_INITIALIZATION_EVENT,
  ENTITY_STORE_INITIALIZATION_FAILURE_EVENT,
} from '../../telemetry/events';
import { getErrorMessage } from '../../../common';
import { stopAndRemoveV1, stopAndRemoveV1SharedTasks } from '../../infra/remove_v1';

interface AssetManagerDependencies {
  logger: Logger;
  esClient: ElasticsearchClient;
  internalEsClient: ElasticsearchClient;
  taskManager: TaskManagerStartContract;
  engineDescriptorClient: EngineDescriptorClient;
  globalStateClient: EntityStoreGlobalStateClient;
  namespace: string;
  isServerless: boolean;
  logsExtractionClient: LogsExtractionClient;
  security: SecurityPluginStart;
  analytics: TelemetryReporter;
  savedObjectsClient: SavedObjectsClientContract;
  isLegacySecurityAssetsMigrationEnabled?: () => Promise<boolean>;
}

export class AssetManagerClient {
  private readonly logger: Logger;
  private readonly esClient: ElasticsearchClient;
  private readonly internalEsClient: ElasticsearchClient;
  private readonly taskManager: TaskManagerStartContract;
  private readonly engineDescriptorClient: EngineDescriptorClient;
  private readonly globalStateClient: EntityStoreGlobalStateClient;
  private readonly namespace: string;
  private readonly isServerless: boolean;
  private readonly logsExtractionClient: LogsExtractionClient;
  private readonly security: SecurityPluginStart;
  private readonly analytics: TelemetryReporter;
  private readonly savedObjectsClient: SavedObjectsClientContract;
  private readonly isLegacySecurityAssetsMigrationEnabled: () => Promise<boolean>;

  constructor(deps: AssetManagerDependencies) {
    this.logger = deps.logger;
    this.esClient = deps.esClient;
    this.internalEsClient = deps.internalEsClient;
    this.taskManager = deps.taskManager;
    this.engineDescriptorClient = deps.engineDescriptorClient;
    this.globalStateClient = deps.globalStateClient;
    this.namespace = deps.namespace;
    this.isServerless = deps.isServerless;
    this.logsExtractionClient = deps.logsExtractionClient;
    this.security = deps.security;
    this.analytics = deps.analytics;
    this.savedObjectsClient = deps.savedObjectsClient;
    this.isLegacySecurityAssetsMigrationEnabled =
      deps.isLegacySecurityAssetsMigrationEnabled ?? (async () => false);
  }

  public async init(
    request: KibanaRequest,
    entityTypes: EntityType[],
    logsExtractionParams?: LogExtractionInstallParams,
    historySnapshotParams?: HistorySnapshotBodyParams
  ) {
    try {
      const historySnapshot = HistorySnapshotState.parse(historySnapshotParams ?? {});

      // Phase 1: Install shared ES assets/storage and run independent setup tasks.
      await Promise.all([
        this.globalStateClient.init({ historySnapshot, logsExtraction: logsExtractionParams }),

        // V1 cleanup is legacy migration work — run it as the internal user so enabling the
        // entity store does not require the user to hold transform/enrich/index admin on v1 assets.
        ...entityTypes.map((type) =>
          stopAndRemoveV1({
            type,
            namespace: this.namespace,
            logger: this.logger,
            esClient: this.internalEsClient,
            taskManager: this.taskManager,
            savedObjectsClient: this.savedObjectsClient,
          })
        ),
        stopAndRemoveV1SharedTasks({
          namespace: this.namespace,
          logger: this.logger,
          taskManager: this.taskManager,
        }),

        // Legacy index rename + compatibility aliases are system work — run as the
        // internal user (same as v1 cleanup) so enable/install is not blocked when the
        // caller only has read/write on entity indices. Template/index creation still
        // uses the requesting user and is gated by getPrivileges.
        installSharedElasticsearchAssets({
          esClient: this.esClient,
          migrationEsClient: this.internalEsClient,
          logger: this.logger,
          namespace: this.namespace,
          allowLegacyMigration: await this.isLegacySecurityAssetsMigrationEnabled(),
        }),
      ]);

      // Phase 2: Initialize engines. Descriptors must exist before namespace-scoped TM
      // schedules are created — those tasks self-delete when they find zero engines,
      // so scheduling them in parallel with initEntity can tear down a freshly
      // scheduled status task mid-install.
      await Promise.all(entityTypes.map((type) => this.initEntity(request, type)));

      // Phase 3: Schedule namespace-scoped background tasks after descriptors exist.
      await Promise.all([
        scheduleHistorySnapshotTasks({
          logger: this.logger,
          taskManager: this.taskManager,
          namespace: this.namespace,
          request,
          frequency: historySnapshot.frequency,
        }),

        scheduleStatusReportTask({
          logger: this.logger,
          taskManager: this.taskManager,
          namespace: this.namespace,
          request,
        }),

        scheduleResilienceTask({
          logger: this.logger,
          taskManager: this.taskManager,
          namespace: this.namespace,
          request,
        }),
      ]);
    } catch (error) {
      this.analytics.reportEvent(ENTITY_STORE_INITIALIZATION_FAILURE_EVENT, {
        namespace: this.namespace,
        error: getErrorMessage(error),
      });
      this.logger.error('Error during entity store init:', error);
      throw error;
    }
  }

  public async start(request: KibanaRequest, type: EntityType) {
    try {
      this.logger.get(type).debug(`Scheduling extract entity task for type: ${type}`);

      await this.engineDescriptorClient.update(type, { status: ENGINE_STATUS.STARTED });

      const { frequency } = await this.getLogExtractionConfig(type);

      await scheduleExtractEntityTask({
        logger: this.logger,
        taskManager: this.taskManager,
        type,
        frequency,
        namespace: this.namespace,
        request,
      });
    } catch (error) {
      this.logger.get(type).error(`Error starting extract entity task for type ${type}:`, error);
      await this.engineDescriptorClient.update(type, { status: ENGINE_STATUS.ERROR });
      throw error;
    }
  }

  public async stop(type: EntityType) {
    try {
      await stopExtractEntityTask({
        taskManager: this.taskManager,
        logger: this.logger,
        type,
        namespace: this.namespace,
      });
      await this.engineDescriptorClient.update(type, { status: ENGINE_STATUS.STOPPED });
    } catch (error) {
      this.logger.get(type).error(`Error stopping extract entity task for type ${type}:`, error);
      await this.engineDescriptorClient.update(type, { status: ENGINE_STATUS.ERROR });
      throw error;
    }
  }

  public async uninstall(type: EntityType) {
    try {
      const { engines } = await this.getStatus();
      if (!engines.some((e) => e.type === type)) {
        return false;
      }
      await this.stop(type);

      // Per-type saved objects — always safe to remove for this type alone.
      await this.engineDescriptorClient.delete(type);

      // The ES indices/data streams are shared across all entity types in the namespace
      // (their names carry the namespace, not the type). Only remove them once no engine
      // remains — otherwise the surviving engines lose the read/write targets their
      // extraction queries still depend on.
      const remainingEngines = await this.engineDescriptorClient.getAll();
      if (remainingEngines.length === 0) {
        this.logger.debug(`Cleaning up namespace because last engine was uninstalled`);
        await this.cleanupNamespace();
      }

      this.logger.get(type).debug(`Uninstalled definition: ${type}`);
      this.analytics.reportEvent(ENTITY_STORE_DELETION_EVENT, {
        entityType: type,
        namespace: this.namespace,
      });
      return true;
    } catch (error) {
      this.logger.get(type).error(`Error uninstalling assets for entity type ${type}`, { error });
      throw error;
    }
  }

  /**
   * Tears down namespace-scoped Entity Store resources: Task Manager schedules
   * (history, status, maintainers), Elasticsearch data-plane assets, and global
   * state.
   */
  public async cleanupNamespace(): Promise<void> {
    await Promise.all([
      stopHistorySnapshotTask({
        taskManager: this.taskManager,
        logger: this.logger,
        namespace: this.namespace,
      }),
      stopStatusReportTask({
        taskManager: this.taskManager,
        logger: this.logger,
        namespace: this.namespace,
      }),
      stopResilienceTask({
        taskManager: this.taskManager,
        logger: this.logger,
        namespace: this.namespace,
      }),
      ...entityMaintainersRegistry.getAll().map(({ id }) =>
        removeEntityMaintainer({
          taskManager: this.taskManager,
          id,
          namespace: this.namespace,
          logger: this.logger,
          analytics: this.analytics,
        })
      ),
    ]);

    // After schedules are gone: remove the ES/SO resources those tasks used so
    // an in-flight or soon-to-run task cannot hit deleted indices.
    await Promise.all([
      uninstallElasticsearchAssets({
        esClient: this.esClient,
        logger: this.logger,
        namespace: this.namespace,
      }),
      this.globalStateClient.delete(),
      deleteLegacyRemoteStateSavedObjects({
        soClient: this.savedObjectsClient,
        namespace: this.namespace,
        logger: this.logger,
      }),
    ]);

    this.logger.debug(
      `Finished cleaning up entity store resources for namespace "${this.namespace}"`
    );
  }

  public async getStatus(withComponents: boolean = false): Promise<GetStatusResult> {
    try {
      const [engines, { historySnapshot, logsExtraction: logsExtractionConfig }, globalOverrides] =
        await Promise.all([
          this.engineDescriptorClient.getAll(),
          this.globalStateClient.findOrThrow(),
          this.globalStateClient.findLogExtractionOverrides(),
        ]);

      const status = this.calculateEntityStoreStatus(engines);
      const logsExtractionConfigByType = Object.fromEntries(
        engines.map((engine) => [
          engine.type,
          getMergedConfig(engine.type, globalOverrides, engine.logExtractionConfig),
        ])
      ) as Partial<Record<EntityType, LogExtractionConfig>>;

      if (withComponents) {
        const enginesWithComponents = await Promise.all(
          engines.map((engine) => this.getEngineWithComponents(engine))
        );
        return {
          status,
          engines: enginesWithComponents,
          historySnapshot,
          logsExtractionConfig,
          logsExtractionConfigByType,
        };
      }

      return {
        status,
        engines,
        historySnapshot,
        logsExtractionConfig,
        logsExtractionConfigByType,
      };
    } catch (error) {
      if (SavedObjectsErrorHelpers.isNotFoundError(error)) {
        return { status: ENTITY_STORE_STATUS.NOT_INSTALLED, engines: [] };
      }

      this.logger.error('Error getting status', { error });
      throw error;
    }
  }

  /** Log extraction config in effect for one entity type. */
  public async getLogExtractionConfig(type: EntityType): Promise<LogExtractionConfig> {
    const [globalOverrides, engine] = await Promise.all([
      this.globalStateClient.findLogExtractionOverrides(),
      this.engineDescriptorClient.findOrThrow(type),
    ]);
    return getMergedConfig(type, globalOverrides, engine.logExtractionConfig);
  }

  private async initEntity(request: KibanaRequest, type: EntityType): Promise<boolean> {
    const installed = await this.install(type);
    if (installed) {
      await this.start(request, type);
    }
    this.analytics.reportEvent(ENTITY_STORE_INITIALIZATION_EVENT, {
      entityType: type,
      namespace: this.namespace,
    });
    return installed;
  }

  public async getPrivileges(
    request: KibanaRequest,
    additionalIndexPatterns: string[] = []
  ): Promise<CheckPrivilegesResponse> {
    const checkPrivileges = this.security.authz.checkPrivilegesDynamicallyWithRequest(request);

    const sourceIndexPatterns = await this.logsExtractionClient.getLocalIndexPatterns(
      additionalIndexPatterns
    );

    const kibanaPrivileges = this.security.authz.actions.savedObject.get(
      EngineDescriptorTypeName,
      'create'
    );

    // Install creates the concrete `.entities.v2.*` latest index (+ alias) and the
    // updates/metadata data streams as the requesting user, so each needs `read` + `manage`.
    // The updates data stream is also an extraction source (`view_index_metadata`), so we
    // merge privileges into one map. Patterns starting with `-` are stripped: `_has_privileges`
    // treats them as literal index names, not exclusions.
    const buildIndexPrivileges = (targets: string[]): Record<string, string[]> => {
      const index: Record<string, string[]> = {};
      const unionPrivileges = (name: string, privileges: string[]) => {
        index[name] = Array.from(new Set([...(index[name] ?? []), ...privileges]));
      };

      targets.forEach((name) => unionPrivileges(name, ENTITY_STORE_TARGET_INDICES_PRIVILEGES));

      sourceIndexPatterns
        .filter((idx) => !idx.startsWith('-'))
        .forEach((idx) => unionPrivileges(idx, ENTITY_STORE_SOURCE_INDICES_PRIVILEGES));

      return index;
    };

    const neutralTargets = [
      getEntitiesAlias(ENTITY_LATEST, this.namespace),
      getLatestEntityIndexPattern(this.namespace),
      getUpdatesEntitiesDataStreamName(this.namespace),
      getMetadataEntitiesDataStreamName(this.namespace),
    ];

    // Custom / predefined roles written against the pre-platform `security_*` names must
    // still be able to enable/install while migration + role updates land. `_has_privileges`
    // is AND across names, so check neutral and legacy as separate OR'd requests.
    const legacyTargets = [
      getEntitiesAlias(ENTITY_LATEST, this.namespace),
      getLegacySecurityLatestEntityIndexPattern(this.namespace),
      getLegacySecurityEntityIndexPattern({
        schemaVersion: ENTITY_SCHEMA_VERSION_V2,
        dataset: ENTITY_UPDATES,
        namespace: this.namespace,
      }),
      getLegacySecurityEntityIndexPattern({
        schemaVersion: ENTITY_SCHEMA_VERSION_V2,
        dataset: ENTITY_METADATA,
        namespace: this.namespace,
      }),
    ];

    const kibana = [kibanaPrivileges];
    const cluster = ENTITY_STORE_CLUSTER_PRIVILEGES;

    const neutralPrivileges = await checkPrivileges({
      kibana,
      elasticsearch: {
        cluster,
        index: buildIndexPrivileges(neutralTargets),
      },
    });
    if (neutralPrivileges.hasAllRequested) {
      return neutralPrivileges;
    }

    const legacyPrivileges = await checkPrivileges({
      kibana,
      elasticsearch: {
        cluster,
        index: buildIndexPrivileges(legacyTargets),
      },
    });
    if (legacyPrivileges.hasAllRequested) {
      return legacyPrivileges;
    }

    // Prefer the neutral result for UI detail when neither set is complete — that is the
    // target privilege model after migration.
    return neutralPrivileges;
  }

  public async install(type: EntityType): Promise<boolean> {
    try {
      const { engines } = await this.getStatus();
      if (engines.some((e) => e.type === type)) {
        return false;
      }

      this.logger.get(type).debug(`Installing assets for entity type: ${type}`);
      // Engine installation is per-type. Shared indices and data streams are created once
      // during `init()` before parallel engine initialization begins.
      await this.engineDescriptorClient.init(type);
      this.logger.debug(`Installed definition: ${type}`);

      return true;
    } catch (error) {
      this.logger.error(`Error installing assets for entity type ${type}`, { error });
      throw error;
    }
  }

  private async getEngineWithComponents(
    engine: EngineDescriptor
  ): Promise<EngineDescriptor & { components: EngineComponentStatus[] }> {
    const definition = getEntityDefinition(engine.type, this.namespace);
    const components = await this.getComponentsForEngine(engine.type, definition);
    return { ...engine, components };
  }

  private async getComponentsForEngine(
    type: EntityType,
    definition: ManagedEntityDefinition
  ): Promise<EngineComponentStatus[]> {
    const [
      entityDefinitionComponent,
      indexTemplateComponents,
      indexComponents,
      componentTemplateComponents,
      ilmPolicyComponents,
      taskComponent,
    ] = await Promise.all([
      this.getEntityDefinitionComponent(definition),
      this.getIndexTemplateComponents(),
      this.getIndexComponents(),
      this.getComponentTemplateComponents(definition),
      this.getIlmPolicyComponents(),
      this.getExtractEntityTaskComponent(type),
    ]);

    return [
      entityDefinitionComponent,
      ...indexTemplateComponents,
      ...indexComponents,
      ...componentTemplateComponents,
      ...ilmPolicyComponents,
      taskComponent,
    ];
  }

  private getEntityDefinitionComponent(definition: ManagedEntityDefinition): EngineComponentStatus {
    return {
      id: definition.id,
      installed: true,
      resource: 'entity_definition',
    };
  }

  private async getIndexTemplateComponents(): Promise<EngineComponentStatus[]> {
    const resource = 'index_template';
    const latestId = getLatestIndexTemplateId(this.namespace);
    const latestExists = await this.tryAsBoolean(
      this.esClient.indices.getIndexTemplate({ name: latestId })
    );
    return [{ id: latestId, installed: latestExists, resource }];
  }

  private async getIndexComponents(): Promise<EngineComponentStatus[]> {
    const resource: EngineComponentResource = 'index';
    const latestIndex = getLatestEntitiesIndexName(this.namespace);
    const latestExists = await this.esClient.indices.exists({ index: latestIndex });
    return [{ id: latestIndex, installed: latestExists, resource }];
  }

  private async getComponentTemplateComponents(
    definition: ManagedEntityDefinition
  ): Promise<EngineComponentStatus[]> {
    const resource: EngineComponentResource = 'component_template';
    const latestName = getComponentTemplateName(definition.type, this.namespace);
    const latestExists = await this.tryAsBoolean(
      this.esClient.cluster.getComponentTemplate({ name: latestName })
    );
    return [{ id: latestName, installed: latestExists, resource }];
  }

  private async getIlmPolicyComponents(): Promise<EngineComponentStatus[]> {
    if (this.isServerless) {
      return [];
    }
    const resource: EngineComponentResource = 'ilm_policy';
    const ilmPolicyNames: string[] = [];
    // TODO: add ilm policy names to ilmPolicyNames
    return Promise.all(
      ilmPolicyNames.map(async (name) => {
        const installed = await this.tryAsBoolean(this.esClient.ilm.getLifecycle({ name }));
        return { id: name, installed, resource };
      })
    );
  }

  private async getExtractEntityTaskComponent(type: EntityType): Promise<EngineComponentStatus> {
    const taskId = getExtractEntityTaskId(type, this.namespace);
    try {
      const task = await this.taskManager.get(taskId);
      return {
        id: taskId,
        installed: true,
        resource: 'task',
        status: task.state.status ?? null,
        runs: task.state.runs ?? 0,
        lastError: task.state.lastError ?? null,
      };
    } catch (e) {
      if (SavedObjectsErrorHelpers.isNotFoundError(e)) {
        return {
          id: taskId,
          installed: false,
          resource: 'task',
        };
      }
      throw e;
    }
  }

  /**
   * Checks whether the two shared per-namespace assets exist (latest index, metadata data stream)
   * and reinstalls any that are missing. Returns true if anything was recreated, false if all
   * assets were already present.
   *
   * Safe to call from a running task — the underlying creates use `throwIfExists: false`.
   */
  public async reinstallSharedAssetsIfMissing(): Promise<boolean> {
    const latestIndex = getLatestEntitiesIndexName(this.namespace);
    const legacyLatestIndex = getLegacySecurityLatestEntitiesIndexName(this.namespace);
    const metadataDataStream = getMetadataEntitiesDataStreamName(this.namespace);
    const legacyMetadataDataStream = getLegacySecurityMetadataEntitiesDataStreamName(
      this.namespace
    );

    const dataStreamExists = async (name: string): Promise<boolean> =>
      this.esClient.indices
        .getDataStream({ name }, { ignore: [404] })
        .then((r) => (r?.data_streams?.length ?? 0) > 0);

    const [latestExists, metadataExists] = await Promise.all([
      this.esClient.indices
        .exists({ index: latestIndex })
        .then(
          async (exists) => exists || this.esClient.indices.exists({ index: legacyLatestIndex })
        ),
      dataStreamExists(metadataDataStream).then(
        async (exists) => exists || dataStreamExists(legacyMetadataDataStream)
      ),
    ]);

    if (latestExists && metadataExists) {
      return false;
    }

    const missing = [!latestExists && latestIndex, !metadataExists && metadataDataStream].filter(
      Boolean
    );
    this.logger.warn(
      `Recreating missing entity store assets in ${this.namespace}: ${missing.join(', ')}`
    );

    await installSharedElasticsearchAssets({
      esClient: this.esClient,
      migrationEsClient: this.internalEsClient,
      logger: this.logger,
      namespace: this.namespace,
      allowLegacyMigration: await this.isLegacySecurityAssetsMigrationEnabled(),
    });
    return true;
  }

  /**
   * Runs an async operation. Returns true if the promise resolves (no failure),
   * or false if it throws.
   */

  private async tryAsBoolean(promise: Promise<unknown>): Promise<boolean> {
    try {
      await promise;
      return true;
    } catch {
      return false;
    }
  }

  private calculateEntityStoreStatus(engines: EngineDescriptor[]): EntityStoreStatus {
    if (engines.length === 0) {
      return ENTITY_STORE_STATUS.NOT_INSTALLED;
    } else if (engines.some((engine) => engine.status === ENGINE_STATUS.ERROR)) {
      return ENTITY_STORE_STATUS.ERROR;
    } else if (engines.every((engine) => engine.status === ENGINE_STATUS.STOPPED)) {
      return ENTITY_STORE_STATUS.STOPPED;
    } else if (engines.some((engine) => engine.status === ENGINE_STATUS.INSTALLING)) {
      return ENTITY_STORE_STATUS.INSTALLING;
    }

    return ENTITY_STORE_STATUS.RUNNING;
  }
}
