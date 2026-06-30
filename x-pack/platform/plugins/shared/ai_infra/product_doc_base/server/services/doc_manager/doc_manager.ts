/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import type { CoreAuditService, ElasticsearchClient } from '@kbn/core/server';
import { type TaskManagerStartContract, TaskStatus } from '@kbn/task-manager-plugin/server';
import type { LicensingPluginStart } from '@kbn/licensing-plugin/server';
import { defaultInferenceEndpoints } from '@kbn/inference-common';
import { ResourceTypes, resolveDefaultInferenceIdFromInferenceGet } from '@kbn/product-doc-common';
import { isImpliedDefaultElserInferenceId } from '@kbn/product-doc-common/src/is_default_inference_endpoint';
import type { InstallationStatus, ProductInstallState } from '../../../common/install_status';
import type { ProductDocInstallClient } from '../doc_install_status';
import {
  INSTALL_ALL_TASK_ID,
  scheduleInstallAllTask,
  scheduleUninstallAllTask,
  scheduleEnsureUpToDateTask,
  scheduleEnsureSecurityLabsUpToDateTask,
  getTaskStatus,
  waitUntilTaskCompleted,
} from '../../tasks';
import { checkLicense } from './check_license';
import type {
  DocumentationManagerAPI,
  DocGetStatusResponse,
  DocInstallOptions,
  DocUninstallOptions,
  DocUpdateOptions,
  DocUpdateAllOptions,
  SecurityLabsInstallOptions,
  SecurityLabsUninstallOptions,
  SecurityLabsStatusResponse,
} from './types';
import { INSTALL_ALL_TASK_ID_MULTILINGUAL } from '../../tasks/install_all';
import type { PerformUpdateResponse } from '../../../common/http_api/installation';
import type { PackageInstaller } from '../package_installer';

const TEN_MIN_IN_MS = 10 * 60 * 1000;

/**
 * High-level installation service, handling product documentation
 * installation as unary operations, abstracting away the fact
 * that documentation is composed of multiple entities.
 */
export class DocumentationManager implements DocumentationManagerAPI {
  private logger: Logger;
  private taskManager: TaskManagerStartContract;
  private licensing: LicensingPluginStart;
  private docInstallClient: ProductDocInstallClient;
  private auditService: CoreAuditService;
  private packageInstaller?: PackageInstaller;
  private esClient: ElasticsearchClient;

  constructor({
    logger,
    taskManager,
    licensing,
    docInstallClient,
    auditService,
    packageInstaller,
    esClient,
  }: {
    logger: Logger;
    taskManager: TaskManagerStartContract;
    licensing: LicensingPluginStart;
    docInstallClient: ProductDocInstallClient;
    auditService: CoreAuditService;
    packageInstaller?: PackageInstaller;
    esClient: ElasticsearchClient;
  }) {
    this.logger = logger;
    this.taskManager = taskManager;
    this.licensing = licensing;
    this.docInstallClient = docInstallClient;
    this.auditService = auditService;
    this.packageInstaller = packageInstaller;
    this.esClient = esClient;
  }

  async install(options: DocInstallOptions): Promise<void> {
    const { request, force = false, wait = false } = options;
    const inferenceId = options.inferenceId ?? defaultInferenceEndpoints.ELSER;

    const { status: previousStatus } = await this.getStatus({ inferenceId });
    if (!force && previousStatus === 'installed') {
      return;
    }

    const license = await this.licensing.getLicense();
    if (!checkLicense(license)) {
      throw new Error('Elastic documentation requires an enterprise license');
    }

    const taskId = await scheduleInstallAllTask({
      taskManager: this.taskManager,
      logger: this.logger,
      inferenceId,
    });

    if (request) {
      this.auditService.asScoped(request).log({
        message:
          `User is requesting installation of product documentation for AI Assistants. Task ID=[${taskId}]` +
          (inferenceId ? `| Inference ID=[${inferenceId}]` : ''),
        event: {
          action: 'product_documentation_create',
          category: ['database'],
          type: ['creation'],
          outcome: 'unknown',
        },
      });
    }

    if (wait) {
      await waitUntilTaskCompleted({
        taskManager: this.taskManager,
        taskId,
        timeout: TEN_MIN_IN_MS,
      });
    }
  }

