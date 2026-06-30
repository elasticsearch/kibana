/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { MenuItem, NavigationStructure, SecondaryMenuItem } from '../../types';
import { getActiveItems } from './get_initial_active_items';

const createSecondary = (id: string, label: string): SecondaryMenuItem => ({
  id,
  label,
  href: `/${id}`,
});

const createMenuItem = (
  id: string,
  label: string,
  sections: MenuItem['sections'] = []
): MenuItem => ({
  id,
  label,
  href: `/${id}`,
  iconType: 'empty',
  sections,
});

const navigation: NavigationStructure = {
  primaryItems: [
    createMenuItem('home', 'Home'),
    createMenuItem('dashboards', 'Dashboards', [
      {
        id: 'dashboards-section',
        items: [createSecondary('dashboards-overview', 'Overview')],
      },
    ]),
  ],
  overflowItems: [],
  footerItems: [
    createMenuItem('settings', 'Settings', [
      {
        id: 'settings-section',
        items: [createSecondary('settings-general', 'General')],
      },
    ]),
  ],
};

describe('getActiveItems', () => {
  it('returns empty state when no active id is provided', () => {
    expect(getActiveItems(navigation)).toEqual({
      primaryItem: null,
      secondaryItem: null,
      isLogoActive: false,
    });
  });

  it('marks the logo as active when the logo id matches', () => {
    expect(getActiveItems(navigation, 'logo-id', 'logo-id')).toEqual({
      primaryItem: null,
      secondaryItem: null,
      isLogoActive: true,
    });
  });

  it('returns the primary and secondary items when a secondary item in the primary menu matches', () => {
    const result = getActiveItems(navigation, 'dashboards-overview');

    expect(result.primaryItem?.id).toBe('dashboards');
    expect(result.secondaryItem?.id).toBe('dashboards-overview');
    expect(result.isLogoActive).toBe(false);
  });

  it('returns the footer item and secondary item when a footer secondary item matches', () => {
    const result = getActiveItems(navigation, 'settings-general');

    expect(result.primaryItem?.id).toBe('settings');
    expect(result.secondaryItem?.id).toBe('settings-general');
    expect(result.isLogoActive).toBe(false);
  });

  it('returns the primary item when the active id matches a primary menu item', () => {
    const result = getActiveItems(navigation, 'home');

    expect(result.primaryItem?.id).toBe('home');
    expect(result.secondaryItem).toBeNull();
    expect(result.isLogoActive).toBe(false);
  });

  it('returns the footer item when the active id matches a footer item', () => {
    const result = getActiveItems(navigation, 'settings');

    expect(result.primaryItem?.id).toBe('settings');
    expect(result.secondaryItem).toBeNull();
    expect(result.isLogoActive).toBe(false);
  });
});
