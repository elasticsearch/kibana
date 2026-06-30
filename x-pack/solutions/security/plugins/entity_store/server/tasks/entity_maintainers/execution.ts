/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import type { TaskManagerStartContract } from '@kbn/task-manager-plugin/server';
import type { CoreStart, ElasticsearchClient, KibanaRequest } from '@kbn/core/server';
import type { LicenseCheckState, LicenseType } from '@kbn/licensing-types';
import type { LicensingPluginStart } from '@kbn/licensing-plugin/server';
import type { WorkflowsExtensionsServerPluginStart } from '@kbn/workflows-extensions/server';
import {
  EntityMaintainerTaskStatus,
  EntityMaintainerTelemetryEventType,
  type EntityMaintainerState,
  type EntityMaintainerStatus,
  type EntityMaintainerTaskMethod,
} from './types';
import { CRUDClient, type EntityUpdateClient } from '../../domain/crud';
import { EntityMetadataClient } from '../../domain/entity_metadata';
import type { TelemetryReporter } from '../../telemetry/events';
import { ENTITY_MAINTAINER_EVENT } from '../../telemetry/events';
import { wrapTaskRun } from '../../telemetry/traces';
import {
  createMaintainerTelemetryClient,
  type InternalMaintainerTelemetryClient,
} from './maintainer_telemetry_client';

const ENTITY_MAINTAINER_LICENSE_CHECK_VALID = 'valid' as const satisfies LicenseCheckState;

export interface ExecuteMaintainerRunParams {
  status: Partial<EntityMaintainerStatus>;
  request: KibanaRequest;
  taskId: string;
  taskAbortController?: AbortController;
  namespace?: string;
  id: string;
  run: EntityMaintainerTaskMethod;
  setup?: EntityMaintainerTaskMethod;
  initialState: EntityMaintainerState;
  effectiveMinLicense: LicenseType;
  type: string;
  coreStart: CoreStart;
  licensing: LicensingPluginStart;
  workflowsExtensions: WorkflowsExtensionsServerPluginStart;
  analytics: TelemetryReporter;
  logger: Logger;
}

export async function canRunMaintainerWithLicense({
  id,
  minLicense,
  licensing,
  logger,
}: {
  id: string;
  minLicense: LicenseType;
  licensing: LicensingPluginStart;
  logger: Logger;
}): Promise<boolean> {
  const license = await licensing.getLicense();
  const checkResult = license.check('entityStore', minLicense);
  if (checkResult.state !== ENTITY_MAINTAINER_LICENSE_CHECK_VALID) {
    logger.debug(`Entity maintainer "${id}" skipped: insufficient or inactive license`);
    return false;
  }

  return true;
}

export function createMaintainerStatus({
  status,
  namespace,
  initialState,
}: {
  status: Partial<EntityMaintainerStatus>;
  namespace?: string;
  initialState: EntityMaintainerState;
}): EntityMaintainerStatus {
  const topLevelNamespace = typeof status?.namespace === 'string' ? status.namespace : undefined;
  const metadataNamespace =
    typeof status?.metadata?.namespace === 'string' ? status.metadata.namespace : undefined;
  const resolvedNamespace = namespace || topLevelNamespace || metadataNamespace;

  if (!resolvedNamespace) {
    throw new Error('Entity maintainer namespace is required');
  }

  return {
    metadata: {
      runs: status?.metadata?.runs || 0,
      lastSuccessTimestamp: status?.metadata?.lastSuccessTimestamp || null,
      lastErrorTimestamp: status?.metadata?.lastErrorTimestamp || null,
      namespace: resolvedNamespace,
    },
    state: status?.metadata?.runs ? status.state ?? initialState : initialState,
    taskStatus: status?.taskStatus ?? EntityMaintainerTaskStatus.STARTED,
  };
}

export async function executeMaintainerRun({
  status,
  request,
  taskId,
  taskAbortController,
  namespace,
  id,
  run,
  setup,
  initialState,
  effectiveMinLicense,
  type,
  coreStart,
  licensing,
  workflowsExtensions,
  analytics,
  logger,
}: ExecuteMaintainerRunParams): Promise<{ state: EntityMaintainerStatus } | null> {
  if (status.taskStatus === EntityMaintainerTaskStatus.STOPPED) {
    logger.debug(`Entity maintainer task is stopped, skipping run`);
    return null;
  }

  const hasValidLicense = await canRunMaintainerWithLicense({
    id,
    minLicense: effectiveMinLicense,
    licensing,
    logger,
  });
  if (!hasValidLicense) {
    return null;
  }

  const maintainerStatus = createMaintainerStatus({ status, namespace, initialState });
  const esClient = coreStart.elasticsearch.client.asScoped(request).asCurrentUser;
  const cpsEsClient = coreStart.elasticsearch.client.asScoped(request, {
    projectRouting: 'space',
  }).asCurrentUser;
  const emitWorkflowTriggerEvent = async (triggerId: string, payload: Record<string, unknown>) => {
    const workflowsClient = await workflowsExtensions.getClient(request);
    await workflowsClient.emitEvent(triggerId, payload);
  };
  const crudClient = new CRUDClient({
    logger,
    esClient,
    namespace: maintainerStatus.metadata.namespace,
    emitWorkflowTriggerEvent,
  });
  const entityMetadataClient = new EntityMetadataClient({
    logger,
    esClient: coreStart.elasticsearch.client.asInternalUser,
    namespace: maintainerStatus.metadata.namespace,
  });
  const taskLogger = logger.get(taskId);
  const abortController = taskAbortController ?? new AbortController();
  const telemetryClient = createMaintainerTelemetryClient({
    id,
    namespace: maintainerStatus.metadata.namespace,
    analytics,
  });

  return await wrapTaskRun({
    spanName: 'entityStore.task.entity_maintainer.run',
    namespace: maintainerStatus.metadata.namespace,
    attributes: {
      'entity_store.task.id': taskId,
      'entity_store.task.type': type,
      'entity_store.entity_maintainer.id': id,
    },
    run: () =>
      runEntityMaintainerTask({
        status: maintainerStatus,
        fakeRequest: request,
        logger: taskLogger,
        setup,
        run,
        abortController,
        esClient,
        cpsEsClient,
        crudClient,
        entityMetadataClient,
        id,
        analytics,
        telemetryClient,
      }),
  });
}