  async update(options: DocUpdateOptions): Promise<void> {
    const { request, wait = false, inferenceId, forceUpdate } = options;

    const taskId = await scheduleEnsureUpToDateTask({
      taskManager: this.taskManager,
      logger: this.logger,
      inferenceId,
      forceUpdate,
    });

    if (request) {
      this.auditService.asScoped(request).log({
        message:
          `User is requesting update of product documentation for AI Assistants. Task ID=[${taskId}]` +
          (inferenceId ? `| Inference ID=[${inferenceId}]` : ''),
        event: {
          action: 'product_documentation_update',
          category: ['database'],
          type: ['change'],
          outcome: 'unknown',
        },
      });
    }

    if (wait) {
      await waitUntilTaskCompleted({
        taskManager: this.taskManager,
        taskId,
        timeout: TEN_MIN_IN_MS,
      });
    }
  }

  async ensureDefaultProductDocumentation(): Promise<void> {
    const inferenceId = await resolveDefaultInferenceIdFromInferenceGet(
      () => this.esClient.inference.get({}),
      { resourceType: ResourceTypes.productDoc }
    );
    const { status } = await this.getStatus({ inferenceId });

    this.logger.info(
      `Ensuring product documentation for default inference ID [${inferenceId}] (status: ${status})`
    );

    if (status === 'uninstalled') {
      const license = await this.licensing.getLicense();
      if (!checkLicense(license)) {
        this.logger.debug(
          `Skipping product documentation install for inference ID [${inferenceId}]: invalid license`
        );
        return;
      }
      await this.install({ inferenceId, wait: true });
      return;
    }

    await this.update({ inferenceId });
  }

  async updateAll(options?: DocUpdateAllOptions): Promise<{ inferenceIds: string[] }> {
    const { forceUpdate, inferenceIds } = options ?? {};
    const idsToUpdate: string[] =
      Array.isArray(inferenceIds) && inferenceIds?.length > 0
        ? inferenceIds
        : (await this.docInstallClient.getPreviouslyInstalledInferenceIds()) ?? [];
    this.logger.info(
      `Updating product documentation to latest version for Inference IDs: ${idsToUpdate}`
    );
    await Promise.all(idsToUpdate.map((inferenceId) => this.update({ inferenceId, forceUpdate })));
    return {
      inferenceIds: idsToUpdate,
    };
  }

  async updateSecurityLabsAll(options?: {
    forceUpdate?: boolean;
  }): Promise<{ inferenceIds: string[] }> {
    const { forceUpdate } = options ?? {};
    const idsToUpdate =
      (await this.docInstallClient.getPreviouslyInstalledSecurityLabsInferenceIds()) ?? [];
    if (idsToUpdate.length === 0) {
      return { inferenceIds: [] };
    }
    this.logger.info(
      `Updating Security Labs content to latest version for Inference IDs: ${idsToUpdate}`
    );
    await Promise.all(
      idsToUpdate.map((inferenceId) =>
        scheduleEnsureSecurityLabsUpToDateTask({
          taskManager: this.taskManager,
          logger: this.logger,
          inferenceId,
          forceUpdate,
        })
      )
    );
    return { inferenceIds: idsToUpdate };
  }

  async uninstall(options: DocUninstallOptions): Promise<void> {
    const { request, wait = false, inferenceId, resourceType } = options;

    const taskId = await scheduleUninstallAllTask({
      taskManager: this.taskManager,
      logger: this.logger,
      inferenceId,
      resourceType,
    });

    if (request) {
      this.auditService.asScoped(request).log({
        message: `User is requesting deletion of product documentation for AI Assistants. Task ID=[${taskId}]`,
        event: {
          action: 'product_documentation_delete',
          category: ['database'],
          type: ['deletion'],
          outcome: 'unknown',
        },
      });
    }

    if (wait) {
      await waitUntilTaskCompleted({
        taskManager: this.taskManager,
        taskId,
        timeout: TEN_MIN_IN_MS,
      });
    }
  }

