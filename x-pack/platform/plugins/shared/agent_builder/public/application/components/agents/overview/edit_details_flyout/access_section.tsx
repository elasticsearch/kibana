/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiIcon,
  EuiSpacer,
  EuiSuperSelect,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import type { IconType } from '@elastic/eui';
import { AgentAccessControlMode, ACCESS_CONTROL_MODE_ICON } from '@kbn/agent-builder-common';
import { Controller, useFormContext } from 'react-hook-form';
import { labels } from '../../../../utils/i18n';
import {
  ACCESS_CONTROL_MODE_LABELS,
  ACCESS_CONTROL_MODE_TOOLTIPS,
} from '../../../../utils/access_control_mode_i18n';
import type { EditDetailsFormData } from './types';

const { editDetails: flyoutLabels } = labels.agentOverview;

interface AccessSectionProps {
  canChangeAccessControlMode: boolean;
}

const renderAccessControlModeOption = ({ icon, label }: { icon: IconType; label: string }) => (
  <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
    <EuiFlexItem grow={false}>
      <EuiIcon type={icon} aria-hidden={true} />
    </EuiFlexItem>
    <EuiFlexItem>{label}</EuiFlexItem>
  </EuiFlexGroup>
);

const accessControlModeOptions = [
  {
    value: AgentAccessControlMode.Private,
    inputDisplay: renderAccessControlModeOption({
      icon: ACCESS_CONTROL_MODE_ICON[AgentAccessControlMode.Private],
      label: ACCESS_CONTROL_MODE_LABELS[AgentAccessControlMode.Private],
    }),
    dropdownDisplay: (
      <EuiFlexGroup direction="column" gutterSize="xs" responsive={false}>
        <EuiFlexItem>
          {renderAccessControlModeOption({
            icon: ACCESS_CONTROL_MODE_ICON[AgentAccessControlMode.Private],
            label: ACCESS_CONTROL_MODE_LABELS[AgentAccessControlMode.Private],
          })}
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiText size="xs" color="subdued">
            {ACCESS_CONTROL_MODE_TOOLTIPS[AgentAccessControlMode.Private]}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    ),
  },
  {
    value: AgentAccessControlMode.Shared,
    inputDisplay: renderAccessControlModeOption({
      icon: ACCESS_CONTROL_MODE_ICON[AgentAccessControlMode.Shared],
      label: ACCESS_CONTROL_MODE_LABELS[AgentAccessControlMode.Shared],
    }),
    dropdownDisplay: (
      <EuiFlexGroup direction="column" gutterSize="xs" responsive={false}>
        <EuiFlexItem>
          {renderAccessControlModeOption({
            icon: ACCESS_CONTROL_MODE_ICON[AgentAccessControlMode.Shared],
            label: ACCESS_CONTROL_MODE_LABELS[AgentAccessControlMode.Shared],
          })}
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiText size="xs" color="subdued">
            {ACCESS_CONTROL_MODE_TOOLTIPS[AgentAccessControlMode.Shared]}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    ),
  },
  {
    value: AgentAccessControlMode.Public,
    inputDisplay: renderAccessControlModeOption({
      icon: ACCESS_CONTROL_MODE_ICON[AgentAccessControlMode.Public],
      label: ACCESS_CONTROL_MODE_LABELS[AgentAccessControlMode.Public],
    }),
    dropdownDisplay: (
      <EuiFlexGroup direction="column" gutterSize="xs" responsive={false}>
        <EuiFlexItem>
          {renderAccessControlModeOption({
            icon: ACCESS_CONTROL_MODE_ICON[AgentAccessControlMode.Public],
            label: ACCESS_CONTROL_MODE_LABELS[AgentAccessControlMode.Public],
          })}
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiText size="xs" color="subdued">
            {ACCESS_CONTROL_MODE_TOOLTIPS[AgentAccessControlMode.Public]}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    ),
  },
];

export const AccessSection: React.FC<AccessSectionProps> = ({ canChangeAccessControlMode }) => {
  const { control, formState } = useFormContext<EditDetailsFormData>();

  return (
    <>
      <EuiTitle size="xs">
        <h3>{flyoutLabels.accessTitle}</h3>
      </EuiTitle>
      <EuiSpacer size="s" />
      <EuiText size="s" color="subdued" component="p">
        {flyoutLabels.accessDescription}
      </EuiText>
      <EuiSpacer size="l" />
      <EuiFormRow
        label={flyoutLabels.accessControlModeLabel}
        helpText={
          !canChangeAccessControlMode ? flyoutLabels.accessControlModeDisabledReason : undefined
        }
        isInvalid={!!formState.errors.access_control?.access_mode}
        error={formState.errors.access_control?.access_mode?.message}
        fullWidth
      >
        <Controller
          name="access_control.access_mode"
          control={control}
          render={({ field: { onChange, value } }) => (
            <EuiSuperSelect
              fullWidth
              options={accessControlModeOptions}
              valueOfSelected={value}
              onChange={onChange}
              disabled={!canChangeAccessControlMode}
              aria-label={flyoutLabels.accessControlModeAriaLabel}
              data-test-subj="editDetailsAccessControlModeSelect"
            />
          )}
        />
      </EuiFormRow>
    </>
  );
};
