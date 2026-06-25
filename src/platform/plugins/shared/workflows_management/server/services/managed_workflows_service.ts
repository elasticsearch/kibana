/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createHash } from 'node:crypto';
import type { KibanaRequest, Logger } from '@kbn/core/server';
import { pickManagedWorkflowFields } from '@kbn/workflows';
import {
  getManagedWorkflowDefinition,
  getManagedWorkflowDefinitions,
  type ManagedWorkflowDefinition,
  type ManagedWorkflowId,
  type ManagedWorkflowTemplateValues,
} from '@kbn/workflows/managed';
import { GLOBAL_WORKFLOW_SPACE_ID } from '@kbn/workflows/server';
import type {
  ExecuteManagedWorkflowOptions,
  GetManagedWorkflowStatusOptions,
  ManagedWorkflowOperationOptions,
  ManagedWorkflowServiceInstallOptions,
  ManagedWorkflowStatus,
  ManagedWorkflowStatusReport,
} from '@kbn/workflows/server/types';
import type { WorkflowsExecutionEnginePluginStart } from '@kbn/workflows-execution-engine/server';
import { updateYamlField } from '@kbn/workflows-yaml';
import type { WorkflowCrudService } from './workflow_crud_service';
import { WorkflowChangeHistoryAction } from '../../common/lib/workflow_change_history/constants';
import { maybeApplyWorkflowVersion } from '../lib/workflow_version';
import { isRetryableWorkflowWriteConflict } from '../lib/workflow_write_conflicts';
import type { WorkflowProperties } from '../storage/workflow_storage';

const MANAGED_WORKFLOW_SYSTEM_USER = 'elastic/kibana';
const MAX_MANAGED_INSTALL_RETRIES = 2;

const computeDefinitionHash = (yaml: string): string => {
  return createHash('sha256').update(yaml.trim()).digest('hex');
};

interface ManagedWorkflowsServiceDeps {
  crudService: WorkflowCrudService;
  workflowsExecutionEngine: WorkflowsExecutionEnginePluginStart;
  logger: Logger;
}

export class ManagedWorkflowsService {
  private readonly readyPluginIds = new Set<string>();
  /**
   * Tracks every static workflow installed during the startup window, keyed by plugin ID.
   * Each entry is a composite key of `${workflowDocumentId}:${spaceId}` — this captures
   * both the suffix variation and the target space so that reconciliation can detect
   * individual instances that were not re-installed across restarts.
   */
  private readonly installedDocKeysByPlugin = new Map<string, Set<string>>();
  private readonly logger: Logger;

  constructor(private readonly deps: ManagedWorkflowsServiceDeps) {
    this.logger = deps.logger;
  }

  public isPluginReady(pluginId: string): boolean {
    return this.readyPluginIds.has(pluginId);
  }

  /**
   * Called when a plugin signals it has finished installing all its static workflows.
   * Triggers per-plugin reconciliation: removes persisted static workflows that were
   * not installed during the startup window and upgrades dynamic auto workflows.
   */
  public async pluginReady(pluginId: string): Promise<void> {
    if (this.readyPluginIds.has(pluginId)) {
      this.logger.warn(
        `Managed workflows: plugin '${pluginId}' called ready() more than once. Ignoring.`
      );
      return;
    }
    await this.reconcilePluginManagedWorkflows(pluginId);
    this.readyPluginIds.add(pluginId);
  }

