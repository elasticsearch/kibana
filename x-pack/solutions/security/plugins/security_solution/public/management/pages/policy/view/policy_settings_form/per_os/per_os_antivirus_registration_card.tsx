/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useMemo } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiIconTip,
  EuiSpacer,
  EuiSuperSelect,
  EuiText,
} from '@elastic/eui';
import { OperatingSystem } from '@kbn/securitysolution-utils';
import { i18n } from '@kbn/i18n';
import { cloneDeep } from 'lodash';
import { shouldEnableAntivirusRegistrationForSync } from '../../../../../../../common/endpoint/utils/update_antivirus_registration_enabled';
import { AntivirusRegistrationModes } from '../../../../../../../common/endpoint/types';
import { useGetProtectionsUnavailableComponent } from '../hooks/use_get_protections_unavailable_component';
import { useTestIdGenerator } from '../../../../../hooks/use_test_id_generator';
import { PerOsSettingCard } from './per_os_setting_card';
import type { PolicyFormComponentCommonProps } from '../types';
import { OsRow } from './os_row';
import { OS_CONTROL_WIDTH } from './os_control_layout';
import { buildOsControlSelectOptions } from './os_control_select_options';
import { POLICY_SETTING_SECTION_DESCRIPTIONS } from './policy_setting_section_descriptions';

const CARD_TITLE = i18n.translate(
  'xpack.securitySolution.endpoint.policy.details.antivirusRegistration.type',
  {
    defaultMessage: 'Register as antivirus',
  }
);

const ENABLED = i18n.translate(
  'xpack.securitySolution.endpoint.policy.details.antivirusRegistration.syncWithMalwarePrevent.enabled',
  { defaultMessage: 'enabled' }
);

const DISABLED = i18n.translate(
  'xpack.securitySolution.endpoint.policy.details.antivirusRegistration.syncWithMalwarePrevent.disabled',
  { defaultMessage: 'disabled' }
);

const DISABLED_LABEL = i18n.translate(
  'xpack.securitySolution.endpoint.policy.details.antivirusRegistration.disabled',
  { defaultMessage: 'Disabled' }
);

const ENABLED_LABEL = i18n.translate(
  'xpack.securitySolution.endpoint.policy.details.antivirusRegistration.enabled',
  { defaultMessage: 'Enabled' }
);

const SYNC_LABEL = i18n.translate(
  'xpack.securitySolution.endpoint.policy.details.antivirusRegistration.syncWithMalwarePrevent',
  { defaultMessage: 'Sync with malware protection level' }
);

const ANTIVIRUS_REGISTRATION_MODE_SELECT_ARIA_LABEL = i18n.translate(
  'xpack.securitySolution.endpoint.policy.details.antivirusRegistration.modeSelectAriaLabel',
  {
    defaultMessage: 'Antivirus registration mode',
  }
);

const OS_RESTRICTION = i18n.translate(
  'xpack.securitySolution.endpoint.policy.details.av.windowsServerNotSupported',
  {
    defaultMessage:
      'Windows Server operating systems unsupported because Antivirus registration requires Windows Security Center, which is not included in Windows Server operating systems.',
  }
);

const ANTIVIRUS_REGISTRATION_MODE_OPTIONS = buildOsControlSelectOptions([
  {
    value: AntivirusRegistrationModes.disabled,
    label: DISABLED_LABEL,
    healthColor: 'danger',
  },
  {
    value: AntivirusRegistrationModes.sync,
    label: SYNC_LABEL,
    healthColor: 'warning',
  },
  {
    value: AntivirusRegistrationModes.enabled,
    label: ENABLED_LABEL,
    healthColor: 'success',
  },
]);

export type PerOsAntivirusRegistrationCardProps = PolicyFormComponentCommonProps;

export const PerOsAntivirusRegistrationCard = memo<PerOsAntivirusRegistrationCardProps>(
  ({ policy, onChange, mode = 'edit', 'data-test-subj': dataTestSubj }) => {
    const getTestId = useTestIdGenerator(dataTestSubj);
    const isProtectionsAllowed = !useGetProtectionsUnavailableComponent();
    const isEditMode = mode === 'edit';
    const currentMode = policy.windows.antivirus_registration.mode;

    const handleModeChange = useCallback(
      (selectedMode: AntivirusRegistrationModes) => {
        const updatedPolicy = cloneDeep(policy);
        updatedPolicy.windows.antivirus_registration.mode = selectedMode;
        onChange({ isValid: true, updatedPolicy });
      },
      [onChange, policy]
    );

    const currentOutcome = useMemo(
      () => (shouldEnableAntivirusRegistrationForSync(policy) ? ENABLED : DISABLED),
      [policy]
    );

    if (!isProtectionsAllowed) {
      return null;
    }

    return (
      <PerOsSettingCard
        title={CARD_TITLE}
        description={POLICY_SETTING_SECTION_DESCRIPTIONS.antivirusSolution}
        dataTestSubj={getTestId()}
        mode={mode}
      >
        <EuiSpacer size="s" />
        <OsRow
          os={OperatingSystem.WINDOWS}
          labelAppend={
            <EuiIconTip
              type="warning"
              color="warning"
              position="right"
              anchorProps={{ 'data-test-subj': getTestId('windows-osRestriction') }}
              content={OS_RESTRICTION}
            />
          }
          primaryControl={
            <EuiFlexGroup alignItems="center" gutterSize="s">
              <EuiFlexItem
                grow={false}
                data-test-subj={getTestId('windows-mode-fixedWidth')}
                css={{ inlineSize: OS_CONTROL_WIDTH, maxInlineSize: '100%' }}
              >
                <EuiSuperSelect<AntivirusRegistrationModes>
                  options={ANTIVIRUS_REGISTRATION_MODE_OPTIONS}
                  valueOfSelected={currentMode}
                  onChange={handleModeChange}
                  disabled={!isEditMode}
                  fullWidth={true}
                  data-test-subj={getTestId('windows-mode')}
                  aria-label={ANTIVIRUS_REGISTRATION_MODE_SELECT_ARIA_LABEL}
                />
              </EuiFlexItem>
              {/* Only meaningful while the sync mode is selected — it explains that mode. */}
              {currentMode === AntivirusRegistrationModes.sync && (
                <EuiFlexItem grow={false}>
                  <EuiIconTip
                    type="warning"
                    color="warning"
                    position="right"
                    anchorProps={{ 'data-test-subj': getTestId('windows-syncTooltip') }}
                    content={i18n.translate(
                      'xpack.securitySolution.endpoint.policy.details.antivirusRegistration.syncWithMalwarePrevent.tooltip',
                      {
                        defaultMessage:
                          'Use this setting to automatically enable antivirus registration if malware protection is set to Prevent. ' +
                          'In any other case, antivirus registration will be disabled.',
                      }
                    )}
                  />
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          }
          isLast={true}
          data-test-subj={getTestId('windows')}
        >
          {currentMode === AntivirusRegistrationModes.sync && (
            <EuiText color={isEditMode ? 'subdued' : undefined} size="xs">
              {i18n.translate(
                'xpack.securitySolution.endpoint.policy.details.antivirusRegistration.syncWithMalwarePrevent.currentOutcome',
                {
                  defaultMessage: '(Current level: {currentOutcome})',
                  values: {
                    currentOutcome,
                  },
                }
              )}
            </EuiText>
          )}
        </OsRow>
      </PerOsSettingCard>
    );
  }
);
PerOsAntivirusRegistrationCard.displayName = 'PerOsAntivirusRegistrationCard';
