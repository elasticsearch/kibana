/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { spaceTest as baseSpaceTest, createLazyPageObject } from '@kbn/scout-security';
import type { SecurityTestFixtures, SecurityPageObjects, ScoutPage } from '@kbn/scout-security';
import { AttackCasesPage } from './page_objects/attack_cases_page';

interface AttacksAlignmentTestFixtures extends SecurityTestFixtures {
  pageObjects: SecurityPageObjects & { attackCases: AttackCasesPage };
}

export const spaceTest = baseSpaceTest.extend<AttacksAlignmentTestFixtures>({
  pageObjects: async (
    {
      pageObjects,
      page,
    }: {
      pageObjects: AttacksAlignmentTestFixtures['pageObjects'];
      page: ScoutPage;
    },
    use: (pageObjects: AttacksAlignmentTestFixtures['pageObjects']) => Promise<void>
  ) => {
    await use({
      ...pageObjects,
      attackCases: createLazyPageObject(AttackCasesPage, page),
    });
  },
});

export { tags } from '@kbn/scout-security';
