/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Document } from 'yaml';
import type { WorkflowYaml } from '@kbn/workflows';
import { DynamicWorkflowContextSchema } from '@kbn/workflows';
import { WorkflowGraph } from '@kbn/workflows/graph';

jest.mock('../../workflow_context/lib/get_context_for_path');
jest.mock('../../workflow_context/lib/get_workflow_context_schema');
jest.mock('../../workflow_context/lib/extend_context_with_template_locals');
jest.mock('./validate_variable');
jest.mock('../../../../common/lib/yaml/get_scalar_value_at_offset');

import { validateVariable } from './validate_variable';
import { validateVariables } from './validate_variables';
import { getScalarValueAtOffset } from '../../../../common/lib/yaml/get_scalar_value_at_offset';
import { getContextSchemaWithTemplateLocals } from '../../workflow_context/lib/extend_context_with_template_locals';
import {
  extendWithPathSpecificContext,
  getContextSchemaForStep,
} from '../../workflow_context/lib/get_context_for_path';
import { getWorkflowContextSchema } from '../../workflow_context/lib/get_workflow_context_schema';
import type { VariableItem, YamlValidationResult } from '../model/types';

const mockGetScalarValueAtOffset = getScalarValueAtOffset as jest.MockedFunction<
  typeof getScalarValueAtOffset
>;

const mockGetContextSchemaForStep = getContextSchemaForStep as jest.MockedFunction<
  typeof getContextSchemaForStep
>;
const mockExtendWithPathSpecificContext = extendWithPathSpecificContext as jest.MockedFunction<
  typeof extendWithPathSpecificContext
>;
const mockGetWorkflowContextSchema = getWorkflowContextSchema as jest.MockedFunction<
  typeof getWorkflowContextSchema
>;
const mockGetContextSchemaWithTemplateLocals =
  getContextSchemaWithTemplateLocals as jest.MockedFunction<
    typeof getContextSchemaWithTemplateLocals
  >;
const mockValidateVariable = validateVariable as jest.MockedFunction<typeof validateVariable>;

