/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { cloneDeep } from 'lodash';

import type { RolloverAction, SerializedPolicy } from '../../../../../common/types';
import { splitSizeAndUnits } from '../../../lib/policies';
import { determineDataTierAllocationType } from '../../../lib';
import { getDefaultRepository } from '../lib';
import type { FormInternal } from '../types';
import {
  CLOUD_DEFAULT_REPO,
  DEFAULT_ROLLOVER_TRIGGER_FIELDS,
  ROLLOVER_RESTRICTION_FIELDS,
  ROLLOVER_TRIGGER_FIELDS,
  type RolloverRestrictionField,
  type RolloverTriggerField,
} from '../constants';

const getInitialRolloverTriggerFields = (rollover?: RolloverAction): RolloverTriggerField[] => {
  if (!rollover) {
    return DEFAULT_ROLLOVER_TRIGGER_FIELDS;
  }

  const triggerFields = ROLLOVER_TRIGGER_FIELDS.filter((field) => rollover[field] !== undefined);
  const isUsingOnlyRecommendedTriggers =
    triggerFields.length === DEFAULT_ROLLOVER_TRIGGER_FIELDS.length &&
    DEFAULT_ROLLOVER_TRIGGER_FIELDS.every((field) => triggerFields.includes(field));

  return isUsingOnlyRecommendedTriggers ? DEFAULT_ROLLOVER_TRIGGER_FIELDS : triggerFields;
};

const getInitialRolloverRestrictionFields = (
  rollover?: RolloverAction
): RolloverRestrictionField[] => {
  if (!rollover) {
    return [];
  }

  return ROLLOVER_RESTRICTION_FIELDS.filter((field) => rollover[field] !== undefined);
};

