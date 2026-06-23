/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiSpacer, EuiText, EuiIcon } from '@elastic/eui';

import { useKibana } from '../../../../../../common/lib/kibana';
import { DEFAULT_INDEX_KEY } from '../../../../../../../common/constants';
import { METRIC_TYPE, track, TELEMETRY_EVENT } from '../../../../../../common/lib/telemetry';
import { DEFAULT_SUPPRESSION_MISSING_FIELDS_STRATEGY } from '../../../../../../../common/detection_engine/constants';
import { useFetchIndex } from '../../../../../../common/containers/source';
import { BulkActionEditTypeEnum } from '../../../../../../../common/api/detection_engine/rule_management';
import type { BulkActionEditPayload } from '../../../../../../../common/api/detection_engine/rule_management';
import type {
  AlertSuppressionMissingFieldsStrategy,
  AlertSuppressionDuration,
} from '../../../../../../../common/api/detection_engine/model/rule_schema/common_attributes.gen';
import { useForm, fieldValidators } from '../../../../../../shared_imports';
import type { FormSchema } from '../../../../../../shared_imports';
import { BulkEditFormWrapper } from './bulk_edit_form_wrapper';
import {
  AlertSuppressionEdit,
  ALERT_SUPPRESSION_MISSING_FIELDS_FIELD_NAME,
  ALERT_SUPPRESSION_FIELDS_FIELD_NAME,
  ALERT_SUPPRESSION_DURATION_TYPE_FIELD_NAME,
  ALERT_SUPPRESSION_DURATION_FIELD_NAME,
  ALERT_SUPPRESSION_DEFAULT_DURATION,
} from '../../../../../rule_creation/components/alert_suppression_edit';
import { AlertSuppressionDurationType } from '../../../../../common/types';
import { bulkAlertSuppression as i18n } from '../translations';
import { useTermsAggregationFields } from '../../../../../../common/hooks/use_terms_aggregation_fields';

interface AlertSuppressionFormData {
  alertSuppressionFields: string[];
  alertSuppressionDurationType: AlertSuppressionDurationType;
  alertSuppressionDuration: AlertSuppressionDuration;
  alertSuppressionMissingFields?: AlertSuppressionMissingFieldsStrategy;
}

const formSchema: FormSchema<AlertSuppressionFormData> = {
  [ALERT_SUPPRESSION_FIELDS_FIELD_NAME]: {
    validations: [
      {
        validator: fieldValidators.emptyField(i18n.SUPPRESSION_REQUIRED_ERROR),
      },
      {
        validator: fieldValidators.maxLengthField({
          message: i18n.SUPPRESSION_MAX_LENGTH_ERROR,
          length: 3,
        }),
      },
    ],
  },
};

const initialFormData: AlertSuppressionFormData = {
  [ALERT_SUPPRESSION_FIELDS_FIELD_NAME]: [],
  [ALERT_SUPPRESSION_DURATION_TYPE_FIELD_NAME]: AlertSuppressionDurationType.PerRuleExecution,
  [ALERT_SUPPRESSION_DURATION_FIELD_NAME]: ALERT_SUPPRESSION_DEFAULT_DURATION,
  [ALERT_SUPPRESSION_MISSING_FIELDS_FIELD_NAME]: DEFAULT_SUPPRESSION_MISSING_FIELDS_STRATEGY,
};

interface AlertSuppressionFormProps {
  editAction: BulkActionEditTypeEnum['set_alert_suppression'];
  rulesCount: number;
  onClose: () => void;
  onConfirm: (bulkActionEditPayload: BulkActionEditPayload) => void;
}

export const SetAlertSuppressionForm = React.memo(function SetAlertSuppressionForm({
  editAction,
  rulesCount,
  onClose,
  onConfirm,
}: AlertSuppressionFormProps) {
  const { form } = useForm({
    defaultValue: initialFormData,
    schema: formSchema,
  });
  const { uiSettings } = useKibana().services;
  const defaultPatterns = uiSettings.get<string[]>(DEFAULT_INDEX_KEY);

  const [isFetchingIndexFields, { indexPatterns }] = useFetchIndex(defaultPatterns, false);
  const suppressibleFields = useTermsAggregationFields(indexPatterns?.fields);

  const handleSubmit = async () => {
    const { data, isValid } = await form.submit();
    if (!isValid) {
      return;
    }

    const durationValue =
      data[ALERT_SUPPRESSION_DURATION_TYPE_FIELD_NAME] ===
      AlertSuppressionDurationType.PerTimePeriod
        ? data[ALERT_SUPPRESSION_DURATION_FIELD_NAME]
        : undefined;

    const suppressionPayload = {
      value: {
        group_by: data.alertSuppressionFields,
        missing_fields_strategy: data[ALERT_SUPPRESSION_MISSING_FIELDS_FIELD_NAME],
        duration: durationValue,
      },
      type: BulkActionEditTypeEnum.set_alert_suppression,
    };

    onConfirm(suppressionPayload);
    track(METRIC_TYPE.CLICK, TELEMETRY_EVENT.SET_ALERT_SUPPRESSION);
  };

  return (
    <BulkEditFormWrapper
      form={form}
      onClose={onClose}
      onSubmit={handleSubmit}
      title={i18n.SET_TITLE}
    >
      <EuiFlexGroup gutterSize="s">
        <EuiFlexItem grow={false}>
          <EuiIcon type="info" aria-hidden={true} />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiText size="xs">{i18n.SUPPRESSION_INFO_TEXT}</EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="l" />

      <AlertSuppressionEdit
        suppressibleFields={suppressibleFields}
        isLoading={isFetchingIndexFields}
        fullWidth
      />
    </BulkEditFormWrapper>
  );
});
