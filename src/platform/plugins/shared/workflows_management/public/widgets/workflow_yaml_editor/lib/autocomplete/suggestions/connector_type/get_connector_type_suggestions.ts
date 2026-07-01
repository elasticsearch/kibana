/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { monaco } from '@kbn/code-editor';
import type { BuiltInStepType, ConnectorTypeInfo, WorkflowOutput } from '@kbn/workflows';
import {
  DataSetStepSchema,
  ForEachStepSchema,
  IfStepSchema,
  LoopBreakStepSchema,
  LoopContinueStepSchema,
  MergeStepSchema,
  ParallelStepSchema,
  SwitchStepSchema,
  WaitForApprovalStepSchema,
  WaitForInputStepSchema,
  WaitStepSchema,
  WhileStepSchema,
  WorkflowExecuteAsyncStepSchema,
  WorkflowExecuteStepSchema,
  WorkflowFailStepSchema,
  WorkflowOutputStepSchema,
} from '@kbn/workflows';
import { getCachedAllConnectors } from '../../../connectors_cache';
import { generateBuiltInStepSnippet } from '../../../snippets/generate_builtin_step_snippet';
import { generateConnectorSnippet } from '../../../snippets/generate_connector_snippet';

// Cache for connector type suggestions to avoid recalculating on every keystroke
const connectorTypeSuggestionsCache = new Map<string, monaco.languages.CompletionItem[]>();

/**
 * Get connector type suggestions with better grouping and filtering
 */
export function getConnectorTypeSuggestions(
  typePrefix: string,
  range: monaco.IRange,
  dynamicConnectorTypes?: Record<string, ConnectorTypeInfo>,
  isInsideLoopBody = false,
  workflowOutputs?: WorkflowOutput[]
): monaco.languages.CompletionItem[] {
  // Create a cache key based on the type prefix, context, and loop state
  const cacheKey = `${typePrefix}|${JSON.stringify(range)}|${isInsideLoopBody}`;

  // Check cache first
  if (connectorTypeSuggestionsCache.has(cacheKey)) {
    return connectorTypeSuggestionsCache.get(cacheKey) ?? [];
  }

  const suggestions: monaco.languages.CompletionItem[] = [];

  // Get built-in step types from the schema (single source of truth)
  const builtInStepTypes = getBuiltInStepTypesFromSchema();

  // Get all connectors
  const allConnectors = getCachedAllConnectors(dynamicConnectorTypes);

  // Helper function to create a suggestion with snippet
  const createSnippetSuggestion = (connectorType: string): monaco.languages.CompletionItem => {
    const snippetText = generateConnectorSnippet(connectorType, {}, dynamicConnectorTypes);

    // For YAML, we insert the actual text without snippet placeholders
    const simpleText = snippetText;

    // Extended range for multi-line insertion
    const extendedRange = {
      startLineNumber: range.startLineNumber,
      endLineNumber: range.endLineNumber,
      startColumn: range.startColumn,
      endColumn: Math.max(range.endColumn, 1000),
    };

    // Find display name for this connector type - only for dynamic connectors
    const connector = allConnectors.find((c) => c.type === connectorType);

    // Only use display names for dynamic connectors (not elasticsearch.* or kibana.*)
    const isDynamicConnector =
      !connectorType.startsWith('elasticsearch.') && !connectorType.startsWith('kibana.');
    const shortName = connector?.summary || connector?.description;
    const displayName =
      isDynamicConnector && shortName
        ? shortName.replace(' connector', '').replace(' (no instances configured)', '')
        : connectorType;

    return {
      label: displayName, // Show display name for dynamic connectors, technical name for ES/Kibana
      kind: getConnectorCompletionKind(connectorType), // Use appropriate kind for icons
      insertText: simpleText, // Still insert the actual actionTypeId
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      range: extendedRange,
      detail: connectorType, // Show the actual type as detail
      documentation: connectorType.startsWith('elasticsearch.')
        ? `Elasticsearch API - ${connectorType.replace('elasticsearch.', '')}`
        : connectorType.startsWith('kibana.')
        ? `Kibana API - ${connectorType.replace('kibana.', '')}`
        : connector?.description || connector?.summary || `Workflow connector - ${connectorType}`,
      filterText: connectorType,
      sortText: `!${connectorType}`, // Priority prefix to sort before default suggestions
      preselect: false,
    };
  };

  // If user is typing a prefix like "elasticsearch.", show filtered suggestions
  if (typePrefix.includes('.')) {
    const [namespace] = typePrefix.split('.');
    const namespacePrefix = `${namespace}.`;

    const apis = allConnectors
      .filter((c) => c.type.startsWith(namespacePrefix))
      .map((c) => c.type)
      .filter((api) => api.toLowerCase().includes(typePrefix.toLowerCase()));

    apis.forEach((api) => {
      suggestions.push(createSnippetSuggestion(api));
    });
  } else {
    // First, add built-in step types that match the prefix
    const matchingBuiltInTypes = builtInStepTypes.filter(
      (stepType) =>
        stepType.type.toLowerCase().includes(typePrefix.toLowerCase()) &&
        (!stepType.loopOnly || isInsideLoopBody)
    );

    matchingBuiltInTypes.forEach((stepType) => {
      const snippetText = generateBuiltInStepSnippet(
        stepType.type as BuiltInStepType,
        {},
        workflowOutputs
      );
      const extendedRange = {
        startLineNumber: range.startLineNumber,
        endLineNumber: range.endLineNumber,
        startColumn: range.startColumn,
        endColumn: Math.max(range.endColumn, 1000),
      };

      suggestions.push({
        label: stepType.type,
        kind: stepType.icon,
        insertText: snippetText,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        range: extendedRange,
        documentation: stepType.description,
        filterText: stepType.type,
        sortText: `!${stepType.type}`,
        detail: 'Built-in workflow step',
        preselect: false,
      });
    });

    // Then add matching connectors
    const matchingConnectors = allConnectors
      .map((c) => c.type)
      .filter((connectorType) => {
        const lowerType = connectorType.toLowerCase();
        const lowerPrefix = typePrefix.toLowerCase();

        // Match if the full type contains the prefix
        const fullMatch = lowerType.includes(lowerPrefix);

        // For elasticsearch connectors, also match if the part after "elasticsearch." starts with the prefix
        let elasticsearchMatch = false;
        if (connectorType.startsWith('elasticsearch.')) {
          const afterPrefix = connectorType.substring('elasticsearch.'.length);
          elasticsearchMatch = afterPrefix.toLowerCase().startsWith(lowerPrefix);
        }

        return fullMatch || elasticsearchMatch;
      });

    matchingConnectors.forEach((connectorType) => {
      suggestions.push(createSnippetSuggestion(connectorType));
    });
  }

  // Cache the result before returning
  connectorTypeSuggestionsCache.set(cacheKey, suggestions);

  return suggestions;
}

