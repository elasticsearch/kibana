/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback } from 'react';
import type { EuiSwitchProps } from '@elastic/eui';
import { EuiSwitch } from '@elastic/eui';
import { cloneDeep } from 'lodash';
import type { ImmutableArray, PolicyConfig } from '../../../../../../../common/endpoint/types';
import { ProtectionModes } from '../../../../../../../common/endpoint/types';
import { useLicense } from '../../../../../../common/hooks/use_license';
import { useTestIdGenerator } from '../../../../../hooks/use_test_id_generator';
import type {
  BehaviorProtectionOSes,
  LinuxPolicyProtection,
  MalwareProtectionOSes,
  MacPolicyProtection,
  MemoryProtectionOSes,
  PolicyProtection,
  RansomwareProtectionOSes,
} from '../../../types';

type PerOsProtectionOperatingSystem =
  | MalwareProtectionOSes
  | MemoryProtectionOSes
  | BehaviorProtectionOSes
  | RansomwareProtectionOSes;

export interface PerOsProtectionSideEffectOptions {
  value: boolean;
  os: PerOsProtectionOperatingSystem;
  osPolicy: PolicyConfig[PerOsProtectionOperatingSystem];
}

export interface PerOsProtectionMasterToggleProps {
  policy: PolicyConfig;
  onChange: (options: { isValid: boolean; updatedPolicy: PolicyConfig }) => void;
  mode?: 'edit' | 'view';
  protection: PolicyProtection;
  protectionLabel?: string;
  osList: ImmutableArray<PerOsProtectionOperatingSystem>;
  additionalOnOsSwitchChange?: (options: PerOsProtectionSideEffectOptions) => void;
  'data-test-subj'?: string;
}

export const PerOsProtectionMasterToggle = memo(
  ({
    policy,
    onChange,
    mode = 'edit',
    protection,
    protectionLabel,
    osList,
    additionalOnOsSwitchChange,
    'data-test-subj': dataTestSubj,
  }: PerOsProtectionMasterToggleProps) => {
    const getTestId = useTestIdGenerator(dataTestSubj);
    const isPlatinumPlus = useLicense().isPlatinumPlus();
    const selected = osList.some((os) => {
      if (os === 'windows') {
        return policy.windows[protection].mode !== ProtectionModes.off;
      }
      if (os === 'mac') {
        return policy.mac[protection as MacPolicyProtection].mode !== ProtectionModes.off;
      }
      return policy.linux[protection as LinuxPolicyProtection].mode !== ProtectionModes.off;
    });

    const handleSwitchChange = useCallback<EuiSwitchProps['onChange']>(
      (event) => {
        const value = event.target.checked;
        const nextMode = value ? ProtectionModes.prevent : ProtectionModes.off;
        const updatedPolicy = cloneDeep(policy);

        for (const os of osList) {
          if (os === 'windows') {
            updatedPolicy.windows[protection].mode = nextMode;
            if (isPlatinumPlus) {
              updatedPolicy.windows.popup[protection].enabled = value;
              if (protection === 'behavior_protection') {
                updatedPolicy.windows.behavior_protection.reputation_service = value;
              }
            }
          } else if (os === 'mac') {
            const macProtection = protection as MacPolicyProtection;
            updatedPolicy.mac[macProtection].mode = nextMode;
            if (isPlatinumPlus) {
              updatedPolicy.mac.popup[macProtection].enabled = value;
              if (protection === 'behavior_protection') {
                updatedPolicy.mac.behavior_protection.reputation_service = value;
              }
            }
          } else {
            const linuxProtection = protection as LinuxPolicyProtection;
            updatedPolicy.linux[linuxProtection].mode = nextMode;
            if (isPlatinumPlus) {
              updatedPolicy.linux.popup[linuxProtection].enabled = value;
              if (protection === 'behavior_protection') {
                updatedPolicy.linux.behavior_protection.reputation_service = value;
              }
            }
          }

          additionalOnOsSwitchChange?.({
            value,
            os,
            osPolicy: updatedPolicy[os] as PolicyConfig[PerOsProtectionOperatingSystem],
          });
        }

        onChange({ isValid: true, updatedPolicy });
      },
      [additionalOnOsSwitchChange, isPlatinumPlus, onChange, osList, policy, protection]
    );

    return (
      <EuiSwitch
        label={protectionLabel}
        showLabel={false}
        labelProps={{ 'data-test-subj': getTestId('label') }}
        checked={selected}
        disabled={mode !== 'edit'}
        onChange={handleSwitchChange}
        data-test-subj={getTestId()}
      />
    );
  }
);
PerOsProtectionMasterToggle.displayName = 'PerOsProtectionMasterToggle';
