/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback } from 'react';
import type { EuiSwitchProps } from '@elastic/eui';
import { EuiSwitch } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { OperatingSystem } from '@kbn/securitysolution-utils';
import type {
  DeviceControlAccessLevel,
  Immutable,
  PolicyConfig,
} from '../../../../../../../common/endpoint/types';
import {
  DeviceControlAccessLevel as DeviceControlAccessLevelEnum,
  PolicyOperatingSystem,
} from '../../../../../../../common/endpoint/types';
import { DefaultPolicyDeviceNotificationMessage } from '../../../../../../../common/endpoint/models/policy_config';
import { useLicense } from '../../../../../../common/hooks/use_license';
import { useTestIdGenerator } from '../../../../../hooks/use_test_id_generator';
import type { DeviceControlOSes } from '../../../types';
import { PerOsSettingCard } from './per_os_setting_card';
import { SettingLockedCard } from '../components/setting_locked_card';
import { useGetDeviceControlUpsellComponent } from '../hooks/use_get_device_control_component';
import type { PolicyFormComponentCommonProps } from '../types';
import { OsRow } from './os_row';
import { POLICY_SETTING_SECTION_DESCRIPTIONS } from './policy_setting_section_descriptions';
import { PerOsDeviceControlAccessLevelSelect } from './per_os_device_control_access_level_select';
import { PerOsDeviceControlNotifyUserOption } from './per_os_device_control_notify_user_option';
import type { PerOsPolicyAccessor } from './policy_accessor';
import { createDeviceControlPolicyAccessor } from './policy_accessor';

const DEVICE_CONTROL_OS_VALUES: Immutable<DeviceControlOSes[]> = [
  PolicyOperatingSystem.windows,
  PolicyOperatingSystem.mac,
];

const POLICY_OS_TO_OPERATING_SYSTEM: Readonly<Record<DeviceControlOSes, OperatingSystem>> = {
  [PolicyOperatingSystem.windows]: OperatingSystem.WINDOWS,
  [PolicyOperatingSystem.mac]: OperatingSystem.MAC,
};

export const PER_OS_DEVICE_CONTROL_CARD_TITLE = i18n.translate(
  'xpack.securitySolution.endpoint.policy.details.deviceControl',
  {
    defaultMessage: 'Device Control',
  }
);

const DEVICE_CONTROL_PROTECTION_LABEL = i18n.translate(
  'xpack.securitySolution.endpoint.policy.protections.deviceControl',
  {
    defaultMessage: 'Device Control',
  }
);

export type PerOsDeviceControlCardProps = PolicyFormComponentCommonProps;

export const PerOsDeviceControlCard = memo(
  ({
    policy,
    onChange,
    mode = 'edit',
    'data-test-subj': dataTestSubj,
  }: PerOsDeviceControlCardProps) => {
    const getTestId = useTestIdGenerator(dataTestSubj);
    const isEnterprise = useLicense().isEnterprise();
    const DeviceControlUpsellingComponent = useGetDeviceControlUpsellComponent();
    // §5.3: master toggle state is derived as `some(OS enabled)`, matching every other
    // per-OS card and the legacy `windows?.enabled || mac?.enabled` behaviour. An absent
    // device_control branch cannot satisfy `=== true`, so it simply does not contribute.
    const selected = DEVICE_CONTROL_OS_VALUES.some(
      (os) => createDeviceControlPolicyAccessor(policy, os).read().device_control?.enabled === true
    );

    if (DeviceControlUpsellingComponent) {
      return <DeviceControlUpsellingComponent />;
    }

    if (!isEnterprise) {
      return (
        <SettingLockedCard
          title={PER_OS_DEVICE_CONTROL_CARD_TITLE}
          licenseType="enterprise"
          data-test-subj={getTestId('locked')}
        />
      );
    }

    return (
      <PerOsSettingCard
        title={PER_OS_DEVICE_CONTROL_CARD_TITLE}
        description={POLICY_SETTING_SECTION_DESCRIPTIONS.deviceControl}
        dataTestSubj={getTestId()}
        selected={selected}
        mode={mode}
        rightCorner={
          <PerOsDeviceControlMasterToggle
            policy={policy}
            onChange={onChange}
            mode={mode}
            selected={selected}
            data-test-subj={getTestId('enableDisableSwitch')}
          />
        }
      >
        {DEVICE_CONTROL_OS_VALUES.map((os, index) => {
          const accessor = createDeviceControlPolicyAccessor(policy, os);
          return (
            <PerOsDeviceControlRow
              key={os}
              os={os}
              accessor={accessor}
              onChange={onChange}
              mode={mode}
              isLast={index === DEVICE_CONTROL_OS_VALUES.length - 1}
              data-test-subj={getTestId(os)}
            />
          );
        })}
      </PerOsSettingCard>
    );
  }
);
PerOsDeviceControlCard.displayName = 'PerOsDeviceControlCard';

