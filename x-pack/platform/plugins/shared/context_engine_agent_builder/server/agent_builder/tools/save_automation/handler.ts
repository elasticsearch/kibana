/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ATTACHMENT_REF_ACTOR, getLatestVersion } from '@kbn/agent-builder-common/attachments';
import {
  executeWorkflow,
  hasWorkflowCreatePrivilege,
  hasWorkflowExecutePrivilege,
  hasWorkflowReadPrivilege,
  hasWorkflowUpdatePrivilege,
} from '@kbn/agent-builder-tools-base/workflows';
import type { AttachmentStateManager } from '@kbn/agent-builder-server/attachments';
import type { CoreStart, Logger } from '@kbn/core/server';
import type { KibanaRequest } from '@kbn/core-http-server';
import type { SecurityPluginStart } from '@kbn/security-plugin/server';
import type { WorkflowsServerPluginSetup } from '@kbn/workflows-management-plugin/server';
import { parseYamlToJSONWithoutValidation } from '@kbn/workflows-yaml';
import type { AiIndexService } from '@kbn/context-engine-plugin/server/ai_indices/service';
import {
  AI_INDEX_ATTACHMENT_TYPE,
  WORKFLOW_YAML_ATTACHMENT_TYPE,
} from '../../../../common/agent_builder_attachments';
import { assertContextEngineWriteAccess } from '../../assert_context_engine_write_access';

export interface SaveAutomationParams {
  workflowAttachmentId?: string;
  workflowYaml?: string;
  workflowId?: string;
  aiIndexId?: string;
  run?: boolean;
}

export interface SaveAutomationRunResult {
  started: boolean;
  /** Execution id to poll for status, present when the run started. */
  executionId?: string;
  /** True when the workflow was disabled and had to be enabled to run it. */
  enabledForRun?: boolean;
  /** Why the run did not start. */
  reason?: string;
}

export interface SaveAutomationResult {
  aiIndexId: string;
  workflowId: string;
  status: 'saved_and_attached' | 'attached' | 'already_attached';
  /** Present when the caller asked to run the automation after saving it. */
  run?: SaveAutomationRunResult;
}

type WorkflowsManagementApi = WorkflowsServerPluginSetup['management'];

interface WorkflowYamlAttachmentData {
  yaml: string;
  workflowId?: string;
  name?: string;
}

const isWorkflowYamlData = (data: unknown): data is WorkflowYamlAttachmentData => {
  if (!data || typeof data !== 'object' || !('yaml' in data)) {
    return false;
  }

  return typeof data.yaml === 'string' && data.yaml.length > 0;
};

export const parseWorkflowNameFromYaml = (yaml: string): string | undefined => {
  const parsed = parseYamlToJSONWithoutValidation(yaml);
  if (!parsed.success || parsed.json == null || typeof parsed.json !== 'object') {
    return undefined;
  }

  const name = (parsed.json as Record<string, unknown>).name;
  return typeof name === 'string' && name.trim() !== '' ? name : undefined;
};

/**
 * The `enabled` flag a definition declares, which is what it will be saved as. Absent counts as
 * disabled, matching how a stored workflow with no flag is treated when a run tries to start it.
 */
export const parseWorkflowEnabledFromYaml = (yaml: string): boolean | undefined => {
  const parsed = parseYamlToJSONWithoutValidation(yaml);
  if (!parsed.success || parsed.json == null || typeof parsed.json !== 'object') {
    return undefined;
  }

  const enabled = (parsed.json as Record<string, unknown>).enabled;
  return typeof enabled === 'boolean' ? enabled : undefined;
};

const findWorkflowAttachmentData = (
  attachments: AttachmentStateManager | undefined,
  workflowAttachmentId: string
): WorkflowYamlAttachmentData | undefined => {
  const attachment = attachments
    ?.getAll()
    .find(
      (entry) => entry.id === workflowAttachmentId && entry.type === WORKFLOW_YAML_ATTACHMENT_TYPE
    );

  if (!attachment) {
    return undefined;
  }

  const latestVersion = getLatestVersion(attachment);
  return latestVersion && isWorkflowYamlData(latestVersion.data) ? latestVersion.data : undefined;
};

