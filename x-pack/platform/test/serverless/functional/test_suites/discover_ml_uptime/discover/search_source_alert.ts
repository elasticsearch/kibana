/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Original test (remove during Scout migration): x-pack/platform/test/functional_with_es_ssl/apps/discover_ml/discover/search_source_alert.ts
import expect from '@kbn/expect';
import { asyncForEach } from '@kbn/std';
import type { FtrProviderContext } from '../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const log = getService('log');
  const es = getService('es');
  const monacoEditor = getService('monacoEditor');
  const PageObjects = getPageObjects([
    'settings',
    'svlCommonPage',
    'common',
    'header',
    'discover',
    'timePicker',
    'dashboard',
    'unifiedFieldList',
  ]);
  const deployment = getService('deployment');
  const dataGrid = getService('dataGrid');
  const browser = getService('browser');
  const retry = getService('retry');
  const testSubjects = getService('testSubjects');
  const supertest = getService('supertest');
  const queryBar = getService('queryBar');
  const security = getService('security');
  const filterBar = getService('filterBar');
  const find = getService('find');
  const toasts = getService('toasts');
  const kibanaServer = getService('kibanaServer');
  const comboBox = getService('comboBox');
  const dataViews = getService('dataViews');

  const SOURCE_DATA_VIEW = 'search-source-alert';
  const OUTPUT_DATA_VIEW = 'search-source-alert-output';
  const ACTION_TYPE_ID = '.index';
  const RULE_NAME = 'test-search-source-alert';
  const ADHOC_RULE_NAME = 'test-adhoc-alert';
  let sourceDataViewId: string;
  let outputDataViewId: string;
  let connectorId: string;

  const createSourceIndex = () =>
    retry.try(() =>
      createIndex(SOURCE_DATA_VIEW, {
        '@timestamp': { type: 'date' },
        message: { type: 'keyword' },
      })
    );

  const createOutputDataIndex = () =>
    retry.try(() =>
      createIndex(OUTPUT_DATA_VIEW, {
        rule_id: { type: 'text' },
        rule_name: { type: 'text' },
        alert_id: { type: 'text' },
        context_link: { type: 'text' },
      })
    );

  async function createIndex(index: string, properties: unknown) {
    try {
      await es.index({
        index,
        body: {
          settings: { number_of_shards: 1 },
          mappings: { properties },
        },
      });
    } catch (e) {
      log.error(`Failed to create index "${index}" with error "${e.message}"`);
    }
  }

  async function generateNewDocs(docsNumber: number, index = SOURCE_DATA_VIEW) {
    const mockMessages = Array.from({ length: docsNumber }, (_, i) => `msg-${i}`);
    const dateNow = new Date();
    const dateToSet = new Date(dateNow);
    dateToSet.setMinutes(dateNow.getMinutes() - 10);
    try {
      await Promise.all(
        mockMessages.map((message) =>
          es.transport.request({
            path: `/${index}/_doc`,
            method: 'POST',
            body: {
              '@timestamp': dateToSet.toISOString(),
              message,
            },
          })
        )
      );
    } catch (e) {
      log.error(`Failed to generate new docs in "${index}" with error "${e.message}"`);
    }
  }

  const deleteAlerts = (alertIds: string[]) =>
    asyncForEach(alertIds, async (alertId: string) => {
      await supertest
        .delete(`/api/alerting/rule/${alertId}`)
        // TODO: API requests in Serverless require internal request headers
        .set({
          'kbn-xsrf': 'some-xsrf-token',
          'x-elastic-internal-origin': 'kibana',
        })
        .set('x-elastic-internal-origin', 'kibana')
        .expect(204, '');
    });

  const getAlertsByName = async (name: string) => {
    const {
      body: { data: alerts },
    } = await supertest
      .get(`/api/alerting/rules/_find?search=${name}&search_fields=name`)
      // TODO: API requests in Serverless require internal request headers
      .set({
        'kbn-xsrf': 'some-xsrf-token',
        'x-elastic-internal-origin': 'kibana',
      })
      .expect(200);

    return alerts;
  };

  const createDataView = async (dataView: string) => {
    log.debug(`create data view ${dataView}`);
    return await supertest
      .post(`/api/data_views/data_view`)
      // TODO: API requests in Serverless require internal request headers
      .set({
        'kbn-xsrf': 'some-xsrf-token',
        'x-elastic-internal-origin': 'kibana',
      })
      .send({ data_view: { title: dataView, timeFieldName: '@timestamp' } })
      .expect(200);
  };

  const deleteDataView = async (dataViewId: string) => {
    return await supertest
      .delete(`/api/data_views/data_view/${dataViewId}`)
      // TODO: API requests in Serverless require internal request headers
      .set({
        'kbn-xsrf': 'some-xsrf-token',
        'x-elastic-internal-origin': 'kibana',
      })
      .expect(200);
  };

  const deleteIndexes = (indexes: string[]) => {
    return Promise.all(
      indexes.map((current) =>
        es.transport.request({
          path: `/${current}`,
          method: 'DELETE',
        })
      )
    );
  };

  const createConnector = async (): Promise<string> => {
    const { body: createdAction } = await supertest
      .post(`/api/actions/connector`)
      // TODO: API requests in Serverless require internal request headers
      .set({
        'kbn-xsrf': 'some-xsrf-token',
        'x-elastic-internal-origin': 'kibana',
      })
      .send({
        name: 'search-source-alert-test-connector',
        connector_type_id: ACTION_TYPE_ID,
        config: { index: OUTPUT_DATA_VIEW },
        secrets: {},
      })
      .expect(200);

    return createdAction.id;
  };

  const deleteConnector = (id: string) =>
    supertest
      .delete(`/api/actions/connector/${id}`)
      // TODO: API requests in Serverless require internal request headers
      .set({
        'kbn-xsrf': 'some-xsrf-token',
        'x-elastic-internal-origin': 'kibana',
      })
      .expect(204, '');

  const defineSearchSourceAlert = async (alertName: string) => {
    await testSubjects.click('thresholdPopover');
    await testSubjects.setValue('alertThresholdInput0', '1');

    await testSubjects.click('forLastExpression');
    await testSubjects.setValue('timeWindowSizeNumber', '30');

    await testSubjects.click('ruleFormStep-actions');
    await retry.waitFor('actions button to exist', async () => {
      await testSubjects.click('ruleActionsAddActionButton');
      await find.clickByCssSelector('[data-action-type-id=".index"]');
      return (await testSubjects.findAll('ruleActionsItem')).length === 1;
    });

    await monacoEditor.waitCodeEditorReady('kibanaCodeEditor');
    await monacoEditor.setCodeEditorValue(`{
      "rule_id": "{{rule.id}}",
      "rule_name": "{{rule.name}}",
      "alert_id": "{{alert.id}}",
      "context_link": "{{context.link}}"
    }`);

    await retry.waitFor('rule name value is correct', async () => {
      await testSubjects.click('ruleFormStep-details');

      await testSubjects.setValue('ruleDetailsNameInput', alertName);
      const ruleName = await testSubjects.getAttribute('ruleDetailsNameInput', 'value');
      return ruleName === alertName;
    });

    await testSubjects.click('ruleFormStep-definition');
  };

  const openDiscoverAlertFlyout = async () => {
    await testSubjects.click('app-menu-overflow-button');
    await testSubjects.click('discoverAlertsButton');
    if (await testSubjects.exists('discoverCreateAlertButton')) {
      await testSubjects.click('discoverCreateAlertButton');
    } else if (await testSubjects.exists('discoverLegacySearchThresholdRule')) {
      await testSubjects.click('discoverLegacySearchThresholdRule');
    } else if (await testSubjects.exists('discoverAppMenuCustomThresholdRule')) {
      await testSubjects.click('discoverAppMenuCustomThresholdRule');
    } else {
      throw new Error('No discover alert rule option found in the app menu');
    }
  };

  const openManagementAlertFlyout = async () => {
    // TODO: Navigation to Rule Management is different in Serverless
    await PageObjects.common.navigateToApp('management', {
      path: 'insightsAndAlerting/triggersActions',
    });
    await PageObjects.header.waitUntilLoadingHasFinished();
    await testSubjects.click('createFirstRuleButton');
    await PageObjects.header.waitUntilLoadingHasFinished();
    await testSubjects.click('.es-query-SelectOption');
    await PageObjects.header.waitUntilLoadingHasFinished();
    await testSubjects.click('queryFormType_searchSource');
    await PageObjects.header.waitUntilLoadingHasFinished();
  };

  const getResultsLink = async () => {
    // getting the link
    await dataGrid.clickRowToggle();
    await testSubjects.click('toggleLongFieldValue-context_link');
    const contextMessageElement = await testSubjects.find('tableDocViewRow-context_link-value');
    const contextMessage = await contextMessageElement.getVisibleText();

    return contextMessage;
  };

  const openAlertResults = async (value: string, type: 'id' | 'name' = 'name') => {
    await PageObjects.common.navigateToApp('discover');
    await PageObjects.header.waitUntilLoadingHasFinished();
    await PageObjects.discover.clickNewSearchButton(); // reset params
    await dataViews.switchToAndValidate(OUTPUT_DATA_VIEW);

    let ruleId: string;
    if (type === 'name') {
      const [{ id }] = await getAlertsByName(value);
      ruleId = id;
    } else {
      ruleId = value;
    }

    await testSubjects.click('discoverQueryTotalHits'); // dismiss tooltip
    await filterBar.addFilter({ field: 'rule_id', operation: 'is', value: ruleId });

    await retry.waitFor('results', async () => {
      await PageObjects.header.waitUntilLoadingHasFinished();
      await PageObjects.discover.waitUntilSearchingHasFinished();

      const alreadyHasData = await testSubjects.exists('docTable');

      if (!alreadyHasData) {
        await testSubjects.click('querySubmitButton');
      }

      return alreadyHasData;
    });

    const link = await getResultsLink();
    await filterBar.removeFilter('rule_id'); // clear filter bar

    // follow url provided by alert to see documents triggered the alert
    const baseUrl = deployment.getHostPort();
    // In Serverless `link` is a full URL instead of just a path as in stateful
    const fullLink = link.startsWith('http') ? link : baseUrl + link;
    await browser.navigateTo(fullLink);
    await PageObjects.discover.waitUntilSearchingHasFinished();
  };

  const openAlertRuleInManagement = async (ruleName: string) => {
    // Navigation to Rule Management is different in Serverless
    await PageObjects.common.navigateToApp('management', {
      path: 'insightsAndAlerting/triggersActions',
    });
    await PageObjects.header.waitUntilLoadingHasFinished();

    let retries = 0;

    await retry.try(async () => {
      retries = retries + 1;
      if (retries > 1) {
        // It might take time for a rule to get created. Waiting for it.
        await browser.refresh();
        await PageObjects.header.waitUntilLoadingHasFinished();
      }
      const rulesList = await testSubjects.find('rulesList');
      const alertRule = await rulesList.findByCssSelector(
        `[data-test-subj="rulesListTableRowName-${ruleName}"]`
      );
      await alertRule.click();
      await PageObjects.header.waitUntilLoadingHasFinished();
    });
  };

  const clickViewInApp = async (ruleName: string) => {
    // navigate to discover using view in app link
    await openAlertRuleInManagement(ruleName);
    await testSubjects.click('ruleDetails-viewInDiscover');
    await PageObjects.header.waitUntilLoadingHasFinished();
  };

  const checkInitialRuleParamsState = async (dataView: string, isViewInApp = false) => {
    if (isViewInApp) {
      expect(await toasts.getCount()).to.be(0);
    } else {
      expect(await toasts.getCount()).to.be(1);
      expect((await toasts.getContentByIndex(1)).startsWith('Displayed documents may vary')).to.be(
        true
      );
    }
    expect(await filterBar.getFilterCount()).to.be(0);
    expect(await queryBar.getQueryString()).to.equal('');

    const selectedDataView = await dataViews.getSelectedName();
    const { valid } = await PageObjects.discover.validateDataViewReffsEquality();
    expect(valid).to.equal(true);
    expect(selectedDataView).to.be.equal(dataView);
    expect(await dataGrid.getDocCount()).to.be(5);
  };

  const checkUpdatedRuleParamsState = async () => {
    expect(await toasts.getCount()).to.be(0);
    const queryString = await queryBar.getQueryString();
    const hasFilter = await filterBar.hasFilter('message.keyword', 'msg-1');
    expect(queryString).to.be.equal('message:msg-1');
    expect(hasFilter).to.be.equal(true);
    expect(await dataGrid.getDocCount()).to.be(1);
  };

  const checkInitialDataViewState = async (dataView: string) => {
    // validate prev field filter
    await testSubjects.existOrFail(`field-message-showDetails`); // still exists

    // validate prev title
    await PageObjects.discover.clickIndexPatternActions();
    await testSubjects.click('indexPattern-manage-field');
    await PageObjects.header.waitUntilLoadingHasFinished();

    const titleElem = await testSubjects.find('createIndexPatternTitleInput');
    expect(await titleElem.getAttribute('value')).to.equal(dataView);
  };

  const checkUpdatedDataViewState = async (dataView: string) => {
    // validate updated field filter
    await testSubjects.missingOrFail(`field-message-showDetails`);

    // validate updated title
    await PageObjects.discover.clickIndexPatternActions();
    await testSubjects.click('indexPattern-manage-field');
    await PageObjects.header.waitUntilLoadingHasFinished();

    const titleElem = await testSubjects.find('createIndexPatternTitleInput');
    expect(await titleElem.getAttribute('value')).to.equal(dataView);
  };

  describe('Search source Alert', function () {
    // Failing in Observability projects: https://github.com/elastic/kibana/issues/203045
    // Failing in MKI Search projects: https://github.com/elastic/kibana/issues/207865
    this.tags(['skipSvlOblt', 'skipSvlSearch']);

    before(async () => {
      await security.testUser.setRoles(['discover_alert']);
      await PageObjects.svlCommonPage.loginAsAdmin();

      log.debug('create source indices');
      await createSourceIndex();

      log.debug('generate documents');
      await generateNewDocs(5);

      log.debug('create output index');
      await createOutputDataIndex();

      log.debug('create connector');
      connectorId = await createConnector();
    });

    after(async () => {
      // clean up what we can in case of failures in some tests which blocked the creation of the following objects
      try {
        await deleteIndexes([OUTPUT_DATA_VIEW, SOURCE_DATA_VIEW]);
      } catch {
        // continue
      }
      try {
        const [{ id: adhocRuleId }] = await getAlertsByName(ADHOC_RULE_NAME);
        await deleteAlerts([adhocRuleId]);
      } catch {
        // continue
      }
      try {
        await deleteDataView(outputDataViewId);
      } catch {
        // continue
      }
      try {
        await deleteConnector(connectorId);
      } catch {
        // continue
      }
      await security.testUser.restoreDefaults();
      await kibanaServer.savedObjects.cleanStandardList();
    });

    it('should create an alert when there is no data view', async () => {
      await openManagementAlertFlyout();

      log.debug('create data views');
      const sourceDataViewResponse = await createDataView(SOURCE_DATA_VIEW);
      const outputDataViewResponse = await createDataView(OUTPUT_DATA_VIEW);

      sourceDataViewId = sourceDataViewResponse.body.data_view.id;
      outputDataViewId = outputDataViewResponse.body.data_view.id;
    });

    it('should show time field validation error', async () => {
      await PageObjects.common.navigateToApp('discover');
      await PageObjects.discover.waitUntilSearchingHasFinished();
      await dataViews.switchToAndValidate(SOURCE_DATA_VIEW);
      await PageObjects.timePicker.setCommonlyUsedTime('Last_15 minutes');

      await openDiscoverAlertFlyout();
      await defineSearchSourceAlert(RULE_NAME);
      await testSubjects.click('selectDataViewExpression');

      await testSubjects.existOrFail('indexPattern-switcher--input');
      await testSubjects.click('indexPattern-switcher--input');
      const input = await find.activeElement();
      // search-source-alert-output index does not have time field
      await input.type('search-source-alert-o*');
      await testSubjects.existOrFail('explore-matching-indices-button');
      await testSubjects.click('explore-matching-indices-button');

      await retry.waitFor('selection to happen', async () => {
        const dataViewSelector = await testSubjects.find('selectDataViewExpression');
        return (await dataViewSelector.getVisibleText()) === 'DATA VIEW\nsearch-source-alert-o*';
      });

      await testSubjects.click('ruleFormStep-details');
      await toasts.dismissIfExists();
      await testSubjects.click('ruleFlyoutFooterSaveButton');

      await testSubjects.click('ruleFormStep-definition');
      const errorElem = await testSubjects.find('esQueryAlertExpressionError');
      const errorText = await errorElem.getVisibleText();
      expect(errorText).to.eql('Data view should have a time field.');
    });

    it('should navigate to alert results via view in app link', async () => {
      await testSubjects.click('selectDataViewExpression');
      await testSubjects.existOrFail('indexPattern-switcher--input');
      await testSubjects.click('indexPattern-switcher--input');
      if (await testSubjects.exists('clearSearchButton')) {
        await testSubjects.click('clearSearchButton');
        await testSubjects.missingOrFail('clearSearchButton');
      }
      const dataViewsElem = await testSubjects.find('euiSelectableList');
      const sourceDataViewOption = await dataViewsElem.findByCssSelector(
        `[title="${SOURCE_DATA_VIEW}"]`
      );
      await sourceDataViewOption.click();

      await retry.waitFor('selection to happen', async () => {
        const dataViewSelector = await testSubjects.find('selectDataViewExpression');
        return (await dataViewSelector.getVisibleText()) === `DATA VIEW\n${SOURCE_DATA_VIEW}`;
      });

      await testSubjects.click('ruleFormStep-details');
      await toasts.dismissIfExists();
      await testSubjects.click('ruleFlyoutFooterSaveButton');
      await retry.try(async () => {
        await testSubjects.missingOrFail('ruleFlyoutFooterSaveButton');
      });

      await PageObjects.header.waitUntilLoadingHasFinished();

      await openAlertRuleInManagement(RULE_NAME);
      await testSubjects.click('ruleDetails-viewInDiscover');
      await PageObjects.header.waitUntilLoadingHasFinished();

      await checkInitialRuleParamsState(SOURCE_DATA_VIEW, true);
    });

    it('should navigate to alert results via link provided in notification', async () => {
      await PageObjects.settings.refreshDataViewFieldList(OUTPUT_DATA_VIEW);
      await openAlertResults(RULE_NAME);
      await checkInitialRuleParamsState(SOURCE_DATA_VIEW);
    });

    it('should display prev rule state after params update on clicking prev generated link', async () => {
      await openAlertRuleInManagement(RULE_NAME);

      // change rule configuration
      await testSubjects.click('ruleActionsButton');
      await testSubjects.click('openEditRuleFlyoutButton');
      await queryBar.setQuery('message:msg-1');
      await filterBar.addFilter({ field: 'message.keyword', operation: 'is', value: 'msg-1' });

      await testSubjects.click('thresholdPopover');
      await testSubjects.setValue('alertThresholdInput0', '1');

      // Different save buttons in serverless
      if (await testSubjects.exists('saveEditedRuleButton')) {
        await testSubjects.click('saveEditedRuleButton');
      } else {
        await testSubjects.click('rulePageFooterSaveButton');
      }
      await PageObjects.header.waitUntilLoadingHasFinished();

      await openAlertResults(RULE_NAME);
      await checkInitialRuleParamsState(SOURCE_DATA_VIEW);
    });

    it('should display actual state after rule params update on clicking viewInApp link', async () => {
      await clickViewInApp(RULE_NAME);

      const selectedDataView = await dataViews.getSelectedName();
      expect(selectedDataView).to.be.equal(SOURCE_DATA_VIEW);

      await checkUpdatedRuleParamsState();
    });

    it('should display prev data view state after update on clicking prev generated link', async () => {
      await PageObjects.common.navigateToUrlWithBrowserHistory(
        'management',
        `/kibana/dataViews/dataView/${sourceDataViewId}`,
        undefined
      );
      await PageObjects.header.waitUntilLoadingHasFinished();

      // add source filter
      await testSubjects.click('tab-sourceFilters');
      await testSubjects.click('fieldFilterInput');
      const filtersInput = await find.activeElement();
      await filtersInput.type('message');
      await testSubjects.click('addFieldFilterButton');

      // change title
      await testSubjects.click('editIndexPatternButton');
      await PageObjects.header.waitUntilLoadingHasFinished();
      await retry.try(async () => {
        await PageObjects.settings.setIndexPatternField('search-s*');
      });
      await testSubjects.click('saveIndexPatternButton');
      await testSubjects.click('confirmModalConfirmButton');
      await PageObjects.header.waitUntilLoadingHasFinished();

      await openAlertResults(RULE_NAME);

      await checkInitialRuleParamsState(SOURCE_DATA_VIEW);
      await checkInitialDataViewState(SOURCE_DATA_VIEW);
    });

    it('should display actual data view state after update on clicking viewInApp link', async () => {
      await clickViewInApp(RULE_NAME);
      await checkUpdatedRuleParamsState();
      await checkUpdatedDataViewState('search-s*');
    });

    it('should navigate to alert results via link provided in notification using adhoc data view', async () => {
      await PageObjects.common.navigateToApp('discover');
      await PageObjects.discover.waitUntilSearchingHasFinished();
      await dataViews.createFromSearchBar({
        name: 'search-source-',
        adHoc: true,
        hasTimeField: true,
      });

      await PageObjects.timePicker.setCommonlyUsedTime('Last_15 minutes');
      await PageObjects.header.waitUntilLoadingHasFinished();
      await PageObjects.discover.addRuntimeField('runtime-message-field', `emit('mock-message')`);
      await retry.try(async () => {
        expect(await PageObjects.unifiedFieldList.getAllFieldNames()).to.contain(
          'runtime-message-field'
        );
      });

      // create an alert
      await openDiscoverAlertFlyout();
      await defineSearchSourceAlert('test-adhoc-alert');
      await testSubjects.click('ruleFormStep-details');
      await toasts.dismissIfExists();
      await testSubjects.click('ruleFlyoutFooterSaveButton');
      await retry.try(async () => {
        await testSubjects.missingOrFail('ruleFlyoutFooterSaveButton');
      });
      await PageObjects.header.waitUntilLoadingHasFinished();

      await openAlertResults(ADHOC_RULE_NAME);

      const selectedDataView = await dataViews.getSelectedName();
      expect(selectedDataView).to.be.equal('search-source-*');

      const documentCell = await dataGrid.getCellElementByColumnName(0, '_source');
      const firstRowContent = await documentCell.getVisibleText();
      expect(firstRowContent.includes('runtime-message-fieldmock-message')).to.be.equal(true);

      expect(await dataGrid.getDocCount()).to.be(5);
    });

    it('should navigate to alert results via view in app link using adhoc data view', async () => {
      // navigate to discover using view in app link
      await clickViewInApp(ADHOC_RULE_NAME);

      const selectedDataView = await dataViews.getSelectedName();
      expect(selectedDataView).to.be.equal('search-source-*');

      const documentCell = await dataGrid.getCellElementByColumnName(0, '_source');
      const firstRowContent = await documentCell.getVisibleText();
      expect(firstRowContent.includes('runtime-message-fieldmock-message')).to.be.equal(true);
    });

    it('should display results after data view removal on clicking prev generated link', async () => {
      await dataViews.switchToAndValidate(OUTPUT_DATA_VIEW);
      await deleteDataView(sourceDataViewId);

      await openAlertResults(RULE_NAME);

      await checkInitialRuleParamsState(SOURCE_DATA_VIEW);
      await checkInitialDataViewState(SOURCE_DATA_VIEW);
    });

    it('should not display results after data view removal on clicking viewInApp link', async () => {
      await clickViewInApp(RULE_NAME);

      expect(await toasts.getCount()).to.be.equal(1);
      const content = await toasts.getContentByIndex(1);
      expect(content).to.equal(
        `Error fetching search source\nCould not locate that data view (id: ${sourceDataViewId}), click here to re-create it`
      );
    });

    it('should display results after rule removal on following generated link', async () => {
      await dataViews.switchToAndValidate(OUTPUT_DATA_VIEW);
      const [{ id: firstAlertId }] = await getAlertsByName(RULE_NAME);
      await deleteAlerts([firstAlertId]);

      await openAlertResults(firstAlertId, 'id');

      await checkInitialRuleParamsState(SOURCE_DATA_VIEW);
      await checkInitialDataViewState(SOURCE_DATA_VIEW);
    });

    it('should check that there are no errors detected after an alert is created', async () => {
      try {
        await deleteDataView(SOURCE_DATA_VIEW);
      } catch {
        // continue
      }

      const newAlert = 'New Alert for checking its status';
      await createDataView(SOURCE_DATA_VIEW);

      // Navigation to Rule Management is different in Serverless
      await PageObjects.common.navigateToApp('management', {
        path: 'insightsAndAlerting/triggersActions',
      });
      await PageObjects.header.waitUntilLoadingHasFinished();

      await testSubjects.click('createRuleButton');
      await PageObjects.header.waitUntilLoadingHasFinished();

      await testSubjects.click('.es-query-SelectOption');
      await PageObjects.header.waitUntilLoadingHasFinished();

      await retry.waitFor('rule name value is correct', async () => {
        await testSubjects.setValue('ruleDetailsNameInput', newAlert);
        const ruleName = await testSubjects.getAttribute('ruleDetailsNameInput', 'value');

        return ruleName === newAlert;
      });

      await testSubjects.click('queryFormType_searchSource');
      await PageObjects.header.waitUntilLoadingHasFinished();

      await testSubjects.click('selectDataViewExpression');
      await testSubjects.click('indexPattern-switcher--input');
      if (await testSubjects.exists('clearSearchButton')) {
        await testSubjects.click('clearSearchButton');
      }
      const dataViewsElem = await testSubjects.find('euiSelectableList');
      const sourceDataViewOption = await dataViewsElem.findByCssSelector(
        `[title="${SOURCE_DATA_VIEW}"]`
      );
      await sourceDataViewOption.click();

      // TODO: Serverless O11y has a required "Role visibility" selector
      // https://github.com/elastic/kibana/issues/168034
      if (await testSubjects.exists('ruleFormConsumerSelect')) {
        await comboBox.set('ruleFormConsumerSelect', 'Stack Rules');
      }

      await testSubjects.click('ruleFormStep-details');
      // Save rule button is different in serverless
      if (await testSubjects.exists('ruleFlyoutFooterSaveButton')) {
        await testSubjects.click('ruleFlyoutFooterSaveButton');
      } else {
        await testSubjects.click('rulePageFooterSaveButton');
      }

      await retry.waitFor('confirmation modal', async () => {
        return await testSubjects.exists('confirmModalConfirmButton');
      });

      await testSubjects.click('confirmModalConfirmButton');

      await PageObjects.header.waitUntilLoadingHasFinished();

      await openAlertRuleInManagement(newAlert);

      await retry.waitFor('success status', async () => {
        await browser.refresh();
        await PageObjects.header.waitUntilLoadingHasFinished();

        return await testSubjects.exists('ruleStatus-ok');
      });
    });
  });
}
