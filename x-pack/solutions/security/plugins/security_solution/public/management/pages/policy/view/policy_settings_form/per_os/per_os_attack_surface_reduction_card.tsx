/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback } from 'react';
import { OperatingSystem } from '@kbn/securitysolution-utils';
import type { EuiSwitchProps } from '@elastic/eui';
import { EuiSwitch } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { cloneDeep } from 'lodash';
import { useGetProtectionsUnavailableComponent } from '../hooks/use_get_protections_unavailable_component';
import { useTestIdGenerator } from '../../../../../hooks/use_test_id_generator';
import { useLicense } from '../../../../../../common/hooks/use_license';
import { SettingLockedCard } from '../components/setting_locked_card';
import type { PolicyFormComponentCommonProps } from '../types';
import { PerOsSettingCard } from './per_os_setting_card';
import { OsRow } from './os_row';
import { POLICY_SETTING_SECTION_DESCRIPTIONS } from './policy_setting_section_descriptions';

export const LOCKED_CARD_ATTACK_SURFACE_REDUCTION = i18n.translate(
  'xpack.securitySolution.endpoint.policy.details.attack_surface_reduction',
  {
    defaultMessage: 'Attack Surface Reduction',
  }
);

const CARD_TITLE = i18n.translate(
  'xpack.securitySolution.endpoint.policy.details.attackSurfaceReduction.type',
  {
    defaultMessage: 'Attack surface reduction',
  }
);

export const SWITCH_LABEL = i18n.translate(
  'xpack.securitySolution.endpoint.policy.details.credentialHardening',
  {
    defaultMessage: 'Credential hardening',
  }
);

export type PerOsAttackSurfaceReductionCardProps = PolicyFormComponentCommonProps;

export const PerOsAttackSurfaceReductionCard = memo<PerOsAttackSurfaceReductionCardProps>(
  ({ policy, onChange, mode, 'data-test-subj': dataTestSubj }) => {
    const isPlatinumPlus = useLicense().isPlatinumPlus();
    const getTestId = useTestIdGenerator(dataTestSubj);
    const isProtectionsAllowed = !useGetProtectionsUnavailableComponent();
    // Windows-only field: there is no per-OS ASR factory. Read/write the card-level
    // policy's `windows` branch directly rather than reuse a protection accessor.
    const isChecked = policy.windows.attack_surface_reduction.credential_hardening.enabled;
    const isEditMode = mode === 'edit';

    const handleSwitchChange = useCallback<EuiSwitchProps['onChange']>(
      (event) => {
        const updatedPolicy = cloneDeep(policy);

        updatedPolicy.windows.attack_surface_reduction.credential_hardening.enabled =
          event.target.checked;

        onChange({ isValid: true, updatedPolicy });
      },
      [onChange, policy]
    );

    if (!isProtectionsAllowed) {
      return null;
    }

    if (!isPlatinumPlus) {
      return (
        <SettingLockedCard
          title={LOCKED_CARD_ATTACK_SURFACE_REDUCTION}
          data-test-subj={getTestId('locked')}
        />
      );
    }

    return (
      <PerOsSettingCard
        title={CARD_TITLE}
        description={POLICY_SETTING_SECTION_DESCRIPTIONS.attackSurfaceReduction}
        dataTestSubj={getTestId()}
        mode={mode}
      >
        <OsRow
          os={OperatingSystem.WINDOWS}
          primaryControl={
            <EuiSwitch
              label={SWITCH_LABEL}
              checked={isChecked}
              disabled={!isEditMode}
              onChange={handleSwitchChange}
              data-test-subj={getTestId('windows-enableDisableSwitch')}
              labelProps={{ 'data-test-subj': getTestId('windows-switchLabel') }}
            />
          }
          isLast={true}
          data-test-subj={getTestId('windows')}
        />
      </PerOsSettingCard>
    );
  }
);
PerOsAttackSurfaceReductionCard.displayName = 'PerOsAttackSurfaceReductionCard';
