/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import userEvent from '@testing-library/user-event';
import { fireEvent, within, type RenderResult } from '@testing-library/react';
import { cloneDeep } from 'lodash';
import type { AppContextTestRender } from '../../../../../../common/mock/endpoint';
import { createAppRootMockRenderer } from '../../../../../../common/mock/endpoint';
import { useLicense as _useLicense } from '../../../../../../common/hooks/use_license';
import { licenseService as licenseServiceMocked } from '../../../../../../common/hooks/__mocks__/use_license';
import { FleetPackagePolicyGenerator } from '../../../../../../../common/endpoint/data_generators/fleet_package_policy_generator';
import type { PolicyConfig } from '../../../../../../../common/endpoint/types';
import { ProtectionModes } from '../../../../../../../common/endpoint/types';
import { createLicenseServiceMock } from '../../../../../../../common/license/mocks';
import { getPolicySettingsFormTestSubjects } from '../mocks';
import { useGetProtectionsUnavailableComponent as _useGetProtectionsUnavailableComponent } from '../hooks/use_get_protections_unavailable_component';
import type { PerOsRansomwareProtectionCardProps } from './per_os_ransomware_protection_card';
import {
  LOCKED_CARD_RANSOMWARE_TITLE,
  PerOsRansomwareProtectionCard,
} from './per_os_ransomware_protection_card';

jest.mock('../../../../../../common/hooks/use_license');
jest.mock('../hooks/use_get_protections_unavailable_component');

const useLicenseMock = _useLicense as jest.Mock;
const useGetProtectionsUnavailableComponentMock =
  _useGetProtectionsUnavailableComponent as jest.Mock;

