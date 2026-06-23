/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import {
  Walker,
  walk,
  Parser,
  isFunctionExpression,
  isColumn,
  WrappingPrettyPrinter,
  BasicPrettyPrinter,
  isStringLiteral,
} from '@elastic/esql';
import {
  CommandNames,
  esqlCommandRegistry,
  getPromqlBracketsToClose,
  TRANSFORMATIONAL_COMMANDS,
} from '@kbn/esql-language';
import type { PromQLLabel } from '@elastic/esql';
import type {
  ESQLAstItem,
  ESQLSource,
  ESQLFunction,
  ESQLColumn,
  ESQLSingleAstItem,
  ESQLInlineCast,
  ESQLCommandOption,
  ESQLAstForkCommand,
  ESQLAstQueryExpression,
} from '@elastic/esql/types';
import { type ESQLControlVariable, ESQLVariableType } from '@kbn/esql-types';
import type { DatatableColumn } from '@kbn/expressions-plugin/common';
import type { monaco } from '@kbn/code-editor';

const DEFAULT_ESQL_LIMIT = 1000;

const DROP_COMMAND_REGEX = /DROP\s/i;
const LEADING_PARAM_PREFIX_REGEX = /^\?+/;
const TRAILING_CLOSERS_REGEX = /[\s)\]}]+$/;

export function getRemoteClustersFromESQLQuery(esql?: string): string[] | undefined {
  if (!esql) return undefined;
  const { root } = Parser.parse(esql);
  const sourceCommand = root.commands.find(({ name }) => ['from', 'ts'].includes(name));
  const args = (sourceCommand?.args ?? []) as ESQLSource[];

  const clustersSet = new Set<string>();

  // Handle sources with explicit prefix (e.g., FROM cluster1:index1)
  args
    .filter((arg) => arg.prefix)
    .forEach((arg) => {
      if (arg.prefix?.value) {
        clustersSet.add(arg.prefix.value);
      }
    });

  // Handle sources without prefix that might contain cluster:index patterns
  // This includes quoted sources like "cluster1:index1,cluster2:index2"
  args
    .filter((arg) => !arg.prefix)
    .forEach((arg) => {
      // Split by comma to handle cases like "cluster1:index1,cluster2:index2"
      const indices = arg.name.split(',');
      indices.forEach((index) => {
        const trimmedIndex = index.trim();
        const colonIndex = trimmedIndex.indexOf(':');
        // Only add if there's a valid cluster:index pattern
        if (colonIndex > 0 && colonIndex < trimmedIndex.length - 1) {
          const clusterName = trimmedIndex.substring(0, colonIndex);
          clustersSet.add(clusterName);
        }
      });
    });

  return clustersSet.size > 0 ? [...clustersSet] : undefined;
}

/**
 * Determines if an ES|QL query contains transformational commands.
 *
 * For ES|QL, we consider the following as transformational commands:
 * - `stats`: Performs aggregations and transformations
 * - `keep`: Filters and selects specific fields
 * - `fork` commands where ALL branches contain only transformational commands
 *
 * @param esql - The ES|QL query string to analyze
 * @returns true if the query contains transformational commands or fork commands with all transformational branches
 *
 * @example
 * hasTransformationalCommand('from index | stats count() by field') // true
 * hasTransformationalCommand('from index | keep field1, field2') // true
 * hasTransformationalCommand('from index | fork (stats count()) (keep field)') // true
 * hasTransformationalCommand('from index | fork (where x > 0) (eval y = x * 2)') // false
 * hasTransformationalCommand('from index | where field > 0') // false
 */
