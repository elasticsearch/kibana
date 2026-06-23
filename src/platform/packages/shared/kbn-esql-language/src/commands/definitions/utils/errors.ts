/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import type {
  ESQLAstAllCommands,
  ESQLColumn,
  ESQLCommand,
  ESQLFunction,
  ESQLIdentifier,
  ESQLLocation,
  ESQLSource,
} from '@elastic/esql/types';
import type {
  ErrorTypes,
  ErrorValues,
  ESQLMessage,
  FunctionDefinition,
  Signature,
  SupportedDataType,
} from '../types';

function getMessageAndTypeFromId<K extends ErrorTypes>({
  messageId,
  values,
}: {
  messageId: K;
  values: ErrorValues<K>;
}): {
  message: string;
  type?: ESQLMessage['type'];
  underlinedWarning?: ESQLMessage['underlinedWarning'];
} {
  // Use a less strict type instead of doing a typecast on each message type
  const out = values as unknown as Record<string, string>;
  // i18n validation wants to the values prop to be declared inline, so need to unpack and redeclare again all props
  switch (messageId) {
    case 'unknownColumn':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.unknownColumn', {
          defaultMessage: 'Unknown column "{name}"',
          values: { name: out.name },
        }),
      };
    case 'unmappedColumnWarning':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.unmappedColumnWarning', {
          defaultMessage: `"{name}" column isn't mapped in any searched indices.\nIf you are not intentionally referencing an unmapped field,\ncheck that the field exists or that it is spelled correctly in your query.`,
          values: { name: out.name },
        }),
        type: 'warning',
        underlinedWarning: true,
      };
    case 'unknownIndex':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.unknownIndex', {
          defaultMessage: 'Unknown index "{name}"',
          values: { name: out.name },
        }),
      };
    case 'unknownDataSource':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.unknownDataSource', {
          defaultMessage: 'Unknown data source "{name}"',
          values: { name: out.name },
        }),
      };
    case 'unknownCastingType':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.unknownCastingType', {
          defaultMessage: 'Unknown inline cast type "::{castType}"',
          values: { castType: out.castType },
        }),
      };
    case 'invalidInlineCast':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.invalidInlineCast', {
          defaultMessage: 'Cannot cast value of type "{valueType}" to type "{castType}"',
          values: { castType: out.castType, valueType: out.valueType },
        }),
      };
    case 'unknownFunction':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.missingFunction', {
          defaultMessage: 'Unknown function {name}',
          values: { name: out.name.toUpperCase() },
        }),
      };
    case 'unknownSetting':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.unknownSetting', {
          defaultMessage: 'Unknown setting {name}',
          values: { name: out.name },
        }),
      };
    case 'noMatchingCallSignature':
      const signatureList = (out.validSignatures as unknown as string[])
        .map((sig) => `- (${sig})`)
        .join('\n  ');
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.noMatchingCallSignatures', {
          defaultMessage: `Invalid input types for {functionName}.

Received ({argTypes}).

Expected one of:
  {validSignatures}`,
          values: {
            functionName: out.functionName.toUpperCase(),
            argTypes: out.argTypes,
            validSignatures: signatureList,
          },
        }),
      };
    case 'wrongNumberArgsVariadic':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.wrongNumberArgsVariadic', {
          defaultMessage: '{fn} expected {validArgCounts} arguments, but got {actual}.',
          values: {
            fn: out.fn.toUpperCase(),
            validArgCounts: i18n.formatList(
              'disjunction',
              Array.from(out.validArgCounts).map(String)
            ),
            actual: out.actual,
          },
        }),
      };
    case 'wrongNumberArgsExact':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.wrongNumberArgsExact', {
          defaultMessage:
            '{fn} expected {expected, plural, one {one argument} other {{expected} arguments}}, but got {actual}.',
          values: {
            fn: out.fn.toUpperCase(),
            expected: out.expected,
            actual: out.actual,
          },
        }),
      };
    case 'wrongNumberArgsAtLeast':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.wrongNumberArgsAtLeast', {
          defaultMessage:
            '{fn} expected at least {minArgs, plural, one {one argument} other {{minArgs} arguments}}, but got {actual}.',
          values: {
            fn: out.fn.toUpperCase(),
            minArgs: out.minArgs,
            actual: out.actual,
          },
        }),
      };
    case 'unsupportedColumnTypeForCommand':
      return {
        message: i18n.translate(
          'kbn-esql-language.esql.validation.unsupportedColumnTypeForCommand',
          {
            defaultMessage:
              '{command} only supports values of type {type}. Found "{column}" of type {givenType}',
            values: {
              command: out.command.toUpperCase(),
              type: out.type,
              column: out.column,
              givenType: out.givenType,
            },
          }
        ),
      };
    case 'unknownDissectKeyword':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.unknownDissectKeyword', {
          defaultMessage: 'Expected [APPEND_SEPARATOR] in [DISSECT] but found [{keyword}]',
          values: {
            keyword: out.keyword,
          },
        }),
      };
    case 'functionNotAllowedHere':
      return {
        message: i18n.translate(
          'kbn-esql-language.esql.validation.functionNotAvailableInLocation',
          {
            defaultMessage: 'Function {name} not allowed in {locationName}',
            values: {
              locationName: out.locationName.toUpperCase(),
              name: out.name.toUpperCase(),
            },
          }
        ),
      };
    case 'unknownInterval':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.unknownInterval', {
          defaultMessage: `Unexpected time interval qualifier: ''{value}''`,
          values: {
            value: out.value,
          },
        }),
      };
    case 'unknownPolicy':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.unknownPolicy', {
          defaultMessage: 'Unknown policy "{name}"',
          values: {
            name: out.name,
          },
        }),
      };
    case 'nestedAggFunction':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.nestedAggFunction', {
          defaultMessage: 'Aggregation functions cannot be nested. Found {name} in {parentName}.',
          values: {
            parentName: out.parentName.toUpperCase(),
            name: out.name.toUpperCase(),
          },
        }),
      };
    case 'expectedAggregationArgument':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.expectedAggregationArgument', {
          defaultMessage: 'This argument of {parentName} must be an aggregation function.',
          values: {
            parentName: out.parentName.toUpperCase(),
          },
        }),
      };
    case 'unknownAggregateFunction':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.unknowAggregateFunction', {
          defaultMessage:
            'Expected an aggregate function or group but got "{value}" of type {type}',
          values: {
            type: out.type,
            value: out.value,
          },
        }),
      };
    case 'unsupportedFieldType':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.unsupportedFieldType', {
          defaultMessage:
            'Field "{field}" cannot be retrieved, it is unsupported or not indexed; returning null',
          values: {
            field: out.field,
          },
        }),
      };
    case 'columnTypeConflict':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.columnTypeConflict', {
          defaultMessage: 'Column [{columnName}] has conflicting types across indices{typesSuffix}',
          values: {
            columnName: out.columnName,
            // Live validation may know only that a column is conflicted; include exact types when available.
            typesSuffix: out.types ? `: ${out.types}` : '',
          },
        }),
      };
    case 'unsupportedMode':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.unsupportedSettingValue', {
          defaultMessage:
            'Unrecognized value "{value}" for {command}, mode needs to be one of [{expected}]',
          values: {
            expected: out.expected,
            value: out.value,
            command: out.command.toUpperCase(),
          },
        }),
        type: 'error',
      };
    case 'metadataBracketsDeprecation':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.metadataBracketsDeprecation', {
          defaultMessage: "Square brackets '[]' need to be removed from FROM METADATA declaration",
        }),
        type: 'warning',
      };
    case 'unknownMetadataField':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.wrongMetadataArgumentType', {
          defaultMessage:
            'Metadata field "{value}" is not available. Available metadata fields are: [{availableFields}]',
          values: {
            value: out.value,
            availableFields: out.availableFields,
          },
        }),
        type: 'error',
      };
    case 'promqlInvalidParam':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.promqlInvalidParam', {
          defaultMessage: '[PROMQL] {reason}',
          values: { reason: out.reason },
        }),
        type: 'error',
      };
    case 'promqlMutuallyExclusiveParams':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.promqlMutuallyExclusiveParams', {
          defaultMessage: '[PROMQL] Parameters "{param1}" and "{param2}" are mutually exclusive',
          values: { param1: out.param1, param2: out.param2 },
        }),
        type: 'error',
      };
    case 'promqlMissingQuery':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.promqlMissingQuery', {
          defaultMessage: '[PROMQL] Missing query',
        }),
        type: 'error',
      };
    case 'promqlUnknownFunction':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.promqlUnknownFunction', {
          defaultMessage: '[PROMQL] Unknown function "{fn}"',
          values: { fn: out.fn },
        }),
        type: 'error',
      };
    case 'promqlWrongNumberArgs':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.promqlWrongNumberArgs', {
          defaultMessage:
            '[PROMQL] Wrong number of arguments for "{fn}". Expected {expected}, got {actual}',
          values: { fn: out.fn, expected: out.expected, actual: out.actual },
        }),
        type: 'error',
      };
    case 'promqlGroupingNotAllowed':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.promqlGroupingNotAllowed', {
          defaultMessage: '[PROMQL] Grouping is only allowed on aggregation',
        }),
        type: 'error',
      };
    case 'promqlNoMatchingSignature':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.promqlNoMatchingSignature', {
          defaultMessage: '[PROMQL] Argument types require ({required}) for function "{fn}"',
          values: { fn: out.fn, required: out.required },
        }),
        type: 'error',
      };
    case 'wrongDissectOptionArgumentType':
      return {
        message: i18n.translate(
          'kbn-esql-language.esql.validation.wrongDissectOptionArgumentType',
          {
            defaultMessage:
              'Invalid value for DISSECT APPEND_SEPARATOR: expected a string, but was [{value}]',
            values: {
              value: out.value,
            },
          }
        ),
        type: 'error',
      };
    case 'invalidJoinIndex':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.invalidJoinIndex', {
          defaultMessage:
            '"{identifier}" is not a valid JOIN index. Please use a "lookup" mode index.',
          values: { identifier: out.identifier },
        }),
      };
    case 'joinOnSingleExpression':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.joinOnSingleExpression', {
          defaultMessage:
            'JOIN ON clause must be a comma separated list of fields or a single expression',
        }),
        type: 'error',
      };
    case 'tooManyForks':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.tooManyForks', {
          defaultMessage: '[FORK] a query cannot have more than one FORK command.',
        }),
      };
    case 'licenseRequired':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.licenseRequired', {
          defaultMessage: '{name} requires a {requiredLicense} license.',
          values: {
            name: out.name.toUpperCase(),
            requiredLicense: out.requiredLicense.toUpperCase(),
          },
        }),
      };
    case 'licenseRequiredForSignature':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.licenseRequiredForSignature', {
          defaultMessage:
            '{name} with {signatureDescription} requires a {requiredLicense} license.',
          values: {
            name: out.name.toUpperCase(),
            signatureDescription: out.signatureDescription,
            requiredLicense: out.requiredLicense.toUpperCase(),
          },
        }),
      };
    case 'changePointWrongFieldType':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.changePointWrongFieldType', {
          defaultMessage:
            'CHANGE_POINT only supports numeric values, found "{columnName}" of type {givenType}',
          values: {
            columnName: out.columnName,
            givenType: out.givenType,
          },
        }),
        type: 'error',
      };
    case 'dropTimestampWarning':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.dropTimestampWarning', {
          defaultMessage: 'Dropping "@timestamp" prevents the time range from being applied.',
        }),
        type: 'warning',
      };

    case 'inferenceIdRequired':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.inferenceIdRequired', {
          defaultMessage: '"inference_id" parameter is required for {command}.',
          values: { command: out.command.toUpperCase() },
        }),
        type: 'error',
      };

    case 'unsupportedQueryType':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.unsupportedQueryType', {
          defaultMessage: '{command} query must be of type text. Found {expressionType}',
          values: { command: out.command.toUpperCase(), expressionType: out.expressionType },
        }),
        type: 'error',
      };
    case 'forkTooManyBranches':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.forkTooManyBranches', {
          defaultMessage: '[FORK] Supports a maximum of 8 branches.',
        }),
        type: 'error',
      };
    case 'forkNotAllowedWithSubqueries':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.forkNotAllowedWithSubqueries', {
          defaultMessage: '[FORK] Command is not allowed inside a subquery.',
        }),
        type: 'error',
      };
    case 'invalidSettingValue':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.invalidSettingValue', {
          defaultMessage: 'Invalid value "{value}" for setting "{setting}".',
          values: {
            value: out.value,
            setting: out.setting,
          },
        }),
        type: 'error',
      };
    case 'unknownMapParameterName':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.unknownMapParameterName', {
          defaultMessage: 'Unknown parameter "{paramName}".',
          values: { paramName: out.paramName },
        }),
        type: 'error',
      };
    case 'invalidMapParameterValueType':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.invalidMapParameterValueType', {
          defaultMessage:
            'Invalid type for parameter "{paramName}". Expected type: {expectedType}. Received: {actualType}.',
          values: {
            paramName: out.paramName,
            expectedType: out.expectedType,
            actualType: out.actualType,
          },
        }),
        type: 'error',
      };
    case 'mmrQueryVectorWrongType':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.mmrQueryVectorWrongType', {
          defaultMessage: '[MMR] Query vector must be of type dense_vector. Found {type}',
          values: { type: out.type },
        }),
        type: 'error',
      };
    case 'mmrOnFieldWrongType':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.mmrOnFieldWrongType', {
          defaultMessage: '[MMR] ON field must be of type dense_vector. Found {type}',
          values: { type: out.type },
        }),
        type: 'error',
      };
    case 'tsdbIncompatibleFunction':
      return {
        message: i18n.translate('kbn-esql-language.esql.validation.tsdbIncompatibleFunction', {
          defaultMessage: 'Function {fnName} is not supported in time series (TS) pipelines',
          values: { fnName: out.fnName.toUpperCase() },
        }),
      };
  }
  return { message: '' };
}