describe('PerOsRansomwareProtectionCard', () => {
  const testSubj = getPolicySettingsFormTestSubjects('test').perOsRansomware;
  let policy: PolicyConfig;
  let props: PerOsRansomwareProtectionCardProps;
  let mockedContext: AppContextTestRender;
  let renderResult: RenderResult;

  const render = () => {
    renderResult = mockedContext.render(
      <PerOsRansomwareProtectionCard {...props} policy={policy} />
    );
    return renderResult;
  };
  const rerender = (nextPolicy: PolicyConfig) => {
    renderResult.rerender(<PerOsRansomwareProtectionCard {...props} policy={nextPolicy} />);
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
    useLicenseMock.mockReturnValue(licenseServiceMocked);
    useGetProtectionsUnavailableComponentMock.mockReturnValue(null);
  });

  it('renders exactly Windows and Mac rows and no Linux row', () => {
    render();

    expect(renderResult.getByTestId(testSubj.windows.row)).toHaveTextContent('Windows');
    expect(renderResult.getByTestId(testSubj.mac.row)).toHaveTextContent('Mac');
    expect(renderResult.queryByText('Linux')).not.toBeInTheDocument();
    expect(
      renderResult.container.querySelectorAll(
        `[data-test-subj="${testSubj.windows.row}"], [data-test-subj="${testSubj.mac.row}"]`
      )
    ).toHaveLength(2);
  });

  it("reads each row's mode from its own OS branch", () => {
    policy.windows.ransomware.mode = ProtectionModes.off;
    policy.mac.ransomware.mode = ProtectionModes.detect;
    render();

    expect(renderResult.getByTestId(testSubj.windows.modeSelect)).toHaveTextContent(/^Disable$/);
    expect(renderResult.getByTestId(testSubj.mac.modeSelect)).toHaveTextContent(/^Detect$/);
  });

  it('a row at Disable renders its mode dropdown and no notify panel', () => {
    policy.windows.ransomware.mode = ProtectionModes.off;
    policy.mac.ransomware.mode = ProtectionModes.detect;
    render();

    const windowsRow = within(renderResult.getByTestId(testSubj.windows.row));
    expect(renderResult.getByTestId(testSubj.windows.modeSelect)).toHaveTextContent(/^Disable$/);
    expect(windowsRow.queryByText('Notify user')).not.toBeInTheDocument();
  });

  it('with Windows at Disable and macOS at Detect, macOS still shows all its controls', () => {
    policy.windows.ransomware.mode = ProtectionModes.off;
    policy.mac.ransomware.mode = ProtectionModes.detect;
    policy.mac.popup.ransomware.enabled = true;
    render();

    expect(renderResult.getByTestId(testSubj.mac.notifyUserCheckbox)).toBeEnabled();
    expect(renderResult.getByTestId(testSubj.mac.notifyCustomMessage)).toBeInTheDocument();
  });

  it('setting a row to Disable and back to Detect preserves notify values in every emitted updatedPolicy', async () => {
    policy.windows.ransomware.mode = ProtectionModes.detect;
    policy.windows.popup.ransomware.enabled = true;
    policy.windows.popup.ransomware.message = 'keep me';
    render();

    await userEvent.click(renderResult.getByTestId(testSubj.windows.modeSelect));
    await userEvent.click(renderResult.getByRole('option', { name: /^Disable$/ }));
    const afterDisable = getUpdatedPolicy();
    expect(afterDisable.windows.popup.ransomware.enabled).toBe(true);
    expect(afterDisable.windows.popup.ransomware.message).toBe('keep me');

    rerender(afterDisable);
    expect(renderResult.queryByTestId(testSubj.windows.notifyUserCheckbox)).not.toBeInTheDocument();

    await userEvent.click(renderResult.getByTestId(testSubj.windows.modeSelect));
    await userEvent.click(renderResult.getByRole('option', { name: /^Detect$/ }));
    const afterDetect = getUpdatedPolicy();
    expect(afterDetect.windows.popup.ransomware.enabled).toBe(true);
    expect(afterDetect.windows.popup.ransomware.message).toBe('keep me');
  });

  it('changing the macOS mode or notification leaves Windows and Linux byte-identical', async () => {
    policy.mac.ransomware.mode = ProtectionModes.prevent;
    policy.mac.popup.ransomware.enabled = true;
    const windowsBefore = cloneDeep(policy.windows);
    const linuxBefore = cloneDeep(policy.linux);
    const supportedBefore = policy.mac.ransomware.supported;
    render();

    await userEvent.click(renderResult.getByTestId(testSubj.mac.modeSelect));
    await userEvent.click(renderResult.getByRole('option', { name: /^Detect$/ }));
    const afterMode = getUpdatedPolicy();
    expect(afterMode.mac.ransomware.mode).toBe(ProtectionModes.detect);
    expect(afterMode.mac.ransomware.supported).toBe(supportedBefore);
    expect(afterMode.windows).toEqual(windowsBefore);
    expect(afterMode.linux).toEqual(linuxBefore);

    (props.onChange as jest.Mock).mockClear();
    rerender(afterMode);
    fireEvent.change(renderResult.getByTestId(testSubj.mac.notifyCustomMessage), {
      target: { value: 'Mac notification' },
    });
    const afterMessage = getUpdatedPolicy();
    expect(afterMessage.mac.popup.ransomware.message).toBe('Mac notification');
    expect(afterMessage.mac.ransomware.supported).toBe(supportedBefore);
    expect(afterMessage.windows).toEqual(windowsBefore);
    expect(afterMessage.linux).toEqual(linuxBefore);

    (props.onChange as jest.Mock).mockClear();
    rerender(afterMessage);
    await userEvent.click(renderResult.getByTestId(testSubj.mac.notifyUserCheckbox));
    const afterNotify = getUpdatedPolicy();
    expect(afterNotify.mac.popup.ransomware.enabled).toBe(false);
    expect(afterNotify.mac.ransomware.supported).toBe(supportedBefore);
    expect(afterNotify.windows).toEqual(windowsBefore);
    expect(afterNotify.linux).toEqual(linuxBefore);
  });

  it('reads the master toggle as on when Windows is off and Mac is prevent', () => {
    policy.windows.ransomware.mode = ProtectionModes.off;
    policy.mac.ransomware.mode = ProtectionModes.prevent;
    render();

    expect(renderResult.getByTestId(testSubj.enableDisableSwitch)).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  it('renders the locked card below Platinum', () => {
    const licenseServiceMock = createLicenseServiceMock();
    licenseServiceMock.isPlatinumPlus.mockReturnValue(false);
    useLicenseMock.mockReturnValue(licenseServiceMock);
    render();

    expect(renderResult.getByTestId(testSubj.lockedCardTitle)).toHaveTextContent(
      LOCKED_CARD_RANSOMWARE_TITLE
    );
  });

  it('returns null when protections are unavailable', () => {
    useGetProtectionsUnavailableComponentMock.mockReturnValue(() => <div />);

    expect(render().container).toBeEmptyDOMElement();
  });
});
