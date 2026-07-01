/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FunctionComponent } from 'react';
import React, { useMemo } from 'react';
import { get } from 'lodash';
import { i18n } from '@kbn/i18n';
import { EuiButtonEmpty, EuiToolTip } from '@elastic/eui';

import { useFormContext, useFormData } from '../../../../../../../shared_imports';
import {
  DEFAULT_ROLLOVER_TRIGGER_FIELDS,
  ROLLOVER_FORM_PATHS,
  ROLLOVER_RESTRICTION_FIELD_PATH,
  ROLLOVER_RESTRICTION_FIELD_PATHS,
  ROLLOVER_TRIGGER_FIELD_PATH,
} from '../../../../constants';
import { i18nTexts } from '../../../../i18n_texts';
import {
  hasRecommendedRolloverDefaults,
  recommendedRolloverFormValues,
} from '../../../../../../lib';

export const RolloverRecommendedDefaultsButton: FunctionComponent = () => {
  const { setFieldValue } = useFormContext();
  const [formData] = useFormData({
    watch: [
      ROLLOVER_TRIGGER_FIELD_PATH,
      ROLLOVER_RESTRICTION_FIELD_PATH,
      ROLLOVER_FORM_PATHS.maxAge,
      ROLLOVER_FORM_PATHS.maxPrimaryShardSize,
      '_meta.hot.customRollover.maxAgeUnit',
      '_meta.hot.customRollover.maxPrimaryShardSizeUnit',
    ],
  });
  const isUsingRecommendedDefaults = useMemo(
    () =>
      hasRecommendedRolloverDefaults({
        rollover: get(formData, 'phases.hot.actions.rollover'),
        triggerFields: get(formData, ROLLOVER_TRIGGER_FIELD_PATH),
        restrictionFields: get(formData, ROLLOVER_RESTRICTION_FIELD_PATH),
        maxAgeUnit: get(formData, '_meta.hot.customRollover.maxAgeUnit'),
        maxPrimaryShardSizeUnit: get(formData, '_meta.hot.customRollover.maxPrimaryShardSizeUnit'),
      }),
    [formData]
  );
  const button = (
    <EuiButtonEmpty
      flush="left"
      size="xs"
      isDisabled={isUsingRecommendedDefaults}
      onClick={() => {
        setFieldValue(ROLLOVER_TRIGGER_FIELD_PATH, DEFAULT_ROLLOVER_TRIGGER_FIELDS);
        setFieldValue(ROLLOVER_RESTRICTION_FIELD_PATH, []);
        setFieldValue(ROLLOVER_FORM_PATHS.maxAge, recommendedRolloverFormValues.max_age);
        setFieldValue(
          ROLLOVER_FORM_PATHS.maxPrimaryShardSize,
          recommendedRolloverFormValues.max_primary_shard_size
        );
        setFieldValue(
          '_meta.hot.customRollover.maxAgeUnit',
          recommendedRolloverFormValues.maxAgeUnit
        );
        setFieldValue(
          '_meta.hot.customRollover.maxPrimaryShardSizeUnit',
          recommendedRolloverFormValues.maxPrimaryShardSizeUnit
        );
        Object.values(ROLLOVER_RESTRICTION_FIELD_PATHS).forEach((path) => {
          setFieldValue(path, undefined);
        });
      }}
      data-test-subj="rolloverRestoreRecommendedDefaults"
    >
      {i18nTexts.editPolicy.restoreRecommendedRolloverDefaultsLabel}
    </EuiButtonEmpty>
  );

  if (!isUsingRecommendedDefaults) {
    return button;
  }

  return (
    <EuiToolTip
      content={i18n.translate(
        'xpack.indexLifecycleMgmt.hotPhase.recommendedRolloverDefaultsAppliedTooltip',
        {
          defaultMessage: 'Recommended defaults are already applied',
        }
      )}
    >
      {button}
    </EuiToolTip>
  );
};
