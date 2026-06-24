/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ONBOARDING_PATH, SIEM_MIGRATIONS_MANAGE_PATH } from '../../../common/constants';
import { OnboardingTopicId } from '../constants';
import { OnboardingRouter } from './onboarding_router';
import { useSyncUrlDetails } from './hooks/use_url_detail';
import { useOnboardingContext } from './onboarding_context';

const mockRedirect = jest.fn((_props: unknown) => null);
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    Redirect: (props: unknown) => mockRedirect(props),
  };
});

jest.mock('./hooks/use_url_detail', () => ({
  ...jest.requireActual('./hooks/use_url_detail'),
  useSyncUrlDetails: jest.fn(),
}));

jest.mock('./onboarding_context', () => ({
  ...jest.requireActual('./onboarding_context'),
  useOnboardingContext: jest.fn(),
}));

jest.mock('./onboarding_header', () => ({
  OnboardingHeader: () => <div data-test-subj="onboardingHeader" />,
}));

jest.mock('./onboarding_body', () => ({
  OnboardingBody: () => <div data-test-subj="onboardingBody" />,
}));

describe('OnboardingRouter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useSyncUrlDetails as jest.Mock).mockReturnValue({ isLoading: false });
    (useOnboardingContext as jest.Mock).mockReturnValue({
      config: new Map([
        [OnboardingTopicId.siemMigrations, { id: OnboardingTopicId.siemMigrations }],
      ]),
    });
  });

  it('redirects the legacy SIEM migrations onboarding topic to the migrations manage page', () => {
    render(
      <MemoryRouter initialEntries={[`${ONBOARDING_PATH}/siem_migrations#migrate_rules`]}>
        <OnboardingRouter />
      </MemoryRouter>
    );

    expect(mockRedirect).toHaveBeenCalledWith({
      to: { pathname: SIEM_MIGRATIONS_MANAGE_PATH, hash: '#migrate_rules' },
    });
  });

  it('renders Get started for the base onboarding path', () => {
    render(
      <MemoryRouter initialEntries={[ONBOARDING_PATH]}>
        <OnboardingRouter />
      </MemoryRouter>
    );

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(screen.getByTestId('onboardingHeader')).toBeInTheDocument();
    expect(screen.getByTestId('onboardingBody')).toBeInTheDocument();
  });
});