export function hasTransformationalCommand(esql?: string) {
  if (!esql) return false;
  const { root } = Parser.parse(esql);

  // Check for direct transformational commands first
  const hasAtLeastOneTransformationalCommand = TRANSFORMATIONAL_COMMANDS.some((command) =>
    root.commands.find(({ name }) => name === command)
  );

  // Early return if we found direct transformational commands
  if (hasAtLeastOneTransformationalCommand) {
    return true;
  }

  // Check for fork commands with all transformational branches
  const forkCommands = Walker.findAll(
    root,
    (node) => node.name === 'fork'
  ) as Array<ESQLAstForkCommand>;

  const hasForkWithAllTransformationalBranches = forkCommands.some((forkCommand) => {
    const forkArguments = forkCommand?.args;

    if (!forkArguments || forkArguments.length === 0) {
      return false;
    }

    return forkArguments.every((parens) => {
      const branch = parens.child;

      if (branch.type !== 'query') {
        return false;
      }

      const branchCommands = branch.commands;

      // Branch must have at least one command and all commands must be transformational
      return (
        branchCommands.length > 0 &&
        branchCommands.every((cmd) => TRANSFORMATIONAL_COMMANDS.includes(cmd.name))
      );
    });
  });

  return hasForkWithAllTransformationalBranches;
}

export function getLimitFromESQLQuery(esql: string): number {
  const { root } = Parser.parse(esql || '');
  const limitCommands = root.commands.filter(({ name }) => name === 'limit');
  if (!limitCommands || !limitCommands.length) {
    return DEFAULT_ESQL_LIMIT;
  }
  const limits: number[] = [];

  walk(root.commands, {
    visitLiteral: (node) => {
      if (!isNaN(Number(node.value))) {
        limits.push(Number(node.value));
      }
    },
  });

  if (!limits.length) {
    return DEFAULT_ESQL_LIMIT;
  }

  // ES returns always the smallest limit
  return Math.min(...limits);
}

export function removeDropCommandsFromESQLQuery(esql?: string): string {
  const pipes = (esql || '').split('|');
  return pipes.filter((statement) => !DROP_COMMAND_REGEX.test(statement)).join('|');
}

/**
 * Converts timeseries (TS) commands to FROM commands in an ES|QL query
 * @param esql - The ES|QL query string
 * @returns The modified query with TS commands converted to FROM commands
 */
export function convertTimeseriesCommandToFrom(esql?: string): string {
  const { root } = Parser.parse(esql || '');
  const timeseriesCommand = Walker.commands(root).find(({ name }) => name === 'ts');
  if (!timeseriesCommand) return esql || '';

  const fromCommand = {
    ...timeseriesCommand,
    name: 'from',
  };

  // Replace the ts command with the from command in the commands array
  const newCommands = root.commands.map((command) =>
    command === timeseriesCommand ? fromCommand : command
  );

  const newRoot = {
    ...root,
    commands: newCommands,
  };

  return BasicPrettyPrinter.print(newRoot);
}

/**
 * When the ?_tstart and ?_tend params are used, we want to retrieve the timefield from the query.
 * @param esql:string
 * @returns string
 */
export const getTimeFieldFromESQLQuery = (esql: string) => {
  const { root } = Parser.parse(esql);
  const functions: ESQLFunction[] = [];

  walk(root.commands, {
    visitFunction: (node) => functions.push(node),
  });

  const params = Walker.params(root);
  const timeNamedParam = params.find(
    (param) => param.value === '_tstart' || param.value === '_tend'
  );
  // PromQL queries always use @timestamp as timefield
  const isPromQLQuery = root.commands.some(({ name }) => name === 'promql');
  if (isPromQLQuery) {
    return '@timestamp';
  }

  if (!timeNamedParam || !functions.length) {
    return undefined;
  }
  const allFunctionsWithNamedParams = functions.filter(
    ({ location }) =>
      location.min <= timeNamedParam.location.min && location.max >= timeNamedParam.location.max
  );

  if (!allFunctionsWithNamedParams.length) {
    return undefined;
  }
  const lowLevelFunction = allFunctionsWithNamedParams[allFunctionsWithNamedParams.length - 1];

  let columnName: string | undefined;

  lowLevelFunction.args.some((arg) => {
    const argument = arg as ESQLSingleAstItem | ESQLInlineCast<ESQLSingleAstItem>;
    if (argument.type === 'column') {
      columnName = argument.name;
      return true;
    }

    if (
      argument.type === 'inlineCast' &&
      (argument as ESQLInlineCast<ESQLSingleAstItem>).value.type === 'column'
    ) {
      columnName = (argument as ESQLInlineCast<ESQLSingleAstItem>).value.name;
      return true;
    }

    return false;
  });

  return columnName;
};

