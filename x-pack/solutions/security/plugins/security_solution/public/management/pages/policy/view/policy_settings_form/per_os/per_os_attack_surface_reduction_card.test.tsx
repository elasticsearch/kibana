/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import userEvent from '@testing-library/user-event';
import { cloneDeep } from 'lodash';
import { set } from '@kbn/safer-lodash-set';
import type { AppContextTestRender } from '../../../../../../common/mock/endpoint';
import { createAppRootMockRenderer } from '../../../../../../common/mock/endpoint';
import { FleetPackagePolicyGenerator } from '../../../../../../../common/endpoint/data_generators/fleet_package_policy_generator';
import type { PolicyConfig } from '../../../../../../../common/endpoint/types';
import { expectIsViewOnly, getPolicySettingsFormTestSubjects } from '../mocks';
import { useLicense as _useLicense } from '../../../../../../common/hooks/use_license';
import { createLicenseServiceMock } from '../../../../../../../common/license/mocks';
import { licenseService as licenseServiceMocked } from '../../../../../../common/hooks/__mocks__/use_license';
import type { PerOsAttackSurfaceReductionCardProps } from './per_os_attack_surface_reduction_card';
import {
  LOCKED_CARD_ATTACK_SURFACE_REDUCTION,
  PerOsAttackSurfaceReductionCard,
  SWITCH_LABEL,
} from './per_os_attack_surface_reduction_card';

jest.mock('../../../../../../common/hooks/use_license');

const useLicenseMock = _useLicense as jest.Mock;

describe('PerOsAttackSurfaceReductionCard', () => {
  const testSubj = getPolicySettingsFormTestSubjects('test').perOsAttackSurface;
  let policy: PolicyConfig;
  let props: PerOsAttackSurfaceReductionCardProps;
  let mockedContext: ReturnType<typeof createAppRootMockRenderer>;
  let renderResult: ReturnType<AppContextTestRender['render']>;

  const render = () => {
    renderResult = mockedContext.render(
      <PerOsAttackSurfaceReductionCard {...props} policy={policy} />
    );
    return renderResult;
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

  it('renders exactly one row labelled Windows and no Mac or Linux row', () => {
    render();

    expect(renderResult.getByTestId(testSubj.windows.row)).toHaveTextContent('Windows');
    expect(renderResult.queryByTestId(`${testSubj.card}-mac`)).not.toBeInTheDocument();
    expect(renderResult.queryByTestId(`${testSubj.card}-linux`)).not.toBeInTheDocument();
    expect(renderResult.queryAllByText('Mac')).toHaveLength(0);
    expect(renderResult.queryAllByText('Linux')).toHaveLength(0);
  });

  it('reflects windows.attack_surface_reduction.credential_hardening.enabled when true', () => {
    set(policy, 'windows.attack_surface_reduction.credential_hardening.enabled', true);
    render();

    expect(renderResult.getByTestId(testSubj.windows.enableDisableSwitch)).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  it('reflects windows.attack_surface_reduction.credential_hardening.enabled when false', () => {
    set(policy, 'windows.attack_surface_reduction.credential_hardening.enabled', false);
    render();

    expect(renderResult.getByTestId(testSubj.windows.enableDisableSwitch)).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });

  it('toggling the switch only changes credential hardening on the windows branch', async () => {
    set(policy, 'windows.attack_surface_reduction.credential_hardening.enabled', true);
    const macBefore = cloneDeep(policy.mac);
    const linuxBefore = cloneDeep(policy.linux);
    const windowsBefore = cloneDeep(policy.windows);
    render();

    await userEvent.click(renderResult.getByTestId(testSubj.windows.enableDisableSwitch));

    const updatedPolicy = getUpdatedPolicy();
    expect(updatedPolicy.windows.attack_surface_reduction.credential_hardening.enabled).toBe(false);
    expect(updatedPolicy.mac).toEqual(macBefore);
    expect(updatedPolicy.linux).toEqual(linuxBefore);

    const windowsRemainder = cloneDeep(updatedPolicy.windows);
    windowsRemainder.attack_surface_reduction.credential_hardening.enabled =
      windowsBefore.attack_surface_reduction.credential_hardening.enabled;
    expect(windowsRemainder).toEqual(windowsBefore);
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
        LOCKED_CARD_ATTACK_SURFACE_REDUCTION
      );
    });
  });

  describe('and displayed in View Mode', () => {
    beforeEach(() => {
      props.mode = 'view';
    });

    it('should render in view mode', () => {
      render();

      expectIsViewOnly(renderResult.getByTestId(testSubj.card));
    });

    it('should show correct value when checked', () => {
      set(policy, 'windows.attack_surface_reduction.credential_hardening.enabled', true);
      render();

      expect(renderResult.getByTestId(testSubj.windows.switchLabel)).toHaveTextContent(
        SWITCH_LABEL
      );
      expect(
        renderResult.getByTestId(testSubj.windows.enableDisableSwitch).getAttribute('aria-checked')
      ).toBe('true');
    });

    it('should show correct value when unchecked', () => {
      set(policy, 'windows.attack_surface_reduction.credential_hardening.enabled', false);
      render();

      expect(renderResult.getByTestId(testSubj.windows.switchLabel)).toHaveTextContent(
        SWITCH_LABEL
      );
      expect(
        renderResult.getByTestId(testSubj.windows.enableDisableSwitch).getAttribute('aria-checked')
      ).toBe('false');
    });
  });
});
