/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import userEvent from '@testing-library/user-event';
import { within } from '@testing-library/react';
import { cloneDeep } from 'lodash';
import { OperatingSystem } from '@kbn/securitysolution-utils';
import type { AppContextTestRender } from '../../../../../../common/mock/endpoint';
import { createAppRootMockRenderer } from '../../../../../../common/mock/endpoint';
import { FleetPackagePolicyGenerator } from '../../../../../../../common/endpoint/data_generators/fleet_package_policy_generator';
import type { PolicyConfig } from '../../../../../../../common/endpoint/types';
import { ProtectionModes } from '../../../../../../../common/endpoint/types';
import { createLicenseServiceMock } from '../../../../../../../common/license/mocks';
import { licenseService as licenseServiceMocked } from '../../../../../../common/hooks/__mocks__/use_license';
import { useLicense as _useLicense } from '../../../../../../common/hooks/use_license';
import { OS_TITLES } from '../../../../../common/translations';
import { exactMatchText, getPolicySettingsFormTestSubjects } from '../mocks';
import type { PerOsMemoryProtectionCardProps } from './per_os_memory_protection_card';
import {
  LOCKED_CARD_MEMORY_TITLE,
  PerOsMemoryProtectionCard,
} from './per_os_memory_protection_card';

jest.mock('../../../../../../common/hooks/use_license');

const useLicenseMock = _useLicense as jest.Mock;

