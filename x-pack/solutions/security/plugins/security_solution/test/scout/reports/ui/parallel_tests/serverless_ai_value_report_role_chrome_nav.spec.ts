/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { spaceTest, tags } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/ui';

spaceTest.describe(
  'Serverless Security - AI Value Report item hidden in project chrome for non-socManager role',
  { tag: [...tags.serverless.security.complete] },
  () => {
    spaceTest(
      'hides AI Value Report in chrome nav for a non-socManager role',
      async ({ browserAuth, pageObjects }) => {
        await browserAuth.loginAsT1Analyst();
        await pageObjects.serverlessProjectChromePage.navigateToSecuritySolutionHomeForChromeNav();
        await pageObjects.serverlessProjectChromePage.openChromeNavMoreMenuIfPresent();
        await expect(
          pageObjects.serverlessProjectChromePage.getAiValueReportNavItemInProjectChrome()
        ).toBeHidden();
      }
    );
  }
);
