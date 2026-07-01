/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { PhaseWithDownsample, RolloverAction } from '../../../../common/types';

export const isUsingCustomRolloverPath = '_meta.hot.customRollover.enabled';

export const isUsingDownsamplePath = (phase: PhaseWithDownsample) =>
  `_meta.${phase}.downsample.enabled`;

/**
 * These strings describe the path to their respective values in the serialized
 * ILM form.
 */
export const ROLLOVER_FORM_PATHS = {
  maxDocs: 'phases.hot.actions.rollover.max_docs',
  maxAge: 'phases.hot.actions.rollover.max_age',
  maxSize: 'phases.hot.actions.rollover.max_size',
  maxPrimaryShardSize: 'phases.hot.actions.rollover.max_primary_shard_size',
  maxPrimaryShardDocs: 'phases.hot.actions.rollover.max_primary_shard_docs',
};

export type RolloverTriggerField = Extract<
  keyof RolloverAction,
  'max_age' | 'max_docs' | 'max_primary_shard_size' | 'max_primary_shard_docs' | 'max_size'
>;

export type RolloverRestrictionField = Extract<
  keyof RolloverAction,
  'min_age' | 'min_docs' | 'min_primary_shard_size' | 'min_primary_shard_docs' | 'min_size'
>;

export type RolloverField = RolloverTriggerField | RolloverRestrictionField;

export const ROLLOVER_TRIGGER_FIELD_PATHS: Record<RolloverTriggerField, string> = {
  max_age: ROLLOVER_FORM_PATHS.maxAge,
  max_docs: ROLLOVER_FORM_PATHS.maxDocs,
  max_primary_shard_size: ROLLOVER_FORM_PATHS.maxPrimaryShardSize,
  max_primary_shard_docs: ROLLOVER_FORM_PATHS.maxPrimaryShardDocs,
  max_size: ROLLOVER_FORM_PATHS.maxSize,
};

export const ROLLOVER_RESTRICTION_FIELD_PATHS: Record<RolloverRestrictionField, string> = {
  min_age: 'phases.hot.actions.rollover.min_age',
  min_docs: 'phases.hot.actions.rollover.min_docs',
  min_primary_shard_size: 'phases.hot.actions.rollover.min_primary_shard_size',
  min_primary_shard_docs: 'phases.hot.actions.rollover.min_primary_shard_docs',
  min_size: 'phases.hot.actions.rollover.min_size',
};

export const ROLLOVER_FIELD_PATHS: Record<RolloverField, string> = {
  ...ROLLOVER_TRIGGER_FIELD_PATHS,
  ...ROLLOVER_RESTRICTION_FIELD_PATHS,
};

export const ROLLOVER_TRIGGER_FIELDS: RolloverTriggerField[] = [
  'max_age',
  'max_primary_shard_size',
  'max_docs',
  'max_size',
  'max_primary_shard_docs',
];

export const ROLLOVER_RESTRICTION_FIELDS: RolloverRestrictionField[] = [
  'min_age',
  'min_docs',
  'min_size',
  'min_primary_shard_docs',
  'min_primary_shard_size',
];

export const DEFAULT_ROLLOVER_TRIGGER_FIELDS: RolloverTriggerField[] = [
  'max_age',
  'max_primary_shard_size',
];

export const ROLLOVER_TRIGGER_FIELD_PATH = '_meta.hot.customRollover.triggerFields';
export const ROLLOVER_RESTRICTION_FIELD_PATH = '_meta.hot.customRollover.restrictionFields';

export const ROLLOVER_UNIT_PATHS: Partial<Record<RolloverField, string>> = {
  max_age: '_meta.hot.customRollover.maxAgeUnit',
  max_primary_shard_size: '_meta.hot.customRollover.maxPrimaryShardSizeUnit',
  max_size: '_meta.hot.customRollover.maxStorageSizeUnit',
  min_age: '_meta.hot.customRollover.minAgeUnit',
  min_primary_shard_size: '_meta.hot.customRollover.minPrimaryShardSizeUnit',
  min_size: '_meta.hot.customRollover.minStorageSizeUnit',
};

export const ROLLOVER_RESTRICTION_TO_TRIGGER_FIELD: Record<
  RolloverRestrictionField,
  RolloverTriggerField
> = {
  min_age: 'max_age',
  min_docs: 'max_docs',
  min_size: 'max_size',
  min_primary_shard_size: 'max_primary_shard_size',
  min_primary_shard_docs: 'max_primary_shard_docs',
};

/**
 * This repository is provisioned by Elastic Cloud and will always
 * exist as a "managed" repository.
 */
export const CLOUD_DEFAULT_REPO = 'found-snapshots';

/*
 * Labels for byte size units
 */
export const byteSizeUnits = [
  {
    value: 'b',
    text: i18n.translate('xpack.indexLifecycleMgmt.editPolicy.byteSizeUnits.bytesLabel', {
      defaultMessage: 'bytes',
    }),
  },
  {
    value: 'kb',
    text: i18n.translate('xpack.indexLifecycleMgmt.editPolicy.byteSizeUnits.kilobytesLabel', {
      defaultMessage: 'kilobytes',
    }),
  },
  {
    value: 'mb',
    text: i18n.translate('xpack.indexLifecycleMgmt.editPolicy.byteSizeUnits.megabytesLabel', {
      defaultMessage: 'megabytes',
    }),
  },
  {
    value: 'gb',
    text: i18n.translate('xpack.indexLifecycleMgmt.editPolicy.byteSizeUnits.gigabytesLabel', {
      defaultMessage: 'gigabytes',
    }),
  },
  {
    value: 'tb',
    text: i18n.translate('xpack.indexLifecycleMgmt.editPolicy.byteSizeUnits.terabytesLabel', {
      defaultMessage: 'terabytes',
    }),
  },
  {
    value: 'pb',
    text: i18n.translate('xpack.indexLifecycleMgmt.editPolicy.byteSizeUnits.petabytesLabel', {
      defaultMessage: 'petabytes',
    }),
  },
];

/*
 * Labels for time units
 */
export const timeUnits = [
  {
    value: 'm',
    text: i18n.translate('xpack.indexLifecycleMgmt.editPolicy.timeUnits.minutesLabel', {
      defaultMessage: 'minutes',
    }),
  },
  {
    value: 'h',
    text: i18n.translate('xpack.indexLifecycleMgmt.editPolicy.timeUnits.hoursLabel', {
      defaultMessage: 'hours',
    }),
  },
  {
    value: 'd',
    text: i18n.translate('xpack.indexLifecycleMgmt.editPolicy.timeUnits.daysLabel', {
      defaultMessage: 'days',
    }),
  },
];
