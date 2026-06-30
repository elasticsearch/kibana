/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import _ from 'lodash';
import type { Document, Node, Pair, Scalar } from 'yaml';
import { visit } from 'yaml';
import type { monaco } from '@kbn/monaco';
import { DynamicStepContextSchema } from '@kbn/workflows';
import type { WorkflowYaml } from '@kbn/workflows';
import { getPathFromAncestors } from '@kbn/workflows/common/utils/yaml';
import type { WorkflowGraph } from '@kbn/workflows/graph';
import { extractLiquidErrorPosition } from '../../../../common/lib/extract_liquid_error_position';
import { parseTemplateString } from '../../../../common/lib/liquid_parse_cache';
import { parseVariablePath } from '../../../../common/lib/parse_variable_path';
import { InvalidForeachParameterError } from '../../workflow_context/lib/errors';
import { getContextSchemaWithTemplateLocals } from '../../workflow_context/lib/extend_context_with_template_locals';
import {
  type ForLoopScope,
  getAllForLoopScopes,
  getTemplateLocalContext,
  isLiquidRangeLiteral,
  resolveAssignChain,
} from '../../workflow_context/lib/extract_template_local_context';
import { getContextSchemaForStep } from '../../workflow_context/lib/get_context_for_path';
import {
  getForeachCollectionDiagnostic,
  getForeachItemSchema,
} from '../../workflow_context/lib/get_foreach_state_schema';
import { getNearestStepPath } from '../../workflow_context/lib/get_nearest_step_path';
import { getWorkflowContextSchema } from '../../workflow_context/lib/get_workflow_context_schema';
import type { YamlValidationErrorSeverity, YamlValidationResult } from '../model/types';

const LIQUID_OUTPUT_PATTERN = '{{';
const LIQUID_TAG_PATTERN = '{%';

type YamlAncestor = Node | Document<Node, true> | Pair<unknown, unknown>;

interface CollectionDiagnostic {
  message: string;
  severity: YamlValidationErrorSeverity;
}

interface ForLoopValidationContext {
  readonly yamlString: string;
  readonly model: monaco.editor.ITextModel;
  readonly workflowGraph: WorkflowGraph;
  readonly workflowDefinition: WorkflowYaml;
  readonly yamlDocument: Document;
  readonly baseSchema: typeof DynamicStepContextSchema;
  readonly stepSchemaCache: Map<string, typeof DynamicStepContextSchema>;
}

/**
 * Single YAML document visit for Liquid syntax errors and (when graph is available)
 * for-loop collection path validation.
 */
export function validateLiquidYamlScalars(
  yamlString: string,
  yamlDocument: Document,
  model: monaco.editor.ITextModel | null,
  workflowGraph?: WorkflowGraph,
  workflowDefinition?: WorkflowYaml
): YamlValidationResult[] {
  const results: YamlValidationResult[] = [];
  const forLoopContext: ForLoopValidationContext | null =
    model != null && workflowGraph != null && workflowDefinition != null
      ? {
          yamlString,
          model,
          workflowGraph,
          workflowDefinition,
          yamlDocument,
          baseSchema: DynamicStepContextSchema.merge(
            getWorkflowContextSchema(workflowDefinition, yamlDocument)
          ) as typeof DynamicStepContextSchema,
          stepSchemaCache: new Map(),
        }
      : null;

  visit(yamlDocument, {
    Scalar(key, node, ancestors) {
      if (key === 'key') {
        return;
      }
      if (!node.range || typeof node.value !== 'string') {
        return;
      }
      const hasOutput = node.value.includes(LIQUID_OUTPUT_PATTERN);
      const hasTag = node.value.includes(LIQUID_TAG_PATTERN);
      if (!hasOutput && !hasTag) {
        return;
      }

      try {
        parseTemplateString(node.value);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Invalid Liquid syntax';
        const relativePosition = extractLiquidErrorPosition(node.value, errorMessage);
        const absPosition = mapLiquidSyntaxErrorToAbsoluteRange(
          yamlString,
          node,
          errorMessage,
          relativePosition
        );
        const startPos = offsetToLineColumn(yamlString, absPosition.start);
        const endPos = offsetToLineColumn(yamlString, absPosition.end);

        results.push({
          id: `liquid-template-${startPos.line}-${startPos.column}-${endPos.line}-${endPos.column}`,
          owner: 'liquid-template-validation',
          message: errorMessage.replace(/, line:\d+, col:\d+/g, ''),
          startLineNumber: startPos.line,
          startColumn: startPos.column,
          endLineNumber: endPos.line,
          endColumn: endPos.column,
          severity: 'error',
          hoverMessage: errorMessage.replace(/, line:\d+, col:\d+/g, ''),
        });
      }

      if (forLoopContext != null && hasTag) {
        results.push(
          ...collectForLoopCollectionResults(forLoopContext, node, node.value, ancestors)
        );
      }
    },
  });

  return results;
}

function mapLiquidSyntaxErrorToAbsoluteRange(
  yamlString: string,
  node: Scalar,
  errorMessage: string,
  relativePosition: { start: number; end: number }
): { start: number; end: number } {
  const range = node.range;
  if (!range) {
    return relativePosition;
  }

  switch (node.type) {
    case 'BLOCK_FOLDED':
    case 'BLOCK_LITERAL': {
      const nodeSource = yamlString.substring(range[0], range[2]);
      const posInSource = extractLiquidErrorPosition(nodeSource, errorMessage);
      return {
        start: range[0] + posInSource.start,
        end: range[0] + posInSource.end,
      };
    }
    case 'QUOTE_DOUBLE':
    case 'QUOTE_SINGLE': {
      const valueStart = range[0] + 1;
      return {
        start: valueStart + relativePosition.start,
        end: valueStart + relativePosition.end,
      };
    }
    default: {
      return {
        start: range[0] + relativePosition.start,
        end: range[0] + relativePosition.end,
      };
    }
  }
}

