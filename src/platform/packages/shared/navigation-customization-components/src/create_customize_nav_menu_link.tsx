/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import { CustomizeNavigationUserMenuLink } from './components/customize_navigation_user_menu_link';

/**
 * Returns the user-menu link descriptor for the "Customize navigation" entry.
 * The caller passes this to `security.navControlService.addUserMenuLinks`,
 * keeping `SecurityPluginStart` out of this package's imports.
 *
 * The JSX `content` render prop is handled here (not in the navigation plugin)
 * so that all navigation-customization UI stays in one place.
 */
export const createCustomizeNavMenuLink = (openModal: () => void) => ({
  iconType: 'controls' as const,
  label: i18n.translate('navigationCustomizationComponents.userMenuLinkLabel', {
    defaultMessage: 'Customize navigation',
  }),
  href: '',
  order: 500,
  content: ({ closePopover }: { closePopover: () => void }): React.ReactNode => (
    <CustomizeNavigationUserMenuLink closePopover={closePopover} onClick={openModal} />
  ),
});
