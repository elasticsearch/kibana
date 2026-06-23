/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Document } from 'yaml';
import type { monaco } from '@kbn/monaco';
import { DynamicStepContextSchema } from '@kbn/workflows';
import type { WorkflowYaml } from '@kbn/workflows';
import type { WorkflowGraph } from '@kbn/workflows/graph';
import { validateVariable } from './validate_variable';
import { getContextSchemaWithTemplateLocals } from '../../workflow_context/lib/extend_context_with_template_locals';
import {
  extendWithPathSpecificContext,
  getContextSchemaForStep,
} from '../../workflow_context/lib/get_context_for_path';
import { getNearestStepPath } from '../../workflow_context/lib/get_nearest_step_path';
import { getValueAtYamlPath } from '../../workflow_context/lib/get_value_at_yaml_path';
import { getWorkflowContextSchema } from '../../workflow_context/lib/get_workflow_context_schema';
import type { VariableItem, YamlValidationResult } from '../model/types';

/**
 * If the variable item has no offset, try to compute it on the fly from the editor model.
 */
function fallbackForOffsetValue(
  variableItem: VariableItem,
  yamlDocument?: Document | null,
  model?: monaco.editor.ITextModel
) {
  if (yamlDocument && model) {
    return model.getOffsetAt({
      lineNumber: variableItem.startLineNumber,
      column: variableItem.startColumn,
    });
  }
  return undefined;
}

const ROOT_CACHE_KEY: unique symbol = Symbol('root');

export function validateVariables(
  variableItems: VariableItem[],
  workflowGraph: WorkflowGraph,
  workflowDefinition: WorkflowYaml,
  yamlDocument?: Document | null,
  model?: monaco.editor.ITextModel
): YamlValidationResult[] {
  const errors: YamlValidationResult[] = [];

  const baseSchema = DynamicStepContextSchema.merge(
    getWorkflowContextSchema(workflowDefinition, yamlDocument)
  ) as typeof DynamicStepContextSchema;

  const stepSchemaCache = new Map<string | symbol, typeof DynamicStepContextSchema>();
  const pathContextCache = new Map<string, typeof DynamicStepContextSchema>();
  const fullContextCache = new Map<string, typeof DynamicStepContextSchema>();

  for (const variableItem of variableItems) {
    const { yamlPath: path, offset } = variableItem;

    let context: typeof DynamicStepContextSchema;
    try {
      const nearestStepPath = getNearestStepPath(path);
      const nearestStep = nearestStepPath
        ? getValueAtYamlPath<{ name?: string }>(workflowDefinition, nearestStepPath)
        : undefined;
      const cacheKey = nearestStep?.name ?? ROOT_CACHE_KEY;

      let stepSchema = stepSchemaCache.get(cacheKey);
      if (!stepSchema) {
        if (nearestStep?.name) {
          stepSchema = getContextSchemaForStep(baseSchema, workflowGraph, nearestStep.name);
        } else {
          stepSchema = baseSchema;
        }
        stepSchemaCache.set(cacheKey, stepSchema);
      }

      const pathSuffix = nearestStepPath ? path.slice(nearestStepPath.length) : [];
      const pathContextKey = `${String(cacheKey)}:${pathSuffix.join('.')}`;

      let pathSchema = pathContextCache.get(pathContextKey);
      if (!pathSchema) {
        pathSchema = nearestStepPath
          ? extendWithPathSpecificContext(stepSchema, nearestStep, pathSuffix)
          : stepSchema;
        pathContextCache.set(pathContextKey, pathSchema);
      }

      const variableOffset = offset ?? fallbackForOffsetValue(variableItem, yamlDocument, model);
      if (yamlDocument != null && variableOffset !== undefined) {
        const fullContextKey = `${pathContextKey}:${variableOffset}`;
        const cachedContext = fullContextCache.get(fullContextKey);
        if (cachedContext) {
          context = cachedContext;
        } else {
          context = getContextSchemaWithTemplateLocals(
            yamlDocument,
            variableOffset,
            pathSchema,
            model?.getValue()
          );
          fullContextCache.set(fullContextKey, context);
        }
      } else {
        context = pathSchema;
      }

      const error = validateVariable(variableItem, context);
      if (error) {
        errors.push(error);
      }
    } catch (e) {
      errors.push({
        ...variableItem,
        message: 'Failed to get context schema for path',
        severity: 'error',
        owner: 'variable-validation',
        hoverMessage: null,
      });
    }
  }

  return errors;
}
