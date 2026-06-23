/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { i18n } from '@kbn/i18n';
import type { LicenseType } from '@kbn/licensing-types';
import type { ESQLControlVariable, RecommendedField } from '@kbn/esql-types';
import { ControlTriggerSource, ESQLVariableType } from '@kbn/esql-types';
import type { PricingProduct } from '@kbn/core-pricing-common/src/types';
import {
  type FunctionDefinition,
  type FunctionFilterPredicates,
  type FunctionParameterType,
  FunctionDefinitionTypes,
  type InlineCastingType,
} from '../types';
import { operatorsDefinitions } from '../all_operators';
import { aggFunctionDefinitions } from '../generated/aggregation_functions';
import { timeSeriesAggFunctionDefinitions } from '../generated/time_series_agg_functions';
import { groupingFunctionDefinitions } from '../generated/grouping_functions';
import { scalarFunctionDefinitions } from '../generated/scalar_functions';
import { inlineCastsMapping } from '../generated/inline_casts_mapping';
import { EsqlFunctionNames } from '../generated/function_names';
import type { ESQLColumnData, ISuggestionItem } from '../../registry/types';
import { withAutoSuggest } from './autocomplete/helpers';
import { buildFunctionDocumentation } from './documentation';
import { getSafeInsertText, getControlSuggestion } from './autocomplete/helpers';
import { buildFieldsBrowserCommandArgs } from '../../../language/autocomplete/autocomplete_utils';
import { createFieldsBrowserSuggestion } from '../../registry/complete_items';
import { techPreviewLabel } from './shared';
import { getTestFunctions } from './test_functions';
import { SuggestionCategory } from '../../../language/autocomplete/utils/sorting/types';

let fnLookups: Map<string, FunctionDefinition> | undefined;

export function buildFunctionLookup() {
  // we always refresh if we have test functions
  if (!fnLookups || getTestFunctions().length) {
    fnLookups = operatorsDefinitions
      .concat(
        scalarFunctionDefinitions,
        aggFunctionDefinitions,
        groupingFunctionDefinitions,
        timeSeriesAggFunctionDefinitions,
        getTestFunctions()
      )
      .reduce((memo, def) => {
        memo.set(def.name, def);
        if (def.alias) {
          for (const alias of def.alias) {
            memo.set(alias, def);
          }
        }
        return memo;
      }, new Map<string, FunctionDefinition>());
  }
  return fnLookups;
}

export const buildFieldsDefinitions = (
  fields: string[],
  openSuggestions = true
): ISuggestionItem[] => {
  return fields.map((label) => {
    const suggestion: ISuggestionItem = {
      label,
      text: getSafeInsertText(label),
      kind: 'Variable',
      detail: i18n.translate('kbn-esql-language.esql.autocomplete.fieldDefinition', {
        defaultMessage: `Field specified by the input table`,
      }),
      category: SuggestionCategory.FIELD,
    };
    return openSuggestions ? withAutoSuggest(suggestion) : suggestion;
  });
};

export function getFunctionDefinition(name: string) {
  return buildFunctionLookup().get(name.toLowerCase());
}

export const filterFunctionSignatures = (
  signatures: FunctionDefinition['signatures'],
  hasMinimumLicenseRequired: ((minimumLicenseRequired: LicenseType) => boolean) | undefined
): FunctionDefinition['signatures'] => {
  if (!hasMinimumLicenseRequired) {
    return signatures;
  }

  return signatures.filter((signature) => {
    if (!signature.license) return true;
    return hasMinimumLicenseRequired(signature.license.toLocaleLowerCase() as LicenseType);
  });
};

export const filterFunctionDefinitions = (
  functions: FunctionDefinition[],
  predicates: FunctionFilterPredicates | undefined,
  hasMinimumLicenseRequired: ((minimumLicenseRequired: LicenseType) => boolean) | undefined,
  activeProduct?: PricingProduct | undefined
): FunctionDefinition[] => {
  if (!predicates) {
    return functions;
  }
  const { location, returnTypes, ignored = [], allowed = [], isTimeseriesSource } = predicates;

  return functions.filter(
    ({
      name,
      locationsAvailable,
      ignoreAsSuggestion,
      tsdbCompatible,
      signatures,
      license,
      observabilityTier,
    }) => {
      if (ignoreAsSuggestion) {
        return false;
      }

      if (isTimeseriesSource && tsdbCompatible === false) {
        return false;
      }

      if (!!hasMinimumLicenseRequired && license) {
        if (!hasMinimumLicenseRequired(license.toLocaleLowerCase() as LicenseType)) {
          return false;
        }
      }

      if (
        observabilityTier &&
        activeProduct &&
        activeProduct.type === 'observability' &&
        activeProduct.tier !== observabilityTier.toLowerCase()
      ) {
        return false;
      }

      if (allowed.length > 0 && !allowed.includes(name)) {
        return false;
      }

      if (ignored.includes(name)) {
        return false;
      }

      if (location && !locationsAvailable.includes(location)) {
        return false;
      }
      if (returnTypes && !returnTypes.includes('any')) {
        return signatures.some((signature) => returnTypes.includes(signature.returnType as string));
      }

      return true;
    }
  );
};

