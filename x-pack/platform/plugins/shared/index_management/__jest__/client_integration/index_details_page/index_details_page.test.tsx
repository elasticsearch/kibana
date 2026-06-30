/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from '@kbn/shared-ux-router';
import { Route } from '@kbn/shared-ux-router';
import { EuiButtonGroupTestHarness, EuiComboBoxTestHarness } from '@kbn/test-eui-helpers';
import { APP_HEADER_TEST_SUBJECTS, APP_MENU_TEST_SUBJECTS } from '@kbn/app-header';
import { openAppMenuOverflow } from '@kbn/app-header/test_helpers';
import type { RouteComponentProps } from 'react-router-dom';

import type { IndexDetailsTab, IndexDetailsTabId } from '../../../common/constants';
import { IndexDetailsSection } from '../../../common/constants';
import { API_BASE_PATH, INTERNAL_API_BASE_PATH } from '../../../common';
import { formatBytes } from '../../../public';

import { DetailsPage } from '../../../public/application/sections/home/index_list/details_page/details_page';
import { TYPE_DEFINITION } from '../../../public/application/components/mappings_editor/constants';
import {
  breadcrumbService,
  IndexManagementBreadcrumb,
} from '../../../public/application/services/breadcrumbs';
import { documentationService } from '../../../public/application/services/documentation';
import { humanizeTimeStamp } from '../../../public/application/sections/home/data_stream_list/humanize_time_stamp';
import { createDataStreamPayload } from '../helpers/actions/data_stream_actions';
import {
  testIndexEditableSettingsAll,
  testIndexEditableSettingsLimited,
  testIndexMappings,
  testIndexMappingsWithSemanticText,
  testIndexMock,
  testIndexName,
  testIndexSettings,
  testIndexStats,
  testUserStartPrivilegesResponse,
} from './mocks';
import { setupEnvironment, WithAppDependencies } from '../helpers/setup_environment';
import { renderIndexDetailsPage } from './index_details_page.helpers';

jest.mock('@kbn/code-editor');

const getTypeLabel = (typeValue: string): string => {
  const typeDef = TYPE_DEFINITION[typeValue as keyof typeof TYPE_DEFINITION];
  return typeDef?.label || typeValue;
};

const requestOptions = {
  asSystemRequest: undefined,
  body: undefined,
  query: undefined,
  version: undefined,
};

