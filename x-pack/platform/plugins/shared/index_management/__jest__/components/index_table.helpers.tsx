/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import { usageCollectionPluginMock } from '@kbn/usage-collection-plugin/public/mocks';

import {
  notificationServiceMock,
  executionContextServiceMock,
  chromeServiceMock,
  coreMock,
} from '@kbn/core/public/mocks';
import { KibanaRenderContextProvider } from '@kbn/react-kibana-context-render';
import { settingsServiceMock } from '@kbn/core-ui-settings-browser-mocks';
import type { AppDependencies } from '../../public/application/app_context';
import { AppContextProvider } from '../../public/application/app_context';
import type { Index } from '../../common';
import { BASE_PATH } from '../../common/constants';
import { AppWithoutRouter } from '../../public/application/app';
import { loadIndicesSuccess } from '../../public/application/store/actions';
import { breadcrumbService } from '../../public/application/services/breadcrumbs';
import { UiMetricService } from '../../public/application/services/ui_metric';
import { NotificationService } from '../../public/application/services/notification';
import { httpService } from '../../public/application/services/http';
import { setUiMetricService } from '../../public/application/services/api';
import { indexManagementStore } from '../../public/application/store';
import { setExtensionsService } from '../../public/application/store/selectors/extension_service';
import { ExtensionsService } from '../../public/services';

import { init as initHttpRequests } from '../client_integration/helpers/http_requests';
import { runPendingTimers } from '../helpers/fake_timers';

const createIndices = (): Index[] => {
  const indicesList: Index[] = [];

  // Keep this dataset intentionally small for test performance while still covering:
  // - pagination (page size 10, page 2)
  // - per-page selection to 50
  // - sorting
  // - hidden indices (.admin1, .admin3)
  // - lookup index presence
  const MAX_TESTY_INDEX = 29;

  const getBaseFakeIndex = (isOpen: boolean): Omit<Index, 'name'> =>
    ({
      health: isOpen ? 'green' : 'yellow',
      status: isOpen ? 'open' : 'closed',
      primary: 1,
      replica: 1,
      documents: 10000,
      documents_deleted: 100,
      size: '156kb',
      primary_size: '156kb',
    } as unknown as Omit<Index, 'name'>);

  for (let i = 0; i <= MAX_TESTY_INDEX; i++) {
    indicesList.push({
      ...(getBaseFakeIndex(true) as unknown as Index),
      name: `testy${i}`,
    });
    indicesList.push({
      ...(getBaseFakeIndex(false) as unknown as Index),
      name: `.admin${i}`,
      // Add 2 hidden indices in the list in position 3 & 7
      // note: for each loop iteration we add 2 indices
      hidden: i === 1 || i === 3 ? true : false, // ".admin1" and ".admin3" are the only hidden in 8.x
    } as unknown as Index);
  }

  indicesList.push({
    ...(getBaseFakeIndex(true) as unknown as Index),
    name: `lookup-index`,
    mode: 'lookup',
  } as unknown as Index);

  return indicesList;
};

export const indices = createIndices();

const urlServiceMock: AppDependencies['url'] = {
  locators: {
    get: () =>
      ({
        navigate: async () => {},
      } as unknown),
  },
} as unknown as AppDependencies['url'];

export const getNamesText = () => {
  return screen.getAllByTestId('indexTableIndexNameLink').map((el) => el.textContent || '');
};

export const getRowIndexByName = (indexName: string) => {
  return getNamesText().indexOf(indexName);
};

export const getStatusTextAtRow = (rowIndex: number) => {
  const statusCells = screen.getAllByTestId('indexTableCell-status');
  const cell = statusCells[rowIndex];
  return (cell?.textContent || '').trim();
};

export const openMenu = async (rowIndex: number) => {
  const checkboxes = screen.getAllByTestId('indexTableRowCheckbox');
  fireEvent.click(checkboxes[rowIndex]);

  const manageButton = await screen.findByTestId('indexActionsContextMenuButton');
  fireEvent.click(manageButton);

  return await screen.findByTestId('indexContextMenu');
};