export const getKqlSearchQueries = (esql: string) => {
  const { root } = Parser.parse(esql);
  const functions: ESQLFunction[] = [];

  walk(root.commands, {
    visitFunction: (node) => functions.push(node),
  });

  const searchFunctions = functions.filter(({ name }) => name === 'kql');

  return searchFunctions
    .map((func) => {
      if (func.args.length > 0 && isStringLiteral(func.args[0])) {
        return func.args[0].valueUnquoted.trim();
      }
      return '';
    })
    .filter((query) => query !== '');
};

/**
 * Prettifies an ES|QL query with configurable line wrapping.
 * @param src - The raw ES|QL query string
 * @param lineWidth - Optional line width in characters; when provided, output is wrapped to fit. Otherwise uses the library default (80).
 */
export const prettifyQuery = (src: string, lineWidth?: number): string => {
  const { root } = Parser.parse(src, { withFormatting: true });
  return WrappingPrettyPrinter.print(root, {
    multiline: true,
    ...(lineWidth !== undefined && { wrap: lineWidth }),
  });
};

export const retrieveMetadataColumns = (esql: string): string[] => {
  const { root } = Parser.parse(esql);
  const options: ESQLCommandOption[] = [];

  walk(root, {
    visitCommandOption: (node) => options.push(node),
  });
  const metadataOptions = options.find(({ name }) => name === 'metadata');
  return metadataOptions?.args.map((column) => (column as ESQLColumn).name) ?? [];
};

export const getQueryColumnsFromESQLQuery = (esql: string): string[] => {
  const { root } = Parser.parse(esql);
  const columns: ESQLColumn[] = [];

  walk(root, {
    visitColumn: (node) => columns.push(node),
  });

  return columns.map((column) => column.name);
};

export const getESQLQueryVariables = (esql: string): string[] => {
  const { root } = Parser.parse(esql);
  const usedVariablesInQuery = Walker.params(root);
  return usedVariablesInQuery.map((v) => v.text.replace(LEADING_PARAM_PREFIX_REGEX, ''));
};

/**
 * This function is used to map the variables to the columns in the datatable
 * @param esql:string
 * @param variables:ESQLControlVariable[]
 * @param columns:DatatableColumn[]
 * @returns DatatableColumn[]
 */
export const mapVariableToColumn = (
  esql: string,
  variables: ESQLControlVariable[],
  columns: DatatableColumn[]
): DatatableColumn[] => {
  if (!variables.length) {
    return columns;
  }
  const usedVariablesInQuery = getESQLQueryVariables(esql);
  const uniqueVariablesInQyery = new Set<string>(usedVariablesInQuery);

  columns.map((column) => {
    if (variables.some((variable) => variable.value === column.id)) {
      const potentialColumnVariables = variables.filter((variable) => variable.value === column.id);
      const variable = potentialColumnVariables.find((v) => uniqueVariablesInQyery.has(v.key));
      column.variable = variable?.key ?? '';
    }
  });
  return columns;
};

export const getQueryUpToCursor = (queryString: string, cursorPosition?: monaco.Position) => {
  const lines = queryString.split('\n');
  const lineNumber = cursorPosition?.lineNumber ?? lines.length;
  const column = cursorPosition?.column ?? lines[lineNumber - 1].length;

  // Handle the case where the cursor is within the first line
  if (lineNumber === 1) {
    return lines[0].slice(0, column);
  }

  // Get all lines up to the specified line number (exclusive of the current line)
  const previousLines = lines.slice(0, lineNumber - 1).join('\n');
  const currentLine = lines[lineNumber - 1].slice(0, column);

  // Join the previous lines and the partial current line
  return previousLines + '\n' + currentLine;
};

