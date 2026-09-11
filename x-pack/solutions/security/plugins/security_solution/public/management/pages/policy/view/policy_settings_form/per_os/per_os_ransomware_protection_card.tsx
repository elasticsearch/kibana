/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback } from 'react';
import { i18n } from '@kbn/i18n';
import { OperatingSystem } from '@kbn/securitysolution-utils';
import type { Immutable } from '../../../../../../../common/endpoint/types';
import { PolicyOperatingSystem, ProtectionModes } from '../../../../../../../common/endpoint/types';
import { useLicense } from '../../../../../../common/hooks/use_license';
import { useTestIdGenerator } from '../../../../../hooks/use_test_id_generator';
import type { RansomwareProtectionOSes } from '../../../types';
import { PerOsSettingCard } from './per_os_setting_card';
import { SettingLockedCard } from '../components/setting_locked_card';
import { useGetProtectionsUnavailableComponent } from '../hooks/use_get_protections_unavailable_component';
import type { PolicyFormComponentCommonProps } from '../types';
import { OsProtectionModeSelect } from './os_protection_mode_select';
import { OsRow } from './os_row';
import { POLICY_SETTING_SECTION_DESCRIPTIONS } from './policy_setting_section_descriptions';
import { PerOsNotifyUserOption } from './per_os_notify_user_option';
import type { PerOsPolicyAccessor } from './policy_accessor';
import { createRansomwarePolicyAccessor } from './policy_accessor';
import { PerOsProtectionMasterToggle } from './per_os_protection_master_toggle';

const RANSOMWARE_OS_VALUES: Immutable<RansomwareProtectionOSes[]> = [
  PolicyOperatingSystem.windows,
  PolicyOperatingSystem.mac,
];

const POLICY_OS_TO_OPERATING_SYSTEM: Readonly<Record<RansomwareProtectionOSes, OperatingSystem>> = {
  [PolicyOperatingSystem.windows]: OperatingSystem.WINDOWS,
  [PolicyOperatingSystem.mac]: OperatingSystem.MAC,
};

export const LOCKED_CARD_RANSOMWARE_TITLE = i18n.translate(
  'xpack.securitySolution.endpoint.policy.details.ransomware',
  {
    defaultMessage: 'Ransomware',
  }
);

export type PerOsRansomwareProtectionCardProps = PolicyFormComponentCommonProps;

export const PerOsRansomwareProtectionCard = memo(
  ({
    policy,
    onChange,
    mode = 'edit',
    'data-test-subj': dataTestSubj,
  }: PerOsRansomwareProtectionCardProps) => {
    const isPlatinumPlus = useLicense().isPlatinumPlus();
    const isProtectionsAllowed = !useGetProtectionsUnavailableComponent();
    const getTestId = useTestIdGenerator(dataTestSubj);
    const selected = RANSOMWARE_OS_VALUES.some(
      (os) => policy[os].ransomware.mode !== ProtectionModes.off
    );
    const protectionLabel = i18n.translate(
      'xpack.securitySolution.endpoint.policy.protections.ransomware',
      {
        defaultMessage: 'Ransomware protections',
      }
    );

    if (!isProtectionsAllowed) {
      return null;
    }

    if (!isPlatinumPlus) {
      return (
        <SettingLockedCard
          title={LOCKED_CARD_RANSOMWARE_TITLE}
          data-test-subj={getTestId('locked')}
        />
      );
    }

    return (
      <PerOsSettingCard
        title={LOCKED_CARD_RANSOMWARE_TITLE}
        description={POLICY_SETTING_SECTION_DESCRIPTIONS.ransomware}
        dataTestSubj={getTestId()}
        selected={selected}
        mode={mode}
        rightCorner={
          <PerOsProtectionMasterToggle
            policy={policy}
            onChange={onChange}
            mode={mode}
            protection="ransomware"
            protectionLabel={protectionLabel}
            osList={RANSOMWARE_OS_VALUES}
            data-test-subj={getTestId('enableDisableSwitch')}
          />
        }
      >
        {RANSOMWARE_OS_VALUES.map((os, index) => {
          const accessor = createRansomwarePolicyAccessor(policy, os);
          return (
            <PerOsRansomwareProtectionRow
              key={os}
              os={os}
              accessor={accessor}
              onChange={onChange}
              mode={mode}
              isLast={index === RANSOMWARE_OS_VALUES.length - 1}
              data-test-subj={getTestId(os)}
            />
          );
        })}
      </PerOsSettingCard>
    );
  }
);
PerOsRansomwareProtectionCard.displayName = 'PerOsRansomwareProtectionCard';

interface PerOsRansomwareProtectionRowProps<OS extends RansomwareProtectionOSes> {
  os: OS;
  accessor: PerOsPolicyAccessor<OS>;
  onChange: PolicyFormComponentCommonProps['onChange'];
  mode: 'edit' | 'view';
  isLast: boolean;
  'data-test-subj'?: string;
}

const PerOsRansomwareProtectionRow = <OS extends RansomwareProtectionOSes>({
  os,
  accessor,
  onChange,
  mode,
  isLast,
  'data-test-subj': dataTestSubj,
}: PerOsRansomwareProtectionRowProps<OS>) => {
  const getTestId = useTestIdGenerator(dataTestSubj);
  const osPolicy = accessor.read();
  const ransomwareMode = osPolicy.ransomware.mode;
  const subfeaturesVisible = ransomwareMode !== ProtectionModes.off;
  const handleModeChange = useCallback(
    (nextMode: ProtectionModes) => {
      const updatedPolicy = accessor.update((currentOsPolicy) => {
        currentOsPolicy.ransomware.mode = nextMode;
      });
      onChange({ isValid: true, updatedPolicy });
    },
    [accessor, onChange]
  );

  return (
    <OsRow
      os={POLICY_OS_TO_OPERATING_SYSTEM[os]}
      primaryControl={
        <OsProtectionModeSelect
          mode={ransomwareMode}
          onModeChange={handleModeChange}
          disabled={mode !== 'edit'}
          data-test-subj={getTestId('mode')}
        />
      }
      isLast={isLast}
      data-test-subj={getTestId()}
    >
      {subfeaturesVisible && (
        <PerOsNotifyUserOption
          accessor={accessor}
          onChange={onChange}
          mode={mode}
          protection="ransomware"
          data-test-subj={getTestId('notifyUser')}
        />
      )}
    </OsRow>
  );
};
