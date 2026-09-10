/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { isWorkflowValidationRuleId, WORKFLOW_VALIDATION_RULE_IDS } from './rules';

describe('workflow validation rules registry', () => {
  // Renaming a rule ID is a breaking change for anything keyed off it, so the
  // snapshot makes it a reviewed edit rather than a drive-by.
  it('has a stable set of rule IDs', () => {
    expect(WORKFLOW_VALIDATION_RULE_IDS).toMatchInlineSnapshot(`
      Array [
        "connectorNotFound",
        "deprecatedStepType",
        "duplicateStepName",
        "esqlDiagnostic",
        "foreachItemRuntimeType",
        "graphBuildError",
        "invalidAssignmentOperator",
        "invalidCollectionPath",
        "invalidDefaultValue",
        "invalidEqualityOperator",
        "invalidForeachParameter",
        "invalidIfConditionSyntax",
        "invalidInequalityOperator",
        "invalidInputType",
        "invalidParallelMode",
        "invalidStepProperty",
        "invalidTriggerCondition",
        "invalidVariablePath",
        "invalidVariableReference",
        "invalidWorkflowOutput",
        "liquidSyntaxError",
        "missingInputRef",
        "missingRequiredInput",
        "parallelFanOutExceedsLimit",
        "schemaViolation",
        "targetWorkflowNotFound",
        "unboundedParallelFanOut",
        "unknownInputKey",
        "unknownInputRefPath",
        "unknownVariableType",
        "unresolvableInputRef",
        "variablePathParseError",
        "yamlSyntaxError",
      ]
    `);
  });

  it('uses camelCase rule IDs, matching the ES|QL validator convention', () => {
    for (const ruleId of WORKFLOW_VALIDATION_RULE_IDS) {
      expect(ruleId).toMatch(/^[a-z][a-zA-Z0-9]*$/);
    }
  });

  describe('isWorkflowValidationRuleId', () => {
    it('accepts a registered rule ID', () => {
      expect(isWorkflowValidationRuleId('duplicateStepName')).toBe(true);
    });

    it('rejects an unregistered string', () => {
      expect(isWorkflowValidationRuleId('not-a-rule')).toBe(false);
      expect(isWorkflowValidationRuleId('')).toBe(false);
    });

    it('rejects inherited object properties', () => {
      expect(isWorkflowValidationRuleId('toString')).toBe(false);
      expect(isWorkflowValidationRuleId('constructor')).toBe(false);
    });
  });
});
