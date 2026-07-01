/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { i18n } from '@kbn/i18n';

import moment from 'moment';
import type { ValidationFunc, ValidationConfig, ValidationError } from '../../../../shared_imports';
import { fieldValidators } from '../../../../shared_imports';

import {
  DEFAULT_ROLLOVER_TRIGGER_FIELDS,
  ROLLOVER_FORM_PATHS,
  ROLLOVER_RESTRICTION_FIELD_PATHS,
  ROLLOVER_RESTRICTION_TO_TRIGGER_FIELD,
  ROLLOVER_TRIGGER_FIELD_PATHS,
  ROLLOVER_UNIT_PATHS,
  type RolloverField,
  type RolloverRestrictionField,
  type RolloverTriggerField,
} from '../constants';

import { i18nTexts } from '../i18n_texts';
import type {
  PhaseWithDownsample,
  PhaseWithTiming,
  PolicyFromES,
} from '../../../../../common/types';
import type { FormInternal } from '../types';

const { numberGreaterThanField, containsCharsField, emptyField, startsWithField } = fieldValidators;

const createIfNumberExistsValidator = ({
  than,
  message,
}: {
  than: number;
  message: string;
}): ValidationFunc<any, any, any> => {
  return (arg) => {
    if (arg.value) {
      return numberGreaterThanField({
        than,
        message,
      })({
        ...arg,
        value: parseInt(arg.value, 10),
      });
    }
  };
};

export const ifExistsNumberGreaterThanZero = createIfNumberExistsValidator({
  than: 0,
  message: i18nTexts.editPolicy.errors.numberGreatThan0Required,
});

export const ifExistsNumberNonNegative = createIfNumberExistsValidator({
  than: -1,
  message: i18nTexts.editPolicy.errors.nonNegativeNumberRequired,
});

/**
 * A special validation type used to keep track of validation errors for
 * the rollover threshold values not being set (e.g., age and doc count)
 */
export const ROLLOVER_VALUE_REQUIRED_VALIDATION_CODE = 'ROLLOVER_VALUE_REQUIRED_VALIDATION_CODE';

export const DATA_PHASE_REQUIRED_VALIDATION_CODE = 'DATA_PHASE_REQUIRED_VALIDATION_CODE';

const rolloverTriggerFieldPaths = Object.values(ROLLOVER_TRIGGER_FIELD_PATHS);

const getFieldValue = <T = unknown>(formData: Record<string, any>, path: string): T | undefined => {
  const value = formData[path];
  if (value !== undefined) {
    return value;
  }

  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== 'object') {
      return undefined;
    }
    return (acc as Record<string, unknown>)[key];
  }, formData) as T | undefined;
};

const getActiveTriggerFields = (formData: FormInternal): RolloverTriggerField[] => {
  return (
    getFieldValue<RolloverTriggerField[]>(formData, '_meta.hot.customRollover.triggerFields') ??
    DEFAULT_ROLLOVER_TRIGGER_FIELDS
  );
};

/**
 * An ILM policy requires that for rollover a value must be set for one of the threshold values.
 *
 * This validator checks that and updates form values by setting errors states imperatively to
 * indicate this error state.
 */
export const rolloverThresholdsValidator: ValidationFunc = ({ form, path, formData }) => {
  const fields = form.getFields();
  const formInternalData = formData as FormInternal;
  const activeTriggerFields = getActiveTriggerFields(formInternalData);
  // At least one rollover field needs a value specified for this action.
  const someRolloverFieldHasAValue = activeTriggerFields.some((rolloverField) =>
    Boolean(getFieldValue(formInternalData, ROLLOVER_TRIGGER_FIELD_PATHS[rolloverField]))
  );
  if (!someRolloverFieldHasAValue) {
    const errorToReturn: ValidationError = {
      code: ROLLOVER_VALUE_REQUIRED_VALIDATION_CODE,
      message: '', // We need to map the current path to the corresponding validation error message
    };
    switch (path) {
      case ROLLOVER_FORM_PATHS.maxAge:
        errorToReturn.message = i18nTexts.editPolicy.errors.maximumAgeRequiredMessage;
        break;
      case ROLLOVER_FORM_PATHS.maxDocs:
        errorToReturn.message = i18nTexts.editPolicy.errors.maximumDocumentsRequiredMessage;
        break;
      case ROLLOVER_FORM_PATHS.maxPrimaryShardSize:
        errorToReturn.message = i18nTexts.editPolicy.errors.maximumPrimaryShardSizeRequiredMessage;
        break;
      case ROLLOVER_FORM_PATHS.maxPrimaryShardDocs:
        errorToReturn.message = i18nTexts.editPolicy.errors.maximumPrimaryShardDocsRequiredMessage;
        break;
      default:
        errorToReturn.message = i18nTexts.editPolicy.errors.maximumSizeRequiredMessage;
    }
    return errorToReturn;
  } else {
    rolloverTriggerFieldPaths.forEach((rolloverFieldPath) => {
      fields[rolloverFieldPath]?.clearErrors(ROLLOVER_VALUE_REQUIRED_VALIDATION_CODE);
    });
  }
};

