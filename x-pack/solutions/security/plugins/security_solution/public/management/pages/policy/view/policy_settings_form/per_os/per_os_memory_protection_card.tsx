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
import type { MemoryProtectionOSes } from '../../../types';
import { PerOsSettingCard } from './per_os_setting_card';
import { SettingLockedCard } from '../components/setting_locked_card';
import { useGetProtectionsUnavailableComponent } from '../hooks/use_get_protections_unavailable_component';
import type { PolicyFormComponentCommonProps } from '../types';
import { OsProtectionModeSelect } from './os_protection_mode_select';
import { OsRow } from './os_row';
import { POLICY_SETTING_SECTION_DESCRIPTIONS } from './policy_setting_section_descriptions';
import { PerOsNotifyUserOption } from './per_os_notify_user_option';
import type { PerOsPolicyAccessor } from './policy_accessor';
import { createMemoryProtectionPolicyAccessor } from './policy_accessor';
import { PerOsProtectionMasterToggle } from './per_os_protection_master_toggle';

export const LOCKED_CARD_MEMORY_TITLE = i18n.translate(
  'xpack.securitySolution.endpoint.policy.details.memory',
  {
    defaultMessage: 'Memory Threat',
  }
);

const MEMORY_PROTECTION_OS_VALUES: Immutable<MemoryProtectionOSes[]> = [
  PolicyOperatingSystem.windows,
  PolicyOperatingSystem.mac,
  PolicyOperatingSystem.linux,
];

const POLICY_OS_TO_OPERATING_SYSTEM: Readonly<Record<MemoryProtectionOSes, OperatingSystem>> = {
  [PolicyOperatingSystem.windows]: OperatingSystem.WINDOWS,
  [PolicyOperatingSystem.mac]: OperatingSystem.MAC,
  [PolicyOperatingSystem.linux]: OperatingSystem.LINUX,
};

export type PerOsMemoryProtectionCardProps = PolicyFormComponentCommonProps;

export const PerOsMemoryProtectionCard = memo(
  ({
    policy,
    onChange,
    mode = 'edit',
    'data-test-subj': dataTestSubj,
  }: PerOsMemoryProtectionCardProps) => {
    const isPlatinumPlus = useLicense().isPlatinumPlus();
    const getTestId = useTestIdGenerator(dataTestSubj);
    const isProtectionsAllowed = !useGetProtectionsUnavailableComponent();
    const protectionLabel = i18n.translate(
      'xpack.securitySolution.endpoint.policy.protections.memory',
      {
        defaultMessage: 'Memory threat protections',
      }
    );

    if (!isProtectionsAllowed) {
      return null;
    }

    if (!isPlatinumPlus) {
      return (
        <SettingLockedCard title={LOCKED_CARD_MEMORY_TITLE} data-test-subj={getTestId('locked')} />
      );
    }

    return (
      <PerOsSettingCard
        title={i18n.translate('xpack.securitySolution.endpoint.policy.details.memory_protection', {
          defaultMessage: 'Memory threat',
        })}
        description={POLICY_SETTING_SECTION_DESCRIPTIONS.memoryThreat}
        dataTestSubj={getTestId()}
        mode={mode}
        rightCorner={
          <PerOsProtectionMasterToggle
            policy={policy}
            onChange={onChange}
            mode={mode}
            protection="memory_protection"
            protectionLabel={protectionLabel}
            osList={MEMORY_PROTECTION_OS_VALUES}
            data-test-subj={getTestId('enableDisableSwitch')}
          />
        }
      >
        {MEMORY_PROTECTION_OS_VALUES.map((os, index) => {
          const accessor = createMemoryProtectionPolicyAccessor(policy, os);
          return (
            <PerOsMemoryProtectionRow
              key={os}
              os={os}
              accessor={accessor}
              onChange={onChange}
              mode={mode}
              isLast={index === MEMORY_PROTECTION_OS_VALUES.length - 1}
              data-test-subj={getTestId(os)}
            />
          );
        })}
      </PerOsSettingCard>
    );
  }
);
PerOsMemoryProtectionCard.displayName = 'PerOsMemoryProtectionCard';

interface PerOsMemoryProtectionRowProps<OS extends MemoryProtectionOSes> {
  os: OS;
  accessor: PerOsPolicyAccessor<OS>;
  onChange: PolicyFormComponentCommonProps['onChange'];
  mode: 'edit' | 'view';
  'data-test-subj'?: string;
  isLast: boolean;
}

const PerOsMemoryProtectionRow = <OS extends MemoryProtectionOSes>({
  os,
  accessor,
  onChange,
  mode,
  'data-test-subj': dataTestSubj,
  isLast,
}: PerOsMemoryProtectionRowProps<OS>) => {
  const getTestId = useTestIdGenerator(dataTestSubj);
  const osPolicy = accessor.read();
  const memoryProtectionMode = osPolicy.memory_protection.mode;
  const subfeaturesVisible = memoryProtectionMode !== ProtectionModes.off;
  const handleModeChange = useCallback(
    (nextMode: ProtectionModes) => {
      const updatedPolicy = accessor.update((currentOsPolicy) => {
        currentOsPolicy.memory_protection.mode = nextMode;
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
          mode={memoryProtectionMode}
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
          protection="memory_protection"
          data-test-subj={getTestId('notifyUser')}
        />
      )}
    </OsRow>
  );
};
