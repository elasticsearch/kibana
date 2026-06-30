/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getFlattenedObject } from '@kbn/std';
import { i18n } from '@kbn/i18n';
import { keyBy } from 'lodash';

import type {
  NewPackagePolicy,
  PackagePolicyInput,
  PackagePolicyInputStream,
  PackagePolicyConfigRecordEntry,
  PackageInfo,
  RegistryStream,
  RegistryVarsEntry,
  RegistryRequiredVars,
  NewPackagePolicyInputStream,
  RegistryVarGroup,
} from '../types';

import { DATASET_VAR_NAME, DATA_STREAM_TYPE_VAR_NAME } from '../constants';

import {
  isValidNamespace,
  doesPackageHaveIntegrations,
  getNormalizedInputs,
  getNormalizedDataStreams,
  getInputEffectiveName,
  buildInputKey,
} from '.';
import { packageHasNoPolicyTemplates } from './policy_template';
import { isValidDataset, isValidDataStreamType } from './is_valid_namespace';

type Errors = string[] | null;

export interface ValidatePackagePolicyDeps {
  safeLoadYaml: (yaml: string) => any;
  conditionValidator?: (expr?: string) => Array<{ line: number; column: number; message: string }>;
}

interface DurationParseResult {
  isValid: boolean;
  valueNs: number; // in nanoseconds
  errors: string[];
}

/**
 * Parses a duration string into nanoseconds and validates the format.
 * Valid time units are "ms", "s", "m", "h".
 *
 * @param durationStr - The duration string to parse (e.g., "1h30m45s")
 * @returns An object with parsing results
 */
export const parseDuration = (durationStr: string): DurationParseResult => {
  const result: DurationParseResult = {
    isValid: true,
    valueNs: 0,
    errors: [],
  };

  if (!durationStr || typeof durationStr !== 'string' || durationStr.trim() === '') {
    result.isValid = false;
    result.errors.push(
      i18n.translate('xpack.fleet.packagePolicyValidation.emptyDurationErrorMessage', {
        defaultMessage: 'Duration cannot be empty',
      })
    );
    return result;
  }

  // Regular expression to match duration components.
  const durationRegex = /(\d+)(ms|s|m|h)/g;
  const matches = [...durationStr.matchAll(durationRegex)];

  if (matches.length === 0) {
    result.isValid = false;
    result.errors.push(
      i18n.translate('xpack.fleet.packagePolicyValidation.invalidDurationFormatErrorMessage', {
        defaultMessage: 'Invalid duration format. Expected format like "1h30m45s"',
      })
    );
    return result;
  }

  // Check if the entire string is matched
  const fullMatch = matches.reduce((acc, match) => acc + match[0], '');
  if (fullMatch !== durationStr) {
    result.isValid = false;
    result.errors.push(
      i18n.translate('xpack.fleet.packagePolicyValidation.invalidDurationCharactersErrorMessage', {
        defaultMessage: 'Duration contains invalid characters',
      })
    );
  }

  const NANOSECONDS_PER_MS = 1_000_000;
  const NANOSECONDS_PER_SECOND = 1_000_000_000;
  const NANOSECONDS_PER_MINUTE = 60 * NANOSECONDS_PER_SECOND;
  const NANOSECONDS_PER_HOUR = 60 * NANOSECONDS_PER_MINUTE;

  // Calculate the total duration in nanoseconds
  let totalNs = 0;
  for (const match of matches) {
    const value = parseFloat(match[1]);
    const unit = match[2];

    switch (unit) {
      case 'h':
        totalNs += value * NANOSECONDS_PER_HOUR;
        break;
      case 'm':
        totalNs += value * NANOSECONDS_PER_MINUTE;
        break;
      case 's':
        totalNs += value * NANOSECONDS_PER_SECOND;
        break;
      case 'ms':
        totalNs += value * NANOSECONDS_PER_MS;
        break;
    }
  }

  result.valueNs = totalNs;
  return result;
};

type ValidationEntry = Record<string, Errors>;
interface ValidationRequiredVarsEntry {
  name: string;
  invalid: boolean;
}
type ValidationRequiredVars = Record<string, ValidationRequiredVarsEntry[]>;

export interface PackagePolicyConfigValidationResults {
  required_vars?: ValidationRequiredVars | null;
  vars?: ValidationEntry;
  condition?: Errors;
}

