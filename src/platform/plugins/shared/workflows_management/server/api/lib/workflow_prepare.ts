/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { transformWorkflowYamlJsontoEsWorkflow } from '@kbn/workflows';
import type { EsWorkflow, EsWorkflowCreate, WorkflowYaml } from '@kbn/workflows';
import { parseYamlToJSONWithoutValidation } from '@kbn/workflows-yaml';
import type { z } from '@kbn/zod/v4';

import { generateWorkflowId } from '../../../common/lib/import';
import { validateWorkflowYaml } from '../../../common/lib/validate_workflow_yaml';
import { updateWorkflowYamlFields } from '../../../common/lib/yaml';
import { INITIAL_WORKFLOW_VERSION } from '../../lib/workflow_version';
import type { WorkflowProperties } from '../../storage/workflow_storage';

/** Derives a list of trigger type ids from a workflow definition. */
export const getTriggerTypesFromDefinition = (
  definition: WorkflowYaml | null | undefined
): string[] => {
  const triggers = definition?.triggers ?? [];
  return triggers
    .map((t) => (t && typeof t.type === 'string' ? t.type : null))
    .filter(<T>(v: T): v is NonNullable<T> => v != null);
};

/** True when the YAML root map includes `enabled` (before Zod defaults). */
export const workflowYamlDeclaresTopLevelEnabled = (yamlString: string): boolean => {
  const parsed = parseYamlToJSONWithoutValidation(yamlString);
  if (!parsed.success || parsed.json == null || typeof parsed.json !== 'object') {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(parsed.json, 'enabled');
};

/**
 * Validates YAML and builds a WorkflowProperties document ready for indexing.
 * Shared by user-created and managed workflow creation paths.
 */
export const prepareWorkflowDocumentFromYaml = (params: {
  id?: string;
  yaml: string;
  zodSchema: z.ZodType;
  authenticatedUser: string;
  now: Date;
  spaceId: string;
  triggerDefinitions?: Array<{ id: string; eventSchema: z.ZodType }>;
  versioningEnabled?: boolean;
}): { id: string; workflowData: WorkflowProperties; definition?: WorkflowYaml } => {
  const {
    id: providedId,
    yaml,
    zodSchema,
    authenticatedUser,
    now,
    spaceId,
    triggerDefinitions,
    versioningEnabled = false,
  } = params;

  let workflowToCreate: EsWorkflowCreate = {
    name: 'Untitled workflow',
    description: undefined,
    enabled: false,
    tags: [],
    definition: undefined,
    valid: false,
  };

  const validation = validateWorkflowYaml(yaml, zodSchema, { triggerDefinitions });
  if (validation.valid && validation.parsedWorkflow) {
    workflowToCreate = transformWorkflowYamlJsontoEsWorkflow(validation.parsedWorkflow);
  } else if (validation.parsedWorkflow) {
    workflowToCreate = transformWorkflowYamlJsontoEsWorkflow(validation.parsedWorkflow);
    workflowToCreate.valid = false;
    workflowToCreate.definition = undefined;
  }

  const id = providedId || generateWorkflowId(workflowToCreate.name);

  const workflowData: WorkflowProperties = {
    name: workflowToCreate.name,
    description: workflowToCreate.description,
    enabled: workflowToCreate.enabled,
    tags: workflowToCreate.tags || [],
    triggerTypes: getTriggerTypesFromDefinition(workflowToCreate.definition),
    yaml,
    definition: workflowToCreate.definition ?? null,
    createdBy: authenticatedUser,
    lastUpdatedBy: authenticatedUser,
    spaceId,
    managed: false,
    managedBy: null,
    definitionHash: null,
    originManagedWorkflowId: null,
    lifecycle: null,
    valid: workflowToCreate.valid,
    deleted_at: null,
    ...(versioningEnabled ? { version: INITIAL_WORKFLOW_VERSION } : {}),
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  return { id, workflowData, definition: workflowToCreate.definition };
};

/**
 * Validates YAML update and returns the storage patch + validation errors.
 * Pure function — caller resolves zodSchema and triggerDefinitions before calling.
 */
export const applyYamlUpdate = (params: {
  workflowYaml: string;
  zodSchema: z.ZodType;
  triggerDefinitions: Array<{ id: string; eventSchema: z.ZodType }>;
}): {
  updatedDataPatch: Partial<WorkflowProperties>;
  validationErrors: string[];
  shouldUpdateScheduler: boolean;
} => {
  const { workflowYaml, zodSchema, triggerDefinitions } = params;
  const validation = validateWorkflowYaml(workflowYaml, zodSchema, { triggerDefinitions });

  if (!validation.valid || !validation.parsedWorkflow) {
    return {
      updatedDataPatch: { definition: null, enabled: false, valid: false, triggerTypes: [] },
      validationErrors: validation.diagnostics
        .filter((d) => d.severity === 'error')
        .map((d) => d.message),
      shouldUpdateScheduler: true,
    };
  }

  const workflowDef = transformWorkflowYamlJsontoEsWorkflow(validation.parsedWorkflow);
  return {
    updatedDataPatch: {
      definition: workflowDef.definition,
      name: workflowDef.name,
      enabled: workflowDef.enabled,
      description: workflowDef.description,
      tags: workflowDef.tags,
      triggerTypes: getTriggerTypesFromDefinition(workflowDef.definition),
      valid: true,
      yaml: workflowYaml,
    },
    validationErrors: [],
    shouldUpdateScheduler: true,
  };
};

/**
 * Builds the storage patch for field-only (non-YAML) updates.
 * Used by updateWorkflow when workflow.yaml is not provided.
 */
export const applyFieldUpdates = (
  workflow: Partial<EsWorkflow>,
  existingSource: WorkflowProperties
): { patch: Partial<WorkflowProperties>; validationErrors: string[] } => {
  const patch: Partial<WorkflowProperties> = {};
  const validationErrors: string[] = [];
  let yamlUpdated = false;

  if (workflow.name !== undefined) {
    patch.name = workflow.name;
    yamlUpdated = true;
  }
  if (workflow.enabled !== undefined) {
    if (workflow.enabled && existingSource?.definition) {
      patch.enabled = true;
      yamlUpdated = true;
    } else if (!workflow.enabled) {
      patch.enabled = false;
      yamlUpdated = true;
    } else {
      // enable requested but workflow has no valid definition — silently ignoring
      // would leave the caller believing the flip succeeded, so surface a validation
      // error and do not touch the stored YAML.
      validationErrors.push(
        'Cannot enable a workflow without a valid definition. Provide valid YAML first.'
      );
    }
  }
  if (workflow.description !== undefined) {
    patch.description = workflow.description;
    yamlUpdated = true;
  }
  if (workflow.tags !== undefined) {
    patch.tags = workflow.tags;
    yamlUpdated = true;
  }

  if (yamlUpdated && existingSource?.yaml) {
    patch.yaml = updateWorkflowYamlFields(
      existingSource.yaml,
      workflow,
      patch.enabled ?? existingSource.enabled
    );
  }

  return { patch, validationErrors };
};
