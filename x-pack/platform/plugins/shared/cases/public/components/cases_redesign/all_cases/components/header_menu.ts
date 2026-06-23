/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AppHeaderMenu } from '@kbn/app-header';
import type { CasesPermissions } from '../../../../../common';
import * as i18n from '../../../../common/translations';

interface GetListMenuArgs {
  permissions: CasesPermissions;
  navigateToCreateCase: () => void;
  navigateToConfigureCases: () => void;
}

export const getListMenu = ({
  permissions,
  navigateToCreateCase,
  navigateToConfigureCases,
}: GetListMenuArgs): AppHeaderMenu => {
  const items = [
    ...(permissions.settings
      ? [
          {
            id: 'configureCases',
            label: i18n.CONFIGURE_CASES_BUTTON,
            iconType: 'gear' as const,
            run: () => navigateToConfigureCases(),
            testId: 'configure-case-button',
            order: 100,
          },
        ]
      : []),
  ];

  return {
    items,
    ...(permissions.create
      ? {
          primaryActionItem: {
            id: 'createCase',
            label: i18n.CREATE_CASE_TITLE,
            iconType: 'plus' as const,
            run: () => navigateToCreateCase(),
            testId: 'createNewCaseBtn',
          },
        }
      : {}),
  };
};
