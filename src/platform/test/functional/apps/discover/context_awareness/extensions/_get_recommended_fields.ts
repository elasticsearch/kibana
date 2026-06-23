/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// Serverless test (remove during Scout migration): x-pack/platform/test/serverless/functional/test_suites/discover/context_awareness/extensions/_get_recommended_fields.ts

import kbnRison from '@kbn/rison';
import type { FtrProviderContext } from '../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const { common, discover, header } = getPageObjects(['common', 'discover', 'header']);
  const dataViews = getService('dataViews');
  const testSubjects = getService('testSubjects');

  describe('extension getRecommendedFields', () => {
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
        // Even though host.name is present in the profile, it's not present in the data, hence it should not load
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
        await common.navigateToActualUrl('discover', undefined, {
          ensureCurrentUrl: false,
        });
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
        // Even though host.name is present in the profile, it's not present in the data, hence it should not load
        await testSubjects.missingOrFail('field-host.name');
      });

      it('should not show recommended fields for non-matching profile', async () => {
        await common.navigateToActualUrl('discover', undefined, {
          ensureCurrentUrl: false,
        });
        await header.waitUntilLoadingHasFinished();
        await discover.waitUntilSearchingHasFinished();
        await dataViews.switchToAndValidate('my-example-*');

        await testSubjects.missingOrFail('fieldListGroupedRecommendedFields');
      });
    });
  });
}