const byteUnitToBytes: Record<string, number> = {
  b: 1,
  kb: 1024,
  mb: 1024 ** 2,
  gb: 1024 ** 3,
  tb: 1024 ** 4,
  pb: 1024 ** 5,
};

const convertRolloverFieldValue = (
  field: RolloverField,
  value: unknown,
  formData: Record<string, any>
): number | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return undefined;
  }

  const unitPath = ROLLOVER_UNIT_PATHS[field];
  const unit = unitPath ? getFieldValue<string>(formData, unitPath) : undefined;

  if (field === 'max_age' || field === 'min_age') {
    return moment
      .duration(numericValue, (unit ?? 'd') as moment.unitOfTime.DurationConstructor)
      .asMilliseconds();
  }

  if (
    field === 'max_size' ||
    field === 'min_size' ||
    field === 'max_primary_shard_size' ||
    field === 'min_primary_shard_size'
  ) {
    return numericValue * (byteUnitToBytes[unit ?? 'gb'] ?? 1);
  }

  return numericValue;
};

export const rolloverRestrictionLessThanTriggerValidator =
  (restrictionField: RolloverRestrictionField): ValidationFunc =>
  ({ formData }) => {
    const triggerField = ROLLOVER_RESTRICTION_TO_TRIGGER_FIELD[restrictionField];
    const activeTriggerFields =
      getFieldValue<RolloverTriggerField[]>(formData, '_meta.hot.customRollover.triggerFields') ??
      DEFAULT_ROLLOVER_TRIGGER_FIELDS;
    const activeRestrictionFields =
      getFieldValue<RolloverRestrictionField[]>(
        formData,
        '_meta.hot.customRollover.restrictionFields'
      ) ?? [];

    if (
      !activeTriggerFields.includes(triggerField) ||
      !activeRestrictionFields.includes(restrictionField)
    ) {
      return;
    }

    const triggerValue = convertRolloverFieldValue(
      triggerField,
      getFieldValue(formData, ROLLOVER_TRIGGER_FIELD_PATHS[triggerField]),
      formData
    );
    const restrictionValue = convertRolloverFieldValue(
      restrictionField,
      getFieldValue(formData, ROLLOVER_RESTRICTION_FIELD_PATHS[restrictionField]),
      formData
    );

    if (
      triggerValue !== undefined &&
      restrictionValue !== undefined &&
      restrictionValue > triggerValue
    ) {
      return {
        message: i18nTexts.editPolicy.errors.rolloverRestrictionGreaterThanTrigger,
      };
    }
  };

export const dataPhaseEnabledPaths = [
  '_meta.hot.enabled',
  '_meta.warm.enabled',
  '_meta.cold.enabled',
  '_meta.frozen.enabled',
] as const;

export const atLeastOneDataPhaseEnabled: ValidationFunc = ({ form }) => {
  const fields = form.getFields();
  const formData = form.getFormData() as FormInternal;
  const meta = formData?._meta;

  const hotEnabled = fields['_meta.hot.enabled']?.value ?? meta?.hot?.enabled ?? true;
  const warmEnabled = fields['_meta.warm.enabled']?.value ?? meta?.warm?.enabled ?? false;
  const coldEnabled = fields['_meta.cold.enabled']?.value ?? meta?.cold?.enabled ?? false;
  const frozenEnabled = fields['_meta.frozen.enabled']?.value ?? meta?.frozen?.enabled ?? false;

  const someDataPhaseIsEnabled = Boolean(hotEnabled || warmEnabled || coldEnabled || frozenEnabled);

  if (!someDataPhaseIsEnabled) {
    return {
      code: DATA_PHASE_REQUIRED_VALIDATION_CODE,
      message: i18n.translate('xpack.indexLifecycleMgmt.editPolicy.dataPhaseRequiredError', {
        defaultMessage: 'At least one data phase must be enabled.',
      }),
    };
  }

  dataPhaseEnabledPaths.forEach((enabledPath) => {
    fields[enabledPath]?.clearErrors(DATA_PHASE_REQUIRED_VALIDATION_CODE);
  });
};

