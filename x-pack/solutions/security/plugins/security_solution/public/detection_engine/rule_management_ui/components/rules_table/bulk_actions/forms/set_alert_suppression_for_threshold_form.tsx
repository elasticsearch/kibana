/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiSpacer, EuiText, EuiIcon, EuiFormRow } from '@elastic/eui';

import { METRIC_TYPE, track, TELEMETRY_EVENT } from '../../../../../../common/lib/telemetry';
import { BulkActionEditTypeEnum } from '../../../../../../../common/api/detection_engine/rule_management';
import type { BulkActionEditPayload } from '../../../../../../../common/api/detection_engine/rule_management';
import type { AlertSuppressionDuration } from '../../../../../../../common/api/detection_engine/model/rule_schema/common_attributes.gen';
import { useForm, UseMultiFields } from '../../../../../../shared_imports';
import { BulkEditFormWrapper } from './bulk_edit_form_wrapper';
import { ALERT_SUPPRESSION_DEFAULT_DURATION } from '../../../../../rule_creation/components/alert_suppression_edit';
import { bulkAlertSuppression as i18n } from '../translations';
import { DurationInput } from '../../../../../rule_creation/components/duration_input';

type FormData = AlertSuppressionDuration;

const initialFormData: FormData = ALERT_SUPPRESSION_DEFAULT_DURATION;

interface AlertSuppressionFormProps {
  editAction: BulkActionEditTypeEnum['set_alert_suppression_for_threshold'];
  rulesCount: number;
  onClose: () => void;
  onConfirm: (bulkActionEditPayload: BulkActionEditPayload) => void;
}

export const SetAlertSuppressionForThresholdForm = React.memo(function SetAlertSuppressionForm({
  editAction,
  rulesCount,
  onClose,
  onConfirm,
}: AlertSuppressionFormProps) {
  const { form } = useForm<FormData>({
    defaultValue: initialFormData,
  });

  const handleSubmit = async () => {
    const { data, isValid } = await form.submit();
    if (!isValid) {
      return;
    }

    onConfirm({
      value: {
        duration: data,
      },
      type: BulkActionEditTypeEnum.set_alert_suppression_for_threshold,
    });

    track(METRIC_TYPE.CLICK, TELEMETRY_EVENT.SET_ALERT_SUPPRESSION_FOR_THRESHOLD);
  };

  return (
    <BulkEditFormWrapper
      form={form}
      onClose={onClose}
      onSubmit={handleSubmit}
      title={i18n.SET_FOR_THRESHOLD_TITLE}
    >
      <EuiFlexGroup gutterSize="s">
        <EuiFlexItem grow={false}>
          <EuiIcon type="info" aria-hidden={true} />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiText size="xs">{i18n.SUPPRESSION_FOR_THRESHOLD_INFO_TEXT}</EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="l" />
      <EuiFormRow
        data-test-subj="alertSuppressionDuration"
        label={i18n.DURATION_PER_TIME_PERIOD_LABEL}
        helpText={i18n.DURATION_PER_TIME_PERIOD_HELP_TEXT}
      >
        <UseMultiFields<{
          suppressionDurationValue: number | undefined;
          suppressionDurationUnit: string;
        }>
          fields={{
            suppressionDurationValue: {
              path: `value`,
            },
            suppressionDurationUnit: {
              path: `unit`,
            },
          }}
        >
          {({ suppressionDurationValue, suppressionDurationUnit }) => (
            <DurationInput
              isDisabled={false}
              durationValueField={suppressionDurationValue}
              durationUnitField={suppressionDurationUnit}
              aria-label={i18n.DURATION_PER_TIME_PERIOD_INPUT}
              minimumValue={1}
            />
          )}
        </UseMultiFields>
      </EuiFormRow>
    </BulkEditFormWrapper>
  );
});
