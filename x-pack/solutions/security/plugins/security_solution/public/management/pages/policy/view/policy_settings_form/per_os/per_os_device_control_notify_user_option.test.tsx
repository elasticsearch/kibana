/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import userEvent from '@testing-library/user-event';
import { fireEvent } from '@testing-library/react';
import { cloneDeep } from 'lodash';
import type { AppContextTestRender } from '../../../../../../common/mock/endpoint';
import { createAppRootMockRenderer } from '../../../../../../common/mock/endpoint';
import { FleetPackagePolicyGenerator } from '../../../../../../../common/endpoint/data_generators/fleet_package_policy_generator';
import type { PolicyConfig } from '../../../../../../../common/endpoint/types';
import {
  DeviceControlAccessLevel,
  PolicyOperatingSystem,
} from '../../../../../../../common/endpoint/types';
import { DefaultPolicyDeviceNotificationMessage } from '../../../../../../../common/endpoint/models/policy_config';
import type { PerOsDeviceControlNotifyUserOptionProps } from './per_os_device_control_notify_user_option';
import { PerOsDeviceControlNotifyUserOption } from './per_os_device_control_notify_user_option';
import { createDeviceControlPolicyAccessor } from './policy_accessor';

jest.mock('../../../../../../common/hooks/use_license');

describe('PerOsDeviceControlNotifyUserOption', () => {
  const testSubj = 'perOsDeviceControlNotifyUser';
  let policy: PolicyConfig;
  let onChange: jest.Mock;
  let mockedContext: AppContextTestRender;
  let renderResult: ReturnType<AppContextTestRender['render']>;
  let hasRendered: boolean;

  const renderMacOption = (
    overrides: Partial<PerOsDeviceControlNotifyUserOptionProps<PolicyOperatingSystem.mac>> = {},
    policyToRender: PolicyConfig = policy
  ) => {
    const props: PerOsDeviceControlNotifyUserOptionProps<PolicyOperatingSystem.mac> = {
      accessor: createDeviceControlPolicyAccessor(policyToRender, PolicyOperatingSystem.mac),
      onChange,
      mode: 'edit',
      'data-test-subj': testSubj,
      ...overrides,
    };
    const component = <PerOsDeviceControlNotifyUserOption {...props} />;
    if (hasRendered) {
      renderResult.rerender(component);
    } else {
      renderResult = mockedContext.render(component);
      hasRendered = true;
    }
    return renderResult;
  };

  const getUpdatedPolicy = (): PolicyConfig => {
    return onChange.mock.calls[onChange.mock.calls.length - 1][0].updatedPolicy;
  };

  beforeEach(() => {
    hasRendered = false;
    mockedContext = createAppRootMockRenderer();
    policy = new FleetPackagePolicyGenerator('seed').generateEndpointPackagePolicy().inputs[0]
      .config.policy.value;
    policy[PolicyOperatingSystem.mac].device_control = {
      enabled: true,
      usb_storage: DeviceControlAccessLevel.audit,
    };
    policy[PolicyOperatingSystem.mac].popup.device_control = {
      enabled: true,
      message: 'Mac message',
    };
    policy[PolicyOperatingSystem.windows].popup.device_control = {
      enabled: false,
      message: 'Windows message',
    };
    onChange = jest.fn();
  });

  it('reads checkbox and message from the bound macOS accessor', () => {
    renderMacOption();

    expect(renderResult.getByTestId(`${testSubj}-checkbox`)).toBeChecked();
    expect(renderResult.getByTestId(`${testSubj}-customMessage`)).toHaveValue('Mac message');
    expect(renderResult.getByRole('textbox', { name: 'Customize message' })).toBeInTheDocument();
  });

  it('renders the message input in checked and unchecked states and disables it when unchecked', () => {
    renderMacOption();
    expect(renderResult.getByTestId(`${testSubj}-customMessage`)).toBeEnabled();

    policy[PolicyOperatingSystem.mac].popup.device_control!.enabled = false;
    renderMacOption();

    expect(renderResult.getByRole('textbox', { name: 'Customize message' })).toBeInTheDocument();
    expect(renderResult.getByTestId(`${testSubj}-customMessage`)).toBeDisabled();
    expect(renderResult.getByTestId(`${testSubj}-customMessage`)).toHaveValue('Mac message');
  });

  it('is hidden when the bound OS access level is deny_all', () => {
    policy[PolicyOperatingSystem.mac].device_control!.usb_storage =
      DeviceControlAccessLevel.deny_all;

    renderMacOption();

    expect(renderResult.queryByTestId(testSubj)).not.toBeInTheDocument();
  });

  it('changing the macOS checkbox leaves Windows and Linux byte-identical', async () => {
    const windowsBefore = cloneDeep(policy[PolicyOperatingSystem.windows]);
    const linuxBefore = cloneDeep(policy[PolicyOperatingSystem.linux]);
    renderMacOption();

    await userEvent.click(renderResult.getByTestId(`${testSubj}-checkbox`));

    const updatedPolicy = getUpdatedPolicy();
    expect(updatedPolicy.mac.popup.device_control?.enabled).toBe(false);
    expect(updatedPolicy.windows).toEqual(windowsBefore);
    expect(updatedPolicy.linux).toEqual(linuxBefore);
  });

  it('preserves the custom message when notification is unchecked and re-checked', async () => {
    renderMacOption();

    await userEvent.click(renderResult.getByTestId(`${testSubj}-checkbox`));
    const afterUncheck = getUpdatedPolicy();
    expect(afterUncheck.mac.popup.device_control).toEqual({
      enabled: false,
      message: 'Mac message',
    });

    onChange.mockClear();
    renderMacOption({}, afterUncheck);
    await userEvent.click(renderResult.getByTestId(`${testSubj}-checkbox`));
    const afterRecheck = getUpdatedPolicy();
    expect(afterRecheck.mac.popup.device_control).toEqual({
      enabled: true,
      message: 'Mac message',
    });
  });

  it('changing the macOS message leaves Windows and Linux byte-identical', () => {
    const windowsBefore = cloneDeep(policy[PolicyOperatingSystem.windows]);
    const linuxBefore = cloneDeep(policy[PolicyOperatingSystem.linux]);
    renderMacOption();

    fireEvent.change(renderResult.getByTestId(`${testSubj}-customMessage`), {
      target: { value: 'Updated Mac message' },
    });

    const updatedPolicy = getUpdatedPolicy();
    expect(updatedPolicy.mac.popup.device_control?.message).toBe('Updated Mac message');
    expect(updatedPolicy.windows).toEqual(windowsBefore);
    expect(updatedPolicy.linux).toEqual(linuxBefore);
  });

  it('creates the optional macOS popup branch without changing another OS', async () => {
    delete policy[PolicyOperatingSystem.mac].popup.device_control;
    const windowsBefore = cloneDeep(policy[PolicyOperatingSystem.windows]);
    renderMacOption();

    await userEvent.click(renderResult.getByTestId(`${testSubj}-checkbox`));

    const updatedPolicy = getUpdatedPolicy();
    expect(updatedPolicy.mac.popup.device_control).toEqual({
      enabled: true,
      message: DefaultPolicyDeviceNotificationMessage,
    });
    expect(updatedPolicy.windows).toEqual(windowsBefore);
  });
});
