/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getConnectorIdSuggestionsItems } from './get_connector_id_suggestions_items';
import { resolveConnectorIdStepType } from './resolve_connector_id_step_type';
import type { AutocompleteContext } from '../../context/autocomplete.types';

export function getConnectorIdSuggestions({
  line,
  lineParseResult,
  range,
  focusedStepInfo,
  focusedYamlPair,
  path,
  dynamicConnectorTypes,
}: AutocompleteContext) {
  const stepConnectorType = resolveConnectorIdStepType(focusedStepInfo, path, focusedYamlPair);

  if (
    !stepConnectorType ||
    !lineParseResult ||
    lineParseResult.matchType !== 'connector-id' ||
    !dynamicConnectorTypes
  ) {
    return [];
  }
  // If the user has typed part of the connector-id, we replace from the start of the value to the end of the line
  if (lineParseResult.fullKey !== '') {
    const replaceRange = {
      ...range,
      startColumn: lineParseResult.valueStartIndex + 1,
      endColumn: line.length + 1,
    };
    return getConnectorIdSuggestionsItems(stepConnectorType, replaceRange, dynamicConnectorTypes);
  }

  return getConnectorIdSuggestionsItems(stepConnectorType, range, dynamicConnectorTypes);
}
