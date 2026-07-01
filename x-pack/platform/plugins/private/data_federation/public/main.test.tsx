/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiProvider } from '@elastic/eui';
import { fireEvent, render, waitFor } from '@testing-library/react';

import type { HttpSetup, ToastsStart } from '@kbn/core/public';
import { DATA_SETS_LIST_ROUTE_PATH, DATA_SOURCES_LIST_ROUTE_PATH } from '../common';
import { mainTranslations } from './main_i18n';
import { Main } from './main';

const createToastsMock = (): ToastsStart =>
  ({
    addSuccess: jest.fn(),
    addDanger: jest.fn(),
  } as unknown as ToastsStart);

const createHttpMock = (): Pick<HttpSetup, 'get' | 'put' | 'delete'> => ({
  get: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
});

describe('Main', () => {
  it('defaults to the data sources tab when both lists are empty', async () => {
    const http = createHttpMock();
    (http.get as jest.Mock).mockImplementation(async (path: string) => {
      if (path === DATA_SOURCES_LIST_ROUTE_PATH) {
        return { data_sources: [] };
      }
      if (path === DATA_SETS_LIST_ROUTE_PATH) {
        return { data_sets: [] };
      }
      throw new Error(`Unexpected GET: ${path}`);
    });

    const { getByTestId, queryByTestId } = render(
      <EuiProvider>
        <Main httpClient={http as unknown as HttpSetup} toasts={createToastsMock()} />
      </EuiProvider>
    );

    // Starts on the sets tab, but should switch to sources once both requests complete.
    expect(queryByTestId('dataSetsCreateButton')).toBeNull();

    await waitFor(() => {
      expect(getByTestId('dataSetsCreateButton')).toBeInTheDocument();
    });
  });

  it('disables "Add dataset" when there are no data sources', async () => {
    const http = createHttpMock();
    (http.get as jest.Mock).mockImplementation(async (path: string) => {
      if (path === DATA_SOURCES_LIST_ROUTE_PATH) {
        return { data_sources: [] };
      }
      if (path === DATA_SETS_LIST_ROUTE_PATH) {
        return { data_sets: [] };
      }
      throw new Error(`Unexpected GET: ${path}`);
    });

    const { getByRole, getByTestId } = render(
      <EuiProvider>
        <Main httpClient={http as unknown as HttpSetup} toasts={createToastsMock()} />
      </EuiProvider>
    );

    // Wait until the tab auto-switch runs so we can reliably click from a stable state.
    await waitFor(() => {
      expect(getByTestId('dataSetsCreateButton')).toBeInTheDocument();
    });

    fireEvent.click(getByRole('tab', { name: mainTranslations.tabs.sets }));

    await waitFor(() => {
      expect(getByTestId('dataSetsSetsCreateButton')).toBeDisabled();
    });
  });
});
