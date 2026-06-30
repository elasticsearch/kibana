/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import type { MenuItem, SideNavLogo } from '../../types';

export const LOGO: SideNavLogo = {
  id: 'home',
  href: '/',
  label: 'Solution',
  iconType: 'logoElastic',
};

export const PRIMARY_MENU_ITEMS: MenuItem[] = [
  {
    id: 'dashboards',
    label: 'Dashboards',
    href: '/dashboards',
    iconType: 'dashboardApp',
  },
  {
    id: 'discover',
    label: 'Discover',
    href: '/discover',
    iconType: 'discoverApp',
  },
  {
    id: 'apps_overview',
    label: 'Apps',
    href: '/apps_overview',
    iconType: 'apps',
    sections: [
      {
        id: 'synthetics',
        label: 'Synthetics',
        items: [
          {
            id: 'apps_overview',
            label: 'Overview',
            href: '/apps_overview',
          },
          {
            id: 'tls_certificates',
            label: 'TLS certificates',
            href: '/tls_certificates',
          },
        ],
      },
    ],
  },
];

export const PRIMARY_MENU_FOOTER_ITEMS: MenuItem[] = [
  {
    id: 'getting_started',
    label: 'Getting started',
    iconType: 'rocket',
    href: '/getting-started',
  },
  {
    id: 'developer_tools',
    label: 'Developer tools',
    iconType: 'code',
    href: '/developer-tools',
  },
  {
    id: 'integrations',
    label: 'Settings',
    href: '/integrations',
    iconType: 'gear',
    sections: [
      {
        id: 'section_one',
        label: 'Section',
        items: [
          {
            id: 'integrations',
            label: 'Integrations',
            href: '/integrations',
          },
          {
            id: 'advanced_settings',
            label: 'Advanced settings',
            href: '/advanced_settings',
          },
        ],
      },
    ],
  },
  {
    id: 'fourth_item',
    label: 'Fourth item',
    iconType: 'rocket',
    href: '/fourth-item',
  },
  {
    id: 'fifth_item',
    label: 'Fifth item',
    iconType: 'code',
    href: '/fourth-item',
  },
];

export const basicMock = {
  logo: LOGO,
  navItems: {
    primaryItems: PRIMARY_MENU_ITEMS,
    overflowItems: [],
    footerItems: PRIMARY_MENU_FOOTER_ITEMS,
  },
};