const hasQuestionMarkAtEndOrSecondLastPosition = (queryString: string) => {
  if (typeof queryString !== 'string' || queryString.length === 0) {
    return false;
  }

  const lastChar = queryString.slice(-1);
  const secondLastChar = queryString.slice(-2, -1);

  return lastChar === '?' || secondLastChar === '?';
};

/**
 * Finds the node closest to the given cursor position within an array of located nodes.
 * Works for any node exposing a `location` range (ES|QL columns, PromQL labels, ...).
 *
 * @param columns An array of nodes with a location range.
 * @param cursorPosition The current cursor position.
 * @returns The node closest to the cursor, or undefined if the array is empty.
 */
export function findClosestField<T extends { location: { min: number; max: number } }>(
  columns: T[],
  cursorPosition?: monaco.Position
): T | undefined {
  if (columns.length === 0) {
    return undefined;
  }

  if (!cursorPosition) {
    return columns[0]; // If no cursor position is provided, return the first column
  }

  const cursorCol = cursorPosition.column;
  let closestColumn;
  let minDistance = Infinity;

  for (const column of columns) {
    const columnMin = column.location.min;
    const columnMax = column.location.max;

    // If the cursor is within the column's range, it's the closest
    if (cursorCol >= columnMin && cursorCol <= columnMax) {
      return column;
    }

    // Calculate distance from the cursor to the nearest edge of the column
    let distance: number;
    if (cursorCol < columnMin) {
      distance = columnMin - cursorCol; // Cursor is to the left of the column
    } else {
      distance = cursorCol - columnMax; // Cursor is to the right of the column
    }

    if (distance < minDistance) {
      minDistance = distance;
      closestColumn = column;
    }
  }

  return closestColumn;
}

export const getValuesFromQueryField = (queryString: string, cursorPosition?: monaco.Position) => {
  const queryInCursorPosition = getQueryUpToCursor(queryString, cursorPosition);

  if (hasQuestionMarkAtEndOrSecondLastPosition(queryInCursorPosition)) {
    return undefined;
  }

  const validQuery = `${queryInCursorPosition} ""`;
  const { root } = Parser.parse(validQuery);
  const lastCommand = root.commands[root.commands.length - 1];
  const fields: Array<ESQLColumn | PromQLLabel> = [];

  if (lastCommand?.name === 'promql') {
    // Empty `{agent=}` loses its label; reopen and add a placeholder value so it survives.
    const validPromqlQuery = `${queryInCursorPosition.replace(TRAILING_CLOSERS_REGEX, '')} ""`;
    const { root: promqlRoot } = Parser.parse(
      `${validPromqlQuery}${getPromqlBracketsToClose(validPromqlQuery)}`
    );

    Walker.walk(promqlRoot, {
      promql: { visitPromqlLabel: (label) => fields.push(label) },
    });
  } else {
    walk(lastCommand, {
      visitColumn: (column) => fields.push(column),
    });
  }

  const field = findClosestField(fields, cursorPosition);

  return field?.name !== '*' ? field?.name : undefined;
};

// this is for backward compatibility, if the query is of fields or functions type
// and the query is not set with ?? in the query, we should set it
// https://github.com/elastic/elasticsearch/pull/122459
export const fixESQLQueryWithVariables = (
  queryString: string,
  esqlVariables?: ESQLControlVariable[]
) => {
  const currentVariables = getESQLQueryVariables(queryString);
  if (!currentVariables.length) {
    return queryString;
  }

  // filter out the variables that are not used in the query
  // and that they are not of type FIELDS or FUNCTIONS
  const identifierTypeVariables = esqlVariables?.filter(
    (variable) =>
      currentVariables.includes(variable.key) &&
      (variable.type === ESQLVariableType.FIELDS || variable.type === ESQLVariableType.FUNCTIONS)
  );

  // check if they are set with ?? or ? in the query
  // replace only if there is only one ? in front of the variable
  if (identifierTypeVariables?.length) {
    identifierTypeVariables.forEach((variable) => {
      const regex = new RegExp(`(?<!\\?)\\?${variable.key}`);
      queryString = queryString.replace(regex, `??${variable.key}`);
    });
    return queryString;
  }

  return queryString;
};

