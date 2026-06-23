/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { ToolingLog } from '@kbn/tooling-log';
import { chunk } from 'lodash';
import type { AlertStatus } from '@kbn/rule-data-utils';
import { ALERT_STATUS_ACTIVE, ALERT_STATUS_RECOVERED } from '@kbn/rule-data-utils';
import type { WebElementWrapper } from '@kbn/ftr-common-functional-ui-services';
import type { Agent as SuperTestAgent } from 'supertest';
import type { FtrProviderContext } from '../../../ftr_provider_context';

// Based on the x-pack/solutions/observability/test/fixtures/es_archives/observability/alerts archive.
const DATE_WITH_DATA = {
  rangeFrom: '2021-10-18T13:36:22.109Z',
  rangeTo: '2021-10-20T13:36:22.109Z',
};

const ALERTS_FLYOUT_SELECTOR = 'alertsFlyout';
const FILTER_FOR_VALUE_BUTTON_SELECTOR = 'filterForValue';
const ALERTS_TABLE_WITH_DATA_SELECTOR = 'alertsTableIsLoaded';
const ALERTS_TABLE_NO_DATA_SELECTOR = 'alertsTableEmptyState';
const ALERTS_TABLE_ERROR_PROMPT_SELECTOR = 'alertsTableErrorPrompt';
const ALERTS_TABLE_ACTIONS_MENU_SELECTOR = 'alertsTableActionsMenu';
const VIEW_RULE_DETAILS_SELECTOR = 'viewRuleDetails';
const VIEW_RULE_DETAILS_FLYOUT_SELECTOR = 'viewRuleDetailsFlyout';
const ALERTS_TABLE_LOADING_SELECTOR = 'internalAlertsPageLoading';

type WorkflowStatus = 'open' | 'acknowledged' | 'closed';

