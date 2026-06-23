/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Original test (remove during Scout migration): src/platform/test/functional/apps/discover/context_awareness/extensions/_get_recommended_fields.ts

import kbnRison from '@kbn/rison';
import type { FtrProviderContext } from '../../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const { common, discover, header, svlCommonPage } = getPageObjects([
    'common',
    'discover',
    'header',
    'svlCommonPage',
  ]);
  const dataViews = getService('dataViews');
  const testSubjects = getService('testSubjects');

  describe('extension getRecommendedFields', () => {
    before(async () => {
      await svlCommonPage.loginAsAdmin();
    });

    describe('ES|QL mode', () => {
      it('should show recommended fields section for matching profile', async () => {
        const state = kbnRison.encode({
          dataSource: { type: 'esql' },
          query: { esql: 'from my-example-logs' },
        });
        await common.navigateToActualUrl('discover', `?_a=${state}`, {
          ensureCurrentUrl: false,
        });
        await header.waitUntilLoadingHasFinished();
        await discover.waitUntilSearchingHasFinished();

        await testSubjects.existOrFail('fieldListGroupedRecommendedFields');

        // Expand the recommended fields accordion if it's collapsed
        const accordionElement = await testSubjects.find('fieldListGroupedRecommendedFields');
        const isExpanded = (await accordionElement.getAttribute('aria-expanded')) === 'true';
        if (!isExpanded) {
          await testSubjects.click('fieldListGroupedRecommendedFields');
        }

        // Verify specific recommended fields from example profile are present
        await testSubjects.existOrFail('field-log.level');
        await testSubjects.existOrFail('field-message');
        await testSubjects.existOrFail('field-service.name');
        // host.name might not be present in the example data
        await testSubjects.missingOrFail('field-host.name');
      });

      it('should not show recommended fields for non-matching profile', async () => {
        const state = kbnRison.encode({
          dataSource: { type: 'esql' },
          query: { esql: 'from my-example-*' },
        });
        await common.navigateToActualUrl('discover', `?_a=${state}`, {
          ensureCurrentUrl: false,
        });
        await header.waitUntilLoadingHasFinished();
        await discover.waitUntilSearchingHasFinished();

        await testSubjects.missingOrFail('fieldListGroupedRecommendedFields');
      });
    });

    describe('data view mode', () => {
      it('should show recommended fields section for matching profile', async () => {
        await common.navigateToApp('discover');
        await header.waitUntilLoadingHasFinished();
        await discover.waitUntilSearchingHasFinished();
        await dataViews.switchToAndValidate('my-example-logs');

        await testSubjects.existOrFail('fieldListGroupedRecommendedFields');

        // Expand the recommended fields accordion if it's collapsed
        const accordionElement = await testSubjects.find('fieldListGroupedRecommendedFields');
        const isExpanded = (await accordionElement.getAttribute('aria-expanded')) === 'true';
        if (!isExpanded) {
          await testSubjects.click('fieldListGroupedRecommendedFields');
        }

        // Verify specific recommended fields from example profile are present
        await testSubjects.existOrFail('field-log.level');
        await testSubjects.existOrFail('field-message');
        await testSubjects.existOrFail('field-service.name');
        // host.name might not be present in the example data
        await testSubjects.missingOrFail('field-host.name');
      });

      it('should not show recommended fields for non-matching profile', async () => {
        await common.navigateToApp('discover');
        await header.waitUntilLoadingHasFinished();
        await discover.waitUntilSearchingHasFinished();
        await dataViews.switchToAndValidate('my-example-*');

        await testSubjects.missingOrFail('fieldListGroupedRecommendedFields');
      });
    });
  });
}