export async function persistMaintainerState({
  taskManager,
  taskId,
  state,
  request,
}: {
  taskManager: TaskManagerStartContract;
  taskId: string;
  state: EntityMaintainerStatus;
  request: KibanaRequest;
}): Promise<void> {
  await taskManager.bulkUpdateState([taskId], () => state, { request });
}

export async function runEntityMaintainerTask({
  status,
  fakeRequest,
  logger,
  setup,
  run,
  abortController,
  esClient,
  cpsEsClient,
  crudClient,
  entityMetadataClient,
  id,
  analytics,
  telemetryClient,
}: {
  status: EntityMaintainerStatus;
  fakeRequest: KibanaRequest;
  logger: Logger;
  setup?: EntityMaintainerTaskMethod;
  run: EntityMaintainerTaskMethod;
  abortController: AbortController;
  esClient: ElasticsearchClient;
  cpsEsClient: ElasticsearchClient;
  crudClient: EntityUpdateClient;
  entityMetadataClient: EntityMetadataClient;
  id: string;
  analytics: TelemetryReporter;
  telemetryClient: InternalMaintainerTelemetryClient;
}): Promise<{ state: EntityMaintainerStatus }> {
  const namespace = status.metadata.namespace;
  let aborted = false;
  let caughtError: unknown;
  const runStartedAt = Date.now();

  const onAbort = () => {
    aborted = true;
    logger.debug(`Abort signal received, stopping Entity Maintainer`);
    analytics.reportEvent(ENTITY_MAINTAINER_EVENT, {
      id,
      namespace,
      type: EntityMaintainerTelemetryEventType.ABORT,
    });
  };
  try {
    abortController.signal.addEventListener('abort', onAbort);
    const isFirstRun = status.metadata.runs === 0;
    if (isFirstRun && setup) {
      logger.debug(`First run, executing setup`);
      status.state = await setup({
        status: { ...status },
        abortController,
        logger,
        fakeRequest,
        esClient,
        cpsEsClient,
        crudClient,
        entityMetadataClient,
        telemetry: telemetryClient,
      });
      analytics.reportEvent(ENTITY_MAINTAINER_EVENT, {
        id,
        namespace,
        type: EntityMaintainerTelemetryEventType.SETUP,
      });
    }
    logger.debug(`Executing run`);
    status.state = await run({
      status: { ...status },
      abortController,
      logger,
      fakeRequest,
      esClient,
      cpsEsClient,
      crudClient,
      entityMetadataClient,
      telemetry: telemetryClient,
    });
    analytics.reportEvent(ENTITY_MAINTAINER_EVENT, {
      id,
      namespace,
      type: EntityMaintainerTelemetryEventType.RUN,
    });
    status.metadata.lastSuccessTimestamp = new Date().toISOString();
  } catch (err) {
    caughtError = err;
    status.metadata.lastErrorTimestamp = new Date().toISOString();
    logger.debug(`Run failed - ${(err as Error)?.message}`);
    analytics.reportEvent(ENTITY_MAINTAINER_EVENT, {
      id,
      namespace,
      type: EntityMaintainerTelemetryEventType.ERROR,
      errorMessage: (err as Error)?.message?.substring(0, 500), // limit error message length to prevent excessively long strings in telemetry
    });
  } finally {
    status.metadata.runs++;
    abortController.signal.removeEventListener('abort', onAbort);
    try {
      telemetryClient.flush({
        durationMs: Date.now() - runStartedAt,
        aborted,
        errorClass:
          caughtError instanceof Error
            ? caughtError.constructor.name
            : caughtError != null
            ? 'Error'
            : undefined,
        errorMessage: caughtError instanceof Error ? caughtError.message : undefined,
      });
    } catch (flushErr) {
      logger.error(
        `Failed to flush maintainer telemetry: ${(flushErr as Error)?.message ?? 'unknown'}`
      );
    }
  }

  return {
    state: status,
  };
}