export const tryResolveWorkflowDisplayNameFromAttachments = (
  attachments: AttachmentStateManager | undefined,
  workflowAttachmentId: string
): string | undefined => {
  const data = findWorkflowAttachmentData(attachments, workflowAttachmentId);
  return data ? data.name ?? parseWorkflowNameFromYaml(data.yaml) : undefined;
};

export const tryResolveWorkflowEnabledFromAttachments = (
  attachments: AttachmentStateManager | undefined,
  workflowAttachmentId: string
): boolean | undefined => {
  const data = findWorkflowAttachmentData(attachments, workflowAttachmentId);
  return data ? parseWorkflowEnabledFromYaml(data.yaml) : undefined;
};

/**
 * The workflow a conversation attachment was last saved as, if any. Used to tell an overwrite
 * apart from a first save before the write happens, so the confirmation can say which it is.
 */
export const tryResolveWorkflowOriginFromAttachments = (
  attachments: AttachmentStateManager | undefined,
  workflowAttachmentId: string
): string | undefined => {
  const attachment = attachments
    ?.getAll()
    .find(
      (entry) => entry.id === workflowAttachmentId && entry.type === WORKFLOW_YAML_ATTACHMENT_TYPE
    );

  return attachment?.origin;
};

export const tryResolveAiIndexDisplayLabelFromAttachments = (
  attachments: AttachmentStateManager | undefined,
  aiIndexId?: string
): string => {
  if (!attachments) {
    return aiIndexId ?? 'the AI index';
  }

  for (const attachment of attachments.getAll()) {
    if (attachment.type !== AI_INDEX_ATTACHMENT_TYPE) {
      continue;
    }

    const latestVersion = getLatestVersion(attachment);
    const data = latestVersion?.data;
    if (!data || typeof data !== 'object' || !('id' in data) || typeof data.id !== 'string') {
      continue;
    }

    if (aiIndexId !== undefined && data.id !== aiIndexId) {
      continue;
    }

    if (
      'description' in data &&
      typeof data.description === 'string' &&
      data.description.length > 0
    ) {
      return data.description;
    }

    return data.id;
  }

  return aiIndexId ?? 'the AI index';
};

/** What a confirmation needs to say about a workflow that is already saved. */
export interface SavedWorkflowSummary {
  name?: string;
  enabled?: boolean;
}

export const tryResolveSavedWorkflowById = async ({
  workflowsManagement,
  workflowId,
  spaceId,
}: {
  workflowsManagement: WorkflowsManagementApi;
  workflowId: string;
  spaceId: string;
}): Promise<SavedWorkflowSummary | undefined> => {
  try {
    const workflow = await workflowsManagement.getWorkflow(workflowId, spaceId);
    return workflow ? { name: workflow.name, enabled: workflow.enabled } : undefined;
  } catch {
    return undefined;
  }
};

export const resolveAiIndexIdFromAttachments = (
  attachments: Array<{ type: string; data: { id?: string } }>,
  aiIndexId?: string
): string => {
  if (aiIndexId) {
    return aiIndexId;
  }

  const attachment = attachments.find(
    (entry) => entry.type === AI_INDEX_ATTACHMENT_TYPE && typeof entry.data.id === 'string'
  );

  if (!attachment?.data.id) {
    throw new Error(
      'No ai_index attachment found in this conversation. Provide aiIndexId explicitly or attach the AI index first.'
    );
  }

  return attachment.data.id;
};

const flattenAiIndexAttachments = (
  attachments: AttachmentStateManager
): Array<{ type: string; data: { id?: string } }> =>
  attachments.getAll().flatMap((attachment) => {
    const latestVersion = getLatestVersion(attachment);
    if (!latestVersion?.data || typeof latestVersion.data !== 'object') {
      return [];
    }

    return [
      {
        type: attachment.type,
        data: latestVersion.data as { id?: string },
      },
    ];
  });