function offsetToLineColumn(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lastNewline = -1;
  for (let i = 0; i < offset; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      lastNewline = i;
    }
  }
  return { line, column: offset - lastNewline };
}

function collectForLoopCollectionResults(
  ctx: ForLoopValidationContext,
  node: Scalar,
  templateString: string,
  ancestors: readonly YamlAncestor[]
): YamlValidationResult[] {
  const results: YamlValidationResult[] = [];
  const yamlPath = getPathFromAncestors(ancestors, node);
  const nearestStepPath = getNearestStepPath(yamlPath);
  if (!nearestStepPath) {
    return results;
  }

  const nearestStep = _.get(ctx.workflowDefinition, nearestStepPath) as
    | { name?: string }
    | undefined;
  if (!nearestStep?.name) {
    return results;
  }

  let stepSchema = ctx.stepSchemaCache.get(nearestStep.name);
  if (!stepSchema) {
    stepSchema = getContextSchemaForStep(ctx.baseSchema, ctx.workflowGraph, nearestStep.name);
    ctx.stepSchemaCache.set(nearestStep.name, stepSchema);
  }

  const forLoopScopes = getAllForLoopScopes(templateString);
  for (const scope of forLoopScopes) {
    if (!scope.collectionPath || isLiquidRangeLiteral(scope.collectionPath)) {
      // eslint-disable-next-line no-continue
      continue;
    }

    const { assignVars } = getTemplateLocalContext(templateString, scope.bodyStart);
    const resolvedCollectionPath = resolveAssignChain(scope.collectionPath, assignVars);
    const absRange = resolveCollectionRange(ctx.yamlString, node, scope);

    let schemaAtCollection = stepSchema;
    if (absRange) {
      schemaAtCollection = getContextSchemaWithTemplateLocals(
        ctx.yamlDocument,
        absRange.start,
        stepSchema,
        ctx.yamlString
      );
    }

    const diagnostic = validateCollectionPath(resolvedCollectionPath, schemaAtCollection);

    if (diagnostic && absRange) {
      const startPos = ctx.model.getPositionAt(absRange.start);
      const endPos = ctx.model.getPositionAt(absRange.end);

      results.push({
        id: `for-collection-${nearestStep.name}-${scope.collectionPath}-${absRange.start}`,
        owner: 'variable-validation',
        message: diagnostic.message,
        severity: diagnostic.severity,
        startLineNumber: startPos.lineNumber,
        startColumn: startPos.column,
        endLineNumber: endPos.lineNumber,
        endColumn: endPos.column,
        hoverMessage: null,
      });
    }
  }

  return results;
}

function validateCollectionPath(
  collectionPath: string,
  stepSchema: typeof DynamicStepContextSchema
): CollectionDiagnostic | null {
  const parsed = parseVariablePath(collectionPath);
  if (!parsed || parsed.errors?.length || !parsed.propertyPath) {
    return {
      message: `Invalid collection path: ${collectionPath}`,
      severity: 'error',
    };
  }

  try {
    const itemSchema = getForeachItemSchema(stepSchema, collectionPath);
    return getForeachCollectionDiagnostic(itemSchema, parsed.propertyPath);
  } catch (error) {
    if (error instanceof InvalidForeachParameterError) {
      return {
        message: error.message,
        severity: 'error',
      };
    }
    throw error;
  }
}

function resolveCollectionRange(
  yamlString: string,
  node: Scalar,
  scope: ForLoopScope
): { start: number; end: number } | null {
  if (!node.range || !scope.collectionPath) {
    return null;
  }

  const scalarStart = node.range[0];
  const scalarEnd = node.range[2];
  const tokenRange = resolveCollectionRangeFromLiquidTokens(node, scope, scalarStart, scalarEnd);
  if (tokenRange) {
    return tokenRange;
  }

  const slice = yamlString.slice(scalarStart, scalarEnd);
  const index = slice.indexOf(scope.collectionPath);
  if (index === -1) {
    return null;
  }

  return {
    start: scalarStart + index,
    end: scalarStart + index + scope.collectionPath.length,
  };
}

function resolveCollectionRangeFromLiquidTokens(
  node: Scalar,
  scope: ForLoopScope,
  scalarStart: number,
  scalarEnd: number
): { start: number; end: number } | null {
  if (
    scope.collectionStart === undefined ||
    scope.collectionEnd === undefined ||
    typeof node.value !== 'string'
  ) {
    return null;
  }

  const scalarType = node.type;
  if (scalarType === 'BLOCK_FOLDED' || scalarType === 'BLOCK_LITERAL') {
    return null;
  }

  const quoteAdjustment = scalarType === 'QUOTE_DOUBLE' || scalarType === 'QUOTE_SINGLE' ? 1 : 0;
  const start = scalarStart + quoteAdjustment + scope.collectionStart;
  const end = scalarStart + quoteAdjustment + scope.collectionEnd;

  if (start < scalarStart || end > scalarEnd || start >= end) {
    return null;
  }

  return { start, end };
}
