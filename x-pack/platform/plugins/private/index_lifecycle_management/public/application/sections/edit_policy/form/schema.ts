/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

import type { PhaseWithDownsample, PhaseWithTiming } from '../../../../../common/types';
import type { FormSchema } from '../../../../shared_imports';
import { fieldValidators } from '../../../../shared_imports';
import { defaultIndexPriority } from '../../../constants';
import {
  CLOUD_DEFAULT_REPO,
  DEFAULT_ROLLOVER_TRIGGER_FIELDS,
  ROLLOVER_FIELD_PATHS,
  ROLLOVER_FORM_PATHS,
  ROLLOVER_RESTRICTION_FIELD_PATH,
  ROLLOVER_RESTRICTION_FIELD_PATHS,
  ROLLOVER_TRIGGER_FIELD_PATH,
  ROLLOVER_TRIGGER_FIELD_PATHS,
  ROLLOVER_UNIT_PATHS,
} from '../constants';
import { i18nTexts } from '../i18n_texts';
import {
  ifExistsNumberGreaterThanZero,
  ifExistsNumberNonNegative,
  atLeastOneDataPhaseEnabled,
  dataPhaseEnabledPaths,
  minAgeGreaterThanPreviousPhase,
  rolloverThresholdsValidator,
  rolloverRestrictionLessThanTriggerValidator,
  downsampleIntervalMultipleOfPreviousOne,
} from './validations';

const rolloverTriggerFormPaths = Object.values(ROLLOVER_TRIGGER_FIELD_PATHS);
const rolloverFieldPaths = Object.values(ROLLOVER_FIELD_PATHS);
const rolloverUnitPaths = Object.values(ROLLOVER_UNIT_PATHS).filter(Boolean) as string[];
const rolloverFieldsToValidateOnChange = [
  ...rolloverFieldPaths,
  ROLLOVER_TRIGGER_FIELD_PATH,
  ROLLOVER_RESTRICTION_FIELD_PATH,
  ...rolloverUnitPaths,
];

const { emptyField, isInteger, numberGreaterThanField } = fieldValidators;

const serializers = {
  stringToNumber: (v: string): any => (v != null ? parseInt(v, 10) : undefined),
};

const maxNumSegmentsField = {
  label: i18nTexts.editPolicy.maxNumSegmentsFieldLabel,
  validations: [
    {
      validator: emptyField(
        i18n.translate(
          'xpack.indexLifecycleMgmt.editPolicy.forcemerge.numberOfSegmentsRequiredError',
          { defaultMessage: 'A value for number of segments is required.' }
        )
      ),
    },
    {
      validator: ifExistsNumberGreaterThanZero,
    },
  ],
  serializer: serializers.stringToNumber,
};

export const searchableSnapshotFields = {
  snapshot_repository: {
    label: i18nTexts.editPolicy.searchableSnapshotsRepoFieldLabel,
    validations: [
      { validator: emptyField(i18nTexts.editPolicy.errors.searchableSnapshotRepoRequired) },
    ],
    // TODO: update text copy
    helpText: i18n.translate(
      'xpack.indexLifecycleMgmt.editPolicy.searchableSnapshot.repositoryHelpText',
      {
        defaultMessage: 'Each phase uses the same snapshot repository.',
      }
    ),
  },
  storage: {
    label: i18n.translate('xpack.indexLifecycleMgmt.editPolicy.searchableSnapshot.storageLabel', {
      defaultMessage: 'Storage',
    }),
    helpText: i18n.translate(
      'xpack.indexLifecycleMgmt.editPolicy.searchableSnapshot.storageHelpText',
      {
        defaultMessage:
          "Type of snapshot mounted for the searchable snapshot. This is an advanced option. Only change it if you know what you're doing.",
      }
    ),
  },
  force_merge_index: {
    label: i18n.translate(
      'xpack.indexLifecycleMgmt.editPolicy.searchableSnapshot.forceMergeIndexLabel',
      {
        defaultMessage: 'Force merge index',
      }
    ),
    helpText: i18n.translate(
      'xpack.indexLifecycleMgmt.editPolicy.searchableSnapshot.forceMergeIndexHelpText',
      {
        defaultMessage:
          'Force merge the index to a single segment before creating the snapshot. Fewer segments mean fewer reads when restoring or searching the snapshot.',
      }
    ),
  },
  force_merge_on_clone: {
    label: i18n.translate(
      'xpack.indexLifecycleMgmt.editPolicy.searchableSnapshot.forceMergeOnCloneLabel',
      {
        defaultMessage: 'Force merge on clone',
      }
    ),
    helpText: i18n.translate(
      'xpack.indexLifecycleMgmt.editPolicy.searchableSnapshot.forceMergeOnCloneHelpText',
      {
        defaultMessage:
          'Clone the index with zero replicas first, then perform the force merge on the clone. This avoids performing the force merge redundantly on replica shards.',
      }
    ),
  },
};

