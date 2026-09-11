/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import userEvent from '@testing-library/user-event';
import type { AppContextTestRender } from '../../../../../../common/mock/endpoint';
import { createAppRootMockRenderer } from '../../../../../../common/mock/endpoint';
import { FleetPackagePolicyGenerator } from '../../../../../../../common/endpoint/data_generators/fleet_package_policy_generator';
import type { PolicyConfig } from '../../../../../../../common/endpoint/types';
import { ProtectionModes } from '../../../../../../../common/endpoint/types';
import type { PerOsProtectionMasterToggleProps } from './per_os_protection_master_toggle';
import { PerOsProtectionMasterToggle } from './per_os_protection_master_toggle';

jest.mock('../../../../../../common/hooks/use_license');

describe('PerOsProtectionMasterToggle', () => {
  let policy: PolicyConfig;
  let props: PerOsProtectionMasterToggleProps;
  let renderResult: ReturnType<AppContextTestRender['render']>;

  const render = () => {
    const mockedContext = createAppRootMockRenderer();
    renderResult = mockedContext.render(<PerOsProtectionMasterToggle {...props} />);
    return renderResult;
  };

  beforeEach(() => {
    policy = new FleetPackagePolicyGenerator('seed').generateEndpointPackagePolicy().inputs[0]
      .config.policy.value;
    props = {
      policy,
      onChange: jest.fn(),
      mode: 'edit',
      protection: 'malware',
      protectionLabel: 'Malware protections',
      osList: ['windows', 'mac', 'linux'],
      'data-test-subj': 'test',
    };
  });

  it('renders on when Windows is off but macOS is prevent', () => {
    policy.windows.malware.mode = ProtectionModes.off;
    policy.mac.malware.mode = ProtectionModes.prevent;
    policy.linux.malware.mode = ProtectionModes.off;

    render();

    expect(renderResult.getByTestId('test')).toHaveAttribute('aria-checked', 'true');
  });

  it('sets every supported OS to off when toggled off', async () => {
    render();

    await userEvent.click(renderResult.getByTestId('test'));

    const updatedPolicy = (props.onChange as jest.Mock).mock.calls[0][0]
      .updatedPolicy as PolicyConfig;
    expect(updatedPolicy.windows.malware.mode).toBe(ProtectionModes.off);
    expect(updatedPolicy.mac.malware.mode).toBe(ProtectionModes.off);
    expect(updatedPolicy.linux.malware.mode).toBe(ProtectionModes.off);
  });

  it('sets every supported OS to prevent when toggled on', async () => {
    policy.windows.malware.mode = ProtectionModes.off;
    policy.mac.malware.mode = ProtectionModes.off;
    policy.linux.malware.mode = ProtectionModes.off;
    render();

    await userEvent.click(renderResult.getByTestId('test'));

    const updatedPolicy = (props.onChange as jest.Mock).mock.calls[0][0]
      .updatedPolicy as PolicyConfig;
    expect(updatedPolicy.windows.malware.mode).toBe(ProtectionModes.prevent);
    expect(updatedPolicy.mac.malware.mode).toBe(ProtectionModes.prevent);
    expect(updatedPolicy.linux.malware.mode).toBe(ProtectionModes.prevent);
  });

  it('invokes the optional side-effect hook once for each supported OS', async () => {
    props.additionalOnOsSwitchChange = jest.fn(({ value, osPolicy }) => {
      osPolicy.malware.blocklist = value;
    });
    render();

    await userEvent.click(renderResult.getByTestId('test'));

    expect(props.additionalOnOsSwitchChange).toHaveBeenCalledTimes(3);
    expect(props.additionalOnOsSwitchChange).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ value: false, os: 'windows' })
    );
    expect(props.additionalOnOsSwitchChange).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ value: false, os: 'mac' })
    );
    expect(props.additionalOnOsSwitchChange).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ value: false, os: 'linux' })
    );
    const updatedPolicy = (props.onChange as jest.Mock).mock.calls[0][0]
      .updatedPolicy as PolicyConfig;
    expect(updatedPolicy.windows.malware.blocklist).toBe(false);
    expect(updatedPolicy.mac.malware.blocklist).toBe(false);
    expect(updatedPolicy.linux.malware.blocklist).toBe(false);
  });
});
