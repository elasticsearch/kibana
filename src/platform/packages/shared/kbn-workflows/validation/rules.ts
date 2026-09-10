/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Every workflow validation rule, keyed by its stable rule ID. A rule ID is the
 * machine-readable identity of a check: it is not translated and does not change when
 * the message is reworded, so quick fixes, telemetry and suppression can key off it.
 *
 * `owner` is the validator that emits the rule, `defaultSeverity` is a default an
 * emitter may override, and `values` documents the message's interpolation parameters
 * (not yet enforced at call sites).
 *
 * Adding a check means adding an entry here first: `WorkflowValidationRuleId` is
 * derived from these keys, so an unregistered rule ID does not compile.
 */
export interface WorkflowValidationRules {
  // -- yaml ---------------------------------------------------------------------
  yamlSyntaxError: {
    owner: 'yaml';
    defaultSeverity: 'error';
    values: { reason: string };
  };
  /** The document parses but violates the workflow JSON Schema. */
  schemaViolation: {
    owner: 'yaml';
    defaultSeverity: 'error';
    values: { reason: string };
  };

  // -- step names ---------------------------------------------------------------
  duplicateStepName: {
    owner: 'step-name-validation';
    defaultSeverity: 'error';
    values: { stepName: string; occurrences: number };
  };

  // -- graph --------------------------------------------------------------------
  /** The execution graph could not be built from the definition. */
  graphBuildError: {
    owner: 'graph-build-validation';
    defaultSeverity: 'error';
    values: { reason: string };
  };

  // -- variables ----------------------------------------------------------------
  /** A foreach item whose element type is only known at runtime. */
  foreachItemRuntimeType: {
    owner: 'variable-validation';
    defaultSeverity: 'warning';
    values: { description: string };
  };
  invalidVariablePath: {
    owner: 'variable-validation';
    defaultSeverity: 'error';
    values: { key: string };
  };
  variablePathParseError: {
    owner: 'variable-validation';
    defaultSeverity: 'error';
    values: { reason: string };
  };
  /** The variable resolves, but not to something valid in this position. */
  invalidVariableReference: {
    owner: 'variable-validation';
    defaultSeverity: 'error';
    values: { propertyPath: string };
  };
  /** Inference could not determine the variable's type. */
  unknownVariableType: {
    owner: 'variable-validation';
    defaultSeverity: 'warning';
    values: { propertyPath: string };
  };
  /** A `{% for %}` collection path that does not resolve to something iterable. */
  invalidCollectionPath: {
    owner: 'variable-validation';
    defaultSeverity: 'error';
    values: { collectionPath: string };
  };
  /** A foreach parameter that is not a usable collection. */
  invalidForeachParameter: {
    owner: 'variable-validation';
    defaultSeverity: 'warning';
    values: { reason: string };
  };
  // -- liquid templates ---------------------------------------------------------
  liquidSyntaxError: {
    owner: 'liquid-template-validation';
    defaultSeverity: 'error';
    values: { reason: string };
  };

  // -- connectors ---------------------------------------------------------------
  connectorNotFound: {
    owner: 'connector-id-validation';
    defaultSeverity: 'error';
    values: { displayName: string; id: string };
  };
  // -- step properties ----------------------------------------------------------
  invalidStepProperty: {
    owner: 'step-property-validation';
    defaultSeverity: 'error';
    values: { reason: string };
  };
  // -- workflow inputs ----------------------------------------------------------
  /** An input key the target workflow does not declare. */
  unknownInputKey: {
    owner: 'workflow-inputs-validation';
    defaultSeverity: 'warning';
    values: { inputName: string; workflowName: string };
  };
  /** An input value whose type does not match the declared input. */
  invalidInputType: {
    owner: 'workflow-inputs-validation';
    defaultSeverity: 'error';
    values: { inputName: string; expectedType: string; actualType: string };
  };
  missingRequiredInput: {
    owner: 'workflow-inputs-validation';
    defaultSeverity: 'error';
    values: { inputName: string; workflowName: string };
  };
  targetWorkflowNotFound: {
    owner: 'workflow-inputs-validation';
    defaultSeverity: 'error';
    values: { workflowId: string };
  };

