/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { fireEvent, render, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import React from 'react';

import { coreMock } from '@kbn/core/public/mocks';

import { APIKeysGridPage } from './api_keys_grid_page';
import { mockAuthenticatedUser } from '../../../../common/model/authenticated_user.mock';
import { securityMock } from '../../../mocks';
import { Providers } from '../api_keys_management_app';

/*
 * Note to engineers
 * we moved these 4 tests below to "x-pack/platform/test/functional/apps/api_keys/home_page.ts":
 * 1-"creates API key when submitting form, redirects back and displays base64"
 * 2-"creates API key with optional expiration, redirects back and displays base64"
 * 3-"deletes multiple api keys using bulk select"
 * 4-"deletes api key using cta button"
 * to functional tests to avoid flakyness
 */

describe('APIKeysGridPage', () => {
  // We are spying on the console.error to avoid react to throw error
  // in our test "displays error when fetching API keys fails"
  // since we are using EuiErrorBoundary and react will console.error any errors
  const consoleWarnMock = jest.spyOn(console, 'error').mockImplementation();

  let coreStart: ReturnType<typeof coreMock.createStart>;
  const { authc } = securityMock.createSetup();

  beforeEach(() => {
    coreStart = coreMock.createStart();
    coreStart.http.get.mockClear();
    coreStart.http.get.mockClear();
    coreStart.http.post.mockClear();
    authc.getCurrentUser.mockClear();

    coreStart.http.post.mockResolvedValue({
      apiKeys: [
        {
          type: 'rest',
          creation: 1571322182082,
          expiration: 1571408582082,
          id: '0QQZ2m0BO2XZwgJFuWTT',
          invalidated: false,
          name: 'first-api-key',
          realm: 'reserved',
          username: 'elastic',
          metadata: {},
          role_descriptors: {},
        },
        {
          type: 'rest',
          creation: 1571322182082,
          expiration: 1571408582082,
          id: 'BO2XZwgJFuWTT0QQZ2m0',
          invalidated: false,
          name: 'second-api-key',
          realm: 'reserved',
          username: 'elastic',
          metadata: {},
          role_descriptors: {},
        },
      ],
      canManageCrossClusterApiKeys: true,
      canManageApiKeys: true,
      canManageOwnApiKeys: true,
      total: 2,
      aggregationTotal: 2,
      aggregations: {
        usernames: {
          doc_count_error_upper_bound: 0,
          sum_other_doc_count: 0,
          buckets: [
            {
              key: 'elastic',
              doc_count: 4256,
            },
          ],
        },
        types: {
          doc_count_error_upper_bound: 0,
          sum_other_doc_count: 0,
          buckets: [
            {
              key: 'rest',
              doc_count: 2,
            },
          ],
        },
        expired: {
          doc_count: 0,
        },
        managed: {
          buckets: {
            metadataBased: {
              doc_count: 0,
            },
            namePrefixBased: {
              doc_count: 0,
            },
          },
        },
      },
    });

    authc.getCurrentUser.mockResolvedValue(
      mockAuthenticatedUser({
        username: 'elastic',
        full_name: '',
        email: '',
        enabled: true,
        roles: ['superuser'],
      })
    );
  });

  afterAll(() => {
    // Let's make sure we restore everything just in case
    consoleWarnMock.mockRestore();
  });

  it('loads and displays API keys', async () => {
    const history = createMemoryHistory({ initialEntries: ['/'] });

    coreStart.application.capabilities = {
      ...coreStart.application.capabilities,
      api_keys: {
        save: true,
      },
    };

    const { findByText, queryByTestId, getByText } = render(
      coreStart.rendering.addContext(
        <Providers services={coreStart} authc={authc} history={history}>
          <APIKeysGridPage />
        </Providers>
      )
    );

    expect(queryByTestId('apiKeysCreateTableButton')).not.toBeInTheDocument();

    expect(await findByText(/Loading API keys/)).not.toBeInTheDocument();

    await findByText(/first-api-key/);

    const secondKey = getByText(/second-api-key/).closest('td');
    const secondKeyEuiLink = secondKey!.querySelector('button');
    expect(secondKeyEuiLink).not.toBeNull();
    expect(secondKeyEuiLink!.getAttribute('data-test-subj')).toBe('apiKeyRowName-second-api-key');
  });

  it('displays callout when API keys are disabled', async () => {
    const history = createMemoryHistory({ initialEntries: ['/'] });

    coreStart.http.post.mockRejectedValueOnce({
      body: { message: 'disabled.feature="api_keys"' },
    });

    coreStart.application.capabilities = {
      ...coreStart.application.capabilities,
      api_keys: {
        save: true,
      },
    };

    const { findByText } = render(
      coreStart.rendering.addContext(
        <Providers services={coreStart} authc={authc} history={history}>
          <APIKeysGridPage />
        </Providers>
      )
    );

    expect(await findByText(/Loading API keys/)).not.toBeInTheDocument();
    await findByText(/API keys are disabled/);
  });

  it('displays error when user does not have required permissions', async () => {
    const history = createMemoryHistory({ initialEntries: ['/'] });

    coreStart.http.post.mockRejectedValueOnce({
      body: { statusCode: 403, message: 'forbidden' },
    });

    coreStart.application.capabilities = {
      ...coreStart.application.capabilities,
      api_keys: {
        save: true,
      },
    };

    const { findByText } = render(
      coreStart.rendering.addContext(
        <Providers services={coreStart} authc={authc} history={history}>
          <APIKeysGridPage />
        </Providers>
      )
    );

    expect(await findByText(/Loading API keys/)).not.toBeInTheDocument();
    await findByText(/You do not have permission to manage API keys/);
  });

  it('displays error when fetching API keys fails', async () => {
    coreStart.http.post.mockRejectedValueOnce({
      body: {
        error: 'Internal Server Error',
        message: 'Internal Server Error',
        statusCode: 500,
      },
    });
    const history = createMemoryHistory({ initialEntries: ['/'] });

    coreStart.application.capabilities = {
      ...coreStart.application.capabilities,
      api_keys: {
        save: true,
      },
    };

    const { findByText } = render(
      coreStart.rendering.addContext(
        <Providers services={coreStart} authc={authc} history={history}>
          <APIKeysGridPage />
        </Providers>
      )
    );

    expect(await findByText(/Loading API keys/)).not.toBeInTheDocument();
    await findByText(/Could not load API keys/);
  });

  describe('Read Only View', () => {
    beforeEach(() => {
      coreStart.http.post.mockResolvedValue({
        apiKeys: [],
        canManageCrossClusterApiKeys: false,
        canManageApiKeys: false,
        canManageOwnApiKeys: false,
        total: 0,
        aggregations: {},
        aggregationTotal: 0,
      });
    });

    it('should not display prompt `Create Button` when no API keys are shown', async () => {
      const history = createMemoryHistory({ initialEntries: ['/'] });

      coreStart.application.capabilities = {
        ...coreStart.application.capabilities,
        api_keys: {
          save: false,
        },
      };

      const { findByText, queryByText } = render(
        coreStart.rendering.addContext(
          <Providers services={coreStart} authc={authc} history={history}>
            <APIKeysGridPage />
          </Providers>
        )
      );
      expect(await findByText(/Loading API keys/)).not.toBeInTheDocument();
      expect(await findByText('You do not have permission to create API keys')).toBeInTheDocument();
      expect(queryByText('Create API key')).not.toBeInTheDocument();
    });
  });

  describe('Auto-select type filter', () => {
    const crossClusterOnlyResponse = {
      apiKeys: [],
      canManageCrossClusterApiKeys: true,
      canManageApiKeys: true,
      canManageOwnApiKeys: true,
      total: 0,
      aggregationTotal: 2,
      aggregations: {
        usernames: {
          doc_count_error_upper_bound: 0,
          sum_other_doc_count: 0,
          buckets: [{ key: 'elastic', doc_count: 2 }],
        },
        types: {
          doc_count_error_upper_bound: 0,
          sum_other_doc_count: 0,
          buckets: [{ key: 'cross_cluster', doc_count: 2 }],
        },
        expired: { doc_count: 0 },
        managed: {
          buckets: { metadataBased: { doc_count: 0 }, namePrefixBased: { doc_count: 0 } },
        },
      },
    };

    it('switches to cross-cluster tab on first load when the account has no REST keys', async () => {
      const history = createMemoryHistory({ initialEntries: ['/'] });
      coreStart.application.capabilities = {
        ...coreStart.application.capabilities,
        api_keys: { save: true },
      };
      coreStart.http.post.mockResolvedValue(crossClusterOnlyResponse);

      render(
        coreStart.rendering.addContext(
          <Providers services={coreStart} authc={authc} history={history}>
            <APIKeysGridPage />
          </Providers>
        )
      );

      // Initial load returns 0 REST keys → auto-select fires → second query with cross-cluster filter
      await waitFor(() => expect(coreStart.http.post).toHaveBeenCalledTimes(2));
      const secondCallOptions = coreStart.http.post.mock.calls[1][1] as { body: string };
      expect(JSON.parse(secondCallOptions.body).filters.type).toBe('cross_cluster');
    });

    it('stays on REST tab when the account already has REST keys', async () => {
      const history = createMemoryHistory({ initialEntries: ['/'] });
      coreStart.application.capabilities = {
        ...coreStart.application.capabilities,
        api_keys: { save: true },
      };
      // beforeEach mock returns two REST keys — no override needed

      const { findByText } = render(
        coreStart.rendering.addContext(
          <Providers services={coreStart} authc={authc} history={history}>
            <APIKeysGridPage />
          </Providers>
        )
      );

      await findByText(/first-api-key/);
      // Only the initial query; auto-select guard exits early because loadedApiKeys.length > 0
      expect(coreStart.http.post).toHaveBeenCalledTimes(1);
    });
  });

  describe('Post-create tab switch', () => {
    it('re-queries with the created key type so the new key is immediately visible', async () => {
      const history = createMemoryHistory({ initialEntries: ['/'] });
      coreStart.application.capabilities = {
        ...coreStart.application.capabilities,
        api_keys: { save: true },
      };

      // The flyout calls http.get('/api/security/role') on mount via useAsyncFn, which requires a
      // thenable return value. Without this, useAsyncFn throws `undefined.then is not a function`.
      coreStart.http.get.mockResolvedValue([]);

      // Intercept the create call; pass everything else through to the query mock from beforeEach
      coreStart.http.post.mockImplementation(async (url: string) => {
        if (url === '/internal/security/api_key') {
          return { id: 'new-id', name: 'my-new-key', api_key: 'test-key', encoded: 'dGVzdA==' };
        }
        return {
          apiKeys: [
            {
              type: 'rest',
              creation: 1571322182082,
              expiration: 1571408582082,
              id: '0QQZ2m0BO2XZwgJFuWTT',
              invalidated: false,
              name: 'first-api-key',
              realm: 'reserved',
              username: 'elastic',
              metadata: {},
              role_descriptors: {},
            },
          ],
          canManageCrossClusterApiKeys: true,
          canManageApiKeys: true,
          canManageOwnApiKeys: true,
          total: 1,
          aggregationTotal: 1,
          aggregations: {
            usernames: {
              doc_count_error_upper_bound: 0,
              sum_other_doc_count: 0,
              buckets: [{ key: 'elastic', doc_count: 1 }],
            },
            types: {
              doc_count_error_upper_bound: 0,
              sum_other_doc_count: 0,
              buckets: [{ key: 'rest', doc_count: 1 }],
            },
            expired: { doc_count: 0 },
            managed: {
              buckets: { metadataBased: { doc_count: 0 }, namePrefixBased: { doc_count: 0 } },
            },
          },
        };
      });

      const { findByTestId, findByText } = render(
        coreStart.rendering.addContext(
          <Providers services={coreStart} authc={authc} history={history}>
            <APIKeysGridPage />
          </Providers>
        )
      );

      // Wait for initial load so state.value is set before the flyout can render
      await findByText(/first-api-key/);

      // Navigate to the create route — the flyout only renders after state.value is defined
      history.push('/create');

      fireEvent.change(await findByTestId('apiKeyNameInput'), {
        target: { value: 'my-new-key' },
      });
      fireEvent.click(await findByTestId('formFlyoutSubmitButton'));

      await waitFor(() => {
        const queryCalls = (
          coreStart.http.post.mock.calls as Array<[string, { body: string }]>
        ).filter(([url]) => url === '/internal/security/api_key/_query');
        expect(queryCalls.length).toBeGreaterThanOrEqual(2);
        const postCreateBody = JSON.parse(queryCalls.at(-1)![1].body);
        expect(postCreateBody.filters.type).toBe('rest');
      });
    });
  });

  describe('Pagination', () => {
    it('should show disabled Previous button on first page', async () => {
      const history = createMemoryHistory({ initialEntries: ['/'] });

      coreStart.application.capabilities = {
        ...coreStart.application.capabilities,
        api_keys: {
          save: true,
        },
      };

      const { findByTestId } = render(
        coreStart.rendering.addContext(
          <Providers services={coreStart} authc={authc} history={history}>
            <APIKeysGridPage />
          </Providers>
        )
      );

      const previousButton = await findByTestId('apiKeysTablePreviousPageButton');
      expect(previousButton).toBeDisabled();
    });

    it('should show disabled Next button when results are less than page size', async () => {
      const history = createMemoryHistory({ initialEntries: ['/'] });

      coreStart.application.capabilities = {
        ...coreStart.application.capabilities,
        api_keys: {
          save: true,
        },
      };

      // Mock returns 2 items which is less than page size (25)
      const { findByTestId } = render(
        coreStart.rendering.addContext(
          <Providers services={coreStart} authc={authc} history={history}>
            <APIKeysGridPage />
          </Providers>
        )
      );

      const nextButton = await findByTestId('apiKeysTableNextPageButton');
      expect(nextButton).toBeDisabled();
    });

    it('should enable Next button when page is full and searchAfter cursor exists', async () => {
      const history = createMemoryHistory({ initialEntries: ['/'] });

      coreStart.application.capabilities = {
        ...coreStart.application.capabilities,
        api_keys: {
          save: true,
        },
      };

      // Create 25 API keys to fill the page
      const apiKeys = Array.from({ length: 25 }, (_, i) => ({
        type: 'rest',
        creation: 1571322182082,
        expiration: 1571408582082,
        id: `key-${i}`,
        invalidated: false,
        name: `api-key-${i}`,
        realm: 'reserved',
        username: 'elastic',
        metadata: {},
        role_descriptors: {},
      }));

      coreStart.http.post.mockResolvedValue({
        apiKeys,
        canManageCrossClusterApiKeys: true,
        canManageApiKeys: true,
        canManageOwnApiKeys: true,
        total: 100,
        aggregationTotal: 100,
        searchAfter: [1571322182082, 'key-24'],
        aggregations: {
          usernames: { buckets: [{ key: 'elastic', doc_count: 100 }] },
          types: { buckets: [{ key: 'rest', doc_count: 100 }] },
          expired: { doc_count: 0 },
          managed: {
            buckets: { metadataBased: { doc_count: 0 }, namePrefixBased: { doc_count: 0 } },
          },
        },
      });

      const { findByTestId } = render(
        coreStart.rendering.addContext(
          <Providers services={coreStart} authc={authc} history={history}>
            <APIKeysGridPage />
          </Providers>
        )
      );

      const nextButton = await findByTestId('apiKeysTableNextPageButton');
      expect(nextButton).not.toBeDisabled();
    });

    it('should refresh data when clicking Refresh button', async () => {
      const history = createMemoryHistory({ initialEntries: ['/'] });

      coreStart.application.capabilities = {
        ...coreStart.application.capabilities,
        api_keys: {
          save: true,
        },
      };

      const { findByTestId } = render(
        coreStart.rendering.addContext(
          <Providers services={coreStart} authc={authc} history={history}>
            <APIKeysGridPage />
          </Providers>
        )
      );

      // Wait for initial load
      await findByTestId('apiKeysTableRefreshButton');

      // Clear mock call count
      coreStart.http.post.mockClear();

      // Click refresh button
      const refreshButton = await findByTestId('apiKeysTableRefreshButton');
      fireEvent.click(refreshButton);

      // Verify that the API was called again
      await waitFor(() => {
        expect(coreStart.http.post).toHaveBeenCalledWith(
          '/internal/security/api_key/_query',
          expect.any(Object)
        );
      });
    });
  });
});
