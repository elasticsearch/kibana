/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ScoutPage, ScoutTestFixtures } from '@kbn/scout';
import {
  addFieldColumn,
  changeVisShape,
  createDataViewFromSearchBar,
  saveDiscoverSession,
} from './helpers';
import { AD_HOC_TAB, ESQL_TAB, PERSISTED_TAB } from './discover_session_test_data';

export const createMultiTabDiscoverSession = async (
  pageObjects: ScoutTestFixtures['pageObjects'],
  page: ScoutPage,
  sessionName: string
) => {
  const { discover, datePicker, queryBar, unifiedTabs } = pageObjects;

  await datePicker.setAbsoluteRange(PERSISTED_TAB.time);
  await queryBar.setQuery(PERSISTED_TAB.query);
  await discover.submitQuery();
  await discover.waitUntilTabIsLoaded();
  await addFieldColumn(page, PERSISTED_TAB.column1);
  await unifiedTabs.editTabLabel(0, PERSISTED_TAB.label);
  await discover.setChartInterval(PERSISTED_TAB.chartIntervalTitle);

  await unifiedTabs.createNewTab();
  await discover.waitUntilTabIsLoaded();
  await datePicker.setAbsoluteRange(AD_HOC_TAB.time);
  await createDataViewFromSearchBar(page, {
    name: 'logs',
    adHoc: true,
    hasTimeField: true,
  });
  await discover.waitUntilTabIsLoaded();
  await queryBar.setQuery(AD_HOC_TAB.query);
  await discover.submitQuery();
  await discover.waitUntilTabIsLoaded();
  await addFieldColumn(page, AD_HOC_TAB.column1);
  await unifiedTabs.editTabLabel(1, AD_HOC_TAB.label);

  await unifiedTabs.createNewTab();
  await discover.waitUntilTabIsLoaded();
  await datePicker.setAbsoluteRange(ESQL_TAB.time);
  await discover.writeAndSubmitEsqlQuery(ESQL_TAB.query);
  await changeVisShape(page, ESQL_TAB.visShape);
  await unifiedTabs.editTabLabel(2, ESQL_TAB.label);

  await unifiedTabs.selectTab(0);
  await saveDiscoverSession(page, sessionName, { storeTimeRange: true });
};
