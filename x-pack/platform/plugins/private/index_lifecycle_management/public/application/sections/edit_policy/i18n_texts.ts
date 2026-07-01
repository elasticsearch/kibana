/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { PHASE_TITLES, PHASE_LONG_DESCRIPTIONS } from '@kbn/data-lifecycle-phases';

export const i18nTexts = {
  editPolicy: {
    shrinkActionLabel: i18n.translate('xpack.indexLifecycleMgmt.shrink.actionLabel', {
      defaultMessage: 'Shrink',
    }),
    shrinkToggleLabel: i18n.translate('xpack.indexLifecycleMgmt.shrink.enableShrinkLabel', {
      defaultMessage: 'Shrink index',
    }),
    shrinkCountLabel: i18n.translate(
      'xpack.indexLifecycleMgmt.editPolicy.shrink.configureShardCountLabel',
      {
        defaultMessage: 'Configure shard count',
      }
    ),
    shrinkNumberOfShardsLabel: i18n.translate(
      'xpack.indexLifecycleMgmt.shrink.numberOfPrimaryShardsLabel',
      {
        defaultMessage: 'Number of primary shards',
      }
    ),
    shrinkSizeLabel: i18n.translate(
      'xpack.indexLifecycleMgmt.editPolicy.shrink.configureShardSizeLabel',
      {
        defaultMessage: 'Configure shard size',
      }
    ),
    allowWriteAfterShrinkLabel: i18n.translate(
      'xpack.indexLifecycleMgmt.editPolicy.shrink.allowWritesLabel',
      {
        defaultMessage: 'Allow writes after shrink',
      }
    ),
    rolloverOffsetsHotPhaseTiming: i18n.translate(
      'xpack.indexLifecycleMgmt.rollover.rolloverOffsetsPhaseTimingDescription',
      {
        defaultMessage:
          'How long it takes to reach the rollover criteria in the hot phase can vary.',
      }
    ),
    searchableSnapshotInHotPhase: {
      searchableSnapshotDisallowed: {
        calloutTitle: i18n.translate(
          'xpack.indexLifecycleMgmt.searchableSnapshot.disallowedCalloutTitle',
          {
            defaultMessage: 'Searchable snapshot disabled',
          }
        ),
        calloutBody: i18n.translate(
          'xpack.indexLifecycleMgmt.searchableSnapshot.disallowedCalloutBody',
          {
            defaultMessage:
              'To use searchable snapshot in this phase you must disable searchable snapshot in the hot phase.',
          }
        ),
      },
    },
    forceMergeLabel: i18n.translate('xpack.indexLifecycleMgmt.editPolicy.forceMerge.enableText', {
      defaultMessage: 'Force merge',
    }),
    forceMergeEnabledFieldLabel: i18n.translate('xpack.indexLifecycleMgmt.forcemerge.enableLabel', {
      defaultMessage: 'Force merge data',
    }),
    readonlyEnabledFieldLabel: i18n.translate('xpack.indexLifecycleMgmt.readonlyFieldLabel', {
      defaultMessage: 'Make index read only',
    }),
    readonlyLabel: i18n.translate('xpack.indexLifecycleMgmt.editPolicy.readonlyTitle', {
      defaultMessage: 'Read only',
    }),
    downsampleEnabledFieldLabel: i18n.translate('xpack.indexLifecycleMgmt.downsampleFieldLabel', {
      defaultMessage: 'Enable downsampling',
    }),
    downsampleIntervalFieldLabel: i18n.translate(
      'xpack.indexLifecycleMgmt.downsampleIntervalFieldLabel',
      {
        defaultMessage: 'Downsampling interval',
      }
    ),
    downsampleIntervalFieldUnitsLabel: i18n.translate(
      'xpack.indexLifecycleMgmt.downsampleIntervalFieldUnitsLabel',
      {
        defaultMessage: 'Downsampling interval units',
      }
    ),
    maxNumSegmentsFieldLabel: i18n.translate(
      'xpack.indexLifecycleMgmt.forceMerge.numberOfSegmentsLabel',
      {
        defaultMessage: 'Number of segments',
      }
    ),
    indexPriorityFieldLabel: i18n.translate(
      'xpack.indexLifecycleMgmt.editPolicy.indexPriorityLabel',
      {
        defaultMessage: 'Index priority',
      }
    ),
    bestCompressionFieldLabel: i18n.translate(
      'xpack.indexLifecycleMgmt.forcemerge.bestCompressionLabel',
      {
        defaultMessage: 'Compress stored fields',
      }
    ),
    bestCompressionFieldHelpText: i18n.translate(
      'xpack.indexLifecycleMgmt.editPolicy.forceMerge.bestCompressionText',
      {
        defaultMessage:
          'Use higher compression for stored fields at the cost of slower performance.',
      }
    ),
    allocationTypeOptionsFieldLabel: i18n.translate(
      'xpack.indexLifecycleMgmt.editPolicy.dataTierAllocation.allocationFieldLabel',
      { defaultMessage: 'Data tier options' }
    ),
    allocationNodeAttributeFieldLabel: i18n.translate(
      'xpack.indexLifecycleMgmt.editPolicy.dataTierAllocation.nodeAllocationFieldLabel',
      {
        defaultMessage: 'Select a node attribute',
      }
    ),
    searchableSnapshotsRepoFieldLabel: i18n.translate(
      'xpack.indexLifecycleMgmt.editPolicy.searchableSnapshotRepoFieldLabel',
      {
        defaultMessage: 'Snapshot repository',
      }
    ),
    maxPrimaryShardSizeLabel: i18n.translate(
      'xpack.indexLifecycleMgmt.hotPhase.maximumPrimaryShardSizeLabel',
      {
        defaultMessage: 'Maximum primary shard size',
      }
    ),
    maxPrimaryShardDocsLabel: i18n.translate(
      'xpack.indexLifecycleMgmt.hotPhase.maximumPrimaryShardDocsLabel',
      {
        defaultMessage: 'Maximum docs in the primary shard',
      }
    ),
    maxPrimaryShardSizeUnitsLabel: i18n.translate(
      'xpack.indexLifecycleMgmt.editPolicy.maximumPrimaryShardSizeAriaLabel',
      {
        defaultMessage: 'Maximum shard size units',
      }
    ),
    maxAgeLabel: i18n.translate('xpack.indexLifecycleMgmt.hotPhase.maximumAgeLabel', {
      defaultMessage: 'Maximum age',
    }),
    maxDocsLabel: i18n.translate('xpack.indexLifecycleMgmt.hotPhase.maximumDocumentsLabel', {
      defaultMessage: 'Maximum documents',
    }),
    maxSizeLabel: i18n.translate('xpack.indexLifecycleMgmt.hotPhase.maximumIndexSizeLabel', {
      defaultMessage: 'Maximum index size',
    }),
    minPrimaryShardSizeLabel: i18n.translate(
      'xpack.indexLifecycleMgmt.hotPhase.minimumPrimaryShardSizeLabel',
      {
        defaultMessage: 'Minimum primary shard size',
      }
    ),
    minPrimaryShardDocsLabel: i18n.translate(
      'xpack.indexLifecycleMgmt.hotPhase.minimumPrimaryShardDocsLabel',
      {
        defaultMessage: 'Minimum docs in the primary shard',
      }
    ),
    minRolloverAgeLabel: i18n.translate('xpack.indexLifecycleMgmt.hotPhase.minimumAgeLabel', {
      defaultMessage: 'Minimum age',
    }),
    minDocsLabel: i18n.translate('xpack.indexLifecycleMgmt.hotPhase.minimumDocumentsLabel', {
      defaultMessage: 'Minimum documents',
    }),
    minSizeLabel: i18n.translate('xpack.indexLifecycleMgmt.hotPhase.minimumIndexSizeLabel', {
      defaultMessage: 'Minimum index size',
    }),
    triggerRolloverLabel: i18n.translate('xpack.indexLifecycleMgmt.hotPhase.triggerRolloverLabel', {
      defaultMessage: 'Trigger rollover',
    }),
    restrictRolloverLabel: i18n.translate(
      'xpack.indexLifecycleMgmt.hotPhase.restrictRolloverLabel',
      {
        defaultMessage: 'Restrict rollover',
      }
    ),
    addRolloverTriggerLabel: i18n.translate(
      'xpack.indexLifecycleMgmt.hotPhase.addRolloverTriggerLabel',
      {
        defaultMessage: 'Add trigger',
      }
    ),
    addRolloverRestrictionLabel: i18n.translate(
      'xpack.indexLifecycleMgmt.hotPhase.addRolloverRestrictionLabel',
      {
        defaultMessage: 'Add restriction',
      }
    ),
    restoreRecommendedRolloverDefaultsLabel: i18n.translate(
      'xpack.indexLifecycleMgmt.hotPhase.restoreRecommendedRolloverDefaultsLabel',
      {
        defaultMessage: 'Restore recommended defaults',
      }
    ),
    allRolloverTriggersInUseLabel: i18n.translate(
      'xpack.indexLifecycleMgmt.hotPhase.allRolloverTriggersInUseLabel',
      {
        defaultMessage: 'All trigger attributes are already in use.',
      }
    ),
    allRolloverRestrictionsInUseLabel: i18n.translate(
      'xpack.indexLifecycleMgmt.hotPhase.allRolloverRestrictionsInUseLabel',
      {
        defaultMessage: 'All restriction attributes are already in use.',
      }
    ),
    downsampleLabel: i18n.translate('xpack.indexLifecycleMgmt.editPolicy.downsampleTitle', {
      defaultMessage: 'Downsample',
    }),
    minAgeLabel: i18n.translate(
      'xpack.indexLifecycleMgmt.editPolicy.minimumAge.minimumAgeFieldLabel',
      { defaultMessage: 'Move data into phase when' }
    ),
    rolloverLabel: i18n.translate('xpack.indexLifecycleMgmt.hotPhase.rolloverFieldTitle', {
      defaultMessage: 'Rollover',
    }),
    rolloverToolTipDescription: i18n.translate(
      'xpack.indexLifecycleMgmt.editPolicy.minimumAge.rolloverToolTipDescription',
      {
        defaultMessage:
          'Data age is calculated from rollover. Rollover is configured in the hot phase.',
      }
    ),
    minAgeUnitFieldSuffix: i18n.translate(
      'xpack.indexLifecycleMgmt.editPolicy.minimumAge.minimumAgeFieldSuffixLabel',
      { defaultMessage: 'old' }
    ),
    replicasLabel: i18n.translate('xpack.indexLifecycleMgmt.numberOfReplicas.formRowTitle', {
      defaultMessage: 'Replicas',
    }),
    numberOfReplicasLabel: i18n.translate(
      'xpack.indexLifecycleMgmt.editPolicy.numberOfReplicasLabel',
      {
        defaultMessage: 'Number of replicas',
      }
    ),
    dataAllocationLabel: i18n.translate('xpack.indexLifecycleMgmt.common.dataTier.title', {
      defaultMessage: 'Data allocation',
    }),
    searchableSnapshotLabel: i18n.translate(
      'xpack.indexLifecycleMgmt.editPolicy.fullyMountedSearchableSnapshotField.title',
      {
        defaultMessage: 'Searchable snapshot',
      }
    ),
    waitForSnapshotLabel: i18n.translate(
      'xpack.indexLifecycleMgmt.editPolicy.deletePhase.waitForSnapshotTitle',
      { defaultMessage: 'Wait for snapshot policy' }
    ),
    deleteSearchableSnapshotLabel: i18n.translate(
      'xpack.indexLifecycleMgmt.editPolicy.deletePhase.deleteSearchableSnapshotTitle',
      {
        defaultMessage: 'Delete searchable snapshot',
      }
    ),
    errors: {
      numberRequired: i18n.translate(
        'xpack.indexLifecycleMgmt.editPolicy.errors.numberRequiredErrorMessage',
        {
          defaultMessage: 'A number is required.',
        }
      ),
      numberGreatThan0Required: i18n.translate(
        'xpack.indexLifecycleMgmt.editPolicy.errors.numberAboveZeroRequiredError',
        {
          defaultMessage: 'Only numbers above 0 are allowed.',
        }
      ),
      integerRequired: i18n.translate(
        'xpack.indexLifecycleMgmt.editPolicy.errors.integerRequiredError',
        {
          defaultMessage: 'Only integers are allowed.',
        }
      ),
      maximumAgeRequiredMessage: i18n.translate(
        'xpack.indexLifecycleMgmt.editPolicy.errors.maximumAgeMissingError',
        {
          defaultMessage: 'A maximum age is required.',
        }
      ),
      maximumSizeRequiredMessage: i18n.translate(
        'xpack.indexLifecycleMgmt.editPolicy.errors.maximumIndexSizeMissingError',
        {
          defaultMessage: 'A maximum index size is required.',
        }
      ),
      maximumDocumentsRequiredMessage: i18n.translate(
        'xpack.indexLifecycleMgmt.editPolicy.errors.maximumDocumentsMissingError',
        {
          defaultMessage: 'Maximum documents is required.',
        }
      ),
      maximumPrimaryShardSizeRequiredMessage: i18n.translate(
        'xpack.indexLifecycleMgmt.editPolicy.errors.maximumPrimaryShardSizeMissingError',
        {
          defaultMessage: 'A maximum primary shard size is required',
        }
      ),
      maximumPrimaryShardDocsRequiredMessage: i18n.translate(
        'xpack.indexLifecycleMgmt.editPolicy.errors.maximumPrimaryShardDocsMissingError',
        {
          defaultMessage: 'Maximum documents in the primary shard is required',
        }
      ),
      rollOverConfigurationCallout: {
        title: i18n.translate(
          'xpack.indexLifecycleMgmt.editPolicy.errors.rolloverConfigurationError.title',
          {
            defaultMessage: 'Invalid rollover configuration',
          }
        ),
        body: i18n.translate(
          'xpack.indexLifecycleMgmt.editPolicy.errors.rolloverConfigurationError.body',
          {
            defaultMessage: 'A value for at least one rollover trigger is required.',
          }
        ),
      },
      rolloverRestrictionGreaterThanTrigger: i18n.translate(
        'xpack.indexLifecycleMgmt.editPolicy.errors.rolloverRestrictionGreaterThanTrigger',
        {
          defaultMessage: 'Restriction must be less than or equal to the corresponding trigger.',
        }
      ),
      nonNegativeNumberRequired: i18n.translate(
        'xpack.indexLifecycleMgmt.editPolicy.errors.nonNegativeNumberRequiredError',
        {
          defaultMessage: 'Only non-negative numbers are allowed.',
        }
      ),
      policyNameContainsInvalidChars: i18n.translate(
        'xpack.indexLifecycleMgmt.editPolicy.errors.policyNameContainsInvalidCharsError',
        {
          defaultMessage: 'A policy name cannot contain spaces or commas.',
        }
      ),
      policyNameAlreadyUsedErrorMessage: i18n.translate(
        'xpack.indexLifecycleMgmt.editPolicy.policyNameAlreadyUsedError',
        {
          defaultMessage: 'That policy name is already used.',
        }
      ),
      policyNameMustBeDifferentErrorMessage: i18n.translate(
        'xpack.indexLifecycleMgmt.editPolicy.differentPolicyNameRequiredError',
        {
          defaultMessage: 'The policy name must be different.',
        }
      ),
      policyNameRequiredMessage: i18n.translate(
        'xpack.indexLifecycleMgmt.editPolicy.policyNameRequiredError',
        {
          defaultMessage: 'A policy name is required.',
        }
      ),
      policyNameStartsWithUnderscoreErrorMessage: i18n.translate(
        'xpack.indexLifecycleMgmt.editPolicy.policyNameStartsWithUnderscoreError',
        {
          defaultMessage: 'A policy name cannot start with an underscore.',
        }
      ),
      policyNameTooLongErrorMessage: i18n.translate(
        'xpack.indexLifecycleMgmt.editPolicy.policyNameTooLongError',
        {
          defaultMessage: 'A policy name cannot be longer than 255 bytes.',
        }
      ),
      searchableSnapshotRepoRequired: i18n.translate(
        'xpack.indexLifecycleMgmt.editPolicy.searchableSnapshotRepoRequiredError',
        {
          defaultMessage: 'A snapshot repository name is required.',
        }
      ),
    },
    titles: PHASE_TITLES,
    descriptions: PHASE_LONG_DESCRIPTIONS,
  },
};