  /**
   * Global cleanup for workflows whose owner plugin is no longer registered
   * or whose definition no longer exists in the registry.
   * Safe to run immediately at start — no dependency on install() calls.
   */
  public async cleanupUnregisteredOrphans(registeredOwnerPluginIds: string[]): Promise<void> {
    const knownDefinitionIds = new Set(getManagedWorkflowDefinitions().map((d) => d.id));
    const knownPluginIds = new Set(registeredOwnerPluginIds.filter(Boolean));

    const existingManagedDocs = await this.deps.crudService.getManagedWorkflowDocumentsAllSpaces({
      includeDeleted: true,
    });

    const orphanIdsBySpace = new Map<string, string[]>();
    for (const { id, source } of existingManagedDocs) {
      const owner = source.managedBy ?? undefined;
      const definitionId = source.originManagedWorkflowId ?? undefined;

      const isHardOrphan =
        !owner ||
        !definitionId ||
        !knownPluginIds.has(owner) ||
        !knownDefinitionIds.has(definitionId);

      if (isHardOrphan) {
        const workflowSpaceId = source.spaceId;
        const ids = orphanIdsBySpace.get(workflowSpaceId) ?? [];
        ids.push(id);
        orphanIdsBySpace.set(workflowSpaceId, ids);
      }
    }

    for (const [spaceId, orphanIds] of orphanIdsBySpace) {
      if (orphanIds.length > 0) {
        this.logger.info(
          `Managed workflows: removing ${orphanIds.length} hard-orphaned workflow(s) in space '${spaceId}' ` +
            `(unregistered owner or removed definition)`
        );
        await this.deps.crudService.deleteWorkflows(orphanIds, spaceId, { force: true });
      }
    }
  }

  public async installManagedWorkflow(
    id: ManagedWorkflowId,
    options: ManagedWorkflowServiceInstallOptions,
    registeredPluginId: string
  ): Promise<void> {
    for (let attempt = 0; attempt <= MAX_MANAGED_INSTALL_RETRIES; attempt++) {
      try {
        await this.installManagedWorkflowOnce(id, options, registeredPluginId);
        return;
      } catch (error) {
        if (!isRetryableWorkflowWriteConflict(error) || attempt === MAX_MANAGED_INSTALL_RETRIES) {
          throw error;
        }

        this.logger.debug(
          `Managed workflows: retrying install for '${id}' after concurrent update conflict`
        );
      }
    }
  }

  private async installManagedWorkflowOnce(
    id: ManagedWorkflowId,
    options: ManagedWorkflowServiceInstallOptions,
    registeredPluginId: string
  ): Promise<void> {
    const definition = getManagedWorkflowDefinition(id);
    if (!definition) {
      throw new Error(`Unknown managed workflow id: ${id}`);
    }
    this.assertPluginRegistration(definition, registeredPluginId);

    const workflowDocumentId = this.resolveWorkflowDocumentId(id, options);
    const spaceId = this.getRequiredSpaceId(options);

    this.trackInstall(registeredPluginId, id, workflowDocumentId, spaceId);

    const isStartupWindow = !this.readyPluginIds.has(registeredPluginId);
    const now = new Date();
    const definitionHash = this.computeManagedDefinitionHash(definition);
    const existingDocument = await this.deps.crudService.getWorkflowDocumentWithVersion(
      workflowDocumentId,
      spaceId
    );
    const existing = existingDocument?.source;
    const { yaml, managedTemplateValues } = this.resolveManagedWorkflowYaml({
      definition,
      values: options.values,
      existingTemplateValues: existing?.managedTemplateValues,
    });

    if (!existing) {
      const document = await this.prepareManagedWorkflowDocument({
        definition,
        workflowDocumentId,
        yaml,
        managedTemplateValues,
        definitionHash,
        spaceId,
        now,
      });
      const versioningEnabled = this.deps.crudService.isWorkflowVersioningEnabled();
      const documentWithVersion = maybeApplyWorkflowVersion(document, undefined, versioningEnabled);
      const savedDocument = await this.deps.crudService.createWorkflowDocument(
        workflowDocumentId,
        spaceId,
        documentWithVersion
      );
      await this.deps.crudService.logWorkflowChangesAfterWrite({
        workflows: [{ id: workflowDocumentId, document: savedDocument }],
        action: WorkflowChangeHistoryAction.workflowInstall,
        spaceId,
        timestamp: now,
      });
      return;
    }

    if (!existing.managed) {
      throw new Error(
        `Cannot install managed workflow '${id}' as '${workflowDocumentId}' because a user workflow with the same id already exists`
      );
    }

    // For unchanged definitions, preserve the current document as-is.
    // Enforced enablement is reapplied only when a managed update is installed.
    if (
      existing.definitionHash === definitionHash &&
      existing.managedVersion === definition.version
    ) {
      if (this.areTemplateValuesEqual(existing.managedTemplateValues, managedTemplateValues)) {
        return;
      }
    }

    if (definition.management.versionStrategy === 'on_adopt' && isStartupWindow) {
      return;
    }

    const enabled = definition.management.enablement === 'enforced' ? undefined : existing.enabled;
    const document = await this.prepareManagedWorkflowDocument({
      definition,
      workflowDocumentId,
      yaml,
      managedTemplateValues,
      definitionHash,
      spaceId,
      now,
      enabled,
      createdAt: existing.created_at,
    });
    const versioningEnabled = this.deps.crudService.isWorkflowVersioningEnabled();
    const documentWithVersion = maybeApplyWorkflowVersion(document, existing, versioningEnabled);
    const savedDocument = await this.deps.crudService.writeWorkflowDocumentWithOcc(
      workflowDocumentId,
      spaceId,
      {
        document: documentWithVersion,
        ifSeqNo: existingDocument.seqNo,
        ifPrimaryTerm: existingDocument.primaryTerm,
      }
    );
    await this.deps.crudService.logWorkflowChangesAfterWrite({
      workflows: [{ id: workflowDocumentId, document: savedDocument }],
      action: WorkflowChangeHistoryAction.workflowUpdate,
      spaceId,
      timestamp: now,
    });
  }

