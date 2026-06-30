/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import { useService } from '@kbn/core-di-browser';
import type { AlertingV2Feature } from '../../common/feature_privileges';
import type { UserCapabilities } from '../services/user_capabilities';
import { RequireAlertingPrivilege } from './require_alerting_privilege';
import type { RequireAlertingPrivilegeProps } from './require_alerting_privilege';

jest.mock('@kbn/core-di-browser');

const mockUseService = useService as jest.MockedFunction<typeof useService>;
const mockCanRead = jest.fn<boolean, [AlertingV2Feature]>();

const mockReadableFeatures = (readable: (feature: AlertingV2Feature) => boolean) => {
  mockCanRead.mockImplementation(readable);
  mockUseService.mockReturnValue({ canRead: mockCanRead } as unknown as UserCapabilities);
};

const renderGate = (features: RequireAlertingPrivilegeProps['features'] = ['rules']) =>
  render(
    <I18nProvider>
      <RequireAlertingPrivilege features={features} pageName="Rules">
        <div data-test-subj="gatedContent">Gated content</div>
      </RequireAlertingPrivilege>
    </I18nProvider>
  );

describe('RequireAlertingPrivilege', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders children when the user can read every required feature', () => {
    mockReadableFeatures(() => true);
    renderGate();

    expect(screen.getByTestId('gatedContent')).toBeInTheDocument();
    expect(screen.queryByTestId('alertingRequiredPrivilegesPrompt')).not.toBeInTheDocument();
  });

  it('renders the interstitial listing the required privileges when access is denied', () => {
    mockReadableFeatures(() => false);
    renderGate(['rules']);

    expect(screen.queryByTestId('gatedContent')).not.toBeInTheDocument();
    expect(screen.getByTestId('alertingRequiredPrivilegesPrompt')).toBeInTheDocument();
    expect(screen.getByText('Privileges required')).toBeInTheDocument();
    expect(screen.getByTestId('alertingRequiredPrivilege-alerting_v2_rules')).toBeInTheDocument();
  });

  it('checks read access for the requested feature', () => {
    mockReadableFeatures(() => true);
    renderGate(['alerts']);

    expect(mockCanRead).toHaveBeenCalledWith('alerts');
  });

  it('denies access when any feature in the set is not readable (AND semantics)', () => {
    mockReadableFeatures((feature) => feature === 'alerts');
    renderGate(['alerts', 'rules']);

    expect(screen.queryByTestId('gatedContent')).not.toBeInTheDocument();
    expect(screen.getByTestId('alertingRequiredPrivilegesPrompt')).toBeInTheDocument();
  });
});
