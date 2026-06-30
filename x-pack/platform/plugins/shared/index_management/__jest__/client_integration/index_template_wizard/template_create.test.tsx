/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { EuiListTestHarness } from '@kbn/test-eui-helpers';
import { APP_HEADER_TEST_SUBJECTS } from '@kbn/app-header';

import { API_BASE_PATH, LOOKUP_INDEX_MODE } from '../../../common/constants';
import {
  TEXT_MAPPING_FIELD,
  BOOLEAN_MAPPING_FIELD,
  KEYWORD_MAPPING_FIELD,
  componentTemplates,
} from '../helpers/fixtures';
import { renderTemplateCreate } from '../helpers/render_template_create';
import { createTemplateCreateActions } from '../helpers/actions/template_create_actions';
import { setupEnvironment } from '../helpers/setup_environment';
import {
  clickSaveAndAwaitExit,
  expectString,
  getLastPostCall,
  getPostCalls,
} from './template_create.helpers';
import {
  TEMPLATE_NAME,
  SETTINGS,
  ALIASES,
  INDEX_PATTERNS as DEFAULT_INDEX_PATTERNS,
} from './constants';

jest.mock('@kbn/code-editor');

describe('<TemplateCreate />', () => {
  let httpSetup: ReturnType<typeof setupEnvironment>['httpSetup'];
  let httpRequestsMockHelpers: ReturnType<typeof setupEnvironment>['httpRequestsMockHelpers'];

  let completeStepOne: ReturnType<typeof createTemplateCreateActions>['completeStepOne'];
  let completeStepTwo: ReturnType<typeof createTemplateCreateActions>['completeStepTwo'];
  let completeStepThree: ReturnType<typeof createTemplateCreateActions>['completeStepThree'];
  let completeStepFour: ReturnType<typeof createTemplateCreateActions>['completeStepFour'];
  let completeStepFive: ReturnType<typeof createTemplateCreateActions>['completeStepFive'];

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    const env = setupEnvironment();
    httpSetup = env.httpSetup;
    httpRequestsMockHelpers = env.httpRequestsMockHelpers;

    ({ completeStepOne, completeStepTwo, completeStepThree, completeStepFour, completeStepFive } =
      createTemplateCreateActions());

    httpRequestsMockHelpers.setLoadComponentTemplatesResponse(componentTemplates);
    httpRequestsMockHelpers.setLoadNodesPluginsResponse([]);
  });

  describe('composable index template', () => {
    beforeEach(async () => {
      httpRequestsMockHelpers.setLoadComponentTemplatesResponse(componentTemplates);
      await renderTemplateCreate(httpSetup);
      await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.title);
    });

    test('should set the correct page title', () => {
      expect(screen.getByTestId(APP_HEADER_TEST_SUBJECTS.title)).toHaveTextContent(
        'Create template'
      );
    });

    test('renders no deprecation warning', async () => {
      expect(screen.queryByTestId('legacyIndexTemplateDeprecationWarning')).not.toBeInTheDocument();
    });

    test('should not let the user go to the next step with invalid fields', async () => {
      expect(screen.getByTestId('nextButton')).toBeEnabled();

      fireEvent.click(screen.getByTestId('nextButton'));

      await waitFor(() => {
        expect(screen.getByTestId('nextButton')).toBeDisabled();
      });
    });
  });

  describe('legacy index template', () => {
    beforeEach(async () => {
      await renderTemplateCreate(httpSetup, { isLegacy: true });
      await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.title);
    });

    test('should set the correct page title', () => {
      expect(screen.getByTestId(APP_HEADER_TEST_SUBJECTS.title)).toHaveTextContent(
        'Create legacy template'
      );
    });

    test('renders deprecation warning', async () => {
      expect(screen.getByTestId('legacyIndexTemplateDeprecationWarning')).toBeInTheDocument();
    });
  });

  describe('form validation', () => {
    beforeEach(async () => {
      httpRequestsMockHelpers.setLoadComponentTemplatesResponse(componentTemplates);
      await renderTemplateCreate(httpSetup);
      await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.title);
    });

    describe('component templates (step 2)', () => {
      beforeEach(async () => {
        await completeStepOne({ name: TEMPLATE_NAME, indexPatterns: ['index1'] });
      }, 20000);

      it('should set the correct page title', async () => {
        expect(await screen.findByTestId('stepComponents')).toBeInTheDocument();
        expect(screen.getByTestId('stepTitle')).toHaveTextContent('Component templates (optional)');
      });

      it(`doesn't render the deprecated legacy index template warning`, () => {
        expect(
          screen.queryByTestId('legacyIndexTemplateDeprecationWarning')
        ).not.toBeInTheDocument();
      });

      it('should list the available component templates', async () => {
        const listContainer = await screen.findByTestId('componentTemplatesList', {});
        // Find all component name elements within the list
        const componentNames = within(listContainer).getAllByTestId('name');
        const componentsFound = componentNames.map((el) => el.textContent);
        expect(componentsFound).toEqual(componentTemplates.map((c) => c.name));
      });

      it('should allow to search for a component', async () => {
        fireEvent.change(screen.getByTestId('componentTemplateSearchBox'), {
          target: { value: 'template_2' },
        });

        const listContainer = await screen.findByTestId('componentTemplatesList');
        const componentNames = within(listContainer).getAllByTestId('name');
        const componentsFound = componentNames.map((el) => el.textContent);
        expect(componentsFound).toEqual(['test_component_template_2']);
      });

      it('should allow to filter component by Index settings, mappings and aliases', async () => {
        fireEvent.click(screen.getByTestId('filterButton'));

        // Avoid repeatedly scanning the DOM for the same list items.
        // Keep the popover open and cache the items once for this interaction.
        const filterItems = screen.getAllByTestId('filterItem');
        const getFilterItem = (label: string): HTMLElement => {
          const item = filterItems.find((el) => el.textContent?.includes(label));
          if (!item) {
            throw new Error(`Expected filter item "${label}" to exist`);
          }
          return item;
        };

        const filtersList = filterItems.map((el) => el.textContent || '');
        expect(filtersList).toEqual(
          expect.arrayContaining([
            expect.stringContaining('Index settings'),
            expect.stringContaining('Mappings'),
            expect.stringContaining('Aliases'),
          ])
        );

        // Select 'Index settings'
        fireEvent.click(getFilterItem('Index settings'));
        const listAfterSettingsFilter = await screen.findByTestId('componentTemplatesList');
        expect(
          within(listAfterSettingsFilter)
            .getAllByTestId('name')
            .map((el) => el.textContent)
        ).toEqual(['test_component_template_2']);

        // Select 'Mappings'
        fireEvent.click(getFilterItem('Mappings'));
        await waitFor(() => {
          expect(screen.queryByTestId('componentTemplatesList')).not.toBeInTheDocument();
        });
        expect(screen.getByTestId('emptySearchResult')).toHaveTextContent(
          'No components match your search'
        );

        // Unselect 'Index settings'
        fireEvent.click(getFilterItem('Index settings'));
        const listAfterUnselectSettings = await screen.findByTestId('componentTemplatesList');
        expect(
          within(listAfterUnselectSettings)
            .getAllByTestId('name')
            .map((el) => el.textContent)
        ).toEqual(['test_component_template_1']);

        // Unselect 'Mappings'
        fireEvent.click(getFilterItem('Mappings'));
        const listAfterUnselectMappings = await screen.findByTestId('componentTemplatesList');
        expect(
          within(listAfterUnselectMappings)
            .getAllByTestId('name')
            .map((el) => el.textContent)
        ).toEqual(['test_component_template_1', 'test_component_template_2']);

        // Select 'Aliases'
        fireEvent.click(getFilterItem('Aliases'));
        await waitFor(() => {
          expect(screen.queryByTestId('componentTemplatesList')).not.toBeInTheDocument();
        });
      });

      it('should allow to select and unselect a component template', async () => {
        // Start with empty selection
        expect(screen.getByTestId('emptyPrompt')).toHaveTextContent(
          'Add component template building blocks to this template.'
        );

        const availableTemplatesList = new EuiListTestHarness('componentTemplatesList');
        availableTemplatesList.clickAction('test_component_template_1', 'action-plusCircle');

        await waitFor(() => {
          expect(screen.queryByTestId('emptyPrompt')).not.toBeInTheDocument();
        });

        // Check selected component appears in the selection area
        const selectionContainer = screen.getByTestId('componentTemplatesSelection');
        expect(
          within(selectionContainer)
            .getAllByTestId('name')
            .map((el) => el.textContent)
        ).toEqual(['test_component_template_1']);

        // Unselect the component
        const selectedTemplatesList = new EuiListTestHarness('componentTemplatesSelection');
        selectedTemplatesList.clickAction('test_component_template_1', 'action-minusCircle');

        await waitFor(() => {
          expect(screen.getByTestId('emptyPrompt')).toBeInTheDocument();
        });
      });
    });

    describe('index settings (step 3)', () => {
      beforeEach(async () => {
        // Logistics
        await completeStepOne({
          name: TEMPLATE_NAME,
          indexPatterns: ['index1'],
          indexMode: LOOKUP_INDEX_MODE,
        });
        // Component templates
        await completeStepTwo();
      }, 20000);

      it('should set the correct page title', async () => {
        expect(await screen.findByTestId('stepSettings')).toBeInTheDocument();
        expect(screen.getByTestId('stepTitle')).toHaveTextContent('Index settings (optional)');
      });

      it('should display a warning callout displaying the selected index mode', async () => {
        expect(await screen.findByTestId('indexModeCallout')).toBeInTheDocument();
        expect(screen.getByTestId('indexModeCallout')).toHaveTextContent(
          'The index.mode setting has been set to Lookup within the Logistics step.'
        );
      });

      it('should not allow invalid json', async () => {
        await completeStepThree('{ invalidJsonString ', false);

        expect(await screen.findByText(/Invalid JSON format/)).toBeInTheDocument();
      });

      it('should not allow setting number_of_shards to a value different from 1 for Lookup index mode', async () => {
        // The Lookup index mode was already selected in the first (Logistics) step
        const editor = screen.getByTestId('settingsEditor');
        fireEvent.change(editor, { target: { value: '{ "index.number_of_shards": 2 }' } });

        // Trigger validation by trying to navigate to next step
        // The validation error should appear and prevent navigation
        fireEvent.click(screen.getByTestId('nextButton'));

        // The error is displayed in EuiFormRow error prop
        expect(
          await screen.findByText(/Number of shards for lookup index mode can only be 1 or unset/)
        ).toBeInTheDocument();

        // Verify we're still on the settings step (navigation was prevented)
        expect(screen.getByTestId('stepSettings')).toBeInTheDocument();
      });
    });

    describe('mappings (step 4)', () => {
      const navigateToMappingsStep = async () => {
        await completeStepOne({ name: TEMPLATE_NAME, indexPatterns: ['index1'] });
        await completeStepTwo();
        await completeStepThree('{}');
      };

      beforeEach(async () => {
        await navigateToMappingsStep();
      }, 20000);

      it('should set the correct page title', async () => {
        expect(await screen.findByTestId('stepMappings')).toBeInTheDocument();
        expect(screen.getByTestId('stepTitle')).toHaveTextContent('Mappings (optional)');
      });

      it('should allow the user to define and remove document fields for a mapping', async () => {
        await completeStepFour(
          [
            { name: 'field_1', type: 'text' },
            { name: 'field_2', type: 'text' },
          ],
          false
        );

        const getFieldsListItems = () =>
          screen.getAllByTestId((content) => content.startsWith('fieldsListItem '));

        await waitFor(() => expect(getFieldsListItems()).toHaveLength(2));

        const field1Item = getFieldsListItems().find(
          (item) => within(item).queryByText('field_1') !== null
        );
        if (!field1Item) {
          throw new Error('Expected field_1 item to exist');
        }

        fireEvent.click(within(field1Item).getByTestId('removeFieldButton'));

        const confirmButton = await screen.findByTestId('confirmModalConfirmButton');
        fireEvent.click(confirmButton);

        await waitFor(() => expect(getFieldsListItems()).toHaveLength(1));
      }, 16000);

      describe('plugin parameters', () => {
        test('should not render the _size parameter if the mapper size plugin is not installed', async () => {
          // The mappings editor exposes stable tab test subjects.
          fireEvent.click(screen.getByTestId('advancedOptionsTab'));
          expect(screen.queryByTestId('sizeEnabledToggle')).not.toBeInTheDocument();
        });
      });
    });

    describe('aliases (step 5)', () => {
      beforeEach(async () => {
        // Logistics
        await completeStepOne({ name: TEMPLATE_NAME, indexPatterns: ['index1'] });
        // Component templates
        await completeStepTwo();
        // Index settings
        await completeStepThree('{}');
        // Mappings
        await completeStepFour();
      }, 20000);

      it('should set the correct page title', async () => {
        expect(await screen.findByTestId('stepAliases')).toBeInTheDocument();
        expect(screen.getByTestId('stepTitle')).toHaveTextContent('Aliases (optional)');
      });

      it('should not allow invalid json', async () => {
        // Complete step 5 (aliases) with invalid json
        await completeStepFive('{ invalidJsonString ', false);

        expect(await screen.findByText('Invalid JSON format.')).toBeInTheDocument();
      }, 10000);
    });
  });

  // Isolated test for mapper-size plugin (needs different mock setup)
  describe('mapper-size plugin', () => {
    test('should render the _size parameter if the mapper size plugin is installed', async () => {
      httpRequestsMockHelpers.setLoadNodesPluginsResponse(['mapper-size']);
      httpRequestsMockHelpers.setLoadComponentTemplatesResponse(componentTemplates);

      await renderTemplateCreate(httpSetup);
      await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.title);

      // Navigate to mappings step
      await completeStepOne({ name: TEMPLATE_NAME, indexPatterns: ['index1'] });
      await completeStepTwo();
      await completeStepThree('{}');

      // Navigate to advanced tab
      fireEvent.click(screen.getByTestId('advancedOptionsTab'));

      expect(screen.getByTestId('sizeEnabledToggle')).toBeInTheDocument();
    }, 10000);
  });

  describe('logistics (step 1)', () => {
    beforeEach(async () => {
      httpRequestsMockHelpers.setLoadComponentTemplatesResponse(componentTemplates);
      await renderTemplateCreate(httpSetup);
      await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.title);
    });

    it('setting index pattern to logs-*-* should set the index mode to logsdb', async () => {
      // Logistics
      await completeStepOne({ name: 'my_logs_template', indexPatterns: ['logs-*-*'] });
      // Component templates
      await completeStepTwo();
      // Index settings
      await completeStepThree('{}');
      // Mappings
      await completeStepFour();
      // Aliases
      await completeStepFive();

      fireEvent.click(screen.getByTestId('nextButton'));

      await waitFor(() => {
        expect(httpSetup.post).toHaveBeenLastCalledWith(
          `${API_BASE_PATH}/index_templates`,
          expect.objectContaining({
            body: JSON.stringify({
              name: 'my_logs_template',
              indexPatterns: ['logs-*-*'],
              allowAutoCreate: 'NO_OVERWRITE',
              indexMode: 'logsdb',
              _kbnMeta: {
                type: 'default',
                hasDatastream: false,
                isLegacy: false,
              },
              template: {},
            }),
          })
        );
      });
    }, 10000);
  });

  describe('review (step 6)', () => {
    describe('default flow', () => {
      beforeEach(async () => {
        httpRequestsMockHelpers.setLoadComponentTemplatesResponse(componentTemplates);
        await renderTemplateCreate(httpSetup);
        await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.title);

        await completeStepOne({
          name: TEMPLATE_NAME,
          indexPatterns: DEFAULT_INDEX_PATTERNS,
        });
        await completeStepTwo('test_component_template_1');
        await completeStepThree(JSON.stringify(SETTINGS));
        await completeStepFour();
        await completeStepFive(JSON.stringify(ALIASES));
      }, 20000);

      it('should set the correct step title', async () => {
        expect(await screen.findByTestId('stepSummary')).toBeInTheDocument();
        expect(screen.getByTestId('stepTitle')).toHaveTextContent(
          `Review details for '${TEMPLATE_NAME}'`
        );
      }, 10000);

      describe('tabs', () => {
        test('should have 3 tabs', () => {
          const tabs = within(screen.getByTestId('summaryTabContent')).getAllByRole('tab');
          expect(tabs).toHaveLength(3);
          expect(tabs.map((t) => t.textContent)).toEqual(['Summary', 'Preview', 'Request']);
        });

        test('should navigate to the preview and request tab', async () => {
          expect(screen.getByTestId('summaryTab')).toBeInTheDocument();
          expect(screen.queryByTestId('requestTab')).not.toBeInTheDocument();
          expect(screen.queryByTestId('previewTab')).not.toBeInTheDocument();

          fireEvent.click(
            within(screen.getByTestId('summaryTabContent')).getByRole('tab', { name: 'Preview' })
          );
          expect(screen.queryByTestId('summaryTab')).not.toBeInTheDocument();
          expect(screen.getByTestId('previewTab')).toBeInTheDocument();

          fireEvent.click(
            within(screen.getByTestId('summaryTabContent')).getByRole('tab', { name: 'Request' })
          );
          expect(screen.queryByTestId('previewTab')).not.toBeInTheDocument();
          expect(screen.getByTestId('requestTab')).toBeInTheDocument();
        });
      });
    });

    it('should render a warning message if a wildcard is used as an index pattern', async () => {
      httpRequestsMockHelpers.setLoadComponentTemplatesResponse(componentTemplates);
      await renderTemplateCreate(httpSetup);
      await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.title);

      // Logistics
      await completeStepOne({
        name: TEMPLATE_NAME,
        indexPatterns: ['*'], // Set wildcard index pattern
      });
      // Component templates
      await completeStepTwo();
      // Index settings
      await completeStepThree(JSON.stringify({}));
      // Mappings
      await completeStepFour();
      // Aliases
      await completeStepFive(JSON.stringify({}));

      expect(await screen.findByTestId('indexPatternsWarning')).toBeInTheDocument();
      const descriptions = screen.getAllByTestId('indexPatternsWarningDescription');
      expect(descriptions.length).toBeGreaterThan(0);
      for (const description of descriptions) {
        expect(description).toHaveTextContent(
          'All new indices that you create will use this template. Edit index patterns.'
        );
      }
    }, 20000);
  });

  describe('form payload & api errors', () => {
    beforeEach(async () => {
      const MAPPING_FIELDS = [BOOLEAN_MAPPING_FIELD, KEYWORD_MAPPING_FIELD, TEXT_MAPPING_FIELD];

      httpRequestsMockHelpers.setLoadComponentTemplatesResponse(componentTemplates);
      await renderTemplateCreate(httpSetup);
      await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.title);

      await completeStepOne({
        name: TEMPLATE_NAME,
        indexPatterns: DEFAULT_INDEX_PATTERNS,
        allowAutoCreate: 'TRUE',
        indexMode: 'time_series',
      });
      await completeStepTwo('test_component_template_1');
      await completeStepThree(JSON.stringify(SETTINGS));
      await completeStepFour(MAPPING_FIELDS);
      await completeStepFive(JSON.stringify(ALIASES));
    }, 20000);

    it('should surface API errors and send the correct payload on success', async () => {
      // First attempt fails and surfaces an error
      const error = {
        statusCode: 409,
        error: 'Conflict',
        message: `There is already a template with name '${TEMPLATE_NAME}'`,
      };

      httpRequestsMockHelpers.setCreateTemplateResponse(undefined, error);

      fireEvent.click(screen.getByTestId('nextButton'));

      expect(await screen.findByTestId('saveTemplateError')).toBeInTheDocument();
      expect(screen.getByTestId('saveTemplateError')).toHaveTextContent(error.message);

      // Second attempt succeeds and sends the expected payload
      httpRequestsMockHelpers.setCreateTemplateResponse({});
      const postMock = jest.mocked(httpSetup.post);
      postMock.mockClear();

      await clickSaveAndAwaitExit();

      const { path, options } = getLastPostCall(httpSetup.post);
      expect(path).toBe(`${API_BASE_PATH}/index_templates`);

      const body = JSON.parse(expectString(options.body));
      expect(body).toMatchObject({
        name: TEMPLATE_NAME,
        indexPatterns: DEFAULT_INDEX_PATTERNS,
        allowAutoCreate: 'TRUE',
        dataStream: {},
        indexMode: 'time_series',
        _kbnMeta: {
          type: 'default',
          hasDatastream: false,
          isLegacy: false,
        },
        composedOf: ['test_component_template_1'],
        template: {
          settings: SETTINGS,
          mappings: {
            properties: {
              [BOOLEAN_MAPPING_FIELD.name]: { type: BOOLEAN_MAPPING_FIELD.type },
              [TEXT_MAPPING_FIELD.name]: { type: TEXT_MAPPING_FIELD.type },
              [KEYWORD_MAPPING_FIELD.name]: { type: KEYWORD_MAPPING_FIELD.type },
            },
          },
          aliases: ALIASES,
        },
      });
    }, 20000);
  });

  describe('Data stream lifecycle', () => {
    beforeEach(async () => {
      httpRequestsMockHelpers.setLoadComponentTemplatesResponse(componentTemplates);
      await renderTemplateCreate(httpSetup);
      await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.title);

      await completeStepOne({
        name: TEMPLATE_NAME,
        indexPatterns: DEFAULT_INDEX_PATTERNS,
        lifecycle: {
          enabled: true,
          value: 1,
          unit: 'd',
        },
      });
    }, 20000);

    test('should include data stream lifecycle in summary when set in step 1', async () => {
      await completeStepTwo();
      await completeStepThree();
      await completeStepFour();
      await completeStepFive();

      expect(await screen.findByTestId('lifecycleValue')).toBeInTheDocument();
      expect(screen.getByTestId('lifecycleValue')).toHaveTextContent('1 day');
    }, 20000);

    test('preview data stream', async () => {
      await completeStepTwo();
      await completeStepThree();
      await completeStepFour();
      await completeStepFive();

      // Clear previous post calls to isolate this test
      const postMock = jest.mocked(httpSetup.post);
      postMock.mockClear();

      // Click the Preview tab in the review step
      const previewTab = screen.getByTestId('stepReviewPreviewTab');
      fireEvent.click(previewTab);

      // Wait for SimulateTemplate to render and make the API call
      await waitFor(() => {
        expect(httpSetup.post).toHaveBeenCalled();
        const calls = getPostCalls(httpSetup.post);
        const simulateCall = calls.find(({ path }) =>
          path.includes(`${API_BASE_PATH}/index_templates/simulate`)
        );

        expect(simulateCall).toBeDefined();
        const body = JSON.parse(expectString(simulateCall!.options.body));
        expect(body.template.lifecycle).toEqual({
          enabled: true,
          data_retention: '1d',
        });
        expect(body.index_patterns).toEqual(DEFAULT_INDEX_PATTERNS);
        expect(body.data_stream).toEqual({});
      });
    }, 20000);
  });
});
