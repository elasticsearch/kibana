/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { ESQLVariableType } from '@kbn/esql-types';
import { isAssignment, isColumn, within } from '@elastic/esql';
import type {
  ESQLCommandOption,
  ESQLColumn,
  ESQLFunction,
  ESQLAstItem,
  ESQLSingleAstItem,
  ESQLAstAllCommands,
  ESQLAstQueryExpression,
} from '@elastic/esql/types';
import type { ICommandCallbacks } from '../types';
import { Location } from '../types';
import { type ISuggestionItem, type ICommandContext } from '../types';
import {
  newLineAndPipeCompleteItems,
  byCompleteItem,
  whereCompleteItem,
  commaCompleteItem,
  getNewUserDefinedColumnSuggestion,
  getDateHistogramCompletionItem,
  getTimeseriesDateHistogramCompletionItem,
} from '../complete_items';
import { columnExists as _columnExists } from '../../definitions/utils/autocomplete/helpers';
import { suggestForExpression } from '../../definitions/utils';
import {
  getFunctionsToIgnoreForStats,
  isAggFunctionUsedAlready,
  isTimeseriesAggUsedAlready,
} from '../../definitions/utils/autocomplete/functions';
import { getAllFunctions } from '../../definitions/utils/functions';
import { FunctionDefinitionTypes } from '../../definitions/types';
import { getPosition, getCommaAndPipe, rightAfterColumn } from './utils';
import { endsWithComma } from '../../definitions/utils/regex';
import { findAstPosition } from '../../definitions/utils/ast';
import { getAssignmentExpressionRoot } from '../../definitions/utils/expressions';
import { inOperators, nullCheckOperators } from '../../definitions/all_operators';

interface StatsFunctionParameterContext {
  functionDefinition?: {
    type: FunctionDefinitionTypes;
  };
  paramDefinitions: Array<{
    hint?: {
      kind?: string;
    };
  }>;
}

type StatsFunctionsToIgnore = (
  functionParameterContext?: StatsFunctionParameterContext
) => { names: string[] } | undefined;

