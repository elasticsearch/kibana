/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { isMap } from '@elastic/esql';
import type {
  ESQLAstAllCommands,
  ESQLAstIpLocationCommand,
  ESQLCommand,
} from '@elastic/esql/types';
import { validateMap, validateMapListParameter } from '../../definitions/utils/validation/map';
import { validatePrefixAssignmentExpression } from '../../definitions/utils/validation/column';
import type { ICommandCallbacks, ICommandContext } from '../types';
import type { ESQLMessage } from '../../definitions/types';

// `properties` uses type=[keyword] so validateMap doesn't false-error on valid list values
// (getExpressionType delegates list type to its first element, which is keyword for string literals).
// The list constraint is enforced separately via validateMapListParameter.
const IP_LOCATION_MAP_DEFINITION =
  "{name='database_file', description='IP location database file name', type=[keyword]}" +
  "{name='properties', description='List of database properties to include in the output', type=[keyword]}" +
  "{name='first_only', description='Use only the first value from a multi-value IP input', type=[boolean]}";

const ACCEPTED_EXPRESSION_TYPES = ['ip', 'keyword', 'text', 'param', 'unknown'] as const;

const PROPERTIES_PARAMETER = 'properties';

export const validate = (
  command: ESQLAstAllCommands,
  _ast: ESQLCommand[],
  context?: ICommandContext,
  _callbacks?: ICommandCallbacks
): ESQLMessage[] => {
  const messages: ESQLMessage[] = [];
  const ipLocationCommand = command as ESQLAstIpLocationCommand;
  const { expression, namedParameters } = ipLocationCommand;

  messages.push(
    ...validatePrefixAssignmentExpression({
      expression,
      commandName: command.name,
      acceptedTypes: ACCEPTED_EXPRESSION_TYPES,
      typeLabel: 'ip, keyword, text',
      context,
    })
  );

  if (namedParameters && !Array.isArray(namedParameters) && isMap(namedParameters)) {
    const listParameterError = validateMapListParameter(
      namedParameters,
      PROPERTIES_PARAMETER,
      context?.columns,
      context?.unmappedFieldsStrategy
    );

    if (listParameterError) {
      messages.push(listParameterError);
    } else {
      const mapError = validateMap(namedParameters, IP_LOCATION_MAP_DEFINITION);
      if (mapError) {
        messages.push(mapError);
      }
    }
  }

  return messages;
};
