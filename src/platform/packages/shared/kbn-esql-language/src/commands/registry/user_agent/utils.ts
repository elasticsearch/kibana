/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ESQLAstUserAgentCommand, ESQLList } from '@elastic/esql/types';
import { isAssignment, isMap, isList } from '@elastic/esql';
import { getMapEntryByKey } from '../../definitions/utils/maps';

export enum UserAgentPosition {
  AFTER_USER_AGENT_KEYWORD = 'after_user_agent_keyword',
  AFTER_TARGET_FIELD = 'after_target_field', // prefix typed, before '='
  AFTER_ASSIGN = 'after_assign', // after '=', before expression is typed
  AFTER_EXPRESSION = 'after_expression', // expression complete
  AFTER_WITH_KEYWORD = 'after_with_keyword',
  WITHIN_OPTIONS = 'within_options',
  WITHIN_PROPERTIES_ARRAY = 'within_properties_array',
  AFTER_COMMAND = 'after_command',
}

/** Returns the list AST node for the `properties` map entry, if any. */
export function getPropertiesList(command: ESQLAstUserAgentCommand): ESQLList | undefined {
  const { namedParameters } = command;
  if (!isMap(namedParameters)) return undefined;

  const propertiesEntry = getMapEntryByKey(namedParameters, 'properties');
  if (!propertiesEntry) return undefined;

  return isList(propertiesEntry.value) ? propertiesEntry.value : undefined;
}

export function getPosition(
  command: ESQLAstUserAgentCommand,
  cursorPosition: number
): UserAgentPosition {
  const { targetField, expression, namedParameters } = command;
  const hasAssignment = command.args.some((arg) => !Array.isArray(arg) && isAssignment(arg));

  if (namedParameters !== undefined) {
    const map = isMap(namedParameters) ? namedParameters : undefined;
    if (!map || (map.incomplete && !map.text)) return UserAgentPosition.AFTER_WITH_KEYWORD;

    const isWithinMap = map.incomplete
      ? !(map.text.trimEnd().endsWith('}') && cursorPosition > map.location.max)
      : cursorPosition <= map.location.max;

    if (!isWithinMap) return UserAgentPosition.AFTER_COMMAND;

    // Check if cursor is inside the `properties` entry value (handles empty [] too)
    const propertiesEntry = getMapEntryByKey(map, 'properties');
    if (
      propertiesEntry &&
      cursorPosition >= propertiesEntry.value.location.min &&
      cursorPosition <= propertiesEntry.value.location.max
    ) {
      return UserAgentPosition.WITHIN_PROPERTIES_ARRAY;
    }

    return UserAgentPosition.WITHIN_OPTIONS;
  }

  if (expression !== undefined) {
    if (expression.incomplete || cursorPosition <= expression.location.max + 1) {
      return UserAgentPosition.AFTER_ASSIGN;
    }
    return UserAgentPosition.AFTER_EXPRESSION;
  }

  if (hasAssignment) {
    return UserAgentPosition.AFTER_ASSIGN;
  }

  if (targetField && !targetField.incomplete) {
    return UserAgentPosition.AFTER_TARGET_FIELD;
  }

  return UserAgentPosition.AFTER_USER_AGENT_KEYWORD;
}
