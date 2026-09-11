/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Document, LineCounter } from 'yaml';
import type { monaco } from '@kbn/code-editor';
import type { WorkflowYaml } from '@kbn/workflows';
import type { WorkflowGraph } from '@kbn/workflows/graph';
import { collectAllVariables } from './collect_all_variables';
import { validateDeprecatedStepTypes } from './validate_deprecated_step_types';
import { validateIfConditions } from './validate_if_conditions';
import { validateJsonSchemaDefaults } from './validate_json_schema_defaults';
import { validateLiquidYamlScalars } from './validate_liquid_yaml_scalars';
import { validateParallelFanOut } from './validate_parallel_fan_out';
import { validateParallelMode } from './validate_parallel_mode';
import { validateStepNameUniqueness } from './validate_step_name_uniqueness';
import { validateTriggerConditions } from './validate_trigger_conditions';
import { validateVariables as validateVariablesInternal } from './validate_variables';
import { validateWorkflowOutputsInYaml } from './validate_workflow_outputs_in_yaml';
import type { WorkflowLookup } from '../../../entities/workflows/store/workflow_detail/utils/build_workflow_lookup';
import type { YamlValidationResult } from '../model/types';

export interface RunWorkflowYamlValidationsParams {
  yamlString: string;
  model: monaco.editor.ITextModel;
  yamlDocument: Document;
  lineCounter: LineCounter;
  workflowLookup?: WorkflowLookup;
  workflowGraph?: WorkflowGraph;
  workflowDefinition?: WorkflowYaml;
}

/**
 * Structural YAML validators shared by the live editor and change-history preview.
 *
 * Connector IDs, step-property handlers, workflow-input cross-references, graph-build
 * failures, and ES|QL cluster validation are layered on top by
 * `collectFullWorkflowYamlValidationResults`.
 */
export function runWorkflowYamlValidations({
  yamlString,
  model,
  yamlDocument,
  lineCounter,
  workflowLookup,
  workflowGraph,
  workflowDefinition,
}: RunWorkflowYamlValidationsParams): YamlValidationResult[] {
  const liquidScalarResults = validateLiquidYamlScalars(
    yamlString,
    yamlDocument,
    lineCounter,
    workflowGraph,
    workflowDefinition
  );

  const results: YamlValidationResult[] = [
    ...validateStepNameUniqueness(yamlDocument, lineCounter),
    ...liquidScalarResults.filter((result) => result.owner === 'liquid-template-validation'),
    ...validateWorkflowOutputsInYaml(yamlDocument, model, workflowDefinition?.outputs),
  ];

  if (workflowLookup && lineCounter) {
    results.push(
      ...validateDeprecatedStepTypes(workflowLookup, lineCounter),
      ...validateIfConditions(workflowLookup, lineCounter),
      ...validateParallelMode(workflowLookup, lineCounter),
      ...validateParallelFanOut(workflowLookup, lineCounter)
    );
  }

  if (workflowGraph && workflowDefinition) {
    const variableItems = collectAllVariables(yamlString, yamlDocument, lineCounter, workflowGraph);
    results.push(
      ...validateTriggerConditions(workflowDefinition, yamlDocument),
      ...validateVariablesInternal(
        variableItems,
        workflowGraph,
        workflowDefinition,
        yamlDocument,
        yamlString
      ),
      ...liquidScalarResults.filter((result) => result.owner === 'variable-validation'),
      ...validateJsonSchemaDefaults(yamlDocument, workflowDefinition, model)
    );
  }

  return results;
}
