/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  screen,
  fireEvent,
  within,
  waitFor,
  waitForElementToBeRemoved,
} from '@testing-library/react';
import { httpServiceMock } from '@kbn/core/public/mocks';
import { EuiTableTestHarness } from '@kbn/test-eui-helpers';
import { httpService } from '../../../public/application/services/http';

import {
  breadcrumbService,
  IndexManagementBreadcrumb,
} from '../../../public/application/services/breadcrumbs';
import { API_BASE_PATH, MAX_DATA_RETENTION } from '../../../common/constants';
import * as fixtures from '../../../test/fixtures';
import { setupEnvironment } from '../helpers/setup_environment';
import { renderHome } from '../helpers/render_home';

import {
  createDataStreamTabActions,
  createDataStreamDetailPanelActions,
  createDataRetentionFormActions,
  createDataStreamPayload,
  createDataStreamBackingIndex,
  createNonDataStreamIndex,
  getTableCellsValues,
} from '../helpers/actions/data_stream_actions';
import { closeViewFilterPopoverIfOpen } from '../helpers/actions/popover_cleanup';

jest.mock('react-use/lib/useObservable', () => () => jest.fn());

const nonBreakingSpace = ' ';

const getRedirectUrl = jest.fn(() => '/app/path');

const urlServiceMock = {
  locators: {
    get: () => ({
      getLocation: async () => ({
        app: '',
        path: '',
        state: {},
      }),
      getUrl: async ({ policyName }: { policyName: string }) => `/test/${policyName}`,
      getRedirectUrl,
      navigate: async () => {},
      useUrl: () => '',
    }),
  },
};