const numberOfReplicasField = {
  label: i18nTexts.editPolicy.numberOfReplicasLabel,
  validations: [
    {
      validator: emptyField(i18nTexts.editPolicy.errors.numberRequired),
    },
    {
      validator: ifExistsNumberNonNegative,
    },
  ],
  serializer: serializers.stringToNumber,
};

const numberOfShardsField = {
  label: i18nTexts.editPolicy.shrinkNumberOfShardsLabel,
  defaultValue: 1,
  validations: [
    {
      validator: emptyField(i18nTexts.editPolicy.errors.numberRequired),
    },
    {
      validator: numberGreaterThanField({
        message: i18nTexts.editPolicy.errors.numberGreatThan0Required,
        than: 0,
      }),
    },
  ],
  serializer: serializers.stringToNumber,
};
const shardSizeField = {
  label: i18nTexts.editPolicy.maxPrimaryShardSizeLabel,
  validations: [
    {
      validator: emptyField(i18nTexts.editPolicy.errors.numberRequired),
    },
    {
      validator: numberGreaterThanField({
        message: i18nTexts.editPolicy.errors.numberGreatThan0Required,
        than: 0,
      }),
    },
  ],
  serializer: serializers.stringToNumber,
};

const allowWriteAfterShrinkField = {
  label: i18nTexts.editPolicy.allowWriteAfterShrinkLabel,
  defaultValue: false,
};

const getPriorityField = (phase: 'hot' | 'warm' | 'cold') => ({
  defaultValue: defaultIndexPriority[phase],
  label: i18nTexts.editPolicy.indexPriorityFieldLabel,
  validations: [
    {
      validator: emptyField(i18nTexts.editPolicy.errors.numberRequired),
    },
    { validator: ifExistsNumberNonNegative },
  ],
  serializer: serializers.stringToNumber,
});

const getMinAgeField = (phase: PhaseWithTiming, defaultValue?: string) => ({
  defaultValue,
  // By passing an empty array we make sure to *not* trigger the validation when the field value changes.
  // The validation will be triggered when the millisecond variant (in the _meta) is updated (in sync)
  fieldsToValidateOnChange: [],
  validations: [
    {
      validator: emptyField(i18nTexts.editPolicy.errors.numberRequired),
    },
    {
      validator: ifExistsNumberNonNegative,
    },
    {
      validator: isInteger({ message: i18nTexts.editPolicy.errors.integerRequired }),
    },
    {
      validator: minAgeGreaterThanPreviousPhase(phase),
    },
  ],
});