export type PackagePolicyInputValidationResults = PackagePolicyConfigValidationResults & {
  streams?: Record<PackagePolicyInputStream['id'], PackagePolicyConfigValidationResults>;
};

export type PackagePolicyValidationResults = {
  name: Errors;
  description: Errors;
  namespace: Errors;
  additional_datastreams_permissions: Errors;
  condition: Errors;
  inputs: Record<PackagePolicyInput['type'], PackagePolicyInputValidationResults> | null;
} & PackagePolicyConfigValidationResults;

const validateCondition = (
  expr: string | null | undefined,
  conditionValidator: ValidatePackagePolicyDeps['conditionValidator']
): Errors => {
  if (!conditionValidator) return null;
  const errors = conditionValidator(expr ?? undefined);
  if (!errors.length) return null;
  return errors.map(({ line, column, message }) =>
    i18n.translate('xpack.fleet.packagePolicyValidation.conditionSyntaxErrorMessage', {
      defaultMessage: 'Line {line}, column {col}: {message}',
      values: { line, col: column + 1, message },
    })
  );
};

const validatePackageRequiredVars = (
  streamOrInput: Pick<NewPackagePolicyInputStream | PackagePolicyInput, 'vars' | 'enabled'>,
  requiredVars?: RegistryRequiredVars
) => {
  const evaluatedRequiredVars: ValidationRequiredVars = {};

  if (!requiredVars || !streamOrInput.vars || !streamOrInput.enabled) {
    return null;
  }

  let hasMetRequiredCriteria = false;

  for (const [requiredVarDefinitionName, requiredVarDefinitionConstraints] of Object.entries(
    requiredVars
  )) {
    evaluatedRequiredVars[requiredVarDefinitionName] =
      requiredVarDefinitionConstraints?.map((constraint) => {
        return {
          name: constraint.name,
          invalid: true,
        };
      }) || [];

    if (evaluatedRequiredVars[requiredVarDefinitionName]) {
      requiredVarDefinitionConstraints.forEach((requiredCondition) => {
        if (streamOrInput.vars && streamOrInput.vars[requiredCondition.name]) {
          const varItem = streamOrInput.vars[requiredCondition.name];

          if (varItem) {
            if (
              (!requiredCondition.value && varItem.value) ||
              (requiredCondition.value &&
                varItem.value &&
                requiredCondition.value === varItem.value)
            ) {
              evaluatedRequiredVars[requiredVarDefinitionName] = evaluatedRequiredVars[
                requiredVarDefinitionName
              ].filter((item) => item.name !== requiredCondition.name);
            }
          }
        }
      });
    }

    if (evaluatedRequiredVars[requiredVarDefinitionName]?.length === 0) {
      hasMetRequiredCriteria = true;
    }
  }

  return hasMetRequiredCriteria ? null : evaluatedRequiredVars;
};

/**
 * Get all variable names that are controlled by any var_group.
 */
const getVarsControlledByVarGroups = (varGroups: RegistryVarGroup[]): Set<string> => {
  return new Set(varGroups.flatMap((group) => group.options.flatMap((option) => option.vars)));
};

/**
 * Determines if a variable should be validated based on var_group selections.
 * Returns false if the var is controlled by a var_group but not in the selected option.
 */
const shouldValidateVar = (
  varName: string,
  varGroups: RegistryVarGroup[] | undefined,
  varGroupSelections: Record<string, string> | undefined
): boolean => {
  if (!varGroups || varGroups.length === 0) {
    return true; // No var_groups, validate all vars
  }

  const controlledVars = getVarsControlledByVarGroups(varGroups);

  // If this var is not controlled by any var_group, always validate it
  if (!controlledVars.has(varName)) {
    return true;
  }

  // Check if this var is in the selected option for any var_group
  for (const group of varGroups) {
    const selectedOptionName = varGroupSelections?.[group.name];
    if (!selectedOptionName) continue;

    const selectedOption = group.options.find((opt) => opt.name === selectedOptionName);
    if (selectedOption?.vars.includes(varName)) {
      return true;
    }
  }

  return false;
};

/**
 * Determines if a variable should be treated as required based on var_group settings.
 * When var_group.required is true, all vars in the selected option are required.
 */