  /**
   * @param inferenceId - The inference ID to get the status for. If not provided, the default ELSER inference ID will be used.
   */
  async getStatus({ inferenceId }: { inferenceId: string }): Promise<DocGetStatusResponse> {
    const taskId = isImpliedDefaultElserInferenceId(inferenceId)
      ? INSTALL_ALL_TASK_ID
      : INSTALL_ALL_TASK_ID_MULTILINGUAL;
    const taskStatus = await getTaskStatus({
      taskManager: this.taskManager,
      taskId,
    });
    if (taskStatus !== 'not_scheduled') {
      const status = convertTaskStatus(taskStatus);
      if (status !== 'unknown') {
        return { status };
      }
    }

    const installStatus = await this.docInstallClient.getInstallationStatus({ inferenceId });
    const overallStatus = getOverallStatus(Object.values(installStatus).map((v) => v.status));
    return { status: overallStatus, installStatus };
  }

  async getStatuses({
    inferenceIds,
  }: {
    inferenceIds: string[];
  }): Promise<Record<string, PerformUpdateResponse>> {
    // check status after installation in case of failure
    const statuses = await Promise.allSettled(
      inferenceIds.map((inferenceId) =>
        this.getStatus({
          inferenceId,
        })
      )
    );
    const body = statuses.reduce<Record<string, PerformUpdateResponse>>(
      (acc, installationStatus, index) => {
        const inferenceId = inferenceIds[index];
        // Handle internal server error
        if (installationStatus.status === 'rejected') {
          const failureReason = installationStatus.reason;
          return {
            ...acc,
            [inferenceId]: {
              installed: status === 'uninstalled',
              ...(failureReason ? { failureReason: JSON.stringify(failureReason) } : {}),
            },
          };
        }
        if (installationStatus.status === 'fulfilled') {
          const { status, installStatus } = installationStatus.value;

          let failureReason = null;
          // Check for real reason of previous installation failure
          if (status === 'error' && installStatus) {
            failureReason = Object.values(installStatus)
              .filter(
                (product: ProductInstallState) =>
                  product.status === 'error' && product.failureReason
              )
              .map((product: ProductInstallState) => product.failureReason)
              .join('\n');
          }
          return {
            ...acc,
            [inferenceId]: {
              installed: status === 'installed',
              ...(failureReason ? { failureReason } : {}),
            } as PerformUpdateResponse,
          };
        }
        return acc;
      },
      {}
    );
    return body;
  }

  // Security Labs methods

  async installSecurityLabs(options: SecurityLabsInstallOptions): Promise<void> {
    const { request, inferenceId, version } = options;

    const license = await this.licensing.getLicense();
    if (!checkLicense(license)) {
      throw new Error('Security Labs content requires an enterprise license');
    }

    if (!this.packageInstaller) {
      throw new Error('PackageInstaller not available');
    }

    if (request) {
      this.auditService.asScoped(request).log({
        message:
          `User is requesting installation of Security Labs content for AI Assistants.` +
          (inferenceId ? ` Inference ID=[${inferenceId}]` : '') +
          (version ? ` Version=[${version}]` : ''),
        event: {
          action: 'security_labs_create',
          category: ['database'],
          type: ['creation'],
          outcome: 'unknown',
        },
      });
    }

    try {
      await this.packageInstaller.installSecurityLabs({
        version,
        inferenceId,
      });
    } catch (error) {
      this.logger.error(`Failed to install Security Labs content: ${error.message}`);
      throw error;
    }
  }

