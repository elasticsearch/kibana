/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  ALERTING_V2_NOTIFICATION_GROUP_INPUT_DEFINITION_ID,
  builtinWorkflowInputDefinitions,
  isJsonSchemaPathValid,
  scanForTemplateVariables,
  WorkflowSchemaForAutocomplete,
  type JsonSchema,
} from '@kbn/workflows';
import type { z } from '@kbn/zod/v4';
import { parse as parseYaml } from 'yaml';

const PAYLOAD_PREFIX = 'inputs.payload';

/**
 * The lenient workflow shape, it describes the document's structure
 * without rejecting connector-specific step configuration the way
 * the strict `WorkflowSchema` would.
 */
type ParsedWorkflow = z.output<typeof WorkflowSchemaForAutocomplete>;

const getPayloadSchema = (): JsonSchema => {
  const schema =
    builtinWorkflowInputDefinitions[ALERTING_V2_NOTIFICATION_GROUP_INPUT_DEFINITION_ID];
  if (!schema) {
    throw new Error(
      `Missing built-in workflow input definition "${ALERTING_V2_NOTIFICATION_GROUP_INPUT_DEFINITION_ID}"`
    );
  }
  return schema;
};

const isUnderPrefix = (path: string, prefix: string): boolean =>
  path === prefix || path.startsWith(`${prefix}.`) || path.startsWith(`${prefix}[`);

const toPayloadRelativePath = (path: string): string => {
  if (path === PAYLOAD_PREFIX) {
    return '';
  }
  if (path.startsWith(`${PAYLOAD_PREFIX}.`)) {
    return path.slice(PAYLOAD_PREFIX.length + 1);
  }
  return path.slice(PAYLOAD_PREFIX.length); // inputs.payload[...]
};

const throwMissingWorkflowYaml = (yaml: string | undefined): string => {
  if (typeof yaml !== 'string') {
    throw new Error('Expected workflow yaml attachment');
  }
  return yaml;
};

const throwMissingPayloadLiquidReferences = (
  payloadVariables: string[],
  variables: string[]
): void => {
  if (payloadVariables.length === 0) {
    throw new Error(
      `Generated workflow Liquid does not reference \`inputs.payload.*\`. ` +
        `Action-policy dispatch exposes alert data as \`inputs.payload\` ` +
        `(mirrors \`ActionPolicyWorkflowPayload\`). ` +
        `Found variables: ${
          variables.length > 0 ? variables.map((path) => `\`${path}\``).join(', ') : '(none)'
        }.`
    );
  }
};

const throwUnknownPayloadLiquidFields = (
  payloadVariables: string[],
  payloadSchema: JsonSchema
): void => {
  const invalidPayloadPaths = payloadVariables.filter(
    (path) => !isActionPolicyPayloadPathInSchema(toPayloadRelativePath(path), payloadSchema)
  );
  if (invalidPayloadPaths.length === 0) {
    return;
  }
  const allowedTopLevelFields = Object.keys(payloadSchema.properties ?? {});
  throw new Error(
    `Generated workflow Liquid references unknown \`inputs.payload\` fields: ` +
      `${invalidPayloadPaths.map((path) => `\`${path}\``).join(', ')}. ` +
      `Allowed top-level payload fields: ${allowedTopLevelFields.join(', ')}.`
  );
};

const parseWorkflowYaml = (yaml: string): unknown => {
  try {
    return parseYaml(yaml);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Generated workflow YAML is not valid YAML: ${message}`);
  }
};

const throwInvalidWorkflowDocument = (parsed: unknown): ParsedWorkflow => {
  const result = WorkflowSchemaForAutocomplete.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Generated workflow YAML is not a workflow document: ${result.error.issues
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; ')}`
    );
  }
  return result.data;
};

const scanWorkflowLiquidVariables = (parsed: unknown): string[] => {
  try {
    return Array.from(new Set(scanForTemplateVariables(parsed))).sort();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Generated workflow contains invalid Liquid template syntax: ${message}`);
  }
};

export const isActionPolicyPayloadLiquidPath = (path: string): boolean =>
  isUnderPrefix(path, PAYLOAD_PREFIX);

/**
 * Walks `relativePath` (everything after `inputs.payload`) against the
 * alertingV2NotificationGroup JSON Schema. An empty path is the payload root, which is
 * always valid.
 */
export const isActionPolicyPayloadPathInSchema = (
  relativePath: string,
  schema: JsonSchema = getPayloadSchema()
): boolean => isJsonSchemaPathValid(relativePath, schema);

/**
 * Asserts that an action-policy notification workflow:
 * 1. Includes a workflow YAML string
 * 2. Parses as valid YAML
 * 3. Parses as a workflow document
 * 4. Contains valid Liquid (via `@kbn/workflows` `scanForTemplateVariables`)
 * 5. References `inputs.payload.*` at least once
 * 6. Those `inputs.payload.*` paths use fields from the
 *    `alertingV2NotificationGroup` payload schema
 */
export const assertActionPolicyWorkflowLiquid = (
  yaml: string | undefined
): {
  /** Unique Liquid variable paths extracted from the workflow YAML. */
  variables: string[];
  /** The parsed workflow document, for assertions on triggers, steps, etc. */
  workflow: ParsedWorkflow;
  /** The validated workflow YAML string. */
  yaml: string;
} => {
  const workflowYaml = throwMissingWorkflowYaml(yaml);
  const parsed = parseWorkflowYaml(workflowYaml);
  const workflow = throwInvalidWorkflowDocument(parsed);
  const variables = scanWorkflowLiquidVariables(parsed);
  const payloadVariables = variables.filter(isActionPolicyPayloadLiquidPath);

  throwMissingPayloadLiquidReferences(payloadVariables, variables);
  throwUnknownPayloadLiquidFields(payloadVariables, getPayloadSchema());

  return { variables, workflow, yaml: workflowYaml };
};
