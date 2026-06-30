/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiBadge,
  EuiButton,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import type { CustomDurationState, SnoozeUnit } from './types';
import { SnoozeDurationPicker } from './snooze_duration_picker';
import * as i18n from './translations';

export type TimeConditionStatus = 'editing' | 'confirmed';

export interface TimeConditionState extends CustomDurationState {
  status: TimeConditionStatus;
}

export const NEW_TIME_CONDITION: TimeConditionState = {
  status: 'editing',
  mode: 'duration',
  value: 1,
  unit: 'h' as SnoozeUnit,
  dateTime: null,
};

export interface TimeConditionPanelProps {
  value: TimeConditionState | null;
  chipLabel: string;
  isConditionInvalid: boolean;
  isDurationInvalid: boolean;
  isDateTimeInvalid: boolean;
  onChange: (newValue: TimeConditionState | null) => void;
}

export const TimeConditionPanel = ({
  value,
  chipLabel,
  isConditionInvalid,
  isDurationInvalid,
  isDateTimeInvalid,
  onChange,
}: TimeConditionPanelProps) => {
  if (value?.status === 'confirmed') {
    return (
      <EuiPanel hasBorder={true} color="subdued" paddingSize="s" data-test-subj="timeConditionChip">
        <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiIcon type="clock" color="subdued" aria-hidden={true} />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="s" color="subdued">
              {i18n.SNOOZE_UNTIL_CHIP_LABEL}
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiBadge color="hollow">{chipLabel}</EuiBadge>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiToolTip content={i18n.EDIT_TIME_CONDITION_ARIA_LABEL} disableScreenReaderOutput>
              <EuiButtonIcon
                iconType="pencil"
                aria-label={i18n.EDIT_TIME_CONDITION_ARIA_LABEL}
                onClick={() => onChange({ ...value, status: 'editing' })}
                data-test-subj="editTimeCondition"
              />
            </EuiToolTip>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiToolTip content={i18n.REMOVE_TIME_CONDITION_ARIA_LABEL} disableScreenReaderOutput>
              <EuiButtonIcon
                iconType="trash"
                color="danger"
                aria-label={i18n.REMOVE_TIME_CONDITION_ARIA_LABEL}
                onClick={() => onChange(null)}
                data-test-subj="removeTimeCondition"
              />
            </EuiToolTip>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
    );
  }

  if (value?.status === 'editing') {
    return (
      <EuiPanel hasBorder paddingSize="s">
        <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiIcon type="clock" aria-hidden={true} />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText size="s">
              <strong>{i18n.TIME_CONDITION_LABEL}</strong>
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiToolTip content={i18n.CONFIRM_CONDITION_ARIA_LABEL} disableScreenReaderOutput>
              <EuiButtonIcon
                iconType="check"
                color="success"
                display="base"
                aria-label={i18n.CONFIRM_CONDITION_ARIA_LABEL}
                onClick={() => onChange({ ...value, status: 'confirmed' })}
                isDisabled={isConditionInvalid}
                data-test-subj="confirmTimeCondition"
              />
            </EuiToolTip>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiToolTip content={i18n.REMOVE_TIME_CONDITION_ARIA_LABEL} disableScreenReaderOutput>
              <EuiButtonIcon
                iconType="cross"
                aria-label={i18n.REMOVE_TIME_CONDITION_ARIA_LABEL}
                onClick={() => onChange(null)}
                data-test-subj="removeTimeCondition"
              />
            </EuiToolTip>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="s" />
        <SnoozeDurationPicker
          value={value}
          onChange={(update) => onChange({ ...value, ...update })}
          isDurationInvalid={isDurationInvalid}
          isDateTimeInvalid={isDateTimeInvalid}
        />
      </EuiPanel>
    );
  }

  return (
    <EuiButton
      iconType="clock"
      size="s"
      color="text"
      onClick={() => onChange(NEW_TIME_CONDITION)}
      data-test-subj="addTimeCondition"
    >
      {i18n.ADD_TIME_CONDITION}
    </EuiButton>
  );
};