const getDownsampleFieldsToValidateOnChange = (
  p: PhaseWithDownsample,
  includeCurrentPhase = true
) => {
  const allPhases: PhaseWithDownsample[] = ['hot', 'warm', 'cold'];
  const getIntervalSizePath = (currentPhase: PhaseWithDownsample) =>
    `_meta.${currentPhase}.downsample.fixedIntervalSize`;
  const omitPreviousPhases = (currentPhase: PhaseWithDownsample) =>
    allPhases.slice(allPhases.indexOf(currentPhase) + (includeCurrentPhase ? 0 : 1));
  // when a phase is validated, need to also validate all downsample intervals in the next phases
  return omitPreviousPhases(p).map(getIntervalSizePath);
};
const getDownsampleSchema = (phase: PhaseWithDownsample): FormSchema['downsample'] => {
  return {
    enabled: {
      defaultValue: false,
      label: i18nTexts.editPolicy.downsampleEnabledFieldLabel,
      fieldsToValidateOnChange: getDownsampleFieldsToValidateOnChange(
        phase,
        /* don't trigger validation on the current validation to prevent showing error state on pristine input */
        false
      ),
    },
    fixedIntervalSize: {
      label: i18nTexts.editPolicy.downsampleIntervalFieldLabel,
      fieldsToValidateOnChange: getDownsampleFieldsToValidateOnChange(phase),
      validations: [
        {
          validator: emptyField(i18nTexts.editPolicy.errors.numberRequired),
        },
        {
          validator: ifExistsNumberGreaterThanZero,
        },
        {
          validator: isInteger({ message: i18nTexts.editPolicy.errors.integerRequired }),
        },
        {
          validator: downsampleIntervalMultipleOfPreviousOne(phase),
        },
      ],
    },
    fixedIntervalUnits: {
      defaultValue: 'd',
      fieldsToValidateOnChange: getDownsampleFieldsToValidateOnChange(phase),
    },
  };
};