export function getAllFunctions(options?: {
  type?: Array<FunctionDefinition['type']> | FunctionDefinition['type'];
  includeOperators?: boolean;
}) {
  const { type, includeOperators = true } = options ?? {};

  const fns = buildFunctionLookup();
  const seen = new Set<string>();
  const uniqueFunctions: FunctionDefinition[] = [];

  for (const fn of fns.values()) {
    if (!seen.has(fn.name)) {
      seen.add(fn.name);
      uniqueFunctions.push(fn);
    }
  }

  let result = uniqueFunctions;

  if (!includeOperators) {
    result = result.filter((fn) => fn.type !== FunctionDefinitionTypes.OPERATOR);
  }

  if (!type) {
    return result;
  }

  const types = new Set(Array.isArray(type) ? type : [type]);

  return result.filter((fn) => types.has(fn.type));
}

export function printArguments(
  {
    name,
    type,
    optional,
  }: {
    name: string;
    type: FunctionParameterType | FunctionParameterType[];
    optional?: boolean;
  },
  withTypes: boolean
): string {
  if (!withTypes) {
    return name;
  }
  return `${name}${optional ? ':?' : ':'} ${Array.isArray(type) ? type.join(' | ') : type}`;
}

function handleAdditionalArgs(
  criteria: boolean,
  additionalArgs: Array<{
    name: string;
    type: FunctionParameterType | FunctionParameterType[];
    optional?: boolean;
    reference?: string;
  }>,
  withTypes: boolean
) {
  return criteria
    ? `${withTypes ? ' ,[... ' : ', '}${additionalArgs
        .map((arg) => printArguments(arg, withTypes))
        .join(', ')}${withTypes ? ']' : ''}`
    : '';
}

/**
 * Given a function definition, this function will return a list of function signatures
 *
 * If withTypes is true, the function will return a formal function definition with all arguments typed.
 * This is used when generating the function signature for the monaco editor. If withTypes is false, you get
 * an "injectable" version of the signature to be used to generate test cases.
 */
export function getFunctionSignatures(
  { name, signatures }: FunctionDefinition,
  { withTypes, capitalize }: { withTypes: boolean; capitalize?: boolean } = {
    withTypes: true,
    capitalize: false,
  }
) {
  return signatures.map(({ params, returnType, minParams }) => {
    // for functions with a minimum number of args, repeat the last arg multiple times
    // just make sure to compute the right number of args to add
    const minParamsToAdd = Math.max((minParams || 0) - params.length, 0);
    const extraArg = Array(minParamsToAdd || 1).fill(params[Math.max(params.length - 1, 0)]);
    return {
      declaration: `${capitalize ? name.toUpperCase() : name}(${params
        .map((arg) => printArguments(arg, withTypes))
        .join(', ')}${handleAdditionalArgs(minParamsToAdd > 0, extraArg, withTypes)})${
        withTypes ? `: ${returnType}` : ''
      }`,
    };
  });
}

export function getFunctionSuggestion(fn: FunctionDefinition): ISuggestionItem {
  let detail = fn.description;
  const labels = [];

  if (fn.preview) {
    labels.push(`**[${techPreviewLabel}]**`);
  }

  if (fn.license) {
    labels.push(`**[${fn.license}]**`);
  }

  if (labels.length > 0) {
    detail = `${labels} ${detail}`;
  }
  const fullSignatures = getFunctionSignatures(fn, { capitalize: true, withTypes: true });
  const hasNoArguments = fn.signatures.every((sig) => sig.params.length === 0);

  let text = `${fn.name.toUpperCase()}($0)`;

  if (hasNoArguments) {
    text = `${fn.name.toUpperCase()}()`;
  }

  if (fn.customParametersSnippet) {
    text = `${fn.name.toUpperCase()}(${fn.customParametersSnippet})`;
  }

  // Determine function category explicitly
  let category: SuggestionCategory;
  if (fn.type === FunctionDefinitionTypes.TIME_SERIES_AGG) {
    category = SuggestionCategory.FUNCTION_TIME_SERIES_AGG;
  } else if (fn.type === FunctionDefinitionTypes.AGG) {
    category = SuggestionCategory.FUNCTION_AGG;
  } else {
    category = SuggestionCategory.FUNCTION_SCALAR;
  }

  return {
    label: fn.name.toUpperCase(),
    text,
    asSnippet: true,
    kind: 'Function',
    documentation: {
      value: buildFunctionDocumentation(
        detail,
        fullSignatures.map((sig, index) => ({
          declaration: sig.declaration,
          license:
            !!fn.license || !fn.signatures[index]?.license
              ? ''
              : `[${[fn.signatures[index]?.license]}]`,
        })),
        fn.examples
      ),
    },
    category,
    // Open signature help when function is accepted
    command: {
      id: 'editor.action.triggerParameterHints',
      title: '',
    },
  };
}

