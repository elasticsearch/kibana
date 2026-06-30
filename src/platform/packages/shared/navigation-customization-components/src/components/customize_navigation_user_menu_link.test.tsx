/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { renderWithI18n } from '@kbn/test-jest-helpers';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomizeNavigationUserMenuLink } from './customize_navigation_user_menu_link';

describe('CustomizeNavigationUserMenuLink', () => {
  const closePopover = jest.fn();
  const onClick = jest.fn();

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should render the menu link', () => {
    renderWithI18n(
      <CustomizeNavigationUserMenuLink closePopover={closePopover} onClick={onClick} />
    );
    expect(screen.getByText('Customize navigation')).toBeInTheDocument();
  });

  it('should render the "New" badge', () => {
    renderWithI18n(
      <CustomizeNavigationUserMenuLink closePopover={closePopover} onClick={onClick} />
    );
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('should render test subject', () => {
    renderWithI18n(
      <CustomizeNavigationUserMenuLink closePopover={closePopover} onClick={onClick} />
    );
    expect(screen.getByTestId('customizeNavigationUserMenuLink')).toBeInTheDocument();
  });

  it('should call closePopover and onClick when clicked', async () => {
    renderWithI18n(
      <CustomizeNavigationUserMenuLink closePopover={closePopover} onClick={onClick} />
    );
    await userEvent.click(screen.getByTestId('customizeNavigationUserMenuLink'));
    expect(closePopover).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
