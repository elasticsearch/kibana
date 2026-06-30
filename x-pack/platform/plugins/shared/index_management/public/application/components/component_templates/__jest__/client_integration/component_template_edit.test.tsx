/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { screen, fireEvent, within, waitFor } from '@testing-library/react';
import { coreMock } from '@kbn/core/public/mocks';
import { APP_HEADER_TEST_SUBJECTS } from '@kbn/app-header';

import { breadcrumbService, IndexManagementBreadcrumb } from '../../../../services/breadcrumbs';
import { setupEnvironment } from './helpers';
import { API_BASE_PATH } from './helpers/constants';
import {
  completeStep,
  getEnabledNextButton,
  getVersionSpinButton,
  renderComponentTemplateEdit,
} from './helpers/component_template_edit.helpers';

jest.mock('@kbn/code-editor');

describe('<ComponentTemplateEdit />', () => {
  let httpSetup: ReturnType<typeof setupEnvironment>['httpSetup'];
  let httpRequestsMockHelpers: ReturnType<typeof setupEnvironment>['httpRequestsMockHelpers'];
  let coreStart: ReturnType<(typeof coreMock)['createStart']>;

  beforeAll(() => {
    jest.spyOn(breadcrumbService, 'setBreadcrumbs');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    const env = setupEnvironment();
    httpSetup = env.httpSetup;
    httpRequestsMockHelpers = env.httpRequestsMockHelpers;
    coreStart = coreMock.createStart();
  });

  const COMPONENT_TEMPLATE_NAME = 'comp-1';
  const COMPONENT_TEMPLATE_TO_EDIT = {
    name: COMPONENT_TEMPLATE_NAME,
    deprecated: true,
    template: {
      settings: { number_of_shards: 1 },
    },
  };

  describe('On component mount', () => {
    beforeEach(async () => {
      httpRequestsMockHelpers.setLoadComponentTemplateResponse(
        COMPONENT_TEMPLATE_TO_EDIT.name,
        COMPONENT_TEMPLATE_TO_EDIT
      );
      httpRequestsMockHelpers.setGetComponentTemplateDatastream(COMPONENT_TEMPLATE_TO_EDIT.name, {
        data_streams: [],
      });

      renderComponentTemplateEdit(httpSetup, coreStart);
      await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.title);
    });

    test('updates the breadcrumbs to component templates', () => {
      expect(breadcrumbService.setBreadcrumbs).toHaveBeenLastCalledWith(
        IndexManagementBreadcrumb.componentTemplateEdit
      );
    });

    test('should set the correct page title', () => {
      expect(screen.getByTestId(APP_HEADER_TEST_SUBJECTS.title)).toBeInTheDocument();
      expect(screen.getByTestId('deprecatedTemplateCallout')).toBeInTheDocument();
      expect(screen.getByTestId(APP_HEADER_TEST_SUBJECTS.title)).toHaveTextContent(
        `Edit component template '${COMPONENT_TEMPLATE_NAME}'`
      );
    });

    it('should set the name field to read only', () => {
      const nameRow = screen.getByTestId('nameField');
      const nameInput = within(nameRow).getByRole('textbox');
      expect(nameInput).toBeDisabled();
    });

    it('should allow to go directly to a step', async () => {
      renderComponentTemplateEdit(httpSetup, coreStart, '?step=mappings');
      await screen.findByTestId('mappingsEditor');
      expect(screen.getByTestId('mappingsEditor')).toBeInTheDocument();
    });
  });

  describe('form payload', () => {
    beforeEach(async () => {
      httpRequestsMockHelpers.setLoadComponentTemplateResponse(
        COMPONENT_TEMPLATE_TO_EDIT.name,
        COMPONENT_TEMPLATE_TO_EDIT
      );
      httpRequestsMockHelpers.setGetComponentTemplateDatastream(COMPONENT_TEMPLATE_TO_EDIT.name, {
        data_streams: [],
      });

      renderComponentTemplateEdit(httpSetup, coreStart);
      await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.title);
    });

    it('should send the correct payload with changed values', async () => {
      const versionInput = getVersionSpinButton();
      fireEvent.change(versionInput, { target: { value: '1' } });

      const enabledNextButton = getEnabledNextButton();
      await waitFor(() => expect(enabledNextButton).toBeEnabled());
      fireEvent.click(enabledNextButton);

      await screen.findByTestId('stepSettings');

      await completeStep.settings();
      await completeStep.mappings();
      await completeStep.aliases();

      const submitButton = getEnabledNextButton();
      await waitFor(() => expect(submitButton).toBeEnabled());
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(httpSetup.put).toHaveBeenLastCalledWith(
          `${API_BASE_PATH}/component_templates/${COMPONENT_TEMPLATE_TO_EDIT.name}`,
          expect.objectContaining({
            body: JSON.stringify({
              ...COMPONENT_TEMPLATE_TO_EDIT,
              template: {
                ...COMPONENT_TEMPLATE_TO_EDIT.template,
                lifecycle: { enabled: true },
              },
              version: 1,
            }),
          })
        );
      });

      // Mapping rollout modal should not be opened if the component template is not managed
      expect(coreStart.overlays.openModal).not.toHaveBeenCalled();
    });
  });

  describe('can rollover linked datastreams', () => {
    const DATASTREAM_NAME = 'logs-test-default';
    const CUSTOM_COMPONENT_TEMPLATE = 'comp-1@custom';
    const ENCODED_CUSTOM_COMPONENT_TEMPLATE = encodeURIComponent(CUSTOM_COMPONENT_TEMPLATE);

    beforeEach(async () => {
      httpRequestsMockHelpers.setLoadComponentTemplateResponse(
        ENCODED_CUSTOM_COMPONENT_TEMPLATE,
        Object.assign({}, COMPONENT_TEMPLATE_TO_EDIT, {
          name: CUSTOM_COMPONENT_TEMPLATE,
        })
      );

      httpRequestsMockHelpers.setGetComponentTemplateDatastream(ENCODED_CUSTOM_COMPONENT_TEMPLATE, {
        data_streams: [DATASTREAM_NAME],
      });

      renderComponentTemplateEdit(httpSetup, coreStart, '@custom');
      await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.title);
    });

    it('should show mappings rollover modal on save if apply mappings call failed', async () => {
      httpRequestsMockHelpers.setPostDatastreamMappingsFromTemplate(
        DATASTREAM_NAME,
        {},
        { message: 'Bad request', statusCode: 400 }
      );

      const versionInput = getVersionSpinButton();
      fireEvent.change(versionInput, { target: { value: '1' } });

      const enabledNextButton = getEnabledNextButton();
      await waitFor(() => expect(enabledNextButton).toBeEnabled());
      fireEvent.click(enabledNextButton);

      await screen.findByTestId('stepSettings');

      await completeStep.settings();
      await completeStep.mappings();
      await completeStep.aliases();

      const submitButton = getEnabledNextButton();
      await waitFor(() => expect(submitButton).toBeEnabled());
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(httpSetup.put).toHaveBeenLastCalledWith(
          `${API_BASE_PATH}/component_templates/${ENCODED_CUSTOM_COMPONENT_TEMPLATE}`,
          expect.anything()
        );
      });

      await waitFor(() => {
        expect(httpSetup.post).toHaveBeenLastCalledWith(
          `${API_BASE_PATH}/data_streams/${DATASTREAM_NAME}/mappings_from_template`,
          expect.anything()
        );
      });

      expect(coreStart.overlays.openModal).toHaveBeenCalled();
    });

    it('should not show mappings rollover modal on save if apply mappings call succeed', async () => {
      httpRequestsMockHelpers.setPostDatastreamMappingsFromTemplate(DATASTREAM_NAME, {
        success: true,
      });

      const versionInput = getVersionSpinButton();
      fireEvent.change(versionInput, { target: { value: '1' } });

      const enabledNextButton = getEnabledNextButton();
      await waitFor(() => expect(enabledNextButton).toBeEnabled());
      fireEvent.click(enabledNextButton);

      await screen.findByTestId('stepSettings');

      await completeStep.settings();
      await completeStep.mappings();
      await completeStep.aliases();

      const submitButton = getEnabledNextButton();
      await waitFor(() => expect(submitButton).toBeEnabled());
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(httpSetup.put).toHaveBeenLastCalledWith(
          `${API_BASE_PATH}/component_templates/${ENCODED_CUSTOM_COMPONENT_TEMPLATE}`,
          expect.anything()
        );
      });

      await waitFor(() => {
        expect(httpSetup.post).toHaveBeenLastCalledWith(
          `${API_BASE_PATH}/data_streams/${DATASTREAM_NAME}/mappings_from_template`,
          expect.anything()
        );
      });

      expect(coreStart.overlays.openModal).not.toHaveBeenCalled();
    });

    it('should show mappings rollover modal on save if referenced index template is managed and packaged', async () => {
      httpRequestsMockHelpers.setLoadComponentTemplateResponse(
        COMPONENT_TEMPLATE_TO_EDIT.name,
        Object.assign({}, COMPONENT_TEMPLATE_TO_EDIT, {
          _meta: {},
        })
      );

      httpRequestsMockHelpers.setGetComponentTemplateDatastream(COMPONENT_TEMPLATE_TO_EDIT.name, {
        data_streams: [DATASTREAM_NAME],
      });

      httpRequestsMockHelpers.setLoadReferencedIndexTemplateMetaResponse(
        COMPONENT_TEMPLATE_TO_EDIT.name,
        {
          package: {
            name: 'security',
          },
          managed_by: 'security',
          managed: true,
        }
      );

      renderComponentTemplateEdit(httpSetup, coreStart);
      await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.title);

      httpRequestsMockHelpers.setPostDatastreamMappingsFromTemplate(
        DATASTREAM_NAME,
        {},
        { message: 'Bad request', statusCode: 400 }
      );

      const versionInput = getVersionSpinButton();
      fireEvent.change(versionInput, { target: { value: '1' } });

      const enabledNextButton = getEnabledNextButton();
      await waitFor(() => expect(enabledNextButton).toBeEnabled());
      fireEvent.click(enabledNextButton);

      await screen.findByTestId('stepSettings');

      await completeStep.settings();
      await completeStep.mappings();
      await completeStep.aliases();

      await screen.findByTestId('stepReview');
      // Make sure the list of affected mappings is shown
      await screen.findByTestId('affectedMappingsList');
      expect(screen.getByTestId('affectedMappingsList')).toBeInTheDocument();

      const submitButton = getEnabledNextButton();
      await waitFor(() => expect(submitButton).toBeEnabled());
      fireEvent.click(submitButton);

      await waitFor(() => {
        const lastPut = httpSetup.put.mock.calls[httpSetup.put.mock.calls.length - 1];
        expect(lastPut?.[0]).toContain(`${API_BASE_PATH}/component_templates/`);
      });

      await waitFor(() => {
        const lastPost = httpSetup.post.mock.calls[httpSetup.post.mock.calls.length - 1];
        expect(lastPost?.[0]).toContain(
          `${API_BASE_PATH}/data_streams/${DATASTREAM_NAME}/mappings_from_template`
        );
      });

      expect(coreStart.overlays.openModal).toHaveBeenCalled();
    });
  });
});