  public async uninstallManagedWorkflow(
    id: ManagedWorkflowId,
    options: ManagedWorkflowOperationOptions,
    registeredPluginId: string
  ): Promise<void> {
    const definition = getManagedWorkflowDefinition(id);
    if (!definition) {
      throw new Error(`Unknown managed workflow id: ${id}`);
    }
    this.assertPluginRegistration(definition, registeredPluginId);

    const workflowDocumentId = this.resolveWorkflowDocumentId(id, options);
    const spaceId = this.getRequiredSpaceId(options);
    const existing = await this.deps.crudService.getWorkflowDocumentSource(
      workflowDocumentId,
      spaceId,
      {
        includeDeleted: true,
      }
    );
    if (!existing || !existing.managed) {
      return;
    }

    await this.deps.crudService.deleteWorkflows([workflowDocumentId], spaceId, { force: true });
  }

  public async getManagedWorkflowStatus(
    id: ManagedWorkflowId,
    options: GetManagedWorkflowStatusOptions,
    registeredPluginId: string
  ): Promise<ManagedWorkflowStatusReport> {
    const definition = getManagedWorkflowDefinition(id);
    if (!definition) {
      throw new Error(`Unknown managed workflow id: ${id}`);
    }
    this.assertPluginRegistration(definition, registeredPluginId);

    const workflowDocumentId = this.resolveWorkflowDocumentId(id, options);
    const spaceId = this.getRequiredSpaceId(options);
    const registryHash = this.computeManagedDefinitionHash(definition);
    const existing = await this.deps.crudService.getWorkflowDocumentSource(
      workflowDocumentId,
      spaceId,
      {
        includeDeleted: true,
        includeGlobal: true,
      }
    );

    if (!existing || existing.deleted_at) {
      return this.createManagedWorkflowStatusReport({
        status: 'missing',
        workflowDocumentId,
        definitionId: id,
        spaceId,
        definition,
        registryHash,
      });
    }

    if (existing.managed !== true) {
      return this.createManagedWorkflowStatusReport({
        status: 'not_managed',
        workflowDocumentId,
        definitionId: id,
        spaceId,
        definition,
        registryHash,
        existing,
      });
    }

    const storedHash = existing.definitionHash ?? null;
    const storedVersion = existing.managedVersion ?? null;
    let status: ManagedWorkflowStatus = 'intact';
    if (!existing.valid || !existing.definition) {
      status = 'invalid';
    } else if (!existing.enabled) {
      status = 'disabled';
    } else if (
      storedHash !== registryHash ||
      storedVersion !== definition.version ||
      existing.originManagedWorkflowId !== definition.id
    ) {
      status = 'drifted';
    }

    return this.createManagedWorkflowStatusReport({
      status,
      workflowDocumentId,
      definitionId: id,
      spaceId,
      definition,
      registryHash,
      existing,
    });
  }