export async function autocomplete(
  query: string,
  command: ESQLAstAllCommands,
  callbacks?: ICommandCallbacks,
  context?: ICommandContext,
  cursorPosition: number = query.length
): Promise<ISuggestionItem[]> {
  if (!callbacks?.getByType) {
    return [];
  }
  const isInlineStats = command.name === 'inline stats';
  const isTimeseriesSource = query.trimStart().toLowerCase().startsWith('ts ');

  const columnExists = (name: string) => _columnExists(name, context);

  const innerText = query.substring(0, cursorPosition);
  const pos = getPosition(command, innerText);

  // Find the function at cursor position for suggestions
  const foundFunction = cursorPosition ? findFunctionForSuggestions(command, cursorPosition) : null;
  const getFunctionsToIgnore = buildStatsFunctionsToIgnore(command, foundFunction);

  if (
    foundFunction &&
    (foundFunction.subtype === 'variadic-call' || foundFunction.subtype === 'binary-expression')
  ) {
    if (getFunctionsToIgnore) {
      const isInBy = isNodeWithinByClause(foundFunction, command);

      let location: Location;

      if (isInBy) {
        location = Location.STATS_BY;
      } else if (isTimeseriesSource && isAggFunctionUsedAlready(command, command.args.length - 1)) {
        location = Location.STATS_TIMESERIES;
      } else {
        location = Location.STATS;
      }

      const { suggestions: functionsSpecificSuggestions } = await suggestForExpression({
        query,
        expressionRoot: foundFunction,
        command,
        cursorPosition,
        location,
        context,
        callbacks,
        options: {
          getFunctionsToIgnore,
        },
      });

      if (functionsSpecificSuggestions.length > 0) {
        return functionsSpecificSuggestions;
      }
    }
  }

  switch (pos) {
    case 'expression_without_assignment': {
      const isNewMultipleExpression = endsWithComma(innerText);

      const expressionRoot = isNewMultipleExpression
        ? undefined // we're in a new expression, but there isn't an AST node for it yet
        : command.args[command.args.length - 1];

      if (Array.isArray(expressionRoot)) {
        return [];
      }

      const expressionSuggestions = await getExpressionSuggestions({
        query,
        command,
        cursorPosition,
        expressionRoot,
        location: Location.STATS,
        context,
        callbacks,
        emptySuggestions: [
          ...(!isNewMultipleExpression && !isInlineStats ? [byCompleteItem] : []),
          getNewUserDefinedColumnSuggestion(callbacks?.getSuggestedUserDefinedColumnName?.() || ''),
        ],
        afterCompleteSuggestions: [
          whereCompleteItem,
          byCompleteItem,
          ...getCommaAndPipe(innerText, expressionRoot, columnExists),
        ],
        suggestColumns: false,
        suggestFunctions: true,
        controlType: ESQLVariableType.FUNCTIONS,
        getFunctionsToIgnore,
      });

      return expressionSuggestions;
    }

    case 'expression_after_assignment': {
      const assignment = command.args[command.args.length - 1];
      const expressionRoot = isAssignment(assignment)
        ? getAssignmentExpressionRoot(assignment)
        : undefined;

      const expressionSuggestions = await getExpressionSuggestions({
        query,
        command,
        cursorPosition,
        expressionRoot,
        location: Location.STATS,
        context,
        callbacks,
        emptySuggestions: [],
        afterCompleteSuggestions: [
          whereCompleteItem,
          byCompleteItem,
          ...getCommaAndPipe(innerText, expressionRoot, columnExists),
        ],
        suggestColumns: false,
        suggestFunctions: true,
        controlType: ESQLVariableType.FUNCTIONS,
        getFunctionsToIgnore,
      });

      return expressionSuggestions;
    }

    case 'after_where': {
      const whereFn = command.args[command.args.length - 1] as ESQLFunction;
      const expressionRoot = whereFn.args[1];

      if (expressionRoot && !!Array.isArray(expressionRoot)) {
        return [];
      }

      const { suggestions, computed } = await suggestForExpression({
        query,
        expressionRoot,
        command,
        cursorPosition,
        location: Location.STATS_WHERE,
        context,
        callbacks,
        options: {
          preferredExpressionType: 'boolean',
        },
      });

      const { expressionType, isComplete } = computed;

      if (expressionType === 'boolean' && isComplete) {
        suggestions.push(
          ...newLineAndPipeCompleteItems,
          { ...commaCompleteItem, text: ', ' },
          byCompleteItem
        );
      }

      return suggestions;
    }

    case 'grouping_expression_after_assignment': {
      const byNode = command.args[command.args.length - 1] as ESQLCommandOption;
      const assignment = byNode.args[byNode.args.length - 1];
      const expressionRoot = isAssignment(assignment)
        ? getAssignmentExpressionRoot(assignment)
        : undefined;

      const ignoredColumns = alreadyUsedColumns(command);

      return getExpressionSuggestions({
        query,
        command,
        cursorPosition,
        expressionRoot,
        location: Location.STATS_BY,
        context,
        callbacks,
        emptySuggestions: [
          (isTimeseriesSource
            ? getTimeseriesDateHistogramCompletionItem
            : getDateHistogramCompletionItem)(context?.histogramBarTarget ?? 0),
        ],
        afterCompleteSuggestions: getCommaAndPipe(innerText, expressionRoot, columnExists),
        addSpaceAfterFirstField: false,
        ignoredColumns,
        openSuggestions: true,
        getFunctionsToIgnore,
      });
    }

    case 'grouping_expression_without_assignment': {
      let expressionRoot: ESQLAstItem | undefined;
      if (!endsWithComma(innerText)) {
        const byNode = command.args[command.args.length - 1] as ESQLCommandOption;

        expressionRoot = byNode.args[byNode.args.length - 1];
      }
      // guaranteed by the getPosition function, but we check it here for type safety
      if (Array.isArray(expressionRoot)) {
        return [];
      }

      const ignoredColumns = alreadyUsedColumns(command);

      return getExpressionSuggestions({
        query,
        command,
        cursorPosition,
        expressionRoot,
        location: Location.STATS_BY,
        context,
        callbacks,
        emptySuggestions: [
          getNewUserDefinedColumnSuggestion(callbacks?.getSuggestedUserDefinedColumnName?.() || ''),
          (isTimeseriesSource
            ? getTimeseriesDateHistogramCompletionItem
            : getDateHistogramCompletionItem)(context?.histogramBarTarget ?? 0),
        ],
        afterCompleteSuggestions: getCommaAndPipe(innerText, expressionRoot, columnExists),
        addSpaceAfterFirstField: false,
        ignoredColumns,
        openSuggestions: true,
        getFunctionsToIgnore,
      });
    }

    default:
      return [];
  }
}

