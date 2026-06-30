/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { monaco } from '@kbn/monaco';
import {
  isBuiltInStepProperty,
  isBuiltInStepType,
  type PropertySelectionHandler,
  type SelectionContext,
  type StepPropertyHandler,
  type StepSelectionValues,
} from '@kbn/workflows';
import type { StepInfo } from '../../../../../../entities/workflows/store/workflow_detail/utils/build_workflow_lookup';
import {
  buildStepSelectionValues,
  getValueFromValueNode,
} from '../../../../../../entities/workflows/store/workflow_detail/utils/build_workflow_lookup';
import { cacheSearchOptions } from '../../../../../../shared/lib/step_property_selection_cache';
import type { AutocompleteContext } from '../../context/autocomplete.types';

export type GetStepPropertyHandler = (
  stepType: string,
  scope: 'config' | 'input',
  key: string
) => StepPropertyHandler | null;

export type GetStepPropertySuggestionsContext = Pick<
  AutocompleteContext,
  'focusedStepInfo' | 'focusedYamlPair' | 'yamlLineCounter'
>;

export async function getStepPropertySuggestions(
  autocompleteContext: GetStepPropertySuggestionsContext,
  getPropertyHandler: GetStepPropertyHandler
): Promise<monaco.languages.CompletionItem[]> {
  const { focusedStepInfo, focusedYamlPair, yamlLineCounter } = autocompleteContext;

  if (
    !focusedStepInfo ||
    !focusedStepInfo.stepType ||
    !focusedYamlPair ||
    !focusedYamlPair.valueNode?.range ||
    typeof focusedYamlPair.keyNode.value !== 'string' ||
    !yamlLineCounter ||
    // skip built-in step types like foreach, if, data.set, http, wait, etc.
    isBuiltInStepType(focusedStepInfo.stepType) ||
    // skip built-in step properties like name, type, with, etc.
    isBuiltInStepProperty(focusedYamlPair.keyNode.value)
  ) {
    return [];
  }

  // if the key is in input, it's in the with block, so path will be ['with', 'key']
  const isInInput = focusedYamlPair.path.length > 0 && focusedYamlPair.path[0] === 'with';
  const composedKey = isInInput
    ? focusedYamlPair.path.slice(1).join('.')
    : focusedYamlPair.path.join('.');
  // if the key is in config, it's on a root level, so path will be equal to the joined key path
  const isInConfig =
    focusedYamlPair.path.length > 0 && focusedYamlPair.path.join('.') === composedKey;

  if (!isInConfig && !isInInput) {
    return [];
  }

  const scope = isInConfig ? 'config' : 'input';
  const { stepType } = focusedStepInfo;

  const handlerKey = stripTrailingArrayIndex(composedKey);
  const propertyHandler = getPropertyHandler(stepType, scope, handlerKey);
  if (!propertyHandler || !propertyHandler.selection?.search) {
    return [];
  }
  const [startOffset, endOffset] = focusedYamlPair.valueNode.range;
  const rawValue = getValueFromValueNode(focusedYamlPair.valueNode);
  const currentValue = typeof rawValue === 'string' ? rawValue : String(rawValue ?? '');
  const startPos = yamlLineCounter?.linePos(startOffset);
  const endPos = yamlLineCounter?.linePos(endOffset);
  const replaceRange = {
    startLineNumber: startPos.line,
    startColumn: startPos.col,
    endLineNumber: endPos.line,
    endColumn: endPos.col,
  };

  const input = sanitizeSearchInput(currentValue);
  const selection = propertyHandler.selection;
  const values = getContextValues(selection, focusedStepInfo);

  const context: SelectionContext = { stepType, scope, propertyKey: handlerKey, values };
  const options = await selection.search(input, context);

  cacheSearchOptions(focusedStepInfo.stepType, context.scope, handlerKey, options, values);

  return options.map(
    (option): monaco.languages.CompletionItem => ({
      label: option.label ?? String(option.value),
      kind: monaco.languages.CompletionItemKind.Value,
      insertText: String(option.value),
      range: replaceRange,
      detail: option.description,
      documentation: option.documentation,
      filterText: `${option.value} ${option.label} "${option.label}" '${option.label}'`,
      sortText: option.label,
    })
  );
}

/**
 * Drops a single trailing array-index segment from a dotted property key so cursor positions on an
 * array element (e.g. `tags_to_add.0`) resolve to the array property's selection handler
 * (`tags_to_add`). Keys for scalar/object properties never end in a numeric segment and are returned
 * unchanged.
 */
function stripTrailingArrayIndex(key: string): string {
  return key.replace(/\.\d+$/, '');
}

function sanitizeSearchInput(input: unknown): string {
  if (input == null) {
    return '';
  }
  const strInput = String(input);
  return strInput.trim().replace(/^['"]|['"]$/g, '');
}

function getContextValues(
  selection: PropertySelectionHandler,
  focusedStepInfo: StepInfo
): StepSelectionValues {
  if (!selection.dependsOnValues || selection.dependsOnValues.length === 0) {
    return { config: {}, input: {} };
  }
  return buildStepSelectionValues(focusedStepInfo, selection.dependsOnValues);
}