export const resolveWorkflowYamlFromAttachments = (
  attachments: AttachmentStateManager,
  workflowAttachmentId: string
): { yaml: string; workflowId?: string; origin?: string } => {
  const attachment = attachments.getAll().find((entry) => entry.id === workflowAttachmentId);

  if (!attachment) {
    throw new Error(
      `Workflow attachment '${workflowAttachmentId}' not found in this conversation.`
    );
  }

  if (attachment.type !== WORKFLOW_YAML_ATTACHMENT_TYPE) {
    throw new Error(
      `Attachment '${workflowAttachmentId}' is not a workflow attachment (expected ${WORKFLOW_YAML_ATTACHMENT_TYPE}).`
    );
  }

  const latestVersion = getLatestVersion(attachment);
  if (!latestVersion || !isWorkflowYamlData(latestVersion.data)) {
    throw new Error(`Workflow attachment '${workflowAttachmentId}' has no YAML content to save.`);
  }

  return {
    yaml: latestVersion.data.yaml,
    workflowId: latestVersion.data.workflowId,
    origin: attachment.origin,
  };
};

const assertWorkflowReadAccess = async ({
  workflowId,
  spaceId,
  request,
  getSecurityStart,
  workflowsManagement,
}: {
  workflowId: string;
  spaceId: string;
  request: KibanaRequest;
  getSecurityStart: () => Promise<SecurityPluginStart | undefined>;
  workflowsManagement: WorkflowsManagementApi;
}): Promise<void> => {
  const security = await getSecurityStart();
  const canRead = await hasWorkflowReadPrivilege({ security, request, spaceId });
  if (!canRead) {
    throw new Error(
      `Unauthorized to reference workflow '${workflowId}'. The workflowsManagement read privilege is required.`
    );
  }

  const workflow = await workflowsManagement.getWorkflow(workflowId, spaceId);
  if (!workflow) {
    throw new Error(`Workflow '${workflowId}' was not found in this space.`);
  }
};

const assertWorkflowCreateAccess = async ({
  spaceId,
  request,
  getSecurityStart,
}: {
  spaceId: string;
  request: KibanaRequest;
  getSecurityStart: () => Promise<SecurityPluginStart | undefined>;
}): Promise<void> => {
  const security = await getSecurityStart();
  const canCreate = await hasWorkflowCreatePrivilege({ security, request, spaceId });
  if (!canCreate) {
    throw new Error(
      'Unauthorized to create a workflow. The workflowsManagement create privilege is required.'
    );
  }
};

const assertWorkflowUpdateAccess = async ({
  workflowId,
  spaceId,
  request,
  getSecurityStart,
}: {
  workflowId: string;
  spaceId: string;
  request: KibanaRequest;
  getSecurityStart: () => Promise<SecurityPluginStart | undefined>;
}): Promise<void> => {
  const security = await getSecurityStart();
  const canUpdate = await hasWorkflowUpdatePrivilege({ security, request, spaceId });
  if (!canUpdate) {
    throw new Error(
      `Unauthorized to update workflow '${workflowId}'. The workflowsManagement update privilege is required.`
    );
  }
};

/**
 * Where the YAML to save came from. `attachmentId` is set only when it was read out of a
 * conversation attachment, which is then linked to the saved workflow; YAML handed in directly
 * has no attachment yet, so one is created after the save.
 */
interface ResolvedWorkflowSource {
  yaml: string;
  existingWorkflowId?: string;
  attachmentId?: string;
}

const resolveWorkflowSource = (
  params: SaveAutomationParams,
  attachments: AttachmentStateManager
): ResolvedWorkflowSource => {
  if (params.workflowYaml !== undefined) {
    // An explicit `workflowId` alongside a definition names the workflow to overwrite. Without
    // one this is a create, and the id the YAML proposes for itself is deliberately not used:
    // workflow ids are unique across every space and over soft-deleted tombstones, so supplying
    // one turns any clash into a hard conflict that fails the save. Letting the server derive the
    // id from the workflow's name is the same readability for none of the risk.
    return { yaml: params.workflowYaml, existingWorkflowId: params.workflowId };
  }

  if (params.workflowAttachmentId === undefined) {
    throw new Error('Provide either workflowAttachmentId, workflowYaml or workflowId.');
  }

  const { yaml, origin } = resolveWorkflowYamlFromAttachments(
    attachments,
    params.workflowAttachmentId
  );

  // An explicit id wins over what the attachment was last saved as: the caller naming a workflow
  // is a more deliberate act than the attachment's own history.
  return {
    yaml,
    existingWorkflowId: params.workflowId ?? origin,
    attachmentId: params.workflowAttachmentId,
  };
};

