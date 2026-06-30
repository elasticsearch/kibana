/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiContextMenuPanelItemDescriptor } from '@elastic/eui';
import {
  EuiContextMenu,
  EuiContextMenuItem,
  EuiHeaderSectionItemButton,
  EuiIcon,
  EuiLoadingSpinner,
  EuiPopover,
} from '@elastic/eui';
import type { FunctionComponent, MouseEvent, ReactNode } from 'react';
import React, { Fragment, useCallback, useState } from 'react';
import useObservable from 'react-use/lib/useObservable';
import type { Observable } from 'rxjs';

import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { UserMenuLink } from '@kbn/security-plugin-types-public';
import { UserAvatar, type UserProfileAvatarData } from '@kbn/user-profile-components';

import { getUserDisplayName, isUserAnonymous } from '../../common/model';
import { useCurrentUser, useUserProfile } from '../components';

type ContextMenuItem = Omit<EuiContextMenuPanelItemDescriptor, 'content' | 'onClick'> & {
  content?: ReactNode | ((args: { closePopover: () => void }) => ReactNode);
  onClick?: (event: MouseEvent<Element>) => void;
};

interface ContextMenuProps {
  items: ContextMenuItem[];
  closePopover: () => void;
}

const ContextMenuContent = ({ items, closePopover }: ContextMenuProps) => {
  return (
    <>
      {items.map((item, i) => {
        if (item.content) {
          return (
            <Fragment key={i}>
              {typeof item.content === 'function' ? item.content({ closePopover }) : item.content}
            </Fragment>
          );
        }
        return (
          <EuiContextMenuItem
            key={i}
            icon={item.icon}
            href={item.href}
            onClick={item.onClick}
            data-test-subj={item['data-test-subj']}
          >
            {item.name}
          </EuiContextMenuItem>
        );
      })}
    </>
  );
};

export interface SecurityNavControlRenderButtonProps {
  isOpen: boolean;
  toggleMenu: () => void;
  avatar: ReactNode;
}

interface SecurityNavControlProps {
  avatarSize?: 's' | 'm' | 'l';
  editProfileUrl: string;
  logoutUrl: string;
  renderButton?: (props: SecurityNavControlRenderButtonProps) => NonNullable<ReactNode>;
  userMenuLinks$: Observable<UserMenuLink[]>;
}

export const SecurityNavControl: FunctionComponent<SecurityNavControlProps> = ({
  editProfileUrl,
  logoutUrl,
  userMenuLinks$,
  renderButton,
  avatarSize = 's',
}) => {
  const userMenuLinks = useObservable(userMenuLinks$, []);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const userProfile = useUserProfile<{ avatar: UserProfileAvatarData }>('avatar,userSettings');
  const currentUser = useCurrentUser(); // User profiles do not exist for anonymous users so need to fetch current user as well

  const displayName = currentUser.value ? getUserDisplayName(currentUser.value) : '';

  const toggleMenu = useCallback(
    () => setIsPopoverOpen((value) => (currentUser.value ? !value : false)),
    [currentUser.value]
  );

  const avatar = userProfile.value ? (
    <UserAvatar
      user={userProfile.value.user}
      avatar={userProfile.value.data.avatar}
      size={avatarSize}
      data-test-subj="userMenuAvatar"
    />
  ) : currentUser.value && userProfile.error ? (
    <UserAvatar user={currentUser.value} size={avatarSize} data-test-subj="userMenuAvatar" />
  ) : (
    <EuiLoadingSpinner size="m" />
  );

  const button = renderButton ? (
    renderButton({ isOpen: isPopoverOpen, toggleMenu, avatar })
  ) : (
    <EuiHeaderSectionItemButton
      aria-expanded={isPopoverOpen}
      aria-haspopup="true"
      aria-label={i18n.translate('xpack.security.navControlComponent.accountMenuAriaLabel', {
        defaultMessage: 'Account menu',
      })}
      onClick={toggleMenu}
      data-test-subj="userMenuButton"
      style={{ lineHeight: 'normal' }}
    >
      {avatar}
    </EuiHeaderSectionItemButton>
  );

  const items: ContextMenuItem[] = [];
  if (userMenuLinks.length) {
    const userMenuLinkMenuItems = userMenuLinks
      .sort(({ order: orderA = Infinity }, { order: orderB = Infinity }) => orderA - orderB)
      .map(({ label, iconType, href, onClick, content }: UserMenuLink) => ({
        name: label,
        icon: <EuiIcon type={iconType} size="m" aria-hidden={true} />,
        href,
        onClick,
        'data-test-subj': `userMenuLink__${label}`,
        content,
      }));
    items.push(...userMenuLinkMenuItems);
  }

  const isAnonymous = currentUser.value ? isUserAnonymous(currentUser.value) : false;
  const hasCustomProfileLinks = userMenuLinks.some(({ setAsProfile }) => setAsProfile === true);

  if (!isAnonymous && !hasCustomProfileLinks) {
    const profileMenuItem: EuiContextMenuPanelItemDescriptor = {
      name: (
        <FormattedMessage
          id="xpack.security.navControlComponent.editProfileLinkText"
          defaultMessage="Edit profile"
        />
      ),
      icon: <EuiIcon type="user" size="m" aria-hidden={true} />,
      href: editProfileUrl,
      onClick: () => {
        setIsPopoverOpen(false);
      },
      'data-test-subj': 'profileLink',
    };

    // Set this as the first link if there is no user-defined profile link
    items.unshift(profileMenuItem);
  }

  items.push({
    name: isAnonymous ? (
      <FormattedMessage
        id="xpack.security.navControlComponent.loginLinkText"
        defaultMessage="Log in"
      />
    ) : (
      <FormattedMessage
        id="xpack.security.navControlComponent.logoutLinkText"
        defaultMessage="Log out"
      />
    ),
    icon: <EuiIcon type="logOut" size="m" aria-hidden={true} />,
    href: logoutUrl,
    'data-test-subj': 'logoutLink',
  });

  return (
    <EuiPopover
      ownFocus
      button={button}
      isOpen={isPopoverOpen}
      anchorPosition="downRight"
      repositionOnScroll
      closePopover={() => setIsPopoverOpen(false)}
      panelPaddingSize="none"
      buffer={0}
      aria-label={i18n.translate('xpack.security.navControlComponent.popoverAriaLabel', {
        defaultMessage: 'Account menu',
      })}
    >
      <EuiContextMenu
        className="chrNavControl__userMenu"
        initialPanelId={0}
        panels={[
          {
            id: 0,
            title: displayName,
            content: (
              <ContextMenuContent items={items} closePopover={() => setIsPopoverOpen(false)} />
            ),
          },
        ]}
        data-test-subj="userMenu"
      />
    </EuiPopover>
  );
};
