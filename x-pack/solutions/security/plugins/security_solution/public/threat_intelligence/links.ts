/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SecurityPageName } from '../../common/constants';
import { SECURITY_FEATURE_ID } from '../../common/constants';
import type { LinkItem } from '../common/links';
import { getSecuritySolutionLink } from './utils/security_solution_links';

/**
 * Adds the Threat Intelligence entry to Kibana global sidenav as well as the
 * Security sidenav. The top-level entry retains the indicators page name
 * (`SecurityPageName.threatIntelligence`) so existing role bindings keyed on
 * `${SECURITY_FEATURE_ID}.threat-intelligence` continue to gate the whole
 * area without migration.
 *
 * The Intelligence Hub dashboard — folded in from the standalone
 * threat-intelligence plugin — is registered as a child deep link so
 * it surfaces as `Security > Threat Intelligence > Intelligence Hub` in the
 * sub-nav. Sharing the parent's capability list intentionally:
 * Phase 4 of the migration plan will split capabilities into sub-feature
 * privileges; until then the existing one continues to gate both children.
 */
export const indicatorsLinks: LinkItem = {
  ...getSecuritySolutionLink<SecurityPageName>('indicators'),
  globalNavPosition: 10,
  capabilities: [`${SECURITY_FEATURE_ID}.threat-intelligence`],
  links: [
    {
      ...getSecuritySolutionLink<SecurityPageName>('intelligenceHub'),
      capabilities: [`${SECURITY_FEATURE_ID}.threat-intelligence`],
      links: [
        {
          ...getSecuritySolutionLink<SecurityPageName>('correlationReport'),
          capabilities: [`${SECURITY_FEATURE_ID}.threat-intelligence`],
        },
      ],
    },
  ],
};