export const createPolicyNameValidations = ({
  policies,
  isClonedPolicy,
  originalPolicyName,
}: {
  policies: PolicyFromES[];
  isClonedPolicy: boolean;
  originalPolicyName?: string;
}): Array<ValidationConfig<FormInternal, string, string>> => {
  return [
    {
      validator: emptyField(i18nTexts.editPolicy.errors.policyNameRequiredMessage),
    },
    {
      validator: startsWithField({
        message: i18nTexts.editPolicy.errors.policyNameStartsWithUnderscoreErrorMessage,
        char: '_',
      }),
    },
    {
      validator: containsCharsField({
        message: i18nTexts.editPolicy.errors.policyNameContainsInvalidChars,
        chars: [',', ' '],
      }),
    },
    {
      validator: (arg) => {
        const policyName = arg.value;
        if (window.TextEncoder && new window.TextEncoder().encode(policyName).length > 255) {
          return {
            message: i18nTexts.editPolicy.errors.policyNameTooLongErrorMessage,
          };
        }
      },
    },
    {
      validator: (arg) => {
        const policyName = arg.value;
        if (isClonedPolicy && policyName === originalPolicyName) {
          return {
            message: i18nTexts.editPolicy.errors.policyNameMustBeDifferentErrorMessage,
          };
        } else if (policyName !== originalPolicyName) {
          const policyNames = policies.map((existingPolicy) => existingPolicy.name);
          if (policyNames.includes(policyName)) {
            return {
              message: i18nTexts.editPolicy.errors.policyNameAlreadyUsedErrorMessage,
            };
          }
        }
      },
    },
  ];
};

/**
 * This validator guarantees that the user does not specify a min_age
 * value smaller that the min_age of a previous phase.
 * For example, the user can't define '5 days' for cold phase if the
 * warm phase is set to '10 days'.
 */
export const minAgeGreaterThanPreviousPhase =
  (phase: PhaseWithTiming) =>
  ({ formData }: { formData: Record<string, number> }) => {
    if (phase === 'warm') {
      return;
    }

    const getValueFor = (_phase: PhaseWithTiming) => {
      const milli = formData[`_meta.${_phase}.minAgeToMilliSeconds`];

      const esFormat =
        milli >= 0
          ? formData[`phases.${_phase}.min_age`] + formData[`_meta.${_phase}.minAgeUnit`]
          : undefined;

      return {
        milli,
        esFormat,
      };
    };

    const minAgeValues = {
      warm: getValueFor('warm'),
      cold: getValueFor('cold'),
      frozen: getValueFor('frozen'),
      delete: getValueFor('delete'),
    };

    const i18nErrors = {
      greaterThanWarmPhase: i18n.translate(
        'xpack.indexLifecycleMgmt.editPolicy.minAgeSmallerThanWarmPhaseError',
        {
          defaultMessage: 'Must be greater or equal than the warm phase value ({value})',
          values: {
            value: minAgeValues.warm.esFormat,
          },
        }
      ),
      greaterThanColdPhase: i18n.translate(
        'xpack.indexLifecycleMgmt.editPolicy.minAgeSmallerThanColdPhaseError',
        {
          defaultMessage: 'Must be greater or equal than the cold phase value ({value})',
          values: {
            value: minAgeValues.cold.esFormat,
          },
        }
      ),
      greaterThanFrozenPhase: i18n.translate(
        'xpack.indexLifecycleMgmt.editPolicy.minAgeSmallerThanFrozenPhaseError',
        {
          defaultMessage: 'Must be greater or equal than the frozen phase value ({value})',
          values: {
            value: minAgeValues.frozen.esFormat,
          },
        }
      ),
    };

    if (phase === 'cold') {
      if (minAgeValues.warm.milli >= 0 && minAgeValues.cold.milli < minAgeValues.warm.milli) {
        return {
          message: i18nErrors.greaterThanWarmPhase,
        };
      }
      return;
    }

    if (phase === 'frozen') {
      if (minAgeValues.cold.milli >= 0 && minAgeValues.frozen.milli < minAgeValues.cold.milli) {
        return {
          message: i18nErrors.greaterThanColdPhase,
        };
      } else if (
        minAgeValues.warm.milli >= 0 &&
        minAgeValues.frozen.milli < minAgeValues.warm.milli
      ) {
        return {
          message: i18nErrors.greaterThanWarmPhase,
        };
      }
      return;
    }

    if (phase === 'delete') {
      if (minAgeValues.frozen.milli >= 0 && minAgeValues.delete.milli < minAgeValues.frozen.milli) {
        return {
          message: i18nErrors.greaterThanFrozenPhase,
        };
      } else if (
        minAgeValues.cold.milli >= 0 &&
        minAgeValues.delete.milli < minAgeValues.cold.milli
      ) {
        return {
          message: i18nErrors.greaterThanColdPhase,
        };
      } else if (
        minAgeValues.warm.milli >= 0 &&
        minAgeValues.delete.milli < minAgeValues.warm.milli
      ) {
        return {
          message: i18nErrors.greaterThanWarmPhase,
        };
      }
    }
  };