async function getExpressionSuggestions({
  query,
  command,
  cursorPosition,
  expressionRoot,
  location,
  context,
  callbacks,
  emptySuggestions = [],
  afterCompleteSuggestions = [],
  addSpaceAfterFirstField,
  suggestColumns = true,
  suggestFunctions = true,
  controlType,
  ignoredColumns = [],
  openSuggestions,
  getFunctionsToIgnore,
}: {
  query: string;
  command: ESQLAstAllCommands;
  cursorPosition: number;
  expressionRoot: ESQLSingleAstItem | undefined;
  location: Location;
  context?: ICommandContext;
  callbacks?: ICommandCallbacks;
  emptySuggestions?: ISuggestionItem[];
  afterCompleteSuggestions?: ISuggestionItem[];
  addSpaceAfterFirstField?: boolean;
  suggestColumns?: boolean;
  suggestFunctions?: boolean;
  controlType?: ESQLVariableType;
  ignoredColumns?: string[];
  openSuggestions?: boolean;
  getFunctionsToIgnore?: StatsFunctionsToIgnore;
}): Promise<ISuggestionItem[]> {
  const suggestions: ISuggestionItem[] = [];

  const modifiedCallbacks = suggestColumns ? callbacks : { ...callbacks, getByType: undefined };

  const { suggestions: expressionSuggestions, computed } = await suggestForExpression({
    query,
    expressionRoot,
    command,
    cursorPosition,
    location,
    context,
    callbacks: modifiedCallbacks,
    options: {
      addSpaceAfterFirstField,
      ignoredColumnsForEmptyExpression: ignoredColumns,
      suggestFields: suggestColumns,
      suggestFunctions,
      controlType,
      openSuggestions,
      getFunctionsToIgnore,
    },
  });

  const { insideFunction } = computed;

  if (
    !rightAfterColumn(computed.innerText, expressionRoot, (name) => _columnExists(name, context))
  ) {
    suggestions.push(...expressionSuggestions);
  }

  if (
    (!expressionRoot ||
      (isColumn(expressionRoot) && !_columnExists(expressionRoot.parts.join('.'), context))) &&
    computed.position !== 'after_not' &&
    !insideFunction
  ) {
    suggestions.push(...emptySuggestions);
  }

  if (computed.isComplete && !insideFunction) {
    suggestions.push(...afterCompleteSuggestions);
  }

  return suggestions;
}

function getByOption(command: ESQLAstAllCommands): ESQLCommandOption | undefined {
  return command.args.find((arg) => !Array.isArray(arg) && arg.name === 'by') as
    | ESQLCommandOption
    | undefined;
}

function isNodeWithinByClause(node: ESQLSingleAstItem, command: ESQLAstAllCommands): boolean {
  const byOption = getByOption(command);

  return byOption ? within(node, byOption) : false;
}

function alreadyUsedColumns(command: ESQLAstAllCommands) {
  const byOption = getByOption(command);
  const columnNodes = (byOption?.args.filter(
    (arg) => !Array.isArray(arg) && arg.type === 'column'
  ) ?? []) as ESQLColumn[];

  return columnNodes.map((node) => node.parts.join('.'));
}

function buildStatsFunctionsToIgnore(
  command: ESQLAstAllCommands,
  foundFunction: ESQLFunction | null
): StatsFunctionsToIgnore | undefined {
  if (!foundFunction) {
    return undefined;
  }

  const isInBy = isNodeWithinByClause(foundFunction, command);

  return (functionParameterContext) => {
    if (!functionParameterContext) {
      return undefined;
    }

    const statsSpecificFunctionsToIgnore: string[] = [];

    if (functionParameterContext.functionDefinition?.type === FunctionDefinitionTypes.GROUPING) {
      statsSpecificFunctionsToIgnore.push(
        ...getAllFunctions({ type: FunctionDefinitionTypes.GROUPING }).map(({ name }) => name)
      );
    }

    if (!isInBy) {
      // The "no nested aggregations" rule does not apply when the current parameter
      // explicitly expects an aggregation function (hint.kind === 'aggregation').
      const expectsAggregation = functionParameterContext.paramDefinitions.some(
        (p) => p.hint?.kind === 'aggregation'
      );
      const finalCommandArgIndex = command.args.length - 1;

      statsSpecificFunctionsToIgnore.push(
        ...getFunctionsToIgnoreForStats(command, finalCommandArgIndex),
        ...(isAggFunctionUsedAlready(command, finalCommandArgIndex) && !expectsAggregation
          ? getAllFunctions({ type: FunctionDefinitionTypes.AGG }).map(({ name }) => name)
          : []),
        ...(isTimeseriesAggUsedAlready(command, finalCommandArgIndex) && !expectsAggregation
          ? getAllFunctions({ type: FunctionDefinitionTypes.TIME_SERIES_AGG }).map(
              ({ name }) => name
            )
          : [])
      );
    }

    return {
      names: statsSpecificFunctionsToIgnore,
    };
  };
}

function findFunctionForSuggestions(
  command: ESQLAstAllCommands,
  cursorPosition: number
): ESQLFunction | null {
  const { node, containingFunction } = findAstPosition(
    {
      type: 'query' as const,
      commands: [command],
    } as unknown as ESQLAstQueryExpression,
    cursorPosition
  );

  if (node && node.type === 'function') {
    const fn = node as ESQLFunction;

    const isSpecialOperator =
      inOperators.some((op) => op.name === fn.name) ||
      nullCheckOperators.some((op) => op.name === fn.name);

    if (
      fn.subtype === 'variadic-call' ||
      (fn.subtype === 'binary-expression' && isSpecialOperator)
    ) {
      return fn;
    }
  }

  return containingFunction || null;
}
