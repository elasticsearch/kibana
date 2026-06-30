/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { action } from '@storybook/addon-actions';

import {
  EuiAvatar,
  EuiContextMenu,
  EuiHeaderSectionItemButton,
  EuiIcon,
  EuiPopover,
} from '@elastic/eui';

import { CustomizeNavigationUserMenuLink } from '../components/customize_navigation_user_menu_link';

// ---------------------------------------------------------------------------
// Story wrapper
// ---------------------------------------------------------------------------

/**
 * Renders a realistic account-menu popover (open by default) that mirrors
 * the production layout: "Edit profile" above, "Log out" below, and
 * "Customize navigation" rendered via its dedicated component in the middle.
 */
const AccountMenuWithCustomizeLink = () => {
  const [isOpen, setIsOpen] = useState(true);

  const closePopover = () => setIsOpen(false);

  const triggerButton = (
    <EuiHeaderSectionItemButton
      aria-expanded={isOpen}
      aria-haspopup="true"
      aria-label="Account menu"
      onClick={() => setIsOpen((prev) => !prev)}
      style={{ lineHeight: 'normal' }}
    >
      <EuiAvatar name="Test User" size="s" />
    </EuiHeaderSectionItemButton>
  );

  return (
    <EuiPopover
      button={triggerButton}
      isOpen={isOpen}
      closePopover={closePopover}
      panelPaddingSize="none"
      anchorPosition="downRight"
      aria-label="Account menu"
      ownFocus
      repositionOnScroll
    >
      <EuiContextMenu
        initialPanelId={0}
        panels={[
          {
            id: 0,
            title: 'Test User',
            items: [
              {
                name: 'Edit profile',
                icon: <EuiIcon type="user" size="m" aria-hidden />,
                onClick: () => {
                  action('onClick:editProfile')();
                  closePopover();
                },
                'data-test-subj': 'profileLink',
              },
              {
                renderItem: () => (
                  <CustomizeNavigationUserMenuLink
                    closePopover={() => {
                      action('closePopover')();
                      closePopover();
                    }}
                    onClick={() => action('onClick:customizeNavigation')()}
                  />
                ),
              },
              {
                name: 'Log out',
                icon: <EuiIcon type="logOut" size="m" aria-hidden />,
                onClick: () => {
                  action('onClick:logOut')();
                  closePopover();
                },
                'data-test-subj': 'logoutLink',
              },
            ],
          },
        ]}
      />
    </EuiPopover>
  );
};

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

export default {
  title: 'Navigation Customization/User Menu Link',
  parameters: { layout: 'centered' },
} satisfies Meta;

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export const InAccountMenu: StoryObj = {
  name: 'In account menu',
  render: () => <AccountMenuWithCustomizeLink />,
};
