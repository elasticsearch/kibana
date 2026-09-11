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
import type { BehaviorProtectionOSes } from '../../../types';
import { PerOsSettingCard } from './per_os_setting_card';
import { SettingLockedCard } from '../components/setting_locked_card';
import { useGetProtectionsUnavailableComponent } from '../hooks/use_get_protections_unavailable_component';
import type { PolicyFormComponentCommonProps } from '../types';
import { OsProtectionModeSelect } from './os_protection_mode_select';
import { OsRow } from './os_row';
import { POLICY_SETTING_SECTION_DESCRIPTIONS } from './policy_setting_section_descriptions';
import { PerOsNotifyUserOption } from './per_os_notify_user_option';
import { PerOsProtectionMasterToggle } from './per_os_protection_master_toggle';
import { PerOsReputationService } from './per_os_reputation_service';
import type { PerOsPolicyAccessor } from './policy_accessor';
import { createBehaviorProtectionPolicyAccessor } from './policy_accessor';

const BEHAVIOUR_OS_VALUES: Immutable<BehaviorProtectionOSes[]> = [
  PolicyOperatingSystem.windows,
  PolicyOperatingSystem.mac,
  PolicyOperatingSystem.linux,
];

const POLICY_OS_TO_OPERATING_SYSTEM: Readonly<Record<BehaviorProtectionOSes, OperatingSystem>> = {
  [PolicyOperatingSystem.windows]: OperatingSystem.WINDOWS,
  [PolicyOperatingSystem.mac]: OperatingSystem.MAC,
  [PolicyOperatingSystem.linux]: OperatingSystem.LINUX,
};

const LOCKED_CARD_BEHAVIOR_TITLE = i18n.translate(
  'xpack.securitySolution.endpoint.policy.details.behavior',
  { defaultMessage: 'Malicious Behavior' }
);

export type PerOsBehaviourProtectionCardProps = PolicyFormComponentCommonProps;

export const PerOsBehaviourProtectionCard = memo(
  ({
    policy,
    onChange,
    mode = 'edit',
    'data-test-subj': dataTestSubj,
  }: PerOsBehaviourProtectionCardProps) => {
    const isPlatinumPlus = useLicense().isPlatinumPlus();
    const getTestId = useTestIdGenerator(dataTestSubj);
    const isProtectionsAllowed = !useGetProtectionsUnavailableComponent();
    const selected = BEHAVIOUR_OS_VALUES.some(
      (os) => policy[os].behavior_protection.mode !== ProtectionModes.off
    );
    const protectionLabel = i18n.translate(
      'xpack.securitySolution.endpoint.policy.protections.behavior',
      { defaultMessage: 'Malicious behavior protections' }
    );

    if (!isProtectionsAllowed) {
      return null;
    }

    if (!isPlatinumPlus) {
      return (
        <SettingLockedCard
          title={LOCKED_CARD_BEHAVIOR_TITLE}
          data-test-subj={getTestId('locked')}
        />
      );
    }

    return (
      <PerOsSettingCard
        title={i18n.translate(
          'xpack.securitySolution.endpoint.policy.details.behavior_protection',
          { defaultMessage: 'Malicious behavior' }
        )}
        description={POLICY_SETTING_SECTION_DESCRIPTIONS.maliciousBehavior}
        selected={selected}
        mode={mode}
        dataTestSubj={getTestId()}
        rightCorner={
          <PerOsProtectionMasterToggle
            policy={policy}
            onChange={onChange}
            mode={mode}
            protection="behavior_protection"
            protectionLabel={protectionLabel}
            osList={BEHAVIOUR_OS_VALUES}
            data-test-subj={getTestId('enableDisableSwitch')}
          />
        }
      >
        {BEHAVIOUR_OS_VALUES.map((os, index) => {
          const accessor = createBehaviorProtectionPolicyAccessor(policy, os);
          return (
            <PerOsBehaviourProtectionRow
              key={os}
              os={os}
              accessor={accessor}
              onChange={onChange}
              mode={mode}
              isLast={index === BEHAVIOUR_OS_VALUES.length - 1}
              data-test-subj={getTestId(os)}
            />
          );
        })}
      </PerOsSettingCard>
    );
  }
);
PerOsBehaviourProtectionCard.displayName = 'PerOsBehaviourProtectionCard';

interface PerOsBehaviourProtectionRowProps<OS extends BehaviorProtectionOSes> {
  os: OS;
  accessor: PerOsPolicyAccessor<OS>;
  onChange: PolicyFormComponentCommonProps['onChange'];
  mode: 'edit' | 'view';
  isLast: boolean;
  'data-test-subj'?: string;
}

const PerOsBehaviourProtectionRow = <OS extends BehaviorProtectionOSes>({
  os,
  accessor,
  onChange,
  mode,
  isLast,
  'data-test-subj': dataTestSubj,
}: PerOsBehaviourProtectionRowProps<OS>) => {
  const getTestId = useTestIdGenerator(dataTestSubj);
  const osPolicy = accessor.read();
  const behaviorMode = osPolicy.behavior_protection.mode;
  const subfeaturesVisible = behaviorMode !== ProtectionModes.off;
  const handleModeChange = useCallback(
    (nextMode: ProtectionModes) => {
      const updatedPolicy = accessor.update((currentOsPolicy) => {
        currentOsPolicy.behavior_protection.mode = nextMode;
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
          mode={behaviorMode}
          onModeChange={handleModeChange}
          disabled={mode !== 'edit'}
          data-test-subj={getTestId('mode')}
        />
      }
      inlineControls={
        subfeaturesVisible ? (
          <PerOsReputationService
            accessor={accessor}
            onChange={onChange}
            mode={mode}
            data-test-subj={getTestId('reputationService')}
          />
        ) : undefined
      }
      isLast={isLast}
      data-test-subj={getTestId()}
    >
      {subfeaturesVisible && (
        <PerOsNotifyUserOption
          accessor={accessor}
          onChange={onChange}
          mode={mode}
          protection="behavior_protection"
          data-test-subj={getTestId('notifyUser')}
        />
      )}
    </OsRow>
  );
};