  public async executeManagedWorkflow(
    id: ManagedWorkflowId,
    request: KibanaRequest,
    options: ExecuteManagedWorkflowOptions,
    registeredPluginId: string
  ): Promise<string> {
    const definition = getManagedWorkflowDefinition(id);
    if (!definition) {
      throw new Error(`Unknown managed workflow id: ${id}`);
    }
    this.assertPluginRegistration(definition, registeredPluginId);

    const workflowDocumentId = this.resolveWorkflowDocumentId(id, options);
    const spaceId = this.getRequiredSpaceId(options);
    const existing = await this.deps.crudService.getWorkflowDocumentSource(
      workflowDocumentId,
      spaceId,
      {
        includeGlobal: true,
      }
    );
    if (!existing || !existing.managed) {
      throw new Error(`Managed workflow '${id}' as '${workflowDocumentId}' not found`);
    }
    if (!existing.definition) {
      throw new Error(
        `Managed workflow '${id}' as '${workflowDocumentId}' has no valid definition`
      );
    }

    const context: Record<string, unknown> = {
      spaceId,
      inputs: options.inputs ?? {},
      triggeredBy: options.triggeredBy ?? 'manual',
    };
    if (options.metadata) {
      context.metadata = options.metadata;
    }

    const response = await this.deps.workflowsExecutionEngine.executeWorkflow(
      {
        id: workflowDocumentId,
        name: existing.name,
        enabled: existing.enabled,
        definition: existing.definition,
        yaml: existing.yaml,
        ...pickManagedWorkflowFields(existing),
      },
      context,
      request
    );

    return response.workflowExecutionId;
  }

  /**
   * Per-plugin reconciliation triggered by ready().
   * Removes persisted static workflow documents that were NOT installed during the
   * startup window, and upgrades persisted dynamic auto workflow documents to the
   * current registry definition.
   */
  private async reconcilePluginManagedWorkflows(pluginId: string): Promise<void> {
    const installedDocKeys = this.installedDocKeysByPlugin.get(pluginId) ?? new Set<string>();

    const pluginDefinitions = getManagedWorkflowDefinitions().filter(
      (d) => d.pluginId === pluginId
    );
    const staticDefinitionIds = new Set(
      pluginDefinitions.filter((d) => d.management.lifecycle === 'static').map((d) => d.id)
    );
    const autoDynamicDefinitionById = new Map(
      pluginDefinitions
        .filter(
          (d) => d.management.lifecycle === 'dynamic' && d.management.versionStrategy === 'auto'
        )
        .map((d) => [d.id, d])
    );

    if (staticDefinitionIds.size === 0 && autoDynamicDefinitionById.size === 0) {
      return;
    }

    const existingManagedDocs = await this.deps.crudService.getManagedWorkflowDocumentsAllSpaces({
      pluginId,
    });

    const orphanIdsBySpace = new Map<string, string[]>();
    const dynamicUpdates: Array<{
      definitionId: ManagedWorkflowId;
      workflowId: string;
      spaceId: string;
    }> = [];
    for (const { id: docId, source } of existingManagedDocs) {
      const definitionId = source.originManagedWorkflowId;
      const isPluginStaticDoc = !!definitionId && staticDefinitionIds.has(definitionId);
      const autoDynamicDefinition = definitionId
        ? autoDynamicDefinitionById.get(definitionId)
        : undefined;
      const workflowSpaceId = source.spaceId ?? GLOBAL_WORKFLOW_SPACE_ID;

      if (isPluginStaticDoc) {
        const docKey = `${docId}:${workflowSpaceId}`;

        if (!installedDocKeys.has(docKey)) {
          const ids = orphanIdsBySpace.get(workflowSpaceId) ?? [];
          ids.push(docId);
          orphanIdsBySpace.set(workflowSpaceId, ids);
        }
      }

      if (autoDynamicDefinition) {
        dynamicUpdates.push({
          definitionId: autoDynamicDefinition.id as ManagedWorkflowId,
          workflowId: docId,
          spaceId: workflowSpaceId,
        });
      }
    }

    for (const [spaceId, orphanIds] of orphanIdsBySpace) {
      if (orphanIds.length > 0) {
        this.logger.info(
          `Managed workflows: removing ${orphanIds.length} orphaned static workflow(s) ` +
            `for plugin '${pluginId}' in space '${spaceId}'`
        );
        await this.deps.crudService.deleteWorkflows(orphanIds, spaceId, { force: true });
      }
    }

    for (const update of dynamicUpdates) {
      await this.installManagedWorkflow(
        update.definitionId,
        { workflowId: update.workflowId, spaceId: update.spaceId },
        pluginId
      );
    }
  }