describe('Data Streams tab', () => {
  let httpSetup: ReturnType<typeof setupEnvironment>['httpSetup'];
  let httpRequestsMockHelpers: ReturnType<typeof setupEnvironment>['httpRequestsMockHelpers'];

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    const env = setupEnvironment();
    httpSetup = env.httpSetup;
    httpRequestsMockHelpers = env.httpRequestsMockHelpers;
    httpService.setup(httpServiceMock.createSetupContract());
    jest.spyOn(breadcrumbService, 'setBreadcrumbs');
  });

  afterEach(async () => {
    // Some tests open popovers just to assert menu items exist; ensure they don't leak across tests.
    if (screen.queryByTestId('dataStreamActionsContextMenu')) {
      fireEvent.click(screen.getByTestId('dataStreamActionsPopoverButton'));
      await waitFor(() => {
        expect(screen.queryByTestId('dataStreamActionsContextMenu')).not.toBeInTheDocument();
      });
    }

    const filterList = screen.queryByTestId('filterList');
    if (
      filterList?.getAttribute('data-popover-open') === 'true' &&
      screen.queryByTestId('viewButton')
    ) {
      await closeViewFilterPopoverIfOpen();
    }
  });

  describe('when there are no data streams', () => {
    beforeEach(async () => {
      httpRequestsMockHelpers.setLoadIndicesResponse([]);
      httpRequestsMockHelpers.setLoadDataStreamsResponse([]);
      httpRequestsMockHelpers.setLoadTemplatesResponse({ templates: [], legacyTemplates: [] });
    });

    test('displays an empty prompt', async () => {
      await renderHome(httpSetup, {
        initialEntries: ['/data_streams'],
        appServicesContext: { url: urlServiceMock },
      });

      await waitFor(() => {
        expect(screen.queryByTestId('sectionLoading')).not.toBeInTheDocument();
      });

      expect(screen.getByTestId('emptyPrompt')).toBeInTheDocument();
    });

    test('when Fleet is disabled, goes to index templates tab when "Get started" link is clicked', async () => {
      await renderHome(httpSetup, {
        initialEntries: ['/data_streams'],
        appServicesContext: {
          plugins: {},
          url: urlServiceMock,
        },
      });

      await waitFor(() => {
        expect(screen.queryByTestId('sectionLoading')).not.toBeInTheDocument();
      });

      const actions = createDataStreamTabActions();
      actions.clickEmptyPromptIndexTemplateLink();

      await screen.findByTestId('templateList');
      expect(screen.getByTestId('templateList')).toBeInTheDocument();
    });

    test('when Fleet is enabled, links to Fleet', async () => {
      await renderHome(httpSetup, {
        initialEntries: ['/data_streams'],
        appServicesContext: {
          plugins: { isFleetEnabled: true },
          url: urlServiceMock,
        },
      });

      await waitFor(() => {
        expect(screen.queryByTestId('sectionLoading')).not.toBeInTheDocument();
      });

      const link = screen.getByTestId('dataStreamsEmptyPromptTemplateLink');
      expect(link).toHaveTextContent('Fleet');
    });

    test('when hidden data streams are filtered by default, the table is rendered empty', async () => {
      const hiddenDataStream = createDataStreamPayload({
        name: 'hidden-data-stream',
        hidden: true,
      });
      httpRequestsMockHelpers.setLoadDataStreamsResponse([hiddenDataStream]);

      await renderHome(httpSetup, {
        initialEntries: ['/data_streams'],
        appServicesContext: {
          plugins: {},
          url: urlServiceMock,
        },
      });

      await screen.findByTestId('dataStreamTable');

      expect(screen.getByTestId('dataStreamTable')).toHaveTextContent('No data streams found');
    });

    test('updates the breadcrumbs to data streams', async () => {
      await renderHome(httpSetup, {
        initialEntries: ['/data_streams'],
        appServicesContext: { url: urlServiceMock },
      });

      await waitFor(() => {
        expect(screen.queryByTestId('sectionLoading')).not.toBeInTheDocument();
      });

      expect(breadcrumbService.setBreadcrumbs).toHaveBeenLastCalledWith(
        IndexManagementBreadcrumb.dataStreams
      );
    });
  });

  describe('when there are data streams', () => {
    // Helper to set up common mock data for this section
    const setupDataStreamsMocks = () => {
      const dataStreamForDetailPanel = createDataStreamPayload({
        name: 'dataStream1',
        storageSize: '5b',
        storageSizeBytes: 5,
        meteringStorageSize: '156kb',
        meteringStorageSizeBytes: 156000,
        meteringDocsCount: 10000,
      });

      httpRequestsMockHelpers.setLoadIndicesResponse([
        createDataStreamBackingIndex('data-stream-index', 'dataStream1'),
        createNonDataStreamIndex('non-data-stream-index'),
      ]);

      httpRequestsMockHelpers.setLoadDataStreamsResponse([
        dataStreamForDetailPanel,
        createDataStreamPayload({
          name: 'dataStream2',
          storageSize: '1kb',
          storageSizeBytes: 1000,
          meteringStorageSize: '156kb',
          meteringStorageSizeBytes: 156000,
          meteringDocsCount: 10000,
          lifecycle: {
            enabled: true,
            data_retention: '7d',
            effective_retention: '5d',
            retention_determined_by: MAX_DATA_RETENTION,
          },
        }),
      ]);

      httpRequestsMockHelpers.setLoadDataStreamResponse(
        dataStreamForDetailPanel.name,
        dataStreamForDetailPanel
      );

      const indexTemplate = fixtures.getTemplate({ name: 'indexTemplate' });
      httpRequestsMockHelpers.setLoadTemplatesResponse({
        templates: [indexTemplate],
        legacyTemplates: [],
      });
      httpRequestsMockHelpers.setLoadTemplateResponse(indexTemplate.name, indexTemplate);
    };

    test('lists them in the table', async () => {
      setupDataStreamsMocks();
      await renderHome(httpSetup, {
        initialEntries: ['/data_streams'],
        appServicesContext: { url: urlServiceMock },
      });

      await waitFor(() => {
        expect(screen.queryByTestId('sectionLoading')).not.toBeInTheDocument();
      });

      await screen.findByTestId('dataStreamTable');
      const tableCellsValues = getTableCellsValues('dataStreamTable');

      expect(tableCellsValues).toEqual([
        ['', 'dataStream1', 'green', '1', 'Standard', '7 days', 'Delete'],
        ['', 'dataStream2', 'green', '1', 'Standard', '5 days Info', 'Delete'],
      ]);
    });

    test('highlights datastreams who are using max retention', async () => {
      setupDataStreamsMocks();
      await renderHome(httpSetup, {
        initialEntries: ['/data_streams'],
        appServicesContext: { url: urlServiceMock },
      });

      await waitFor(() => {
        expect(screen.queryByTestId('sectionLoading')).not.toBeInTheDocument();
      });

      await screen.findByTestId('dataStreamTable');
      expect(screen.getByTestId('usingMaxRetention')).toBeInTheDocument();
    });

    test('has a button to reload the data streams', async () => {
      setupDataStreamsMocks();
      await renderHome(httpSetup, {
        initialEntries: ['/data_streams'],
        appServicesContext: { url: urlServiceMock },
      });

      await waitFor(() => {
        expect(screen.queryByTestId('sectionLoading')).not.toBeInTheDocument();
      });

      await screen.findByTestId('dataStreamTable');
      const actions = createDataStreamTabActions();

      expect(screen.getByTestId('reloadButton')).toBeInTheDocument();
      actions.clickReloadButton();

      await waitFor(() => {
        expect(httpSetup.get).toHaveBeenLastCalledWith(
          `${API_BASE_PATH}/data_streams`,
          expect.anything()
        );
      });
    });

    test('has a switch that will reload the data streams with additional stats when clicked', async () => {
      setupDataStreamsMocks();
      await renderHome(httpSetup, {
        initialEntries: ['/data_streams'],
        appServicesContext: { url: urlServiceMock },
      });

      await waitFor(() => {
        expect(screen.queryByTestId('sectionLoading')).not.toBeInTheDocument();
      });

      await screen.findByTestId('dataStreamTable');
      const actions = createDataStreamTabActions();

      expect(screen.getByTestId('includeStatsSwitch')).toBeInTheDocument();
      await actions.clickIncludeStatsSwitch();

      await waitFor(() => {
        expect(httpSetup.get).toHaveBeenLastCalledWith(
          `${API_BASE_PATH}/data_streams`,
          expect.anything()
        );
      });

      await waitFor(() => {
        const tableCellsValues = getTableCellsValues('dataStreamTable');
        expect(tableCellsValues).toEqual([
          [
            '',
            'dataStream1',
            'green',
            'December 31st, 1969 7:00:00 PM',
            '5B',
            '1',
            'Standard',
            '7 days',
            'Delete',
          ],
          [
            '',
            'dataStream2',
            'green',
            'December 31st, 1969 7:00:00 PM',
            '1KB',
            '1',
            'Standard',
            '5 days Info',
            'Delete',
          ],
        ]);
      });
    });

    test('sorting on stats sorts by bytes value instead of human readable value', async () => {
      // Guards against regression of #86122.
      setupDataStreamsMocks();
      await renderHome(httpSetup, {
        initialEntries: ['/data_streams'],
        appServicesContext: { url: urlServiceMock },
      });

      await waitFor(() => {
        expect(screen.queryByTestId('sectionLoading')).not.toBeInTheDocument();
      });

      await screen.findByTestId('dataStreamTable');
      const actions = createDataStreamTabActions();

      await actions.clickIncludeStatsSwitch();

      await waitFor(() => {
        expect(screen.getAllByText('December 31st, 1969 7:00:00 PM').length).toBeGreaterThan(0);
      });

      actions.sortTableOnStorageSize();

      // The table sorts by the underlying byte values in ascending order
      await waitFor(() => {
        const tableCellsValues = getTableCellsValues('dataStreamTable');
        expect(tableCellsValues).toEqual([
          [
            '',
            'dataStream1',
            'green',
            'December 31st, 1969 7:00:00 PM',
            '5B',
            '1',
            'Standard',
            '7 days',
            'Delete',
          ],
          [
            '',
            'dataStream2',
            'green',
            'December 31st, 1969 7:00:00 PM',
            '1KB',
            '1',
            'Standard',
            '5 days Info',
            'Delete',
          ],
        ]);
      });
    });

    test(`doesn't hide stats toggle if enableDataStreamStats===false`, async () => {
      setupDataStreamsMocks();
      await renderHome(httpSetup, {
        initialEntries: ['/data_streams'],
        appServicesContext: {
          url: urlServiceMock,
          config: {
            enableDataStreamStats: false,
          },
        },
      });

      await waitFor(() => {
        expect(screen.queryByTestId('sectionLoading')).not.toBeInTheDocument();
      });

      await screen.findByTestId('dataStreamTable');
      expect(screen.getByTestId('includeStatsSwitch')).toBeInTheDocument();
    });

    test('shows storage size and documents count if enableSizeAndDocCount===true, enableDataStreamStats==false', async () => {
      setupDataStreamsMocks();
      await renderHome(httpSetup, {
        initialEntries: ['/data_streams'],
        appServicesContext: {
          url: urlServiceMock,
          config: {
            enableSizeAndDocCount: true,
            enableDataStreamStats: false,
          },
        },
      });

      await waitFor(() => {
        expect(screen.queryByTestId('sectionLoading')).not.toBeInTheDocument();
      });

      await screen.findByTestId('dataStreamTable');
      const actions = createDataStreamTabActions();
      await actions.clickIncludeStatsSwitch();

      await waitFor(() => {
        const tableCellsValues = getTableCellsValues('dataStreamTable');
        expect(tableCellsValues).toEqual([
          ['', 'dataStream1', 'green', '156KB', '10000', '1', 'Standard', '7 days', 'Delete'],
          ['', 'dataStream2', 'green', '156KB', '10000', '1', 'Standard', '5 days Info', 'Delete'],
        ]);
      });
    });

    test('shows last updated and storage size if enableDataStreamStats===true, enableSizeAndDocCount===false', async () => {
      setupDataStreamsMocks();
      await renderHome(httpSetup, {
        initialEntries: ['/data_streams'],
        appServicesContext: {
          url: urlServiceMock,
          config: {
            enableDataStreamStats: true,
            enableSizeAndDocCount: false,
          },
        },
      });

      await waitFor(() => {
        expect(screen.queryByTestId('sectionLoading')).not.toBeInTheDocument();
      });

      await screen.findByTestId('dataStreamTable');
      const actions = createDataStreamTabActions();
      await actions.clickIncludeStatsSwitch();

      await waitFor(() => {
        const tableCellsValues = getTableCellsValues('dataStreamTable');
        expect(tableCellsValues).toEqual([
          [
            '',
            'dataStream1',
            'green',
            'December 31st, 1969 7:00:00 PM',
            '5B',
            '1',
            'Standard',
            '7 days',
            'Delete',
          ],
          [
            '',
            'dataStream2',
            'green',
            'December 31st, 1969 7:00:00 PM',
            '1KB',
            '1',
            'Standard',
            '5 days Info',
            'Delete',
          ],
        ]);
      });
    });

    describe('row actions', () => {
      test('can delete', async () => {
        setupDataStreamsMocks();
        await renderHome(httpSetup, {
          initialEntries: ['/data_streams'],
          appServicesContext: { url: urlServiceMock },
        });

        // Use waitForElementToBeRemoved for more reliable waiting
        const loadingElement = screen.queryByTestId('sectionLoading');
        if (loadingElement) {
          await waitForElementToBeRemoved(loadingElement);
        }

        await screen.findByTestId('dataStreamTable');
        const table = new EuiTableTestHarness('dataStreamTable');
        const dataRow = table.getRowByCellText('dataStream1') as HTMLElement;

        const deleteButton = within(dataRow).getByTestId('deleteDataStream');
        expect(deleteButton).toBeInTheDocument();
      });
    });

    describe('deleting a data stream', () => {
      test('shows a confirmation modal', async () => {
        setupDataStreamsMocks();
        await renderHome(httpSetup, {
          initialEntries: ['/data_streams'],
          appServicesContext: { url: urlServiceMock },
        });

        // Use waitForElementToBeRemoved for more reliable waiting
        const loadingElement = screen.queryByTestId('sectionLoading');
        if (loadingElement) {
          await waitForElementToBeRemoved(loadingElement);
        }

        await screen.findByTestId('dataStreamTable');
        const actions = createDataStreamTabActions();
        await actions.clickDeleteActionAt(0);

        await screen.findByTestId('deleteDataStreamsConfirmation');
        expect(screen.getByTestId('deleteDataStreamsConfirmation')).toBeInTheDocument();
      });

      test('sends a request to the Delete API', async () => {
        setupDataStreamsMocks();
        await renderHome(httpSetup, {
          initialEntries: ['/data_streams'],
          appServicesContext: { url: urlServiceMock },
        });

        // Use waitForElementToBeRemoved for more reliable waiting
        const loadingElement = screen.queryByTestId('sectionLoading');
        if (loadingElement) {
          await waitForElementToBeRemoved(loadingElement);
        }

        await screen.findByTestId('dataStreamTable');
        const actions = createDataStreamTabActions();
        await actions.clickDeleteActionAt(0);

        httpRequestsMockHelpers.setDeleteDataStreamResponse({
          results: {
            dataStreamsDeleted: ['dataStream1'],
            errors: [],
          },
        });

        await actions.clickConfirmDelete();

        await waitFor(() => {
          expect(httpSetup.post).toHaveBeenLastCalledWith(
            `${API_BASE_PATH}/delete_data_streams`,
            expect.objectContaining({ body: JSON.stringify({ dataStreams: ['dataStream1'] }) })
          );
        });
      });
    });

    describe('bulk delete of data streams', () => {
      test('can delete multiple data streams at once', async () => {
        const ds1 = createDataStreamPayload({
          name: 'dataStream1',
          privileges: {
            delete_index: true,
            manage_data_stream_lifecycle: true,
            read_failure_store: true,
          },
        });
        const ds2 = createDataStreamPayload({
          name: 'dataStream2',
          privileges: {
            delete_index: true,
            manage_data_stream_lifecycle: true,
            read_failure_store: true,
          },
        });

        httpRequestsMockHelpers.setLoadIndicesResponse([]);
        httpRequestsMockHelpers.setLoadDataStreamsResponse([ds1, ds2]);
        httpRequestsMockHelpers.setLoadTemplatesResponse({ templates: [], legacyTemplates: [] });

        await renderHome(httpSetup, {
          initialEntries: ['/data_streams'],
          appServicesContext: { url: urlServiceMock },
        });

        // Use waitForElementToBeRemoved for more reliable waiting
        const loadingElement = screen.queryByTestId('sectionLoading');
        if (loadingElement) {
          await waitForElementToBeRemoved(loadingElement);
        }

        await screen.findByTestId('dataStreamTable');
        const actions = createDataStreamTabActions();

        actions.selectDataStream('dataStream1', true);
        actions.selectDataStream('dataStream2', true);

        await actions.clickBulkDeleteDataStreamsButton();

        httpRequestsMockHelpers.setDeleteDataStreamResponse({
          results: {
            dataStreamsDeleted: ['dataStream1', 'dataStream2'],
            errors: [],
          },
        });

        await actions.clickConfirmDelete();

        await waitFor(() => {
          expect(httpSetup.post).toHaveBeenLastCalledWith(
            `${API_BASE_PATH}/delete_data_streams`,
            expect.objectContaining({
              body: JSON.stringify({ dataStreams: ['dataStream1', 'dataStream2'] }),
            })
          );
        });
      });
    });

    describe('bulk update data retention', () => {
      const setupBulkRetentionMocks = () => {
        // Both data streams must have lifecycle enabled with data_retention
        // for the "reduced retention" tests to work correctly
        const ds1 = createDataStreamPayload({
          name: 'dataStream1',
          lifecycle: {
            enabled: true,
            data_retention: '7d',
          },
        });
        const ds2 = createDataStreamPayload({
          name: 'dataStream2',
          lifecycle: {
            enabled: true,
            data_retention: '7d',
          },
        });

        httpRequestsMockHelpers.setLoadDataStreamsResponse([ds1, ds2]);
        httpRequestsMockHelpers.setLoadIndicesResponse([]);
        httpRequestsMockHelpers.setLoadTemplatesResponse({ templates: [], legacyTemplates: [] });
      };

      test('shows bulk edit callout for reduced data retention', async () => {
        setupBulkRetentionMocks();
        await renderHome(httpSetup, {
          initialEntries: ['/data_streams'],
          appServicesContext: { url: urlServiceMock },
        });

        // Use waitForElementToBeRemoved for more reliable waiting
        const loadingElement = screen.queryByTestId('sectionLoading');
        if (loadingElement) {
          await waitForElementToBeRemoved(loadingElement);
        }

        await screen.findByTestId('dataStreamTable');

        const actions = createDataStreamTabActions();
        const formActions = createDataRetentionFormActions();

        actions.selectDataStream('dataStream1', true);
        actions.selectDataStream('dataStream2', true);
        await actions.clickBulkEditDataRetentionButton();

        await screen.findByTestId('dataRetentionValue');

        // Decrease data retention value to 5d (it was 7d initially)
        await formActions.setDataRetentionValue('5');

        await screen.findByTestId('reducedDataRetentionCallout');

        const calloutText = formActions.getReducedRetentionCalloutText();
        expect(calloutText).toContain(
          'The retention period will be reduced for 2 data streams. Data older than then new retention period will be permanently deleted.'
        );
        expect(calloutText).toContain('Affected data streams: dataStream1, dataStream2');
      });

      test('can set data retention period for multiple data streams', async () => {
        setupBulkRetentionMocks();
        await renderHome(httpSetup, {
          initialEntries: ['/data_streams'],
          appServicesContext: { url: urlServiceMock },
        });

        // Use waitForElementToBeRemoved for more reliable waiting
        const loadingElement = screen.queryByTestId('sectionLoading');
        if (loadingElement) {
          await waitForElementToBeRemoved(loadingElement);
        }

        await screen.findByTestId('dataStreamTable');

        const actions = createDataStreamTabActions();
        const formActions = createDataRetentionFormActions();

        actions.selectDataStream('dataStream1', true);
        actions.selectDataStream('dataStream2', true);
        await actions.clickBulkEditDataRetentionButton();

        await screen.findByTestId('dataRetentionValue');

        httpRequestsMockHelpers.setEditDataRetentionResponse({
          success: true,
        });

        // Set data retention value
        await formActions.setDataRetentionValue('7');
        // Set data retention unit to hours
        await formActions.setTimeUnit('h');

        formActions.clickSaveButton();

        // Flush timers after form submission before checking HTTP call

        await waitFor(() => {
          expect(httpSetup.put).toHaveBeenLastCalledWith(
            `${API_BASE_PATH}/data_streams/data_retention`,
            expect.objectContaining({
              body: JSON.stringify({
                dataRetention: '7h',
                dataStreams: ['dataStream1', 'dataStream2'],
              }),
            })
          );
        });
      });

      test('can disable lifecycle', async () => {
        setupBulkRetentionMocks();
        await renderHome(httpSetup, {
          initialEntries: ['/data_streams'],
          appServicesContext: { url: urlServiceMock },
        });

        // Use waitForElementToBeRemoved for more reliable waiting
        const loadingElement = screen.queryByTestId('sectionLoading');
        if (loadingElement) {
          await waitForElementToBeRemoved(loadingElement);
        }

        await screen.findByTestId('dataStreamTable');

        const actions = createDataStreamTabActions();
        const formActions = createDataRetentionFormActions();

        actions.selectDataStream('dataStream1', true);
        actions.selectDataStream('dataStream2', true);
        await actions.clickBulkEditDataRetentionButton();

        await screen.findByTestId('dataRetentionValue');

        httpRequestsMockHelpers.setEditDataRetentionResponse({
          success: true,
        });

        await formActions.toggleDataRetentionEnabled();
        formActions.clickSaveButton();

        // Flush timers after form submission before checking HTTP call

        await waitFor(() => {
          expect(httpSetup.put).toHaveBeenLastCalledWith(
            `${API_BASE_PATH}/data_streams/data_retention`,
            expect.objectContaining({
              body: JSON.stringify({ enabled: false, dataStreams: ['dataStream1', 'dataStream2'] }),
            })
          );
        });
      }, 10000);

      test('allows to set infinite retention period', async () => {
        setupBulkRetentionMocks();
        await renderHome(httpSetup, {
          initialEntries: ['/data_streams'],
          appServicesContext: { url: urlServiceMock },
        });

        // Use waitForElementToBeRemoved for more reliable waiting
        const loadingElement = screen.queryByTestId('sectionLoading');
        if (loadingElement) {
          await waitForElementToBeRemoved(loadingElement);
        }

        await screen.findByTestId('dataStreamTable');

        const actions = createDataStreamTabActions();
        const formActions = createDataRetentionFormActions();

        actions.selectDataStream('dataStream1', true);
        actions.selectDataStream('dataStream2', true);
        await actions.clickBulkEditDataRetentionButton();

        await screen.findByTestId('dataRetentionValue');

        httpRequestsMockHelpers.setEditDataRetentionResponse({
          success: true,
        });

        await formActions.toggleInfiniteRetentionPeriod();
        formActions.clickSaveButton();

        // Flush timers after form submission before checking HTTP call

        await waitFor(() => {
          expect(httpSetup.put).toHaveBeenLastCalledWith(
            `${API_BASE_PATH}/data_streams/data_retention`,
            expect.objectContaining({
              body: JSON.stringify({ dataStreams: ['dataStream1', 'dataStream2'] }),
            })
          );
        });
      }, 10000);
    });

    describe('detail panel', () => {
      test('opens when the data stream name in the table is clicked', async () => {
        setupDataStreamsMocks();
        await renderHome(httpSetup, {
          initialEntries: ['/data_streams'],
          appServicesContext: { url: urlServiceMock },
        });

        // Use waitForElementToBeRemoved for more reliable waiting
        const loadingElement = screen.queryByTestId('sectionLoading');
        if (loadingElement) {
          await waitForElementToBeRemoved(loadingElement);
        }

        await screen.findByTestId('dataStreamTable');

        const actions = createDataStreamTabActions();
        const detailPanelActions = createDataStreamDetailPanelActions();

        await actions.clickNameAt(0);
        await detailPanelActions.waitForDetailPanel();

        expect(detailPanelActions.findDetailPanel()).toBeInTheDocument();
        expect(detailPanelActions.findDetailPanelTitle()).toBe('dataStream1');
      });

      test('deletes the data stream when delete button is clicked', async () => {
        setupDataStreamsMocks();
        await renderHome(httpSetup, {
          initialEntries: ['/data_streams'],
          appServicesContext: { url: urlServiceMock },
        });

        // Use waitForElementToBeRemoved for more reliable waiting
        const loadingElement = screen.queryByTestId('sectionLoading');
        if (loadingElement) {
          await waitForElementToBeRemoved(loadingElement);
        }

        await screen.findByTestId('dataStreamTable');

        const actions = createDataStreamTabActions();
        const detailPanelActions = createDataStreamDetailPanelActions();

        await actions.clickNameAt(0);
        await detailPanelActions.waitForDetailPanel();

        await actions.clickDeleteDataStreamButton();

        httpRequestsMockHelpers.setDeleteDataStreamResponse({
          results: {
            dataStreamsDeleted: ['dataStream1'],
            errors: [],
          },
        });

        await actions.clickConfirmDelete();

        await waitFor(() => {
          expect(httpSetup.post).toHaveBeenLastCalledWith(
            `${API_BASE_PATH}/delete_data_streams`,
            expect.objectContaining({ body: JSON.stringify({ dataStreams: ['dataStream1'] }) })
          );
        });
      });

      describe('update data retention', () => {
        test('Should show disabled or infinite retention period accordingly in table and flyout', async () => {
          const ds1 = createDataStreamPayload({
            name: 'dataStream1',
            lifecycle: {
              enabled: false,
            },
          });
          const ds2 = createDataStreamPayload({
            name: 'dataStream2',
            lifecycle: {
              enabled: true,
            },
          });

          httpRequestsMockHelpers.setLoadIndicesResponse([]);
          httpRequestsMockHelpers.setLoadDataStreamsResponse([ds1, ds2]);
          httpRequestsMockHelpers.setLoadDataStreamResponse(ds1.name, ds1);
          httpRequestsMockHelpers.setLoadTemplatesResponse({ templates: [], legacyTemplates: [] });

          await renderHome(httpSetup, {
            initialEntries: ['/data_streams'],
            appServicesContext: { url: urlServiceMock },
          });

          // Use waitForElementToBeRemoved for more reliable waiting
          const loadingElement = screen.queryByTestId('sectionLoading');
          if (loadingElement) {
            await waitForElementToBeRemoved(loadingElement);
          }

          await screen.findByTestId('dataStreamTable');

          const tableCellsValues = getTableCellsValues('dataStreamTable');
          expect(tableCellsValues).toEqual([
            ['', 'dataStream1', 'green', '1', 'Standard', 'Disabled', 'Delete'],
            ['', 'dataStream2', 'green', '1', 'Standard', 'Info', 'Delete'],
          ]);

          const actions = createDataStreamTabActions();
          const detailPanelActions = createDataStreamDetailPanelActions();

          await actions.clickNameAt(0);
          await detailPanelActions.waitForDetailPanel();
          expect(await screen.findByTestId('dataRetentionDetail')).toHaveTextContent('Disabled');

          // Close detail panel
          fireEvent.click(screen.getByTestId('closeDetailsButton'));
          await waitFor(() => {
            expect(screen.queryByTestId('dataStreamDetailPanel')).not.toBeInTheDocument();
          });

          httpRequestsMockHelpers.setLoadDataStreamResponse(ds2.name, ds2);
          await actions.clickNameAt(1);
          await detailPanelActions.waitForDetailPanel();
          expect(await screen.findByTestId('dataRetentionDetail')).toHaveTextContent(
            'Keep data indefinitely'
          );
        });

        test('can set data retention period', async () => {
          setupDataStreamsMocks();
          await renderHome(httpSetup, {
            initialEntries: ['/data_streams'],
            appServicesContext: { url: urlServiceMock },
          });

          // Use waitForElementToBeRemoved for more reliable waiting
          const loadingElement = screen.queryByTestId('sectionLoading');
          if (loadingElement) {
            await waitForElementToBeRemoved(loadingElement);
          }

          await screen.findByTestId('dataStreamTable');

          const actions = createDataStreamTabActions();
          const detailPanelActions = createDataStreamDetailPanelActions();
          const formActions = createDataRetentionFormActions();

          await actions.clickNameAt(0);
          await detailPanelActions.waitForDetailPanel();

          await actions.clickEditDataRetentionButton();

          httpRequestsMockHelpers.setEditDataRetentionResponse({
            success: true,
          });

          await formActions.setDataRetentionValue('7');
          await formActions.setTimeUnit('h');
          formActions.clickSaveButton();

          // Flush timers after form submission before checking HTTP call

          await waitFor(() => {
            expect(httpSetup.put).toHaveBeenLastCalledWith(
              `${API_BASE_PATH}/data_streams/data_retention`,
              expect.objectContaining({
                body: JSON.stringify({ dataRetention: '7h', dataStreams: ['dataStream1'] }),
              })
            );
          });
        }, 10000);

        test('can disable lifecycle', async () => {
          setupDataStreamsMocks();
          await renderHome(httpSetup, {
            initialEntries: ['/data_streams'],
            appServicesContext: { url: urlServiceMock },
          });

          // Use waitForElementToBeRemoved for more reliable waiting
          const loadingElement = screen.queryByTestId('sectionLoading');
          if (loadingElement) {
            await waitForElementToBeRemoved(loadingElement);
          }

          await screen.findByTestId('dataStreamTable');

          const actions = createDataStreamTabActions();
          const detailPanelActions = createDataStreamDetailPanelActions();
          const formActions = createDataRetentionFormActions();

          await actions.clickNameAt(0);
          await detailPanelActions.waitForDetailPanel();

          await actions.clickEditDataRetentionButton();

          httpRequestsMockHelpers.setEditDataRetentionResponse({
            success: true,
          });

          await formActions.toggleDataRetentionEnabled();
          formActions.clickSaveButton();

          // Flush timers after form submission before checking HTTP call

          await waitFor(() => {
            expect(httpSetup.put).toHaveBeenLastCalledWith(
              `${API_BASE_PATH}/data_streams/data_retention`,
              expect.objectContaining({
                body: JSON.stringify({ enabled: false, dataStreams: ['dataStream1'] }),
              })
            );
          });
        }, 10000);

        test('allows to set infinite retention period', async () => {
          setupDataStreamsMocks();
          await renderHome(httpSetup, {
            initialEntries: ['/data_streams'],
            appServicesContext: { url: urlServiceMock },
          });

          // Use waitForElementToBeRemoved for more reliable waiting
          const loadingElement = screen.queryByTestId('sectionLoading');
          if (loadingElement) {
            await waitForElementToBeRemoved(loadingElement);
          }

          await screen.findByTestId('dataStreamTable');

          const actions = createDataStreamTabActions();
          const detailPanelActions = createDataStreamDetailPanelActions();
          const formActions = createDataRetentionFormActions();

          await actions.clickNameAt(0);
          await detailPanelActions.waitForDetailPanel();

          await actions.clickEditDataRetentionButton();

          httpRequestsMockHelpers.setEditDataRetentionResponse({
            success: true,
          });

          await formActions.toggleInfiniteRetentionPeriod();
          formActions.clickSaveButton();

          // Flush timers after form submission before checking HTTP call

          await waitFor(() => {
            expect(httpSetup.put).toHaveBeenLastCalledWith(
              `${API_BASE_PATH}/data_streams/data_retention`,
              expect.objectContaining({ body: JSON.stringify({ dataStreams: ['dataStream1'] }) })
            );
          });
        });

        test('shows single edit callout for reduced data retention', async () => {
          setupDataStreamsMocks();
          await renderHome(httpSetup, {
            initialEntries: ['/data_streams'],
            appServicesContext: { url: urlServiceMock },
          });

          // Use waitForElementToBeRemoved for more reliable waiting
          const loadingElement = screen.queryByTestId('sectionLoading');
          if (loadingElement) {
            await waitForElementToBeRemoved(loadingElement);
          }

          await screen.findByTestId('dataStreamTable');

          const actions = createDataStreamTabActions();
          const detailPanelActions = createDataStreamDetailPanelActions();
          const formActions = createDataRetentionFormActions();

          await actions.clickNameAt(0);
          await detailPanelActions.waitForDetailPanel();

          await actions.clickEditDataRetentionButton();

          // Decrease data retention value to 5d (it was 7d initially)
          await formActions.setDataRetentionValue('5');

          await screen.findByTestId('reducedDataRetentionCallout');

          const calloutText = formActions.getReducedRetentionCalloutText();
          expect(calloutText).toContain(
            'The retention period will be reduced. Data older than then new retention period will be permanently deleted.'
          );
        });
      });

      test('index template name navigates to the index template details', async () => {
        setupDataStreamsMocks();
        await renderHome(httpSetup, {
          initialEntries: ['/data_streams'],
          appServicesContext: { url: urlServiceMock },
        });

        // Use waitForElementToBeRemoved for more reliable waiting
        const loadingElement = screen.queryByTestId('sectionLoading');
        if (loadingElement) {
          await waitForElementToBeRemoved(loadingElement);
        }

        await screen.findByTestId('dataStreamTable');
        getRedirectUrl.mockClear();

        const actions = createDataStreamTabActions();
        const detailPanelActions = createDataStreamDetailPanelActions();

        await actions.clickNameAt(0);
        await detailPanelActions.waitForDetailPanel();

        const indexTemplateLink = await screen.findByTestId('indexTemplateLink');
        expect(indexTemplateLink).toHaveTextContent('indexTemplate');
        expect(indexTemplateLink.getAttribute('href')).toBe('/app/path');
        expect(getRedirectUrl).toHaveBeenCalledWith({
          page: 'index_template',
          indexTemplate: 'indexTemplate',
        });
      });

      test('shows data retention detail when configured', async () => {
        setupDataStreamsMocks();
        await renderHome(httpSetup, {
          initialEntries: ['/data_streams'],
          appServicesContext: { url: urlServiceMock },
        });

        // Use waitForElementToBeRemoved for more reliable waiting
        const loadingElement = screen.queryByTestId('sectionLoading');
        if (loadingElement) {
          await waitForElementToBeRemoved(loadingElement);
        }

        await screen.findByTestId('dataStreamTable');

        const actions = createDataStreamTabActions();
        const detailPanelActions = createDataStreamDetailPanelActions();

        await actions.clickNameAt(0);
        await detailPanelActions.waitForDetailPanel();

        expect(await screen.findByTestId('dataRetentionDetail')).toBeInTheDocument();
      }, 20000);
    });

    describe('shows all possible states according to who manages the data stream', () => {
      const dsFullyManagedByILM = createDataStreamPayload({
        name: 'dataStream1',
        nextGenerationManagedBy: 'Index Lifecycle Management',
        lifecycle: undefined,
        indices: [
          {
            managedBy: 'Index Lifecycle Management',
            name: 'indexName',
            uuid: 'indexId',
            preferILM: true,
          },
        ],
      });

      const dsPartiallyManagedByILM = createDataStreamPayload({
        name: 'dataStream2',
        nextGenerationManagedBy: 'Data stream lifecycle',
        lifecycle: {
          enabled: true,
          data_retention: '7d',
        },
        ilmPolicyName: 'testILM',
        indices: [
          {
            managedBy: 'Index Lifecycle Management',
            name: 'indexName1',
            uuid: 'indexId1',
            preferILM: true,
          },
          {
            managedBy: 'Index Lifecycle Management',
            name: 'indexName2',
            uuid: 'indexId2',
            preferILM: true,
          },
          {
            managedBy: 'Index Lifecycle Management',
            name: 'indexName3',
            uuid: 'indexId3',
            preferILM: true,
          },
          {
            managedBy: 'Index Lifecycle Management',
            name: 'indexName4',
            uuid: 'indexId4',
            preferILM: true,
          },
        ],
      });

      const setupILMMocks = () => {
        httpRequestsMockHelpers.setLoadIndicesResponse([]);
        httpRequestsMockHelpers.setLoadDataStreamsResponse([
          dsFullyManagedByILM,
          dsPartiallyManagedByILM,
        ]);
        httpRequestsMockHelpers.setLoadTemplatesResponse({ templates: [], legacyTemplates: [] });
      };

      test('when fully managed by ILM, user cannot edit data retention', async () => {
        setupILMMocks();
        httpRequestsMockHelpers.setLoadDataStreamResponse(
          dsFullyManagedByILM.name,
          dsFullyManagedByILM
        );

        await renderHome(httpSetup, {
          initialEntries: ['/data_streams'],
          appServicesContext: { url: urlServiceMock },
        });

        // Use waitForElementToBeRemoved for more reliable waiting
        const loadingElement = screen.queryByTestId('sectionLoading');
        if (loadingElement) {
          await waitForElementToBeRemoved(loadingElement);
        }

        await screen.findByTestId('dataStreamTable');
        const actions = createDataStreamTabActions();
        const detailPanelActions = createDataStreamDetailPanelActions();

        await actions.clickNameAt(0);
        await detailPanelActions.waitForDetailPanel();

        expect(await screen.findByTestId('dataRetentionDetail')).toHaveTextContent('Disabled');

        // There should be a warning that the data stream is fully managed by ILM
        expect(screen.getByTestId('dsIsFullyManagedByILM')).toBeInTheDocument();

        // Edit data retention button should not be visible
        fireEvent.click(await screen.findByTestId('manageDataStreamButton'));
        await screen.findByText('Data stream options');
        expect(screen.queryByTestId('editDataRetentionButton')).not.toBeInTheDocument();
      });

      test('displays/hides bulk edit data retention depending if data stream fully managed by ILM is selected', async () => {
        httpRequestsMockHelpers.setLoadIndicesResponse([]);
        httpRequestsMockHelpers.setLoadDataStreamsResponse([
          dsFullyManagedByILM,
          dsPartiallyManagedByILM,
        ]);
        httpRequestsMockHelpers.setLoadTemplatesResponse({ templates: [], legacyTemplates: [] });

        await renderHome(httpSetup, {
          initialEntries: ['/data_streams'],
          appServicesContext: { url: urlServiceMock },
        });

        // Use waitForElementToBeRemoved for more reliable waiting
        const loadingElement = screen.queryByTestId('sectionLoading');
        if (loadingElement) {
          await waitForElementToBeRemoved(loadingElement);
        }

        await screen.findByTestId('dataStreamTable');
        const actions = createDataStreamTabActions();

        // Select data stream fully managed by ILM
        actions.selectDataStream('dataStream1', true);
        await actions.openBulkActionsPopover();
        expect(screen.queryByTestId('bulkEditDataRetentionButton')).not.toBeInTheDocument();
        await actions.closeBulkActionsPopover();

        // Select data stream managed by DSL (both now selected)
        actions.selectDataStream('dataStream2', true);
        await actions.openBulkActionsPopover();
        expect(screen.queryByTestId('bulkEditDataRetentionButton')).not.toBeInTheDocument();
        await actions.closeBulkActionsPopover();

        // Unselect data stream fully managed by ILM (only DSL stream selected)
        actions.selectDataStream('dataStream1', false);
        await actions.openBulkActionsPopover();
        expect(screen.getByTestId('bulkEditDataRetentionButton')).toBeInTheDocument();
      });

      test('when partially managed by dsl but has backing indices managed by ILM should show a warning', async () => {
        setupILMMocks();
        httpRequestsMockHelpers.setLoadDataStreamResponse(
          dsPartiallyManagedByILM.name,
          dsPartiallyManagedByILM
        );

        await renderHome(httpSetup, {
          initialEntries: ['/data_streams'],
          appServicesContext: { url: urlServiceMock },
        });

        // Use waitForElementToBeRemoved for more reliable waiting
        const loadingElement = screen.queryByTestId('sectionLoading');
        if (loadingElement) {
          await waitForElementToBeRemoved(loadingElement);
        }

        await screen.findByTestId('dataStreamTable');
        const actions = createDataStreamTabActions();
        const detailPanelActions = createDataStreamDetailPanelActions();

        await actions.clickNameAt(1);
        await detailPanelActions.waitForDetailPanel();

        expect(await screen.findByTestId('dataRetentionDetail')).toHaveTextContent('7 days');

        await actions.clickEditDataRetentionButton();

        await screen.findByTestId('someIndicesAreManagedByILMCallout');

        // There should be a warning that the data stream is managed by DSL
        // but the backing indices that are managed by ILM wont be affected.
        expect(screen.getByTestId('someIndicesAreManagedByILMCallout')).toBeInTheDocument();
        expect(screen.getByTestId('viewIlmPolicyLink')).toBeInTheDocument();
        expect(screen.getByTestId('viewAllIndicesLink')).toBeInTheDocument();
      });
    });
  });

  describe('when there are special characters', () => {
    const setupSpecialCharactersMocks = () => {
      const dataStreamPercentSign = createDataStreamPayload({ name: '%dataStream' });
      httpRequestsMockHelpers.setLoadIndicesResponse([
        createDataStreamBackingIndex('data-stream-index', '%dataStream'),
        createDataStreamBackingIndex('data-stream-index2', 'dataStream2'),
      ]);
      httpRequestsMockHelpers.setLoadDataStreamsResponse([dataStreamPercentSign]);
      httpRequestsMockHelpers.setLoadDataStreamResponse(
        dataStreamPercentSign.name,
        dataStreamPercentSign
      );
      httpRequestsMockHelpers.setLoadTemplatesResponse({ templates: [], legacyTemplates: [] });
    };

    describe('detail panel', () => {
      test('opens when the data stream name in the table is clicked', async () => {
        setupSpecialCharactersMocks();
        await renderHome(httpSetup, {
          initialEntries: ['/data_streams'],
          appServicesContext: { url: urlServiceMock },
        });

        // Use waitForElementToBeRemoved for more reliable waiting
        const loadingElement = screen.queryByTestId('sectionLoading');
        if (loadingElement) {
          await waitForElementToBeRemoved(loadingElement);
        }

        await screen.findByTestId('dataStreamTable');

        const actions = createDataStreamTabActions();
        const detailPanelActions = createDataStreamDetailPanelActions();

        await actions.clickNameAt(0);
        await detailPanelActions.waitForDetailPanel();

        expect(detailPanelActions.findDetailPanel()).toBeInTheDocument();
        expect(detailPanelActions.findDetailPanelTitle()).toBe('%dataStream');
      });

      test('clicking the indices count navigates to the backing indices', async () => {
        setupSpecialCharactersMocks();
        await renderHome(httpSetup, {
          initialEntries: ['/data_streams'],
          appServicesContext: { url: urlServiceMock },
        });

        // Use waitForElementToBeRemoved for more reliable waiting
        const loadingElement = screen.queryByTestId('sectionLoading');
        if (loadingElement) {
          await waitForElementToBeRemoved(loadingElement);
        }

        await screen.findByTestId('dataStreamTable');

        const actions = createDataStreamTabActions();
        await actions.clickIndicesAt(0);

        await screen.findByTestId('indexTable');
        // Verify we navigate to the indices filtered by data stream
        expect(screen.getByText('data-stream-index')).toBeInTheDocument();
        expect(screen.getByText('%dataStream')).toBeInTheDocument();
      });
    });
  });

  describe('url locators', () => {
    test('with an ILM url locator and an ILM policy', async () => {
      const { setLoadDataStreamsResponse, setLoadDataStreamResponse } = httpRequestsMockHelpers;

      const dataStreamForDetailPanel = createDataStreamPayload({
        name: 'dataStream1',
        ilmPolicyName: 'my_ilm_policy',
      });

      setLoadDataStreamsResponse([dataStreamForDetailPanel]);
      setLoadDataStreamResponse(dataStreamForDetailPanel.name, dataStreamForDetailPanel);

      await renderHome(httpSetup, {
        initialEntries: ['/data_streams'],
        appServicesContext: { url: urlServiceMock },
      });

      await waitFor(() => {
        expect(screen.queryByTestId('sectionLoading')).not.toBeInTheDocument();
      });

      await screen.findByTestId('dataStreamTable');

      const actions = createDataStreamTabActions();
      const detailPanelActions = createDataStreamDetailPanelActions();

      await actions.clickNameAt(0);

      await detailPanelActions.waitForDetailPanel();

      const ilmPolicyLink = await screen.findByTestId('ilmPolicyLink');
      await waitFor(() => {
        expect(ilmPolicyLink.getAttribute('data-href')).toBe('/test/my_ilm_policy');
      });
    });

    test('with an ILM url locator and no ILM policy', async () => {
      const { setLoadDataStreamsResponse, setLoadDataStreamResponse } = httpRequestsMockHelpers;

      const dataStreamForDetailPanel = createDataStreamPayload({ name: 'dataStream1' });

      setLoadDataStreamsResponse([dataStreamForDetailPanel]);
      setLoadDataStreamResponse(dataStreamForDetailPanel.name, dataStreamForDetailPanel);

      await renderHome(httpSetup, {
        initialEntries: ['/data_streams'],
        appServicesContext: { url: urlServiceMock },
      });

      await waitFor(() => {
        expect(screen.queryByTestId('sectionLoading')).not.toBeInTheDocument();
      });

      await screen.findByTestId('dataStreamTable');

      const actions = createDataStreamTabActions();
      const detailPanelActions = createDataStreamDetailPanelActions();

      await actions.clickNameAt(0);

      await detailPanelActions.waitForDetailPanel();

      expect(detailPanelActions.findIlmPolicyLink()).toBeNull();
      expect(detailPanelActions.findIlmPolicyDetail()).toBeNull();
    });

    test('without an ILM url locator and with an ILM policy', async () => {
      const { setLoadDataStreamsResponse, setLoadDataStreamResponse } = httpRequestsMockHelpers;

      const dataStreamForDetailPanel = createDataStreamPayload({
        name: 'dataStream1',
        ilmPolicyName: 'my_ilm_policy',
      });

      setLoadDataStreamsResponse([dataStreamForDetailPanel]);
      setLoadDataStreamResponse(dataStreamForDetailPanel.name, dataStreamForDetailPanel);

      await renderHome(httpSetup, {
        initialEntries: ['/data_streams'],
        appServicesContext: {
          url: {
            locators: {
              get: () => undefined,
            },
          },
        },
      });

      await waitFor(() => {
        expect(screen.queryByTestId('sectionLoading')).not.toBeInTheDocument();
      });

      await screen.findByTestId('dataStreamTable');

      const actions = createDataStreamTabActions();
      const detailPanelActions = createDataStreamDetailPanelActions();

      await actions.clickNameAt(0);

      await detailPanelActions.waitForDetailPanel();

      expect(detailPanelActions.findIlmPolicyLink()).toBeNull();
      expect(await screen.findByTestId('ilmPolicyDetail')).toHaveTextContent('my_ilm_policy');
    });
  });

  describe('managed data streams', () => {
    test('listed in the table with managed label', async () => {
      const managedDataStream = createDataStreamPayload({
        name: 'managed-data-stream',
        _meta: {
          package: 'test',
          managed: true,
          managed_by: 'fleet',
        },
      });
      const nonManagedDataStream = createDataStreamPayload({ name: 'non-managed-data-stream' });

      httpRequestsMockHelpers.setLoadDataStreamsResponse([managedDataStream, nonManagedDataStream]);

      await renderHome(httpSetup, {
        initialEntries: ['/data_streams'],
        appServicesContext: { url: urlServiceMock },
      });

      await waitFor(() => {
        expect(screen.queryByTestId('sectionLoading')).not.toBeInTheDocument();
      });

      await screen.findByTestId('dataStreamTable');

      const tableCellsValues = getTableCellsValues('dataStreamTable');
      expect(tableCellsValues).toEqual([
        [
          '',
          `managed-data-stream${nonBreakingSpace}Managed`,
          'green',
          '1',
          'Standard',
          '7 days',
          'Delete',
        ],
        ['', 'non-managed-data-stream', 'green', '1', 'Standard', '7 days', 'Delete'],
      ]);
    });

    test('turning off "managed" filter hides managed data streams', async () => {
      const managedDataStream = createDataStreamPayload({
        name: 'managed-data-stream',
        _meta: {
          package: 'test',
          managed: true,
          managed_by: 'fleet',
        },
      });
      const nonManagedDataStream = createDataStreamPayload({ name: 'non-managed-data-stream' });

      httpRequestsMockHelpers.setLoadDataStreamsResponse([managedDataStream, nonManagedDataStream]);

      await renderHome(httpSetup, {
        initialEntries: ['/data_streams'],
        appServicesContext: { url: urlServiceMock },
      });

      await waitFor(() => {
        expect(screen.queryByTestId('sectionLoading')).not.toBeInTheDocument();
      });

      await screen.findByTestId('dataStreamTable');

      // Verify initial state
      let tableCellsValues = getTableCellsValues('dataStreamTable');
      expect(tableCellsValues).toEqual([
        [
          '',
          `managed-data-stream${nonBreakingSpace}Managed`,
          'green',
          '1',
          'Standard',
          '7 days',
          'Delete',
        ],
        ['', 'non-managed-data-stream', 'green', '1', 'Standard', '7 days', 'Delete'],
      ]);

      const actions = createDataStreamTabActions();
      await actions.toggleViewFilterAt(0);

      await waitFor(() => {
        tableCellsValues = getTableCellsValues('dataStreamTable');
        expect(tableCellsValues).toEqual([
          ['', 'non-managed-data-stream', 'green', '1', 'Standard', '7 days', 'Delete'],
        ]);
      });
    });
  });

  describe('hidden data streams', () => {
    test('show hidden data streams when filter is toggled', async () => {
      const hiddenDataStream = createDataStreamPayload({
        name: 'hidden-data-stream',
        hidden: true,
      });

      httpRequestsMockHelpers.setLoadDataStreamsResponse([hiddenDataStream]);

      await renderHome(httpSetup, {
        initialEntries: ['/data_streams'],
        appServicesContext: { url: urlServiceMock },
      });

      await waitFor(() => {
        expect(screen.queryByTestId('sectionLoading')).not.toBeInTheDocument();
      });

      await screen.findByTestId('dataStreamTable');

      const actions = createDataStreamTabActions();
      await actions.toggleViewFilterAt(1);

      await waitFor(() => {
        const tableCellsValues = getTableCellsValues('dataStreamTable');
        expect(tableCellsValues).toEqual([
          [
            '',
            `hidden-data-stream${nonBreakingSpace}Hidden`,
            'green',
            '1',
            'Standard',
            '7 days',
            'Delete',
          ],
        ]);
      });
    });
  });

  describe('data stream privileges', () => {
    const dataStreamFullPermissions = createDataStreamPayload({
      name: 'dataStreamFullPermissions',
      privileges: {
        delete_index: true,
        manage_data_stream_lifecycle: true,
        read_failure_store: true,
      },
    });
    const dataStreamNoDelete = createDataStreamPayload({
      name: 'dataStreamNoDelete',
      privileges: {
        delete_index: false,
        manage_data_stream_lifecycle: true,
        read_failure_store: true,
      },
    });
    const dataStreamNoEditRetention = createDataStreamPayload({
      name: 'dataStreamNoEditRetention',
      privileges: {
        delete_index: true,
        manage_data_stream_lifecycle: false,
        read_failure_store: true,
      },
    });
    const dataStreamNoPermissions = createDataStreamPayload({
      name: 'dataStreamNoPermissions',
      privileges: {
        delete_index: false,
        manage_data_stream_lifecycle: false,
        read_failure_store: false,
      },
    });

    const setupPrivilegesMocks = () => {
      httpRequestsMockHelpers.setLoadIndicesResponse([]);
      httpRequestsMockHelpers.setLoadDataStreamsResponse([
        dataStreamFullPermissions,
        dataStreamNoDelete,
        dataStreamNoEditRetention,
        dataStreamNoPermissions,
      ]);
      httpRequestsMockHelpers.setLoadTemplatesResponse({ templates: [], legacyTemplates: [] });
    };

    describe('delete', () => {
      test('displays/hides delete button depending on data streams privileges', async () => {
        setupPrivilegesMocks();
        await renderHome(httpSetup, {
          initialEntries: ['/data_streams'],
          appServicesContext: { url: urlServiceMock },
        });

        // Use waitForElementToBeRemoved for more reliable waiting
        const loadingElement = screen.queryByTestId('sectionLoading');
        if (loadingElement) {
          await waitForElementToBeRemoved(loadingElement);
        }

        await screen.findByTestId('dataStreamTable');
        const tableCellsValues = getTableCellsValues('dataStreamTable');

        expect(tableCellsValues).toEqual([
          ['', 'dataStreamFullPermissions', 'green', '1', 'Standard', '7 days', 'Delete'],
          ['', 'dataStreamNoDelete', 'green', '1', 'Standard', '7 days', ''],
          ['', 'dataStreamNoEditRetention', 'green', '1', 'Standard', '7 days', 'Delete'],
          ['', 'dataStreamNoPermissions', 'green', '1', 'Standard', '7 days', ''],
        ]);
      });

      test('displays/hides delete action depending on data streams privileges', async () => {
        httpRequestsMockHelpers.setLoadIndicesResponse([]);
        httpRequestsMockHelpers.setLoadDataStreamsResponse([
          dataStreamFullPermissions,
          dataStreamNoDelete,
          dataStreamNoEditRetention,
          dataStreamNoPermissions,
        ]);
        httpRequestsMockHelpers.setLoadTemplatesResponse({ templates: [], legacyTemplates: [] });

        await renderHome(httpSetup, {
          initialEntries: ['/data_streams'],
          appServicesContext: { url: urlServiceMock },
        });

        // Use waitForElementToBeRemoved for more reliable waiting
        const loadingElement = screen.queryByTestId('sectionLoading');
        if (loadingElement) {
          await waitForElementToBeRemoved(loadingElement);
        }

        await screen.findByTestId('dataStreamTable');
        const actions = createDataStreamTabActions();

        // Select data stream without delete permission
        actions.selectDataStream('dataStreamNoDelete', true);
        await actions.openBulkActionsPopover();
        expect(screen.queryByTestId('deleteDataStreamsButton')).not.toBeInTheDocument();
        await actions.closeBulkActionsPopover();

        // Select data stream with full permissions (both now selected, one lacks delete)
        actions.selectDataStream('dataStreamFullPermissions', true);
        await actions.openBulkActionsPopover();
        expect(screen.queryByTestId('deleteDataStreamsButton')).not.toBeInTheDocument();
        await actions.closeBulkActionsPopover();

        // Unselect data stream without delete permission (only full permissions selected)
        actions.selectDataStream('dataStreamNoDelete', false);
        await actions.openBulkActionsPopover();
        expect(screen.getByTestId('deleteDataStreamsButton')).toBeInTheDocument();
      });

      test('hides delete button in detail panel', async () => {
        setupPrivilegesMocks();
        httpRequestsMockHelpers.setLoadDataStreamResponse(
          dataStreamNoDelete.name,
          dataStreamNoDelete
        );

        await renderHome(httpSetup, {
          initialEntries: ['/data_streams'],
          appServicesContext: { url: urlServiceMock },
        });

        // Use waitForElementToBeRemoved for more reliable waiting
        const loadingElement = screen.queryByTestId('sectionLoading');
        if (loadingElement) {
          await waitForElementToBeRemoved(loadingElement);
        }

        await screen.findByTestId('dataStreamTable');
        const actions = createDataStreamTabActions();
        const detailPanelActions = createDataStreamDetailPanelActions();

        await actions.clickNameAt(1);
        await detailPanelActions.waitForDetailPanel();

        fireEvent.click(await screen.findByTestId('manageDataStreamButton'));
        await screen.findByText('Data stream options');
        expect(screen.queryByTestId('deleteDataStreamButton')).not.toBeInTheDocument();
      });

      test('displays delete button in detail panel', async () => {
        setupPrivilegesMocks();
        httpRequestsMockHelpers.setLoadDataStreamResponse(
          dataStreamFullPermissions.name,
          dataStreamFullPermissions
        );

        await renderHome(httpSetup, {
          initialEntries: ['/data_streams'],
          appServicesContext: { url: urlServiceMock },
        });

        // Use waitForElementToBeRemoved for more reliable waiting
        const loadingElement = screen.queryByTestId('sectionLoading');
        if (loadingElement) {
          await waitForElementToBeRemoved(loadingElement);
        }

        await screen.findByTestId('dataStreamTable');
        const actions = createDataStreamTabActions();
        const detailPanelActions = createDataStreamDetailPanelActions();

        await actions.clickNameAt(0);
        await detailPanelActions.waitForDetailPanel();

        fireEvent.click(await screen.findByTestId('manageDataStreamButton'));
        await screen.findByText('Data stream options');
        expect(screen.getByTestId('deleteDataStreamButton')).toBeInTheDocument();
      });
    });

    describe('edit data retention', () => {
      test('displays/hides bulk edit retention action depending on data streams privileges', async () => {
        httpRequestsMockHelpers.setLoadIndicesResponse([]);
        httpRequestsMockHelpers.setLoadDataStreamsResponse([
          dataStreamFullPermissions,
          dataStreamNoDelete,
          dataStreamNoEditRetention,
          dataStreamNoPermissions,
        ]);
        httpRequestsMockHelpers.setLoadTemplatesResponse({ templates: [], legacyTemplates: [] });

        await renderHome(httpSetup, {
          initialEntries: ['/data_streams'],
          appServicesContext: { url: urlServiceMock },
        });

        // Use waitForElementToBeRemoved for more reliable waiting
        const loadingElement = screen.queryByTestId('sectionLoading');
        if (loadingElement) {
          await waitForElementToBeRemoved(loadingElement);
        }

        await screen.findByTestId('dataStreamTable');
        const actions = createDataStreamTabActions();

        // Select data stream without edit retention permission
        actions.selectDataStream('dataStreamNoEditRetention', true);
        await actions.openBulkActionsPopover();
        expect(screen.queryByTestId('bulkEditDataRetentionButton')).not.toBeInTheDocument();
        await actions.closeBulkActionsPopover();

        // Select data stream with full permissions (both now selected, one lacks retention edit)
        actions.selectDataStream('dataStreamFullPermissions', true);
        await actions.openBulkActionsPopover();
        expect(screen.queryByTestId('bulkEditDataRetentionButton')).not.toBeInTheDocument();
        await actions.closeBulkActionsPopover();

        // Unselect data stream without edit retention permission (only full permissions selected)
        actions.selectDataStream('dataStreamNoEditRetention', false);
        await actions.openBulkActionsPopover();
        expect(screen.getByTestId('bulkEditDataRetentionButton')).toBeInTheDocument();
      });

      test('hides edit retention button in detail panel', async () => {
        setupPrivilegesMocks();
        httpRequestsMockHelpers.setLoadDataStreamResponse(
          dataStreamNoEditRetention.name,
          dataStreamNoEditRetention
        );

        await renderHome(httpSetup, {
          initialEntries: ['/data_streams'],
          appServicesContext: { url: urlServiceMock },
        });

        // Use waitForElementToBeRemoved for more reliable waiting
        const loadingElement = screen.queryByTestId('sectionLoading');
        if (loadingElement) {
          await waitForElementToBeRemoved(loadingElement);
        }

        await screen.findByTestId('dataStreamTable');
        const actions = createDataStreamTabActions();
        const detailPanelActions = createDataStreamDetailPanelActions();

        await actions.clickNameAt(2);
        await detailPanelActions.waitForDetailPanel();

        fireEvent.click(await screen.findByTestId('manageDataStreamButton'));
        await screen.findByText('Data stream options');
        expect(screen.queryByTestId('editDataRetentionButton')).not.toBeInTheDocument();
      });

      test('displays edit retention button in detail panel', async () => {
        setupPrivilegesMocks();
        httpRequestsMockHelpers.setLoadDataStreamResponse(
          dataStreamFullPermissions.name,
          dataStreamFullPermissions
        );

        await renderHome(httpSetup, {
          initialEntries: ['/data_streams'],
          appServicesContext: { url: urlServiceMock },
        });

        // Use waitForElementToBeRemoved for more reliable waiting
        const loadingElement = screen.queryByTestId('sectionLoading');
        if (loadingElement) {
          await waitForElementToBeRemoved(loadingElement);
        }

        await screen.findByTestId('dataStreamTable');
        const actions = createDataStreamTabActions();
        const detailPanelActions = createDataStreamDetailPanelActions();

        await actions.clickNameAt(0);
        await detailPanelActions.waitForDetailPanel();

        fireEvent.click(await screen.findByTestId('manageDataStreamButton'));
        await screen.findByText('Data stream options');
        expect(screen.getByTestId('editDataRetentionButton')).toBeInTheDocument();
      });
    });

    describe('with no permissions', () => {
      test('hides manage button in details panel', async () => {
        setupPrivilegesMocks();
        httpRequestsMockHelpers.setLoadDataStreamResponse(
          dataStreamNoPermissions.name,
          dataStreamNoPermissions
        );

        await renderHome(httpSetup, {
          initialEntries: ['/data_streams'],
          appServicesContext: { url: urlServiceMock },
        });

        // Use waitForElementToBeRemoved for more reliable waiting
        const loadingElement = screen.queryByTestId('sectionLoading');
        if (loadingElement) {
          await waitForElementToBeRemoved(loadingElement);
        }

        await screen.findByTestId('dataStreamTable');
        const actions = createDataStreamTabActions();
        const detailPanelActions = createDataStreamDetailPanelActions();

        await actions.clickNameAt(3);
        await detailPanelActions.waitForDetailPanel();

        expect(screen.queryByTestId('manageDataStreamButton')).not.toBeInTheDocument();
      });

      test('hides manage button for bulk actions', async () => {
        setupPrivilegesMocks();

        await renderHome(httpSetup, {
          initialEntries: ['/data_streams'],
          appServicesContext: { url: urlServiceMock },
        });

        // Use waitForElementToBeRemoved for more reliable waiting
        const loadingElement = screen.queryByTestId('sectionLoading');
        if (loadingElement) {
          await waitForElementToBeRemoved(loadingElement);
        }

        await screen.findByTestId('dataStreamTable');
        const actions = createDataStreamTabActions();

        actions.selectDataStream('dataStreamNoPermissions', true);
        expect(screen.queryByTestId('dataStreamActionsPopoverButton')).not.toBeInTheDocument();
      });
    });
  });
});
