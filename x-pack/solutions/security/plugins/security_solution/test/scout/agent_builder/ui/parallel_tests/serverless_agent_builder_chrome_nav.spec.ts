/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { AIChatExperience } from '@kbn/ai-assistant-common';
import { AI_CHAT_EXPERIENCE_TYPE } from '@kbn/management-settings-ids';
import { spaceTest, tags } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/ui';

spaceTest.describe(
  'Serverless Security - Agent Builder item in project chrome vs chat experience',
  { tag: [...tags.serverless.security.complete] },
  () => {
    // Platform engineer can open securitySolutionUI; scoped AI-only roles omit SIEM app (Application Not Found).
    spaceTest.beforeEach(async ({ scoutSpace }) => {
      await scoutSpace.uiSettings.unset(AI_CHAT_EXPERIENCE_TYPE);
    });

    spaceTest.afterAll(async ({ scoutSpace }) => {
      await scoutSpace.uiSettings.unset(AI_CHAT_EXPERIENCE_TYPE);
    });

    spaceTest(
      'shows Agent Builder in chrome nav when preferred chat experience has no saved value',
      async ({ browserAuth, pageObjects }) => {
        await browserAuth.loginAsPlatformEngineer();
        await pageObjects.serverlessProjectChromePage.navigateToSecuritySolutionHomeForChromeNav();

        await spaceTest.step(
          'open More overflow if needed, then verify Agent Builder chrome item is visible',
          async () => {
            await pageObjects.serverlessProjectChromePage.openChromeNavMoreMenuIfAgentBuilderLinkNotVisible();
            const agentNavItem =
              pageObjects.serverlessProjectChromePage.getAgentBuilderNavItemInProjectChrome();
            await expect(agentNavItem).toBeVisible();
          }
        );
      }
    );

    spaceTest(
      'hides Agent Builder in chrome nav when chat experience is Classic',
      async ({ browserAuth, pageObjects, scoutSpace }) => {
        await scoutSpace.uiSettings.set({
          [AI_CHAT_EXPERIENCE_TYPE]: AIChatExperience.Classic,
        });
        await browserAuth.loginAsPlatformEngineer();
        await pageObjects.serverlessProjectChromePage.navigateToSecuritySolutionHomeForChromeNav();

        await spaceTest.step(
          'open More overflow when present so overflow items can be asserted',
          async () => {
            await pageObjects.serverlessProjectChromePage.openChromeNavMoreMenuIfPresent();
            const agentNavItem =
              pageObjects.serverlessProjectChromePage.getAgentBuilderNavItemInProjectChrome();
            await expect(agentNavItem).toBeHidden();
          }
        );
      }
    );
  }
);