export const downsampleIntervalMultipleOfPreviousOne =
  (phase: PhaseWithDownsample) =>
  ({ formData }: { formData: Record<string, any> }) => {
    if (phase === 'hot') return;

    const getValueFor = (_phase: PhaseWithDownsample) => {
      const intervalSize = formData[`_meta.${_phase}.downsample.fixedIntervalSize`];
      const intervalUnits = formData[`_meta.${_phase}.downsample.fixedIntervalUnits`];

      if (!intervalSize || !intervalUnits) {
        return null;
      }

      const milliseconds = moment.duration(intervalSize, intervalUnits).asMilliseconds();
      const esFormat = intervalSize + intervalUnits;

      return {
        milliseconds,
        esFormat,
      };
    };

    const intervalValues = {
      hot: getValueFor('hot'),
      warm: getValueFor('warm'),
      cold: getValueFor('cold'),
    };

    const checkIfGreaterAndMultiple = (nextInterval: number, previousInterval: number): boolean =>
      nextInterval > previousInterval && nextInterval % previousInterval === 0;

    if (phase === 'warm' && intervalValues.warm) {
      if (intervalValues.hot) {
        if (
          !checkIfGreaterAndMultiple(
            intervalValues.warm.milliseconds,
            intervalValues.hot.milliseconds
          )
        ) {
          return {
            message: i18n.translate(
              'xpack.indexLifecycleMgmt.editPolicy.downsamplePreviousIntervalWarmPhaseError',
              {
                defaultMessage:
                  'Must be greater than and a multiple of the hot phase value ({value})',
                values: {
                  value: intervalValues.hot.esFormat,
                },
              }
            ),
          };
        }
      }
    }

    if (phase === 'cold' && intervalValues.cold) {
      if (intervalValues.warm) {
        if (
          !checkIfGreaterAndMultiple(
            intervalValues.cold.milliseconds,
            intervalValues.warm.milliseconds
          )
        ) {
          return {
            message: i18n.translate(
              'xpack.indexLifecycleMgmt.editPolicy.downsamplePreviousIntervalColdPhaseWarmError',
              {
                defaultMessage:
                  'Must be greater than and a multiple of the warm phase value ({value})',
                values: {
                  value: intervalValues.warm.esFormat,
                },
              }
            ),
          };
        }
      } else if (intervalValues.hot) {
        if (
          !checkIfGreaterAndMultiple(
            intervalValues.cold.milliseconds,
            intervalValues.hot.milliseconds
          )
        ) {
          return {
            message: i18n.translate(
              'xpack.indexLifecycleMgmt.editPolicy.downsamplePreviousIntervalColdPhaseHotError',
              {
                defaultMessage:
                  'Must be greater than and a multiple of the hot phase value ({value})',
                values: {
                  value: intervalValues.hot.esFormat,
                },
              }
            ),
          };
        }
      }
    }
  };