export const openMenuAndClickOption = async (rowIndex: number, optionTestSubj: string) => {
  const menu = await openMenu(rowIndex);
  const option = within(menu).getByTestId(optionTestSubj);
  fireEvent.click(option);
};

export const clickRowCheckboxAtRowIndex = (rowIndex: number) => {
  const checkboxes = screen.getAllByTestId('indexTableRowCheckbox');
  const checkbox = checkboxes[rowIndex];

  if (!checkbox) {
    throw new Error(`Expected to find checkbox at row index ${rowIndex}`);
  }

  fireEvent.click(checkbox);
};

export const clickRowCheckboxByName = (indexName: string) => {
  const rowIndex = getRowIndexByName(indexName);

  if (rowIndex < 0) {
    throw new Error(`Expected index "${indexName}" to exist in the table`);
  }

  clickRowCheckboxAtRowIndex(rowIndex);
};

export const getRowIndicesByStatus = (statusText: string) => {
  const statusCells = screen.getAllByTestId('indexTableCell-status');
  return statusCells
    .map((cell, idx) => ({ idx, text: (cell.textContent || '').trim() }))
    .filter(({ text }) => text === statusText)
    .map(({ idx }) => idx);
};

export const openMenuAndGetButtonText = async (rowIndex: number) => {
  const menu = await openMenu(rowIndex);
  return within(menu)
    .getAllByRole('menuitem')
    .map((btn) => (btn.textContent || '').trim())
    .filter((t) => t.length > 0);
};

export const renderIndexApp = async (options?: {
  dependenciesOverride?: Record<string, unknown>;
  loadIndicesResponse?: unknown;
  reloadIndicesResponse?: unknown;
  delayResponse?: boolean;
}) => {
  const { dependenciesOverride, loadIndicesResponse, reloadIndicesResponse, delayResponse } =
    options || {};

  const { httpSetup, httpRequestsMockHelpers, setDelayResponse } = initHttpRequests();

  // For tests that need to observe intermediate in-flight UI states (e.g. "flushing..."),
  // delay HTTP promise resolution so the UI doesn't transition immediately.
  setDelayResponse(Boolean(delayResponse));

  httpRequestsMockHelpers.setLoadIndicesResponse(loadIndicesResponse ?? indices);
  httpRequestsMockHelpers.setReloadIndicesResponse(reloadIndicesResponse ?? indices);

  // Mock initialization of services
  const notifications = notificationServiceMock.createStartContract();
  const services: AppDependencies['services'] = {
    extensionsService: new ExtensionsService(),
    uiMetricService: new UiMetricService('index_management'),
    notificationService: new NotificationService(notifications.toasts),
    httpService,
  };
  services.uiMetricService.setup(usageCollectionPluginMock.createSetupContract());
  setExtensionsService(services.extensionsService);
  setUiMetricService(services.uiMetricService);

  httpService.setup(httpSetup);
  breadcrumbService.setup(() => undefined);

  const store = indexManagementStore(services);

  const appDependencies = {
    services,
    core: {
      getUrlForApp: () => {},
      executionContext: executionContextServiceMock.createStartContract(),
      chrome: chromeServiceMock.createStartContract(),
    },
    plugins: {
      reindexService: {},
    },
    url: urlServiceMock,
    // Default stateful configuration
    config: {
      enableLegacyTemplates: true,
      enableIndexActions: true,
      enableIndexStats: true,
    },
    settings: settingsServiceMock.createStartContract(),
    privs: {
      monitor: true,
      manageEnrich: true,
      monitorEnrich: true,
    },
  } as unknown as AppDependencies;

  store.dispatch(loadIndicesSuccess({ indices }));

  render(
    <KibanaRenderContextProvider {...coreMock.createStart()}>
      <I18nProvider>
        <Provider store={store}>
          <MemoryRouter initialEntries={[`${BASE_PATH}indices`]}>
            <AppContextProvider value={{ ...appDependencies, ...(dependenciesOverride || {}) }}>
              <AppWithoutRouter />
            </AppContextProvider>
          </MemoryRouter>
        </Provider>
      </I18nProvider>
    </KibanaRenderContextProvider>
  );

  await runPendingTimers();

  await screen.findByTestId('indexTable');

  return { httpSetup, httpRequestsMockHelpers };
};
