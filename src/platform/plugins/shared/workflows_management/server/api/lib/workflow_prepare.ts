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

/**
 * Reads trigger type ids straight off the YAML without requiring schema
 * validation, so callers see the same trigger set the storage document will
 * derive from `getTriggerTypesFromDefinition`. Returns `[]` on parse failure.
 */
export const getTriggerTypesFromYaml = (yamlString: string): string[] => {
  const parsed = parseYamlToJSONWithoutValidation(yamlString);
  if (!parsed.success || parsed.json == null || typeof parsed.json !== 'object') {
    return [];
  }
  const triggers = (parsed.json as { triggers?: unknown }).triggers;
  if (!Array.isArray(triggers)) {
    return [];
  }
  return triggers
    .map((t) =>
      t && typeof t === 'object' && typeof (t as { type?: unknown }).type === 'string'
        ? (t as { type: string }).type
        : null
    )
    .filter((v): v is string => v != null);
};

/** True when the YAML root map sets `enabled: true` at the top level. */
export const workflowYamlDeclaresEnabled = (yamlString: string): boolean => {
  const parsed = parseYamlToJSONWithoutValidation(yamlString);
  if (!parsed.success || parsed.json == null || typeof parsed.json !== 'object') {
    return false;
  }
  return (parsed.json as { enabled?: unknown }).enabled === true;
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
 * Reads `name`/`description`/`tags` straight off the YAML without requiring it to pass
 * schema validation, so a workflow that fails strict validation still keeps its
 * author-given metadata instead of collapsing to the "Untitled workflow" fallback.
 */
const extractLooseMetadataFields = (
  yamlString: string
): { name?: string; description?: string; tags?: string[] } => {
  const parsed = parseYamlToJSONWithoutValidation(yamlString);
  if (!parsed.success || parsed.json == null || typeof parsed.json !== 'object') {
    return {};
  }
  const json = parsed.json as Record<string, unknown>;
  return {
    name: typeof json.name === 'string' && json.name.trim() !== '' ? json.name : undefined,
    description: typeof json.description === 'string' ? json.description : undefined,
    tags:
      Array.isArray(json.tags) && json.tags.every((tag) => typeof tag === 'string')
        ? (json.tags as string[])
        : undefined,
  };
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
  originManagedWorkflowId?: string;
  triggerDefinitions?: Array<{ id: string; eventSchema: z.ZodType }>;
  nameFallback?: string;
}): { id: string; workflowData: WorkflowProperties; definition?: WorkflowYaml } => {
  const {
    id: providedId,
    yaml,
    zodSchema,
    authenticatedUser,
    now,
    spaceId,
    originManagedWorkflowId,
    triggerDefinitions,
    nameFallback,
  } = params;

  const looseMetadata = extractLooseMetadataFields(yaml);
  let workflowToCreate: EsWorkflowCreate = {
    // Prefer the YAML-embedded name so the stored name round-trips with the YAML.
    // `nameFallback` is used only when the YAML cannot carry a `name` key (e.g. a
    // schema-invalid workflow whose root is a scalar/sequence), so callers such as
    // cloning can still name the document instead of collapsing to "Untitled workflow".
    name: looseMetadata.name ?? nameFallback ?? 'Untitled workflow',
    description: looseMetadata.description,
    enabled: false,
    tags: looseMetadata.tags ?? [],
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
    originManagedWorkflowId: originManagedWorkflowId ?? null,
    lifecycle: null,
    valid: workflowToCreate.valid,
    deleted_at: null,
    version: INITIAL_WORKFLOW_VERSION,
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
    const looseMetadata = extractLooseMetadataFields(workflowYaml);
    return {
      updatedDataPatch: {
        definition: null,
        enabled: false,
        valid: false,
        triggerTypes: [],
        ...(looseMetadata.name !== undefined ? { name: looseMetadata.name } : {}),
        ...(looseMetadata.description !== undefined
          ? { description: looseMetadata.description }
          : {}),
        ...(looseMetadata.tags !== undefined ? { tags: looseMetadata.tags } : {}),
      },
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

  // Keep definition.enabled in sync with the top-level enabled column so that
  // any consumer of the parsed definition (e.g. export) always sees the current
  // value.  The YAML-update path performs this same sync in workflow_crud_service;
  // mirror it here for the field-only path.
  if (patch.enabled !== undefined && existingSource?.definition) {
    patch.definition = { ...existingSource.definition, enabled: patch.enabled };
  }

  return { patch, validationErrors };
};
