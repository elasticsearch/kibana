/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ESQLControlVariable } from '@kbn/esql-types';
import type {
  ICommandCallbacks,
  ICommandContext,
  ISuggestionItem,
} from '../../../../registry/types';
import { Location } from '../../../../registry/types';
import type {
  FunctionParameterType,
  FunctionDefinitionTypes,
  SupportedDataType,
} from '../../../types';
import { getFieldsSuggestions, withAutoSuggest } from '../helpers';
import { getOperatorSuggestions } from '../../operators';
import { getCompatibleLiterals, getDateLiterals } from '../../literals';
import { filterFunctionDefinitions, getAllFunctions, getFunctionSuggestion } from '../../functions';
import type { ExpressionContext } from './types';
import type { PreferredExpressionType } from './types';
import { commaCompleteItem } from '../../../../registry/complete_items';
import { shouldSuggestComma, type CommaContext } from './comma_decision_engine';

interface FunctionSuggestionOptions {
  ignored?: string[];
  addComma?: boolean;
  addSpaceAfterFunction?: boolean;
  constantGeneratingOnly?: boolean;
  suggestOnlyName?: boolean;
  functionTypes?: FunctionDefinitionTypes[];
}

interface GetFunctionsSuggestionsParams {
  location: Location;
  types: (SupportedDataType | 'unknown' | 'any')[];
  options?: FunctionSuggestionOptions;
  context?: ICommandContext;
  callbacks?: ICommandCallbacks;
}

interface LiteralSuggestionsOptions {
  includeDateLiterals?: boolean;
  includeCompatibleLiterals?: boolean;
  addComma?: boolean;
  advanceCursorAndOpenSuggestions?: boolean;
  supportsControls?: boolean;
  variables?: ESQLControlVariable[];
}

/** Builder pattern to eliminate duplicated field/function/literal suggestion code. */
export class SuggestionBuilder {
  private suggestions: ISuggestionItem[] = [];
  private readonly context: ExpressionContext;

  constructor(context: ExpressionContext) {
    this.context = context;
  }

  async addFields(options?: {
    types?: FunctionParameterType[];
    ignoredColumns?: string[];
    addComma?: boolean;
    addSpaceAfterField?: boolean;
    openSuggestions?: boolean;
    values?: boolean;
    canBeMultiValue?: boolean;
  }): Promise<this> {
    const types = options?.types ?? ['any'];
    const addComma = options?.addComma ?? false;
    const addSpaceAfterField = options?.addSpaceAfterField ?? addComma;
    const ignoredColumns = options?.ignoredColumns ?? [];
    const openSuggestions = options?.openSuggestions ?? (addSpaceAfterField || addComma);
    const values = options?.values;
    const canBeMultiValue = options?.canBeMultiValue ?? false;

    const getByType = this.context.callbacks?.getByType ?? (() => Promise.resolve([]));

    const fieldSuggestions = await getFieldsSuggestions(types, getByType, {
      ignoreColumns: ignoredColumns,
      addSpaceAfterField,
      openSuggestions,
      addComma,
      values,
      canBeMultiValue,
    });

    this.suggestions.push(...fieldSuggestions);
    return this;
  }

  addFunctions(options?: {
    types?: FunctionParameterType[];
    addComma?: boolean;
    addSpaceAfterFunction?: boolean;
    constantGeneratingOnly?: boolean;
    excludeParentFunctions?: boolean;
    functionTypes?: FunctionDefinitionTypes[];
  }): this {
    const types = options?.types ?? ['any'];
    const excludeParentFunctions = options?.excludeParentFunctions ?? false;
    const ignored = this.resolveIgnoredFunctions(excludeParentFunctions);
    const addSpaceAfterFunction = options?.addSpaceAfterFunction;
    const constantGeneratingOnly = options?.constantGeneratingOnly ?? false;

    const functionSuggestions = getFunctionsSuggestions({
      location: this.context.location,
      types,
      options: {
        ignored,
        addComma: options?.addComma,
        suggestOnlyName: this.context.options.isCursorFollowedByParens,
        addSpaceAfterFunction,
        constantGeneratingOnly,
        functionTypes: options?.functionTypes,
      },
      context: this.context.context,
      callbacks: {
        hasMinimumLicenseRequired: this.context.callbacks?.hasMinimumLicenseRequired,
      },
    });

    this.suggestions.push(...functionSuggestions);
    return this;
  }

  addLiterals(options?: {
    types?: FunctionParameterType[];
    addComma?: boolean;
    includeDateLiterals?: boolean;
    includeCompatibleLiterals?: boolean;
    advanceCursorAndOpenSuggestions?: boolean;
  }): this {
    const types = options?.types ?? ['any'];
    const includeDateLiterals = options?.includeDateLiterals ?? true;
    const includeCompatibleLiterals = options?.includeCompatibleLiterals ?? true;
    const advanceCursorAndOpenSuggestions = options?.advanceCursorAndOpenSuggestions ?? false;

    const literals = getLiteralsSuggestions(types, this.context.location, {
      includeDateLiterals,
      includeCompatibleLiterals,
      addComma: options?.addComma,
      advanceCursorAndOpenSuggestions,
      supportsControls: this.context.context?.supportsControls,
      variables: this.context.context?.variables,
    });

    this.suggestions.push(...literals);
    return this;
  }