describe('validateVariables', () => {
  const mockStepSchema = {};

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetWorkflowContextSchema.mockReturnValue(DynamicWorkflowContextSchema);
    mockGetContextSchemaForStep.mockReturnValue(mockStepSchema as any);
    mockExtendWithPathSpecificContext.mockImplementation((schema) => schema);
    mockGetContextSchemaWithTemplateLocals.mockReturnValue(mockStepSchema as any);
  });

  const createVariableItem = (overrides: Partial<VariableItem> = {}): VariableItem => ({
    id: 'test-id',
    type: 'regexp',
    key: 'test.variable',
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: 1,
    endColumn: 10,
    yamlPath: ['steps', 0, 'params', 'value'],
    offset: 0,
    ...overrides,
  });

  const mockWorkflowDefinition = {
    name: 'Test Workflow',
    version: '1',
    enabled: true,
    triggers: [{ type: 'manual' }],
    steps: [
      {
        name: 'step-a',
        type: 'test',
        with: { value: '{{test.variable}}' },
      },
      {
        name: 'step-b',
        type: 'test',
        with: { value: '{{test.variable2}}' },
      },
      {
        name: 'step-c',
        type: 'test',
        with: { value: '{{test.variable3}}' },
      },
    ],
  } as WorkflowYaml;

  const mockWorkflowGraph = WorkflowGraph.fromWorkflowDefinition(mockWorkflowDefinition);

  it('should return array of validation results when no variables have errors', () => {
    const variables = [
      createVariableItem({ key: 'var1' }),
      createVariableItem({ key: 'var2' }),
      createVariableItem({ key: 'var3' }),
    ];

    mockValidateVariable.mockReturnValue({} as YamlValidationResult);

    const result = validateVariables(variables, mockWorkflowGraph, mockWorkflowDefinition);

    expect(result).toHaveLength(3);
    expect(mockValidateVariable).toHaveBeenCalledTimes(3);
  });

  it('should collect errors from variable validation', () => {
    const variables = [
      createVariableItem({ key: 'validVar' }),
      createVariableItem({ key: 'invalidVar' }),
      createVariableItem({ key: 'anotherInvalidVar' }),
    ];

    mockValidateVariable
      .mockReturnValueOnce({
        id: 'validVar',
        message: null,
        severity: null,
        source: 'variable-validation',
        hoverMessage: null,
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 10,
        owner: 'variable-validation',
      }) // First variable is valid
      .mockReturnValueOnce({
        id: 'error-1',
        message: 'Variable invalidVar is invalid',
        severity: 'error',
        source: 'variable-validation',
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 10,
        hoverMessage: null,
        owner: 'variable-validation',
      })
      .mockReturnValueOnce({
        id: 'error-2',
        message: 'Variable anotherInvalidVar is invalid',
        severity: 'error',
        source: 'variable-validation',
        startLineNumber: 2,
        startColumn: 1,
        endLineNumber: 2,
        endColumn: 10,
        hoverMessage: null,
        owner: 'variable-validation',
      });

    const result = validateVariables(variables, mockWorkflowGraph, mockWorkflowDefinition);

    expect(result).toHaveLength(3);
    expect(result[0].message).toBe(null);
    expect(result[1].message).toBe('Variable invalidVar is invalid');
    expect(result[2].message).toBe('Variable anotherInvalidVar is invalid');
  });

  it('should handle context schema errors', () => {
    const variables = [
      createVariableItem({ key: 'var1', yamlPath: ['steps', 0, 'with', 'value'] }),
    ];

    mockGetContextSchemaForStep.mockImplementation(() => {
      throw new Error('Invalid path');
    });

    const result = validateVariables(variables, mockWorkflowGraph, mockWorkflowDefinition);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      message: 'Failed to get context schema for path',
      severity: 'error',
      owner: 'variable-validation',
      hoverMessage: null,
      key: 'var1',
    });
    expect(mockValidateVariable).not.toHaveBeenCalled();
  });

  it('should process mixed valid and invalid variables', () => {
    const variables = [
      createVariableItem({ key: 'valid1', yamlPath: ['steps', 0, 'with', 'a'] }),
      createVariableItem({ key: 'invalid1', yamlPath: ['steps', 0, 'with', 'b'] }),
      createVariableItem({ key: 'valid2', yamlPath: ['steps', 0, 'with', 'c'] }),
      createVariableItem({ key: 'contextError', yamlPath: ['steps', 1, 'with', 'd'] }),
      createVariableItem({ key: 'invalid2', yamlPath: ['steps', 2, 'with', 'e'] }),
    ];

    // step-a succeeds (used by valid1, invalid1, valid2), step-b throws (contextError), step-c succeeds (invalid2)
    mockGetContextSchemaForStep
      .mockReturnValueOnce({} as any)
      .mockImplementationOnce(() => {
        throw new Error('Context error');
      })
      .mockReturnValueOnce({} as any);

    mockValidateVariable
      .mockReturnValueOnce({
        id: 'valid1',
        message: null,
        severity: null,
        source: 'variable-validation',
        hoverMessage: null,
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 10,
        owner: 'variable-validation',
      })
      .mockReturnValueOnce({
        id: 'error-1',
        message: 'Variable invalid1 is invalid',
        severity: 'error',
        source: 'variable-validation',
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 10,
        hoverMessage: null,
        owner: 'variable-validation',
      })
      .mockReturnValueOnce({
        id: 'valid2',
        message: null,
        severity: null,
        source: 'variable-validation',
        hoverMessage: null,
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 10,
        owner: 'variable-validation',
      })
      .mockReturnValueOnce({
        id: 'error-2',
        message: 'Variable invalid2 is invalid',
        severity: 'warning',
        source: 'variable-validation',
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 10,
        hoverMessage: 'Type info',
        owner: 'variable-validation',
      });

    const result = validateVariables(variables, mockWorkflowGraph, mockWorkflowDefinition);

    expect(result).toHaveLength(5);
    expect(result[0].message).toBe(null);
    expect(result[1].message).toBe('Variable invalid1 is invalid');
    expect(result[2].message).toBe(null);
    expect(result[3].message).toBe('Failed to get context schema for path');
    expect(result[3].severity).toBe('error');
    expect(result[4].message).toBe('Variable invalid2 is invalid');
    expect(result[4].severity).toBe('warning');
  });

  it('should handle empty variable list', () => {
    const result = validateVariables([], mockWorkflowGraph, mockWorkflowDefinition);

    expect(result).toEqual([]);
    expect(mockGetContextSchemaForStep).not.toHaveBeenCalled();
    expect(mockValidateVariable).not.toHaveBeenCalled();
  });

  it('should cache path and template-local context for variables with the same yaml path and offset', () => {
    const sharedPath: Array<string | number> = ['steps', 0, 'with', 'value'];
    const sharedOffset = 42;
    const variables = [
      createVariableItem({ key: 'var1', yamlPath: sharedPath, offset: sharedOffset }),
      createVariableItem({ key: 'var2', yamlPath: sharedPath, offset: sharedOffset }),
    ];

    mockValidateVariable.mockReturnValue({} as YamlValidationResult);

    validateVariables(variables, mockWorkflowGraph, mockWorkflowDefinition, {} as Document);

    expect(mockGetContextSchemaForStep).toHaveBeenCalledTimes(1);
    expect(mockExtendWithPathSpecificContext).toHaveBeenCalledTimes(1);
    expect(mockGetContextSchemaWithTemplateLocals).toHaveBeenCalledTimes(1);
    expect(mockValidateVariable).toHaveBeenCalledTimes(2);
  });

  it('should pass correct parameters to validateVariable', () => {
    const variable = createVariableItem({
      key: 'test.deep.variable',
      yamlPath: ['steps', 0, 'params', 'value'],
    });

    const mockContext = { someSchema: true };
    mockGetContextSchemaForStep.mockReturnValue(mockContext as any);
    mockValidateVariable.mockReturnValue({} as YamlValidationResult);

    validateVariables([variable], mockWorkflowGraph, mockWorkflowDefinition);

    expect(mockGetContextSchemaForStep).toHaveBeenCalledWith(
      expect.anything(),
      mockWorkflowGraph,
      'step-a'
    );
    expect(mockValidateVariable).toHaveBeenCalledWith(variable, mockContext);
  });

  it('should handle foreach variables', () => {
    const foreachVariable = createVariableItem({
      key: 'items',
      type: 'foreach',
      yamlPath: ['steps', 0, 'foreach'],
    });

    mockValidateVariable.mockReturnValue({
      id: 'foreach-error',
      message: 'Foreach parameter can be an array or a JSON string',
      severity: 'warning',
      source: 'variable-validation',
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 10,
      hoverMessage: '<pre>(property) items: array</pre>',
      owner: 'variable-validation',
    });

    const result = validateVariables([foreachVariable], mockWorkflowGraph, mockWorkflowDefinition);

    expect(result).toHaveLength(1);
    expect(result[0].message).toContain('Foreach parameter');
  });

  it('should extend context with template-local assign so x is valid', () => {
    const templateString = '{% assign x = 1 %}{{ x }}';
    const scalarStart = 100;
    const variableOffsetInDoc = scalarStart + templateString.indexOf('{{ x }}') + 4;
    const variableItem = createVariableItem({
      key: 'x',
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 10,
      yamlPath: ['steps', 0, 'with', 'message'],
      offset: variableOffsetInDoc,
    });
    const mockModel = {
      getOffsetAt: jest.fn((pos: { lineNumber: number; column: number }) => {
        if (pos.lineNumber === 1 && pos.column === 1) {
          return variableOffsetInDoc;
        }
        return 0;
      }),
      getValue: jest.fn(() => ''),
    } as any;
    const mockYamlDocument = {} as any;
    mockGetScalarValueAtOffset.mockReturnValue({
      value: templateString,
      range: [
        scalarStart,
        scalarStart + templateString.length,
        scalarStart + templateString.length,
      ],
    } as any);
    // Use real implementations so template locals are applied
    const { getContextSchemaForStep: realGetContextSchemaForStep } = jest.requireActual<
      typeof import('../../workflow_context/lib/get_context_for_path')
    >('../../workflow_context/lib/get_context_for_path');
    mockGetContextSchemaForStep.mockImplementation(realGetContextSchemaForStep);
    const { getContextSchemaWithTemplateLocals: realGetContextSchemaWithTemplateLocals } =
      jest.requireActual<
        typeof import('../../workflow_context/lib/extend_context_with_template_locals')
      >('../../workflow_context/lib/extend_context_with_template_locals');
    mockGetContextSchemaWithTemplateLocals.mockImplementation(
      realGetContextSchemaWithTemplateLocals
    );
    mockValidateVariable.mockReturnValue({
      ...variableItem,
      message: null,
      severity: null,
      owner: 'variable-validation',
      hoverMessage: null,
    });

    const result = validateVariables(
      [variableItem],
      mockWorkflowGraph,
      mockWorkflowDefinition,
      mockYamlDocument,
      mockModel
    );

    expect(mockGetScalarValueAtOffset).toHaveBeenCalledWith(mockYamlDocument, variableOffsetInDoc);
    expect(result).toHaveLength(1);
    expect(result[0].message).toBe(null);
  });

  it('should preserve all properties from validation errors', () => {
    const variable = createVariableItem({
      key: 'test.var',
      startLineNumber: 5,
      startColumn: 10,
      endLineNumber: 5,
      endColumn: 20,
      offset: 0,
    });

    mockValidateVariable.mockReturnValue({
      id: 'test-error',
      message: 'Test error message',
      severity: 'error',
      startLineNumber: 5,
      startColumn: 10,
      endLineNumber: 5,
      endColumn: 20,
      hoverMessage: 'Hover info',
      owner: 'variable-validation',
    });

    const result = validateVariables([variable], mockWorkflowGraph, mockWorkflowDefinition);

    expect(result[0]).toEqual({
      id: 'test-error',
      message: 'Test error message',
      severity: 'error',
      startLineNumber: 5,
      startColumn: 10,
      endLineNumber: 5,
      endColumn: 20,
      hoverMessage: 'Hover info',
      owner: 'variable-validation',
    });
  });
});
