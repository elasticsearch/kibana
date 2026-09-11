/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Upgrade compatibility for the per-OS policy form (epic 16894, §10.7 QA item
 * "upgrade testing"). A policy saved by 9.4 must load and display correctly once the
 * per-OS form is active. These are the cases where a regression would be silent: the
 * form would render happily while showing a value the customer never set.
 */

import React from 'react';
import type { RenderResult } from '@testing-library/react';
import type { AppContextTestRender } from '../../../../../../common/mock/endpoint';
import { createAppRootMockRenderer } from '../../../../../../common/mock/endpoint';
import { useLicense as _useLicense } from '../../../../../../common/hooks/use_license';
import { licenseService as licenseServiceMocked } from '../../../../../../common/hooks/__mocks__/use_license';
import { FleetPackagePolicyGenerator } from '../../../../../../../common/endpoint/data_generators/fleet_package_policy_generator';
import type { PolicyConfig } from '../../../../../../../common/endpoint/types';
import { ProtectionModes } from '../../../../../../../common/endpoint/types';
import { getPolicySettingsFormTestSubjects } from '../mocks';
import { useGetProtectionsUnavailableComponent as _useGetProtectionsUnavailableComponent } from '../hooks/use_get_protections_unavailable_component';
import { PerOsRansomwareProtectionCard } from './per_os_ransomware_protection_card';
import { PerOsMalwareProtectionsCard } from './per_os_malware_protections_card';

jest.mock('../../../../../../common/hooks/use_license');
jest.mock('../hooks/use_get_protections_unavailable_component');

const useLicenseMock = _useLicense as jest.Mock;
const useGetProtectionsUnavailableComponentMock =
  _useGetProtectionsUnavailableComponent as jest.Mock;

describe('per-OS form upgrade compatibility with 9.4 policies', () => {
  const testSubjects = getPolicySettingsFormTestSubjects('test');
  let policy: PolicyConfig;
  let mockedContext: AppContextTestRender;
  let renderResult: RenderResult;

  beforeEach(() => {
    mockedContext = createAppRootMockRenderer();
    policy = new FleetPackagePolicyGenerator('seed').generateEndpointPackagePolicy().inputs[0]
      .config.policy.value;
    useLicenseMock.mockReturnValue(licenseServiceMocked);
    useGetProtectionsUnavailableComponentMock.mockReturnValue(null);
  });

  /*
   * §9.5: in 9.4 the only way to set macOS ransomware was the `mac.ransomware.mode`
   * advanced text field. The per-OS form hides that advanced entry, so the value it wrote
   * must surface in the new macOS ransomware row. If the row fell back to the factory
   * default the customer's setting would appear to have been silently discarded — and
   * macOS ransomware defaults to `off` while Windows defaults to `prevent`, so the
   * default is exactly the dangerous value to show here.
   */
  it('shows a macOS ransomware mode set via the 9.4 advanced field in the macOS row', () => {
    policy.mac.ransomware.mode = ProtectionModes.prevent;
    policy.windows.ransomware.mode = ProtectionModes.off;

    renderResult = mockedContext.render(
      <PerOsRansomwareProtectionCard
        policy={policy}
        onChange={jest.fn()}
        mode="edit"
        data-test-subj={testSubjects.perOsRansomware.card}
      />
    );

    expect(renderResult.getByTestId(testSubjects.perOsRansomware.mac.modeSelect)).toHaveTextContent(
      /^Detect & prevent$/
    );
    expect(
      renderResult.getByTestId(testSubjects.perOsRansomware.windows.modeSelect)
    ).toHaveTextContent(/^Disable$/);
  });

  /*
   * A 9.4 policy was written by a form that fanned one value across every OS, so every
   * upgraded policy arrives uniform. Each row must display that shared value rather than
   * a per-OS default.
   */
  it('renders every OS row from a uniform 9.4-shaped policy', () => {
    policy.windows.malware.mode = ProtectionModes.detect;
    policy.mac.malware.mode = ProtectionModes.detect;
    policy.linux.malware.mode = ProtectionModes.detect;

    renderResult = mockedContext.render(
      <PerOsMalwareProtectionsCard
        policy={policy}
        onChange={jest.fn()}
        mode="edit"
        data-test-subj={testSubjects.perOsMalware.card}
      />
    );

    expect(
      renderResult.getByTestId(testSubjects.perOsMalware.windows.modeSelect)
    ).toHaveTextContent(/^Detect$/);
    expect(renderResult.getByTestId(testSubjects.perOsMalware.mac.modeSelect)).toHaveTextContent(
      /^Detect$/
    );
    expect(renderResult.getByTestId(testSubjects.perOsMalware.linux.modeSelect)).toHaveTextContent(
      /^Detect$/
    );
  });

  /*
   * §8.4: clearing the 9.4 advanced text field could delete `mac.ransomware.mode` while
   * `supported` kept the parent object alive. Two legacy guards restore the missing mode
   * to `off` on read, but the form must not throw if it ever sees the malformed shape
   * directly.
   */
  it('does not throw on a 9.4 policy whose macOS ransomware mode was cleared', () => {
    // @ts-expect-error reproducing the malformed 9.4 shape the legacy guards exist for
    delete policy.mac.ransomware.mode;

    expect(() =>
      mockedContext.render(
        <PerOsRansomwareProtectionCard
          policy={policy}
          onChange={jest.fn()}
          mode="edit"
          data-test-subj={testSubjects.perOsRansomware.card}
        />
      )
    ).not.toThrow();
  });
});
