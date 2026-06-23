/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * This file contains a mechanism for injecting test functions into the
 * validation tests. This allows us to use our own fixtures without relying
 * on the generated definitions provided by Elasticsearch.
 */
import { uniq } from 'lodash';
import type { LicenseType } from '@kbn/licensing-types';
import type { EsqlFieldType } from '@kbn/esql-types';
import type { ESQLAstAllCommands } from '@elastic/esql/types';
import type {
  ICommandCallbacks,
  ISuggestionItem,
  Location,
  ESQLColumnData,
} from '../../commands/registry/types';
import { aggFunctionDefinitions } from '../../commands/definitions/generated/aggregation_functions';
import { timeSeriesAggFunctionDefinitions } from '../../commands/definitions/generated/time_series_agg_functions';
import { groupingFunctionDefinitions } from '../../commands/definitions/generated/grouping_functions';
import { scalarFunctionDefinitions } from '../../commands/definitions/generated/scalar_functions';
import {
  operatorsDefinitions,
  comparisonFunctions,
  logicalOperators,
  arithmeticOperators,
  patternMatchOperators,
  inOperators,
  nullCheckOperators,
} from '../../commands/definitions/all_operators';
import type {
  FunctionParameterType,
  FunctionReturnType,
  SupportedDataType,
} from '../../commands/definitions/types';
import { FunctionDefinitionTypes } from '../../commands/definitions/types';
import { mockContext, getMockCallbacks } from './context_fixtures';
import { getSafeInsertText } from '../../commands/definitions/utils';
import { timeUnitsToSuggest } from '../../commands/definitions/constants';
import { findAutocompleteAstPosition } from '../../language/shared/parse_for_autocomplete_query';
import { FUNCTIONS_TO_IGNORE } from '../../commands/registry/eval/autocomplete';
import { attachReplacementRanges } from '../../language/autocomplete/utils/prefix_range';

export const IGNORED_FUNCTIONS_BY_LOCATION: { [K in Location]?: string[] } = {
  eval: [...FUNCTIONS_TO_IGNORE.names],
};

export const DATE_DIFF_TIME_UNITS = (() => {
  const dateDiffDefinition = scalarFunctionDefinitions.find(
    ({ name }) => name.toLowerCase() === 'date_diff'
  );
  const suggestedValues = dateDiffDefinition?.signatures?.[0]?.params?.[0]?.suggestedValues ?? [];

  return suggestedValues.map((unit) => `"${unit}", `);
})();

export const mockFieldsWithTypes = (
  mockCallbacks: ICommandCallbacks,
  fieldNames: string[]
): void => {
  (mockCallbacks.getByType as jest.Mock).mockResolvedValue(
    fieldNames.map((fieldName) => ({ label: fieldName, text: fieldName }))
  );
};

export const suggest = async (
  query: string,
  context = mockContext,
  commandName: string,
  mockCallbacks = getMockCallbacks(),
  autocomplete: (
    arg0: string,
    arg1: ESQLAstAllCommands,
    arg2: ICommandCallbacks,
    arg3: {
      columns: Map<string, ESQLColumnData>;
    },
    arg4?: number
  ) => Promise<ISuggestionItem[]>,
  offset?: number
): Promise<ISuggestionItem[]> => {
  const cursorPosition = offset ?? query.length;
  const { innerText, root, command, tokens } = findAutocompleteAstPosition(query, cursorPosition);
  const headerConstruction = root?.header?.find((cmd) => cmd.name === commandName);
  const targetCommand = headerConstruction ?? command;

  if (!targetCommand) {
    throw new Error(`${commandName.toUpperCase()} command not found in the parsed query`);
  }

  const contextWithRoot = { ...context, rootAst: root };

  const suggestions = await autocomplete(
    query,
    targetCommand,
    mockCallbacks,
    contextWithRoot,
    cursorPosition
  );

  return attachReplacementRanges(innerText, suggestions, {
    commandContext: contextWithRoot,
    tokens,
  });
};