const isVarRequiredByVarGroup = (
  varName: string,
  varGroups: RegistryVarGroup[] | undefined,
  varGroupSelections: Record<string, string> | undefined
): boolean => {
  if (!varGroups || varGroups.length === 0) {
    return false;
  }

  for (const group of varGroups) {
    if (!group.required) continue;

    const selectedOptionName = varGroupSelections?.[group.name];
    if (!selectedOptionName) continue;

    const selectedOption = group.options.find((opt) => opt.name === selectedOptionName);
    if (selectedOption?.vars.includes(varName)) {
      return true;
    }
  }

  return false;
};

const VALIDATE_DATASTREAMS_PERMISSION_REGEX =
  /^(logs)|(metrics)|(traces)|(synthetics)|(profiles)-(.*)$/;

/*
 * Returns validation information for a given package policy and package info
 * Note: this method assumes that `packagePolicy` is correctly structured for the given package
 */
export const validatePackagePolicy = (
  packagePolicy: NewPackagePolicy,
  packageInfo: PackageInfo,
  deps: ValidatePackagePolicyDeps,
  spaceSettings?: { allowedNamespacePrefixes?: string[] }
): PackagePolicyValidationResults => {
  const { safeLoadYaml, conditionValidator } = deps;
  const hasIntegrations = doesPackageHaveIntegrations(packageInfo);
  const validationResults: PackagePolicyValidationResults = {
    name: null,
    description: null,
    namespace: null,
    additional_datastreams_permissions: null,
    condition: null,
    inputs: {},
    vars: {},
  };
  if (!packagePolicy.name.trim()) {
    validationResults.name = [
      i18n.translate('xpack.fleet.packagePolicyValidation.nameRequiredErrorMessage', {
        defaultMessage: 'Name is required',
      }),
    ];
  }

  if (packagePolicy?.namespace) {
    const namespaceValidation = isValidNamespace(
      packagePolicy?.namespace,
      true,
      spaceSettings?.allowedNamespacePrefixes
    );
    if (!namespaceValidation.valid && namespaceValidation.error) {
      validationResults.namespace = [namespaceValidation.error];
    }
  }

  if (packagePolicy?.additional_datastreams_permissions) {
    validationResults.additional_datastreams_permissions =
      packagePolicy?.additional_datastreams_permissions.reduce<null | string[]>(
        (acc, additionalDatastreamsPermission) => {
          if (!additionalDatastreamsPermission.match(VALIDATE_DATASTREAMS_PERMISSION_REGEX)) {
            if (!acc) {
              acc = [];
            }
            acc.push(
              `${additionalDatastreamsPermission} is not valid, should match ${VALIDATE_DATASTREAMS_PERMISSION_REGEX.toString()}`
            );
          }
          return acc;
        },
        null
      );
  }

  validationResults.condition = validateCondition(packagePolicy.condition, conditionValidator);

  // Validate package-level vars
  const packageVarsByName = keyBy(packageInfo.vars || [], 'name');
  const packageVars = Object.entries(packagePolicy.vars || {});
  const packageVarGroups = packageInfo.var_groups;
  const packageVarGroupSelections = packagePolicy.var_group_selections;

  if (packageVars.length) {
    validationResults.vars = packageVars.reduce((results, [name, varEntry]) => {
      // Skip validation for vars that are controlled by var_groups but not currently visible
      if (!shouldValidateVar(name, packageVarGroups, packageVarGroupSelections)) {
        results[name] = null;
        return results;
      }

      // Check if var is required due to var_group.required
      const requiredByVarGroup = isVarRequiredByVarGroup(
        name,
        packageVarGroups,
        packageVarGroupSelections
      );

      results[name] = validatePackagePolicyConfig(
        varEntry,
        packageVarsByName[name],
        name,
        safeLoadYaml,
        undefined,
        requiredByVarGroup
      );
      return results;
    }, {} as ValidationEntry);
  }

  if (!packageInfo?.policy_templates?.length || packageHasNoPolicyTemplates(packageInfo)) {
    validationResults.inputs = {};
    return validationResults;
  }

  // Build cache for fast var definition lookup
  const inputVarDefsByPolicyTemplateAndType = packageInfo.policy_templates.reduce<
    Record<string, Record<string, RegistryVarsEntry>>
  >((varDefs, policyTemplate) => {
    const inputs = getNormalizedInputs(policyTemplate);
    inputs.forEach((input) => {
      const varDefKey = buildInputKey(
        getInputEffectiveName(input),
        policyTemplate.name,
        hasIntegrations
      );

      if ((input.vars || []).length) {
        varDefs[varDefKey] = keyBy(input.vars || [], 'name');
      }
    });
    return varDefs;
  }, {});
  const inputRequiredVarsDefsByPolicyTemplateAndType = packageInfo.policy_templates.reduce<
    Record<string, RegistryRequiredVars | undefined>
  >((reqVarDefs, policyTemplate) => {
    const inputs = getNormalizedInputs(policyTemplate);
    inputs.forEach((input) => {
      const requiredVarDefKey = buildInputKey(
        getInputEffectiveName(input),
        policyTemplate.name,
        hasIntegrations
      );

      if ((input.vars || []).length) {
        reqVarDefs[requiredVarDefKey] = input.required_vars;
      }
    });
    return reqVarDefs;
  }, {});

  const dataStreams = getNormalizedDataStreams(packageInfo);
  const streamsByDatasetAndInput = dataStreams.reduce<Record<string, RegistryStream>>(
    (streams, dataStream) => {
      dataStream.streams?.forEach((stream) => {
        streams[`${dataStream.dataset}-${stream.input}`] = stream;
      });
      return streams;
    },
    {}
  );
  const streamVarDefsByDatasetAndInput = Object.entries(streamsByDatasetAndInput).reduce<
    Record<string, Record<string, RegistryVarsEntry>>
  >((varDefs, [path, stream]) => {
    varDefs[path] = keyBy(stream.vars || [], 'name');
    return varDefs;
  }, {});

  const streamRequiredVarsDefsByDataAndInput = Object.entries(streamsByDatasetAndInput).reduce<
    Record<string, RegistryRequiredVars | undefined>
  >((reqVarDefs, [path, stream]) => {
    reqVarDefs[path] = stream.required_vars;
    return reqVarDefs;
  }, {});

  // Build cache for stream-level var_groups
  const streamVarGroupsByDatasetAndInput = Object.entries(streamsByDatasetAndInput).reduce<
    Record<string, RegistryVarGroup[] | undefined>
  >((varGroupDefs, [path, stream]) => {
    varGroupDefs[path] = stream.var_groups;
    return varGroupDefs;
  }, {});

  // Validate each package policy input with either its own var fields and stream vars
  (packagePolicy.inputs ?? []).forEach((input) => {
    if (!input.vars && !input.streams) {
      return;
    }
    const inputKey = buildInputKey(
      getInputEffectiveName(input),
      input.policy_template,
      hasIntegrations
    );
    const inputValidationResults: PackagePolicyInputValidationResults = {
      vars: undefined,
      required_vars: undefined,
      streams: {},
    };

    // Validate input-level var fields
    const inputVars = Object.entries(input.vars || {});
    if (inputVars.length) {
      inputValidationResults.vars = inputVars.reduce((results, [name, configEntry]) => {
        results[name] = input.enabled
          ? validatePackagePolicyConfig(
              configEntry,
              (inputVarDefsByPolicyTemplateAndType[inputKey] ?? {})[name],
              name,
              safeLoadYaml
            )
          : null;
        return results;
      }, {} as ValidationEntry);

      const requiredVars =
        input.enabled &&
        validatePackageRequiredVars(input, inputRequiredVarsDefsByPolicyTemplateAndType[inputKey]);
      if (requiredVars) {
        inputValidationResults.required_vars = requiredVars;
      } else {
        delete inputValidationResults.required_vars;
      }
    } else {
      delete inputValidationResults.vars;
      delete inputValidationResults.required_vars;
    }

    const inputConditionErrors = validateCondition(input.condition, conditionValidator);
    if (inputConditionErrors !== null) {
      inputValidationResults.condition = inputConditionErrors;
    }

    // Validate each input stream with var definitions
    if (input.streams.length) {
      input.streams.forEach((stream) => {
        const streamValidationResults: PackagePolicyConfigValidationResults = {};
        const streamKey = `${stream.data_stream.dataset}-${getInputEffectiveName(input)}`;

        const streamVarDefs = streamVarDefsByDatasetAndInput[streamKey];
        const streamVarGroups = streamVarGroupsByDatasetAndInput[streamKey];
        const streamVarGroupSelections = stream.var_group_selections;

        if (streamVarDefs && Object.keys(streamVarDefs).length) {
          streamValidationResults.vars = Object.keys(streamVarDefs).reduce((results, name) => {
            const configEntry = stream?.vars?.[name];

            // Skip validation for vars not visible due to var_group selections
            if (!shouldValidateVar(name, streamVarGroups, streamVarGroupSelections)) {
              results[name] = null;
              return results;
            }

            // Check if var is required due to var_group.required
            const requiredByVarGroup = isVarRequiredByVarGroup(
              name,
              streamVarGroups,
              streamVarGroupSelections
            );

            results[name] =
              input.enabled && stream.enabled
                ? validatePackagePolicyConfig(
                    configEntry,
                    streamVarDefs[name],
                    name,
                    safeLoadYaml,
                    packageInfo.type,
                    requiredByVarGroup
                  )
                : null;

            return results;
          }, {} as ValidationEntry);
        }

        if (stream.vars && stream.enabled) {
          const requiredVars = validatePackageRequiredVars(
            stream,
            streamRequiredVarsDefsByDataAndInput[streamKey]
          );
          if (requiredVars) {
            streamValidationResults.required_vars = requiredVars;
          }
        }

        const streamConditionErrors = validateCondition(stream.condition, conditionValidator);
        if (streamConditionErrors !== null) {
          streamValidationResults.condition = streamConditionErrors;
        }

        inputValidationResults.streams![stream.data_stream.dataset] = streamValidationResults;
      });
    } else {
      delete inputValidationResults.streams;
    }

    if (
      inputValidationResults.vars ||
      inputValidationResults.streams ||
      inputValidationResults.condition
    ) {
      validationResults.inputs![inputKey] = inputValidationResults;
    }
  });

  if (Object.entries(validationResults.inputs!).length === 0) {
    validationResults.inputs = {};
  }

  return validationResults;
};

