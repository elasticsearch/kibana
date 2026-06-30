/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { renderHook } from '@testing-library/react';

import type { NavigationStructure, MenuItem, SecondaryMenuItem } from '../../types';
import type { IconType } from '@elastic/eui';

import { useNavigation } from './use_navigation';

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
  iconType: 'empty' as IconType,
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
  footerItems: [createMenuItem('settings', 'Settings')],
};

describe('useNavigation', () => {
  it('derives active states for primary and secondary items', () => {
    const { result } = renderHook(() =>
      useNavigation(false, navigation, 'logo-id', 'dashboards-overview')
    );

    expect(result.current.actualActiveItemId).toBe('dashboards-overview');
    expect(result.current.visuallyActivePageId).toBe('dashboards');
    expect(result.current.visuallyActiveSubpageId).toBe('dashboards-overview');
    expect(result.current.openerNode?.id).toBe('dashboards');
    expect(result.current.isSidePanelOpen).toBe(true);
  });

  it('marks the logo as active when the active id matches the logo', () => {
    const { result } = renderHook(() => useNavigation(false, navigation, 'logo-id', 'logo-id'));

    expect(result.current.visuallyActivePageId).toBe('logo-id');
    expect(result.current.visuallyActiveSubpageId).toBeUndefined();
    expect(result.current.openerNode).toBeNull();
    expect(result.current.isSidePanelOpen).toBe(false);
  });

  it('treats the navigation as collapsed when requested', () => {
    const { result } = renderHook(() => useNavigation(true, navigation, 'logo-id'));

    expect(result.current.isCollapsed).toBe(true);
    expect(result.current.isSidePanelOpen).toBe(false);
  });
});
