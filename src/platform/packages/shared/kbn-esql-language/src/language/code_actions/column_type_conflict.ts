/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { BasicPrettyPrinter, EsqlQuery, mutate, synth } from '@elastic/esql';
import type { ESQLAstQueryExpression } from '@elastic/esql/types';
import { i18n } from '@kbn/i18n';
import type { InlineCastingType } from '../../commands/definitions/types';
import { getFunctionForInlineCast } from '../../commands/definitions/utils/functions';
import type { QuickFix, QuickFixMessage } from './types';

interface TypeConversion {
  functionName: string;
  targetType: string;
}

/** Build quick fixes from the diagnostic data and keep the message location for insertion. */
export const getColumnTypeConflictQuickFixes = (message: QuickFixMessage): QuickFix[] => {
  const data = message.data;

  if (!data) {
    return [];
  }

  const { columnName, types } = data;

  return getTypeConversions(types).map(({ functionName, targetType }) => ({
    title: i18n.translate('kbn-esql-language.esql.quickFix.convertColumnTypeConflict', {
      defaultMessage: 'Convert {columnName} to {type}',
      values: {
        columnName,
        type: targetType,
      },
    }),
    fixQuery: (query) => insertColumnTypeConversionEval(query, columnName, functionName, message),
  }));
};

/** Insert the conversion before the command that reported the conflict. */
const insertColumnTypeConversionEval = (
  query: string,
  columnName: string,
  conversionFunctionName: string,
  message: QuickFixMessage
): string | undefined => {
  const esqlQuery = EsqlQuery.fromSrc(query, { withFormatting: true });
  const commandIndex = getCommandIndexContainingMessage(esqlQuery.ast, message);

  if (commandIndex === undefined || commandIndex <= 0) {
    return;
  }

  const column = BasicPrettyPrinter.print(synth.col(columnName));
  mutate.generic.commands.insert(
    esqlQuery.ast,
    synth.cmd(`EVAL ${column} = ${conversionFunctionName.toUpperCase()}(${column})`, {
      withFormatting: false,
    }),
    commandIndex
  );
  return esqlQuery.print({ multiline: true });
};

/** Build one conversion per available target type. */
const getTypeConversions = (types: string[]): TypeConversion[] => {
  const conversionsByFunctionName = new Map<string, TypeConversion>();

  for (const targetType of types) {
    const functionName = getConversionFunctionNameForType(targetType);
    if (functionName) {
      conversionsByFunctionName.set(functionName, { functionName, targetType });
    }
  }

  return [...conversionsByFunctionName.values()];
};

/** Resolve the conversion function from the generated inline cast mapping. */
const getConversionFunctionNameForType = (type: string): string | undefined => {
  const normalizedType = type.toLowerCase() as InlineCastingType;

  return getFunctionForInlineCast(normalizedType);
};

const getCommandIndexContainingMessage = (
  ast: ESQLAstQueryExpression,
  message: QuickFixMessage
): number | undefined => {
  if (!message.location) {
    return;
  }

  const messageOffset = message.location.min;

  return ast.commands.findIndex(
    ({ location }) => location.min <= messageOffset && messageOffset <= location.max
  );
};
