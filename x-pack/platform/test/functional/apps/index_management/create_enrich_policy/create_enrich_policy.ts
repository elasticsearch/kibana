/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../ftr_provider_context';

export default ({ getPageObjects, getService }: FtrProviderContext) => {
  const pageObjects = getPageObjects(['common', 'indexManagement', 'header', 'appMenu']);
  const log = getService('log');
  const security = getService('security');
  const comboBox = getService('comboBox');
  const testSubjects = getService('testSubjects');
  const es = getService('es');

  const INDEX_NAME = `index-${Math.random()}`;
  const POLICY_NAME = `policy-${Math.random()}`;

  describe('Create enrich policy', function () {
    before(async () => {
      await log.debug('Creating test index');
      try {
        await es.indices.create({
          index: INDEX_NAME,
          mappings: {
            properties: {
              email: {
                type: 'text',
              },
              age: {
                type: 'long',
              },
            },
          },
        });
      } catch (e) {
        log.debug('[Setup error] Error creating test policy');
        throw e;
      }

      await log.debug('Navigating to the enrich policies tab');
      await security.testUser.setRoles(['index_management_user']);
      await pageObjects.indexManagement.navigateToIndexManagementTab('enrich_policies');
      // Click create policy button
      await testSubjects.click('enrichPoliciesEmptyPromptCreateButton');
    });

    after(async () => {
      await log.debug('Cleaning up created index and policy');

      try {
        await es.enrich.deletePolicy({ name: POLICY_NAME });
      } catch (e) {
        log.debug(`[Teardown error] Error deleting test policy: ${e.message}`);
      }
      try {
        await es.indices.delete({ index: INDEX_NAME });
      } catch (e) {
        log.debug(`[Teardown error] Error deleting test index: ${e.message}`);
      }
    });

    it('shows create enrich policies page and docs link', async () => {
      expect(await testSubjects.getVisibleText('appHeaderTitle')).to.be('Create enrich policy');
      expect(await pageObjects.appMenu.menuItemExists('appHeaderMenuDocumentation')).to.be(true);
    });

    it('can create an enrich policy', async () => {
      // Complete configuration step
      await testSubjects.setValue('policyNameField > input', POLICY_NAME);
      await testSubjects.setValue('policyTypeField', 'match');
      await comboBox.set('policySourceIndicesField', INDEX_NAME);
      await testSubjects.click('nextButton');

      // Complete field selection step
      await comboBox.set('matchField', 'email');
      await comboBox.set('enrichFields', 'age');
      await testSubjects.click('nextButton');

      // Create policy
      await testSubjects.click('createButton');

      // Expect to be redirected to the enrich policies tab
      await pageObjects.header.waitUntilLoadingHasFinished();

      // Expect to have that policy in the table
      const policyList = await testSubjects.findAll('enrichPolicyDetailsLink');
      expect(policyList.length).to.be(1);
    });
  });
};
