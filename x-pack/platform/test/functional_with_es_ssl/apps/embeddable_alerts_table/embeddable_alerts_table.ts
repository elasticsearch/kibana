/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import {
  FILTERS_FORM_ITEM_SUBJ,
  FILTERS_FORM_SUBJ,
  RULE_TAGS_FILTER_SUBJ,
  SOLUTION_SELECTOR_SUBJ,
} from '@kbn/response-ops-alerts-filters-form/constants';
import {
  NO_AUTHORIZED_RULE_TYPE_PROMPT_SUBJ,
  SAVE_CONFIG_BUTTON_SUBJ,
} from '@kbn/embeddable-alerts-table-plugin/public/constants';
import type { WebElementWrapper } from '@kbn/ftr-common-functional-ui-services';
import type { FtrProviderContext } from '../../ftr_provider_context';
import { ObjectRemover } from '../../lib/object_remover';
import { getEventLog } from '../../../alerting_api_integration/common/lib';

const DASHBOARD_PANEL_TEST_SUBJ = 'dashboardPanel';

export default ({ getPageObjects, getService }: FtrProviderContext) => {
  const testSubjects = getService('testSubjects');
  const pageObjects = getPageObjects([
    'common',
    'home',
    'triggersActionsUI',
    'header',
    'ruleDetailsUI',
    'dashboard',
    'timePicker',
  ]);

  const security = getService('security');
  const retry = getService('retry');
  const find = getService('find');
  const supertest = getService('supertest');
  const objectRemover = new ObjectRemover(supertest);
  const comboBox = getService('comboBox');
  const dashboardAddPanel = getService('dashboardAddPanel');
  const toasts = getService('toasts');
  const sampleData = getService('sampleData');
  const rules = getService('rules');

  // Failing: See https://github.com/elastic/kibana/issues/258426
  describe.skip('Embeddable alerts panel', function () {
    this.tags('skipFIPS');

    before(async () => {
      await sampleData.testResources.installAllKibanaSampleData();

      const dataViews = await getDataViews();
      const sampleDataLogsDataView = dataViews.find(
        (dataView) => dataView.title === 'kibana_sample_data_logs'
      )!;

      const [stackRule, observabilityRule, securityRule] = await Promise.all([
        createEsQueryRule(),
        createCustomThresholdRule(sampleDataLogsDataView.id),
        createSecurityRule(),
      ]);

      await waitForRuleToExecute(stackRule.id);
      await waitForRuleToExecute(observabilityRule.id);
      await waitForRuleToExecute(securityRule.id);

      await pageObjects.dashboard.gotoDashboardURL();
    });

    after(async () => {
      await sampleData.testResources.removeAllKibanaSampleData();
      await objectRemover.removeAll();
    });

    // FLAKY: https://github.com/elastic/kibana/issues/258426
    describe.skip('Config editor', () => {
      it('should show the solution picker when multiple solutions are available', async () => {
        await toasts.dismissIfExists();
        await dashboardAddPanel.openAddPanelFlyout();
        await dashboardAddPanel.clickAddNewPanelFromUIActionLink('Alerts');
        await testSubjects.existOrFail(SOLUTION_SELECTOR_SUBJ);
      });

      it('should ask for confirmation before resetting filters when switching solution', async () => {
        await pageObjects.dashboard.gotoDashboardURL();
        await dashboardAddPanel.openAddPanelFlyout();
        await dashboardAddPanel.clickAddNewPanelFromUIActionLink('Alerts');

        await testSubjects.click(SOLUTION_SELECTOR_SUBJ);
        await find.clickByCssSelector(`button#observability`);
        await find.clickByCssSelector(`[data-test-subj=${FILTERS_FORM_ITEM_SUBJ}] button`);
        await find.clickByCssSelector(`button#ruleTags`);
        await testSubjects.click('comboBoxToggleListButton');
        const options = await comboBox.getOptions(RULE_TAGS_FILTER_SUBJ);
        await options[0].click();

        await find.clickByCssSelector(`[data-test-subj=${SOLUTION_SELECTOR_SUBJ}] button`);
        await find.clickByCssSelector(`button#security`);

        expect(await find.byButtonText('Switch solution')).to.be.ok();
      });
    });

    for (const solution of ['stack', 'observability', 'security']) {
      describe(`with ${solution} role`, function () {
        const ruleName = `${solution}-rule`;

        before(async () => {
          await security.testUser.setRoles([`${solution}_alerting`]);
        });

        it(`should only be able to create panels with ${solution} rule types`, async () => {
          await pageObjects.dashboard.gotoDashboardURL();
          await toasts.dismissIfExists();
          await dashboardAddPanel.openAddPanelFlyout();
          await dashboardAddPanel.clickAddNewPanelFromUIActionLink('Alerts');
          await testSubjects.existOrFail(FILTERS_FORM_SUBJ);
          if (solution === 'stack' || solution === 'observability') {
            await testSubjects.missingOrFail(SOLUTION_SELECTOR_SUBJ);
          }

          await find.clickByCssSelector(`[data-test-subj=${FILTERS_FORM_ITEM_SUBJ}] button`);
          await find.clickByCssSelector(`button#ruleTags`);
          await testSubjects.click('comboBoxToggleListButton');
          const options = await comboBox.getOptions(RULE_TAGS_FILTER_SUBJ);
          expect(options.length).to.equal(1);
          expect(await options[0].getVisibleText()).to.equal(ruleName);
          await options[0].click();
          // Dashboard warnings may appear above the save button
          await toasts.dismissIfExists();
          await testSubjects.click(SAVE_CONFIG_BUTTON_SUBJ);
          await testSubjects.existOrFail(DASHBOARD_PANEL_TEST_SUBJ);
          await pageObjects.dashboard.verifyNoRenderErrors();
          const tagsCells = await find.allByCssSelector(
            '[data-gridcell-column-id="kibana.alert.rule.tags"] [data-test-subj="dataGridRowCell"]'
          );
          const tags = await Promise.all(tagsCells.map((t) => t.getVisibleText()));
          expect(tags.every((tag) => tag === ruleName)).to.equal(true);
        });

        after(async () => {
          await security.testUser.restoreDefaults();
        });
      });
    }

    it(`should only show alerts from the observability area (o11y+stack) when selecting it`, async () => {
      await toasts.dismissIfExists();
      await dashboardAddPanel.openAddPanelFlyout();
      await dashboardAddPanel.clickAddNewPanelFromUIActionLink('Alerts');
      await testSubjects.existOrFail(SOLUTION_SELECTOR_SUBJ);
      await testSubjects.click(SOLUTION_SELECTOR_SUBJ);
      await find.clickByCssSelector(`button#observability`);
      await testSubjects.click(SAVE_CONFIG_BUTTON_SUBJ);
      await testSubjects.existOrFail(DASHBOARD_PANEL_TEST_SUBJ);
      const featureCells = await find.allByCssSelector(
        '[data-gridcell-column-id="kibana.alert.rule.consumer"] [data-test-subj="dataGridRowCell"]'
      );
      const features = await Promise.all(featureCells.map((f) => f.getVisibleText()));
      // The Observability label of the solution selector implicitly includes Stack rules.
      // Observability rules have different feature labels depending on the app generating the alerts
      const expectedFeatures = ['logs', 'stack'];
      expect(
        features.every((f) => expectedFeatures.some((ef) => f.toLowerCase().includes(ef)))
      ).to.equal(true);
    });

    it(`should only show alerts from the security area when selecting it`, async () => {
      await toasts.dismissIfExists();
      await dashboardAddPanel.openAddPanelFlyout();
      await dashboardAddPanel.clickAddNewPanelFromUIActionLink('Alerts');
      await find.clickByCssSelector(`button#security`);
      await testSubjects.click(SAVE_CONFIG_BUTTON_SUBJ);
      let panels: WebElementWrapper[];
      await retry.try(async () => {
        panels = await find.allByCssSelector(`[data-test-subj=${DASHBOARD_PANEL_TEST_SUBJ}]`);
        expect(panels.length).to.equal(2);
      });
      const featureCells = await panels![1].findAllByCssSelector(
        '[data-gridcell-column-id="kibana.alert.rule.consumer"] [data-test-subj="dataGridRowCell"]'
      );
      const features = await Promise.all(featureCells.map((f) => f.getVisibleText()));
      // The Observability label of the solution selector implicitly includes Stack rules.
      // Observability rules have different feature labels depending on the app generating the alerts
      expect(features.every((f) => f.toLowerCase().includes('security'))).to.equal(true);
    });

    it("should show a missing authz prompt when the user doesn't have access to a panel's rule types", async () => {
      // User with o11y-only access should see a missing authz prompt in the security panel
      await security.testUser.setRoles([`observability_alerting`]);
      let panels = await find.allByCssSelector(`[data-test-subj=${DASHBOARD_PANEL_TEST_SUBJ}]`);
      expect(
        await testSubjects.descendantExists(NO_AUTHORIZED_RULE_TYPE_PROMPT_SUBJ, panels[0])
      ).to.equal(false);
      expect(
        await testSubjects.descendantExists(NO_AUTHORIZED_RULE_TYPE_PROMPT_SUBJ, panels[1])
      ).to.equal(true);

      // User with security-only access should see a missing authz prompt in the o11y panel
      await security.testUser.setRoles([`security_alerting`]);
      panels = await find.allByCssSelector(`[data-test-subj=${DASHBOARD_PANEL_TEST_SUBJ}]`);
      expect(
        await testSubjects.descendantExists(NO_AUTHORIZED_RULE_TYPE_PROMPT_SUBJ, panels[0])
      ).to.equal(true);
      expect(
        await testSubjects.descendantExists(NO_AUTHORIZED_RULE_TYPE_PROMPT_SUBJ, panels[1])
      ).to.equal(false);

      await security.testUser.restoreDefaults();
    });

    it('should apply the global time filter to alert panels by default', async () => {
      await pageObjects.timePicker.setDefaultAbsoluteRange();
      await retry.try(async () =>
        expect((await testSubjects.findAll('alertsTableEmptyState')).length).to.equal(2)
      );
    });

    it('should override the time range for specific panels', async () => {
      await testSubjects.moveMouseTo(DASHBOARD_PANEL_TEST_SUBJ);
      await testSubjects.click('embeddablePanelAction-ACTION_CUSTOMIZE_PANEL');
      await testSubjects.click('customizePanelShowCustomTimeRange');
      // The nested selector is necessary to disambiguate with the global time picker
      await find.clickByCssSelector(
        '[data-test-subj=customizePanel] [data-test-subj=superDatePickerToggleQuickMenuButton]'
      );
      await testSubjects.click('superDatePickerCommonlyUsed_sample_data range');
      await testSubjects.click('saveCustomizePanelButton');
      await retry.try(async () =>
        expect((await testSubjects.findAll('alertsTableEmptyState')).length).to.equal(1)
      );
    });
  });

  const createEsQueryRule = async () => {
    const name = 'stack-rule';
    const createdRule = await rules.api.createRule({
      name,
      schedule: {
        interval: '5s',
      },
      consumer: 'stackAlerts',
      ruleTypeId: '.es-query',
      actions: [],
      tags: [name],
      params: {
        searchType: 'esQuery',
        timeWindowSize: 5,
        timeWindowUnit: 'd',
        threshold: [0],
        thresholdComparator: '>',
        size: 100,
        esQuery: '{\n    "query":{\n      "match_all" : {}\n    }\n  }',
        aggType: 'count',
        groupBy: 'all',
        termSize: 5,
        excludeHitsFromPreviousRun: false,
        sourceFields: [],
        index: ['kibana_sample_data_logs'],
        timeField: '@timestamp',
      },
    });

    objectRemover.add(createdRule.id, 'rule', 'alerting');

    return createdRule;
  };

  const createCustomThresholdRule = async (dataView: string) => {
    const name = 'observability-rule';
    const createdRule = await rules.api.createRule({
      name,
      schedule: {
        interval: '5s',
      },
      consumer: 'logs',
      ruleTypeId: 'observability.rules.custom_threshold',
      actions: [],
      tags: [name],
      params: {
        criteria: [
          {
            comparator: '>',
            metrics: [
              {
                name: 'A',
                aggType: 'count',
              },
            ],
            threshold: [0],
            timeSize: 1,
            timeUnit: 'd',
          },
        ],
        alertOnNoData: false,
        alertOnGroupDisappear: false,
        searchConfiguration: {
          query: {
            query: '',
            language: 'kuery',
          },
          index: dataView,
        },
      },
    });

    objectRemover.add(createdRule.id, 'rule', 'alerting');

    return createdRule;
  };

  const createSecurityRule = async () => {
    const name = 'security-rule';

    const { body: createdRule } = await supertest
      .post(`/api/detection_engine/rules`)
      .set('kbn-xsrf', 'foo')
      .send({
        name,
        description: 'Spammy query rule',
        enabled: true,
        risk_score: 1,
        rule_id: 'rule-1',
        severity: 'low',
        type: 'query',
        query: '_id: *',
        index: ['kibana_sample_data_logs'],
        from: 'now-1y',
        interval: '1m',
        tags: [name],
      })
      .expect(200);

    objectRemover.add(createdRule.id, 'rule', 'alerting');

    return createdRule;
  };

  const waitForRuleToExecute = async (ruleId: string) => {
    await retry.try(async () => {
      return await getEventLog({
        getService,
        spaceId: 'default',
        type: 'alert',
        id: ruleId,
        provider: 'alerting',
        actions: new Map([['execute', { gte: 1 }]]),
      });
    });
  };

  const getDataViews = async (): Promise<Array<{ id: string; title: string }>> => {
    const response = await supertest.get('/api/data_views').expect(200);

    return response.body.data_view;
  };
};