export const getCategorizeColumns = (esql: string): string[] => {
  const { root } = Parser.parse(esql);
  const statsCommand = root.commands.find(({ name }) => name === 'stats');
  if (!statsCommand) {
    return [];
  }
  const options: ESQLCommandOption[] = [];
  const columns: string[] = [];

  walk(statsCommand, {
    visitCommandOption: (node) => options.push(node),
  });

  const statsByOptions = options.find(({ name }) => name === 'by');

  // categorize is part of the stats by command
  if (!statsByOptions) {
    return [];
  }

  const categorizeOptions = statsByOptions.args.filter((arg) => {
    return (arg as ESQLFunction).text.toLowerCase().indexOf('categorize') !== -1;
  }) as ESQLFunction[];

  if (categorizeOptions.length) {
    categorizeOptions.forEach((arg) => {
      // ... STATS ... BY CATEGORIZE(field)
      if (isFunctionExpression(arg) && arg.name === 'categorize') {
        columns.push(arg.text);
      } else {
        // ... STATS ... BY pattern = CATEGORIZE(field)
        const columnArgs = arg.args.filter((a) => isColumn(a));
        columnArgs.forEach((c) => columns.push((c as ESQLColumn).name));
      }
    });
  }

  // If there is a rename command, we need to check if the column is renamed
  return replaceColumnNamesIfRenamed(root, columns);
};

export const getSparklineColumns = (esql: string): string[] => {
  const { root } = Parser.parse(esql);
  // SPARKLINE can appear in both STATS and INLINE STATS commands
  const statsCommands = root.commands.filter(
    ({ name }) => name === 'stats' || name === 'inline stats'
  );
  if (statsCommands.length === 0) {
    return [];
  }
  const columns: string[] = [];

  const collectFromArg = (arg: ESQLAstItem): void => {
    if (!isFunctionExpression(arg)) {
      return;
    }
    if (arg.name === 'where') {
      // Aggregate inline WHERE filter: "sparkline = SPARKLINE(...) WHERE condition"
      // is a 'where' function expression where args[0] is the aggregate expression
      if (arg.args.length === 0) return;
      collectFromArg(arg.args[0]);
      return;
    }
    if (arg.name === 'sparkline') {
      // Bare (unaliased) SPARKLINE — extract the column name from the original query source
      // rather than arg.text, because Elasticsearch names bare aggregate expressions using
      // the source text (e.g. "SPARKLINE(COUNT(*), ts, 50, ...)") while arg.text is the
      // compact printer form without spaces, which would not match the column ID in results.
      columns.push(esql.substring(arg.location.min, arg.location.max + 1));
      return;
    }
    if (
      arg.name === '=' &&
      isColumn(arg.args[0]) &&
      Walker.match(arg, { type: 'function', name: 'sparkline' })
    ) {
      // STATS/INLINE STATS col = SPARKLINE(...) — Walker finds the call regardless of RHS shape
      columns.push((arg.args[0] as ESQLColumn).name);
    }
  };

  for (const statsCommand of statsCommands) {
    for (const arg of statsCommand.args) {
      if ((arg as ESQLCommandOption).type === 'option') {
        // Skip BY and other command options (grouping, not aggregates)
        continue;
      }
      collectFromArg(arg);
    }
  }

  // If there is a rename command, we need to check if the column is renamed
  return replaceColumnNamesIfRenamed(root, columns);
};

/**
 * Extracts the original and renamed columns from a rename function.
 * RENAME original AS renamed Vs RENAME renamed = original
 * @param renameFunction
 */
