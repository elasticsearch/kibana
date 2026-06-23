/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import type {
  ESQLAstAllCommands,
  ESQLAstItem,
  ESQLFunction,
  ESQLProperNode,
  ESQLSingleAstItem,
} from '@elastic/esql/types';
import {
  isFunctionExpression,
  isFieldExpression,
  isWhereExpression,
  isParamLiteral,
  isOptionNode,
  isLiteral,
  isAssignment,
  isColumn,
  Walker,
} from '@elastic/esql';
import { commaCompleteItem, newLineCompleteItem, pipeCompleteItem } from '../complete_items';
import { withAutoSuggest } from '../../definitions/utils/autocomplete/helpers';
import type { ISuggestionItem } from '../types';
import { getFunctionDefinition } from '../../definitions/utils/functions';
import { FunctionDefinitionTypes } from '../../definitions/types';
import { ReplacementRangeStrategyKind } from '../../../language/autocomplete/utils/prefix_range';
import { endsWithComma, endsWithWhitespace } from '../../definitions/utils/regex';

/**
 * Position of the caret in the sort command:
*
* ```
* STATS [column1 =] expression1[, ..., [columnN =] expressionN] [BY [column1 =] grouping_expression1[, ..., grouping_expressionN]]
        |           |          |                                    |           |                   |
        |           |          expression_complete                  |           |                   grouping_expression_complete
        |           expression_after_assignment                     |           grouping_expression_after_assignment
        expression_without_assignment                               grouping_expression_without_assignment

* ```
*/
export type CaretPosition =
  | 'expression_without_assignment'
  | 'expression_after_assignment'
  | 'grouping_expression_without_assignment'
  | 'grouping_expression_after_assignment'
  | 'after_where';

export const getPosition = (command: ESQLAstAllCommands, innerText: string): CaretPosition => {
  const lastCommandArg = command.args[command.args.length - 1];

  if (isOptionNode(lastCommandArg) && lastCommandArg.name === 'by') {
    // in the BY clause

    const lastOptionArg = lastCommandArg.args[lastCommandArg.args.length - 1];
    if (isAssignment(lastOptionArg) && !endsWithComma(innerText)) {
      return 'grouping_expression_after_assignment';
    }

    return 'grouping_expression_without_assignment';
  }

  if (isAssignment(lastCommandArg) && !endsWithComma(innerText)) {
    return 'expression_after_assignment';
  }

  if (isWhereExpression(lastCommandArg) && !endsWithComma(innerText)) {
    return 'after_where';
  }

  return 'expression_without_assignment';
};

export const byCompleteItem: ISuggestionItem = withAutoSuggest({
  label: 'BY',
  text: 'BY ',
  kind: 'Reference',
  detail: 'By',
});

export const whereCompleteItem: ISuggestionItem = withAutoSuggest({
  label: 'WHERE',
  text: 'WHERE ',
  kind: 'Reference',
  detail: 'Where',
});

function isAggregation(arg: ESQLAstItem): arg is ESQLFunction {
  return (
    isFunctionExpression(arg) &&
    getFunctionDefinition(arg.name)?.type === FunctionDefinitionTypes.AGG
  );
}

function isNotAnAggregation(arg: ESQLAstItem): arg is ESQLFunction {
  return (
    isFunctionExpression(arg) &&
    getFunctionDefinition(arg.name)?.type !== FunctionDefinitionTypes.AGG
  );
}

const isFunctionOperatorParam = (fn: ESQLFunction): boolean =>
  !!fn.operator && isParamLiteral(fn.operator);

export function checkAggExistence(arg: ESQLFunction): boolean {
  if (isWhereExpression(arg)) {
    return checkAggExistence(arg.args[0] as ESQLFunction);
  }

  if (isFieldExpression(arg)) {
    const agg = arg.args[1];
    const firstFunction = Walker.match(agg, { type: 'function' });

    if (!firstFunction) {
      return false;
    }

    return checkAggExistence(firstFunction as ESQLFunction);
  }

  // TODO the grouping function check may not
  // hold true for all future cases
  if (isAggregation(arg) || isFunctionOperatorParam(arg)) {
    return true;
  }

  if (isNotAnAggregation(arg)) {
    return (arg as ESQLFunction).args.filter(isFunctionExpression).some(checkAggExistence);
  }

  return false;
}

// now check that:
// * the agg function is at root level
// * or if it's a operators function, then all operands are agg functions or literals
// * or if it's a eval function then all arguments are agg functions or literals
// * or if a named param is used
export function checkFunctionContent(arg: ESQLFunction) {
  // TODO the grouping function check may not
  // hold true for all future cases
  if (isAggregation(arg) || isFunctionOperatorParam(arg)) {
    return true;
  }
  return (arg as ESQLFunction).args.every((subArg): boolean => {
    // Differentiate between array and non-array arguments
    if (Array.isArray(subArg)) {
      return subArg.every((item) => checkFunctionContent(item as ESQLFunction));
    }
    return (
      isLiteral(subArg) ||
      isAggregation(subArg) ||
      (isNotAnAggregation(subArg) ? checkFunctionContent(subArg) : false)
    );
  });
}

export const rightAfterColumn = (
  innerText: string,
  expressionRoot: ESQLSingleAstItem | undefined,
  columnExists: (name: string) => boolean
): boolean => {
  if (!expressionRoot) return false;

  let col: ESQLProperNode | undefined;

  Walker.walk(expressionRoot, {
    visitColumn(node) {
      if (node.location.max === innerText.length - 1) col = node;
    },
  });

  return isColumn(col) && columnExists(col.parts.join('.'));
};

export const getCommaAndPipe = (
  innerText: string,
  expressionRoot: ESQLSingleAstItem | undefined,
  columnExists: (name: string) => boolean
): ISuggestionItem[] => {
  const pipeSuggestion = { ...pipeCompleteItem };
  const commaSuggestion = withAutoSuggest({
    ...commaCompleteItem,
    text: ', ',
  });

  // does the query end with whitespace?
  if (endsWithWhitespace(innerText)) {
    commaSuggestion.replacementRangeStrategy = {
      kind: ReplacementRangeStrategyKind.TRAILING_WHITESPACE,
    };
  }
  // special case: cursor right after a column name
  else if (isColumn(expressionRoot) && rightAfterColumn(innerText, expressionRoot, columnExists)) {
    pipeSuggestion.text = ` ${pipeSuggestion.text}`;
    pipeSuggestion.preserveTypedPrefix = true;

    commaSuggestion.preserveTypedPrefix = true;
  }

  return [newLineCompleteItem, pipeSuggestion, commaSuggestion];
};
