/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import type { FunctionDefinition, FunctionParameter } from '@kbn/esql-language';
import { FunctionDefinitionTypes } from '@kbn/esql-language';
import {
  defaultScalarFunctionLocations,
  dateDiffSuggestions,
  dateExtractOptions,
} from './constants';

export const excludedFunctions = new Set(['case', 'cast']);

export const extraFunctions: FunctionDefinition[] = [
  {
    type: FunctionDefinitionTypes.SCALAR,
    name: 'case',
    description:
      'Accepts pairs of conditions and values. The function returns the value that belongs to the first condition that evaluates to `true`. If the number of arguments is odd, the last argument is the default value which is returned when no condition matches.',
    locationsAvailable: defaultScalarFunctionLocations,
    signatures: [
      {
        params: [
          { name: 'condition', type: 'boolean' },
          { name: 'value', type: 'any' },
        ],
        minParams: 2,
        returnType: 'unknown',
        isSignatureRepeating: true,
      },
    ],
    examples: [
      `from index | eval type = case(languages <= 1, "monolingual", languages <= 2, "bilingual", "polyglot")`,
    ],
  },
];

/**
 * Generic function to enrich function parameters based on parameter names
 * @param functionDefinition - The function definition to enrich
 * @param parameterName - Name of the parameter to enrich (e.g., 'order', 'limit', 'precision')
 * @param enrichments - Enrichment configuration to apply
 * @returns Enriched function definition
 */
export function enrichFunctionSignatures(
  functionDefinition: FunctionDefinition,
  parameterName: string,
  enrichments: Partial<FunctionParameter>
): FunctionDefinition {
  if (!functionDefinition.signatures) return functionDefinition;

  const enrichedSignatures = functionDefinition.signatures.map((signature) => {
    if (!signature.params) return signature;

    const enrichedParams = signature.params.map((param) => {
      if (param.name === parameterName) {
        return {
          ...param,
          ...enrichments,
        };
      }
      return param;
    });

    return {
      ...signature,
      params: enrichedParams,
    };
  });

  return {
    ...functionDefinition,
    signatures: enrichedSignatures,
  };
}

/**
 * Applies function-specific parameter enrichments to ES|QL function definitions.
 *
 * @param functionDefinition - The ES|QL function definition to enrich
 * @returns The enriched function definition with parameter-specific enhancements
 *
 * @remarks
 * Currently supports enrichments for:
 * - `date_diff`: Marks 'unit' as a constant restricted to dateDiffSuggestions (ES parity pending)
 * - `date_extract`: Marks 'datePart' as a constant restricted to dateExtractOptions (ES parity pending)
 * - `round`: Marks 'decimals' as a constant (ES parity pending)
 * - `mv_contains`: Marks 'superset' as supporting multiple values
 * - `qstr`: Adds custom parameter snippet for triple-quoted strings
 * - `kql`: Adds custom parameter snippet for triple-quoted strings
 */
export function enrichFunctionParameters(functionDefinition: FunctionDefinition) {
  if (functionDefinition.name === 'date_diff') {
    return enrichFunctionSignatures(functionDefinition, 'unit', {
      hint: { kind: 'constant', allowedValues: dateDiffSuggestions },
    });
  }

  if (functionDefinition.name === 'date_extract') {
    return enrichFunctionSignatures(functionDefinition, 'datePart', {
      hint: { kind: 'constant', allowedValues: dateExtractOptions },
    });
  }

  if (functionDefinition.name === 'round') {
    return enrichFunctionSignatures(functionDefinition, 'decimals', {
      hint: { kind: 'constant' },
    });
  }

  if (functionDefinition.name === 'mv_contains') {
    return enrichFunctionSignatures(functionDefinition, 'superset', {
      supportsMultiValues: true,
    });
  }

  if (functionDefinition.name === 'qstr') {
    return {
      ...functionDefinition,
      customParametersSnippet: `"""$0"""`,
    };
  }

  if (functionDefinition.name === 'kql') {
    return {
      ...functionDefinition,
      customParametersSnippet: `"""$0"""`,
    };
  }

  return functionDefinition;
}