export function getMessageFromId<K extends ErrorTypes>({
  locations,
  ...payload
}: {
  messageId: K;
  values: ErrorValues<K>;
  locations: ESQLLocation;
}): ESQLMessage {
  const { message, type = 'error', underlinedWarning } = getMessageAndTypeFromId(payload);
  return createMessage(type, message, locations, payload.messageId, underlinedWarning);
}

export function createMessage(
  type: ESQLMessage['type'],
  message: string,
  location: ESQLMessage['location'],
  messageId: string,
  underlinedWarning?: ESQLMessage['underlinedWarning']
): ESQLMessage {
  return {
    type,
    text: message,
    location,
    code: messageId,
    underlinedWarning,
  };
}

const createError = (messageId: string, location: ESQLLocation, message: string = '') =>
  createMessage('error', message, location, messageId);

/**
 * Tags an error as semantic, indicating it requires runtime data to validate.
 *
 * Semantic errors depend on external data (indices, columns, policies) that can only
 * be determined at runtime. When the required callback is not available, these errors
 * will be filtered out during validation to avoid false positives.
 *
 * This is the core mechanism of the Error Tagging system, which eliminates the need
 * for manual maintenance of error-to-callback mappings.
 *
 * @param error - The base error message to tag
 * @param requiresCallback - The name of the callback required to validate this error
 *                          Common values: 'getColumnsFor', 'getSources', 'getPolicies', 'getJoinIndices'
 * @returns The error with semantic metadata attached
 *
 * @example
 * ```typescript
 * // Error that requires column information
 * unknownColumn: (column) =>
 *   tagSemanticError(
 *     errors.byId('unknownColumn', column.location, { name: column.name }),
 *     'getColumnsFor'  // Will be filtered if getColumnsFor callback is missing
 *   )
 * ```
 */
