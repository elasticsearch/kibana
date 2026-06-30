/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { screen, fireEvent, within } from '@testing-library/react';

import { APP_HEADER_TEST_SUBJECTS } from '@kbn/app-header';
import { openAppMenuOverflow } from '@kbn/app-header/test_helpers';
import { setupEnvironment } from '../helpers/setup_environment';
import { renderHome } from '../helpers/render_home';

jest.mock('react-use/lib/useObservable', () => () => jest.fn());

describe('<IndexManagementHome />', () => {
  let httpRequestsMockHelpers: ReturnType<typeof setupEnvironment>['httpRequestsMockHelpers'];
  let httpSetup: ReturnType<typeof setupEnvironment>['httpSetup'];

  beforeEach(() => {
    jest.clearAllMocks();
    ({ httpRequestsMockHelpers, httpSetup } = setupEnvironment());
  });

  describe('on component mount', () => {
    beforeEach(async () => {
      httpRequestsMockHelpers.setLoadIndicesResponse([]);

      await renderHome(httpSetup);

      await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.title);
    });

    test('should set the correct app title', () => {
      expect(screen.getByTestId(APP_HEADER_TEST_SUBJECTS.title)).toBeInTheDocument();
      expect(screen.getByTestId(APP_HEADER_TEST_SUBJECTS.title)).toHaveTextContent(
        'Index Management'
      );
    });

    test('should have a link to the documentation', async () => {
      await openAppMenuOverflow();
      const documentationLink = await screen.findByTestId(
        APP_HEADER_TEST_SUBJECTS.menuDocumentation
      );
      expect(documentationLink).toHaveAttribute('href');
      expect(documentationLink).toHaveAttribute('target', '_blank');
    });

    describe('tabs', () => {
      test('should have 5 tabs', () => {
        const indexManagementHeader = screen.getByTestId(APP_HEADER_TEST_SUBJECTS.tabs);
        const tabs = within(indexManagementHeader).getAllByRole('tab');

        const expectedTabLabels = [
          'Indices',
          'Data Streams',
          'Index Templates',
          'Component Templates',
          'Enrich Policies',
        ];

        expect(tabs).toHaveLength(5);
        expectedTabLabels.forEach((label, index) => {
          expect(tabs[index]).toHaveTextContent(label);
        });
      });

      test('should navigate to Index Templates tab', async () => {
        expect(screen.getByTestId('indicesList')).toBeInTheDocument();
        expect(screen.queryByTestId('templateList')).not.toBeInTheDocument();

        httpRequestsMockHelpers.setLoadTemplatesResponse({ templates: [], legacyTemplates: [] });

        // Click on Index Templates tab (Section.IndexTemplates = 'templates')
        fireEvent.click(screen.getByTestId('templatesTab'));

        await screen.findByTestId('templateList');

        expect(screen.queryByTestId('indicesList')).not.toBeInTheDocument();
        expect(screen.getByTestId('templateList')).toBeInTheDocument();
      });
    });
  });

  describe('WHEN manageIndexTemplates privilege is false', () => {
    beforeEach(async () => {
      httpRequestsMockHelpers.setLoadIndicesResponse([]);
      httpRequestsMockHelpers.setLoadComponentTemplatesResponse([]);
      await renderHome(httpSetup, {
        dependenciesOverrides: {
          privs: {
            monitor: true,
            manageEnrich: true,
            monitorEnrich: true,
            manageIndexTemplates: false,
          },
        },
      });
      await screen.findByTestId(APP_HEADER_TEST_SUBJECTS.title);
    });

    test('SHOULD still open Component Templates without create affordances', async () => {
      fireEvent.click(screen.getByTestId('component_templatesTab'));
      await screen.findByTestId('emptyList');
      expect(screen.queryByTestId('createComponentTemplateButton')).not.toBeInTheDocument();
    });
  });
});
