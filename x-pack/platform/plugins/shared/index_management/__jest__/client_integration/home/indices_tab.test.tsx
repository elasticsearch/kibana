/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Mocking EuiSearchBar because its onChange is not firing during tests
 */
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { httpServiceMock } from '@kbn/core/public/mocks';
import { APP_HEADER_TEST_SUBJECTS } from '@kbn/app-header';

import type { Index } from '../../../common';
import { API_BASE_PATH, INTERNAL_API_BASE_PATH } from '../../../common';
import { setupEnvironment } from '../helpers/setup_environment';
import { renderHome } from '../helpers/render_home';
import { httpService } from '../../../public/application/services/http';
import { indexDataEnricher } from '../../../public/services';
import {
  createIndexTableActions,
  createCreateIndexActions,
  createDataStreamActions,
} from '../helpers/actions/index_table_actions';
import {
  createDataStreamBackingIndex,
  createDataStreamPayload,
  createNonDataStreamIndex,
} from '../helpers/actions/data_stream_actions';

import {
  breadcrumbService,
  IndexManagementBreadcrumb,
} from '../../../public/application/services/breadcrumbs';

jest.mock('react-use/lib/useObservable', () => () => jest.fn());

describe('<IndexManagementHome />', () => {
  let httpSetup: ReturnType<typeof setupEnvironment>['httpSetup'];
  let httpRequestsMockHelpers: ReturnType<typeof setupEnvironment>['httpRequestsMockHelpers'];
  jest.spyOn(breadcrumbService, 'setBreadcrumbs');

  beforeEach(() => {
    jest.clearAllMocks();
    const mockEnvironment = setupEnvironment();
    httpService.setup(httpServiceMock.createSetupContract());
    httpRequestsMockHelpers = mockEnvironment.httpRequestsMockHelpers;
    httpSetup = mockEnvironment.httpSetup;
  });

  describe('on component mount', () => {
    beforeEach(async () => {
      httpRequestsMockHelpers.setLoadIndicesResponse([]);

      await renderHome(httpSetup);

      await screen.findByTestId('createIndexMessage');
    });

    test('updates the breadcrumbs to indices', () => {
      expect(breadcrumbService.setBreadcrumbs).toHaveBeenLastCalledWith(
        IndexManagementBreadcrumb.indices
      );
    });

    test('toggles the include hidden button through URL hash correctly', () => {
      const actions = createIndexTableActions();
      expect(actions.getIncludeHiddenIndicesToggleStatus()).toBe(true);
      actions.clickIncludeHiddenIndicesToggle();
      expect(actions.getIncludeHiddenIndicesToggleStatus()).toBe(false);
      // Note: this test modifies the shared location.hash state, we put it back the way it was
      actions.clickIncludeHiddenIndicesToggle();
      expect(actions.getIncludeHiddenIndicesToggleStatus()).toBe(true);
    });
  });

  describe('data stream column', () => {
    beforeEach(async () => {
      httpRequestsMockHelpers.setLoadIndicesResponse([
        createDataStreamBackingIndex('data-stream-index', 'dataStream1'),
        createNonDataStreamIndex('no-data-stream-index'),
      ]);

      // The detail panel should still appear even if there are no data streams.
      httpRequestsMockHelpers.setLoadDataStreamsResponse([]);

      httpRequestsMockHelpers.setLoadDataStreamResponse(
        'dataStream1',
        createDataStreamPayload({ name: 'dataStream1' })
      );

      await renderHome(httpSetup);

      await screen.findByTestId('indexTable');
    });

    test('navigates to the data stream in the Data Streams tab', async () => {
      const tableActions = createIndexTableActions();
      const dsActions = createDataStreamActions();

      expect(tableActions.dataStreamLinkExistsAt(0)).toBeTruthy();
      await tableActions.clickDataStreamAt(0);

      await screen.findByTestId('dataStreamDetailPanel');
      expect(dsActions.findDataStreamDetailPanel()).toBeInTheDocument();
      expect(dsActions.findDataStreamDetailPanelTitle()).toBe('dataStream1');
    });

    test(`doesn't show data stream link if the index doesn't have a data stream`, () => {
      const tableActions = createIndexTableActions();
      expect(tableActions.dataStreamLinkExistsAt(1)).toBeFalsy();
    });
  });

  it('navigates to the index details page when the index name is clicked', async () => {
    const indexName = 'testIndex';
    httpRequestsMockHelpers.setLoadIndicesResponse([createNonDataStreamIndex(indexName)]);
    httpRequestsMockHelpers.setLoadIndexDetailsResponse(
      indexName,
      createNonDataStreamIndex(indexName)
    );

    await renderHome(httpSetup);

    await screen.findByTestId('indexTable');

    const tableActions = createIndexTableActions();
    await tableActions.clickIndexNameAt(0);

    expect(await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.title)).toHaveTextContent(indexName);
  });

  it('index page works with % character in index name', async () => {
    const indexName = 'test%';
    httpRequestsMockHelpers.setLoadIndicesResponse([createNonDataStreamIndex(indexName)]);
    httpRequestsMockHelpers.setLoadIndexDetailsResponse(
      encodeURIComponent(indexName),
      createNonDataStreamIndex(indexName)
    );

    await renderHome(httpSetup);

    await screen.findByTestId('indexTable');

    const tableActions = createIndexTableActions();
    await tableActions.clickIndexNameAt(0);

    expect(await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.title)).toHaveTextContent(indexName);
    expect(httpSetup.get).toHaveBeenCalledWith(
      `${INTERNAL_API_BASE_PATH}/indices/${encodeURIComponent(indexName)}`,
      expect.anything()
    );
  });

  describe('empty list component', () => {
    beforeEach(async () => {
      httpRequestsMockHelpers.setLoadIndicesResponse([]);

      await renderHome(httpSetup);

      await screen.findByTestId('createIndexMessage');
    });

    test('renders the default empty list content', () => {
      expect(screen.getByTestId('createIndexMessage')).toBeInTheDocument();
    });

    it('renders "no indices found" prompt for search', async () => {
      const searchInput = screen.getByTestId('indicesSearch');
      fireEvent.change(searchInput, { target: { value: 'non-existing-index' } });

      await screen.findByTestId('noIndicesMessage');
      expect(screen.getByTestId('noIndicesMessage')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('clearIndicesSearch'));

      await waitFor(() => {
        expect(screen.queryByTestId('noIndicesMessage')).not.toBeInTheDocument();
      });
    });
  });

  describe('index actions', () => {
    const indexNameA = 'testIndexA';
    const indexNameB = 'testIndexB';
    const indexMockA = createNonDataStreamIndex(indexNameA);
    const indexMockB = createNonDataStreamIndex(indexNameB);

    beforeEach(async () => {
      httpRequestsMockHelpers.setLoadIndicesResponse([
        {
          ...indexMockA,
          isFrozen: true,
        },
        {
          ...indexMockB,
          status: 'closed',
        },
      ]);
      httpRequestsMockHelpers.setReloadIndicesResponse({ indexNames: [indexNameA, indexNameB] });

      await renderHome(httpSetup);

      await screen.findByTestId('indexTable');

      // Select first index
      const tableActions = createIndexTableActions();
      await tableActions.selectIndexAt(0);
    });

    test('should be able to refresh index', async () => {
      const actions = createIndexTableActions();

      await actions.clickManageContextMenuButton();
      await actions.clickContextMenuOption('refreshIndexMenuButton');

      expect(httpSetup.post).toHaveBeenCalledWith(
        `${API_BASE_PATH}/indices/refresh`,
        expect.anything()
      );
      await waitFor(() => {
        expect(httpSetup.post).toHaveBeenCalledWith(
          `${API_BASE_PATH}/indices/reload`,
          expect.anything()
        );
      });
    });

    test('should be able to close an open index', async () => {
      const actions = createIndexTableActions();

      await actions.clickManageContextMenuButton();
      await actions.clickContextMenuOption('closeIndexMenuButton');

      // After the index is closed, we immediately do a reload. So we need to expect to see
      // a reload server call also.
      expect(httpSetup.post).toHaveBeenCalledWith(
        `${API_BASE_PATH}/indices/close`,
        expect.anything()
      );
      await waitFor(() => {
        expect(httpSetup.post).toHaveBeenCalledWith(
          `${API_BASE_PATH}/indices/reload`,
          expect.anything()
        );
      });
    });

    test('should be able to open a closed index', async () => {
      const actions = createIndexTableActions();
      // Select the closed index (second one) - table already rendered from beforeEach
      await actions.selectIndexAt(1);

      await actions.clickManageContextMenuButton();
      await actions.clickContextMenuOption('openIndexMenuButton');

      // After the index is opened, we immediately do a reload. So we need to expect to see
      // a reload server call also.
      expect(httpSetup.post).toHaveBeenCalledWith(
        `${API_BASE_PATH}/indices/open`,
        expect.anything()
      );
      await waitFor(() => {
        expect(httpSetup.post).toHaveBeenCalledWith(
          `${API_BASE_PATH}/indices/reload`,
          expect.anything()
        );
      });
    });

    test('should be able to flush index', async () => {
      const actions = createIndexTableActions();

      await actions.clickManageContextMenuButton();
      await actions.clickContextMenuOption('flushIndexMenuButton');

      // After the index is flushed, we immediately do a reload. So we need to expect to see
      // a reload server call also.
      expect(httpSetup.post).toHaveBeenCalledWith(
        `${API_BASE_PATH}/indices/flush`,
        expect.anything()
      );
      await waitFor(() => {
        expect(httpSetup.post).toHaveBeenCalledWith(
          `${API_BASE_PATH}/indices/reload`,
          expect.anything()
        );
      });
    });

    test("should be able to clear an index's cache", async () => {
      const actions = createIndexTableActions();

      await actions.clickManageContextMenuButton();
      await actions.clickContextMenuOption('clearCacheIndexMenuButton');

      // After the index cache is cleared, we immediately do a reload. So we need to expect to see
      // a reload server call also.
      expect(httpSetup.post).toHaveBeenCalledWith(
        `${API_BASE_PATH}/indices/clear_cache`,
        expect.anything()
      );
      await waitFor(() => {
        expect(httpSetup.post).toHaveBeenCalledWith(
          `${API_BASE_PATH}/indices/reload`,
          expect.anything()
        );
      });
    });

    test('should be able to force merge an index', async () => {
      const actions = createIndexTableActions();

      httpRequestsMockHelpers.setReloadIndicesResponse([{ ...indexMockA, isFrozen: false }]);

      // Open context menu
      await actions.clickManageContextMenuButton();
      // Check that the force merge action exists for the current index and merge it
      expect(screen.queryByTestId('forcemergeIndexMenuButton')).toBeInTheDocument();
      await actions.clickContextMenuOption('forcemergeIndexMenuButton');

      await actions.clickModalConfirm();

      // After the index force merged, we immediately do a reload. So we need to expect to see
      // a reload server call also.
      expect(httpSetup.post).toHaveBeenCalledWith(
        `${API_BASE_PATH}/indices/forcemerge`,
        expect.anything()
      );
      await waitFor(() => {
        expect(httpSetup.post).toHaveBeenCalledWith(
          `${API_BASE_PATH}/indices/reload`,
          expect.anything()
        );
      });
    });
  });

  describe('Index stats', () => {
    const indexName = 'test';

    // Note: No beforeEach render here - each test manages its own render
    // to avoid double-render issues with different configs

    test('renders the table column with all index stats when enableIndexStats is true', async () => {
      httpRequestsMockHelpers.setLoadIndicesResponse([createNonDataStreamIndex(indexName)]);

      await renderHome(httpSetup);

      await screen.findByTestId('indexTable');

      // Verify index name is rendered
      expect(screen.getByTestId('indexTableCell-name')).toHaveTextContent('test');

      // Verify stats columns are rendered (health, status are only shown when enableIndexStats is true)
      expect(screen.getByTestId('indexTableCell-health')).toBeInTheDocument();
      expect(screen.getByTestId('indexTableCell-status')).toHaveTextContent('open');
      expect(screen.getByTestId('indexTableCell-primary')).toHaveTextContent('1');
      expect(screen.getByTestId('indexTableCell-replica')).toHaveTextContent('1');
      expect(screen.getByTestId('indexTableCell-documents')).toBeInTheDocument();
      expect(screen.getByTestId('indexTableCell-size')).toHaveTextContent('156.00 KB');
    });

    test('renders only size and docs count when enableIndexStats is false, enableSizeAndDocCount is true', async () => {
      httpRequestsMockHelpers.setLoadIndicesResponse([createNonDataStreamIndex(indexName)]);

      await renderHome(httpSetup, {
        appServicesContext: {
          config: {
            enableLegacyTemplates: true,
            enableIndexActions: true,
            enableIndexStats: false,
            enableSizeAndDocCount: true,
          },
        },
      });

      await screen.findByTestId('indexTable');

      // Name should always be shown
      expect(screen.getByTestId('indexTableCell-name')).toHaveTextContent('test');
      // Size and docs should be shown
      expect(screen.getByTestId('indexTableCell-documents')).toBeInTheDocument();
      expect(screen.getByTestId('indexTableCell-size')).toHaveTextContent('156.00 KB');
      // Health, status, primary, replica should NOT be shown (enableIndexStats is false)
      expect(screen.queryByTestId('indexTableCell-health')).not.toBeInTheDocument();
      expect(screen.queryByTestId('indexTableCell-status')).not.toBeInTheDocument();
    });

    test('renders no index stats when enableIndexStats is false, enableSizeAndDocCount is false', async () => {
      httpRequestsMockHelpers.setLoadIndicesResponse([createNonDataStreamIndex(indexName)]);

      await renderHome(httpSetup, {
        appServicesContext: {
          config: {
            enableLegacyTemplates: true,
            enableIndexActions: true,
            enableIndexStats: false,
            enableSizeAndDocCount: false,
          },
        },
      });

      await screen.findByTestId('indexTable');

      // Name should always be shown
      expect(screen.getByTestId('indexTableCell-name')).toHaveTextContent('test');
      // No stats columns should be shown
      expect(screen.queryByTestId('indexTableCell-health')).not.toBeInTheDocument();
      expect(screen.queryByTestId('indexTableCell-status')).not.toBeInTheDocument();
      expect(screen.queryByTestId('indexTableCell-documents')).not.toBeInTheDocument();
      expect(screen.queryByTestId('indexTableCell-size')).not.toBeInTheDocument();
    });

    test('shows a warning callout when an index enricher fails', async () => {
      httpRequestsMockHelpers.setLoadIndicesResponse([createNonDataStreamIndex(indexName)]);
      const originalEnrichers = [...indexDataEnricher.enrichers];
      indexDataEnricher.add({
        name: 'test enricher',
        fn: async () => ({ source: 'test enricher', error: true }),
      });

      try {
        await renderHome(httpSetup);

        await screen.findByTestId('indexTable');
        expect(screen.getByTestId('indexTableCell-name')).toHaveTextContent('test');

        const callout = await screen.findByTestId('indicesEnrichmentErrorCallout');
        expect(callout).toHaveTextContent('test enricher');
      } finally {
        // Restore enrichers to avoid polluting other tests.
        (indexDataEnricher as any)._enrichers.length = 0;
        originalEnrichers.forEach((enricher) => indexDataEnricher.add(enricher));
      }
    });
  });

  describe('Create Index', () => {
    const indexNameA = 'test-index-a';
    const indexNameB = 'test-index-b';
    const indexMockA = createNonDataStreamIndex(indexNameA);

    beforeEach(async () => {
      httpRequestsMockHelpers.setLoadIndicesResponse([
        {
          ...indexMockA,
        },
      ]);

      await renderHome(httpSetup);

      await screen.findByTestId('indexTable');
    });

    test('shows the create index button', async () => {
      expect(screen.getByTestId('createIndexButton')).toBeInTheDocument();
    });

    test('can open & close the create index modal', async () => {
      const actions = createCreateIndexActions();

      await actions.clickCreateIndexButton();

      expect(screen.getByTestId('createIndexNameFieldText')).toBeInTheDocument();

      await actions.clickCreateIndexCancelButton();

      await waitFor(() => {
        expect(screen.queryByTestId('createIndexNameFieldText')).not.toBeInTheDocument();
      });
    });

    test('creating an index', async () => {
      const actions = createCreateIndexActions();

      expect(httpSetup.get).toHaveBeenCalledTimes(1);
      expect(httpSetup.get).toHaveBeenNthCalledWith(
        1,
        '/api/index_management/indices_get',
        expect.anything()
      );

      await actions.clickCreateIndexButton();

      expect(screen.getByTestId('createIndexNameFieldText')).toBeInTheDocument();
      actions.setIndexName(indexNameB);

      await actions.selectIndexMode('indexModeLookupOption');

      await actions.clickCreateIndexSaveButton();

      // Saves the index with expected name
      await waitFor(() => {
        expect(httpSetup.put).toHaveBeenCalledWith(`${INTERNAL_API_BASE_PATH}/indices/create`, {
          body: '{"indexName":"test-index-b","indexMode":"lookup"}',
        });
      });
      // It refreshes indices after saving; wait so the table's async state update settles (avoids act warnings).
      await waitFor(() => {
        expect(httpSetup.get).toHaveBeenCalledTimes(2);
        expect(httpSetup.get).toHaveBeenNthCalledWith(
          2,
          '/api/index_management/indices_get',
          expect.anything()
        );
      });

      // Creating triggers modal state updates; wait for modal to close so updates don't land after test end.
      await waitFor(() => {
        expect(screen.queryByTestId('createIndexNameFieldText')).not.toBeInTheDocument();
      });
    });
  });

  describe('extensions service', () => {
    it('displays an empty list content if set via extensions service', async () => {
      httpRequestsMockHelpers.setLoadIndicesResponse([]);
      await renderHome(httpSetup, {
        appServicesContext: {
          services: {
            extensionsService: {
              _emptyListContent: {
                renderContent: () => {
                  return <div>Empty list content</div>;
                },
              },
            },
          },
        },
      });

      expect(await screen.findByText('Empty list content')).toBeInTheDocument();
    });

    it('renders additional columns registered via extensions service', async () => {
      httpRequestsMockHelpers.setLoadIndicesResponse([
        {
          ...createNonDataStreamIndex('test-index'),
          ilm: {
            phase: 'hot phase',
            managed: true,
          },
        },
      ]);
      await renderHome(httpSetup, {
        appServicesContext: {
          services: {
            extensionsService: {
              _columns: [
                {
                  fieldName: 'ilm.phase',
                  label: 'ILM column 1',
                  order: 55,
                },
                {
                  fieldName: 'ilm.managed',
                  label: 'ILM column 2',
                  order: 56,
                  render: (index: Index) => {
                    if (index.ilm?.managed) {
                      return <div>ILM managed</div>;
                    }
                  },
                },
              ],
            },
          },
        },
      });

      await screen.findByTestId('indexTable');

      expect(screen.getByText('ILM column 1')).toBeInTheDocument();
      expect(screen.getByText('hot phase')).toBeInTheDocument();
      expect(screen.getByText('ILM column 2')).toBeInTheDocument();
      expect(screen.getByText('ILM managed')).toBeInTheDocument();
    });

    it('applies enricher updates to indices via alias when applyToAliases is true', async () => {
      const indexName = 'concrete-index';
      const aliasName = 'my-alias';

      httpRequestsMockHelpers.setLoadIndicesResponse([
        { ...createNonDataStreamIndex(indexName), aliases: [aliasName] },
      ]);

      const originalEnrichers = [...indexDataEnricher.enrichers];
      indexDataEnricher.add({
        name: 'alias enricher',
        fn: async () => ({
          source: 'alias enricher',
          applyToAliases: true,
          indices: [{ name: aliasName, isRollupIndex: true }],
        }),
      });

      try {
        await renderHome(httpSetup, {
          appServicesContext: {
            services: {
              extensionsService: {
                _columns: [
                  {
                    fieldName: 'isRollupIndex',
                    label: 'Rollup flag',
                    order: 999,
                    render: (index: Index) => (index.isRollupIndex ? <div>ROLLUP</div> : null),
                  },
                ],
              },
            },
          },
        });

        await screen.findByTestId('indexTable');
        expect(await screen.findByText('ROLLUP')).toBeInTheDocument();
      } finally {
        // Restore enrichers to avoid polluting other tests.
        (indexDataEnricher as any)._enrichers.length = 0;
        originalEnrichers.forEach((enricher) => indexDataEnricher.add(enricher));
      }
    });
  });
});
