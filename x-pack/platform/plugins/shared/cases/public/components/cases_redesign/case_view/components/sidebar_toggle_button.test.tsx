/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithTestingProviders } from '../../../../common/mock';
import { SidebarToggleButton } from './sidebar_toggle_button';
import { SidebarProvider } from './sidebar_context';

jest.mock('../../../../common/lib/kibana');

const renderButton = () => {
  return renderWithTestingProviders(
    <SidebarProvider>
      <SidebarToggleButton />
    </SidebarProvider>
  );
};

describe('SidebarToggleButton', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the toggle button', () => {
    renderButton();
    expect(screen.getByTestId('case-view-sidebar-toggle')).toBeInTheDocument();
  });

  it('has "Hide fields" aria-label when sidebar is open (default)', () => {
    renderButton();
    expect(screen.getByTestId('case-view-sidebar-toggle')).toHaveAttribute(
      'aria-label',
      'Hide fields'
    );
  });

  it('toggles aria-label to "Show fields" after clicking', async () => {
    renderButton();
    await userEvent.click(screen.getByTestId('case-view-sidebar-toggle'));
    expect(screen.getByTestId('case-view-sidebar-toggle')).toHaveAttribute(
      'aria-label',
      'Show fields'
    );
  });
});