/**
 * Points the conversation's attachments at what was actually saved: the one the definition came
 * from at the workflow it became, and any other copy of that workflow at the definition that
 * replaced it. A copy left holding the superseded YAML is the dangerous one — saving from it again
 * reverts the workflow without anyone asking for that. None of this can fail a save that has
 * already persisted and attached, so every step only warns.
 */
const syncAttachmentsToSavedWorkflow = async ({
  source,
  workflowId,
  attachments,
  logger,
}: {
  source: ResolvedWorkflowSource;
  workflowId: string;
  attachments: AttachmentStateManager;
  logger: Logger;
}): Promise<void> => {
  const name = parseWorkflowNameFromYaml(source.yaml);
  const savedData = { yaml: source.yaml, workflowId, ...(name !== undefined && { name }) };

  const linked = attachments
    .getAll()
    .filter(
      (entry) =>
        entry.type === WORKFLOW_YAML_ATTACHMENT_TYPE &&
        entry.active !== false &&
        (entry.origin === workflowId || entry.id === source.attachmentId)
    );

  for (const attachment of linked) {
    if (attachment.origin !== workflowId) {
      const originUpdated = await attachments.updateOrigin(
        attachment.id,
        workflowId,
        ATTACHMENT_REF_ACTOR.agent
      );
      if (!originUpdated) {
        logger.warn(
          `Workflow '${workflowId}' was attached but its attachment origin could not be recorded; ` +
            `a future save for attachment '${attachment.id}' may create a duplicate workflow.`
        );
      }
    }

    // The attachment the definition came from already holds it.
    if (attachment.id === source.attachmentId) {
      continue;
    }

    const current = getLatestVersion(attachment);
    if (current && isWorkflowYamlData(current.data) && current.data.yaml === source.yaml) {
      continue;
    }

    try {
      await attachments.update(attachment.id, { data: savedData }, ATTACHMENT_REF_ACTOR.agent);
    } catch (error) {
      logger.warn(
        `Workflow '${workflowId}' was saved but attachment '${attachment.id}' still holds the ` +
          `definition it replaced; saving from that attachment would revert the workflow. ${
            error instanceof Error ? error.message : String(error)
          }`
      );
    }
  }

  if (linked.length > 0) {
    return;
  }

  try {
    await attachments.add(
      {
        type: WORKFLOW_YAML_ATTACHMENT_TYPE,
        data: savedData,
        origin: workflowId,
      },
      ATTACHMENT_REF_ACTOR.agent
    );
  } catch (error) {
    logger.warn(
      `Workflow '${workflowId}' was saved and attached but no workflow attachment could be created ` +
        `for it; editing it in this conversation will require fetching it first. ${
          error instanceof Error ? error.message : String(error)
        }`
    );
  }
};