const getVariablePrefix = (variableType: ESQLVariableType) =>
  variableType === ESQLVariableType.FIELDS || variableType === ESQLVariableType.FUNCTIONS
    ? '??'
    : '?';

function getColumnSuggestionCategory(
  column: ESQLColumnData,
  fieldIsRecommended: boolean
): SuggestionCategory {
  if (column.userDefined) {
    return SuggestionCategory.USER_DEFINED_COLUMN;
  }

  if (fieldIsRecommended) {
    return SuggestionCategory.RECOMMENDED_FIELD;
  }

  if (column.type === 'date' || column.type === 'date_nanos') {
    return SuggestionCategory.TIME_FIELD;
  }

  if (column.isEcs) {
    return SuggestionCategory.ECS_FIELD;
  }

  return SuggestionCategory.FIELD;
}

export const buildColumnSuggestions = (
  columns: ESQLColumnData[],
  recommendedFieldsFromExtensions: RecommendedField[] = [],
  options?: {
    advanceCursor?: boolean;
    openSuggestions?: boolean;
    addComma?: boolean;
    variableType?: ESQLVariableType;
    supportsControls?: boolean;
    supportsMultiValue?: boolean;
    isFieldsBrowserEnabled?: boolean;
  },
  variables?: ESQLControlVariable[]
): ISuggestionItem[] => {
  const fieldsSuggestions = columns.map((column) => {
    const fieldType = column.type.charAt(0).toUpperCase() + column.type.slice(1);
    const unmmapedSuffix = column.isUnmappedField
      ? i18n.translate('kbn-esql-language.esql.autocomplete.unmappedFieldTypeSuffix', {
          defaultMessage: ' - Unmapped Field',
        })
      : '';

    const titleCaseType = `${column.name} (${fieldType})${unmmapedSuffix}`;

    // Check if the field is in the recommended fields from extensions list
    // and if so, mark it as recommended. This also ensures that recommended fields
    // that are registered wrongly, won't be shown as suggestions.
    const fieldIsRecommended = recommendedFieldsFromExtensions.some(
      (recommendedField) => recommendedField.name === column.name
    );

    const category = getColumnSuggestionCategory(column, fieldIsRecommended);

    const suggestion: ISuggestionItem = {
      label: column.name,
      text:
        getSafeInsertText(column.name) +
        (options?.addComma ? ',' : '') +
        (options?.advanceCursor ? ' ' : ''),
      kind: 'Variable',
      detail: titleCaseType,
      category,
    };

    return options?.openSuggestions ? withAutoSuggest(suggestion) : suggestion;
  });

  const suggestions = [...fieldsSuggestions];
  const variableType = options?.variableType ?? ESQLVariableType.FIELDS;
  const userDefinedColumns = variables?.filter((variable) => variable.type === variableType) ?? [];

  const controlSuggestions = columns.length
    ? getControlSuggestion(
        variableType,
        ControlTriggerSource.SMART_SUGGESTION,
        userDefinedColumns?.map((v) => `${getVariablePrefix(variableType)}${v.key}`),
        Boolean(options?.supportsControls)
      )
    : [];
  suggestions.push(...controlSuggestions);

  if (options?.isFieldsBrowserEnabled) {
    const commandArgs = buildFieldsBrowserCommandArgs({
      fields: columns.map((col) => ({ name: col.name, type: col.type })),
    });
    suggestions.unshift(createFieldsBrowserSuggestion(commandArgs));
  }

  return [...suggestions];
};

/**
 * Given an inline cast data type, return the corresponding function that performs the cast.
 * E.g., for 'integer' or 'int', it returns 'to_integer'.
 *
 * It returns undefined if the inline cast data type is not supported.
 */
export function getFunctionForInlineCast(castingType: InlineCastingType): string | undefined {
  return inlineCastsMapping[castingType];
}

export function isTypeConversionFunction(functionName: string): boolean {
  const lower = functionName.toLowerCase();
  return (
    // TO_TEXT is the only conversion function not covered by inlineCastsMapping (text is not an inline cast type).
    lower === EsqlFunctionNames.TO_TEXT || Object.values<string>(inlineCastsMapping).includes(lower)
  );
}
