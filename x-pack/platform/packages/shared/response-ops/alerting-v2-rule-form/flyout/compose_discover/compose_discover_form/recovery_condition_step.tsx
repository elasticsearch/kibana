/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiFormRow, EuiHorizontalRule, EuiSpacer, EuiSuperSelect, EuiText } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type {
  ComposeDiscoverAction,
  ComposeDiscoverState,
  CustomRecoveryRenderProps,
  RecoveryType,
} from '../types';
import { RecoveryDelayField } from '../../../form/fields/recovery_delay_field';

const defaultRecoveryLabel = i18n.translate(
  'xpack.alertingV2.composeDiscover.recoveryCondition.defaultRecoveryDropDownOptionLabel',
  { defaultMessage: 'Default recovery' }
);

const defaultRecoveryDescription = i18n.translate(
  'xpack.alertingV2.composeDiscover.recoveryCondition.defaultRecoveryDescription',
  { defaultMessage: 'Recover automatically when the alert condition is no longer met.' }
);

const customRecoveryLabel = i18n.translate(
  'xpack.alertingV2.composeDiscover.recoveryCondition.customRecoveryDropDownOptionLabel',
  { defaultMessage: 'Custom recovery' }
);

const customRecoveryDescription = i18n.translate(
  'xpack.alertingV2.composeDiscover.recoveryCondition.customRecoveryDescription',
  { defaultMessage: 'Define a custom recovery condition.' }
);

const RECOVERY_TYPE_OPTIONS: Array<{
  value: RecoveryType;
  inputDisplay: string;
  dropdownDisplay: React.ReactNode;
}> = [
  {
    value: 'default',
    inputDisplay: defaultRecoveryLabel,
    dropdownDisplay: (
      <>
        <strong>{defaultRecoveryLabel}</strong>
        <EuiText size="s" color="subdued">
          <p>{defaultRecoveryDescription}</p>
        </EuiText>
      </>
    ),
  },
  {
    value: 'custom',
    inputDisplay: customRecoveryLabel,
    dropdownDisplay: (
      <>
        <strong>{customRecoveryLabel}</strong>
        <EuiText size="s" color="subdued">
          <p>{customRecoveryDescription}</p>
        </EuiText>
      </>
    ),
  },
];

interface RecoveryTypeSelectorProps {
  recoveryType: RecoveryType;
  onRecoveryTypeChange: (type: RecoveryType) => void;
}

const RecoveryTypeSelector: React.FC<RecoveryTypeSelectorProps> = ({
  recoveryType,
  onRecoveryTypeChange,
}) => (
  <EuiFormRow
    label={i18n.translate('xpack.alertingV2.composeDiscover.recoveryCondition.recoveryTypeLabel', {
      defaultMessage: 'Recovery',
    })}
    fullWidth
  >
    <EuiSuperSelect
      compressed
      options={RECOVERY_TYPE_OPTIONS}
      valueOfSelected={recoveryType}
      onChange={(val) => onRecoveryTypeChange(val as RecoveryType)}
      fullWidth
      data-test-subj="composeDiscoverRecoveryType"
    />
  </EuiFormRow>
);

interface RecoveryConditionStepProps {
  state: ComposeDiscoverState;
  dispatch: React.Dispatch<ComposeDiscoverAction>;
  onRecoveryTypeChange: (type: RecoveryType) => void;
  renderCustomRecovery?: (props: CustomRecoveryRenderProps) => React.ReactNode;
}

export function RecoveryConditionStep({
  state,
  dispatch,
  onRecoveryTypeChange,
  renderCustomRecovery,
}: RecoveryConditionStepProps) {
  return (
    <>
      <RecoveryTypeSelector
        recoveryType={state.recoveryType}
        onRecoveryTypeChange={onRecoveryTypeChange}
      />

      {state.recoveryType === 'custom' && renderCustomRecovery && (
        <>
          <EuiSpacer size="l" />
          <EuiHorizontalRule margin="none" />
          <EuiSpacer size="m" />
          {renderCustomRecovery({ state, dispatch })}
        </>
      )}

      <EuiSpacer size="m" />
      <RecoveryDelayField />
    </>
  );
}
