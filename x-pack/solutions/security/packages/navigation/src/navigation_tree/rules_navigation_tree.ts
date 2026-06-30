/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { NodeDefinition } from '@kbn/core-chrome-browser';
import { SecurityPageName, SecurityGroupName } from '../constants';
import { SecurityLinkGroup } from '../link_groups';
import { securityLink } from '../links';
import { i18nStrings } from '../i18n_strings';

export const createRulesNavigationTree = (): Extract<
  NodeDefinition,
  { renderAs: 'panelOpener' }
> => ({
  id: SecurityGroupName.rules,
  title: SecurityLinkGroup[SecurityGroupName.rules].title,
  icon: 'radar',
  renderAs: 'panelOpener',
  children: [
    {
      title: i18nStrings.rules.management.title,
      breadcrumbStatus: 'hidden',
      children: [
        {
          id: SecurityPageName.rules,
          link: securityLink(SecurityPageName.rules),
          children: [
            {
              id: SecurityPageName.rulesManagement,
              link: securityLink(SecurityPageName.rulesManagement),
            },
            {
              id: SecurityPageName.rulesAdd,
              link: securityLink(SecurityPageName.rulesAdd),
            },
            {
              id: SecurityPageName.rulesCreate,
              link: securityLink(SecurityPageName.rulesCreate),
            },
          ],
        },
        {
          id: SecurityPageName.cloudSecurityPostureBenchmarks,
          link: securityLink(SecurityPageName.cloudSecurityPostureBenchmarks),
        },
        {
          id: SecurityPageName.exceptions,
          link: securityLink(SecurityPageName.exceptions),
        },
      ],
    },
    {
      title: i18nStrings.rules.management.discover,
      breadcrumbStatus: 'hidden',
      children: [
        {
          id: SecurityPageName.coverageOverview,
          link: securityLink(SecurityPageName.coverageOverview),
        },
      ],
    },
  ],
});