export const getSchema = (isCloudEnabled: boolean): FormSchema => ({
  _meta: {
    hot: {
      enabled: {
        defaultValue: true,
        label: i18n.translate(
          'xpack.indexLifecycleMgmt.editPolicy.hotPhase.activateHotPhaseSwitchLabel',
          { defaultMessage: 'Activate hot phase' }
        ),
        fieldsToValidateOnChange: [...dataPhaseEnabledPaths],
        validations: [{ validator: atLeastOneDataPhaseEnabled }],
      },
      customRollover: {
        enabled: {
          defaultValue: true,
          label: i18n.translate('xpack.indexLifecycleMgmt.hotPhase.enableRolloverLabel', {
            defaultMessage: 'Enable rollover',
          }),
        },
        triggerFields: {
          defaultValue: DEFAULT_ROLLOVER_TRIGGER_FIELDS,
          fieldsToValidateOnChange: rolloverTriggerFormPaths,
        },
        restrictionFields: {
          defaultValue: [],
          fieldsToValidateOnChange: rolloverFieldPaths,
        },
        maxStorageSizeUnit: {
          defaultValue: 'gb',
          fieldsToValidateOnChange: [
            ROLLOVER_FORM_PATHS.maxSize,
            ROLLOVER_RESTRICTION_FIELD_PATHS.min_size,
          ],
        },
        maxPrimaryShardSizeUnit: {
          defaultValue: 'gb',
          fieldsToValidateOnChange: [
            ROLLOVER_FORM_PATHS.maxPrimaryShardSize,
            ROLLOVER_RESTRICTION_FIELD_PATHS.min_primary_shard_size,
          ],
        },
        maxAgeUnit: {
          defaultValue: 'd',
          fieldsToValidateOnChange: [
            ROLLOVER_FORM_PATHS.maxAge,
            ROLLOVER_RESTRICTION_FIELD_PATHS.min_age,
          ],
        },
        minStorageSizeUnit: {
          defaultValue: 'gb',
          fieldsToValidateOnChange: [
            ROLLOVER_FORM_PATHS.maxSize,
            ROLLOVER_RESTRICTION_FIELD_PATHS.min_size,
          ],
        },
        minPrimaryShardSizeUnit: {
          defaultValue: 'gb',
          fieldsToValidateOnChange: [
            ROLLOVER_FORM_PATHS.maxPrimaryShardSize,
            ROLLOVER_RESTRICTION_FIELD_PATHS.min_primary_shard_size,
          ],
        },
        minAgeUnit: {
          defaultValue: 'd',
          fieldsToValidateOnChange: [
            ROLLOVER_FORM_PATHS.maxAge,
            ROLLOVER_RESTRICTION_FIELD_PATHS.min_age,
          ],
        },
      },
      bestCompression: {
        label: i18nTexts.editPolicy.bestCompressionFieldLabel,
      },
      readonlyEnabled: {
        defaultValue: false,
        label: i18nTexts.editPolicy.readonlyEnabledFieldLabel,
      },
      shrink: {
        isUsingShardSize: {
          defaultValue: false,
        },
        maxPrimaryShardSizeUnits: {
          defaultValue: 'gb',
        },
      },
      downsample: getDownsampleSchema('hot'),
    },
    warm: {
      enabled: {
        defaultValue: false,
        label: i18n.translate(
          'xpack.indexLifecycleMgmt.editPolicy.warmPhase.activateWarmPhaseSwitchLabel',
          { defaultMessage: 'Activate warm phase' }
        ),
        fieldsToValidateOnChange: [...dataPhaseEnabledPaths],
        validations: [{ validator: atLeastOneDataPhaseEnabled }],
      },
      minAgeUnit: {
        defaultValue: 'd',
      },
      minAgeToMilliSeconds: {
        defaultValue: -1,
        fieldsToValidateOnChange: [
          'phases.warm.min_age',
          'phases.cold.min_age',
          'phases.frozen.min_age',
          'phases.delete.min_age',
        ],
      },
      bestCompression: {
        label: i18nTexts.editPolicy.bestCompressionFieldLabel,
      },
      dataTierAllocationType: {
        label: i18nTexts.editPolicy.allocationTypeOptionsFieldLabel,
      },
      allocationNodeAttribute: {
        label: i18nTexts.editPolicy.allocationNodeAttributeFieldLabel,
      },
      readonlyEnabled: {
        defaultValue: false,
        label: i18nTexts.editPolicy.readonlyEnabledFieldLabel,
      },
      shrink: {
        isUsingShardSize: {
          defaultValue: false,
        },
        maxPrimaryShardSizeUnits: {
          defaultValue: 'gb',
        },
      },
      downsample: getDownsampleSchema('warm'),
    },
    cold: {
      enabled: {
        defaultValue: false,
        label: i18n.translate(
          'xpack.indexLifecycleMgmt.editPolicy.coldPhase.activateColdPhaseSwitchLabel',
          { defaultMessage: 'Activate cold phase' }
        ),
        fieldsToValidateOnChange: [...dataPhaseEnabledPaths],
        validations: [{ validator: atLeastOneDataPhaseEnabled }],
      },
      readonlyEnabled: {
        defaultValue: false,
        label: i18nTexts.editPolicy.readonlyEnabledFieldLabel,
      },
      minAgeUnit: {
        defaultValue: 'd',
      },
      minAgeToMilliSeconds: {
        defaultValue: -1,
        fieldsToValidateOnChange: [
          'phases.cold.min_age',
          'phases.frozen.min_age',
          'phases.delete.min_age',
        ],
      },
      dataTierAllocationType: {
        label: i18nTexts.editPolicy.allocationTypeOptionsFieldLabel,
      },
      allocationNodeAttribute: {
        label: i18nTexts.editPolicy.allocationNodeAttributeFieldLabel,
      },
      downsample: getDownsampleSchema('cold'),
    },
    frozen: {
      enabled: {
        defaultValue: false,
        label: i18n.translate(
          'xpack.indexLifecycleMgmt.editPolicy.frozenPhase.activateFrozenPhaseSwitchLabel',
          { defaultMessage: 'Activate frozen phase' }
        ),
        fieldsToValidateOnChange: [...dataPhaseEnabledPaths],
        validations: [{ validator: atLeastOneDataPhaseEnabled }],
      },
      minAgeUnit: {
        defaultValue: 'd',
      },
      minAgeToMilliSeconds: {
        defaultValue: -1,
        fieldsToValidateOnChange: ['phases.frozen.min_age', 'phases.delete.min_age'],
      },
      dataTierAllocationType: {
        label: i18nTexts.editPolicy.allocationTypeOptionsFieldLabel,
      },
      allocationNodeAttribute: {
        label: i18nTexts.editPolicy.allocationNodeAttributeFieldLabel,
      },
    },
    delete: {
      enabled: {
        defaultValue: false,
        label: i18n.translate(
          'xpack.indexLifecycleMgmt.editPolicy.deletePhase.activateWarmPhaseSwitchLabel',
          { defaultMessage: 'Activate delete phase' }
        ),
      },
      minAgeUnit: {
        defaultValue: 'd',
      },
      minAgeToMilliSeconds: {
        defaultValue: -1,
        fieldsToValidateOnChange: ['phases.delete.min_age'],
      },
    },
    searchableSnapshot: {
      repository: {
        defaultValue: isCloudEnabled ? CLOUD_DEFAULT_REPO : '',
      },
    },
  },
  phases: {
    hot: {
      actions: {
        rollover: {
          max_age: {
            label: i18nTexts.editPolicy.maxAgeLabel,
            defaultValue: '30',
            validations: [
              {
                validator: rolloverThresholdsValidator,
              },
              {
                validator: ifExistsNumberGreaterThanZero,
              },
              {
                validator: isInteger({ message: i18nTexts.editPolicy.errors.integerRequired }),
              },
            ],
            fieldsToValidateOnChange: rolloverFieldsToValidateOnChange,
          },
          max_docs: {
            label: i18nTexts.editPolicy.maxDocsLabel,
            validations: [
              {
                validator: rolloverThresholdsValidator,
              },
              {
                validator: ifExistsNumberGreaterThanZero,
              },
              {
                validator: isInteger({ message: i18nTexts.editPolicy.errors.integerRequired }),
              },
            ],
            serializer: serializers.stringToNumber,
            fieldsToValidateOnChange: rolloverFieldsToValidateOnChange,
          },
          max_primary_shard_size: {
            label: i18nTexts.editPolicy.maxPrimaryShardSizeLabel,
            defaultValue: '50',
            validations: [
              {
                validator: rolloverThresholdsValidator,
              },
              {
                validator: ifExistsNumberGreaterThanZero,
              },
            ],
            fieldsToValidateOnChange: rolloverFieldsToValidateOnChange,
          },
          max_primary_shard_docs: {
            label: i18nTexts.editPolicy.maxPrimaryShardDocsLabel,
            validations: [
              {
                validator: rolloverThresholdsValidator,
              },
              {
                validator: ifExistsNumberGreaterThanZero,
              },
              {
                validator: isInteger({ message: i18nTexts.editPolicy.errors.integerRequired }),
              },
            ],
            serializer: serializers.stringToNumber,
            fieldsToValidateOnChange: rolloverFieldsToValidateOnChange,
          },
          max_size: {
            label: i18nTexts.editPolicy.maxSizeLabel,
            validations: [
              {
                validator: rolloverThresholdsValidator,
              },
              {
                validator: ifExistsNumberGreaterThanZero,
              },
            ],
            fieldsToValidateOnChange: rolloverFieldsToValidateOnChange,
          },
          min_age: {
            label: i18nTexts.editPolicy.minRolloverAgeLabel,
            validations: [
              {
                validator: ifExistsNumberGreaterThanZero,
              },
              {
                validator: isInteger({ message: i18nTexts.editPolicy.errors.integerRequired }),
              },
              {
                validator: rolloverRestrictionLessThanTriggerValidator('min_age'),
              },
            ],
            fieldsToValidateOnChange: rolloverFieldsToValidateOnChange,
          },
          min_docs: {
            label: i18nTexts.editPolicy.minDocsLabel,
            validations: [
              {
                validator: ifExistsNumberNonNegative,
              },
              {
                validator: isInteger({ message: i18nTexts.editPolicy.errors.integerRequired }),
              },
              {
                validator: rolloverRestrictionLessThanTriggerValidator('min_docs'),
              },
            ],
            serializer: serializers.stringToNumber,
            fieldsToValidateOnChange: rolloverFieldsToValidateOnChange,
          },
          min_primary_shard_size: {
            label: i18nTexts.editPolicy.minPrimaryShardSizeLabel,
            validations: [
              {
                validator: ifExistsNumberGreaterThanZero,
              },
              {
                validator: rolloverRestrictionLessThanTriggerValidator('min_primary_shard_size'),
              },
            ],
            fieldsToValidateOnChange: rolloverFieldsToValidateOnChange,
          },
          min_primary_shard_docs: {
            label: i18nTexts.editPolicy.minPrimaryShardDocsLabel,
            validations: [
              {
                validator: ifExistsNumberGreaterThanZero,
              },
              {
                validator: isInteger({ message: i18nTexts.editPolicy.errors.integerRequired }),
              },
              {
                validator: rolloverRestrictionLessThanTriggerValidator('min_primary_shard_docs'),
              },
            ],
            serializer: serializers.stringToNumber,
            fieldsToValidateOnChange: rolloverFieldsToValidateOnChange,
          },
          min_size: {
            label: i18nTexts.editPolicy.minSizeLabel,
            validations: [
              {
                validator: ifExistsNumberGreaterThanZero,
              },
              {
                validator: rolloverRestrictionLessThanTriggerValidator('min_size'),
              },
            ],
            fieldsToValidateOnChange: rolloverFieldsToValidateOnChange,
          },
        },
        forcemerge: {
          max_num_segments: maxNumSegmentsField,
        },
        shrink: {
          number_of_shards: numberOfShardsField,
          max_primary_shard_size: shardSizeField,
          allow_write_after_shrink: allowWriteAfterShrinkField,
        },
        set_priority: {
          priority: getPriorityField('hot'),
        },
        searchable_snapshot: searchableSnapshotFields,
      },
    },
    warm: {
      min_age: getMinAgeField('warm'),
      actions: {
        allocate: {
          number_of_replicas: numberOfReplicasField,
        },
        shrink: {
          number_of_shards: numberOfShardsField,
          max_primary_shard_size: shardSizeField,
          allow_write_after_shrink: allowWriteAfterShrinkField,
        },
        forcemerge: {
          max_num_segments: maxNumSegmentsField,
        },
        set_priority: {
          priority: getPriorityField('warm'),
        },
      },
    },
    cold: {
      min_age: getMinAgeField('cold'),
      actions: {
        allocate: {
          number_of_replicas: numberOfReplicasField,
        },
        set_priority: {
          priority: getPriorityField('cold'),
        },
        searchable_snapshot: searchableSnapshotFields,
      },
    },
    frozen: {
      min_age: getMinAgeField('frozen'),
      actions: {
        searchable_snapshot: searchableSnapshotFields,
      },
    },
    delete: {
      min_age: getMinAgeField('delete', '365'),
      actions: {
        wait_for_snapshot: {
          policy: {
            label: i18n.translate(
              'xpack.indexLifecycleMgmt.editPolicy.waitForSnapshot.snapshotPolicyFieldLabel',
              {
                defaultMessage: 'Policy name (optional)',
              }
            ),
          },
        },
        delete: {
          delete_searchable_snapshot: {
            label: i18n.translate(
              'xpack.indexLifecycleMgmt.editPolicy.deleteSearchableSnapshotFieldLabel',
              {
                defaultMessage: 'Delete searchable snapshot',
              }
            ),
            defaultValue: true,
          },
        },
      },
    },
  },
});