  async uninstallSecurityLabs(options: SecurityLabsUninstallOptions): Promise<void> {
    const { request, inferenceId } = options;

    if (!this.packageInstaller) {
      throw new Error('PackageInstaller not available');
    }

    if (request) {
      this.auditService.asScoped(request).log({
        message: `User is requesting deletion of Security Labs content for AI Assistants.`,
        event: {
          action: 'security_labs_delete',
          category: ['database'],
          type: ['deletion'],
          outcome: 'unknown',
        },
      });
    }

    try {
      await this.packageInstaller.uninstallSecurityLabs({ inferenceId });
    } catch (error) {
      this.logger.error(`Failed to uninstall Security Labs content: ${error.message}`);
      throw error;
    }
  }
  async uninstallOpenAPISpec(options: SecurityLabsUninstallOptions): Promise<void> {
    const { request, inferenceId } = options;
    if (!this.packageInstaller) {
      throw new Error('PackageInstaller not available');
    }
    if (request) {
      this.auditService.asScoped(request).log({
        message: `User is requesting deletion of OpenAPI Spec content for AI Assistants.`,
        event: {
          action: 'openapi_spec_delete',
          category: ['database'],
          type: ['deletion'],
          outcome: 'unknown',
        },
      });
    }
    try {
      await this.packageInstaller.uninstallOpenAPISpec({ inferenceId });
    } catch (error) {
      this.logger.error(`Failed to uninstall OpenAPI Spec content: ${error.message}`);
      throw error;
    }
  }

  async getSecurityLabsStatus({
    inferenceId,
  }: {
    inferenceId: string;
  }): Promise<SecurityLabsStatusResponse> {
    if (!this.packageInstaller) {
      return { status: 'uninstalled' };
    }

    try {
      return await this.packageInstaller.getSecurityLabsStatus({ inferenceId });
    } catch (error) {
      this.logger.error(`Failed to get Security Labs status: ${error.message}`);
      return {
        status: 'error',
        failureReason: error.message,
      };
    }
  }

  // openapi spec methods
  async installOpenApiSpec(options: SecurityLabsInstallOptions): Promise<void> {
    const { request, inferenceId, version } = options;

    const license = await this.licensing.getLicense();
    if (!checkLicense(license)) {
      throw new Error('OpenAPI Spec content requires an enterprise license');
    }

    if (!this.packageInstaller) {
      throw new Error('PackageInstaller not available');
    }

    if (request) {
      this.auditService.asScoped(request).log({
        message:
          `User is requesting installation of OpenAPI Spec content for AI Assistants.` +
          (inferenceId ? ` Inference ID=[${inferenceId}]` : '') +
          (version ? ` Version=[${version}]` : ''),
        event: {
          action: 'openapi_spec_create',
          category: ['database'],
          type: ['creation'],
          outcome: 'unknown',
        },
      });
    }

    try {
      await this.packageInstaller.installOpenAPISpec({
        version,
        inferenceId,
      });
    } catch (error) {
      this.logger.error(`Failed to install OpenAPI Spec content: ${error.message}`);
      throw error;
    }
  }

  async getOpenApiSpecStatus({
    inferenceId,
  }: {
    inferenceId: string;
  }): Promise<SecurityLabsStatusResponse> {
    if (!this.packageInstaller) {
      return { status: 'uninstalled' };
    }

    try {
      return await this.packageInstaller.getOpenApiSpecStatus({ inferenceId });
    } catch (error) {
      this.logger.error(`Failed to get OpenAPI Spec status: ${error.message}`);
      return {
        status: 'error',
        failureReason: error.message,
      };
    }
  }
}

const convertTaskStatus = (taskStatus: TaskStatus): InstallationStatus | 'unknown' => {
  switch (taskStatus) {
    case TaskStatus.Idle:
    case TaskStatus.Claiming:
    case TaskStatus.Running:
      return 'installing';
    case TaskStatus.Failed:
      return 'error';
    case TaskStatus.Unrecognized:
    case TaskStatus.DeadLetter:
    case TaskStatus.ShouldDelete:
    default:
      return 'unknown';
  }
};

const getOverallStatus = (statuses: InstallationStatus[]): InstallationStatus => {
  const statusOrder: InstallationStatus[] = [
    'error',
    'installing',
    'uninstalling',
    'uninstalled',
    'installed',
  ];
  for (const status of statusOrder) {
    if (statuses.includes(status)) {
      return status;
    }
  }
  return 'installed';
};