describe('PerOsMemoryProtectionCard', () => {
  const testSubj = getPolicySettingsFormTestSubjects('test').perOsMemory;
  let policy: PolicyConfig;
  let props: PerOsMemoryProtectionCardProps;
  let mockedContext: ReturnType<typeof createAppRootMockRenderer>;
  let renderResult: ReturnType<AppContextTestRender['render']>;

  const render = () => {
    renderResult = mockedContext.render(<PerOsMemoryProtectionCard {...props} policy={policy} />);
    return renderResult;
  };
  const rerender = (nextPolicy: PolicyConfig) => {
    renderResult.rerender(<PerOsMemoryProtectionCard {...props} policy={nextPolicy} />);
  };
  const getUpdatedPolicy = (): PolicyConfig => {
    const onChange = props.onChange as jest.Mock;
    return onChange.mock.calls[onChange.mock.calls.length - 1][0].updatedPolicy;
  };

  beforeEach(() => {
    mockedContext = createAppRootMockRenderer();
    policy = new FleetPackagePolicyGenerator('seed').generateEndpointPackagePolicy().inputs[0]
      .config.policy.value;
    props = {
      policy,
      onChange: jest.fn(),
      mode: 'edit',
      'data-test-subj': testSubj.card,
    };
  });

  it('renders a row for each of Windows, Mac, Linux with the correct OS_TITLES label', () => {
    render();

    expect(renderResult.getByTestId(testSubj.windows.row)).toHaveTextContent(
      OS_TITLES[OperatingSystem.WINDOWS]
    );
    expect(renderResult.getByTestId(testSubj.mac.row)).toHaveTextContent(
      OS_TITLES[OperatingSystem.MAC]
    );
    expect(renderResult.getByTestId(testSubj.linux.row)).toHaveTextContent(
      OS_TITLES[OperatingSystem.LINUX]
    );
  });

  it("shows each row's memory_protection.mode from that OS branch", () => {
    policy.windows.memory_protection.mode = ProtectionModes.off;
    policy.mac.memory_protection.mode = ProtectionModes.detect;
    policy.linux.memory_protection.mode = ProtectionModes.prevent;
    render();

    expect(renderResult.getByTestId(testSubj.windows.modeSelect)).toHaveTextContent(/^Disable$/);
    expect(renderResult.getByTestId(testSubj.mac.modeSelect)).toHaveTextContent(/^Detect$/);
    expect(renderResult.getByTestId(testSubj.linux.modeSelect)).toHaveTextContent(
      /^Detect & prevent$/
    );
  });

  it('a row at Disable renders its mode dropdown and no notify panel', () => {
    policy.windows.memory_protection.mode = ProtectionModes.off;
    policy.mac.memory_protection.mode = ProtectionModes.detect;
    render();

    const windowsRow = within(renderResult.getByTestId(testSubj.windows.row));
    expect(renderResult.getByTestId(testSubj.windows.modeSelect)).toHaveTextContent(/^Disable$/);
    expect(windowsRow.queryByText('Notify user')).not.toBeInTheDocument();
  });

  it('with Windows at Disable and macOS at Detect, macOS still shows all its controls', () => {
    policy.windows.memory_protection.mode = ProtectionModes.off;
    policy.mac.memory_protection.mode = ProtectionModes.detect;
    policy.mac.popup.memory_protection.enabled = true;
    render();

    expect(renderResult.getByTestId(testSubj.mac.notifyUserCheckbox)).toBeEnabled();
    expect(
      within(renderResult.getByTestId(testSubj.mac.row)).getByText('Notify user')
    ).toBeInTheDocument();
  });

  it('setting a row to Disable and back to Detect preserves notify values in every emitted updatedPolicy', async () => {
    policy.windows.memory_protection.mode = ProtectionModes.detect;
    policy.windows.popup.memory_protection.enabled = true;
    policy.windows.popup.memory_protection.message = 'keep me';
    render();

    await userEvent.click(renderResult.getByTestId(testSubj.windows.modeSelect));
    await userEvent.click(renderResult.getByRole('option', { name: /^Disable$/ }));
    const afterDisable = getUpdatedPolicy();
    expect(afterDisable.windows.popup.memory_protection.enabled).toBe(true);
    expect(afterDisable.windows.popup.memory_protection.message).toBe('keep me');

    rerender(afterDisable);
    expect(renderResult.queryByTestId(testSubj.windows.notifyUserCheckbox)).not.toBeInTheDocument();

    await userEvent.click(renderResult.getByTestId(testSubj.windows.modeSelect));
    await userEvent.click(renderResult.getByRole('option', { name: /^Detect$/ }));
    const afterDetect = getUpdatedPolicy();
    expect(afterDetect.windows.popup.memory_protection.enabled).toBe(true);
    expect(afterDetect.windows.popup.memory_protection.message).toBe('keep me');
  });

  it('changing the macOS mode leaves windows and linux byte-identical on updatedPolicy', async () => {
    const windowsBefore = cloneDeep(policy.windows);
    const linuxBefore = cloneDeep(policy.linux);
    policy.mac.memory_protection.mode = ProtectionModes.prevent;
    render();

    await userEvent.click(renderResult.getByTestId(testSubj.mac.modeSelect));
    await userEvent.click(renderResult.getByRole('option', { name: /^Detect$/ }));
    const afterMode = getUpdatedPolicy();
    expect(afterMode.mac.memory_protection.mode).toBe(ProtectionModes.detect);
    expect(afterMode.windows).toEqual(windowsBefore);
    expect(afterMode.linux).toEqual(linuxBefore);
  });

  it('changing the macOS notify checkbox leaves windows and linux byte-identical on updatedPolicy', async () => {
    const windowsBefore = cloneDeep(policy.windows);
    const linuxBefore = cloneDeep(policy.linux);
    policy.mac.memory_protection.mode = ProtectionModes.prevent;
    policy.mac.popup.memory_protection.enabled = true;
    render();

    await userEvent.click(renderResult.getByTestId(testSubj.mac.notifyUserCheckbox));
    const afterNotify = getUpdatedPolicy();
    expect(afterNotify.mac.popup.memory_protection.enabled).toBe(false);
    expect(afterNotify.windows).toEqual(windowsBefore);
    expect(afterNotify.linux).toEqual(linuxBefore);
  });

  it('master toggle reads on when Windows is off but macOS is prevent', () => {
    policy.windows.memory_protection.mode = ProtectionModes.off;
    policy.mac.memory_protection.mode = ProtectionModes.prevent;
    policy.linux.memory_protection.mode = ProtectionModes.off;
    render();

    expect(
      renderResult.getByTestId(testSubj.enableDisableSwitch).getAttribute('aria-checked')
    ).toBe('true');
  });

  describe('and license is lower than Platinum', () => {
    beforeEach(() => {
      const licenseServiceMock = createLicenseServiceMock();
      licenseServiceMock.isPlatinumPlus.mockReturnValue(false);

      useLicenseMock.mockReturnValue(licenseServiceMock);
    });

    afterEach(() => {
      useLicenseMock.mockReturnValue(licenseServiceMocked);
    });

    it('should show locked card if license not platinum+', () => {
      render();

      expect(renderResult.getByTestId(testSubj.lockedCardTitle)).toHaveTextContent(
        exactMatchText(LOCKED_CARD_MEMORY_TITLE)
      );
    });
  });
});
