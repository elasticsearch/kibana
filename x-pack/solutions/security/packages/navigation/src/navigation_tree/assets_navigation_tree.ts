/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreStart } from '@kbn/core/public';
import type { NodeDefinition } from '@kbn/core-chrome-browser';
import { SecurityGroupName, SecurityPageName } from '../constants';
import { SecurityLinkGroup } from '../link_groups';
import { securityLink } from '../links';
import { i18nStrings } from '../i18n_strings';

// All artifact tab paths under the security management section.
// Used to keep the Artifacts nav node active regardless of which tab is open,
// since the deep link only points to the first allowed tab path.
const SECURITY_MANAGEMENT_PATH = '/app/security/administration';
const ARTIFACT_TAB_PATHS = [
  `${SECURITY_MANAGEMENT_PATH}/trusted_apps`,
  `${SECURITY_MANAGEMENT_PATH}/trusted_devices`,
  `${SECURITY_MANAGEMENT_PATH}/event_filters`,
  `${SECURITY_MANAGEMENT_PATH}/host_isolation_exceptions`,
  `${SECURITY_MANAGEMENT_PATH}/blocklist`,
  `${SECURITY_MANAGEMENT_PATH}/endpoint_exceptions`,
] as const;

export const createAssetsNavigationTree = (_core: CoreStart) => {
  return {
    id: SecurityGroupName.assets,
    icon: 'display',
    title: SecurityLinkGroup[SecurityGroupName.assets].title,
    renderAs: 'panelOpener',
    children: [
      {
        link: 'fleet',
        title: i18nStrings.assets.fleet.title,
        children: [
          {
            link: 'fleet:agents',
          },
          {
            link: 'fleet:policies',
            title: i18nStrings.assets.fleet.policies,
          },
          {
            link: 'fleet:enrollment_tokens',
          },
          {
            link: 'fleet:uninstall_tokens',
          },
          {
            link: 'fleet:data_streams',
          },
          {
            link: 'fleet:settings',
          },
        ],
      },
      {
        id: SecurityPageName.endpoints,
        title: i18nStrings.assets.endpoints.title,
        children: [
          {
            id: SecurityPageName.endpoints,
            link: securityLink(SecurityPageName.endpoints),
            breadcrumbStatus: 'hidden',
          },
          {
            id: SecurityPageName.policies,
            link: securityLink(SecurityPageName.policies),
          },
          {
            id: SecurityPageName.artifacts,
            title: i18nStrings.assets.artifacts.title,
            link: securityLink(SecurityPageName.artifacts),
            getIsActive: ({ pathNameSerialized, prepend }) =>
              ARTIFACT_TAB_PATHS.some((path) => pathNameSerialized.startsWith(prepend(path))),
          },
          {
            id: SecurityPageName.responseActionsHistory,
            link: securityLink(SecurityPageName.responseActionsHistory),
          },
          {
            id: SecurityPageName.scriptLibrary,
            link: securityLink(SecurityPageName.scriptLibrary),
            badgeType: 'new',
          },
        ],
      },
    ],
  } as const satisfies NodeDefinition;
};
