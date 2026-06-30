/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Document } from 'yaml';
import { isScalar } from 'yaml';
import type { monaco } from '@kbn/monaco';
import type { WorkflowYaml } from '@kbn/workflows';
import { DynamicStepContextSchema } from '@kbn/workflows';
import type { WorkflowGraph } from '@kbn/workflows/graph';
import type { z } from '@kbn/zod/v4';
import type { AutocompleteContext } from './autocomplete.types';
import { getFocusedYamlPair } from './get_focused_yaml_pair';
import { isInsideLiquidBlock } from './liquid_utils';
import type { LineParseResult } from './parse_line_for_completion';
import { parseLineForCompletion } from './parse_line_for_completion';
import {
  getTriggerConditionBlockIndex,
  isInScheduledTriggerWithBlock,
  isInStepsContext,
  isInTriggersContext,
  isInWorkflowInputsByPosition,
  isInWorkflowInputsPath,
} from './triggers_utils';
import { getPathAtOffset } from '../../../../../../common/lib/yaml';
import { getSchemaAtPath } from '../../../../../../common/lib/zod';
import type { StepInfo, WorkflowDetailState } from '../../../../../entities/workflows/store';
import { getContextSchemaForPath } from '../../../../../features/workflow_context/lib/get_context_for_path';
import { getRegisteredTriggerConditionDefinition } from '../get_registered_trigger_condition_definition';

function buildCompletionInsertRange(
  completionContext: monaco.languages.CompletionContext,
  lineNumber: number,
  position: monaco.Position,
  word: monaco.editor.IWordAtPosition
): monaco.IRange {
  if (completionContext.triggerCharacter === ' ') {
    return {
      startLineNumber: lineNumber,
      endLineNumber: lineNumber,
      startColumn: position.column,
      endColumn: position.column,
    };
  }
  return {
    startLineNumber: lineNumber,
    endLineNumber: lineNumber,
    startColumn: word.startColumn,
    endColumn: word.endColumn,
  };
}

function resolveContextSchemaForAutocomplete(
  workflowDefinition: WorkflowYaml | null | undefined,
  workflowGraph: WorkflowGraph | null | undefined,
  path: (string | number)[],
  yamlDocument: Document,
  absoluteOffset: number,
  lineParseResult: LineParseResult | null,
  yamlSource: string
): { contextSchema: z.ZodType; contextScopedToPath: string | null } {
  let contextSchema: z.ZodType = DynamicStepContextSchema;
  let contextScopedToPath: string | null = null;

  if (workflowDefinition && workflowGraph) {
    contextSchema = getContextSchemaForPath(
      workflowDefinition,
      workflowGraph,
      path,
      yamlDocument,
      absoluteOffset,
      yamlSource
    );
  }

  if (lineParseResult?.fullKey) {
    const { schema: schemaAtPath, scopedToPath } = getSchemaAtPath(
      contextSchema,
      lineParseResult.fullKey,
      { partial: true }
    );
    if (schemaAtPath) {
      contextSchema = schemaAtPath;
      contextScopedToPath = scopedToPath;
    }
  }

  return { contextSchema, contextScopedToPath };
}

function resolveTriggerConditionAutocomplete(
  path: (string | number)[],
  yamlDocument: Document
): Pick<AutocompleteContext, 'isInTriggerConditionField' | 'triggerConditionDefinition'> {
  const triggerConditionBlockIndex = getTriggerConditionBlockIndex(path);
  return {
    isInTriggerConditionField: triggerConditionBlockIndex !== null,
    triggerConditionDefinition: getRegisteredTriggerConditionDefinition(yamlDocument, path),
  };
}

export interface BuildAutocompleteContextParams {
  editorState: WorkflowDetailState;
  model: monaco.editor.ITextModel;
  position: monaco.Position;
  completionContext: monaco.languages.CompletionContext;
}

export function buildAutocompleteContext({
  editorState,
  model,
  position,
  completionContext,
}: BuildAutocompleteContextParams): AutocompleteContext | null {
  // derived from workflow state
  const currentDynamicConnectorTypes = editorState?.connectors?.connectorTypes;
  const workflows = editorState?.workflows;
  const workflowGraph = editorState?.computed?.workflowGraph;
  const yamlDocument = editorState?.computed?.yamlDocument;
  const workflowLookup = editorState?.computed?.workflowLookup;
  const yamlLineCounter = editorState?.computed?.yamlLineCounter;
  const focusedStepId = editorState?.focusedStepId;
  const workflowDefinition = editorState?.computed?.workflowDefinition;
  // monaco-related
  const absoluteOffset = model.getOffsetAt(position);
  const { lineNumber } = position;
  const line = model.getLineContent(lineNumber);
  const word = model.getWordAtPosition(position) || model.getWordUntilPosition(position);

  const focusedStepInfo: StepInfo | null = focusedStepId
    ? workflowLookup?.steps[focusedStepId] ?? null
    : null;
  const focusedYamlPair = getFocusedYamlPair(workflowLookup, focusedStepId, absoluteOffset);

  if (!yamlDocument) {
    return null;
  }

  const range = buildCompletionInsertRange(completionContext, lineNumber, position, word);

  const path = getPathAtOffset(yamlDocument, absoluteOffset);
  const yamlNode = yamlDocument.getIn(path, true);
  const scalarType = isScalar(yamlNode) ? yamlNode.type ?? null : null;

  const lineUpToCursor = line.substring(0, position.column - 1);
  const parseResult = parseLineForCompletion(lineUpToCursor);

  const yamlSource = model.getValue();
  const { contextSchema, contextScopedToPath } = resolveContextSchemaForAutocomplete(
    workflowDefinition,
    workflowGraph,
    path,
    yamlDocument,
    absoluteOffset,
    parseResult,
    yamlSource
  );

  // Check if we're actually inside a liquid block
  const isInLiquidBlock = isInsideLiquidBlock(model.getValue(), position);
  const _isInScheduledTriggerWithBlock = isInScheduledTriggerWithBlock(
    yamlDocument,
    absoluteOffset
  );

  const { isInTriggerConditionField, triggerConditionDefinition } =
    resolveTriggerConditionAutocomplete(path, yamlDocument);

  return {
    // what triggered the completion
    triggerCharacter: completionContext.triggerCharacter ?? null,
    triggerKind: completionContext.triggerKind ?? null,

    // content
    line,
    lineUpToCursor,
    lineParseResult: parseResult,

    // position of the cursor
    path,
    range,
    absoluteOffset,
    focusedStepInfo,
    focusedYamlPair,

    // context
    contextSchema,
    contextScopedToPath,
    yamlDocument,
    yamlLineCounter: yamlLineCounter ?? null,
    scalarType,

    // kind of ast info
    isInLiquidBlock,
    isInTriggerConditionField,
    triggerConditionDefinition,
    isInScheduledTriggerWithBlock: _isInScheduledTriggerWithBlock,
    isInTriggersContext: isInTriggersContext(path),
    isInStepsContext: isInStepsContext(path),
    isInWorkflowInputsContext:
      isInWorkflowInputsPath(path) || isInWorkflowInputsByPosition(focusedStepInfo, absoluteOffset),

    // dynamic connector types
    dynamicConnectorTypes: currentDynamicConnectorTypes ?? null,
    workflows: workflows ?? {
      workflows: {},
      totalWorkflows: 0,
    },
    currentWorkflowId: editorState?.workflow?.id ?? null,
    workflowDefinition: workflowDefinition ?? null,
  };
}
