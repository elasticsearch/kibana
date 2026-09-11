/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AppHeaderBadge, AppHeaderTab } from '@kbn/app-header';
import { AppHeader } from '@kbn/app-header';
import React from 'react';
import { useParentBreadcrumbResolver } from '../../../hooks/use_parent_breadcrumb_resolver';
import { toMetricsAppHeaderBack } from './to_metrics_app_header_back';
import { useMetricsAppHeaderMenu } from './use_metrics_app_header_menu';

export function MetricsDetailAppHeader({
  title,
  tabs,
  badges,
}: {
  title: string;
  tabs?: AppHeaderTab[];
  badges?: AppHeaderBadge[];
}): React.ReactElement {
  const { menu, flyouts } = useMetricsAppHeaderMenu();
  const parentBreadcrumbResolver = useParentBreadcrumbResolver();
  const back = toMetricsAppHeaderBack(parentBreadcrumbResolver.getBreadcrumbOptions());

  return (
    <>
      <AppHeader
        title={title}
        back={back}
        tabs={tabs}
        badges={badges}
        menu={menu}
        spacing="standard"
      />
      {flyouts}
    </>
  );
}