export const expectSuggestions = async (
  query: string,
  expectedSuggestions: string[],
  context = mockContext,
  commandName: string,
  mockCallbacks = getMockCallbacks(),
  autocomplete: (
    arg0: string,
    arg1: ESQLAstAllCommands,
    arg2: ICommandCallbacks,
    arg3: {
      columns: Map<string, ESQLColumnData>;
    },
    arg4?: number
  ) => Promise<ISuggestionItem[]>,
  offset?: number
) => {
  const result = await suggest(query, context, commandName, mockCallbacks, autocomplete, offset);

  const suggestions: string[] = [];
  result.forEach((suggestion) => {
    if (containsSnippet(suggestion.text) && !suggestion.asSnippet) {
      throw new Error(
        `Suggestion with snippet placeholder must be marked as a snippet. -> ${suggestion.text}`
      );
    }
    suggestions.push(suggestion.text);
  });
  expect(uniq(suggestions).sort()).toEqual(uniq(expectedSuggestions).sort());
};

export function getFieldNamesByType(
  _requestedType: Readonly<EsqlFieldType | 'any' | Array<EsqlFieldType | 'any'>>,
  excludeUserDefined: boolean = false
) {
  const columnMap = mockContext.columns;
  const columns = Array.from(columnMap.values());
  const requestedType = Array.isArray(_requestedType) ? _requestedType : [_requestedType];
  const finalArray = excludeUserDefined ? columns.filter((col) => !col.userDefined) : columns;
  return finalArray
    .filter(
      ({ type }) =>
        (requestedType.includes('any') || requestedType.includes(type)) && type !== 'unsupported'
    )
    .map(({ name }) => name);
}

export function getPolicyFields(policyName: string) {
  const policiesMap =
    mockContext.policies ?? new Map<string, { enrichFields: string[]; name: string }>();
  const policies = Array.from(policiesMap.values());
  return policies
    .filter(({ name }) => name === policyName)
    .flatMap(({ enrichFields }) => enrichFields.map((field) => getSafeInsertText(field)));
}

/**
 * Utility to filter down the function list for the given type
 * It is mainly driven by the return type, but it can be filtered upon with the last optional argument "paramsTypes"
 * just make sure to pass the arguments in the right order
 * @param command current command context
 * @param expectedReturnType the expected type returned by the function
 * @param functionCategories
 * @param paramsTypes the function argument types (optional)
 * @returns
 */
