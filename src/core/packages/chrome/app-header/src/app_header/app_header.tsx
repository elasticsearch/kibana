/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ReactNode } from 'react';
import React, { useLayoutEffect } from 'react';
import type { AppMenuConfig } from '@kbn/core-chrome-app-menu-components';
import { useChromeService } from '@kbn/core-chrome-browser-context';
import type {
  AppHeaderBack,
  AppHeaderBadge,
  AppHeaderMetadataItems,
  AppHeaderPadding,
  AppHeaderTab,
  AppHeaderTitle,
} from '../types';
import { useHasLegacyActionMenu } from './hooks/chrome';
import { AppHeaderShell } from './app_header_shell';
import { AppBadges } from './app_badges';
import { AppTabs } from './app_tabs';
import { TitleArea } from './title_area';
import { TitleActions } from './title_actions';
import { AppMenu } from './app_menu';
import { AppHeaderMetadata } from './app_header_metadata';
import { useResolvedBadges, useShareAction } from './hooks';

export interface AppHeaderViewProps {
  title?: AppHeaderTitle;
  back?: AppHeaderBack | AppHeaderBack[];
  tabs?: AppHeaderTab[];
  badges?: AppHeaderBadge[];
  menu?: AppMenuConfig & { isCollapsed?: boolean };
  favorite?: ReactNode;
  titleAppend?: ReactNode;
  metadata?: AppHeaderMetadataItems;
  sticky?: boolean;
  padding?: AppHeaderPadding;
  docLink?: string;
  showAddIntegrations?: boolean;
  /**
   * Omits the header's bottom border. Used when the content rendered below the header owns the
   * separating line instead (e.g. Discover using UnifiedTabs).
   */
  borderless?: boolean;
}

export const AppHeaderView = React.memo<AppHeaderViewProps>(
  ({
    title,
    back,
    tabs,
    badges,
    menu,
    favorite,
    titleAppend,
    metadata,
    sticky,
    padding,
    borderless,
    docLink,
    showAddIntegrations,
  }) => {
    const hasLegacyActionMenu = useHasLegacyActionMenu();
    const shareAction = useShareAction(menu);
    const resolvedBadges = useResolvedBadges(badges);

    // A second row (tabs or metadata) makes a taller, multi-line header where an `xs` title looks
    // too small, so bump the title to `s` there; single-row headers stay `xs`.
    const isMultiRow = !!tabs?.length || !!metadata?.length;
    const titleSize = isMultiRow ? 's' : 'xs';

    const show =
      title !== undefined ||
      back !== undefined ||
      !!tabs?.length ||
      !!resolvedBadges?.length ||
      !!menu?.items?.length ||
      !!titleAppend ||
      !!shareAction ||
      !!favorite ||
      !!metadata?.length ||
      !!docLink ||
      !!showAddIntegrations ||
      hasLegacyActionMenu;

    if (!show) {
      return null;
    }

    return (
      <AppHeaderShell
        title={<TitleArea title={title} back={back} size={titleSize} />}
        badges={<AppBadges badges={resolvedBadges} />}
        titleActions={<TitleActions shareAction={shareAction} favorite={favorite} />}
        titleAppend={titleAppend}
        trailing={
          <AppMenu menu={menu} docLink={docLink} showAddIntegrations={showAddIntegrations} />
        }
        metadata={metadata?.length ? <AppHeaderMetadata metadata={metadata} /> : undefined}
        tabs={tabs?.length ? <AppTabs tabs={tabs} /> : undefined}
        sticky={sticky}
        padding={padding}
        borderless={borderless}
      />
    );
  }
);

AppHeaderView.displayName = 'AppHeaderView';

export interface AppHeaderProps extends AppHeaderViewProps {
  title: AppHeaderTitle;
}

export const AppHeader = React.memo<AppHeaderProps>((props) => {
  const chrome = useChromeService();
  useLayoutEffect(() => {
    chrome.next.inlineAppHeader.set(true);
    return () => chrome.next.inlineAppHeader.set(false);
  }, [chrome]);

  return <AppHeaderView {...props} />;
});

AppHeader.displayName = 'AppHeader';
