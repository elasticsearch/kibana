/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RolloverAction } from '../../../common/types';
import type {
  RolloverRestrictionField,
  RolloverTriggerField,
} from '../sections/edit_policy/constants';
import { DEFAULT_ROLLOVER_TRIGGER_FIELDS } from '../sections/edit_policy/constants';

export const recommendedRolloverFormValues = {
  max_age: '30',
  max_primary_shard_size: '50',
  maxAgeUnit: 'd',
  maxPrimaryShardSizeUnit: 'gb',
} as const;

export const hasRecommendedRolloverDefaults = ({
  rollover,
  triggerFields,
  restrictionFields,
  maxAgeUnit,
  maxPrimaryShardSizeUnit,
}: {
  rollover?: RolloverAction;
  triggerFields?: RolloverTriggerField[];
  restrictionFields?: RolloverRestrictionField[];
  maxAgeUnit?: string;
  maxPrimaryShardSizeUnit?: string;
}): boolean => {
  const selectedTriggerFields = triggerFields ?? [];
  const selectedRestrictionFields = restrictionFields ?? [];
  const hasOnlyRecommendedFields =
    selectedTriggerFields.length === DEFAULT_ROLLOVER_TRIGGER_FIELDS.length &&
    DEFAULT_ROLLOVER_TRIGGER_FIELDS.every((field) => selectedTriggerFields.includes(field));

  return Boolean(
    hasOnlyRecommendedFields &&
      selectedRestrictionFields.length === 0 &&
      `${rollover?.max_age ?? ''}` === recommendedRolloverFormValues.max_age &&
      `${rollover?.max_primary_shard_size ?? ''}` ===
        recommendedRolloverFormValues.max_primary_shard_size &&
      (maxAgeUnit ?? recommendedRolloverFormValues.maxAgeUnit) ===
        recommendedRolloverFormValues.maxAgeUnit &&
      (maxPrimaryShardSizeUnit ?? recommendedRolloverFormValues.maxPrimaryShardSizeUnit) ===
        recommendedRolloverFormValues.maxPrimaryShardSizeUnit
  );
};
