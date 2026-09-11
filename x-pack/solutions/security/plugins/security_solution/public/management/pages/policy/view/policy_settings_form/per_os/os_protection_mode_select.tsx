/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback } from 'react';
import { EuiFlexItem, EuiSuperSelect } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { ProtectionModes } from '../../../../../../../common/endpoint/types';
import { OS_CONTROL_WIDTH } from './os_control_layout';
import { buildOsControlSelectOptions } from './os_control_select_options';

const PREVENT_LABEL = i18n.translate(
  'xpack.securitySolution.endpoint.policy.details.perOs.protectionMode.detectAndPrevent',
  {
    defaultMessage: 'Detect & prevent',
  }
);

const DETECT_LABEL = i18n.translate(
  'xpack.securitySolution.endpoint.policy.details.perOs.protectionMode.detect',
  {
    defaultMessage: 'Detect',
  }
);

const OFF_LABEL = i18n.translate(
  'xpack.securitySolution.endpoint.policy.details.perOs.protectionMode.disable',
  {
    defaultMessage: 'Disable',
  }
);

const PROTECTION_MODE_SELECT_ARIA_LABEL = i18n.translate(
  'xpack.securitySolution.endpoint.policy.details.protectionModeSelectAriaLabel',
  {
    defaultMessage: 'Protection mode',
  }
);

const PROTECTION_MODE_OPTIONS = buildOsControlSelectOptions([
  { value: ProtectionModes.off, label: OFF_LABEL, healthColor: 'danger' },
  { value: ProtectionModes.detect, label: DETECT_LABEL, healthColor: 'warning' },
  { value: ProtectionModes.prevent, label: PREVENT_LABEL, healthColor: 'success' },
]);

export interface OsProtectionModeSelectProps {
  mode: ProtectionModes;
  onModeChange: (mode: ProtectionModes) => void;
  disabled?: boolean;
  'data-test-subj'?: string;
}

export const OsProtectionModeSelect = memo<OsProtectionModeSelectProps>(
  ({ mode, onModeChange, disabled, 'data-test-subj': dataTestSubj }) => {
    const handleChange = useCallback(
      (selectedMode: ProtectionModes) => {
        onModeChange(selectedMode);
      },
      [onModeChange]
    );

    return (
      <EuiFlexItem
        grow={false}
        data-test-subj={dataTestSubj ? `${dataTestSubj}-fixedWidth` : undefined}
        css={{ inlineSize: OS_CONTROL_WIDTH, maxInlineSize: '100%' }}
      >
        <EuiSuperSelect<ProtectionModes>
          options={PROTECTION_MODE_OPTIONS}
          valueOfSelected={mode}
          onChange={handleChange}
          disabled={disabled}
          fullWidth={true}
          data-test-subj={dataTestSubj}
          aria-label={PROTECTION_MODE_SELECT_ARIA_LABEL}
        />
      </EuiFlexItem>
    );
  }
);
OsProtectionModeSelect.displayName = 'OsProtectionModeSelect';