  // -- workflow input refs ------------------------------------------------------
  /** No declared input is bound to an input contract the caller requires. */
  missingInputRef: {
    owner: 'workflow-input-ref-validation';
    defaultSeverity: 'error';
    values: { ref: string; declaredInputs: string };
  };
  /** An input is bound to a `$ref` that resolves to no known schema. */
  unresolvableInputRef: {
    owner: 'workflow-input-ref-validation';
    defaultSeverity: 'error';
    values: { ref: string; inputName: string };
  };
  /** A template references a path the input contract's schema does not allow. */
  unknownInputRefPath: {
    owner: 'workflow-input-ref-validation';
    defaultSeverity: 'error';
    values: { ref: string; inputName: string; path: string; knownKeys: string };
  };

  // -- workflow outputs ---------------------------------------------------------
  invalidWorkflowOutput: {
    owner: 'workflow-output-validation';
    defaultSeverity: 'error';
    values: { reason: string };
  };

  // -- if conditions ------------------------------------------------------------
  /** `=` used where `==` was meant. */
  invalidEqualityOperator: {
    owner: 'if-condition-validation';
    defaultSeverity: 'error';
    values: Record<string, never>;
  };
  /** An unsupported inequality operator. */
  invalidInequalityOperator: {
    owner: 'if-condition-validation';
    defaultSeverity: 'error';
    values: Record<string, never>;
  };
  /** Assignment used inside a condition. */
  invalidAssignmentOperator: {
    owner: 'if-condition-validation';
    defaultSeverity: 'error';
    values: Record<string, never>;
  };
  /** The condition is not parseable as KQL. */
  invalidIfConditionSyntax: {
    owner: 'if-condition-validation';
    defaultSeverity: 'error';
    values: { reason: string };
  };

  // -- trigger conditions -------------------------------------------------------
  invalidTriggerCondition: {
    owner: 'trigger-condition-validation';
    defaultSeverity: 'error';
    values: { reason: string };
  };

  // -- json schema defaults -----------------------------------------------------
  /** A declared default value does not satisfy its own property schema. */
  invalidDefaultValue: {
    owner: 'json-schema-default-validation';
    defaultSeverity: 'error';
    values: { propertyName: string; reason: string };
  };

  // -- parallel -----------------------------------------------------------------
  /** A parallel step with no `concurrency` limit. */
  unboundedParallelFanOut: {
    owner: 'parallel-fan-out-validation';
    defaultSeverity: 'warning';
    values: { stepId: string };
  };
  /** A parallel step whose static list exceeds the default fan-out maximum. */
  parallelFanOutExceedsLimit: {
    owner: 'parallel-fan-out-validation';
    defaultSeverity: 'warning';
    values: { stepId: string; itemCount: number; maxFanOut: number };
  };
  /** An unsupported combination of parallel mode options. */
  invalidParallelMode: {
    owner: 'parallel-mode-validation';
    defaultSeverity: 'error';
    values: Record<string, never>;
  };

  // -- deprecations -------------------------------------------------------------
  deprecatedStepType: {
    owner: 'deprecated-step-validation';
    defaultSeverity: 'warning';
    values: { stepType: string };
  };

  // -- es|ql --------------------------------------------------------------------
  /** A diagnostic forwarded from the ES|QL validator. */
  esqlDiagnostic: {
    owner: 'esql-validation';
    defaultSeverity: 'error';
    values: { reason: string };
  };
}

/** The stable identity of a validation check. Never translated. */
export type WorkflowValidationRuleId = keyof WorkflowValidationRules;

/**
 * The validator that emits a rule. `yaml` covers diagnostics we do not author: the
 * `yaml` parser and the JSON Schema layer behind `monaco-yaml`.
 */
export type WorkflowValidationRuleOwner =
  WorkflowValidationRules[WorkflowValidationRuleId]['owner'];

interface WorkflowValidationRuleDefinition<K extends WorkflowValidationRuleId> {
  owner: WorkflowValidationRules[K]['owner'];
  defaultSeverity: WorkflowValidationRules[K]['defaultSeverity'];
}

