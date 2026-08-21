/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AppContextTestRender } from '../../../../../../common/mock/endpoint';
import { createAppRootMockRenderer } from '../../../../../../common/mock/endpoint';
import { FleetPackagePolicyGenerator } from '../../../../../../../common/endpoint/data_generators/fleet_package_policy_generator';
import React from 'react';
import type { DetectPreventProtectionLevelProps } from './detect_prevent_protection_level';
import { DetectPreventProtectionLevel } from './detect_prevent_protection_level';
import userEvent from '@testing-library/user-event';
import { cloneDeep } from 'lodash';
import { set } from '@kbn/safer-lodash-set';
import { ProtectionModes, PolicyOperatingSystem } from '../../../../../../../common/endpoint/types';
import { expectIsViewOnly, exactMatchText } from '../mocks';
import { createLicenseServiceMock } from '../../../../../../../common/license/mocks';
import { licenseService as licenseServiceMocked } from '../../../../../../common/hooks/__mocks__/use_license';
import { useLicense as _useLicense } from '../../../../../../common/hooks/use_license';

jest.mock('../../../../../../common/hooks/use_license');

const useLicenseMock = _useLicense as jest.Mock;

describe('Policy form Detect Prevent Protection level component', () => {
  let formProps: DetectPreventProtectionLevelProps;
  let render: () => ReturnType<AppContextTestRender['render']>;
  let renderResult: ReturnType<typeof render>;

  const clickProtection = async (level: 'detect' | 'prevent') => {
    await userEvent.click(renderResult.getByTestId(`test-${level}Radio`).querySelector('label')!);
  };

  const isProtectionChecked = (level: 'detect' | 'prevent'): boolean => {
    return renderResult.getByTestId(`test-${level}Radio`)!.querySelector('input')!.checked ?? false;
  };

  beforeEach(() => {
    const mockedContext = createAppRootMockRenderer();

    formProps = {
      policy: new FleetPackagePolicyGenerator('seed').generateEndpointPackagePolicy().inputs[0]
        .config.policy.value,
      onChange: jest.fn(),
      mode: 'edit',
      'data-test-subj': 'test',
      protection: 'malware',
      osList: [
        PolicyOperatingSystem.windows,
        PolicyOperatingSystem.mac,
        PolicyOperatingSystem.linux,
      ],
    };

    render = () => {
      renderResult = mockedContext.render(<DetectPreventProtectionLevel {...formProps} />);
      return renderResult;
    };
  });

  it('should render expected options', () => {
    const { getByTestId } = render();

    expect(getByTestId('test-detectRadio'));
    expect(getByTestId('test-preventRadio'));
  });

  it('should allow detect mode to be selected', async () => {
    const expectedPolicyUpdate = cloneDeep(formProps.policy);
    set(expectedPolicyUpdate, 'windows.malware.mode', ProtectionModes.detect);
    set(expectedPolicyUpdate, 'mac.malware.mode', ProtectionModes.detect);
    set(expectedPolicyUpdate, 'linux.malware.mode', ProtectionModes.detect);
    set(expectedPolicyUpdate, 'windows.popup.malware.enabled', false);
    set(expectedPolicyUpdate, 'mac.popup.malware.enabled', false);
    set(expectedPolicyUpdate, 'linux.popup.malware.enabled', false);
    render();

    expect(isProtectionChecked('prevent')).toBe(true);

    await clickProtection('detect');

    expect(formProps.onChange).toHaveBeenCalledWith({
      isValid: true,
      updatedPolicy: expectedPolicyUpdate,
    });
  });

  it('should allow prevent mode to be selected', async () => {
    formProps.osList = [PolicyOperatingSystem.windows];
    set(formProps.policy, 'windows.malware.mode', ProtectionModes.detect);
    const expectedPolicyUpdate = cloneDeep(formProps.policy);
    set(expectedPolicyUpdate, 'windows.malware.mode', ProtectionModes.prevent);
    render();

    expect(isProtectionChecked('detect')).toBe(true);

    await clickProtection('prevent');

    expect(formProps.onChange).toHaveBeenCalledWith({
      isValid: true,
      updatedPolicy: expectedPolicyUpdate,
    });
  });

  describe('and license is lower than platinum', () => {
    beforeEach(() => {
      const licenseServiceMock = createLicenseServiceMock();
      licenseServiceMock.isPlatinumPlus.mockReturnValue(false);

      useLicenseMock.mockReturnValue(licenseServiceMock);
    });

    afterEach(() => {
      useLicenseMock.mockReturnValue(licenseServiceMocked);
    });

    it('should NOT update user notification options', async () => {
      const expectedPolicyUpdate = cloneDeep(formProps.policy);
      set(expectedPolicyUpdate, 'windows.malware.mode', ProtectionModes.detect);
      set(expectedPolicyUpdate, 'mac.malware.mode', ProtectionModes.detect);
      set(expectedPolicyUpdate, 'linux.malware.mode', ProtectionModes.detect);
      render();

      expect(isProtectionChecked('prevent')).toBe(true);

      await clickProtection('detect');

      expect(formProps.onChange).toHaveBeenCalledWith({
        isValid: true,
        updatedPolicy: expectedPolicyUpdate,
      });
    });
  });

  describe('and rendered in View mode', () => {
    beforeEach(() => {
      formProps.mode = 'view';
    });

    it('should display prevent', () => {
      render();

      expectIsViewOnly(renderResult.getByTestId('test'));
      expect(renderResult.getByTestId('test')).toHaveTextContent(
        exactMatchText('Protection levelPrevent')
      );
    });

    it('should display detect', () => {
      set(formProps.policy, 'windows.malware.mode', ProtectionModes.detect);
      render();

      expectIsViewOnly(renderResult.getByTestId('test'));
      expect(renderResult.getByTestId('test')).toHaveTextContent(
        exactMatchText('Protection levelDetect')
      );
    });
  });
});