export function getFunctionSignaturesByReturnType(
  location: Location | Location[],
  _expectedReturnType: Readonly<FunctionReturnType | 'any' | Array<FunctionReturnType | 'any'>>,
  {
    agg,
    timeseriesAgg,
    grouping,
    scalar,
    operators,
    excludeOperatorGroups,
    // skipAssign here is used to communicate to not propose an assignment if it's not possible
    // within the current context (the actual logic has it, but here we want a shortcut)
    skipAssign,
  }: {
    agg?: boolean;
    timeseriesAgg?: boolean;
    grouping?: boolean;
    scalar?: boolean;
    operators?: boolean;
    /** Exclude specific operator groups (e.g., ['in', 'nullCheck']) */
    excludeOperatorGroups?: Array<
      'logical' | 'comparison' | 'arithmetic' | 'pattern' | 'in' | 'nullCheck'
    >;
    skipAssign?: boolean;
  } = {},
  paramsTypes?: Readonly<FunctionParameterType[]>,
  ignored?: string[],
  option?: string,
  hasMinimumLicenseRequired = (license?: LicenseType | undefined): boolean =>
    license === 'platinum',
  activeProduct = { type: 'observability', tier: 'complete' }
) {
  const expectedReturnType = Array.isArray(_expectedReturnType)
    ? _expectedReturnType
    : [_expectedReturnType];

  const list = [];
  if (agg) {
    list.push(...aggFunctionDefinitions);
  }
  if (timeseriesAgg) {
    list.push(...timeSeriesAggFunctionDefinitions);
  }
  if (grouping) {
    list.push(...groupingFunctionDefinitions);
  }
  // eval functions (eval is a special keyword in JS)
  if (scalar) {
    list.push(...scalarFunctionDefinitions);
  }
  if (operators) {
    const hasStringParams = paramsTypes?.some((type) => type === 'text' || type === 'keyword');
    const comparisonOperatorNames = comparisonFunctions.map(({ name }) => name);

    // Build set of operator names to exclude based on excludeOperatorGroups
    const excludedOperatorNames = new Set<string>();

    if (excludeOperatorGroups) {
      const operatorGroupMap: Record<string, Array<{ name: string; signatures?: unknown[] }>> = {
        logical: logicalOperators,
        comparison: comparisonFunctions,
        arithmetic: arithmeticOperators,
        pattern: patternMatchOperators,
        in: inOperators,
        nullCheck: nullCheckOperators,
      };

      for (const groupName of excludeOperatorGroups) {
        const group = operatorGroupMap[groupName];

        if (group) {
          for (const op of group) {
            excludedOperatorNames.add(op.name);
          }
        }
      }
    }

    const filteredOperators = operatorsDefinitions.filter(({ name }) => {
      if (skipAssign && (name === '=' || name === ':')) {
        return false;
      }

      if (hasStringParams && comparisonOperatorNames.includes(name)) {
        return false;
      }

      if (excludedOperatorNames.has(name)) {
        return false;
      }

      return true;
    });

    list.push(...filteredOperators);
  }

  const deduped = Array.from(new Set(list));

  const locations = Array.isArray(location) ? location : [location];

  return deduped
    .filter(
      ({ signatures, ignoreAsSuggestion, locationsAvailable, license, observabilityTier }) => {
        const hasRestrictedSignature = signatures.some((signature) => signature.license);
        if (hasRestrictedSignature) {
          const availableSignatures = signatures.filter((signature) => {
            if (!signature.license) return true;
            return hasMinimumLicenseRequired(signature.license.toLocaleLowerCase() as LicenseType);
          });

          if (availableSignatures.length === 0) {
            return false;
          }
        }

        if (
          license &&
          observabilityTier &&
          !(
            activeProduct?.type === 'observability' &&
            activeProduct.tier === observabilityTier.toLowerCase()
          )
        ) {
          return false;
        }

        if (ignoreAsSuggestion) {
          return false;
        }
        if (!locations.some((loc) => locationsAvailable.includes(loc))) {
          return false;
        }
        const filteredByReturnType = signatures.filter(
          ({ returnType }) =>
            expectedReturnType.includes('any') || expectedReturnType.includes(returnType as string)
        );
        if (!filteredByReturnType.length && !expectedReturnType.includes('any')) {
          return false;
        }
        if (paramsTypes?.length) {
          return filteredByReturnType.some(
            ({ params }) =>
              !params.length ||
              (paramsTypes.length <= params.length &&
                paramsTypes.every(
                  (expectedType, i) =>
                    expectedType === 'any' ||
                    params[i].type === 'any' ||
                    expectedType === params[i].type
                ))
          );
        }
        return true;
      }
    )
    .filter(({ name }) => {
      const locationIgnored = locations.flatMap((loc) => IGNORED_FUNCTIONS_BY_LOCATION[loc] ?? []);
      const allIgnored = [...locationIgnored, ...(ignored ?? [])];

      if (allIgnored.length) {
        return !allIgnored.includes(name);
      }

      return true;
    })
    .sort(({ name: a }, { name: b }) => a.localeCompare(b))
    .map((definition) => {
      const { type, name, signatures, customParametersSnippet } = definition;

      if (type === FunctionDefinitionTypes.OPERATOR) {
        return signatures.some(({ params }) => params.length > 1)
          ? `${name.toUpperCase()} $0`
          : name.toUpperCase();
      }

      const hasNoArguments = signatures.every((sig) => sig.params.length === 0);
      if (hasNoArguments) {
        return `${name.toUpperCase()}()`;
      }
      return customParametersSnippet
        ? `${name.toUpperCase()}(${customParametersSnippet})`
        : `${name.toUpperCase()}($0)`;
    });
}

export function getLiteralsByType(_type: SupportedDataType | SupportedDataType[]) {
  const type = Array.isArray(_type) ? _type : [_type];
  if (type.includes('time_duration')) {
    return timeUnitsToSuggest.map(({ name }) => `1 ${name}`);
  }
  return [];
}

export const containsSnippet = (text: string): boolean => {
  // Matches most common monaco snippets
  // $0, $1, etc. and ${1:placeholder}, ${2:another}
  const snippetRegex = /\$(\d+|\{\d+:[^}]*\})/;
  return snippetRegex.test(text);
};

/**
 * Convert operator definition groups to suggestion strings.
 * Use this instead of hardcoding operator strings in tests.
 */
export function getOperatorSuggestions(
  operators: Array<{ name: string; signatures: Array<{ params: unknown[] }> }>
): string[] {
  return operators.map(({ name, signatures }) =>
    signatures.some(({ params }) => params.length > 1)
      ? `${name.toUpperCase()} $0`
      : name.toUpperCase()
  );
}
