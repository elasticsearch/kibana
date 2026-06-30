/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { parseDocument } from 'yaml';
import type { WorkflowYaml } from '@kbn/workflows';
import { DynamicStepContextSchema } from '@kbn/workflows';
import { getShape } from '@kbn/workflows/common/utils/zod';
import { WorkflowGraph } from '@kbn/workflows/graph';
import type { ConnectorStep } from '@kbn/workflows/spec/schema';
import {
  FOR_LOOP_NESTED_YAML,
  FOR_LOOP_VALIDATION_YAML,
  forLoopNestedWorkflowDefinition,
  forLoopValidationWorkflowDefinition,
} from './__fixtures__/for_loop_validation_workflow';
import { validateLiquidForLoopCollections } from './validate_liquid_for_loop_collections';
import { validateVariables } from './validate_variables';
import { VARIABLE_REGEX_GLOBAL } from '../../../../common/lib/regex';
import { createFakeMonacoModel } from '../../../../common/mocks/monaco_model';
import { extendContextWithTemplateLocals } from '../../workflow_context/lib/extend_context_with_template_locals';

describe('validateVariables for-loop integration', () => {
  const workflowGraph = WorkflowGraph.fromWorkflowDefinition(forLoopValidationWorkflowDefinition);
  const yamlDocument = parseDocument(FOR_LOOP_VALIDATION_YAML);
  const model = createFakeMonacoModel(FOR_LOOP_VALIDATION_YAML);

  function variableItemForKey(key: string) {
    const match = [...FOR_LOOP_VALIDATION_YAML.matchAll(VARIABLE_REGEX_GLOBAL)].find(
      (m) => m.groups?.key === key
    );
    expect(match).toBeDefined();
    const startOffset = match!.index ?? 0;
    const startPosition = model.getPositionAt(startOffset);
    const endPosition = model.getPositionAt(startOffset + match![0].length);
    return {
      id: `${key}-var`,
      type: 'regexp' as const,
      key,
      startLineNumber: startPosition.lineNumber,
      startColumn: startPosition.column,
      endLineNumber: endPosition.lineNumber,
      endColumn: endPosition.column,
      yamlPath: ['steps', 1, 'with', 'message'],
      offset: startOffset,
    };
  }

  it('treats loop variable yy as valid when iterating steps.iterate_items.items', () => {
    const results = validateVariables(
      [variableItemForKey('yy.name')],
      workflowGraph,
      forLoopValidationWorkflowDefinition,
      yamlDocument,
      model
    );

    const yyResult = results.find((r) => r.id === 'yy.name-var');
    expect(yyResult?.severity).toBeNull();
    expect(yyResult?.message).toBeNull();
  });

  it('does not report variable error for loop var when collection is invalid but collection validator does', () => {
    const badVar = variableItemForKey('xx');
    const varResults = validateVariables(
      [badVar],
      workflowGraph,
      forLoopValidationWorkflowDefinition,
      yamlDocument,
      model
    );
    const xxVarResult = varResults.find((r) => r.id === 'xx-var');
    expect(xxVarResult?.severity).toBeNull();

    const collectionResults = validateLiquidForLoopCollections(
      FOR_LOOP_VALIDATION_YAML,
      yamlDocument,
      model,
      workflowGraph,
      forLoopValidationWorkflowDefinition
    );
    expect(collectionResults.some((r) => r.message?.includes('steps.non_existing_step'))).toBe(
      true
    );
  });

  it('treats forloop.index as valid inside for-loop body', () => {
    const templateYaml = `name: Forloop index
enabled: false
triggers:
  - type: manual
consts:
  items:
    - id: 1
steps:
  - name: iterate
    type: foreach
    foreach: '{{ consts.items }}'
    steps:
      - name: inner
        type: console
        with:
          message: '{% for row in consts.items %}{{ forloop.index }}{% endfor %}'
`;
    const innerStep: ConnectorStep = {
      name: 'inner',
      type: 'console',
      with: {
        message: '{% for row in consts.items %}{{ forloop.index }}{% endfor %}',
      },
    };
    const definition: WorkflowYaml = {
      version: '1',
      name: 'Forloop index',
      enabled: false,
      triggers: [{ type: 'manual' }],
      consts: { items: [{ id: 1 }] },
      steps: [
        {
          name: 'iterate',
          type: 'foreach',
          foreach: '{{ consts.items }}',
          steps: [innerStep],
        },
      ],
    };
    const graph = WorkflowGraph.fromWorkflowDefinition(definition);
    const doc = parseDocument(templateYaml);
    const innerModel = createFakeMonacoModel(templateYaml);
    const match = [...templateYaml.matchAll(VARIABLE_REGEX_GLOBAL)].find(
      (m) => m.groups?.key === 'forloop.index'
    );
    expect(match).toBeDefined();
    const offset = match!.index ?? 0;
    const start = innerModel.getPositionAt(offset);
    const end = innerModel.getPositionAt(offset + match![0].length);

    const results = validateVariables(
      [
        {
          id: 'forloop-index',
          type: 'regexp',
          key: 'forloop.index',
          startLineNumber: start.lineNumber,
          startColumn: start.column,
          endLineNumber: end.lineNumber,
          endColumn: end.column,
          yamlPath: ['steps', 0, 'steps', 0, 'with', 'message'],
          offset,
        },
      ],
      graph,
      definition,
      doc,
      innerModel
    );

    expect(results.find((r) => r.id === 'forloop-index')?.severity).toBeNull();
  });

  it('does not extend schema with loop variable outside for-loop body', () => {
    const template = '{% for row in items %}{% endfor %}{{ row }}';
    const afterBodyOffset = template.indexOf('{{ row }}') + 3;
    const extended = extendContextWithTemplateLocals(
      DynamicStepContextSchema,
      template,
      afterBodyOffset
    );
    expect(getShape(extended)).not.toHaveProperty('row');
  });

  it('treats loop variable as valid in block literal scalar with yamlSource', () => {
    const templateLines = [
      '{%- for yy in steps.iterate_items.items %}',
      '- {{ yy.name }}',
      '{%- endfor %}',
    ];
    const yamlSource = `name: Literal block
enabled: false
triggers:
  - type: manual
consts:
  items:
    - name: Alice
steps:
  - name: iterate_items
    type: foreach
    foreach: '{{ consts.items }}'
    steps:
      - name: log_item
        type: console
        with:
          message: '{{ foreach.item.name }}'
  - name: summarize
    type: console
    with:
      message: |-
        ${templateLines.join('\n        ')}
`;
    const logItemStep: ConnectorStep = {
      name: 'log_item',
      type: 'console',
      with: { message: '{{ foreach.item.name }}' },
    };
    const summarizeStep: ConnectorStep = {
      name: 'summarize',
      type: 'console',
      with: { message: templateLines.join('\n') },
    };
    const literalDefinition: WorkflowYaml = {
      version: '1',
      name: 'Literal block',
      enabled: false,
      triggers: [{ type: 'manual' }],
      consts: { items: [{ name: 'Alice' }] },
      steps: [
        {
          name: 'iterate_items',
          type: 'foreach',
          foreach: '{{ consts.items }}',
          steps: [logItemStep],
        },
        summarizeStep,
      ],
    };
    const literalGraph = WorkflowGraph.fromWorkflowDefinition(literalDefinition);
    const literalDoc = parseDocument(yamlSource);
    const literalModel = createFakeMonacoModel(yamlSource);
    const varOffset = yamlSource.indexOf('{{ yy.name }}');
    const start = literalModel.getPositionAt(varOffset);
    const end = literalModel.getPositionAt(varOffset + '{{ yy.name }}'.length);

    const results = validateVariables(
      [
        {
          id: 'yy-literal',
          type: 'regexp',
          key: 'yy.name',
          startLineNumber: start.lineNumber,
          startColumn: start.column,
          endLineNumber: end.lineNumber,
          endColumn: end.column,
          yamlPath: ['steps', 1, 'with', 'message'],
          offset: varOffset,
        },
      ],
      literalGraph,
      literalDefinition,
      literalDoc,
      literalModel
    );

    expect(results.find((r) => r.id === 'yy-literal')?.severity).toBeNull();
  });

  it('treats inner and outer loop variables as valid in nested for-loop body', () => {
    const nestedGraph = WorkflowGraph.fromWorkflowDefinition(forLoopNestedWorkflowDefinition);
    const nestedDoc = parseDocument(FOR_LOOP_NESTED_YAML);
    const nestedModel = createFakeMonacoModel(FOR_LOOP_NESTED_YAML);
    const innerMatch = [...FOR_LOOP_NESTED_YAML.matchAll(VARIABLE_REGEX_GLOBAL)].find(
      (m) => m.groups?.key === 'inner'
    );
    expect(innerMatch).toBeDefined();
    const innerOffset = innerMatch!.index ?? 0;
    const innerStart = nestedModel.getPositionAt(innerOffset);
    const innerEnd = nestedModel.getPositionAt(innerOffset + innerMatch![0].length);

    const innerResults = validateVariables(
      [
        {
          id: 'inner-var',
          type: 'regexp',
          key: 'inner',
          startLineNumber: innerStart.lineNumber,
          startColumn: innerStart.column,
          endLineNumber: innerEnd.lineNumber,
          endColumn: innerEnd.column,
          yamlPath: ['steps', 1, 'with', 'message'],
          offset: innerOffset,
        },
      ],
      nestedGraph,
      forLoopNestedWorkflowDefinition,
      nestedDoc,
      nestedModel
    );
    expect(innerResults.find((r) => r.id === 'inner-var')?.severity).toBeNull();
  });
});
