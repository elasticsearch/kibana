/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { parseDocument } from 'yaml';
import { DynamicStepContextSchema } from '@kbn/workflows';
import { getSchemaAtPath } from '@kbn/workflows/common/utils/zod/get_schema_at_path';
import { WorkflowGraph } from '@kbn/workflows/graph';
import { z } from '@kbn/zod/v4';
import {
  FOR_LOOP_FOLDED_ONLY_YAML,
  FOR_LOOP_NESTED_YAML,
  FOR_LOOP_RUNTIME_JSON_YAML,
  FOR_LOOP_VALIDATION_YAML,
  forLoopFoldedOnlyWorkflowDefinition,
  forLoopNestedWorkflowDefinition,
  forLoopRuntimeJsonWorkflowDefinition,
  forLoopValidationWorkflowDefinition,
} from './__fixtures__/for_loop_validation_workflow';
import { validateLiquidForLoopCollections } from './validate_liquid_for_loop_collections';
import { createFakeMonacoModel } from '../../../../common/mocks/monaco_model';
import { getContextSchemaForStep } from '../../workflow_context/lib/get_context_for_path';
import {
  FOREACH_ITEM_SCHEMA_DESC,
  getForeachCollectionDiagnostic,
  getForeachItemSchema,
} from '../../workflow_context/lib/get_foreach_state_schema';
import { getWorkflowContextSchema } from '../../workflow_context/lib/get_workflow_context_schema';