  private trackInstall(
    pluginId: string,
    definitionId: string,
    workflowDocumentId: string,
    spaceId: string
  ): void {
    let docKeys = this.installedDocKeysByPlugin.get(pluginId);
    if (!docKeys) {
      docKeys = new Set();
      this.installedDocKeysByPlugin.set(pluginId, docKeys);
    }
    docKeys.add(`${workflowDocumentId}:${spaceId}`);

    if (this.readyPluginIds.has(pluginId)) {
      const definition = getManagedWorkflowDefinition(definitionId);
      if (definition && definition.management.lifecycle === 'static') {
        this.logger.warn(
          `Managed workflows: '${workflowDocumentId}' (static workflow '${definitionId}') installed by plugin ` +
            `'${pluginId}' after ready(). Static workflows should be installed before calling ready(). ` +
            `Consider using lifecycle: 'dynamic' or installing during start().`
        );
      }
    }
  }

  private applyManagedEnabledState(
    document: WorkflowProperties,
    enabled: boolean
  ): WorkflowProperties {
    return {
      ...document,
      enabled,
      yaml: updateYamlField(document.yaml, 'enabled', enabled),
      definition: document.definition
        ? {
            ...document.definition,
            enabled,
          }
        : null,
    };
  }

  private createManagedWorkflowStatusReport(params: {
    status: ManagedWorkflowStatus;
    workflowDocumentId: string;
    definitionId: ManagedWorkflowId;
    spaceId: string;
    definition: ManagedWorkflowDefinition;
    registryHash: string;
    existing?: WorkflowProperties;
  }): ManagedWorkflowStatusReport {
    const {
      status,
      workflowDocumentId,
      definitionId,
      spaceId,
      definition,
      registryHash,
      existing,
    } = params;

    return {
      status,
      workflowId: workflowDocumentId,
      definitionId,
      spaceId: existing?.spaceId ?? spaceId,
      installed: Boolean(existing),
      enabled: existing?.enabled ?? null,
      valid: existing?.valid ?? null,
      managedBy: existing?.managedBy ?? null,
      storedVersion: existing?.managedVersion ?? null,
      registryVersion: definition.version,
      storedHash: existing?.definitionHash ?? null,
      registryHash,
    };
  }