export const validatePackagePolicyConfig = (
  configEntry: PackagePolicyConfigRecordEntry | undefined,
  varDef: RegistryVarsEntry,
  varName: string,
  safeLoadYaml: (yaml: string) => any,
  packageType?: string,
  isRequiredByVarGroup?: boolean
): string[] | null => {
  const errors: string[] = [];

  const value = configEntry?.value;

  let parsedValue: any = value;

  if (typeof value === 'string') {
    parsedValue = value.trim();
  }

  if (varDef === undefined) {
    // TODO return validation error here once https://github.com/elastic/kibana/issues/125655 is fixed
    // eslint-disable-next-line no-console
    console.debug(`No variable definition for ${varName} found`);

    return null;
  }

  // Check if var is required - either by varDef.required or by var_group.required
  const isRequired = varDef.required || isRequiredByVarGroup;

  if (isRequired) {
    if (parsedValue === undefined || (varDef.type === 'yaml' && parsedValue === '')) {
      errors.push(
        i18n.translate('xpack.fleet.packagePolicyValidation.requiredErrorMessage', {
          defaultMessage: '{fieldName} is required',
          values: {
            fieldName: varDef.title || varDef.name,
          },
        })
      );
    }
  }

  if (varDef.secret === true && parsedValue && parsedValue.isSecretRef === true) {
    if (!parsedValue.id && (!parsedValue.ids || parsedValue.ids.length === 0)) {
      errors.push(
        i18n.translate('xpack.fleet.packagePolicyValidation.invalidSecretReference', {
          defaultMessage: 'Secret reference is invalid, id or ids must be provided',
        })
      );
      return errors;
    }

    if (parsedValue.id && parsedValue.ids) {
      errors.push(
        i18n.translate('xpack.fleet.packagePolicyValidation.invalidSecretReference', {
          defaultMessage: 'Secret reference is invalid, id or ids cannot both be provided',
        })
      );
      return errors;
    }

    if (parsedValue.id && typeof parsedValue.id !== 'string') {
      errors.push(
        i18n.translate('xpack.fleet.packagePolicyValidation.invalidSecretReference', {
          defaultMessage: 'Secret reference is invalid, id must be a string',
        })
      );
      return errors;
    }

    if (parsedValue.ids && !parsedValue.ids.every((id: string) => typeof id === 'string')) {
      errors.push(
        i18n.translate('xpack.fleet.packagePolicyValidation.invalidSecretReference', {
          defaultMessage: 'Secret reference is invalid, ids must be an array of strings',
        })
      );
      return errors;
    }

    return null;
  }

  if (varDef.type === 'yaml') {
    try {
      // Coerce to string before parsing to match the behavior of js-yaml.load,
      // which internally calls String(input). The yaml package requires a string.
      parsedValue = safeLoadYaml(String(value));
    } catch (e) {
      errors.push(
        i18n.translate('xpack.fleet.packagePolicyValidation.invalidYamlFormatErrorMessage', {
          defaultMessage: 'Invalid YAML format',
        })
      );
    }
  }

  if (varDef.multi) {
    if (parsedValue && !Array.isArray(parsedValue)) {
      errors.push(
        i18n.translate('xpack.fleet.packagePolicyValidation.invalidArrayErrorMessage', {
          defaultMessage: 'Invalid format for {fieldName}: expected array',
          values: {
            fieldName: varDef.title || varDef.name,
          },
        })
      );
      return errors;
    }
    if (isRequired && Array.isArray(parsedValue)) {
      const hasEmptyString =
        varDef.type === 'text' &&
        parsedValue.some((item) => typeof item === 'string' && item.trim() === '');

      if (hasEmptyString || parsedValue.length === 0) {
        errors.push(
          i18n.translate('xpack.fleet.packagePolicyValidation.requiredErrorMessage', {
            defaultMessage: '{fieldName} is required',
            values: {
              fieldName: varDef.title || varDef.name,
            },
          })
        );
      }
    }
    if (varDef.type === 'text' && parsedValue) {
      const invalidStrings = parsedValue.filter((cand: any) => /^[*&]/.test(cand));
      // only show one error if multiple strings in array are invalid
      if (invalidStrings.length > 0) {
        errors.push(
          i18n.translate('xpack.fleet.packagePolicyValidation.quoteStringErrorMessage', {
            defaultMessage:
              'Strings starting with special YAML characters like * or & need to be enclosed in double quotes.',
          })
        );
      }
    }

    if (varDef.type === 'integer' && parsedValue) {
      const invalidIntegers = parsedValue.filter((val: any) => !Number.isInteger(Number(val)));
      // only show one error if multiple strings in array are invalid
      if (invalidIntegers.length > 0) {
        errors.push(
          i18n.translate('xpack.fleet.packagePolicyValidation.invalidIntegerMultiErrorMessage', {
            defaultMessage: 'Invalid integer',
          })
        );
      }
    }

    return errors.length ? errors : null;
  }

  if (varDef.type === 'text' && parsedValue && !Array.isArray(parsedValue)) {
    if (/^[*&]/.test(parsedValue)) {
      errors.push(
        i18n.translate('xpack.fleet.packagePolicyValidation.quoteStringErrorMessage', {
          defaultMessage:
            'Strings starting with special YAML characters like * or & need to be enclosed in double quotes.',
        })
      );
    }
  }

  if (
    varDef.type === 'bool' &&
    parsedValue &&
    !['true', 'false'].includes(parsedValue.toString())
  ) {
    errors.push(
      i18n.translate('xpack.fleet.packagePolicyValidation.boolValueError', {
        defaultMessage: 'Boolean values must be either true or false',
      })
    );
  }

  if (varDef.type === 'integer' && parsedValue && !Array.isArray(parsedValue)) {
    if (!Number.isInteger(Number(parsedValue))) {
      errors.push(
        i18n.translate('xpack.fleet.packagePolicyValidation.invalidIntegerErrorMessage', {
          defaultMessage: 'Invalid integer',
        })
      );
    }
  }

  if (varDef.type === 'duration' && parsedValue !== undefined && !Array.isArray(parsedValue)) {
    const durationResult = parseDuration(parsedValue);

    if (!durationResult.isValid) {
      errors.push(...durationResult.errors);
    } else {
      // Check min_duration if specified
      if (varDef.min_duration !== undefined) {
        const minDurationResult = parseDuration(varDef.min_duration as string);
        if (!minDurationResult.isValid) {
          errors.push(
            i18n.translate('xpack.fleet.packagePolicyValidation.invalidMinDurationErrorMessage', {
              defaultMessage: 'Invalid min_duration specification',
            })
          );
        } else if (durationResult.valueNs < minDurationResult.valueNs) {
          errors.push(
            i18n.translate('xpack.fleet.packagePolicyValidation.durationBelowMinErrorMessage', {
              defaultMessage: 'Duration is below the minimum allowed value of {minDuration}',
              values: {
                minDuration: varDef.min_duration,
              },
            })
          );
        }
      }

      // Check max_duration if specified
      if (varDef.max_duration !== undefined) {
        const maxDurationResult = parseDuration(varDef.max_duration as string);
        if (!maxDurationResult.isValid) {
          errors.push(
            i18n.translate('xpack.fleet.packagePolicyValidation.invalidMaxDurationErrorMessage', {
              defaultMessage: 'Invalid max_duration specification',
            })
          );
        } else if (durationResult.valueNs > maxDurationResult.valueNs) {
          errors.push(
            i18n.translate('xpack.fleet.packagePolicyValidation.durationAboveMaxErrorMessage', {
              defaultMessage: 'Duration is above the maximum allowed value of {maxDuration}',
              values: {
                maxDuration: varDef.max_duration,
              },
            })
          );
        }
      }
    }
  }

  if (varDef.type === 'select' && parsedValue !== undefined) {
    if (!varDef.options?.map((o) => o.value).includes(parsedValue)) {
      errors.push(
        i18n.translate('xpack.fleet.packagePolicyValidation.invalidSelectValueErrorMessage', {
          defaultMessage: 'Invalid value for select type',
        })
      );
    }
  }

  if (varDef.type === 'url' && parsedValue !== undefined && parsedValue !== '') {
    try {
      // Validate URL against RFC3986 using the URL constructor
      new URL(parsedValue);

      // Validate the scheme against url_allowed_schemes.
      if (varDef.url_allowed_schemes && varDef.url_allowed_schemes.length > 0) {
        const urlScheme = parsedValue.split(':')[0].toLowerCase();
        if (!varDef.url_allowed_schemes.includes(urlScheme)) {
          errors.push(
            i18n.translate('xpack.fleet.packagePolicyValidation.invalidUrlSchemeErrorMessage', {
              defaultMessage:
                'URL scheme "{urlScheme}" is not allowed. Allowed schemes: {allowedSchemes}',
              values: {
                urlScheme,
                allowedSchemes: varDef.url_allowed_schemes.join(', '),
              },
            })
          );
        }
      }
    } catch (e) {
      errors.push(
        i18n.translate('xpack.fleet.packagePolicyValidation.invalidUrlFormatErrorMessage', {
          defaultMessage: 'Invalid URL format',
        })
      );
    }
  }

  if (varName === DATASET_VAR_NAME && packageType === 'input' && parsedValue !== undefined) {
    const { valid, error } = isValidDataset(
      parsedValue.dataset ? parsedValue.dataset : parsedValue,
      false
    );
    if (!valid && error) {
      errors.push(error);
    }
  }

  if (
    varName === DATA_STREAM_TYPE_VAR_NAME &&
    packageType === 'input' &&
    parsedValue !== undefined
  ) {
    const { valid, error } = isValidDataStreamType(parsedValue, false);
    if (!valid && error) {
      errors.push(error);
    }
  }

  return errors.length ? errors : null;
};

export const countValidationErrors = (
  validationResults:
    | PackagePolicyValidationResults
    | PackagePolicyInputValidationResults
    | PackagePolicyConfigValidationResults
): number => {
  const requiredVarGroupErrorKeys: Record<string, boolean> = {};
  let otherErrors = 0;

  // Flatten validation results and map to retrieve required var group errors vs other errors
  // because required var groups should only count as 1 error
  const flattenedValidation = getFlattenedObject(validationResults ?? {});
  Object.entries(flattenedValidation).forEach(([key, value]) => {
    if (key.startsWith('required_vars.')) {
      requiredVarGroupErrorKeys.required_vars = true;
    } else if (key.includes('.required_vars.')) {
      const groupKey = key.replace(/^(.*)\.required_vars\..*$/, '$1');
      requiredVarGroupErrorKeys[groupKey] = true;
    } else if (Boolean(value)) {
      otherErrors++;
    }
  });

  return otherErrors + Object.keys(requiredVarGroupErrorKeys).length;
};

export const validationHasErrors = (
  validationResults:
    | PackagePolicyValidationResults
    | PackagePolicyInputValidationResults
    | PackagePolicyConfigValidationResults
): boolean => {
  return countValidationErrors(validationResults) > 0;
};