export function ObservabilityAlertsCommonProvider({
  getPageObjects,
  getService,
}: FtrProviderContext) {
  const find = getService('find');
  const testSubjects = getService('testSubjects');
  const flyoutService = getService('flyout');
  const retry = getService('retry');
  const toasts = getService('toasts');
  const kibanaServer = getService('kibanaServer');
  const retryOnStale = getService('retryOnStale');
  const pageObjects = getPageObjects(['common', 'header']);

  const navigateToTimeWithData = async () => {
    await pageObjects.common.navigateToUrlWithBrowserHistory(
      'observability',
      '/alerts',
      `?_a=(rangeFrom:'${DATE_WITH_DATA.rangeFrom}',rangeTo:'${DATE_WITH_DATA.rangeTo}')`,
      { ensureCurrentUrl: false }
    );
    await pageObjects.header.waitUntilLoadingHasFinished();
  };

  const navigateToRulesPage = async () => {
    return await pageObjects.common.navigateToUrlWithBrowserHistory('rules', '', '', {
      ensureCurrentUrl: false,
    });
  };

  const navigateToRulesLogsPage = async () => {
    return await pageObjects.common.navigateToUrlWithBrowserHistory('rules', '/logs', '', {
      ensureCurrentUrl: false,
    });
  };

  const navigateToAlertDetails = async (alertId: string) => {
    return await pageObjects.common.navigateToUrlWithBrowserHistory(
      'observability',
      `/alerts/${alertId}`,
      '',
      { ensureCurrentUrl: false }
    );
  };

  const navigateToRuleDetailsByRuleId = async (ruleId: string) => {
    return await pageObjects.common.navigateToUrlWithBrowserHistory(
      'rules',
      `rule/${encodeURIComponent(ruleId)}`,
      '?',
      {
        ensureCurrentUrl: false,
      }
    );
  };

  const navigateWithoutFilter = async () => {
    return await pageObjects.common.navigateToUrlWithBrowserHistory(
      'observability',
      '/alerts',
      `?`,
      { ensureCurrentUrl: false }
    );
  };

  const setKibanaTimeZoneToUTC = async () => {
    await kibanaServer.uiSettings.update({
      'dateFormat:tz': 'UTC',
    });
  };

  // Alert table
  const waitForAlertsTableLoadingToDisappear = async () => {
    await testSubjects.missingOrFail(ALERTS_TABLE_LOADING_SELECTOR, { timeout: 30_000 });
  };

  const waitForAlertTableToLoad = async () => {
    await waitForAlertsTableLoadingToDisappear();
    await retry.waitFor('alerts table to appear', async () => {
      return (
        (await testSubjects.exists(ALERTS_TABLE_NO_DATA_SELECTOR)) ||
        (await testSubjects.exists(ALERTS_TABLE_WITH_DATA_SELECTOR))
      );
    });
  };

  const getTableColumnHeaders = async () => {
    const table = await testSubjects.find(ALERTS_TABLE_WITH_DATA_SELECTOR);
    const tableHeaderRow = await testSubjects.findDescendant('dataGridHeader', table);
    const columnHeaders = await tableHeaderRow.findAllByXpath('./div');
    return columnHeaders;
  };

  const getTableCells = async () => {
    // NOTE: This isn't ideal, but EuiDataGrid doesn't really have the concept of "rows"
    return await testSubjects.findAll('dataGridRowCell');
  };

  const getAllDisabledCheckBoxInTable = async () => {
    return await find.allByCssSelector('.euiDataGridRowCell input[type="checkbox"]:disabled');
  };

  const getAllEnabledCheckBoxInTable = async () => {
    return await find.allByCssSelector('.euiDataGridRowCell input[type="checkbox"]:enabled');
  };

  const getTableCellsInRows = retryOnStale.wrap(async () => {
    const columnHeaders = await getTableColumnHeaders();
    if (columnHeaders.length <= 0) {
      return [];
    }
    const cells = await getTableCells();
    return chunk(cells, columnHeaders.length);
  });

  const getTableOrFail = async () => {
    return await testSubjects.existOrFail(ALERTS_TABLE_WITH_DATA_SELECTOR);
  };

  const ensureNoTableErrorPrompt = async () => {
    return await testSubjects.missingOrFail(ALERTS_TABLE_ERROR_PROMPT_SELECTOR);
  };

  const getNoDataPageOrFail = async () => {
    return await testSubjects.existOrFail('kbnNoDataPage');
  };

  const getNoDataStateOrFail = async () => {
    return await testSubjects.existOrFail('alertsTableEmptyState');
  };

  // Query Bar
  const getQueryBar = async () => {
    await retry.try(async () => {
      await testSubjects.existOrFail('queryInput');
    });
    return await testSubjects.find('queryInput');
  };

  const clearQueryBar = retryOnStale.wrap(async () => {
    return await (await getQueryBar()).clearValueWithKeyboard();
  });

  const typeInQueryBar = retryOnStale.wrap(async (query: string) => {
    return await (await getQueryBar()).type(query);
  });

  const clickOnQueryBar = retryOnStale.wrap(async () => {
    return await (await getQueryBar()).click();
  });

  const submitQuery = async (query: string) => {
    await typeInQueryBar(query);
    await testSubjects.click('querySubmitButton');
  };

  // Flyout
  const getReasonMessageLinkByIndex = async (index: number) => {
    const reasonMessageLinks = await find.allByCssSelector(
      '[data-test-subj="o11yGetRenderCellValueLink"]'
    );
    return reasonMessageLinks[index] || null;
  };

  const openAlertsFlyout = retryOnStale.wrap(async (index: number = 0) => {
    const reasonMessageLink = await getReasonMessageLinkByIndex(index);
    await reasonMessageLink.click();
    await retry.waitFor(
      'flyout open',
      async () => await testSubjects.exists(ALERTS_FLYOUT_SELECTOR, { timeout: 2500 })
    );
  });

  const getAlertsFlyout = async () => {
    return await testSubjects.find(ALERTS_FLYOUT_SELECTOR);
  };

  const getAlertsFlyoutOrFail = async () => {
    return await testSubjects.existOrFail(ALERTS_FLYOUT_SELECTOR);
  };

  const getAlertsFlyoutTitle = async () => {
    return await testSubjects.find('alertsFlyoutTitle');
  };

  const closeAlertsFlyout = async () => {
    return await flyoutService.close(ALERTS_FLYOUT_SELECTOR);
  };

  const getAlertsFlyoutViewInAppButtonOrFail = async () => {
    return await testSubjects.existOrFail('alertsFlyoutViewInAppButton');
  };

  const getAlertsFlyoutViewRuleDetailsLinkOrFail = async () => {
    return await testSubjects.existOrFail('viewRuleDetailsFlyout');
  };

  const getAlertsFlyoutDescriptionListTitles = retryOnStale.wrap(
    async (): Promise<WebElementWrapper[]> => {
      const flyout = await getAlertsFlyout();
      return await testSubjects.findAllDescendant('alertsFlyoutDescriptionListTitle', flyout);
    }
  );

  const getAlertsFlyoutDescriptionListDescriptions = retryOnStale.wrap(
    async (): Promise<WebElementWrapper[]> => {
      const flyout = await getAlertsFlyout();
      return await testSubjects.findAllDescendant('alertsFlyoutDescriptionListDescription', flyout);
    }
  );

  // Cell actions

  const filterForValueButtonExists = async () => {
    return await testSubjects.exists(FILTER_FOR_VALUE_BUTTON_SELECTOR);
  };

  const getFilterForValueButton = async () => {
    return await testSubjects.find(FILTER_FOR_VALUE_BUTTON_SELECTOR);
  };

  const openActionsMenuForRow = retryOnStale.wrap(async (rowIndex: number) => {
    const actionsOverflowButton = await getActionsButtonByIndex(rowIndex);
    await actionsOverflowButton.click();
    await testSubjects.existOrFail(ALERTS_TABLE_ACTIONS_MENU_SELECTOR);
  });

  const viewRuleDetailsButtonClick = async () => {
    await testSubjects.click(VIEW_RULE_DETAILS_SELECTOR);
  };

  const viewRuleDetailsLinkClick = async () => {
    await testSubjects.click(VIEW_RULE_DETAILS_FLYOUT_SELECTOR);
  };

  // Workflow status
  const setWorkflowStatusForRow = async (rowIndex: number, workflowStatus: WorkflowStatus) => {
    await openActionsMenuForRow(rowIndex);

    if (workflowStatus === 'closed') {
      await testSubjects.click('close-alert-status');
    } else {
      await testSubjects.click(`${workflowStatus}-alert-status`);
    }

    // wait for a confirmation toast (the css index is 1-based)
    await toasts.getElementByIndex(1);
    await toasts.dismissAll();
  };

  const setWorkflowStatusFilter = retryOnStale.wrap(async (workflowStatus: WorkflowStatus) => {
    await testSubjects.click(`workflowStatusFilterButton-${workflowStatus}`);
  });

  const getWorkflowStatusFilterValue = retryOnStale.wrap(async () => {
    const selectedWorkflowStatusButton = await find.byClassName('euiButtonGroupButton-isSelected');
    return await selectedWorkflowStatusButton.getVisibleText();
  });

  // Alert status
  const setAlertStatusFilter = async (alertStatus?: AlertStatus) => {
    let buttonSubject = 'alert-status-filter-show-all-button';
    if (alertStatus === ALERT_STATUS_ACTIVE) {
      buttonSubject = 'alert-status-filter-active-button';
    }
    if (alertStatus === ALERT_STATUS_RECOVERED) {
      buttonSubject = 'alert-status-filter-recovered-button';
    }

    await testSubjects.click(buttonSubject);
  };

  const selectAlertStatusFilter = async (alertStatus: AlertStatus) => {
    await testSubjects.click('optionsList-control-0');
    await testSubjects.click(`optionsList-control-selection-${alertStatus}`);
    await testSubjects.click('optionsList-control-0');
  };

  const alertDataHasLoaded = async () => {
    await retry.waitFor(
      'Alert Table is loaded',
      async () => await testSubjects.exists('alertsTableIsLoaded', { timeout: 2500 })
    );
  };

  // Date picker
  const getTimeRange = async () => {
    if (await testSubjects.exists('dateRangePickerControlButton', { timeout: 2000 })) {
      // New DateRangePicker renders the humanised range as the control button's
      // visible text (the `dateRangePickerValueDisplay` node), e.g. "Last 10 days"
      // or "30 days ago → 10 days ago". The button has no `value` attribute; the
      // raw range is only exposed via its `data-date-range` attribute.
      return await testSubjects.getVisibleText('dateRangePickerValueDisplay');
    }

    const isAbsoluteRange = await testSubjects.exists('superDatePickerstartDatePopoverButton');

    if (isAbsoluteRange) {
      const startText = await testSubjects.getVisibleText('superDatePickerstartDatePopoverButton');
      const endText = await testSubjects.getVisibleText('superDatePickerendDatePopoverButton');
      return `${startText} - ${endText}`;
    }

    return await testSubjects.getVisibleText('superDatePickerShowDatesButton');
  };

  const getActionsButtonByIndex = async (index: number) => {
    const actionsOverflowButtons = await find.allByCssSelector(
      '[data-test-subj="alertsTableRowActionMore"]'
    );
    return actionsOverflowButtons[index] || null;
  };

  const getRuleStatValue = retryOnStale.wrap(async (testSubj: string) => {
    const stat = await testSubjects.find(testSubj);
    const title = await stat.findByCssSelector('.euiStat__title');
    const count = await title.getVisibleText();
    const value = Number.parseInt(count, 10);
    expect(Number.isNaN(value)).to.be(false);
    return value;
  });

  // Data view
  const createDataView = async ({
    supertest,
    id,
    name,
    title,
    logger,
  }: {
    supertest: SuperTestAgent;
    id: string;
    name: string;
    title: string;
    logger: ToolingLog;
  }) => {
    const { body } = await supertest
      .post(`/api/content_management/rpc/create`)
      .set('kbn-xsrf', 'foo')
      .send({
        contentTypeId: 'index-pattern',
        data: {
          fieldAttrs: '{}',
          title,
          timeFieldName: '@timestamp',
          sourceFilters: '[]',
          fields: '[]',
          fieldFormatMap: '{}',
          typeMeta: '{}',
          runtimeFieldMap: '{}',
          name,
        },
        options: { id },
        version: 1,
      })
      .expect(200);

    logger.debug(`Created data view: ${JSON.stringify(body)}`);
    return body;
  };

  const deleteDataView = async ({
    supertest,
    id,
    logger,
  }: {
    supertest: SuperTestAgent;
    id: string;
    logger: ToolingLog;
  }) => {
    const { body } = await supertest
      .post(`/api/content_management/rpc/delete`)
      .set('kbn-xsrf', 'foo')
      .send({
        contentTypeId: 'index-pattern',
        id,
        options: { force: true },
        version: 1,
      })
      .expect(200);

    logger.debug(`Deleted data view id: ${id}`);
    return body;
  };

  return {
    getQueryBar,
    clearQueryBar,
    clickOnQueryBar,
    closeAlertsFlyout,
    filterForValueButtonExists,
    getAlertsFlyout,
    getAlertsFlyoutDescriptionListDescriptions,
    getAlertsFlyoutDescriptionListTitles,
    getAlertsFlyoutOrFail,
    getAlertsFlyoutTitle,
    getAlertsFlyoutViewInAppButtonOrFail,
    getAllDisabledCheckBoxInTable,
    getAllEnabledCheckBoxInTable,
    getFilterForValueButton,
    getNoDataPageOrFail,
    getNoDataStateOrFail,
    getTableCells,
    getTableCellsInRows,
    getTableColumnHeaders,
    getTableOrFail,
    waitForAlertTableToLoad,
    ensureNoTableErrorPrompt,
    navigateToTimeWithData,
    setKibanaTimeZoneToUTC,
    openAlertsFlyout,
    setWorkflowStatusForRow,
    setWorkflowStatusFilter,
    getWorkflowStatusFilterValue,
    setAlertStatusFilter,
    alertDataHasLoaded,
    submitQuery,
    typeInQueryBar,
    openActionsMenuForRow,
    getTimeRange,
    navigateWithoutFilter,
    getActionsButtonByIndex,
    viewRuleDetailsButtonClick,
    viewRuleDetailsLinkClick,
    getAlertsFlyoutViewRuleDetailsLinkOrFail,
    getRuleStatValue,
    navigateToRulesPage,
    navigateToRulesLogsPage,
    navigateToRuleDetailsByRuleId,
    navigateToAlertDetails,
    createDataView,
    deleteDataView,
    selectAlertStatusFilter,
  };
}