  addOperators(options?: {
    leftParamType?: FunctionParameterType;
    allowed?: string[];
    ignored?: string[];
    returnTypes?: PreferredExpressionType[];
  }): this {
    const operatorSuggestions = getOperatorSuggestions(
      {
        location: this.context.location,
        leftParamType: options?.leftParamType,
        allowed: options?.allowed,
        ignored: options?.ignored,
        returnTypes: options?.returnTypes,
      },
      this.context.callbacks?.hasMinimumLicenseRequired,
      this.context.context?.activeProduct
    );

    this.suggestions.push(...operatorSuggestions);
    return this;
  }

  /**
   * Adds comma suggestion based on decision engine rules.
   */
  addCommaIfNeeded(commaContext: CommaContext): this {
    if (shouldSuggestComma(commaContext)) {
      this.suggestions.push(commaCompleteItem);
    }

    return this;
  }

  addSuggestions(suggestions: ISuggestionItem[]): this {
    this.suggestions.push(...suggestions);
    return this;
  }

  build(): ISuggestionItem[] {
    return this.suggestions;
  }

  /**
   * Returns functions to exclude from suggestions by merging two sources:
   * 1. Command-level ignored functions (e.g., EVAL hides match_phrase)
   *    - Applies exceptions: if current parent function is in allowedInsideFunctions, the function is not ignored
   * 2. Parent function names for recursion prevention (e.g., ABS inside ABS)
   *    - Only included when excludeParentFunctions=true
   */
  private resolveIgnoredFunctions(excludeParentFunctions: boolean): string[] {
    const {
      getFunctionsToIgnore,
      parentFunctionNames = [],
      functionParameterContext,
    } = this.context.options;
    const functionsToIgnore = getFunctionsToIgnore?.(functionParameterContext);
    const parentFn = functionParameterContext?.functionDefinition?.name?.toLowerCase();

    const isAllowedInsideParent = (fn: string) =>
      parentFn &&
      functionsToIgnore?.allowedInsideFunctions?.[fn]?.some((f) => f.toLowerCase() === parentFn);

    const commandIgnored =
      functionsToIgnore?.names.filter((fn) => !isAllowedInsideParent(fn)) ?? [];

    if (!excludeParentFunctions) {
      return commandIgnored;
    }

    return [...new Set([...commandIgnored, ...parentFunctionNames])];
  }
}

function getFunctionsSuggestions({
  location,
  types,
  options = {},
  context,
  callbacks,
}: GetFunctionsSuggestionsParams): ISuggestionItem[] {
  const {
    ignored = [],
    addComma = false,
    suggestOnlyName = false,
    addSpaceAfterFunction = false,
    constantGeneratingOnly = false,
    functionTypes,
  } = options;

  const predicates = {
    location,
    returnTypes: types,
    ignored,
    isTimeseriesSource: context?.isTimeseriesSource,
  };

  const hasMinimumLicenseRequired = callbacks?.hasMinimumLicenseRequired;
  const activeProduct = context?.activeProduct;

  let filteredFunctions = filterFunctionDefinitions(
    getAllFunctions({ includeOperators: false, type: functionTypes }),
    predicates,
    hasMinimumLicenseRequired,
    activeProduct
  );

  if (constantGeneratingOnly) {
    const typeSet = new Set(types);
    filteredFunctions = filteredFunctions.filter((fn) =>
      fn.signatures.some((sig) => sig.params.length === 0 && typeSet.has(sig.returnType))
    );
  }

  const textSuffix = (addComma ? ',' : '') + (addSpaceAfterFunction ? ' ' : '');

  return filteredFunctions.map((fn) => {
    const suggestion = getFunctionSuggestion(fn);

    if (suggestOnlyName) {
      suggestion.text = fn.name.toUpperCase();
      return suggestion;
    }

    if (textSuffix) {
      suggestion.text += textSuffix;
    }

    return withAutoSuggest(suggestion);
  });
}

function getLiteralsSuggestions(
  types: (SupportedDataType | 'unknown' | 'any')[],
  location: Location,
  options: LiteralSuggestionsOptions = {}
): ISuggestionItem[] {
  const { includeDateLiterals = true, includeCompatibleLiterals = true } = options;

  const suggestions: ISuggestionItem[] = [];

  if (
    includeDateLiterals &&
    (location === Location.WHERE ||
      location === Location.EVAL ||
      location === Location.STATS_WHERE) &&
    types.includes('date')
  ) {
    suggestions.push(
      ...getDateLiterals({
        addComma: options.addComma,
        advanceCursorAndOpenSuggestions: options.advanceCursorAndOpenSuggestions,
      })
    );
  }

  if (includeCompatibleLiterals) {
    suggestions.push(
      ...getCompatibleLiterals(
        types,
        {
          addComma: options.addComma,
          advanceCursorAndOpenSuggestions: options.advanceCursorAndOpenSuggestions,
          supportsControls: options.supportsControls,
        },
        options.variables
      )
    );
  }

  return suggestions;
}