const persistWorkflow = async ({
  yaml,
  existingWorkflowId,
  workflowsManagement,
  spaceId,
  request,
  getSecurityStart,
}: {
  yaml: string;
  existingWorkflowId?: string;
  workflowsManagement: WorkflowsManagementApi;
  spaceId: string;
  request: KibanaRequest;
  getSecurityStart: () => Promise<SecurityPluginStart | undefined>;
}): Promise<{ workflowId: string; newlyCreated: boolean }> => {
  if (existingWorkflowId !== undefined) {
    await assertWorkflowUpdateAccess({
      workflowId: existingWorkflowId,
      spaceId,
      request,
      getSecurityStart,
    });

    // Confirmed as an overwrite before overwriting: the user approved replacing a workflow that
    // exists. If it does not, `updateWorkflow` would fail with a message about the id rather than
    // about the choice, and the caller has a create available that it may not think to fall back
    // to. A workflow can also have been deleted since the attachment recorded it.
    const target = await workflowsManagement.getWorkflow(existingWorkflowId, spaceId);
    if (!target) {
      throw new Error(
        `Workflow '${existingWorkflowId}' was not found in this space, so there is nothing to ` +
          `overwrite. Omit workflowId to save this definition as a new automation.`
      );
    }

    await workflowsManagement.updateWorkflow(existingWorkflowId, { yaml }, spaceId, request);
    return { workflowId: existingWorkflowId, newlyCreated: false };
  }

  await assertWorkflowCreateAccess({ spaceId, request, getSecurityStart });
  const created = await workflowsManagement.createWorkflow({ yaml }, spaceId, request);

  return { workflowId: created.id, newlyCreated: true };
};

/**
 * Starts a saved automation, enabling its definition first when it is disabled. Never throws: the
 * workflow is already saved and attached by this point, and a failed run must not undo that.
 */
