/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../ftr_provider_context';

export default ({ getPageObjects, getService }: FtrProviderContext) => {
  const pageObjects = getPageObjects(['common', 'indexManagement', 'header']);
  const log = getService('log');
  const security = getService('security');
  const testSubjects = getService('testSubjects');
  const es = getService('es');
  const browser = getService('browser');
  const retry = getService('retry');

  const INDEX_TEMPLATE_NAME = 'index-template-test-name';
  const DEFAULT_SNAPSHOT_REPOSITORY_NAME = 'index-template-test-default-repo';

  describe('Index template tab', function () {
    before(async () => {
      await log.debug('Navigating to the index templates tab');
      await security.testUser.setRoles(['index_management_user']);
      await pageObjects.indexManagement.navigateToIndexManagementTab('templates');
    });

    afterEach(async () => {
      await es.indices.deleteIndexTemplate(
        {
          name: INDEX_TEMPLATE_NAME,
        },
        { ignore: [404] }
      );

      if (await testSubjects.exists('reloadButton')) {
        await browser.execute(() => {
          const btn = document.querySelector('[data-test-subj="reloadButton"]') as HTMLElement;
          if (btn) btn.click();
        });
      }
    });

    describe('index template creation', () => {
      before(async () => {
        await es.snapshot.createRepository({
          name: DEFAULT_SNAPSHOT_REPOSITORY_NAME,
          repository: {
            type: 'fs',
            settings: {
              location: '/tmp/',
            },
          },
          verify: false,
        });
        await es.cluster.putSettings({
          persistent: { 'repositories.default_repository': DEFAULT_SNAPSHOT_REPOSITORY_NAME },
        });
      });

      after(async () => {
        await es.cluster.putSettings({
          persistent: { 'repositories.default_repository': null },
        });
        await es.snapshot.deleteRepository(
          { name: DEFAULT_SNAPSHOT_REPOSITORY_NAME },
          { ignore: [404] }
        );
      });

      // Enabling the "Create data stream" toggle reveals the data lifecycle section. Toggle based
      // on the switch's actual checked state (not the rendered section) to avoid flipping it back
      // off while waiting for the section to render.
      const enableDataStream = async () => {
        await retry.try(async () => {
          if (!(await testSubjects.isEuiSwitchChecked('dataStreamField > input'))) {
            await testSubjects.click('dataStreamField > input');
          }
          expect(await testSubjects.isEuiSwitchChecked('dataStreamField > input')).to.be(true);
        });
        // The delete phase card is always rendered once the data lifecycle section is shown.
        // It can be below the fold, so scroll it into view (this also waits for it to exist).
        await testSubjects.scrollIntoView('dlmPhasesSelectorDeletePhaseCard');
      };

      beforeEach(async () => {
        if (await testSubjects.exists('closeDetailsButton', { timeout: 1000 })) {
          await testSubjects.click('closeDetailsButton');
        }
        await testSubjects.click('createTemplateButton');
        // Complete required fields from step 1
        await testSubjects.setValue('nameField', INDEX_TEMPLATE_NAME);
        await testSubjects.setValue('indexPatternsField', 'test-1');
      });

      afterEach(async () => {
        await retry.try(async () => {
          await pageObjects.indexManagement.clickNextButton();
        });
        await testSubjects.click('closeDetailsButton');
      });

      it('can create an index template with data retention', async () => {
        // Data lifecycle is only available for data stream templates, so enable it first
        await enableDataStream();

        // Enable the delete (data retention) phase
        await testSubjects.click('dlmPhasesSelectorDeletePhaseCard');
        // Set the retention to 7 hours
        await testSubjects.setValue('deleteDurationValue', '7');
        await testSubjects.selectValue('deleteDurationUnit', 'h');

        expect(await testSubjects.getVisibleText('totalRetentionBadge')).to.be('7h');

        // Navigate to the last step of the wizard
        await testSubjects.click('formWizardStep-5');
        await pageObjects.header.waitUntilLoadingHasFinished();

        expect(await testSubjects.getVisibleText('lifecycleValue')).to.be(
          '7 hours · 2 data phases'
        );
      });

      it('can create a data stream index template with a frozen phase', async () => {
        await enableDataStream();

        await testSubjects.scrollIntoView('dlmPhasesSelectorFrozenPhaseCard');
        await testSubjects.click('dlmPhasesSelectorFrozenPhaseCard');

        // Move data to the frozen phase after 30 days
        await testSubjects.setValue('frozenDurationValue', '30');
        await testSubjects.selectValue('frozenDurationUnit', 'd');

        // Navigate to the last step of the wizard and inspect the request that would be sent
        await testSubjects.click('formWizardStep-5');
        await pageObjects.header.waitUntilLoadingHasFinished();

        await testSubjects.click('stepReviewRequestTab');
        await pageObjects.header.waitUntilLoadingHasFinished();

        const request = await testSubjects.getVisibleText('requestTab');
        expect(request).to.contain('"frozen_after": "30d"');
      });

      it('can create an index template with logsdb index mode', async () => {
        // Modify index mode
        await testSubjects.click('indexModeField');
        await testSubjects.click('index_mode_logsdb');

        // Navigate to the last step of the wizard
        await testSubjects.click('formWizardStep-5');
        await pageObjects.header.waitUntilLoadingHasFinished();

        expect(await testSubjects.exists('indexModeTitle')).to.be(true);
        expect(await testSubjects.getVisibleText('indexModeValue')).to.be('LogsDB');
      });
    });

    describe('index template modification', function () {
      // FIPS mode sets defaultRoles to superuser which causes a trial-licensed UI element to
      // intercept the templateDetailsLink click in the beforeEach hook
      this.tags('skipFIPS');
      beforeEach(async () => {
        if (await testSubjects.exists('closeDetailsButton', { timeout: 1000 })) {
          await testSubjects.click('closeDetailsButton');
        }
        await es.indices.putIndexTemplate({
          name: INDEX_TEMPLATE_NAME,
          index_patterns: ['logsdb-test-index-pattern'],
          data_stream: {},
          template: {
            settings: {
              index: {
                mode: 'logsdb',
              },
            },
          },
        });

        await testSubjects.scrollIntoView('reloadButton');
        await browser.execute(() => {
          const btn = document.querySelector('[data-test-subj="reloadButton"]') as HTMLElement;
          if (btn) btn.click();
        });
        await retry.try(async () => {
          if (await testSubjects.exists('closeDetailsButton', { timeout: 1000 })) {
            await testSubjects.click('closeDetailsButton');
          }
          await pageObjects.indexManagement.clickIndexTemplateNameLink(INDEX_TEMPLATE_NAME);
        });
        await testSubjects.click('manageTemplateButton');
        await testSubjects.click('editIndexTemplateButton');
        await pageObjects.header.waitUntilLoadingHasFinished();
      });

      afterEach(async () => {
        if (await testSubjects.exists('closeDetailsButton')) {
          // Close Flyout to return to templates tab
          await testSubjects.click('closeDetailsButton');
        } else {
          await pageObjects.indexManagement.navigateToIndexManagementTab('templates');
        }
      });

      it('can modify ignore_above, ignore_malformed, ignore_dynamic_beyond_limit, subobjects and timestamp format in an index template with logsdb index mode', async () => {
        // Navigate to Index Settings
        await testSubjects.click('formWizardStep-2');
        await pageObjects.header.waitUntilLoadingHasFinished();

        // Modify Index settings
        await testSubjects.setValue(
          'kibanaCodeEditor',
          JSON.stringify({
            index: {
              mapping: {
                ignore_above: '20',
                total_fields: {
                  ignore_dynamic_beyond_limit: 'true',
                },
                ignore_malformed: 'true',
              },
            },
          }),
          {
            clearWithKeyboard: true,
          }
        );

        // Navigate to Mappings
        await testSubjects.click('formWizardStep-3');
        await pageObjects.header.waitUntilLoadingHasFinished();
        await testSubjects.click('advancedOptionsTab');

        // Modify timestamp format
        await testSubjects.click('comboBoxClearButton');
        await testSubjects.setValue('comboBoxInput', 'basic_date');
        await testSubjects.pressEnter('comboBoxInput');

        // Modify subobjects
        await testSubjects.click('subobjectsToggle');

        // Navigate to the last step of the wizard
        await testSubjects.click('formWizardStep-5');
        await pageObjects.header.waitUntilLoadingHasFinished();

        // Click Create template
        await pageObjects.indexManagement.clickNextButton();
        await pageObjects.header.waitUntilLoadingHasFinished();

        // Verify Index Settings
        await testSubjects.click('settingsTabBtn');
        await pageObjects.header.waitUntilLoadingHasFinished();
        expect(await testSubjects.exists('settingsTabContent')).to.be(true);
        const settingsTabContent = await testSubjects.getVisibleText('settingsTabContent');
        expect(JSON.parse(settingsTabContent)).to.eql({
          index: {
            mode: 'logsdb',
            mapping: {
              ignore_above: '20',
              source: {
                mode: 'synthetic',
              },
              total_fields: {
                ignore_dynamic_beyond_limit: 'true',
              },
              ignore_malformed: 'true',
            },
          },
        });

        // Verify Mappings
        await testSubjects.click('mappingsTabBtn');
        await pageObjects.header.waitUntilLoadingHasFinished();
        expect(await testSubjects.exists('mappingsTabContent')).to.be(true);
        const mappingsTabContent = await testSubjects.getVisibleText('mappingsTabContent');
        expect(JSON.parse(mappingsTabContent)).to.eql({
          dynamic_date_formats: ['basic_date'],
          subobjects: false,
        });
      });
      describe('syntethic source', () => {
        it('can not disable syntethic source in an index template with logsdb index mode', async () => {
          // Navigate to Mappings
          await testSubjects.click('formWizardStep-3');
          await pageObjects.header.waitUntilLoadingHasFinished();
          await (await testSubjects.find('advancedOptionsTab')).click();

          // Modify source
          await testSubjects.click('sourceValueField');
          await testSubjects.click('disabledSourceFieldOption');

          // Navigate to the last step of the wizard
          await testSubjects.click('formWizardStep-5');
          await pageObjects.header.waitUntilLoadingHasFinished();

          // Click Create template
          await pageObjects.indexManagement.clickNextButton();
          await pageObjects.header.waitUntilLoadingHasFinished();

          expect(await testSubjects.exists('saveTemplateError')).to.be(true);

          await testSubjects.click('stepReviewPreviewTab');
          await pageObjects.header.waitUntilLoadingHasFinished();
          expect(await testSubjects.exists('simulateTemplatePreview')).to.be(true);
          expect(await testSubjects.getVisibleText('simulateTemplatePreview')).to.contain(
            '_source can not be disabled in index using [logsdb] index mode'
          );
        });
      });
    });

    describe('Index template list', () => {
      const TEST_TEMPLATE = 'a_test_template';
      const INDEX_PATTERN = `index_pattern_${Math.random()}`;

      before(async () => {
        await es.indices.putIndexTemplate({
          name: TEST_TEMPLATE,
          index_patterns: [INDEX_PATTERN],
          template: {
            settings: {
              default_pipeline: 'test_pipeline',
            },
          },
        });
        await pageObjects.indexManagement.navigateToIndexManagementTab('templates');
      });

      after(async () => {
        await es.indices.deleteIndexTemplate({ name: TEST_TEMPLATE }, { ignore: [404] });
      });

      it('shows link to ingest pipeline when default pipeline is set', async () => {
        // Open details flyout
        await pageObjects.indexManagement.clickIndexTemplate(TEST_TEMPLATE);

        // Click on the linked ingest pipeline button
        const linkedPipelineButton = await testSubjects.find('linkedIngestPipeline');
        await linkedPipelineButton.click();

        // Expect to navigate to the ingest pipeline page
        await pageObjects.header.waitUntilLoadingHasFinished();
        // We should've now navigated to the ingest pipelines app
        const currentUrl = await browser.getCurrentUrl();
        expect(currentUrl).to.contain('/ingest/ingest_pipelines/edit/test_pipeline');
      });
    });
  });
};
