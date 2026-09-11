/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import { AppHeader } from '@kbn/app-header';
import type { AppHeaderMenu } from '@kbn/app-header';
import { SecurityPageName } from '../../app/types';
import { SpyRoute } from '../../common/utils/route/spy_routes';
import { useGetSecuritySolutionUrl } from '../../common/components/link_to';

const PAGE_TITLE = i18n.translate('xpack.securitySolution.entityAnalytics.home.pageTitle', {
  defaultMessage: 'Entity analytics',
});

const MANAGEMENT_LABEL = i18n.translate(
  'xpack.securitySolution.entityAnalytics.home.managementLink',
  { defaultMessage: 'Management' }
);

export const EntityAnalyticsNewHomePage: React.FC = () => {
  const getSecuritySolutionUrl = useGetSecuritySolutionUrl();
  const menu = useMemo<AppHeaderMenu>(
    () => ({
      items: [
        {
          id: 'entityAnalyticsManagement',
          label: MANAGEMENT_LABEL,
          iconType: 'gear' as const,
          href: getSecuritySolutionUrl({ deepLinkId: SecurityPageName.entityAnalyticsManagement }),
        },
      ],
    }),
    [getSecuritySolutionUrl]
  );
  return (
    <>
      <AppHeader title={PAGE_TITLE} menu={menu} />
      <SpyRoute pageName={SecurityPageName.entityAnalyticsHome} />
    </>
  );
};
