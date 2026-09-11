/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  AppHeader,
  type AppHeaderBack,
  type AppHeaderBadge,
  type AppHeaderMenu,
  type AppHeaderMetadataItems,
  type AppHeaderTab,
} from '@kbn/app-header';
import React, { useMemo } from 'react';
import { type SloAppMenuItemId, useSloAppMenu } from './use_slo_app_menu';

interface SloAppHeaderProps {
  title: string;
  back?: AppHeaderBack;
  primaryActionItem?: AppHeaderMenu['primaryActionItem'];
  extraItems?: AppHeaderMenu['items'];
  hiddenItemIds?: readonly SloAppMenuItemId[];
  tabs?: AppHeaderTab[];
  badges?: AppHeaderBadge[];
  metadata?: AppHeaderMetadataItems;
}

export function SloAppHeader({
  title,
  back,
  primaryActionItem,
  extraItems,
  hiddenItemIds,
  tabs,
  badges,
  metadata,
}: SloAppHeaderProps) {
  const { items, docLink } = useSloAppMenu({ hiddenItemIds });
  const menu = useMemo<AppHeaderMenu>(
    () => ({
      items: [...items, ...(extraItems ?? [])],
      primaryActionItem,
    }),
    [extraItems, items, primaryActionItem]
  );

  return (
    <AppHeader
      title={title}
      back={back}
      menu={menu}
      docLink={docLink}
      tabs={tabs}
      badges={badges}
      metadata={metadata}
      spacing="standard"
    />
  );
}
