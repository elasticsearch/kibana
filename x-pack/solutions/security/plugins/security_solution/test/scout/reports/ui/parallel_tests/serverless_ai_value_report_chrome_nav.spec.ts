/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { spaceTest, tags } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/ui';

spaceTest.describe(
  'Serverless Security - AI Value Report item hidden in project chrome on essentials tier',
  { tag: [...tags.serverless.security.essentials] },
  () => {
    spaceTest(
      'hides AI Value Report in chrome nav on essentials tier',
      async ({ browserAuth, pageObjects }) => {
        await browserAuth.loginAsPlatformEngineer();
        await pageObjects.serverlessProjectChromePage.navigateToSecuritySolutionHomeForChromeNav();
        await pageObjects.serverlessProjectChromePage.openChromeNavMoreMenuIfPresent();
        await expect(
          pageObjects.serverlessProjectChromePage.getAiValueReportNavItemInProjectChrome()
        ).toBeHidden();
      }
    );
  }
);