describe('validateLiquidForLoopCollections', () => {
  const yamlDocument = parseDocument(FOR_LOOP_VALIDATION_YAML);
  const model = createFakeMonacoModel(FOR_LOOP_VALIDATION_YAML);
  const workflowGraph = WorkflowGraph.fromWorkflowDefinition(forLoopValidationWorkflowDefinition);

  let results: ReturnType<typeof validateLiquidForLoopCollections>;

  beforeEach(() => {
    results = validateLiquidForLoopCollections(
      FOR_LOOP_VALIDATION_YAML,
      yamlDocument,
      model,
      workflowGraph,
      forLoopValidationWorkflowDefinition
    );
  });

  it('places marker on the collection path in YAML source', () => {
    const collectionPath = 'steps.non_existing_step';
    const yamlOffset = FOR_LOOP_VALIDATION_YAML.indexOf(collectionPath);
    expect(yamlOffset).toBeGreaterThan(-1);

    const nonExistingError = results.find((r) => r.message?.includes(collectionPath));
    expect(nonExistingError).toBeDefined();
    expect(nonExistingError?.startLineNumber).toBe(model.getPositionAt(yamlOffset).lineNumber);
    expect(nonExistingError?.startColumn).toBe(model.getPositionAt(yamlOffset).column);
    expect(nonExistingError?.endLineNumber).toBe(
      model.getPositionAt(yamlOffset + collectionPath.length).lineNumber
    );
    expect(nonExistingError?.endColumn).toBe(
      model.getPositionAt(yamlOffset + collectionPath.length).column
    );
  });

  it('returns no diagnostics for output-only liquid without for tags in AST', () => {
    const plainYaml = `name: Plain
enabled: false
triggers:
  - type: manual
steps:
  - name: only
    type: console
    with:
      message: '{{ steps.only }}'
`;
    const plainResults = validateLiquidForLoopCollections(
      plainYaml,
      parseDocument(plainYaml),
      createFakeMonacoModel(plainYaml),
      workflowGraph,
      forLoopValidationWorkflowDefinition
    );
    expect(plainResults).toHaveLength(0);
  });

  it('reports collection error on block-folded message field with marker position', () => {
    const collectionPath = 'steps.non_existing_step';
    const foldedDoc = parseDocument(FOR_LOOP_FOLDED_ONLY_YAML);
    const foldedModel = createFakeMonacoModel(FOR_LOOP_FOLDED_ONLY_YAML);
    const foldedGraph = WorkflowGraph.fromWorkflowDefinition(forLoopFoldedOnlyWorkflowDefinition);
    const yamlOffset = FOR_LOOP_FOLDED_ONLY_YAML.indexOf(collectionPath);
    expect(yamlOffset).toBeGreaterThan(-1);

    const foldedResults = validateLiquidForLoopCollections(
      FOR_LOOP_FOLDED_ONLY_YAML,
      foldedDoc,
      foldedModel,
      foldedGraph,
      forLoopFoldedOnlyWorkflowDefinition
    );

    const badCollection = foldedResults.find((r) => r.message?.includes(collectionPath));
    expect(badCollection).toBeDefined();
    expect(badCollection?.severity).toBe('error');
    expect(badCollection?.startLineNumber).toBe(foldedModel.getPositionAt(yamlOffset).lineNumber);
    expect(badCollection?.startColumn).toBe(foldedModel.getPositionAt(yamlOffset).column);
  });

  it('reports nested inner collection error without error on valid outer collection', () => {
    const nestedDoc = parseDocument(FOR_LOOP_NESTED_YAML);
    const nestedModel = createFakeMonacoModel(FOR_LOOP_NESTED_YAML);
    const nestedGraph = WorkflowGraph.fromWorkflowDefinition(forLoopNestedWorkflowDefinition);

    const nestedResults = validateLiquidForLoopCollections(
      FOR_LOOP_NESTED_YAML,
      nestedDoc,
      nestedModel,
      nestedGraph,
      forLoopNestedWorkflowDefinition
    );

    expect(nestedResults.some((r) => r.message?.includes('steps.non_existing_step'))).toBe(true);
    expect(
      nestedResults.filter((r) => r.message?.includes('steps.iterate_items.items'))
    ).toHaveLength(0);
  });

  it('maps runtime JSON string collection paths to warning diagnostics', () => {
    const stepContext = DynamicStepContextSchema.extend({
      steps: z.object({
        fetch: z.object({ output: z.string() }),
      }),
    });
    expect(
      getForeachCollectionDiagnostic(
        getForeachItemSchema(stepContext, 'steps.fetch.output'),
        'steps.fetch.output'
      )
    ).toEqual({
      message: FOREACH_ITEM_SCHEMA_DESC.RUNTIME_JSON,
      severity: 'warning',
    });

    const runtimeDoc = parseDocument(FOR_LOOP_RUNTIME_JSON_YAML);
    const runtimeModel = createFakeMonacoModel(FOR_LOOP_RUNTIME_JSON_YAML);
    const runtimeGraph = WorkflowGraph.fromWorkflowDefinition(forLoopRuntimeJsonWorkflowDefinition);
    const baseSchema = DynamicStepContextSchema.merge(
      getWorkflowContextSchema(forLoopRuntimeJsonWorkflowDefinition, runtimeDoc)
    ) as typeof DynamicStepContextSchema;
    const summarizeSchema = getContextSchemaForStep(baseSchema, runtimeGraph, 'summarize');
    const { schema: fetchOutputSchema } = getSchemaAtPath(summarizeSchema, 'steps.fetch.output');
    if (!(fetchOutputSchema instanceof z.ZodString)) {
      return;
    }

    const runtimeResults = validateLiquidForLoopCollections(
      FOR_LOOP_RUNTIME_JSON_YAML,
      runtimeDoc,
      runtimeModel,
      runtimeGraph,
      forLoopRuntimeJsonWorkflowDefinition
    );
    expect(
      runtimeResults.some(
        (r) => r.severity === 'warning' && r.message === FOREACH_ITEM_SCHEMA_DESC.RUNTIME_JSON
      )
    ).toBe(true);
  });

  it.each([
    ['steps.non_existing_step', 'error', 'is invalid'],
    ['steps.log_item', 'error', 'Expected array'],
    ['steps.iterate_items.items', null, null],
  ] as const)(
    'collection path %s severity %s',
    (collectionPath, expectedSeverity, messageSubstring) => {
      const match = results.find(
        (r) =>
          r.message?.includes(collectionPath) ||
          (messageSubstring != null && r.message?.includes(messageSubstring))
      );
      if (expectedSeverity === null) {
        expect(match).toBeUndefined();
        return;
      }
      expect(match).toBeDefined();
      expect(match?.severity).toBe(expectedSeverity);
      if (messageSubstring) {
        expect(match?.message).toContain(messageSubstring);
      }
    }
  );
});
