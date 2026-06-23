/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen } from '@testing-library/react';

import { buildCasesPermissions, renderWithTestingProviders } from '../../../../common/mock';
import { CasesListAppHeader } from './cases_list_app_header';

jest.mock('../../../../common/navigation/hooks');

jest.mock('@kbn/app-header', () => ({
  AppHeader: ({
    title,
    menu,
  }: {
    title: string;
    menu: {
      items: Array<{ testId: string }>;
      primaryActionItem?: { testId: string };
    };
  }) => (
    <div data-test-subj="app-header">
      <span data-test-subj="app-header-title">{title}</span>
      <div data-test-subj="app-header-menu">
        {menu?.items?.map((item) => (
          <span key={item.testId} data-test-subj={item.testId} />
        ))}
        {menu?.primaryActionItem && <span data-test-subj={menu.primaryActionItem.testId} />}
      </div>
    </div>
  ),
}));

describe('CasesListAppHeader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the app header with the Cases title and analytics test IDs', () => {
    renderWithTestingProviders(<CasesListAppHeader />);

    expect(screen.getByTestId('app-header')).toBeInTheDocument();
    expect(screen.getByTestId('app-header-title')).toHaveTextContent('Cases');
  });

  it('displays the create new case menu item when the user has create privileges', () => {
    renderWithTestingProviders(<CasesListAppHeader />, {
      wrapperProps: { permissions: buildCasesPermissions({ create: true }) },
    });

    expect(screen.getByTestId('createNewCaseBtn')).toBeInTheDocument();
  });

  it('does not display the create new case menu item when the user does not have create privileges', () => {
    renderWithTestingProviders(<CasesListAppHeader />, {
      wrapperProps: { permissions: buildCasesPermissions({ create: false }) },
    });

    expect(screen.queryByTestId('createNewCaseBtn')).not.toBeInTheDocument();
  });

  it('displays the configure button when the user has settings privileges', () => {
    renderWithTestingProviders(<CasesListAppHeader />, {
      wrapperProps: { permissions: buildCasesPermissions({ settings: true }) },
    });

    expect(screen.getByTestId('configure-case-button')).toBeInTheDocument();
  });

  it('does not display the configure button when the user does not have settings privileges', () => {
    renderWithTestingProviders(<CasesListAppHeader />, {
      wrapperProps: { permissions: buildCasesPermissions({ settings: false }) },
    });

    expect(screen.queryByTestId('configure-case-button')).not.toBeInTheDocument();
  });

  it('displays both menu items when the user has create and settings privileges', () => {
    renderWithTestingProviders(<CasesListAppHeader />, {
      wrapperProps: { permissions: buildCasesPermissions({ create: true, settings: true }) },
    });

    expect(screen.getByTestId('createNewCaseBtn')).toBeInTheDocument();
    expect(screen.getByTestId('configure-case-button')).toBeInTheDocument();
  });

  it('does not display any menu items when the user has no create or settings privileges', () => {
    renderWithTestingProviders(<CasesListAppHeader />, {
      wrapperProps: { permissions: buildCasesPermissions({ create: false, settings: false }) },
    });

    expect(screen.queryByTestId('createNewCaseBtn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('configure-case-button')).not.toBeInTheDocument();
  });
});