export const createDeserializer =
  (isCloudEnabled: boolean) =>
  (policy: SerializedPolicy): FormInternal => {
    const {
      phases: { hot, warm, cold, frozen, delete: deletePhase },
    } = policy;

    let defaultRepository = getDefaultRepository([
      hot?.actions.searchable_snapshot,
      cold?.actions.searchable_snapshot,
      frozen?.actions.searchable_snapshot,
    ]);

    if (!defaultRepository && isCloudEnabled) {
      defaultRepository = CLOUD_DEFAULT_REPO;
    }

    const rollover = hot?.actions?.rollover;
    const _meta: FormInternal['_meta'] = {
      hot: {
        enabled: Boolean(hot),
        customRollover: {
          enabled: Boolean(rollover),
          triggerFields: getInitialRolloverTriggerFields(rollover),
          restrictionFields: getInitialRolloverRestrictionFields(rollover),
        },
        bestCompression: hot?.actions?.forcemerge?.index_codec === 'best_compression',
        readonlyEnabled: Boolean(hot?.actions?.readonly),
        shrink: { isUsingShardSize: Boolean(hot?.actions.shrink?.max_primary_shard_size) },
        downsample: {
          enabled: Boolean(hot?.actions?.downsample),
        },
      },
      warm: {
        enabled: Boolean(warm),
        warmPhaseOnRollover: warm === undefined ? true : Boolean(warm.min_age === '0ms'),
        bestCompression: warm?.actions?.forcemerge?.index_codec === 'best_compression',
        dataTierAllocationType: determineDataTierAllocationType(warm?.actions),
        readonlyEnabled: Boolean(warm?.actions?.readonly),
        minAgeToMilliSeconds: -1,
        shrink: { isUsingShardSize: Boolean(warm?.actions.shrink?.max_primary_shard_size) },
        downsample: {
          enabled: Boolean(warm?.actions?.downsample),
        },
      },
      cold: {
        enabled: Boolean(cold),
        dataTierAllocationType: determineDataTierAllocationType(cold?.actions),
        readonlyEnabled: Boolean(cold?.actions?.readonly),
        minAgeToMilliSeconds: -1,
        downsample: {
          enabled: Boolean(cold?.actions?.downsample),
        },
      },
      frozen: {
        enabled: Boolean(frozen),
        minAgeToMilliSeconds: -1,
      },
      delete: {
        enabled: Boolean(deletePhase),
        minAgeToMilliSeconds: -1,
      },
      searchableSnapshot: {
        repository: defaultRepository,
      },
    };

    const result = cloneDeep<FormInternal>({
      ...policy,
      _meta,
    });
    if (!result.phases.hot) {
      result.phases.hot = { actions: {} };
    }
    if (result.phases.hot?.actions?.rollover) {
      if (result.phases.hot.actions.rollover.max_size) {
        const maxSize = splitSizeAndUnits(result.phases.hot.actions.rollover.max_size);
        result.phases.hot.actions.rollover.max_size = maxSize.size;
        result._meta.hot.customRollover.maxStorageSizeUnit = maxSize.units;
      }

      if (result.phases.hot.actions.rollover.max_primary_shard_size) {
        const maxPrimaryShardSize = splitSizeAndUnits(
          result.phases.hot.actions.rollover.max_primary_shard_size
        );
        result.phases.hot.actions.rollover.max_primary_shard_size = maxPrimaryShardSize.size;
        result._meta.hot.customRollover.maxPrimaryShardSizeUnit = maxPrimaryShardSize.units;
      }

      if (result.phases.hot.actions.rollover.max_age) {
        const maxAge = splitSizeAndUnits(result.phases.hot.actions.rollover.max_age);
        result.phases.hot.actions.rollover.max_age = maxAge.size;
        result._meta.hot.customRollover.maxAgeUnit = maxAge.units;
      }

      if (result.phases.hot.actions.rollover.min_size) {
        const minSize = splitSizeAndUnits(result.phases.hot.actions.rollover.min_size);
        result.phases.hot.actions.rollover.min_size = minSize.size;
        result._meta.hot.customRollover.minStorageSizeUnit = minSize.units;
      }

      if (result.phases.hot.actions.rollover.min_primary_shard_size) {
        const minPrimaryShardSize = splitSizeAndUnits(
          result.phases.hot.actions.rollover.min_primary_shard_size
        );
        result.phases.hot.actions.rollover.min_primary_shard_size = minPrimaryShardSize.size;
        result._meta.hot.customRollover.minPrimaryShardSizeUnit = minPrimaryShardSize.units;
      }

      if (result.phases.hot.actions.rollover.min_age) {
        const minAge = splitSizeAndUnits(result.phases.hot.actions.rollover.min_age);
        result.phases.hot.actions.rollover.min_age = minAge.size;
        result._meta.hot.customRollover.minAgeUnit = minAge.units;
      }
    }
    if (result.phases.hot?.actions.shrink?.max_primary_shard_size) {
      const primaryShardSize = splitSizeAndUnits(
        result.phases.hot.actions.shrink.max_primary_shard_size!
      );
      result.phases.hot.actions.shrink.max_primary_shard_size = primaryShardSize.size;
      result._meta.hot.shrink.maxPrimaryShardSizeUnits = primaryShardSize.units;
    }

    if (result.phases.hot?.actions.downsample?.fixed_interval) {
      const downsampleInterval = splitSizeAndUnits(
        result.phases.hot.actions.downsample.fixed_interval
      );
      result._meta.hot.downsample.fixedIntervalUnits = downsampleInterval.units;
      result._meta.hot.downsample.fixedIntervalSize = downsampleInterval.size;
    }

    if (result.phases.warm) {
      if (result.phases.warm.actions?.allocate?.require) {
        Object.entries(result.phases.warm.actions.allocate.require).forEach((entry) => {
          result._meta.warm.allocationNodeAttribute = entry.join(':');
        });
      }

      if (result.phases.warm.min_age) {
        const minAge = splitSizeAndUnits(result.phases.warm.min_age);
        result.phases.warm.min_age = minAge.size;
        result._meta.warm.minAgeUnit = minAge.units;
      }

      if (result.phases.warm.actions.shrink?.max_primary_shard_size) {
        const primaryShardSize = splitSizeAndUnits(
          result.phases.warm.actions.shrink.max_primary_shard_size!
        );
        result.phases.warm.actions.shrink.max_primary_shard_size = primaryShardSize.size;
        result._meta.warm.shrink.maxPrimaryShardSizeUnits = primaryShardSize.units;
      }

      if (result.phases.warm?.actions.downsample?.fixed_interval) {
        const downsampleInterval = splitSizeAndUnits(
          result.phases.warm.actions.downsample.fixed_interval
        );
        result._meta.warm.downsample.fixedIntervalUnits = downsampleInterval.units;
        result._meta.warm.downsample.fixedIntervalSize = downsampleInterval.size;
      }
    }

    if (result.phases.cold) {
      if (result.phases.cold.actions?.allocate?.require) {
        Object.entries(result.phases.cold.actions.allocate.require).forEach((entry) => {
          result._meta.cold.allocationNodeAttribute = entry.join(':');
        });
      }

      if (result.phases.cold.min_age) {
        const minAge = splitSizeAndUnits(result.phases.cold.min_age);
        result.phases.cold.min_age = minAge.size;
        result._meta.cold.minAgeUnit = minAge.units;
      }

      if (result.phases.cold?.actions.downsample?.fixed_interval) {
        const downsampleInterval = splitSizeAndUnits(
          result.phases.cold.actions.downsample.fixed_interval
        );
        result._meta.cold.downsample.fixedIntervalUnits = downsampleInterval.units;
        result._meta.cold.downsample.fixedIntervalSize = downsampleInterval.size;
      }
    }

    if (result.phases.frozen) {
      if (result.phases.frozen.min_age) {
        const minAge = splitSizeAndUnits(result.phases.frozen.min_age);
        result.phases.frozen.min_age = minAge.size;
        result._meta.frozen.minAgeUnit = minAge.units;
      }
    }

    if (result.phases.delete) {
      if (result.phases.delete.min_age) {
        const minAge = splitSizeAndUnits(result.phases.delete.min_age);
        result.phases.delete.min_age = minAge.size;
        result._meta.delete.minAgeUnit = minAge.units;
      }
    }

    return result;
  };