  private async prepareManagedWorkflowDocument(params: {
    definition: ManagedWorkflowDefinition;
    workflowDocumentId: string;
    yaml: string;
    managedTemplateValues: ManagedWorkflowTemplateValues | null;
    definitionHash: string;
    spaceId: string;
    now: Date;
    enabled?: boolean;
    createdAt?: string;
  }): Promise<WorkflowProperties> {
    const {
      definition,
      workflowDocumentId,
      yaml,
      managedTemplateValues,
      definitionHash,
      spaceId,
      now,
      enabled,
      createdAt,
    } = params;
    const { workflowData } = await this.deps.crudService.prepareWorkflowDocumentForStorage({
      id: workflowDocumentId,
      yaml,
      actor: MANAGED_WORKFLOW_SYSTEM_USER,
      lightweightValidation: true,
      now,
      spaceId,
    });

    const managedWorkflowData = {
      ...workflowData,
      managed: true,
      managedBy: definition.pluginId,
      definitionHash,
      managedTemplateValues: managedTemplateValues as Record<string, unknown> | null,
      originManagedWorkflowId: definition.id,
      lifecycle: definition.management.lifecycle,
      managedVersion: definition.version,
    };

    return {
      ...this.applyManagedEnabledState(managedWorkflowData, enabled ?? workflowData.enabled),
      ...(createdAt ? { created_at: createdAt } : {}),
    };
  }

  private assertPluginRegistration(
    definition: ManagedWorkflowDefinition,
    registeredPluginId: string
  ): void {
    if (registeredPluginId !== definition.pluginId) {
      throw new Error(
        `Managed workflow '${definition.id}' is owned by plugin '${definition.pluginId}' but was registered by '${registeredPluginId}'`
      );
    }
  }

  private resolveWorkflowDocumentId(id: string, options: ManagedWorkflowOperationOptions): string {
    const customId = options.workflowId?.trim();
    const suffix = options.workflowIdSuffix?.trim();

    if (customId && suffix) {
      throw new Error(
        `Managed workflow '${id}' cannot be installed with both workflowId and workflowIdSuffix`
      );
    }

    if (suffix) {
      return `${id}-${suffix}`;
    }

    if (customId) {
      if (!customId.startsWith(`${id}-`) && customId !== id) {
        throw new Error(
          `Managed workflow '${id}' custom workflowId must equal '${id}' or start with '${id}-'`
        );
      }
      return customId;
    }

    return id;
  }

  private getRequiredSpaceId(options: ManagedWorkflowOperationOptions): string {
    const spaceId = options.spaceId?.trim();
    if (!spaceId) {
      throw new Error(
        `Managed workflow operations require an explicit spaceId. Use '${GLOBAL_WORKFLOW_SPACE_ID}' for global workflows.`
      );
    }
    return spaceId;
  }

  private resolveManagedWorkflowYaml(params: {
    definition: ManagedWorkflowDefinition;
    values?: ManagedWorkflowTemplateValues;
    existingTemplateValues?: ManagedWorkflowTemplateValues | null;
  }): { yaml: string; managedTemplateValues: ManagedWorkflowTemplateValues | null } {
    const { definition, values, existingTemplateValues } = params;

    if (definition.yamlTemplate) {
      const templateValues = values ?? existingTemplateValues;
      if (!templateValues || Object.keys(templateValues).length === 0) {
        throw new Error(
          `Managed workflow '${definition.id}' uses yamlTemplate but no template values were provided and none are persisted`
        );
      }
      const yaml = definition.yamlTemplate(templateValues);
      return {
        yaml,
        managedTemplateValues: templateValues,
      };
    }

    if (!definition.yaml) {
      throw new Error(
        `Managed workflow '${definition.id}' must define either yaml or yamlTemplate`
      );
    }
    if (values) {
      throw new Error(
        `Managed workflow '${definition.id}' does not define yamlTemplate but values were provided`
      );
    }

    return {
      yaml: definition.yaml,
      managedTemplateValues: null,
    };
  }

  private computeManagedDefinitionHash(definition: ManagedWorkflowDefinition): string {
    if (definition.yamlTemplate) {
      return computeDefinitionHash(definition.yamlTemplate.toString());
    }
    if (!definition.yaml) {
      throw new Error(
        `Managed workflow '${definition.id}' must define either yaml or yamlTemplate`
      );
    }
    return computeDefinitionHash(definition.yaml);
  }

  private areTemplateValuesEqual(
    existing: ManagedWorkflowTemplateValues | null | undefined,
    next: ManagedWorkflowTemplateValues | null
  ): boolean {
    return JSON.stringify(existing ?? null) === JSON.stringify(next ?? null);
  }
}