const runSavedAutomation = async ({
  workflowId,
  spaceId,
  request,
  workflowsManagement,
  getSecurityStart,
  logger,
}: {
  workflowId: string;
  spaceId: string;
  request: KibanaRequest;
  workflowsManagement: WorkflowsManagementApi;
  getSecurityStart: () => Promise<SecurityPluginStart | undefined>;
  logger: Logger;
}): Promise<SaveAutomationRunResult> => {
  try {
    const security = await getSecurityStart();
    const canExecute = await hasWorkflowExecutePrivilege({ security, request, spaceId });
    if (!canExecute) {
      return {
        started: false,
        reason: `Unauthorized to execute workflow '${workflowId}'. The workflowsManagement execute privilege is required.`,
      };
    }

    // A disabled definition cannot be run by id. Asking to save and run is consent to enable it,
    // and `enabled` on its own is the one update a managed workflow accepts.
    const workflow = await workflowsManagement.getWorkflow(workflowId, spaceId);
    const enabledForRun = workflow?.enabled !== true;
    if (enabledForRun) {
      // Enabling is a write to the saved workflow, and holding execute says nothing about holding
      // update — the attach-by-id path reaches here having only checked read and execute. Asked
      // before the write rather than after, so a refusal reads as a privilege answer.
      const canUpdate = await hasWorkflowUpdatePrivilege({ security, request, spaceId });
      if (!canUpdate) {
        return {
          started: false,
          reason: `Workflow '${workflowId}' is disabled, and enabling it to run requires the workflowsManagement update privilege.`,
        };
      }

      // Enabling is refused rather than thrown when the stored definition is invalid, and the
      // refusal only shows up on the response. Reporting that beats executing into a bare
      // "workflow is disabled", which names the symptom and not the reason.
      const update = await workflowsManagement.updateWorkflow(
        workflowId,
        { enabled: true },
        spaceId,
        request
      );

      if (update.enabled !== true) {
        const details = update.validationErrors?.length
          ? ` ${update.validationErrors.join('; ')}`
          : '';
        return {
          started: false,
          reason: `Workflow '${workflowId}' is saved but could not be enabled, so it was not run.${details}`,
        };
      }
    }

    const result = await executeWorkflow({
      workflowId,
      workflowParams: {},
      request,
      spaceId,
      workflowApi: workflowsManagement,
      // A full-corpus run costs a model call per document, so return the execution id to poll
      // rather than holding the turn open until it finishes.
      waitForCompletion: false,
    });

    if (!result.success) {
      return { started: false, reason: result.error, ...(enabledForRun && { enabledForRun }) };
    }

    return {
      started: true,
      executionId: result.execution.execution_id,
      ...(enabledForRun && { enabledForRun }),
    };
  } catch (error) {
    logger.warn(`Failed to run automation '${workflowId}' after saving`, { error });
    return {
      started: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
};

export const saveAutomationHandler = async ({
  params,
  request,
  spaceId,
  attachments,
  logger,
  getAiIndexService,
  getCoreStart,
  getSecurityStart,
  getWorkflowsManagement,
}: {
  params: SaveAutomationParams;
  request: KibanaRequest;
  spaceId: string;
  attachments: AttachmentStateManager;
  logger: Logger;
  getAiIndexService: () => Promise<AiIndexService>;
  getCoreStart: () => Promise<CoreStart>;
  getSecurityStart: () => Promise<SecurityPluginStart | undefined>;
  getWorkflowsManagement: () => WorkflowsManagementApi;
}): Promise<SaveAutomationResult> => {
  await assertContextEngineWriteAccess({ request, spaceId, getCoreStart, getSecurityStart });

  const workflowsManagement = getWorkflowsManagement();
  const aiIndexAttachments = flattenAiIndexAttachments(attachments);
  const aiIndexId = resolveAiIndexIdFromAttachments(aiIndexAttachments, params.aiIndexId);
  const aiIndexService = await getAiIndexService();

  // `workflowId` on its own attaches a workflow that is already saved. Paired with a definition it
  // names the workflow to overwrite instead, which is the create/update path below.
  const hasDefinition =
    params.workflowYaml !== undefined || params.workflowAttachmentId !== undefined;

  if (params.workflowId && !hasDefinition) {
    await assertWorkflowReadAccess({
      workflowId: params.workflowId,
      spaceId,
      request,
      getSecurityStart,
      workflowsManagement,
    });

    // Fail-fast: reject before attach when the index cannot accept this automation.
    await aiIndexService.assertCanAcceptAutomation(aiIndexId, spaceId, {
      type: 'workflow',
      value: params.workflowId,
    });

    const attachStatus = await aiIndexService.addAutomation(aiIndexId, spaceId, {
      type: 'workflow',
      value: params.workflowId,
    });

    const attachResult: SaveAutomationResult = {
      aiIndexId,
      workflowId: params.workflowId,
      status: attachStatus,
    };

    if (params.run) {
      attachResult.run = await runSavedAutomation({
        workflowId: params.workflowId,
        spaceId,
        request,
        workflowsManagement,
        getSecurityStart,
        logger,
      });
    }

    return attachResult;
  }

  const source = resolveWorkflowSource(params, attachments);
  const { existingWorkflowId } = source;
  const isUpdate = existingWorkflowId !== undefined;

  // Fail-fast: reject before createWorkflow/updateWorkflow when the index cannot accept this automation.
  await aiIndexService.assertCanAcceptAutomation(
    aiIndexId,
    spaceId,
    existingWorkflowId ? { type: 'workflow', value: existingWorkflowId } : undefined
  );

  const { workflowId, newlyCreated } = await persistWorkflow({
    yaml: source.yaml,
    existingWorkflowId,
    workflowsManagement,
    spaceId,
    request,
    getSecurityStart,
  });

  let result: SaveAutomationResult;
  try {
    const attachStatus = await aiIndexService.addAutomation(aiIndexId, spaceId, {
      type: 'workflow',
      value: workflowId,
    });

    await syncAttachmentsToSavedWorkflow({ source, workflowId, attachments, logger });

    result = {
      aiIndexId,
      workflowId,
      status: isUpdate || attachStatus === 'attached' ? 'saved_and_attached' : 'already_attached',
    };
  } catch (error) {
    if (newlyCreated) {
      try {
        await workflowsManagement.deleteWorkflows([workflowId], spaceId, request);
      } catch (deleteError) {
        logger.warn(`Failed to roll back workflow '${workflowId}' after attach failure`, {
          error: deleteError,
        });
      }
    }

    throw error;
  }

  // Outside the rollback scope above: the workflow is saved and attached, and a run that fails
  // must leave it that way.
  if (params.run) {
    result.run = await runSavedAutomation({
      workflowId,
      spaceId,
      request,
      workflowsManagement,
      getSecurityStart,
      logger,
    });
  }

  return result;
};

export const getSaveAutomationErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return 'An unexpected error occurred while saving the workflow automation.';
};
