/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

import {
  byteSizeUnits,
  ROLLOVER_FORM_PATHS,
  ROLLOVER_RESTRICTION_FIELD_PATHS,
  timeUnits,
  type RolloverField,
} from '../../../../constants';
import { i18nTexts } from '../../../../i18n_texts';

export interface RolloverFieldConfig {
  menuLabel: string;
  path: string;
  testSubject: string;
  min?: number;
  unitPath?: string;
  unitTestSubject?: string;
  unitAriaLabel?: string;
  unitOptions?: Array<{ value: string; text: string }>;
  deprecationMessage?: string;
}

const menuLabels = {
  age: i18n.translate('xpack.indexLifecycleMgmt.hotPhase.rolloverMenu.ageLabel', {
    defaultMessage: 'Age',
  }),
  docs: i18n.translate('xpack.indexLifecycleMgmt.hotPhase.rolloverMenu.documentsLabel', {
    defaultMessage: 'Documents',
  }),
  indexSize: i18n.translate('xpack.indexLifecycleMgmt.hotPhase.rolloverMenu.indexSizeLabel', {
    defaultMessage: 'Index size',
  }),
  primaryShardDocs: i18n.translate(
    'xpack.indexLifecycleMgmt.hotPhase.rolloverMenu.primaryShardDocumentsLabel',
    {
      defaultMessage: 'Primary shard documents',
    }
  ),
  primaryShardSize: i18n.translate(
    'xpack.indexLifecycleMgmt.hotPhase.rolloverMenu.primaryShardSizeLabel',
    {
      defaultMessage: 'Primary shard size',
    }
  ),
};

const indexSizeDeprecationMessage = i18n.translate(
  'xpack.indexLifecycleMgmt.hotPhase.indexSizeDeprecationMessage',
  {
    defaultMessage:
      'The index size trigger is deprecated and will be removed in a future version. Use primary shard size instead.',
  }
);

export const rolloverFieldConfig: Record<RolloverField, RolloverFieldConfig> = {
  max_age: {
    menuLabel: menuLabels.age,
    path: ROLLOVER_FORM_PATHS.maxAge,
    testSubject: 'hot-selectedMaxAge',
    unitPath: '_meta.hot.customRollover.maxAgeUnit',
    unitTestSubject: 'hot-selectedMaxAgeUnits',
    unitAriaLabel: i18n.translate('xpack.indexLifecycleMgmt.hotPhase.maximumAgeUnitsAriaLabel', {
      defaultMessage: 'Maximum age units',
    }),
    unitOptions: timeUnits,
  },
  max_docs: {
    menuLabel: menuLabels.docs,
    path: ROLLOVER_FORM_PATHS.maxDocs,
    testSubject: 'hot-selectedMaxDocuments',
  },
  max_size: {
    menuLabel: menuLabels.indexSize,
    path: ROLLOVER_FORM_PATHS.maxSize,
    testSubject: 'hot-selectedMaxSizeStored',
    unitPath: '_meta.hot.customRollover.maxStorageSizeUnit',
    unitTestSubject: 'hot-selectedMaxSizeStoredUnits',
    unitAriaLabel: i18n.translate(
      'xpack.indexLifecycleMgmt.hotPhase.maximumIndexSizeUnitsAriaLabel',
      {
        defaultMessage: 'Maximum index size units',
      }
    ),
    unitOptions: byteSizeUnits,
    deprecationMessage: indexSizeDeprecationMessage,
  },
  max_primary_shard_docs: {
    menuLabel: menuLabels.primaryShardDocs,
    path: ROLLOVER_FORM_PATHS.maxPrimaryShardDocs,
    testSubject: 'hot-selectedMaxPrimaryShardDocs',
  },
  max_primary_shard_size: {
    menuLabel: menuLabels.primaryShardSize,
    path: ROLLOVER_FORM_PATHS.maxPrimaryShardSize,
    testSubject: 'hot-selectedMaxPrimaryShardSize',
    unitPath: '_meta.hot.customRollover.maxPrimaryShardSizeUnit',
    unitTestSubject: 'hot-selectedMaxPrimaryShardSizeUnits',
    unitAriaLabel: i18nTexts.editPolicy.maxPrimaryShardSizeUnitsLabel,
    unitOptions: byteSizeUnits,
  },
  min_age: {
    menuLabel: menuLabels.age,
    path: ROLLOVER_RESTRICTION_FIELD_PATHS.min_age,
    testSubject: 'hot-selectedMinAge',
    unitPath: '_meta.hot.customRollover.minAgeUnit',
    unitTestSubject: 'hot-selectedMinAgeUnits',
    unitAriaLabel: i18n.translate('xpack.indexLifecycleMgmt.hotPhase.minimumAgeUnitsAriaLabel', {
      defaultMessage: 'Minimum age units',
    }),
    unitOptions: timeUnits,
  },
  min_docs: {
    menuLabel: menuLabels.docs,
    path: ROLLOVER_RESTRICTION_FIELD_PATHS.min_docs,
    testSubject: 'hot-selectedMinDocuments',
    min: 0,
  },
  min_size: {
    menuLabel: menuLabels.indexSize,
    path: ROLLOVER_RESTRICTION_FIELD_PATHS.min_size,
    testSubject: 'hot-selectedMinSizeStored',
    unitPath: '_meta.hot.customRollover.minStorageSizeUnit',
    unitTestSubject: 'hot-selectedMinSizeStoredUnits',
    unitAriaLabel: i18n.translate(
      'xpack.indexLifecycleMgmt.hotPhase.minimumIndexSizeUnitsAriaLabel',
      {
        defaultMessage: 'Minimum index size units',
      }
    ),
    unitOptions: byteSizeUnits,
  },
  min_primary_shard_docs: {
    menuLabel: menuLabels.primaryShardDocs,
    path: ROLLOVER_RESTRICTION_FIELD_PATHS.min_primary_shard_docs,
    testSubject: 'hot-selectedMinPrimaryShardDocs',
  },
  min_primary_shard_size: {
    menuLabel: menuLabels.primaryShardSize,
    path: ROLLOVER_RESTRICTION_FIELD_PATHS.min_primary_shard_size,
    testSubject: 'hot-selectedMinPrimaryShardSize',
    unitPath: '_meta.hot.customRollover.minPrimaryShardSizeUnit',
    unitTestSubject: 'hot-selectedMinPrimaryShardSizeUnits',
    unitAriaLabel: i18n.translate(
      'xpack.indexLifecycleMgmt.hotPhase.minimumPrimaryShardSizeUnitsAriaLabel',
      {
        defaultMessage: 'Minimum primary shard size units',
      }
    ),
    unitOptions: byteSizeUnits,
  },
};