/**
 * Runtime view of the registry. Mapped over `WorkflowValidationRuleId`, so omitting a
 * rule or misdeclaring its owner is a type error rather than a silent gap.
 */
export const WORKFLOW_VALIDATION_RULES: {
  [K in WorkflowValidationRuleId]: WorkflowValidationRuleDefinition<K>;
} = {
  yamlSyntaxError: { owner: 'yaml', defaultSeverity: 'error' },
  schemaViolation: { owner: 'yaml', defaultSeverity: 'error' },

  duplicateStepName: { owner: 'step-name-validation', defaultSeverity: 'error' },

  graphBuildError: { owner: 'graph-build-validation', defaultSeverity: 'error' },

  foreachItemRuntimeType: { owner: 'variable-validation', defaultSeverity: 'warning' },
  invalidVariablePath: { owner: 'variable-validation', defaultSeverity: 'error' },
  variablePathParseError: { owner: 'variable-validation', defaultSeverity: 'error' },
  invalidVariableReference: { owner: 'variable-validation', defaultSeverity: 'error' },
  unknownVariableType: { owner: 'variable-validation', defaultSeverity: 'warning' },
  invalidCollectionPath: { owner: 'variable-validation', defaultSeverity: 'error' },
  invalidForeachParameter: { owner: 'variable-validation', defaultSeverity: 'warning' },

  liquidSyntaxError: { owner: 'liquid-template-validation', defaultSeverity: 'error' },

  connectorNotFound: { owner: 'connector-id-validation', defaultSeverity: 'error' },

  invalidStepProperty: { owner: 'step-property-validation', defaultSeverity: 'error' },

  unknownInputKey: { owner: 'workflow-inputs-validation', defaultSeverity: 'warning' },
  invalidInputType: { owner: 'workflow-inputs-validation', defaultSeverity: 'error' },
  missingRequiredInput: { owner: 'workflow-inputs-validation', defaultSeverity: 'error' },
  targetWorkflowNotFound: { owner: 'workflow-inputs-validation', defaultSeverity: 'error' },

  missingInputRef: { owner: 'workflow-input-ref-validation', defaultSeverity: 'error' },
  unresolvableInputRef: { owner: 'workflow-input-ref-validation', defaultSeverity: 'error' },
  unknownInputRefPath: { owner: 'workflow-input-ref-validation', defaultSeverity: 'error' },

  invalidWorkflowOutput: { owner: 'workflow-output-validation', defaultSeverity: 'error' },

  invalidEqualityOperator: { owner: 'if-condition-validation', defaultSeverity: 'error' },
  invalidInequalityOperator: { owner: 'if-condition-validation', defaultSeverity: 'error' },
  invalidAssignmentOperator: { owner: 'if-condition-validation', defaultSeverity: 'error' },
  invalidIfConditionSyntax: { owner: 'if-condition-validation', defaultSeverity: 'error' },

  invalidTriggerCondition: { owner: 'trigger-condition-validation', defaultSeverity: 'error' },

  invalidDefaultValue: { owner: 'json-schema-default-validation', defaultSeverity: 'error' },

  unboundedParallelFanOut: { owner: 'parallel-fan-out-validation', defaultSeverity: 'warning' },
  parallelFanOutExceedsLimit: {
    owner: 'parallel-fan-out-validation',
    defaultSeverity: 'warning',
  },
  invalidParallelMode: { owner: 'parallel-mode-validation', defaultSeverity: 'error' },

  deprecatedStepType: { owner: 'deprecated-step-validation', defaultSeverity: 'warning' },

  esqlDiagnostic: { owner: 'esql-validation', defaultSeverity: 'error' },
};

/** Every registered rule ID, sorted. Stable ordering keeps the snapshot test readable. */
export const WORKFLOW_VALIDATION_RULE_IDS = (
  Object.keys(WORKFLOW_VALIDATION_RULES) as WorkflowValidationRuleId[]
).sort();

/** Narrow an arbitrary string to a registered rule ID. */
export function isWorkflowValidationRuleId(value: string): value is WorkflowValidationRuleId {
  return Object.hasOwn(WORKFLOW_VALIDATION_RULES, value);
}
