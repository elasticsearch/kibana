/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod/v4';
import { type ConnectorContractUnion } from '../..';
import { getDeprecatedStepMessage, getStepDeprecationInfo } from '../deprecated_step_metadata';
import { KIBANA_TYPE_ALIASES } from '../kibana/aliases';
import {
  BaseConnectorStepSchema,
  DataSetStepSchema,
  getForEachStepSchema,
  getIfStepSchema,
  getMergeStepSchema,
  getOnFailureStepSchema,
  getParallelStepSchema,
  getSwitchStepSchema,
  getWhileStepSchema,
  getWorkflowSettingsSchema,
  LoopBreakStepSchema,
  LoopContinueStepSchema,
  WaitForApprovalStepSchema,
  WaitForInputStepSchema,
  WaitStepSchema,
  WorkflowExecuteAsyncStepSchema,
  WorkflowExecuteStepSchema,
  WorkflowFailStepSchema,
  WorkflowOutputStepSchema,
  WorkflowSchemaBase,
  WorkflowSchemaForAutocompleteBase,
  WorkflowSettingsSchema,
} from '../schema';
import { getTriggerSchema } from '../schema/triggers';

export function getStepId(stepName: string): string {
  // Using step name as is, don't do any escaping to match the workflow engine behavior
  // Leaving this function in case we'd to change behaviour in future.
  return stepName;
}

export function generateYamlSchemaFromConnectors(
  connectors: ConnectorContractUnion[],
  /** Registered custom trigger type ids for YAML schema validation (e.g. example.custom_trigger) */
  triggers: string[] = [],
  /**
   * @deprecated use WorkflowSchemaForAutocomplete instead
   */
  loose: boolean = false
): z.ZodType {
  const recursiveStepSchema = createRecursiveStepSchema(connectors, loose);

  if (loose) {
    // For loose mode, use WorkflowSchemaForAutocompleteBase which already handles partial fields
    // We use the base schema (without transform) so we can extend it
    return WorkflowSchemaForAutocompleteBase.extend({
      settings: WorkflowSettingsSchema.optional(),
      steps: z.array(recursiveStepSchema).optional(),
    }).transform((data) => ({
      ...data,
      version: '1' as const,
    }));
  }

  const triggerSchema = getTriggerSchema(triggers);
  const workflowBaseWithTriggers = WorkflowSchemaBase.extend({
    triggers: z.array(triggerSchema).min(1),
  });

  return workflowBaseWithTriggers.extend({
    settings: getWorkflowSettingsSchema(recursiveStepSchema, loose).optional(),
    steps: z.array(recursiveStepSchema),
  });
}

/**
 * Generates a schema for trusted workflow definitions that need the shared workflow envelope
 * validation without materializing the connector-expanded step union.
 */
export function generateLightweightYamlSchema(triggers: string[] = []): z.ZodType {
  // Trigger schemas are lightweight: custom IDs add literal trigger variants and do
  // not materialize connector or step-definition schemas.
  const triggerSchema = getTriggerSchema(triggers);
  const workflowBaseWithTriggers = WorkflowSchemaBase.extend({
    triggers: z.array(triggerSchema).min(1),
  });

  return workflowBaseWithTriggers.extend({
    // WorkflowSchemaBase validates settings with step-aware fallback schemas. Keep the
    // trusted startup path step-agnostic so it does not duplicate the step schema SOT.
    settings: z.unknown().optional(),
    steps: z.array(z.unknown()).min(1),
  });
}