interface PerOsDeviceControlMasterToggleProps {
  policy: PolicyConfig;
  onChange: PolicyFormComponentCommonProps['onChange'];
  mode: 'edit' | 'view';
  selected: boolean;
  'data-test-subj'?: string;
}

const PerOsDeviceControlMasterToggle = ({
  policy,
  onChange,
  mode,
  selected,
  'data-test-subj': dataTestSubj,
}: PerOsDeviceControlMasterToggleProps) => {
  const getTestId = useTestIdGenerator(dataTestSubj);
  const handleSwitchChange = useCallback<EuiSwitchProps['onChange']>(
    (event) => {
      const enabled = event.target.checked;
      let updatedPolicy = policy;

      for (const os of DEVICE_CONTROL_OS_VALUES) {
        const accessor = createDeviceControlPolicyAccessor(updatedPolicy, os);
        updatedPolicy = accessor.update((currentOsPolicy) => {
          currentOsPolicy.device_control = {
            enabled,
            usb_storage: enabled
              ? DeviceControlAccessLevelEnum.deny_all
              : DeviceControlAccessLevelEnum.audit,
          };
          currentOsPolicy.popup.device_control ??= {
            enabled,
            message: DefaultPolicyDeviceNotificationMessage,
          };
          currentOsPolicy.popup.device_control.enabled = enabled;
        });
      }

      onChange({ isValid: true, updatedPolicy });
    },
    [onChange, policy]
  );

  return (
    <EuiSwitch
      label={DEVICE_CONTROL_PROTECTION_LABEL}
      labelProps={{ 'data-test-subj': getTestId('label') }}
      showLabel={false}
      checked={selected}
      disabled={mode !== 'edit'}
      onChange={handleSwitchChange}
      data-test-subj={getTestId()}
    />
  );
};

interface PerOsDeviceControlRowProps<OS extends DeviceControlOSes> {
  os: OS;
  accessor: PerOsPolicyAccessor<OS>;
  onChange: PolicyFormComponentCommonProps['onChange'];
  mode: 'edit' | 'view';
  isLast: boolean;
  'data-test-subj'?: string;
}

const PerOsDeviceControlRow = <OS extends DeviceControlOSes>({
  os,
  accessor,
  onChange,
  mode,
  isLast,
  'data-test-subj': dataTestSubj,
}: PerOsDeviceControlRowProps<OS>) => {
  const getTestId = useTestIdGenerator(dataTestSubj);
  const deviceControl = accessor.read().device_control;
  const accessLevel: DeviceControlAccessLevel =
    deviceControl?.usb_storage ?? DeviceControlAccessLevelEnum.audit;
  const handleAccessLevelChange = useCallback(
    (nextAccessLevel: DeviceControlAccessLevel) => {
      const updatedPolicy = accessor.update((currentOsPolicy) => {
        currentOsPolicy.device_control ??= {
          enabled: true,
          usb_storage: nextAccessLevel,
        };
        currentOsPolicy.device_control.usb_storage = nextAccessLevel;
        if (currentOsPolicy.popup.device_control) {
          currentOsPolicy.popup.device_control.enabled =
            nextAccessLevel === DeviceControlAccessLevelEnum.deny_all;
        }
      });
      onChange({ isValid: true, updatedPolicy });
    },
    [accessor, onChange]
  );

  return (
    <OsRow
      os={POLICY_OS_TO_OPERATING_SYSTEM[os]}
      primaryControl={
        <PerOsDeviceControlAccessLevelSelect
          accessLevel={accessLevel}
          onAccessLevelChange={handleAccessLevelChange}
          disabled={mode !== 'edit' || !deviceControl?.enabled}
          data-test-subj={getTestId('accessLevel')}
        />
      }
      isLast={isLast}
      data-test-subj={getTestId()}
    >
      <PerOsDeviceControlNotifyUserOption
        accessor={accessor}
        onChange={onChange}
        mode={mode}
        data-test-subj={getTestId('notifyUser')}
      />
    </OsRow>
  );
};