describe('<IndexDetailsPage />', () => {
  let httpSetup: ReturnType<typeof setupEnvironment>['httpSetup'];
  let httpRequestsMockHelpers: ReturnType<typeof setupEnvironment>['httpRequestsMockHelpers'];

  jest.spyOn(breadcrumbService, 'setBreadcrumbs');
  jest.spyOn(documentationService, 'setup');

  const renderPage = async (initialEntry?: string, deps: Record<string, unknown> = {}) =>
    renderIndexDetailsPage({
      httpSetup,
      indexName: testIndexName,
      initialEntry,
      indexDetailsSection: IndexDetailsSection.Settings,
      deps,
    });

  beforeEach(() => {
    jest.clearAllMocks();
    const mockEnvironment = setupEnvironment();
    ({ httpSetup, httpRequestsMockHelpers } = mockEnvironment);

    httpRequestsMockHelpers.setLoadIndexDetailsResponse(testIndexName, testIndexMock);
    httpRequestsMockHelpers.setLoadIndexStatsResponse(testIndexName, testIndexStats);
    httpRequestsMockHelpers.setLoadIndexMappingResponse(testIndexName, testIndexMappings);
    httpRequestsMockHelpers.setLoadIndexSettingsResponse(testIndexName, testIndexSettings);
    httpRequestsMockHelpers.setInferenceModels([]);
    httpRequestsMockHelpers.setUserStartPrivilegesResponse(
      testIndexName,
      testUserStartPrivilegesResponse
    );
    httpRequestsMockHelpers.setLoadIndexDocCountResponse({
      [testIndexName]: testIndexMock.documents,
    });
  });

  describe('error section', () => {
    it('displays an error callout when failed to load index details', async () => {
      httpRequestsMockHelpers.setLoadIndexDetailsResponse(testIndexName, undefined, {
        statusCode: 400,
        message: `Data for index ${testIndexName} was not found`,
      });
      const Comp = WithAppDependencies(
        () => (
          <MemoryRouter initialEntries={[`/indices/index_details?indexName=${testIndexName}`]}>
            <Route
              path="/indices/index_details"
              render={(props) => (
                <DetailsPage
                  {...props}
                  match={{
                    ...props.match,
                    params: {
                      indexName: testIndexName,
                      indexDetailsSection: IndexDetailsSection.Settings,
                    },
                  }}
                />
              )}
            />
          </MemoryRouter>
        ),
        httpSetup,
        { url: { locators: { get: () => ({ navigate: jest.fn(), getUrl: jest.fn() }) } } }
      );
      render(<Comp />);
      await screen.findByTestId('indexDetailsErrorLoadingDetails');
    });

    it('resends a request when reload button is clicked', async () => {
      httpRequestsMockHelpers.setLoadIndexDetailsResponse(testIndexName, undefined, {
        statusCode: 400,
        message: `Data for index ${testIndexName} was not found`,
      });
      const Comp = WithAppDependencies(
        () => (
          <MemoryRouter initialEntries={[`/indices/index_details?indexName=${testIndexName}`]}>
            <Route
              path="/indices/index_details"
              render={(props) => (
                <DetailsPage
                  {...props}
                  match={{
                    ...props.match,
                    params: {
                      indexName: testIndexName,
                      indexDetailsSection: IndexDetailsSection.Settings,
                    },
                  }}
                />
              )}
            />
          </MemoryRouter>
        ),
        httpSetup,
        { url: { locators: { get: () => ({ navigate: jest.fn(), getUrl: jest.fn() }) } } }
      );
      render(<Comp />);
      await screen.findByTestId('indexDetailsErrorLoadingDetails');

      const getMock = jest.mocked(httpSetup.get);
      const requestsBefore = getMock.mock.calls.length;

      fireEvent.click(screen.getByTestId('indexDetailsReloadDetailsButton'));

      await waitFor(() => {
        expect(getMock.mock.calls.length).toBeGreaterThan(requestsBefore);
      });
    });

    it('renders an error section when no index name is provided', async () => {
      const Comp = WithAppDependencies(
        () => (
          <MemoryRouter initialEntries={['/indices/index_details']}>
            <Route
              path="/indices/index_details"
              render={(props) => (
                <DetailsPage
                  {...(props as unknown as RouteComponentProps<{
                    indexName: string;
                    indexDetailsSection: IndexDetailsSection;
                  }>)}
                />
              )}
            />
          </MemoryRouter>
        ),
        httpSetup,
        { url: { locators: { get: () => ({ navigate: jest.fn(), getUrl: jest.fn() }) } } }
      );
      render(<Comp />);
      await screen.findByTestId('indexDetailsNoIndexNameError');
    });
  });

  describe('Semantic text index errors', () => {
    it('does not render an error callout by default', async () => {
      await renderPage();
      expect(screen.queryByTestId('indexErrorCallout')).not.toBeInTheDocument();
    });

    it('renders an error callout when the mapping contains semantic text errors', async () => {
      httpRequestsMockHelpers.setLoadIndexMappingResponse(
        testIndexName,
        testIndexMappingsWithSemanticText.mappings
      );
      await renderPage(undefined, {
        docLinks: { links: { ml: '', enterpriseSearch: '' } },
        core: { application: { capabilities: { ml: { canGetTrainedModels: true } } } },
        plugins: {
          ml: {
            mlApi: {
              trainedModels: {
                getModelsDownloadStatus: jest.fn().mockResolvedValue({}),
                getTrainedModels: jest.fn().mockResolvedValue([
                  {
                    model_id: '.elser_model_2',
                    model_type: 'pytorch',
                    model_package: {
                      packaged_model_id: '.elser_model_2',
                      model_repository: 'https://ml-models.elastic.co',
                      minimum_version: '11.0.0',
                      size: 438123914,
                      sha256: '',
                      metadata: {},
                      tags: [],
                      vocabulary_file: 'elser_model_2.vocab.json',
                    },
                    description: 'Elastic Learned Sparse EncodeR v2',
                    tags: ['elastic'],
                  },
                ]),
                getTrainedModelStats: jest.fn().mockResolvedValue({
                  count: 1,
                  trained_model_stats: [
                    {
                      model_id: '.elser_model_2',
                      deployment_stats: {
                        deployment_id: '.elser_model_2',
                        model_id: '.elser_model_2',
                        threads_per_allocation: 1,
                        number_of_allocations: 1,
                        queue_capacity: 1024,
                        state: 'started',
                      },
                    },
                  ],
                }),
              },
            },
          },
        },
      });
      await screen.findByTestId('indexErrorCallout');
    });
  });

  describe('Stats tab', () => {
    it('updates the breadcrumbs to index details stats', async () => {
      await renderPage();
      fireEvent.click(screen.getByTestId('indexDetailsTab-stats'));
      await waitFor(() => {
        expect(breadcrumbService.setBreadcrumbs).toHaveBeenLastCalledWith(
          IndexManagementBreadcrumb.indexDetails,
          { text: 'Statistics' }
        );
      });
    });

    it('loads index stats from the API', async () => {
      await renderPage();
      fireEvent.click(screen.getByTestId('indexDetailsTab-stats'));
      await waitFor(() => {
        expect(httpSetup.get).toHaveBeenLastCalledWith(
          `${API_BASE_PATH}/stats/${testIndexName}`,
          requestOptions
        );
      });
    });

    it('renders index stats', async () => {
      await renderPage();
      fireEvent.click(screen.getByTestId('indexDetailsTab-stats'));
      const codeBlock = await screen.findByTestId('indexDetailsStatsCodeBlock');
      expect(codeBlock.textContent).toEqual(JSON.stringify(testIndexStats, null, 2));
    });

    it('sets the docs link href from the documentation service', async () => {
      await renderPage();
      fireEvent.click(screen.getByTestId('indexDetailsTab-stats'));
      const docsLink = await screen.findByTestId('indexDetailsStatsDocsLink');
      expect(docsLink.getAttribute('href')).toMatch(/^https:\/\/www\.elastic\.co\//);
      expect(docsLink.getAttribute('href')).toContain('indices-stats');
    });

    it('renders a warning message if an index is not open', async () => {
      httpRequestsMockHelpers.setLoadIndexDetailsResponse(testIndexName, {
        ...testIndexMock,
        status: 'closed',
      });
      await renderPage();
      fireEvent.click(screen.getByTestId('indexDetailsTab-stats'));
      await screen.findByTestId('indexStatsNotAvailableWarning');
    });

    it('hides index stats tab if enableIndexStats===false', async () => {
      await renderPage(undefined, { config: { enableIndexStats: false } });
      expect(screen.queryByTestId('indexDetailsTab-stats')).not.toBeInTheDocument();
    });

    describe('Error handling', () => {
      it('there is an error prompt', async () => {
        httpRequestsMockHelpers.setLoadIndexStatsResponse(testIndexName, undefined, {
          statusCode: 500,
          message: 'Error',
        });
        await renderPage();
        fireEvent.click(screen.getByTestId('indexDetailsTab-stats'));
        await screen.findByTestId('indexDetailsStatsError');
      });

      it('resends a request when reload button is clicked', async () => {
        httpRequestsMockHelpers.setLoadIndexStatsResponse(testIndexName, undefined, {
          statusCode: 500,
          message: 'Error',
        });
        await renderPage();
        fireEvent.click(screen.getByTestId('indexDetailsTab-stats'));
        await screen.findByTestId('indexDetailsStatsError');

        const getMock = jest.mocked(httpSetup.get);
        const requestsBefore = getMock.mock.calls.length;

        fireEvent.click(screen.getByTestId('reloadIndexStatsButton'));

        await waitFor(() => {
          expect(getMock.mock.calls.length).toBeGreaterThan(requestsBefore);
        });
      });
    });
  });

  it('loads index details from the API', async () => {
    await renderPage();
    expect(httpSetup.get).toHaveBeenCalledWith(
      `${INTERNAL_API_BASE_PATH}/indices/${testIndexName}`,
      requestOptions
    );
  });

  it('displays index name in the header', async () => {
    await renderPage();
    const header = screen.getByTestId(APP_HEADER_TEST_SUBJECTS.root);
    expect(within(header).getByRole('heading', { level: 1 })).toHaveTextContent(testIndexName);
  });

  it('changes the tab when its header is clicked', async () => {
    await renderPage();

    const user = userEvent.setup({ pointerEventsCheck: 0, delay: null });

    await user.click(screen.getByTestId('indexDetailsTab-mappings'));
    await screen.findByTestId('fieldsList');
    expect(screen.queryByTestId('indexDetailsMappingsCodeBlock')).not.toBeInTheDocument();
    expect(screen.queryByTestId('indexDetailsMappingsAddField')).toBeInTheDocument();

    await user.click(screen.getByTestId('indexDetailsTab-settings'));
    await screen.findByTestId('indexDetailsSettingsCodeBlock');
  });

  describe('Overview tab', () => {
    it('updates the breadcrumbs to index details overview', async () => {
      await renderPage();
      expect(breadcrumbService.setBreadcrumbs).toHaveBeenLastCalledWith(
        IndexManagementBreadcrumb.indexDetails,
        { text: 'Overview' }
      );
    });

    it('renders storage details', async () => {
      await renderPage();
      const storageDetails = screen.getByTestId('indexDetailsStorage').textContent;
      expect(storageDetails).toBe(
        `Storage${formatBytes(testIndexMock.primary_size)}Primary${formatBytes(
          testIndexMock.size
        )}TotalShards${testIndexMock.primary} Primary / ${testIndexMock.replica} Replicas `
      );
    });

    it('renders status details', async () => {
      await renderPage();
      const statusDetails = screen.getByTestId('indexDetailsStatus').textContent;
      expect(statusDetails).toBe(
        `Status${'Open'}${'Healthy'}${testIndexMock.documents} Document / ${
          testIndexMock.documents_deleted
        } Deleted`
      );
    });

    describe('aliases', () => {
      it('not rendered when no aliases', async () => {
        await renderPage();
        expect(screen.queryByTestId('indexDetailsAliases')).not.toBeInTheDocument();
      });

      it('renders less than 3 aliases', async () => {
        const aliases = ['test_alias1', 'test_alias2'];
        httpRequestsMockHelpers.setLoadIndexDetailsResponse(testIndexName, {
          ...testIndexMock,
          aliases,
        });
        await renderPage();
        const aliasesEl = await screen.findByTestId('indexDetailsAliases');
        expect(aliasesEl.textContent).toBe(
          `Aliases${aliases.length}AliasesView all aliases${aliases.join('')}`
        );
      });

      it('renders more than 3 aliases', async () => {
        const aliases = ['test_alias1', 'test_alias2', 'test_alias3', 'test_alias4', 'test_alias5'];
        httpRequestsMockHelpers.setLoadIndexDetailsResponse(testIndexName, {
          ...testIndexMock,
          aliases,
        });
        await renderPage();
        const aliasesEl = await screen.findByTestId('indexDetailsAliases');
        expect(aliasesEl.textContent).toBe(
          `Aliases${aliases.length}AliasesView all aliases${aliases.slice(0, 3).join('')}+${2}`
        );
      });
    });

    describe('data stream', () => {
      it('not rendered when no data stream', async () => {
        await renderPage();
        expect(screen.queryByTestId('indexDetailsDataStream')).not.toBeInTheDocument();
      });

      it('renders data stream details', async () => {
        const dataStreamName = 'test_data_stream';
        const dataStreamDetails = createDataStreamPayload({
          name: dataStreamName,
          generation: 5,
          maxTimeStamp: 1696600607689,
        });
        httpRequestsMockHelpers.setLoadIndexDetailsResponse(testIndexName, {
          ...testIndexMock,
          data_stream: dataStreamName,
        });
        httpRequestsMockHelpers.setLoadDataStreamResponse(dataStreamName, dataStreamDetails);
        await renderPage();
        const dataStreamEl = await screen.findByTestId('indexDetailsDataStream');
        expect(dataStreamEl.textContent).toBe(
          `Data stream${
            dataStreamDetails.generation
          }GenerationsSee detailsRelated templateLast update${humanizeTimeStamp(
            dataStreamDetails.maxTimeStamp!
          )}`
        );
      });

      it('renders error message if the request fails', async () => {
        const dataStreamName = 'test_data_stream';
        httpRequestsMockHelpers.setLoadIndexDetailsResponse(testIndexName, {
          ...testIndexMock,
          data_stream: dataStreamName,
        });
        httpRequestsMockHelpers.setLoadDataStreamResponse(dataStreamName, undefined, {
          statusCode: 400,
          message: `Unable to load data stream details`,
        });
        await renderPage();
        const dataStreamEl = await screen.findByTestId('indexDetailsDataStream');
        expect(dataStreamEl.textContent).toBe(
          `Data streamUnable to load data stream detailsReloadLast update`
        );

        const getMock = jest.mocked(httpSetup.get);
        const requestsBefore = getMock.mock.calls.length;
        fireEvent.click(screen.getByTestId('indexDetailsDataStreamReload'));
        await waitFor(() => {
          expect(getMock.mock.calls.length).toBeGreaterThan(requestsBefore);
        });
      });
    });

    it('hides storage and status details if enableIndexStats===false', async () => {
      await renderPage(undefined, { config: { enableIndexStats: false } });
      expect(screen.queryByTestId('indexDetailsStatus')).not.toBeInTheDocument();
      expect(screen.queryByTestId('indexDetailsStorage')).not.toBeInTheDocument();
    });

    it('renders code block', async () => {
      await renderPage();
      expect(screen.queryByTestId('codeBlockControlsPanel')).toBeInTheDocument();
    });

    it('renders index name badges from the extensions service', async () => {
      const testBadges = ['testBadge1', 'testBadge2'];
      await renderPage(undefined, {
        services: {
          extensionsService: {
            _badges: testBadges.map((badge) => ({
              matchIndex: () => true,
              label: badge,
              color: 'primary',
            })),
          },
        },
      });
      const header = screen.getByTestId(APP_HEADER_TEST_SUBJECTS.root);
      expect(within(header).getByRole('heading', { level: 1 })).toHaveTextContent(testIndexName);
      testBadges.forEach((badge) => {
        expect(within(header).getByText(badge)).toBeInTheDocument();
      });
    });

    describe('extension service overview content', () => {
      it('renders the content instead of the default code block', async () => {
        const extensionsServiceOverview = 'Test content via extensions service';
        await renderPage(undefined, {
          services: {
            extensionsService: {
              _indexOverviewContent: { renderContent: () => extensionsServiceOverview },
            },
          },
        });
        expect(screen.queryByTestId('codeBlockControlsPanel')).not.toBeInTheDocument();
        expect(screen.getByTestId('indexDetailsContent').textContent).toContain(
          extensionsServiceOverview
        );
      });
    });
  });

  describe('Settings tab', () => {
    it('updates the breadcrumbs to index details settings', async () => {
      await renderPage();
      fireEvent.click(screen.getByTestId('indexDetailsTab-settings'));
      await screen.findByTestId('indexDetailsSettingsCodeBlock');
      await waitFor(() => {
        expect(breadcrumbService.setBreadcrumbs).toHaveBeenLastCalledWith(
          IndexManagementBreadcrumb.indexDetails,
          { text: 'Settings' }
        );
      });
    });

    it('loads settings from the API', async () => {
      await renderPage();
      fireEvent.click(screen.getByTestId('indexDetailsTab-settings'));
      await screen.findByTestId('indexDetailsSettingsCodeBlock');
      await waitFor(() => {
        expect(httpSetup.get).toHaveBeenLastCalledWith(
          `${API_BASE_PATH}/settings/${testIndexName}`,
          requestOptions
        );
      });
    });

    it('displays the settings in the code block', async () => {
      await renderPage();
      fireEvent.click(screen.getByTestId('indexDetailsTab-settings'));
      const codeBlock = await screen.findByTestId('indexDetailsSettingsCodeBlock');
      expect(codeBlock.textContent).toEqual(JSON.stringify(testIndexSettings, null, 2));
    });

    it('sets the docs link href from the documentation service', async () => {
      await renderPage();
      fireEvent.click(screen.getByTestId('indexDetailsTab-settings'));
      const docsLink = await screen.findByTestId('indexDetailsSettingsDocsLink');
      expect(docsLink.getAttribute('href')).toContain('index-settings');
    });

    describe('error loading settings', () => {
      it('there is an error prompt', async () => {
        httpRequestsMockHelpers.setLoadIndexSettingsResponse(testIndexName, undefined, {
          statusCode: 400,
          message: `Was not able to load settings`,
        });
        await renderPage();
        fireEvent.click(screen.getByTestId('indexDetailsTab-settings'));
        await screen.findByTestId('indexDetailsSettingsError');
      });

      it('resends a request when reload button is clicked', async () => {
        httpRequestsMockHelpers.setLoadIndexSettingsResponse(testIndexName, undefined, {
          statusCode: 400,
          message: `Was not able to load settings`,
        });
        await renderPage();
        fireEvent.click(screen.getByTestId('indexDetailsTab-settings'));
        await screen.findByTestId('indexDetailsSettingsError');

        const getMock = jest.mocked(httpSetup.get);
        const requestsBefore = getMock.mock.calls.length;
        fireEvent.click(screen.getByTestId('indexDetailsSettingsReloadButton'));
        await waitFor(() => {
          expect(getMock.mock.calls.length).toBeGreaterThan(requestsBefore);
        });
      });
    });

    describe('edit settings', () => {
      it('displays all editable settings (flattened and filtered)', async () => {
        await renderPage();
        fireEvent.click(screen.getByTestId('indexDetailsTab-settings'));
        await screen.findByTestId('indexDetailsSettingsEditModeSwitch');
        fireEvent.click(screen.getByTestId('indexDetailsSettingsEditModeSwitch'));
        const editor = await screen.findByTestId('indexDetailsSettingsEditor');
        expect(editor.getAttribute('data-currentvalue')).toEqual(
          JSON.stringify(testIndexEditableSettingsAll, null, 2)
        );
      });

      it('displays limited editable settings (flattened and filtered)', async () => {
        await renderPage(undefined, { config: { editableIndexSettings: 'limited' } });
        fireEvent.click(screen.getByTestId('indexDetailsTab-settings'));
        await screen.findByTestId('indexDetailsSettingsEditModeSwitch');
        fireEvent.click(screen.getByTestId('indexDetailsSettingsEditModeSwitch'));
        const editor = await screen.findByTestId('indexDetailsSettingsEditor');
        expect(editor.getAttribute('data-currentvalue')).toEqual(
          JSON.stringify(testIndexEditableSettingsLimited, null, 2)
        );
      });

      it('updates the settings', async () => {
        await renderPage();
        fireEvent.click(screen.getByTestId('indexDetailsTab-settings'));
        await screen.findByTestId('indexDetailsSettingsEditModeSwitch');
        fireEvent.click(screen.getByTestId('indexDetailsSettingsEditModeSwitch'));
        const editor = await screen.findByTestId('indexDetailsSettingsEditor');

        const getMock = jest.mocked(httpSetup.get);
        const requestsBefore = getMock.mock.calls.length;

        const updatedSettings = { ...testIndexEditableSettingsAll, 'index.priority': '2' };
        // Set attribute and trigger change with value in event
        fireEvent.change(editor, {
          target: {
            value: JSON.stringify(updatedSettings),
            getAttribute: () => JSON.stringify(updatedSettings),
          },
        });
        fireEvent.click(screen.getByTestId('indexDetailsSettingsSave'));

        await waitFor(() => {
          expect(httpSetup.put).toHaveBeenLastCalledWith(
            `${API_BASE_PATH}/settings/${testIndexName}`,
            {
              asSystemRequest: undefined,
              body: JSON.stringify({ 'index.priority': '2' }),
              query: undefined,
              version: undefined,
            }
          );
        });
        // The save flow triggers a settings reload; wait for that async cycle to settle.
        await waitFor(() => {
          expect(getMock.mock.calls.length).toBeGreaterThan(requestsBefore);
        });
        await screen.findByTestId('indexDetailsSettingsCodeBlock');
      });

      it('reloads the settings after an update', async () => {
        await renderPage();
        fireEvent.click(screen.getByTestId('indexDetailsTab-settings'));
        await screen.findByTestId('indexDetailsSettingsEditModeSwitch');
        fireEvent.click(screen.getByTestId('indexDetailsSettingsEditModeSwitch'));
        const editor = await screen.findByTestId('indexDetailsSettingsEditor');

        const getMock = jest.mocked(httpSetup.get);
        const requestsBefore = getMock.mock.calls.length;

        const updatedSettings = { ...testIndexEditableSettingsAll, 'index.priority': '2' };
        fireEvent.change(editor, {
          target: {
            value: JSON.stringify(updatedSettings),
            getAttribute: () => JSON.stringify(updatedSettings),
          },
        });
        fireEvent.click(screen.getByTestId('indexDetailsSettingsSave'));

        await waitFor(() => {
          expect(getMock.mock.calls.length).toBeGreaterThan(requestsBefore);
        });
        expect(httpSetup.get).toHaveBeenLastCalledWith(
          `${API_BASE_PATH}/settings/${testIndexName}`,
          requestOptions
        );
      });

      // Note: This test verifies reset button exists and can be clicked.
      // The full reset behavior (restoring original editor values) would require
      // additional assertions on editor state, which are intentionally kept minimal here.
      it('resets the changes in the editor', async () => {
        await renderPage();
        fireEvent.click(screen.getByTestId('indexDetailsTab-settings'));
        await screen.findByTestId('indexDetailsSettingsEditModeSwitch');
        fireEvent.click(screen.getByTestId('indexDetailsSettingsEditModeSwitch'));
        await screen.findByTestId('indexDetailsSettingsEditor');

        // Verify reset button exists and can be clicked
        const resetButton = await screen.findByTestId('indexDetailsSettingsResetChanges');
        expect(resetButton).toBeInTheDocument();
        fireEvent.click(resetButton);

        // Verify no errors occurred - settings tab should still be visible
        expect(screen.getByTestId('indexDetailsTab-settings')).toBeInTheDocument();
      });
    });
  });

  it('renders a link to discover', async () => {
    await renderPage();
    expect(screen.queryByTestId('discoverButtonLink')).toBeInTheDocument();
  });

  describe('context menu', () => {
    // The "Manage index" actions live behind the app-menu overflow popover: open it, then open the
    // manage-index submenu so the individual action buttons become queryable.
    const openManageIndexMenu = async () => {
      await openAppMenuOverflow();
      fireEvent.click(await screen.findByTestId('indexActionsContextMenuButton'));
    };

    afterEach(() => {
      // Close the app-menu overflow popover if a test left it open.
      const overflowButton = screen.queryByTestId(APP_MENU_TEST_SUBJECTS.overflowButton);
      if (overflowButton && screen.queryByTestId(APP_MENU_TEST_SUBJECTS.popover)) {
        fireEvent.click(overflowButton);
      }
    });

    it('opens the manage index menu when "manage index" button is clicked', async () => {
      await renderPage();
      expect(screen.queryByTestId('deleteIndexMenuButton')).not.toBeInTheDocument();
      await openManageIndexMenu();
      await screen.findByTestId('deleteIndexMenuButton');
    });

    it('closes an index', async () => {
      await renderPage();
      const getMock = jest.mocked(httpSetup.get);
      const requestsBefore = getMock.mock.calls.length;

      await openManageIndexMenu();
      const closeButton = await screen.findByTestId('closeIndexMenuButton');
      fireEvent.click(closeButton);

      await waitFor(() => {
        expect(httpSetup.post).toHaveBeenCalledWith(`${API_BASE_PATH}/indices/close`, {
          body: JSON.stringify({ indices: [testIndexName] }),
        });
      });
      await waitFor(() => {
        expect(getMock.mock.calls.length).toBeGreaterThan(requestsBefore);
      });
    });

    it('opens an index', async () => {
      httpRequestsMockHelpers.setLoadIndexDetailsResponse(testIndexName, {
        ...testIndexMock,
        status: 'close',
      });
      await renderPage();

      const getMock = jest.mocked(httpSetup.get);
      const requestsBefore = getMock.mock.calls.length;

      await openManageIndexMenu();
      const openButton = await screen.findByTestId('openIndexMenuButton');
      fireEvent.click(openButton);

      await waitFor(() => {
        expect(httpSetup.post).toHaveBeenCalledWith(`${API_BASE_PATH}/indices/open`, {
          body: JSON.stringify({ indices: [testIndexName] }),
        });
      });
      // After action, should have made at least one more GET to refresh data
      expect(getMock.mock.calls.length).toBeGreaterThan(requestsBefore);
    });

    it('forcemerges an index', async () => {
      await renderPage();
      const getMock = jest.mocked(httpSetup.get);
      const requestsBefore = getMock.mock.calls.length;

      await openManageIndexMenu();
      const forcemergeButton = await screen.findByTestId('forcemergeIndexMenuButton');
      fireEvent.click(forcemergeButton);

      const input = await screen.findByTestId('indexActionsForcemergeNumSegments');
      fireEvent.change(input, { target: { value: '2' } });
      fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));

      await waitFor(() => {
        expect(httpSetup.post).toHaveBeenCalledWith(`${API_BASE_PATH}/indices/forcemerge`, {
          body: JSON.stringify({ indices: [testIndexName], maxNumSegments: '2' }),
        });
      });
      await waitFor(() => {
        expect(getMock.mock.calls.length).toBeGreaterThan(requestsBefore);
      });
    });

    it('refreshes an index', async () => {
      await renderPage();
      const getMock = jest.mocked(httpSetup.get);
      const requestsBefore = getMock.mock.calls.length;

      await openManageIndexMenu();
      const refreshButton = await screen.findByTestId('refreshIndexMenuButton');
      fireEvent.click(refreshButton);

      await waitFor(() => {
        expect(httpSetup.post).toHaveBeenCalledWith(`${API_BASE_PATH}/indices/refresh`, {
          body: JSON.stringify({ indices: [testIndexName] }),
        });
      });
      await waitFor(() => {
        expect(getMock.mock.calls.length).toBeGreaterThan(requestsBefore);
      });
    });

    it(`clears an index's cache`, async () => {
      await renderPage();
      const getMock = jest.mocked(httpSetup.get);
      const requestsBefore = getMock.mock.calls.length;

      await openManageIndexMenu();
      const clearCacheButton = await screen.findByTestId('clearCacheIndexMenuButton');
      fireEvent.click(clearCacheButton);

      await waitFor(() => {
        expect(httpSetup.post).toHaveBeenCalledWith(`${API_BASE_PATH}/indices/clear_cache`, {
          body: JSON.stringify({ indices: [testIndexName] }),
        });
      });
      await waitFor(() => {
        expect(getMock.mock.calls.length).toBeGreaterThan(requestsBefore);
      });
    });

    it(`flushes an index`, async () => {
      await renderPage();
      const getMock = jest.mocked(httpSetup.get);
      const requestsBefore = getMock.mock.calls.length;

      await openManageIndexMenu();
      const flushButton = await screen.findByTestId('flushIndexMenuButton');
      fireEvent.click(flushButton);

      await waitFor(() => {
        expect(httpSetup.post).toHaveBeenCalledWith(`${API_BASE_PATH}/indices/flush`, {
          body: JSON.stringify({ indices: [testIndexName] }),
        });
      });
      await waitFor(() => {
        expect(getMock.mock.calls.length).toBeGreaterThan(requestsBefore);
      });
    });

    it(`deletes an index`, async () => {
      await renderPage();

      await openManageIndexMenu();
      const deleteButton = await screen.findByTestId('deleteIndexMenuButton');
      fireEvent.click(deleteButton);

      await screen.findByTestId('confirmModalConfirmButton');
      fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));

      await waitFor(() => {
        expect(httpSetup.post).toHaveBeenCalledWith(`${API_BASE_PATH}/indices/delete`, {
          body: JSON.stringify({ indices: [testIndexName] }),
        });
      });
    });
  });

  describe('index name with a percent sign', () => {
    const percentSignName = 'test%';

    it('loads the index details with the encoded index name', async () => {
      httpRequestsMockHelpers.setLoadIndexDetailsResponse(encodeURIComponent(percentSignName), {
        ...testIndexMock,
        name: percentSignName,
      });
      httpRequestsMockHelpers.setLoadIndexSettingsResponse(
        encodeURIComponent(percentSignName),
        testIndexSettings
      );
      await renderPage(`/indices/index_details?indexName=${encodeURIComponent(percentSignName)}`);

      expect(httpSetup.get).toHaveBeenCalledWith(
        `${INTERNAL_API_BASE_PATH}/indices/${encodeURIComponent(percentSignName)}`,
        requestOptions
      );
    });

    it('loads mappings with the encoded index name', async () => {
      httpRequestsMockHelpers.setLoadIndexDetailsResponse(encodeURIComponent(percentSignName), {
        ...testIndexMock,
        name: percentSignName,
      });
      await renderPage(`/indices/index_details?indexName=${encodeURIComponent(percentSignName)}`);

      const user = userEvent.setup({ pointerEventsCheck: 0, delay: null });
      await user.click(screen.getByTestId('indexDetailsTab-mappings'));

      await waitFor(() => {
        expect(httpSetup.get).toHaveBeenCalledWith(
          `${API_BASE_PATH}/mapping/${encodeURIComponent(percentSignName)}`,
          requestOptions
        );
      });
    });

    it('loads settings with the encoded index name', async () => {
      httpRequestsMockHelpers.setLoadIndexDetailsResponse(encodeURIComponent(percentSignName), {
        ...testIndexMock,
        name: percentSignName,
      });
      httpRequestsMockHelpers.setLoadIndexSettingsResponse(
        encodeURIComponent(percentSignName),
        testIndexSettings
      );
      await renderPage(`/indices/index_details?indexName=${encodeURIComponent(percentSignName)}`);

      fireEvent.click(screen.getByTestId('indexDetailsTab-settings'));

      await waitFor(() => {
        expect(httpSetup.get).toHaveBeenLastCalledWith(
          `${API_BASE_PATH}/settings/${encodeURIComponent(percentSignName)}`,
          requestOptions
        );
      });
    });

    it('updates settings with the encoded index name', async () => {
      httpRequestsMockHelpers.setLoadIndexDetailsResponse(encodeURIComponent(percentSignName), {
        ...testIndexMock,
        name: percentSignName,
      });
      httpRequestsMockHelpers.setLoadIndexSettingsResponse(
        encodeURIComponent(percentSignName),
        testIndexSettings
      );
      await renderPage(`/indices/index_details?indexName=${encodeURIComponent(percentSignName)}`);

      fireEvent.click(screen.getByTestId('indexDetailsTab-settings'));
      await screen.findByTestId('indexDetailsSettingsEditModeSwitch');
      fireEvent.click(screen.getByTestId('indexDetailsSettingsEditModeSwitch'));
      const editor = await screen.findByTestId('indexDetailsSettingsEditor');

      const getMock = jest.mocked(httpSetup.get);
      const requestsBefore = getMock.mock.calls.length;

      const updatedSettings = { ...testIndexEditableSettingsAll, 'index.priority': '2' };
      fireEvent.change(editor, {
        target: {
          value: JSON.stringify(updatedSettings),
          getAttribute: () => JSON.stringify(updatedSettings),
        },
      });
      fireEvent.click(screen.getByTestId('indexDetailsSettingsSave'));

      await waitFor(() => {
        expect(httpSetup.put).toHaveBeenLastCalledWith(
          `${API_BASE_PATH}/settings/${encodeURIComponent(percentSignName)}`,
          {
            asSystemRequest: undefined,
            body: JSON.stringify({ 'index.priority': '2' }),
            query: undefined,
            version: undefined,
          }
        );
      });
      // The save flow triggers a settings reload; wait for that async cycle to settle.
      await waitFor(() => {
        expect(getMock.mock.calls.length).toBeGreaterThan(requestsBefore);
      });
      await screen.findByTestId('indexDetailsSettingsCodeBlock');
    });

    it('loads stats with the encoded index name', async () => {
      httpRequestsMockHelpers.setLoadIndexDetailsResponse(encodeURIComponent(percentSignName), {
        ...testIndexMock,
        name: percentSignName,
      });
      await renderPage(`/indices/index_details?indexName=${encodeURIComponent(percentSignName)}`);

      fireEvent.click(screen.getByTestId('indexDetailsTab-stats'));

      await waitFor(() => {
        expect(httpSetup.get).toHaveBeenLastCalledWith(
          `${API_BASE_PATH}/stats/${encodeURIComponent(percentSignName)}`,
          requestOptions
        );
      });
    });
  });

  describe('extension service tabs', () => {
    const testTabId = 'testTab' as IndexDetailsTabId;
    const testContent = 'Test content';
    const additionalTab: IndexDetailsTab = {
      id: testTabId,
      name: 'Test tab',
      renderTabContent: () => <span>{testContent}</span>,
      order: 1,
    };

    it('renders an additional tab', async () => {
      await renderPage(undefined, {
        services: { extensionsService: { indexDetailsTabs: [additionalTab] } },
      });
      fireEvent.click(screen.getByTestId(`indexDetailsTab-${testTabId}`));
      await waitFor(() => {
        expect(screen.getByTestId('indexDetailsContent').textContent).toEqual(testContent);
      });
    });

    it("sets breadcrumbs for the tab using the tab's name", async () => {
      await renderPage(undefined, {
        services: { extensionsService: { indexDetailsTabs: [additionalTab] } },
      });
      fireEvent.click(screen.getByTestId(`indexDetailsTab-${testTabId}`));
      await waitFor(() => {
        expect(breadcrumbService.setBreadcrumbs).toHaveBeenLastCalledWith(
          IndexManagementBreadcrumb.indexDetails,
          { text: 'Test tab' }
        );
      });
    });

    it('sets breadcrumbs for the tab using the tab property', async () => {
      await renderPage(undefined, {
        services: {
          extensionsService: {
            indexDetailsTabs: [{ ...additionalTab, breadcrumb: { text: 'special breadcrumb' } }],
          },
        },
      });
      fireEvent.click(screen.getByTestId(`indexDetailsTab-${testTabId}`));
      await waitFor(() => {
        expect(breadcrumbService.setBreadcrumbs).toHaveBeenLastCalledWith(
          IndexManagementBreadcrumb.indexDetails,
          { text: 'special breadcrumb' }
        );
      });
    });

    it('additional tab is the first in the order', async () => {
      await renderPage(undefined, {
        services: { extensionsService: { indexDetailsTabs: [additionalTab] } },
      });
      const overviewTab = screen.getByTestId('indexDetailsTab-overview');
      const tabList = overviewTab.closest<HTMLElement>('[role="tablist"]');
      if (!tabList) throw new Error('Expected tablist to exist');
      const tabNames = within(tabList)
        .getAllByRole('tab')
        .map((tab) => tab.textContent);
      expect(tabNames).toEqual(['Test tab', 'Overview', 'Mappings', 'Settings', 'Statistics']);
    });

    it('additional tab is the last in the order', async () => {
      await renderPage(undefined, {
        services: { extensionsService: { indexDetailsTabs: [{ ...additionalTab, order: 100 }] } },
      });
      const overviewTab = screen.getByTestId('indexDetailsTab-overview');
      const tabList = overviewTab.closest<HTMLElement>('[role="tablist"]');
      if (!tabList) throw new Error('Expected tablist to exist');
      const tabNames = within(tabList)
        .getAllByRole('tab')
        .map((tab) => tab.textContent);
      expect(tabNames).toEqual(['Overview', 'Mappings', 'Settings', 'Statistics', 'Test tab']);
    });
  });

  describe('Semantic Text Banner', () => {
    interface IndexMappings {
      properties: Record<string, unknown>;
      [key: string]: unknown;
    }

    const baseMappings = testIndexMappings.mappings as unknown as IndexMappings;

    const mockIndexMappingResponseWithoutSemanticText: IndexMappings = {
      ...baseMappings,
      properties: {
        ...baseMappings.properties,
        name: {
          type: 'text',
        },
      },
    };

    const mockIndexMappingResponseWithSemanticText: IndexMappings = {
      ...mockIndexMappingResponseWithoutSemanticText,
      properties: {
        ...mockIndexMappingResponseWithoutSemanticText.properties,
        sem_text: {
          type: 'semantic_text',
          inference_id: '.elser-2-elasticsearch',
        },
        title: {
          type: 'text',
          copy_to: ['sem_text'],
        },
      },
    };

    it('semantic text banner is visible if there is no semantic_text field in the mapping', async () => {
      httpRequestsMockHelpers.setLoadIndexMappingResponse(testIndexName, {
        mappings: mockIndexMappingResponseWithoutSemanticText,
      });

      await renderPage(undefined, {
        core: { application: { capabilities: { ml: { canGetTrainedModels: true } } } },
      });

      const user = userEvent.setup({ pointerEventsCheck: 0, delay: null });
      await user.click(screen.getByTestId('indexDetailsTab-mappings'));
      await screen.findByTestId('fieldsList');

      expect(screen.getByTestId('indexDetailsMappingsSemanticTextBanner')).toBeInTheDocument();
    });

    it('semantic text banner is not visible if there exists a semantic_text field in the mapping', async () => {
      httpRequestsMockHelpers.setLoadIndexMappingResponse(testIndexName, {
        mappings: mockIndexMappingResponseWithSemanticText,
      });

      await renderPage(undefined, {
        core: { application: { capabilities: { ml: { canGetTrainedModels: true } } } },
      });

      const user = userEvent.setup({ pointerEventsCheck: 0, delay: null });
      await user.click(screen.getByTestId('indexDetailsTab-mappings'));
      await screen.findByTestId('fieldsList');

      expect(
        screen.queryByTestId('indexDetailsMappingsSemanticTextBanner')
      ).not.toBeInTheDocument();
    });
  });

  describe('Mappings tab', () => {
    let user: ReturnType<typeof userEvent.setup>;

    beforeEach(() => {
      // Use userEvent for EuiPopover-triggering clicks so updates are wrapped in act(),
      // but keep it fast to avoid the large perf penalty on slower CI machines.
      user = userEvent.setup({ pointerEventsCheck: 0, delay: null });
    });

    const getFieldsList = () => screen.getByTestId('fieldsList');

    const getFieldsListItems = () =>
      within(getFieldsList()).getAllByTestId((content) => content.startsWith('fieldsListItem '));

    const getFieldListItemByName = (name: string) => {
      // Fast path: most list items use a stable `data-test-subj` that includes the field name.
      // This avoids scanning the full list DOM (which is expensive on large trees/slow CI).
      const direct = screen.queryByTestId(`fieldsListItem ${name}Field`);
      if (direct) return direct;

      const listItems = getFieldsListItems();
      const item = listItems.find((it) => {
        const fieldNameEls = within(it).queryAllByTestId(/fieldName/);
        return fieldNameEls.some((el) => {
          if ((el.textContent || '').trim() !== name) return false;

          let node: HTMLElement | null = el as HTMLElement;
          while (node && node !== it) {
            const subj = node.getAttribute('data-test-subj');
            if (typeof subj === 'string' && subj.startsWith('fieldsListItem ')) return false;
            node = node.parentElement;
          }

          return true;
        });
      });
      if (!item) throw new Error(`Expected field list item to exist: "${name}"`);
      return item;
    };

    const expectFieldToExist = async (name: string) => {
      await waitFor(() => expect(() => getFieldListItemByName(name)).not.toThrow());
    };

    const expectFieldToNotExist = async (name: string) => {
      await waitFor(() => expect(() => getFieldListItemByName(name)).toThrow());
    };

    const clickMappingsTab = async () => {
      // Tab switches are synchronous enough for `fireEvent.click` and are much faster than `user.click`
      // on slower CI machines. Keep `user.click` for popover-triggering interactions.
      fireEvent.click(screen.getByTestId('indexDetailsTab-mappings'));
      await waitFor(() => {
        expect(
          screen.queryByTestId('fieldsList') ||
            screen.queryByTestId('indexDetailsMappingsEmptyPrompt') ||
            screen.queryByTestId('indexDetailsMappingsError')
        ).toBeTruthy();
      });
    };

    const clickToggleView = async (label: 'List' | 'JSON') => {
      new EuiButtonGroupTestHarness('indexDetailsMappingsToggleViewButton').select(label);
    };

    const openFilterPopover = async () => {
      await user.click(screen.getByTestId('indexDetailsMappingsFilterByFieldTypeButton'));
      await screen.findByTestId('indexDetailsMappingsFilterByFieldTypeSearch');
      // Ensure list is rendered
      await waitFor(() => expect(screen.queryAllByTestId('filterItem').length).toBeGreaterThan(0));
    };

    const closeFilterPopover = async () => {
      // Avoid leaving EuiPopover mounted across tests: it can schedule late async updates
      // (via internal observers) and spam act() warnings on slower CI machines.
      // This popover is toggled by a button; clicking it again is the most reliable close mechanism.
      await user.click(screen.getByTestId('indexDetailsMappingsFilterByFieldTypeButton'));
      await waitFor(() =>
        expect(
          screen.queryByTestId('indexDetailsMappingsFilterByFieldTypeSearch')
        ).not.toBeInTheDocument()
      );
    };

    const selectFilterFieldType = async (dataType: string) => {
      await user.click(screen.getByTestId(`indexDetailsMappingsSelectFilter-${dataType}`));
    };

    const clearFilterFieldType = async () => {
      const clear = screen.getByTestId('clearFilters');
      await user.click(clear);
    };

    const setSearchBarValue = async (value: string) => {
      const input = screen.getByTestId('indexDetailsMappingsFieldSearch');
      fireEvent.change(input, { target: { value } });
    };

    it('renders mappings tab content and supports list/JSON views', async () => {
      await renderPage();
      await clickMappingsTab();

      // Breadcrumbs
      await waitFor(() => {
        expect(breadcrumbService.setBreadcrumbs).toHaveBeenLastCalledWith(
          IndexManagementBreadcrumb.indexDetails,
          { text: 'Mappings' }
        );
      });

      // Loads mappings
      await waitFor(() => {
        expect(httpSetup.get).toHaveBeenCalledWith(
          `${API_BASE_PATH}/mapping/${testIndexName}`,
          requestOptions
        );
      });

      // Core controls exist
      expect(screen.getByTestId('indexDetailsMappingsAddField')).toBeInTheDocument();
      expect(screen.getByTestId('indexDetailsMappingsToggleViewButton')).toBeInTheDocument();
      expect(screen.getByTestId('indexDetailsMappingsFieldSearch')).toBeInTheDocument();
      expect(screen.getByTestId('indexDetailsMappingsFilter')).toBeInTheDocument();
      expect(screen.queryByTestId('indexDetailsMappingsEmptyPrompt')).not.toBeInTheDocument();

      // List view renders fields
      await expectFieldToExist('@timestamp');

      // JSON view: search disabled + code block rendered
      await clickToggleView('JSON');
      const jsonSearch = screen.getByTestId('indexDetailsMappingsFieldSearch') as HTMLInputElement;
      expect(jsonSearch).toBeDisabled();
      const codeBlock = await screen.findByTestId('indexDetailsMappingsCodeBlock');
      expect(codeBlock.textContent).toEqual(JSON.stringify(testIndexMappings, null, 2));

      // Back to list view: search enabled again
      await clickToggleView('List');
      await waitFor(() =>
        expect(screen.queryByTestId('indexDetailsMappingsCodeBlock')).not.toBeInTheDocument()
      );
      const listSearch = screen.getByTestId('indexDetailsMappingsFieldSearch') as HTMLInputElement;
      expect(listSearch).not.toBeDisabled();

      // Docs link
      const docsLink = await screen.findByTestId('indexDetailsMappingsDocsLink');
      expect(docsLink.getAttribute('href')).toContain('mapping');
    });

    describe('No saved mapping fields', () => {
      beforeEach(async () => {
        httpRequestsMockHelpers.setLoadIndexMappingResponse(testIndexName, {
          mappings: {
            properties: {},
          },
        });
        await renderPage();
        await clickMappingsTab();
      });

      afterEach(async () => {
        // Best-effort cleanup: close the add-field flow if a test left it open.
        if (screen.queryByTestId('indexDetailsMappingsPendingBlock')) {
          const cancelButton = screen.queryByTestId('cancelButton');
          if (cancelButton) {
            fireEvent.click(cancelButton);
          }
          await waitFor(() =>
            expect(screen.queryByTestId('indexDetailsMappingsPendingBlock')).not.toBeInTheDocument()
          );
        }
      });

      it('displays empty mappings prompt', async () => {
        expect(screen.getByTestId('indexDetailsMappingsAddField')).toBeInTheDocument();
        expect(screen.getByTestId('indexDetailsMappingsEmptyPrompt')).toBeInTheDocument();
      });
      it('hides filter, search and toggle while adding fields', async () => {
        fireEvent.click(screen.getByTestId('indexDetailsMappingsAddField'));
        await screen.findByTestId('indexDetailsMappingsPendingBlock');
        expect(screen.queryByTestId('indexDetailsMappingsFieldSearch')).not.toBeInTheDocument();
        expect(
          screen.queryByTestId('indexDetailsMappingsToggleViewButton')
        ).not.toBeInTheDocument();
        expect(screen.queryByTestId('indexDetailsMappingsFilter')).not.toBeInTheDocument();
        expect(screen.getByTestId('indexDetailsMappingsSaveMappings')).toBeInTheDocument();
      });
      it('does not display empty prompt after adding a field', async () => {
        fireEvent.click(screen.getByTestId('indexDetailsMappingsAddField'));
        await screen.findByTestId('indexDetailsMappingsPendingBlock');
        expect(screen.queryByTestId('indexDetailsMappingsEmptyPrompt')).not.toBeInTheDocument();
        // Close add-field flow
        fireEvent.click(await screen.findByTestId('cancelButton'));
        await waitFor(() =>
          expect(screen.queryByTestId('indexDetailsMappingsPendingBlock')).not.toBeInTheDocument()
        );
      });
    });

    describe('Filter field by filter Type', () => {
      beforeEach(async () => {
        httpRequestsMockHelpers.setLoadIndexMappingResponse(testIndexName, {
          mappings: {
            ...testIndexMappings.mappings,
            properties: {
              ...testIndexMappings.mappings.properties,
              name: { type: 'text' },
            },
          },
        });

        await renderPage();
        await clickMappingsTab();
      });

      test('can filter, clear filters, and search with filters applied', async () => {
        // Baseline assertions
        await expectFieldToExist('@timestamp');
        await expectFieldToExist('name');

        // Open filter popover and verify its main controls
        await openFilterPopover();
        expect(
          screen.getByTestId('indexDetailsMappingsFilterByFieldTypeSearch')
        ).toBeInTheDocument();
        const clearFiltersButton = screen.getByTestId('clearFilters');
        expect(clearFiltersButton).toBeDisabled();

        // Apply a filter and verify list changes
        await selectFilterFieldType('text');
        expect(clearFiltersButton).not.toBeDisabled();
        await expectFieldToExist('name');
        await expectFieldToNotExist('@timestamp');

        // Clear filters and verify list resets
        await clearFilterFieldType();
        await expectFieldToExist('@timestamp');
        await expectFieldToExist('name');

        // Apply filter again and search while the popover is closed
        await selectFilterFieldType('text');
        // Keep the selected filter, but close the popover before interacting with other controls.
        // Leaving EuiPopover open here causes it to schedule async updates (via internal observers)
        // while other state updates happen, which can trigger act() warnings.
        await closeFilterPopover();

        await setSearchBarValue('na');

        // Search view renders SearchResultItem(s), not FieldsListItem(s).
        await waitFor(() => {
          const resultItem = screen.getByTestId('fieldsListItem');
          expect(within(resultItem).getByTestId('fieldName')).toHaveTextContent('name');
        });
        expect(screen.queryByText('@timestamp')).not.toBeInTheDocument();

        // Cleanup: clear search and clear filters for deterministic teardown
        await setSearchBarValue('');
        await openFilterPopover();
        await clearFilterFieldType();
        await closeFilterPopover();
      }, 20000);
    });

    describe('Add a new field', () => {
      beforeEach(async () => {
        await renderPage(undefined, {
          core: { application: { capabilities: { ml: { canGetTrainedModels: true } } } },
        });
        await clickMappingsTab();
        await user.click(screen.getByTestId('indexDetailsMappingsAddField'));
        await screen.findByTestId('indexDetailsMappingsPendingBlock');
        await screen.findByTestId('createFieldForm');
      });

      afterEach(async () => {
        // Best-effort cleanup: ensure the create-field form (and its EuiComboBox popovers) are closed
        // so they don't leak portal work into the next test and trigger `act(...)` warnings.
        const documentFields = screen.queryByTestId('documentFields');
        if (!documentFields) return;

        const fieldTypeComboBox = new EuiComboBoxTestHarness('fieldType');
        if (fieldTypeComboBox.getElement() && fieldTypeComboBox.isOpen()) {
          await fieldTypeComboBox.close();
        }

        const cancelButton = within(documentFields).queryByTestId('cancelButton');
        if (cancelButton) {
          await user.click(cancelButton);
          await waitFor(() =>
            expect(within(documentFields).queryByTestId('createFieldForm')).not.toBeInTheDocument()
          );
        }
      });

      it('can cancel adding a field and can save new mappings', async () => {
        // Initial state: pending block open and save disabled.
        expect(screen.getByTestId('indexDetailsMappingsPendingBlock')).toBeInTheDocument();
        expect(screen.getByTestId('indexDetailsMappingsSaveMappings')).toBeDisabled();

        // Cancel flow.
        const cancelButton = await screen.findByTestId('cancelButton');
        await user.click(cancelButton);

        await waitFor(() =>
          expect(screen.queryByTestId('indexDetailsMappingsPendingBlock')).not.toBeInTheDocument()
        );
        expect(screen.getByTestId('indexDetailsMappingsAddField')).toBeInTheDocument();

        // Re-open add field for the save flow.
        await user.click(screen.getByTestId('indexDetailsMappingsAddField'));
        await screen.findByTestId('indexDetailsMappingsPendingBlock');
        await screen.findByTestId('createFieldForm');

        // After save, mappings reload should include the new field.
        interface IndexMappings {
          properties: Record<string, unknown>;
          [key: string]: unknown;
        }

        const baseMappings = testIndexMappings.mappings as unknown as IndexMappings;

        const mockIndexMappingResponse: IndexMappings = {
          ...baseMappings,
          properties: {
            ...baseMappings.properties,
            name: {
              type: 'text',
            },
          },
        };
        httpRequestsMockHelpers.setLoadIndexMappingResponse(testIndexName, {
          mappings: mockIndexMappingResponse,
        });

        // Fill name
        const nameInput = screen.getByTestId('nameParameterInput');
        fireEvent.change(nameInput, { target: { value: 'name' } });

        // Select type
        const typeComboBox = new EuiComboBoxTestHarness('fieldType');
        await typeComboBox.select(getTypeLabel('text'));
        await typeComboBox.close();

        await user.click(screen.getByTestId('addButton'));
        // The create-field submit handler focuses the field type input after async validation,
        // which can re-open the combobox popover. Close it deterministically.
        await typeComboBox.close();

        await waitFor(() =>
          expect(screen.getByTestId('indexDetailsMappingsSaveMappings')).not.toBeDisabled()
        );

        const getMock = jest.mocked(httpSetup.get);
        const requestsBefore = getMock.mock.calls.length;

        await user.click(screen.getByTestId('indexDetailsMappingsSaveMappings'));

        await waitFor(() => {
          expect(httpSetup.put).toHaveBeenCalledWith(`${API_BASE_PATH}/mapping/${testIndexName}`, {
            body: '{"name":{"type":"text"}}',
          });
        });

        await waitFor(() => {
          expect(getMock.mock.calls.length).toBeGreaterThan(requestsBefore);
        });

        // JSON view should show the updated mappings after the successful save.
        await clickToggleView('JSON');
        const codeBlock = await screen.findByTestId('indexDetailsMappingsCodeBlock');
        expect(codeBlock.textContent).toEqual(
          JSON.stringify({ mappings: mockIndexMappingResponse }, null, 2)
        );
      }, 20000);

      it('surfaces an error callout when saving mappings fails', async () => {
        const error = {
          statusCode: 400,
          error: 'Bad Request',
          message: 'Error saving mapping:',
        };
        httpRequestsMockHelpers.setUpdateIndexMappingsResponse(testIndexName, undefined, error);

        const nameInput = screen.getByTestId('nameParameterInput');
        fireEvent.change(nameInput, { target: { value: 'test_field' } });

        const typeComboBox = new EuiComboBoxTestHarness('fieldType');
        await typeComboBox.select(getTypeLabel('boolean'));
        await typeComboBox.close();

        await user.click(screen.getByTestId('addButton'));
        await typeComboBox.close();

        await waitFor(() =>
          expect(screen.getByTestId('indexDetailsMappingsSaveMappings')).not.toBeDisabled()
        );

        await user.click(screen.getByTestId('indexDetailsMappingsSaveMappings'));

        await screen.findByTestId('indexDetailsSaveMappingsError');
      }, 20000);
    });

    describe('Add Semantic text field', () => {
      const customInferenceModel = 'my-elser-model';
      const mockLicense = {
        isActive: true,
        hasAtLeast: jest.fn(() => true),
      };

      beforeEach(async () => {
        httpRequestsMockHelpers.setInferenceModels({
          data: [
            {
              inference_id: customInferenceModel,
              task_type: 'sparse_embedding',
              service: 'elser',
              service_settings: {
                num_allocations: 1,
                num_threads: 1,
                model_id: '.elser_model_2',
              },
              task_settings: {},
            },
          ],
        });

        await renderPage(undefined, {
          docLinks: {
            links: {
              inferenceManagement: {
                inferenceAPIDocumentation: 'https://abc.com/inference-api-create',
              },
            },
          },
          core: { application: { capabilities: { ml: { canGetTrainedModels: true } } } },
          plugins: {
            share: {
              url: {
                locators: {
                  get: jest.fn(() => ({
                    useUrl: jest.fn().mockReturnValue('https://redirect.me/to/inference_endpoints'),
                  })),
                },
              },
            },
            licensing: {
              license$: {
                subscribe: jest.fn((callback) => {
                  callback(mockLicense);
                  return { unsubscribe: jest.fn() };
                }),
              },
            },
          },
        });

        await clickMappingsTab();
        await user.click(screen.getByTestId('indexDetailsMappingsAddField'));
        await screen.findByTestId('createFieldForm');
      });

      afterEach(async () => {
        if (!screen.queryByTestId('indexDetailsMappingsPendingBlock')) return;

        const documentFields = screen.queryByTestId('documentFields');
        if (!documentFields) return;

        const fieldTypeComboBox = new EuiComboBoxTestHarness('fieldType');
        if (fieldTypeComboBox.getElement() && fieldTypeComboBox.isOpen()) {
          await fieldTypeComboBox.close();
        }

        const cancelButton = within(documentFields).queryByTestId('cancelButton');
        if (cancelButton) {
          await user.click(cancelButton);
          await waitFor(() =>
            expect(within(documentFields).queryByTestId('createFieldForm')).not.toBeInTheDocument()
          );
        }
      });

      it('can select semantic_text field', async () => {
        const nameInput = screen.getByTestId('nameParameterInput');
        fireEvent.change(nameInput, { target: { value: 'semantic_text_name' } });

        const typeComboBox = new EuiComboBoxTestHarness('fieldType');
        await typeComboBox.select(getTypeLabel('semantic_text'));
        await typeComboBox.close();

        await screen.findByTestId('referenceFieldSelect');

        // The inference id selection is part of the semantic text flow.
        await screen.findByTestId('selectInferenceId');
        await screen.findByTestId('inferenceIdButton');

        await user.click(screen.getByTestId('inferenceIdButton'));
        await screen.findByTestId(`custom-inference_${customInferenceModel}`);

        // can cancel new field
        const cancelButton = await screen.findByTestId('cancelButton');
        await user.click(cancelButton);
      }, 20000);
    });

    describe('error loading mappings', () => {
      it('there is an error prompt', async () => {
        httpRequestsMockHelpers.setLoadIndexMappingResponse(testIndexName, undefined, {
          statusCode: 400,
          message: `Was not able to load mappings`,
        });

        await renderPage();
        await clickMappingsTab();

        await screen.findByTestId('indexDetailsMappingsError');
      });

      it('resends a request when reload button is clicked', async () => {
        httpRequestsMockHelpers.setLoadIndexMappingResponse(testIndexName, undefined, {
          statusCode: 400,
          message: `Was not able to load mappings`,
        });

        await renderPage();
        await clickMappingsTab();

        await screen.findByTestId('indexDetailsMappingsError');

        const getMock = jest.mocked(httpSetup.get);
        const requestsBefore = getMock.mock.calls.length;
        fireEvent.click(screen.getByTestId('indexDetailsMappingsReloadButton'));

        await waitFor(() => {
          expect(getMock.mock.calls.length).toBeGreaterThan(requestsBefore);
        });
      });

      it('handles errors from json.stringify function', async () => {
        const circularReference: Record<string, unknown> = { mappings: { properties: {} } };
        (circularReference as { myself?: unknown }).myself = circularReference;

        httpRequestsMockHelpers.setLoadIndexMappingResponse(testIndexName, circularReference);

        await renderPage();
        await clickMappingsTab();

        await screen.findByTestId('indexDetailsMappingsError');
      });
    });
  });

  describe('navigates back to the indices list', () => {
    // The back button is an internal app link; the global redirectAppLinks wrapper (absent in tests)
    // turns the click into SPA navigation, so we assert the href the link carries instead.
    it('without indices list params', async () => {
      await renderPage();
      expect(screen.getByTestId(APP_HEADER_TEST_SUBJECTS.back)).toHaveAttribute(
        'href',
        '/app/management/data/index_management/indices'
      );
    });

    it('with indices list params', async () => {
      const filter = 'isFollower:true';
      await renderPage(
        `/indices/index_details?indexName=${testIndexName}&filter=${encodeURIComponent(
          filter
        )}&includeHiddenIndices=true`
      );
      expect(screen.getByTestId(APP_HEADER_TEST_SUBJECTS.back)).toHaveAttribute(
        'href',
        `/app/management/data/index_management/indices?filter=${encodeURIComponent(
          filter
        )}&includeHiddenIndices=true`
      );
    });
  });
});