function createRecursiveStepSchema(
  connectors: ConnectorContractUnion[],
  loose: boolean = false
): z.ZodType {
  // Build the discriminated union exactly once: Zod calls the lazy getter on
  // every traversal (z.toJSONSchema, .safeParse, monaco-yaml's AJV walk), and
  // each connector references stepSchema again via `on-failure.fallback`, so
  // without the cache the 200+ entry union would be rebuilt on every visit.
  let cachedUnion: z.ZodType | undefined;
  const stepSchema: z.ZodType = z.lazy(() => {
    if (cachedUnion) {
      return cachedUnion;
    }

    const forEachSchema = getForEachStepSchema(stepSchema, loose);
    const whileSchema = getWhileStepSchema(stepSchema, loose);
    const ifSchema = getIfStepSchema(stepSchema, loose);
    const switchSchema = getSwitchStepSchema(stepSchema, loose);
    const parallelSchema = getParallelStepSchema(stepSchema, loose);
    const mergeSchema = getMergeStepSchema(stepSchema, loose);

    const connectorSchemas = connectors.map((c) =>
      generateStepSchemaForConnector(c, stepSchema, loose)
    );

    // Alias schemas keep old type names parseable, but they're not surfaced in
    // autocomplete.
    const aliasSchemas = generateAliasSchemas(connectors, stepSchema, loose);

    cachedUnion = z.discriminatedUnion('type', [
      forEachSchema,
      whileSchema,
      ifSchema,
      switchSchema,
      parallelSchema,
      mergeSchema,
      WaitStepSchema,
      WaitForInputStepSchema,
      WaitForApprovalStepSchema,
      DataSetStepSchema,
      WorkflowExecuteStepSchema,
      WorkflowExecuteAsyncStepSchema,
      WorkflowOutputStepSchema,
      WorkflowFailStepSchema,
      LoopBreakStepSchema,
      LoopContinueStepSchema,
      ...connectorSchemas,
      ...aliasSchemas,
    ]);
    return cachedUnion;
  });

  return stepSchema;
}

/**
 * Returns true when a step's params schema has no required fields, meaning `with` can be omitted.
 * This covers steps like `data.parseJson` whose inputs are all optional or entirely absent.
 */
function hasNoRequiredFields(schema: z.ZodType): boolean {
  if (!(schema instanceof z.ZodObject)) return false;
  return Object.values(schema.shape).every(
    (field) => field instanceof z.ZodOptional || field instanceof z.ZodDefault
  );
}

function generateStepSchemaForConnector(
  connector: ConnectorContractUnion,
  stepSchema: z.ZodType,
  loose: boolean = false
) {
  const connectorIdSchema: Record<string, z.ZodType> = {};
  // Add connector-id schema if hasConnectorId has a value
  if (connector.hasConnectorId) {
    connectorIdSchema['connector-id'] =
      connector.hasConnectorId === 'required' ? z.string() : z.string().optional();
  }

  // If all params are optional (or there are none), `with` itself should be optional so users
  // don't have to write an empty `with: {}` block for steps that need no inputs.
  const withSchema = hasNoRequiredFields(connector.paramsSchema)
    ? connector.paramsSchema.optional()
    : connector.paramsSchema;

  return BaseConnectorStepSchema.extend({
    type: connector.description
      ? z.literal(connector.type).describe(connector.description)
      : z.literal(connector.type),
    with: withSchema,
    ...connectorIdSchema,
    'on-failure': getOnFailureStepSchema(stepSchema, loose).optional(),
    ...(connector.configSchema && connector.configSchema.shape),
  });
}

/**
 * Generate schemas for backward-compatible type aliases.
 * These schemas use the old type names but reference the same connector definition.
 * They are included in validation but not shown in autocomplete suggestions.
 */
function generateAliasSchemas(
  connectors: ConnectorContractUnion[],
  stepSchema: z.ZodType,
  loose: boolean = false
): ReturnType<typeof generateStepSchemaForConnector>[] {
  const aliasSchemas: ReturnType<typeof generateStepSchemaForConnector>[] = [];

  for (const [oldType, newType] of Object.entries(KIBANA_TYPE_ALIASES)) {
    // Find the connector with the new type name
    const connector = connectors.find((c) => c.type === newType);
    if (connector) {
      // Create a schema with the old type name but same params/output
      const newSchema = generateStepSchemaForConnector(connector, stepSchema, loose);
      const deprecation = getStepDeprecationInfo(oldType);
      const description = deprecation
        ? getDeprecatedStepMessage(oldType, deprecation)
        : `Deprecated: Use ${newType} instead`;
      aliasSchemas.push(
        newSchema.extend({
          // Mark as deprecated in description so it's clear this is a legacy alias
          type: z.literal(oldType).describe(description),
        })
      );
    }
  }

  return aliasSchemas;
}
