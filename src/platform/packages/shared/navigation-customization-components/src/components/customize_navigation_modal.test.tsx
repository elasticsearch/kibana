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
import { CustomizeNavigationModal } from './customize_navigation_modal';
import type { NavigationItemInfo } from '../types';

describe('CustomizeNavigationModal', () => {
  const items: NavigationItemInfo[] = [
    { id: 'home', title: 'Home', hidden: false, icon: 'home' },
    { id: 'dashboards', title: 'Dashboards', hidden: false, icon: 'dashboard' },
    { id: 'discover', title: 'Discover', hidden: true, icon: 'discoverApp' },
  ];

  const defaultProps = {
    items,
    onSave: jest.fn(),
    onReset: jest.fn(() => Promise.resolve(items)),
    onChange: jest.fn(),
    onClose: jest.fn(),
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should render the modal', () => {
    renderWithI18n(<CustomizeNavigationModal {...defaultProps} />);
    expect(screen.getByTestId('customizeNavigationModal')).toBeInTheDocument();
  });

  it('should render the modal title', () => {
    renderWithI18n(<CustomizeNavigationModal {...defaultProps} />);
    expect(screen.getByText('Customize navigation')).toBeInTheDocument();
  });

  it('should render visible items', () => {
    renderWithI18n(<CustomizeNavigationModal {...defaultProps} />);
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Dashboards')).toBeInTheDocument();
  });

  it('should render hidden items section', () => {
    renderWithI18n(<CustomizeNavigationModal {...defaultProps} />);
    expect(screen.getByText('Hide under More')).toBeInTheDocument();
    expect(screen.getByText('Discover')).toBeInTheDocument();
  });

  it('should render an empty drop zone when there are no hidden items', () => {
    const allVisible = items.map((item) => ({ ...item, hidden: false }));
    renderWithI18n(<CustomizeNavigationModal {...defaultProps} items={allVisible} />);
    expect(screen.getByText('Hide under More')).toBeInTheDocument();
    expect(screen.getByTestId('customizeNavigationEmptyDropPlaceholder')).toBeInTheDocument();
  });

  it('should render the Apply button', () => {
    renderWithI18n(<CustomizeNavigationModal {...defaultProps} />);
    expect(screen.getByTestId('customizeNavigationSaveButton')).toBeInTheDocument();
  });

  it('should render the Reset to default button', () => {
    renderWithI18n(<CustomizeNavigationModal {...defaultProps} />);
    expect(screen.getByText('Reset to default')).toBeInTheDocument();
  });

  it('should show the space description', () => {
    renderWithI18n(<CustomizeNavigationModal {...defaultProps} />);
    expect(
      screen.getByText('Reorder or hide apps in this space without affecting other users.')
    ).toBeInTheDocument();
  });

  it('should call onClose when the modal is closed', async () => {
    renderWithI18n(<CustomizeNavigationModal {...defaultProps} />);
    const closeButton = screen.getByRole('button', { name: /closes this modal/i });
    await userEvent.click(closeButton);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });
});
