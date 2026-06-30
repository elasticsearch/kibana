/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { screen, waitFor } from '@testing-library/react';

import { APP_HEADER_TEST_SUBJECTS } from '@kbn/app-header';
import { openAppMenuOverflow } from '@kbn/app-header/test_helpers';
import {
  getMatchingIndices,
  getFieldsFromIndices,
  getMatchingDataStreams,
} from '../helpers/fixtures';
import { renderCreateEnrichPolicy } from '../helpers/render_create_enrich_policy';
import {
  createCreateEnrichPolicyActions,
  exists,
} from '../helpers/actions/enrich_policies_actions';
import { getESPolicyCreationApiCall } from '../../../common/lib';
import { setupEnvironment } from '../helpers/setup_environment';

jest.mock('@kbn/code-editor');

let httpSetup: ReturnType<typeof setupEnvironment>['httpSetup'];
let httpRequestsMockHelpers: ReturnType<typeof setupEnvironment>['httpRequestsMockHelpers'];
let actions: ReturnType<typeof createCreateEnrichPolicyActions>;

beforeEach(() => {
  jest.clearAllMocks();
  const env = setupEnvironment();
  httpSetup = env.httpSetup;
  httpRequestsMockHelpers = env.httpRequestsMockHelpers;
  httpRequestsMockHelpers.setGetMatchingIndices(getMatchingIndices());
  httpRequestsMockHelpers.setGetMatchingDataStreams(getMatchingDataStreams());
  actions = createCreateEnrichPolicyActions();
});

describe('Create enrich policy', () => {
  test('Has header and docs link', async () => {
    await renderCreateEnrichPolicy(httpSetup);

    await screen.findByTestId('configurationForm');

    expect(screen.getByTestId(APP_HEADER_TEST_SUBJECTS.title)).toHaveTextContent(
      'Create enrich policy'
    );

    await openAppMenuOverflow();
    expect(await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.menuDocumentation)).toHaveAttribute(
      'href'
    );
  });

  describe('Configuration step', () => {
    it('Fields have helpers', async () => {
      await renderCreateEnrichPolicy(httpSetup);

      await screen.findByTestId('configurationForm');

      expect(exists('typePopoverIcon')).toBe(true);
      expect(exists('uploadFileLink')).toBe(true);
      expect(exists('matchAllQueryLink')).toBe(true);
    });

    it('shows validation errors if form isnt filled', async () => {
      await renderCreateEnrichPolicy(httpSetup);

      await screen.findByTestId('configurationForm');

      await actions.clickNextButton();

      await waitFor(() => {
        const errors = actions.getErrorsMessages();
        expect(errors.length).toBeGreaterThanOrEqual(3);
      });
    });

    it('Allows to submit the form when fields are filled', async () => {
      httpRequestsMockHelpers.setGetFieldsFromIndices(getFieldsFromIndices());

      await renderCreateEnrichPolicy(httpSetup);

      await screen.findByTestId('configurationForm');

      await actions.completeConfigurationStep({});

      await screen.findByTestId('fieldSelectionForm');
    }, 20000);
  });

  describe('Fields selection step', () => {
    beforeEach(async () => {
      httpRequestsMockHelpers.setGetFieldsFromIndices(getFieldsFromIndices());
    });

    it('shows validation errors if form isnt filled', async () => {
      await renderCreateEnrichPolicy(httpSetup);

      await screen.findByTestId('configurationForm');

      await actions.completeConfigurationStep({});

      await screen.findByTestId('fieldSelectionForm');

      await actions.clickNextButton();

      await waitFor(() => {
        const errors = actions.getErrorsMessages();
        expect(errors.length).toBeGreaterThanOrEqual(2);
      });
    }, 20000);

    it('Allows to submit the form when fields are filled', async () => {
      await renderCreateEnrichPolicy(httpSetup);

      await screen.findByTestId('configurationForm');

      await actions.completeConfigurationStep({});

      await screen.findByTestId('fieldSelectionForm');

      await actions.completeFieldsSelectionStep();

      await screen.findByTestId('creationStep');
    }, 20000);

    it('When no common fields are returned it shows an error callout', async () => {
      httpRequestsMockHelpers.setGetFieldsFromIndices({
        commonFields: [],
        indices: [],
      });

      await renderCreateEnrichPolicy(httpSetup);
      await screen.findByTestId('configurationForm');

      await actions.completeConfigurationStep({ indices: 'test-1, test-2' });

      await waitFor(() => {
        expect(exists('noCommonFieldsError')).toBe(true);
      });
    }, 20000);
  });

  describe('Creation step', () => {
    beforeEach(async () => {
      httpRequestsMockHelpers.setGetFieldsFromIndices(getFieldsFromIndices());
    });

    it('Shows CTAs for creating the policy', async () => {
      await renderCreateEnrichPolicy(httpSetup);
      await screen.findByTestId('configurationForm');

      await actions.completeConfigurationStep({});
      await screen.findByTestId('fieldSelectionForm');

      await actions.completeFieldsSelectionStep();
      await screen.findByTestId('creationStep');

      expect(exists('createButton')).toBe(true);
      expect(exists('createAndExecuteButton')).toBe(true);
    }, 20000);

    it('Shows policy summary and request', async () => {
      await renderCreateEnrichPolicy(httpSetup);
      await screen.findByTestId('configurationForm');

      await actions.completeConfigurationStep({});
      await screen.findByTestId('fieldSelectionForm');

      await actions.completeFieldsSelectionStep();
      await screen.findByTestId('creationStep');

      expect(screen.getByTestId('enrichPolicySummaryList').textContent).toContain('test_policy');

      await actions.clickRequestTab();

      await waitFor(() => {
        expect(screen.getByTestId('requestBody').textContent).toContain(
          getESPolicyCreationApiCall('test_policy')
        );
      });
    }, 20000);

    it('Shows error message when creating the policy fails', async () => {
      await renderCreateEnrichPolicy(httpSetup);
      await screen.findByTestId('configurationForm');

      await actions.completeConfigurationStep({});
      await screen.findByTestId('fieldSelectionForm');

      await actions.completeFieldsSelectionStep();
      await screen.findByTestId('creationStep');

      const error = {
        statusCode: 400,
        error: 'Bad Request',
        message: 'something went wrong...',
      };

      httpRequestsMockHelpers.setCreateEnrichPolicy(undefined, error);

      await actions.clickCreatePolicy();

      await waitFor(() => {
        expect(exists('errorWhenCreatingCallout')).toBe(true);
      });
    }, 20000);
  });

  describe('Navigation', () => {
    beforeEach(async () => {
      httpRequestsMockHelpers.setGetFieldsFromIndices(getFieldsFromIndices());
    });

    it('Can navigate back and forth with next/back buttons', async () => {
      await renderCreateEnrichPolicy(httpSetup);
      await screen.findByTestId('configurationForm');

      // Navigate to create step
      await actions.completeConfigurationStep({});
      await screen.findByTestId('fieldSelectionForm');

      await actions.completeFieldsSelectionStep();
      await screen.findByTestId('creationStep');

      await actions.clickBackButton();
      await screen.findByTestId('fieldSelectionForm');

      await actions.clickBackButton();
      await screen.findByTestId('configurationForm');
    }, 20000);
  });
});