/**
 * Get appropriate Monaco completion kind for different connector types
 */
function getConnectorCompletionKind(connectorType: string): monaco.languages.CompletionItemKind {
  if (connectorType.startsWith('elasticsearch')) {
    return monaco.languages.CompletionItemKind.Struct; // Will use custom Elasticsearch logo
  }
  if (connectorType.startsWith('kibana')) {
    return monaco.languages.CompletionItemKind.Module; // Will use custom Kibana logo
  }
  if (connectorType === 'console') {
    return monaco.languages.CompletionItemKind.Variable; // Will use custom Console icon
  }
  return monaco.languages.CompletionItemKind.Function;
}

// Cache for built-in step types extracted from schema
let builtInStepTypesCache: Array<{
  type: string;
  description: string;
  icon: monaco.languages.CompletionItemKind;
  loopOnly?: boolean;
}> | null = null;

/**
 * Extract built-in step types from the workflow schema (single source of truth)
 */
function getBuiltInStepTypesFromSchema(): Array<{
  type: string;
  description: string;
  icon: monaco.languages.CompletionItemKind;
  loopOnly?: boolean;
}> {
  if (builtInStepTypesCache !== null) {
    return builtInStepTypesCache;
  }

  // Extract step types from the actual schema definitions
  // This ensures we get all step types defined in the schema automatically
  const stepSchemas = [
    {
      schema: ForEachStepSchema,
      description: 'Execute steps for each item in a collection',
      icon: monaco.languages.CompletionItemKind.Method,
    },
    {
      schema: WhileStepSchema,
      description:
        'Repeat steps while condition is true (do-while semantics — first iteration always runs).',
      icon: monaco.languages.CompletionItemKind.Method,
    },
    {
      schema: IfStepSchema,
      description: 'Execute steps conditionally based on a condition',
      icon: monaco.languages.CompletionItemKind.Keyword,
    },
    {
      schema: SwitchStepSchema,
      description:
        'Multi-way branching. Evaluates expression and runs the steps of the first matching case value',
      icon: monaco.languages.CompletionItemKind.Keyword,
    },
    {
      schema: LoopBreakStepSchema,
      description: 'Exit the enclosing loop immediately',
      icon: monaco.languages.CompletionItemKind.Keyword,
      loopOnly: true,
    },
    {
      schema: LoopContinueStepSchema,
      description: 'Skip to the next loop iteration',
      icon: monaco.languages.CompletionItemKind.Keyword,
      loopOnly: true,
    },
    {
      schema: ParallelStepSchema,
      description: 'Execute multiple branches in parallel',
      icon: monaco.languages.CompletionItemKind.Class,
    },
    {
      schema: MergeStepSchema,
      description: 'Merge results from multiple sources',
      icon: monaco.languages.CompletionItemKind.Interface,
    },
    {
      schema: DataSetStepSchema,
      description: 'Define or compute variables for use in the workflow',
      icon: monaco.languages.CompletionItemKind.Variable,
    },
    {
      schema: WaitStepSchema,
      description: 'Wait for a specified duration',
      icon: monaco.languages.CompletionItemKind.Constant,
    },
    {
      schema: WaitForInputStepSchema,
      description: 'Pause execution until external input is provided (human-in-the-loop)',
      icon: monaco.languages.CompletionItemKind.Event,
    },
    {
      schema: WaitForApprovalStepSchema,
      description: 'Pause execution until approval or rejection is received (human-in-the-loop)',
      icon: monaco.languages.CompletionItemKind.Event,
    },
    {
      schema: WorkflowExecuteStepSchema,
      description: 'Execute another workflow (synchronous)',
      icon: monaco.languages.CompletionItemKind.Function,
    },
    {
      schema: WorkflowExecuteAsyncStepSchema,
      description: 'Execute another workflow (asynchronous)',
      icon: monaco.languages.CompletionItemKind.Function,
    },
    {
      schema: WorkflowOutputStepSchema,
      description: 'Output values from the workflow',
      icon: monaco.languages.CompletionItemKind.Property,
    },
    {
      schema: WorkflowFailStepSchema,
      description: 'Fail the workflow with a message',
      icon: monaco.languages.CompletionItemKind.Constant,
    },
  ];

  const stepTypes = stepSchemas.map(({ schema, description, icon, loopOnly = false }) => {
    // Extract the literal type value from the Zod schema
    const typeField = schema.shape.type;
    const stepType = typeField.def.values[0]; // Get the literal value from z.literal()

    return {
      type: stepType,
      description,
      icon,
      loopOnly,
    };
  });

  builtInStepTypesCache = stepTypes;
  return stepTypes;
}
