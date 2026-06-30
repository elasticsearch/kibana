/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen } from '@testing-library/react';
import { APP_HEADER_TEST_SUBJECTS, APP_MENU_TEST_SUBJECTS } from '@kbn/app-header';
import { openAppMenuOverflow } from '@kbn/app-header/test_helpers';

import { buildCasesPermissions, renderWithTestingProviders } from '../../../../common/mock';
import { CasesListAppHeader } from './cases_list_app_header';

jest.mock('../../../../common/navigation/hooks');

describe('CasesListAppHeader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the app header with the Cases title', () => {
    renderWithTestingProviders(<CasesListAppHeader />);

    expect(screen.getByTestId(APP_HEADER_TEST_SUBJECTS.root)).toBeInTheDocument();
    expect(screen.getByTestId(APP_HEADER_TEST_SUBJECTS.title)).toHaveTextContent('Cases');
  });

  it('displays the create new case action when the user has create privileges', () => {
    renderWithTestingProviders(<CasesListAppHeader />, {
      wrapperProps: { permissions: buildCasesPermissions({ create: true }) },
    });

    expect(screen.getByTestId('createNewCaseBtn')).toBeInTheDocument();
  });

  it('does not display the create new case action when the user does not have create privileges', () => {
    renderWithTestingProviders(<CasesListAppHeader />, {
      wrapperProps: { permissions: buildCasesPermissions({ create: false }) },
    });

    expect(screen.queryByTestId('createNewCaseBtn')).not.toBeInTheDocument();
  });

  it('displays the configure button when the user has settings privileges', async () => {
    renderWithTestingProviders(<CasesListAppHeader />, {
      wrapperProps: { permissions: buildCasesPermissions({ settings: true }) },
    });

    await openAppMenuOverflow();

    expect(await screen.findByTestId('configure-case-button')).toBeInTheDocument();
  });

  it('does not display the configure button when the user does not have settings privileges', () => {
    renderWithTestingProviders(<CasesListAppHeader />, {
      wrapperProps: { permissions: buildCasesPermissions({ settings: false }) },
    });

    expect(screen.queryByTestId(APP_MENU_TEST_SUBJECTS.overflowButton)).not.toBeInTheDocument();
    expect(screen.queryByTestId('configure-case-button')).not.toBeInTheDocument();
  });

  it('displays both the create action and configure button with create and settings privileges', async () => {
    renderWithTestingProviders(<CasesListAppHeader />, {
      wrapperProps: { permissions: buildCasesPermissions({ create: true, settings: true }) },
    });

    expect(screen.getByTestId('createNewCaseBtn')).toBeInTheDocument();

    await openAppMenuOverflow();

    expect(await screen.findByTestId('configure-case-button')).toBeInTheDocument();
  });

  it('does not display any menu items when the user has no create or settings privileges', () => {
    renderWithTestingProviders(<CasesListAppHeader />, {
      wrapperProps: { permissions: buildCasesPermissions({ create: false, settings: false }) },
    });

    expect(screen.queryByTestId('createNewCaseBtn')).not.toBeInTheDocument();
    expect(screen.queryByTestId(APP_MENU_TEST_SUBJECTS.overflowButton)).not.toBeInTheDocument();
  });
});
