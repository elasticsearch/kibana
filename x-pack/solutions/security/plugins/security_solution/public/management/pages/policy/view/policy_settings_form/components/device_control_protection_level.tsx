/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useMemo } from 'react';
import { cloneDeep } from 'lodash';
import { EuiRadio, EuiSpacer, EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { useTestIdGenerator } from '../../../../../hooks/use_test_id_generator';
import { SettingCardHeader } from './setting_card';
import type { PolicyFormComponentCommonProps } from '../types';
import type {
  ImmutableArray,
  Immutable,
  DeviceControlAccessLevel,
} from '../../../../../../../common/endpoint/types';
import { DeviceControlAccessLevel as DeviceControlAccessLevelEnum } from '../../../../../../../common/endpoint/types';
import { setDeviceControlUsbStorage } from '../../../../../../../common/endpoint/models/policy_config_helpers';
import type { DeviceControlOSes } from '../../../types';

const ALLOW_ALL_LABEL = i18n.translate(
  'xpack.securitySolution.endpoint.policy.details.deviceControl.allowReadWrite',
  {
    defaultMessage: 'Allow read, write and execute',
  }
);

const BLOCK_LABEL = i18n.translate(
  'xpack.securitySolution.endpoint.policy.details.deviceControl.blockAll',
  {
    defaultMessage: 'Block all',
  }
);

const READ_ONLY_LABEL = i18n.translate(
  'xpack.securitySolution.endpoint.policy.details.deviceControl.readOnly',
  {
    defaultMessage: 'Read only',
  }
);

const BLOCK_EXECUTE_LABEL = i18n.translate(
  'xpack.securitySolution.endpoint.policy.details.deviceControl.executeOnly',
  {
    defaultMessage: 'Read and write',
  }
);

export type DeviceControlProtectionLevelProps = PolicyFormComponentCommonProps & {
  osList: ImmutableArray<DeviceControlOSes>;
};

export const DeviceControlProtectionLevel = memo<DeviceControlProtectionLevelProps>(
  ({ policy, osList, mode, onChange, 'data-test-subj': dataTestSubj }) => {
    const isEditMode = mode === 'edit';
    const getTestId = useTestIdGenerator(dataTestSubj);

    const radios: Immutable<
      Array<{
        id: DeviceControlAccessLevel;
        label: string;
      }>
    > = useMemo(() => {
      return [
        {
          id: DeviceControlAccessLevelEnum.audit,
          label: ALLOW_ALL_LABEL,
        },
        {
          id: DeviceControlAccessLevelEnum.no_execute,
          label: BLOCK_EXECUTE_LABEL,
        },
        {
          id: DeviceControlAccessLevelEnum.read_only,
          label: READ_ONLY_LABEL,
        },
        {
          id: DeviceControlAccessLevelEnum.deny_all,
          label: BLOCK_LABEL,
        },
      ];
    }, []);

    const getCurrentAccessLevel = useMemo(() => {
      if (policy.windows.device_control?.usb_storage) {
        return policy.windows.device_control.usb_storage;
      }
      if (policy.mac.device_control?.usb_storage) {
        return policy.mac.device_control.usb_storage;
      }
      return DeviceControlAccessLevelEnum.audit;
    }, [policy]);

    const currentAccessLevelLabel = useMemo(() => {
      const radio = radios.find((item) => item.id === getCurrentAccessLevel);

      if (radio) {
        return radio.label;
      }

      return BLOCK_LABEL;
    }, [getCurrentAccessLevel, radios]);

    const isDeviceControlEnabled = useMemo(() => {
      // Check if device control is enabled on any OS
      return osList.some((os) => {
        if (os === 'windows' || os === 'mac') {
          return policy[os].device_control?.enabled;
        }
        return false;
      });
    }, [policy, osList]);

    return (
      <div data-test-subj={getTestId()}>
        <SettingCardHeader>
          <FormattedMessage
            id="xpack.securitySolution.endpoint.policyDetailsConfig.deviceControl.usbStorageLevel"
            defaultMessage="USB storage access level"
          />
        </SettingCardHeader>
        <EuiSpacer size="xs" />
        <EuiFlexGroup gutterSize="xl" wrap responsive={false}>
          {isEditMode ? (
            radios.map(({ label, id }) => {
              return (
                <EuiFlexItem grow={false} key={id}>
                  <DeviceControlAccessRadio
                    policy={policy}
                    onChange={onChange}
                    mode={mode}
                    accessLevel={id}
                    osList={osList}
                    label={label}
                    isEnabled={isDeviceControlEnabled}
                    data-test-subj={getTestId(`${id}Radio`)}
                  />
                </EuiFlexItem>
              );
            })
          ) : (
            <>{currentAccessLevelLabel}</>
          )}
        </EuiFlexGroup>
      </div>
    );
  }
);
DeviceControlProtectionLevel.displayName = 'DeviceControlProtectionLevel';

interface DeviceControlAccessRadioProps extends PolicyFormComponentCommonProps {
  accessLevel: DeviceControlAccessLevel;
  osList: ImmutableArray<DeviceControlOSes>;
  label: string;
  isEnabled: boolean;
}

const DeviceControlAccessRadio = React.memo(
  ({
    accessLevel,
    osList,
    label,
    isEnabled,
    onChange,
    policy,
    mode,
    'data-test-subj': dataTestSubj,
  }: DeviceControlAccessRadioProps) => {
    const getCurrentAccessLevel = () => {
      // Check Windows first, then Mac for device_control configuration
      if (policy.windows.device_control?.usb_storage) {
        return policy.windows.device_control.usb_storage;
      }
      if (policy.mac.device_control?.usb_storage) {
        return policy.mac.device_control.usb_storage;
      }
      return DeviceControlAccessLevelEnum.audit;
    };

    const selected = getCurrentAccessLevel();
    const showEditableFormFields = mode === 'edit';

    const radioId = useMemo(() => {
      return `${osList.join('-')}-device_control-${accessLevel}`;
    }, [osList, accessLevel]);

    const handleRadioChange = useCallback(() => {
      const newPayload = cloneDeep(policy);
      setDeviceControlUsbStorage(newPayload, accessLevel);

      onChange({ isValid: true, updatedPolicy: newPayload });
    }, [accessLevel, onChange, policy]);

    return (
      <EuiRadio
        name={radioId}
        label={label}
        id={radioId}
        checked={selected === accessLevel}
        onChange={handleRadioChange}
        disabled={!showEditableFormFields || !isEnabled}
        data-test-subj={dataTestSubj}
      />
    );
  }
);

DeviceControlAccessRadio.displayName = 'DeviceControlAccessRadio';