export const getArgsFromRenameFunction = (
  renameFunction: ESQLFunction
): { original: ESQLColumn; renamed: ESQLColumn } => {
  if (renameFunction.name === 'as') {
    return {
      original: renameFunction.args[0] as ESQLColumn,
      renamed: renameFunction.args[1] as ESQLColumn,
    };
  }

  return {
    original: renameFunction.args[1] as ESQLColumn,
    renamed: renameFunction.args[0] as ESQLColumn,
  };
};

/**
 * Extracts the fields used in the CATEGORIZE function from an ESQL query.
 * @param esql: string - The ESQL query string
 */
export const getCategorizeField = (esql: string): string[] => {
  const { root } = Parser.parse(esql);
  const columns: string[] = [];
  const functions = Walker.matchAll(root.commands, {
    type: 'function',
    name: 'categorize',
  }) as ESQLFunction[];

  if (functions.length) {
    functions.forEach((func) => {
      for (const arg of func.args) if (isColumn(arg)) columns.push(arg.name);
    });
    return columns;
  }

  return columns;
};

export const hasLimitBeforeAggregate = (esql: string): boolean => {
  const {
    root: { commands },
  } = Parser.parse(esql);
  const statsCommand = commands.find(({ name }) => name === 'stats');
  const limitCommand = commands.find(({ name }) => name === 'limit');

  if (statsCommand && limitCommand) {
    return commands.indexOf(limitCommand) < commands.indexOf(statsCommand);
  }
  return false;
};

export const missingSortBeforeLimit = (esql: string): boolean => {
  const {
    root: { commands },
  } = Parser.parse(esql);
  const sortCommand = commands.find(({ name }) => name === 'sort');
  const limitCommand = commands.find(({ name }) => name === 'limit');

  if (limitCommand) {
    if (sortCommand) {
      return commands.indexOf(sortCommand) > commands.indexOf(limitCommand);
    } else {
      return false;
    }
  }
  return false;
};
/**
 * Checks if the ESQL query contains only source commands (e.g., FROM, TS).
 * If the query contains PROMQL command, we will exclude it from this check.
 * @param esql: string - The ESQL query string
 * @returns true if the query contains only source commands, false otherwise
 */
export const hasOnlySourceCommand = (query: string): boolean => {
  const { root } = Parser.parse(query);
  const sourceCommands = esqlCommandRegistry.getSourceCommandNames();
  return (
    root.commands.length > 0 &&
    root.commands.every(({ name }) => name !== 'promql') &&
    root.commands.every((command) => sourceCommands.includes(command.name))
  );
};

/**
 * Determines if an ES|QL query contains the METRICS_INFO or TS_INFO commands.
 *
 * @param esql - The ES|QL query string to analyze
 * @returns true if the query contains the METRICS_INFO or TS_INFO commands, false otherwise
 */
export const hasTimeseriesInfoCommand = (esql?: string): boolean => {
  if (!esql) return false;
  const { root } = Parser.parse(esql);
  return root.commands.some(
    ({ name }) => name === CommandNames.METRICS_INFO || name === CommandNames.TS_INFO
  );
};

/**
 * Given an array of column names, it returns a new array with corrected column names
 * if any of the columns is renamed in the query.
 */
export const replaceColumnNamesIfRenamed = (
  root: ESQLAstQueryExpression,
  columnNames: string[]
): string[] => {
  const columns = [...columnNames];
  const renameCommands = root.commands.filter(({ name }) => name === 'rename');

  if (renameCommands.length === 0) {
    return columns;
  }

  const renameFunctions: ESQLFunction[] = [];
  renameCommands.forEach((renameCommand) => {
    walk(renameCommand, {
      visitFunction: (node) => renameFunctions.push(node),
    });
  });

  for (const renameFunction of renameFunctions) {
    const { original, renamed } = getArgsFromRenameFunction(renameFunction);
    const index = columns.indexOf(original.name);
    if (index !== -1) {
      columns[index] = renamed.name;
    }
  }

  return columns;
};
