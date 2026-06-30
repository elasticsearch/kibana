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
import { HiddenItem } from './hidden_item';
import type { NavigationItemInfo } from '../types';

describe('HiddenItem', () => {
  const item: NavigationItemInfo = {
    id: 'dashboards',
    title: 'Dashboards',
    hidden: true,
    icon: 'dashboard',
  };

  const toggleItemVisibility = jest.fn();

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should render the item title', () => {
    renderWithI18n(<HiddenItem item={item} toggleItemVisibility={toggleItemVisibility} />);
    expect(screen.getByText('Dashboards')).toBeInTheDocument();
  });

  it('should render the switch as unchecked when item is hidden', () => {
    renderWithI18n(<HiddenItem item={item} toggleItemVisibility={toggleItemVisibility} />);
    const switchEl = screen.getByRole('switch');
    expect(switchEl).not.toBeChecked();
  });

  it('should render the switch as checked when item is not hidden', () => {
    const visibleItem = { ...item, hidden: false };
    renderWithI18n(<HiddenItem item={visibleItem} toggleItemVisibility={toggleItemVisibility} />);
    const switchEl = screen.getByRole('switch');
    expect(switchEl).toBeChecked();
  });

  it('should call toggleItemVisibility when the switch is toggled', async () => {
    renderWithI18n(<HiddenItem item={item} toggleItemVisibility={toggleItemVisibility} />);
    const switchEl = screen.getByRole('switch');
    await userEvent.click(switchEl);
    expect(toggleItemVisibility).toHaveBeenCalledWith('dashboards');
  });

  it('should render the item icon when provided', () => {
    const { container } = renderWithI18n(
      <HiddenItem item={item} toggleItemVisibility={toggleItemVisibility} />
    );
    expect(container.querySelector('[data-euiicon-type="dashboard"]')).toBeInTheDocument();
  });
});