export function tagSemanticError(error: ESQLMessage, requiresCallback: string): ESQLMessage {
  return { ...error, errorType: 'semantic', requiresCallback };
}

const withWarningSeverity = (message: ESQLMessage, shouldWarn: boolean): ESQLMessage =>
  shouldWarn ? { ...message, type: 'warning', underlinedWarning: true } : message;

export const errors = {
  unexpected: (
    location: ESQLLocation,
    message: string = i18n.translate(
      'kbn-esql-language.esql.validation.errors.unexpected.message',
      {
        defaultMessage: 'Unexpected error, this should never happen.',
      }
    )
  ): ESQLMessage => {
    return createError('unexpected', location, message);
  },

  byId: <K extends ErrorTypes>(
    id: K,
    location: ESQLLocation,
    values: ErrorValues<K>
  ): ESQLMessage =>
    getMessageFromId({
      messageId: id,
      values,
      locations: location,
    }),

  unknownFunction: (fn: ESQLFunction): ESQLMessage =>
    errors.byId('unknownFunction', fn.location, fn),

  unknownColumn: (column: ESQLColumn | ESQLIdentifier): ESQLMessage =>
    tagSemanticError(
      errors.byId('unknownColumn', column.location, { name: column.name }),
      'getColumnsFor'
    ),

  unmappedColumnWarning: (column: ESQLColumn | ESQLIdentifier): ESQLMessage =>
    tagSemanticError(
      errors.byId('unmappedColumnWarning', column.location, { name: column.name }),
      'getColumnsFor'
    ),

  unknownIndex: (source: ESQLSource): ESQLMessage =>
    tagSemanticError(
      errors.byId('unknownIndex', source.location, { name: source.name }),
      'getSources'
    ),

  unknownDataSource: (source: ESQLSource): ESQLMessage =>
    tagSemanticError(
      errors.byId('unknownDataSource', source.location, { name: source.name }),
      'getSources'
    ),

  unknownPolicy: (policyName: string, location: ESQLLocation): ESQLMessage =>
    tagSemanticError(errors.byId('unknownPolicy', location, { name: policyName }), 'getPolicies'),

  unknownCastingType: (castType: string, location: ESQLLocation): ESQLMessage =>
    errors.byId('unknownCastingType', location, { castType }),

  invalidInlineCast: (castType: string, valueType: string, location: ESQLLocation): ESQLMessage =>
    errors.byId('invalidInlineCast', location, { castType, valueType }),

  tooManyForks: (command: ESQLCommand): ESQLMessage =>
    errors.byId('tooManyForks', command.location, {}),

  nestedAggFunction: (fn: ESQLFunction, parentName: string): ESQLMessage =>
    errors.byId('nestedAggFunction', fn.location, {
      name: fn.name,
      parentName,
    }),

  expectedAggregationArgument: (
    parentFn: ESQLFunction,
    location: ESQLLocation = parentFn.location
  ): ESQLMessage =>
    errors.byId('expectedAggregationArgument', location, {
      parentName: parentFn.name,
    }),

  unknownAggFunction: (
    node: ESQLColumn | ESQLIdentifier,
    type: string = 'FieldAttribute'
  ): ESQLMessage =>
    errors.byId('unknownAggregateFunction', node.location, {
      value: node.name,
      type,
    }),

  invalidJoinIndex: (identifier: ESQLSource): ESQLMessage =>
    tagSemanticError(
      errors.byId('invalidJoinIndex', identifier.location, { identifier: identifier.name }),
      'getJoinIndices'
    ),

  joinOnSingleExpression: (location: ESQLLocation): ESQLMessage =>
    errors.byId('joinOnSingleExpression', location, {}),

  noMatchingCallSignature: (
    fn: ESQLFunction,
    definition: FunctionDefinition,
    argTypes: string[]
  ): ESQLMessage => {
    const validSignatures = definition.signatures
      .toSorted((a, b) => a.params.length - b.params.length)
      .map((sig) => {
        const definitionArgTypes = buildSignatureTypes(sig);
        return `${definitionArgTypes}`;
      });

    return tagSemanticError(
      errors.byId('noMatchingCallSignature', fn.location, {
        functionName: fn.name,
        argTypes: argTypes.join(', '),
        validSignatures,
      }),
      'getColumnsFor'
    );
  },

  licenseRequired: (fn: ESQLFunction, license: string): ESQLMessage =>
    errors.byId('licenseRequired', fn.location, {
      name: fn.name,
      requiredLicense: license,
    }),

  licenseRequiredForSignature: (fn: ESQLFunction, signature: Signature): ESQLMessage => {
    const signatureDescription = signature.params
      .map((param) => `'${param.name}' of type '${param.type}'`) // TODO this isn't well i18n'd
      .join(', ');

    return errors.byId('licenseRequiredForSignature', fn.location, {
      name: fn.name,
      signatureDescription,
      requiredLicense: signature.license!,
    });
  },

  functionNotAllowedHere: (fn: ESQLFunction, locationName: string): ESQLMessage =>
    errors.byId('functionNotAllowedHere', fn.location, {
      name: fn.name,
      locationName,
    }),

  tsdbIncompatibleFunction: (fn: ESQLFunction): ESQLMessage =>
    errors.byId('tsdbIncompatibleFunction', fn.location, { fnName: fn.name }),

  wrongNumberArgs: (fn: ESQLFunction, definition: FunctionDefinition): ESQLMessage => {
    const validArgCounts = new Set<number>();
    let minParams: number | undefined;
    for (const sig of definition.signatures) {
      if (sig.minParams) {
        minParams = sig.minParams;
        break;
      }

      validArgCounts.add(sig.params.length);
      validArgCounts.add(sig.params.filter((p) => !p.optional).length);
    }

    const arity = fn.args.length;
    if (minParams !== undefined) {
      return errors.byId('wrongNumberArgsAtLeast', fn.location, {
        fn: fn.name,
        minArgs: minParams,
        actual: arity,
      });
    } else if (validArgCounts.size === 1) {
      const expected = Array.from(validArgCounts)[0];
      return errors.byId('wrongNumberArgsExact', fn.location, {
        fn: fn.name,
        expected,
        actual: fn.args.length,
      });
    } else {
      return errors.byId('wrongNumberArgsVariadic', fn.location, {
        fn: fn.name,
        validArgCounts: Array.from(validArgCounts),
        actual: arity,
      });
    }
  },

  changePointWrongFieldType: (
    { location, name }: ESQLColumn,
    type: SupportedDataType | 'unknown'
  ): ESQLMessage =>
    errors.byId('changePointWrongFieldType', location, {
      columnName: name,
      givenType: type,
    }),

  unsupportedFieldType: (
    column: ESQLColumn | ESQLIdentifier,
    field: string,
    shouldWarn = false
  ): ESQLMessage =>
    tagSemanticError(
      withWarningSeverity(
        errors.byId('unsupportedFieldType', column.location, { field }),
        shouldWarn
      ),
      'getColumnsFor'
    ),

  columnTypeConflict: (
    column: ESQLColumn | ESQLIdentifier,
    columnName: string,
    types: string[],
    shouldWarn = false
  ): ESQLMessage =>
    tagSemanticError(
      withWarningSeverity(
        {
          ...errors.byId('columnTypeConflict', column.location, {
            columnName,
            types: types.map((type) => `[${type}]`).join(', '),
          }),
          data: {
            columnName,
            types,
          },
        },
        shouldWarn
      ),
      'getColumnsFor'
    ),

  dropTimestampWarning: ({ location }: ESQLColumn): ESQLMessage =>
    errors.byId('dropTimestampWarning', location, {}),

  forkTooManyBranches: (command: ESQLAstAllCommands): ESQLMessage =>
    errors.byId('forkTooManyBranches', command.location, {}),

  forkNotAllowedWithSubqueries: (command: ESQLAstAllCommands): ESQLMessage =>
    errors.byId('forkNotAllowedWithSubqueries', command.location, {}),
};

export const buildSignatureTypes = (sig: Signature) =>
  sig.params
    .map((param) => {
      let ret = param.type as string;
      if (sig.minParams) {
        ret = '...' + ret;
      }
      if (param.optional) {
        ret = `[${ret}]`;
      }
      return ret;
    })
    .join(', ');
