/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod/v4';
import { CONNECTOR_ID_MAX_LENGTH } from '../../common/constants';
import {
  TEMPLATE_EXPRESSION_MAX_LENGTH,
  WHOLE_VALUE_TEMPLATE_EXPRESSION_REGEX,
} from '../../common/template_expressions';
import type { ConnectorContractUnion } from '../../types/v1';
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
import { type CustomTriggerSchemaInput, getTriggerSchema } from '../schema/triggers';

export function getStepId(stepName: string): string {
  // Using step name as is, don't do any escaping to match the workflow engine behavior
  // Leaving this function in case we'd to change behaviour in future.
  return stepName;
}

export function generateYamlSchemaFromConnectors(
  connectors: ConnectorContractUnion[],
  /** Registered custom triggers for YAML schema validation (id, optional requiresConnectorId) */
  triggers: CustomTriggerSchemaInput[] = [],
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
    steps: z.array(recursiveStepSchema).min(1),
  });
}

/**
 * Generates a schema for trusted workflow definitions that need the shared workflow envelope
 * validation without materializing the connector-expanded step union.
 */
export function generateLightweightYamlSchema(
  triggers: CustomTriggerSchemaInput[] = []
): z.ZodType {
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

/**
 * Only whole-value `${{ … }}` expressions are accepted — not arbitrary strings, and not the
 * bare `{{ … }}` form, which the templating engine always renders to a string and so can never
 * satisfy an array param. See WHOLE_VALUE_TEMPLATE_EXPRESSION_REGEX for the full rationale.
 */
const LIQUID_TEMPLATE_SCHEMA = z
  .string()
  .regex(WHOLE_VALUE_TEMPLATE_EXPRESSION_REGEX)
  .max(TEMPLATE_EXPRESSION_MAX_LENGTH);

/**
 * Widens top-level array fields of a connector params schema to also accept a whole-value
 * Liquid template expression like `"${{ event.messages }}"`, so that passing a templated value
 * where an array is declared is not reported as a type error.
 *
 * This is not editor-only: the same generated schema is the server-side gate for workflow
 * create/update (`workflow_crud_service` / `workflow_validation_service` in
 * workflows_management), so it decides what can be *persisted*, not just what Monaco
 * underlines. Connector params are not re-validated against `paramsSchema` at execution time,
 * which is why the accepted form is restricted to the one the templating engine is guaranteed
 * to resolve back to a native array.
 *
 * Only the direct children of the params schema (not nested objects) are widened, to avoid
 * disturbing deeply nested schemas such as the ES API's MappingTypeMapping.
 */
function withTemplateStringSupport(paramsSchema: z.ZodType): z.ZodType {
  if (!(paramsSchema instanceof z.ZodObject)) {
    return paramsSchema;
  }
  const modifications: Record<string, z.ZodType> = {};
  for (const [key, rawValue] of Object.entries(paramsSchema.shape as Record<string, z.ZodType>)) {
    let value: z.ZodType = rawValue;
    let isOptional = false;
    let hasDefault = false;
    let defaultValue: unknown;

    // `.optional()` and `.default()` can be applied in either order and stacked, so unwrap
    // until the underlying type is reached, remembering what has to be re-applied afterwards.
    while (value instanceof z.ZodOptional || value instanceof z.ZodDefault) {
      if (value instanceof z.ZodOptional) {
        isOptional = true;
      } else {
        hasDefault = true;
        defaultValue = value.def.defaultValue;
      }
      value = value.unwrap() as z.ZodType;
    }

    if (value instanceof z.ZodArray) {
      const widened: z.ZodType = z.union([LIQUID_TEMPLATE_SCHEMA, value]);
      // Re-apply the wrappers that were stripped above. Dropping `.default()` here would turn a
      // defaulted param into a required one and break workflows that legitimately omit it.
      const withOptionality = isOptional ? widened.optional() : widened;
      modifications[key] = hasDefault ? withOptionality.default(defaultValue) : withOptionality;
    }
  }
  if (Object.keys(modifications).length === 0) {
    return paramsSchema;
  }
  // safeExtend preserves object-level refinements and the unknownKeys policy (strict/passthrough),
  // unlike extend() which throws when the schema contains refinements.
  // `modifications` is built as a mutable record; ZodRawShape is the readonly shape safeExtend
  // expects, so the cast only relaxes mutability.
  return paramsSchema.safeExtend(modifications as z.ZodRawShape);
}

function generateStepSchemaForConnector(
  connector: ConnectorContractUnion,
  stepSchema: z.ZodType,
  loose: boolean = false
) {
  const connectorIdSchema: Record<string, z.ZodType> = {};
  // Add connector-id schema if hasConnectorId has a value
  if (connector.hasConnectorId) {
    const connectorId = z.string().max(CONNECTOR_ID_MAX_LENGTH);
    connectorIdSchema['connector-id'] =
      connector.hasConnectorId === 'required' ? connectorId : connectorId.optional();
  }

  const templateAwareParamsSchema = withTemplateStringSupport(connector.paramsSchema);

  // If all params are optional (or there are none), `with` itself should be optional so users
  // don't have to write an empty `with: {}` block for steps that need no inputs.
  const withSchema = hasNoRequiredFields(connector.paramsSchema)
    ? templateAwareParamsSchema.optional()
    : templateAwareParamsSchema;

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
