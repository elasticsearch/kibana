/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  ValidateWorkflowResponseDto,
  WorkflowInputRefViolation,
  WorkflowYaml,
} from '@kbn/workflows';
import {
  scanForTemplateVariables,
  validateStepNameUniqueness,
  validateWorkflowInputRefs,
} from '@kbn/workflows';
import { isGraphBuildError, WorkflowGraph } from '@kbn/workflows/graph';
import type { WorkflowDiagnostic } from '@kbn/workflows/types/v1';
import {
  InvalidYamlSchemaError,
  InvalidYamlSyntaxError,
  parseWorkflowYamlToJSON,
  validateLiquidTemplate,
} from '@kbn/workflows-yaml';
import type { z } from '@kbn/zod/v4';
import { connectorParamsSchemaResolver } from './connector_params_schema_resolver';
import type { TriggerDefinitionForValidateTriggers } from './validate_triggers';
import { validateTriggers } from './validate_triggers';

export interface ValidateWorkflowYamlOptions {
  triggerDefinitions?: TriggerDefinitionForValidateTriggers[];
  /** Opt-in: when omitted, no input-ref checks run. */
  expectedInputRefs?: readonly string[];
}

/** The subset of validation options a caller controls; the rest is derived from server state. */
export type ValidateWorkflowRequestOptions = Pick<ValidateWorkflowYamlOptions, 'expectedInputRefs'>;

const INPUT_REF_RULE_IDS = {
  missing_input_ref: 'missingInputRef',
  unresolvable_input_ref: 'unresolvableInputRef',
  unknown_input_ref_path: 'unknownInputRefPath',
} as const satisfies Record<WorkflowInputRefViolation['reason'], WorkflowDiagnostic['ruleId']>;

export function validateWorkflowYaml(
  yaml: string,
  zodSchema: z.ZodType,
  options?: ValidateWorkflowYamlOptions
): ValidateWorkflowResponseDto {
  const diagnostics: WorkflowDiagnostic[] = [];
  let parsedWorkflow: WorkflowYaml | undefined;

  const parseResult = parseWorkflowYamlToJSON(yaml, zodSchema, {
    connectorParamsSchemaResolver,
  });

  if (!parseResult.success) {
    const { error } = parseResult;

    if (error instanceof InvalidYamlSyntaxError) {
      diagnostics.push({
        severity: 'error',
        message: error.message,
        source: 'yaml-syntax',
        ruleId: 'yamlSyntaxError',
      });
    } else if (error instanceof InvalidYamlSchemaError) {
      if (error.formattedZodError?.issues) {
        for (const issue of error.formattedZodError.issues) {
          diagnostics.push({
            severity: 'error',
            message: issue.message,
            source: 'schema',
            path: issue.path as (string | number)[],
            ruleId: 'schemaViolation',
          });
        }
      } else {
        diagnostics.push({
          severity: 'error',
          message: error.message,
          source: 'schema',
          ruleId: 'schemaViolation',
        });
      }
    } else {
      diagnostics.push({
        severity: 'error',
        message: error.message,
        source: 'yaml-syntax',
        ruleId: 'yamlSyntaxError',
      });
    }
  }

  if (parseResult.success) {
    parsedWorkflow = parseResult.data as unknown as WorkflowYaml;

    try {
      const stepValidation = validateStepNameUniqueness(parsedWorkflow);
      for (const stepError of stepValidation.errors) {
        diagnostics.push({
          severity: 'error',
          message: stepError.message,
          source: 'step-name',
          ruleId: 'duplicateStepName',
        });
      }
    } catch {
      // Structure too malformed for step name validation
    }

    if (options?.triggerDefinitions) {
      const triggerValidation = validateTriggers(parsedWorkflow, options.triggerDefinitions);
      for (const triggerError of triggerValidation.errors) {
        diagnostics.push({
          severity: 'error',
          message: triggerError.message,
          source: 'trigger',
          ruleId: 'invalidTriggerCondition',
        });
      }
    }

    // Compile the parsed definition into its execution graph. The schema can be
    // valid while the graph build rejects an unsupported structure (e.g. nested
    // flow-control inside a parallel branch). Catching it here marks the workflow
    // invalid at create/update time with the actionable message, instead of
    // letting it pass as `valid: true` and crash the run task later (which would
    // surface only an opaque TaskRecoveryError with no step records).
    try {
      WorkflowGraph.fromWorkflowDefinition(parsedWorkflow);
    } catch (error) {
      // The GraphBuildError message already names the offending step, so a plain
      // diagnostic carries enough context for the author without extending the
      // diagnostic shape with graph-specific fields.
      const message =
        isGraphBuildError(error) || error instanceof Error ? error.message : String(error);
      diagnostics.push({ severity: 'error', message, source: 'graph', ruleId: 'graphBuildError' });
    }

    if (options?.expectedInputRefs?.length) {
      // Scanning the parsed definition also covers variables inside `{% %}` tags, which a
      // `{{ }}` match would miss.
      const violations = validateWorkflowInputRefs({
        definition: parsedWorkflow,
        templateVariables: scanForTemplateVariables(parsedWorkflow),
        expectedInputRefs: options.expectedInputRefs,
      });

      for (const violation of violations) {
        diagnostics.push({
          severity: 'error',
          message: violation.message,
          source: 'input-ref',
          ruleId: INPUT_REF_RULE_IDS[violation.reason],
        });
      }
    }
  }

  const liquidErrors = validateLiquidTemplate(yaml, parseResult.document);
  for (const liquidError of liquidErrors) {
    diagnostics.push({
      severity: 'error',
      message: liquidError.message,
      source: 'liquid',
      ruleId: 'liquidSyntaxError',
    });
  }

  return {
    valid: diagnostics.filter((d) => d.severity === 'error').length === 0,
    diagnostics,
    parsedWorkflow,
  };
}
